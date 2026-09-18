"""Build the static textbook site from Markdown content + Jinja2 templates.

This is a deliberately small static-site generator, ported from the same
"hand-built" approach as the PORTFOLIO site: a few templates, one stylesheet,
and Markdown content with optional YAML front-matter. No framework, no JS
build step. The goal is a calm reading surface that interactive elements can
later be dropped into (raw HTML is allowed in Markdown, so a chapter can embed
a custom widget inline).

Layout
------
    content/<slug>.md      -> dist/<slug>.html      (served at /<slug>)
    content/index.md       -> dist/index.html       (the home / table of contents)
    templates/             -> Jinja2 templates (_layout, page)
    static/                -> copied verbatim into dist/ (images, widget JS, ...)
    styles.css             -> copied into dist/, cache-busted by content hash
    site.yaml              -> site-wide config (title, tagline, favicons, ...)

Front-matter (all optional)
---------------------------
    ---
    title: The Shape of Data
    description: A one-line summary for <meta> and link previews.
    nav_order: 1          # position in the table of contents
    part: "Part I"        # optional grouping label in the TOC
    summary: One sentence shown beside the title in the TOC.
    hide_from_toc: true   # build the page but don't list it
    ---

Run
---
    make site       # or:  python3 build.py
    make serve      # build, then serve dist/ on http://127.0.0.1:8000
"""
from __future__ import annotations

import hashlib
import re
import shutil
from pathlib import Path

import mistune
import yaml
from jinja2 import Environment, FileSystemLoader, StrictUndefined
from markupsafe import Markup

ROOT = Path(__file__).parent
CONTENT_DIR = ROOT / "content"
TEMPLATES_DIR = ROOT / "templates"
STATIC_DIR = ROOT / "static"
STYLES_SRC = ROOT / "styles.css"
SITE_YAML = ROOT / "site.yaml"
OUT_DIR = ROOT / "dist"

# A random one is rendered as an inline-SVG emoji favicon on every page load
# (see the head script in _layout.html.j2). Overridable via site.yaml.
DEFAULT_FAVICONS = ["📖", "📐", "🧮", "🔬", "💡", "🧩", "✏️", "🧠", "⚗️", "✨"]

FRONT_MATTER_RE = re.compile(r"^---\n(.*?)\n---\n", re.DOTALL)

# Markdown -> HTML. escape=False so a chapter can embed raw HTML for an
# interactive widget; plugins cover the constructs a textbook actually needs.
_MD = mistune.create_markdown(
    escape=False,
    plugins=["strikethrough", "table", "footnotes", "def_list"],
)


def _short_hash(data: bytes, n: int = 10) -> str:
    return hashlib.sha256(data).hexdigest()[:n]


# An ES module's import specifier is a plain URL, and resolving one drops the
# query of the module doing the importing: kit.js is fetched as
# `kit.js?v=<fp>`, but its `./theme.js` is not, and a demo's
# `/static/demos/foo-data.js` is not either. So every module below the entry
# point was pinned to whatever the browser had cached. Stamping the fingerprint
# onto each specifier at copy time closes that: sources stay plain ES modules,
# and dist/ ships a fully cache-busted graph.
_JS_IMPORT_RE = re.compile(
    r"""(?P<head>\b(?:from|import)\s*)(?P<q>['"])(?P<spec>(?:\.{1,2}/|/)[\w./-]+\.js)(?P=q)"""
)


def _static_fingerprint() -> bytes:
    """Every byte shipped from static/, so a demo edit moves the build id.

    Without this the fingerprint only tracked styles.css and the page list, and
    editing a demo changed no URL anywhere — the whole point of the query.
    """
    if not STATIC_DIR.exists():
        return b""
    h = hashlib.sha256()
    for path in sorted(STATIC_DIR.rglob("*")):
        rel = path.relative_to(STATIC_DIR)
        if path.is_dir() or any(part.startswith("_") for part in rel.parts):
            continue  # dev fixtures are not copied, so they must not count
        h.update(str(rel).encode())
        h.update(path.read_bytes())
    return h.digest()


def _bust_js_imports(js_root: Path, fp: str) -> int:
    """Append ?v=<fp> to every relative/absolute .js import under `js_root`."""
    touched = 0
    for js in sorted(js_root.rglob("*.js")):
        src = js.read_text(encoding="utf-8")
        out = _JS_IMPORT_RE.sub(
            lambda m: f"{m['head']}{m['q']}{m['spec']}?v={fp}{m['q']}", src
        )
        if out != src:
            js.write_text(out, encoding="utf-8")
            touched += 1
    return touched


