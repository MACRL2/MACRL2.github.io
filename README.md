# Interactive Textbook

**Live:** https://macrl2.github.io/

A small, hand-built static site for an online textbook — ported from the
visual style of the `~/PORTFOLIO` site (OKLCH paper-warm palette, system
serif, light/dark theme, calm reading measure) and adapted for course
material that learners explore through interactive elements.

## How it works

- **`content/*.md`** — one Markdown file per page, with optional YAML
  front-matter (`title`, `description`, `nav_order`, `part`, `summary`,
  `hide_from_toc`). `content/index.md` is the home page and table of contents.
  Raw HTML is allowed in Markdown, so a chapter can embed any interactive
  widget inline.
- **`templates/`** — `_layout.html.j2` (the shared frame: head, masthead,
  theme toggle, reading-progress bar, footer) and `page.html.j2` (a page or
  the home/TOC).
- **`styles.css`** — the single stylesheet. Design tokens live at the top.
- **`static/`** — assets copied verbatim into `dist/static/`.
- **`site.yaml`** — title, tagline, eyebrow, favicon pool, footer.
- **`build.py`** — the generator: Markdown + front-matter → `dist/*.html`.

## Build & serve

```sh
make site      # build into dist/
make serve     # build, then serve at http://127.0.0.1:8000
make watch     # rebuild on change (needs `entr`)
make clean     # remove dist/
```

The build needs `jinja2`, `pyyaml`, `mistune`, and `markupsafe`.

## Authoring a chapter

Create `content/02-my-chapter.md`:

```markdown
---
title: My Chapter
nav_order: 2
part: "Part I — Getting Started"
summary: One line shown beside the title in the table of contents.
---

# My Chapter

Prose here. Drop an interactive element in with raw HTML:

<aside class="callout" data-kind="try">
  <span class="callout-label">try this</span>
  <p>...your widget...</p>
</aside>
```

Callout kinds: `note` (default), `tip`, `try`, `warning`.

## Deployment

The site is deployed to **GitHub Pages** at https://macrl2.github.io/ from the
`MACRL2/MACRL2.github.io` repo. Every push to `main` runs
`.github/workflows/pages.yml`, which installs the build deps, runs `build.py`,
and publishes `dist/` via GitHub Actions (no built artifacts are committed).
Pages is configured with **Source: GitHub Actions**. Because every asset path is
absolute (`/styles.css`, `/static/…`), the site must be served from a domain
root (a user/org `*.github.io` site), not a project subpath.

