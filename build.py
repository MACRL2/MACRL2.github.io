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
    ai_generated: true    # tint the whole page as AI-generated text
    volume:               # this unit's capability volume, under the title
      from: Behavior cloning
      to: DAgger
      axes:               # name: [before, after], clockwise from the top
        Distribution shift: [0.4, 1.7]
        Expert independence: [1.6, 0.4]
    ---

    A ```volume fence holding the same YAML draws one mid-chapter instead.

AI-generated text
-----------------
    Text written by an AI model is tinted on the page, with a legend at the
    top. Tag a whole page with `ai_generated: true`, a run of Markdown with a
    blank-line-padded `<div class="ai">` … `</div>`, or a phrase with
    `<span class="ai">`. The legend appears on any page with a tag.

Run
---
    make site       # or:  python3 build.py
    make serve      # build, then serve dist/ on http://127.0.0.1:8000
"""
from __future__ import annotations

import hashlib
import json
import re
import shutil
from pathlib import Path

import mistune
import yaml
from jinja2 import Environment, FileSystemLoader, StrictUndefined
from markupsafe import Markup, escape

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

# KaTeX math is rendered client-side, so the LaTeX between $…$ / $$…$$ must reach
# the browser byte-for-byte. But Mistune's inline parser would otherwise mangle
# it — an underscore after a brace opens <em> (`\mathbb{E}_{x_0}…\sum_` becomes
# `\mathbb{E}<em>{x_0}…\sum</em>`, which splits the text node so KaTeX can't match
# the delimiters), and a backslash-escape like `\,` or `\|` gets eaten. So we mask
# every math span with an inert alphanumeric-free sentinel BEFORE Markdown runs,
# then restore the originals in the emitted HTML. Display ($$…$$) is masked before
# inline ($…$) so the longer delimiter wins. Guillemets are Markdown- and
# HTML-inert, so the sentinel survives untouched.
_MATH_DISPLAY_RE = re.compile(r"\$\$.*?\$\$", re.DOTALL)
_MATH_INLINE_RE = re.compile(r"\$(?:\\.|[^$\n])+?\$")
_MATH_TOKEN_RE = re.compile(r"«MATH(\d+)»")

# Any element carrying the `ai` class token marks AI-generated text, and a page
# with at least one gets the legend that says what the tint means.
_AI_CLASS_RE = re.compile(r"""\bclass\s*=\s*(["'])(?:[^"']*\s)?ai(?:\s[^"']*)?\1""")


def render_markdown(body: str) -> str:
    """Markdown -> HTML with $…$/$$…$$ math passed through verbatim for KaTeX."""
    stash: list[str] = []

    def _mask(m: re.Match) -> str:
        stash.append(m.group(0))
        return f"«MATH{len(stash) - 1}»"

    protected = _MATH_DISPLAY_RE.sub(_mask, body)
    protected = _MATH_INLINE_RE.sub(_mask, protected)
    html = _MD(protected)
    return _MATH_TOKEN_RE.sub(lambda m: stash[int(m.group(1))], html)


# A unit's capability volume (static/demos/capability-volume.js): the axes its
# approach moves along, with the volume before and after, both drawn at the same
# size. Configured as `volume:` in front-matter (drawn under the chapter title)
# or as a ```volume fence of the same YAML (drawn where it sits); both become the
# same demo placeholder, and either one makes the page interactive.
_VOLUME_FENCE_RE = re.compile(r"^```volume[ \t]*\n(.*?)\n```[ \t]*$", re.DOTALL | re.MULTILINE)
_H1_CLOSE_RE = re.compile(r"</h1>", re.IGNORECASE)


def volume_div(spec, where: str) -> str:
    """Check one volume spec and render its demo placeholder. Fails the build
    loudly on a malformed spec, the way a typo'd template variable does."""
    def bad(msg: str):
        raise SystemExit(f"{where}: volume: {msg}")

    if not isinstance(spec, dict) or not isinstance(spec.get("axes"), dict):
        bad("needs an `axes:` mapping of `name: [before, after]`")
    axes = []
    for name, val in spec["axes"].items():
        pair = val if isinstance(val, list) else [val, val]
        ok = len(pair) == 2 and all(
            isinstance(v, (int, float)) and not isinstance(v, bool) and v > 0 for v in pair
        )
        if not ok:
            bad(f"axis {name!r} needs one positive number or [before, after], got {val!r}")
        axes.append([str(name), *pair])
    if len(axes) < 2:
        bad("needs at least two axes")
    params = {k: str(spec[k]) for k in ("from", "to", "note") if spec.get(k)}
    params["axes"] = axes  # a list, so the order around the figure survives JSON
    data = escape(json.dumps(params, ensure_ascii=False))
    return f'<div class="demo" data-demo="capability-volume" data-params="{data}"></div>'


def place_volumes(meta: dict, body: str, where: str) -> tuple[str, str, bool]:
    """Swap ```volume fences for placeholders. Returns the new body, the
    placeholder for the front-matter volume (or ""), and whether there is any."""
    def fence(m: re.Match) -> str:
        label = f"{where} (```volume fence)"
        try:
            spec = yaml.safe_load(m.group(1))
        except yaml.YAMLError as e:
            raise SystemExit(f"{label}: volume: not valid YAML — {e}") from None
        return "\n" + volume_div(spec, label) + "\n"

    body, n = _VOLUME_FENCE_RE.subn(fence, body)
    head = volume_div(meta["volume"], f"{where} (front-matter)") if meta.get("volume") else ""
    return body, head, bool(n or head)


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
        body, volume_head, has_volume = place_volumes(meta, body, md_path.name)
        body_html = render_markdown(body)
        if volume_head:  # under the chapter title, or first if there is none
            body_html, placed = _H1_CLOSE_RE.subn(
                lambda m: f"{m.group(0)}\n{volume_head}", body_html, count=1
            )
            if not placed:
                body_html = f"{volume_head}\n{body_html}"
        ai_generated = bool(meta.get("ai_generated"))
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
                "interactive": bool(meta.get("interactive")) or has_volume,
                "ai_generated": ai_generated,
                "has_ai": ai_generated or bool(_AI_CLASS_RE.search(body_html)),
                "body_html": Markup(body_html),
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