def parse_front_matter(text: str) -> tuple[dict, str]:
    """Split optional YAML front-matter from the Markdown body."""
    m = FRONT_MATTER_RE.match(text)
    if not m:
        return {}, text
    meta = yaml.safe_load(m.group(1)) or {}
    if not isinstance(meta, dict):
        meta = {}
    return meta, text[m.end():]


def load_site() -> dict:
    site = yaml.safe_load(SITE_YAML.read_text()) if SITE_YAML.exists() else {}
    site = site or {}
    site.setdefault("title", "Untitled Course")
    site.setdefault("tagline", "")
    site.setdefault("eyebrow", "an interactive textbook")
    site.setdefault("description", site["title"])
    site.setdefault("favicons", DEFAULT_FAVICONS)
    site.setdefault("footer", site["title"])
    return site


def discover_pages() -> list[dict]:
    """Read every content/*.md into a page dict, sorted for the table of
    contents by (nav_order, title). index.md is pulled out as the home page."""
    pages: list[dict] = []
    for md_path in sorted(CONTENT_DIR.glob("*.md")):
        meta, body = parse_front_matter(md_path.read_text())
        slug = md_path.stem
        pages.append(
            {
                "slug": slug,
                "is_home": slug == "index",
                "title": meta.get("title") or slug.replace("-", " ").title(),
                "description": meta.get("description", ""),
                "summary": meta.get("summary", ""),
                "part": meta.get("part", ""),
                "nav_order": meta.get("nav_order", 9999),
                "hide_from_toc": bool(meta.get("hide_from_toc")),
                "interactive": bool(meta.get("interactive")),
                "body_html": Markup(_MD(body)),
                # Directory-style clean URLs (`/slug/`) so the same links work
                # under `python3 -m http.server` and on GitHub Pages alike.
                "url": "/" if slug == "index" else f"/{slug}/",
                "out_name": "index.html" if slug == "index" else f"{slug}/index.html",
            }
        )
    pages.sort(key=lambda p: (p["nav_order"], p["title"].lower()))
    return pages


def build_toc(pages: list[dict]) -> list[dict]:
    """The ordered list of chapters for the home page and prev/next nav,
    excluding the home page itself and any hidden pages."""
    return [p for p in pages if not p["is_home"] and not p["hide_from_toc"]]


def render() -> None:
    site = load_site()
    pages = discover_pages()
    toc = build_toc(pages)

    css_bytes = STYLES_SRC.read_bytes()
    css_version = _short_hash(css_bytes)
    build_fp = _short_hash(
        css_bytes + repr([p["slug"] for p in pages]).encode() + _static_fingerprint()
    )

    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=True,
        undefined=StrictUndefined,
        trim_blocks=True,
        lstrip_blocks=True,
    )

    # Fresh output dir.
    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    OUT_DIR.mkdir(parents=True)

    # Cache-busted stylesheet + static assets.
    (OUT_DIR / "styles.css").write_bytes(css_bytes)
    if STATIC_DIR.exists():
        # Skip dev-only fixtures (underscore-prefixed, e.g. _kittest.js) so they
        # never ship in a production build.
        shutil.copytree(STATIC_DIR, OUT_DIR / "static", dirs_exist_ok=True,
                        ignore=shutil.ignore_patterns("_*"))
        _bust_js_imports(OUT_DIR / "static", build_fp)

    page_tmpl = env.get_template("page.html.j2")
    for i, page in enumerate(toc):
        page["index"] = i + 1  # 1-based chapter number for display

    for page in pages:
        # prev/next within the table of contents (home page gets none).
        prev_pg = nxt_pg = None
        if page in toc:
            pos = toc.index(page)
            prev_pg = toc[pos - 1] if pos > 0 else None
            nxt_pg = toc[pos + 1] if pos < len(toc) - 1 else None

        html = page_tmpl.render(
            site=site,
            page=page,
            toc=toc,
            prev_pg=prev_pg,
            nxt_pg=nxt_pg,
            favicons=site["favicons"],
            css_version=css_version,
            build_fp=build_fp,
        )
        out_path = OUT_DIR / page["out_name"]
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(html)

    print(f"built {len(pages)} page(s) -> {OUT_DIR.relative_to(ROOT)}/  "
          f"(css v{css_version})")


if __name__ == "__main__":
    render()
