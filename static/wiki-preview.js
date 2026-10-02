// wiki-preview.js — Wikipedia-style hover cards for links into en.wikipedia.org.
//
// Any link to https://en.wikipedia.org/wiki/TITLE gets a preview: hover or
// focus it and, after a short delay, a card with the article's lead image and
// opening summary appears beside it. Summaries come from Wikipedia's public
// REST API on first use and are cached for the page's life. If the fetch fails
// (offline, missing article) no card appears and the link still just works.

(function () {
  const OPEN_DELAY = 300;    // ms of hover before the card opens
  const CLOSE_DELAY = 200;   // ms of grace to move the pointer onto the card
  const GAP = 8;             // px between the link and the card

  const cache = new Map();   // title -> Promise<summary | null>
  let card = null, owner = null, openTimer = 0, closeTimer = 0;

  function titleOf(a) {
    const m = a.href.match(/^https:\/\/en\.wikipedia\.org\/wiki\/([^#?]+)/);
    return m ? m[1] : null;
  }

  function summary(title) {
    if (!cache.has(title)) {
      cache.set(title, fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + title)
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null));
    }
    return cache.get(title);
  }

  function build(s, href) {
    const el = document.createElement('a');
    el.className = 'wiki-card';
    el.href = href;
    el.setAttribute('role', 'tooltip');
    if (s.thumbnail) {
      const img = document.createElement('img');
      img.src = s.thumbnail.source;
      img.alt = '';
      el.append(img);
    }
    const body = document.createElement('span');
    body.className = 'wiki-card-body';
    const t = document.createElement('strong');
    t.textContent = s.title;
    const p = document.createElement('span');
    p.className = 'wiki-card-extract';
    p.textContent = s.extract;
    const src = document.createElement('span');
    src.className = 'wiki-card-src';
    src.textContent = 'Wikipedia';
    body.append(t, p, src);
    el.append(body);
    el.addEventListener('mouseenter', () => clearTimeout(closeTimer));
    el.addEventListener('mouseleave', scheduleClose);
    return el;
  }

  // Below the link if it fits, else above; if neither side has room for the
  // full card, drop its image and use whichever side has more space.
  function place(el, a) {
    const r = a.getBoundingClientRect();
    const roomBelow = window.innerHeight - r.bottom - 2 * GAP;
    const roomAbove = r.top - 2 * GAP;
    el.classList.remove('is-compact');
    if (el.offsetHeight > Math.max(roomBelow, roomAbove)) el.classList.add('is-compact');
    const w = el.offsetWidth, h = el.offsetHeight;
    const below = h <= roomBelow || roomBelow >= roomAbove;
    el.style.left = Math.min(Math.max(GAP, r.left), window.innerWidth - w - GAP) + 'px';
    el.style.top = (below ? r.bottom + GAP : r.top - GAP - h) + 'px';
  }

  function close() {
    clearTimeout(openTimer);
    if (card) card.remove();
    card = owner = null;
  }

  function scheduleClose() {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    closeTimer = setTimeout(close, CLOSE_DELAY);
  }

  function scheduleOpen(a) {
    clearTimeout(closeTimer);
    if (owner === a) return;
    close();
    owner = a;
    openTimer = setTimeout(async () => {
      const s = await summary(titleOf(a));
      if (owner !== a || !s || !s.extract) return;
      const el = card = build(s, a.href);
      document.body.append(el);
      place(el, a);
      // The lead image changes the card's height once it loads, which can
      // decide whether the card fits below the link or must flip above it.
      const img = el.querySelector('img');
      if (img) img.addEventListener('load', () => { if (card === el) place(el, a); });
    }, OPEN_DELAY);
  }

  function init() {
    document.querySelectorAll('a[href^="https://en.wikipedia.org/wiki/"]').forEach(a => {
      if (!titleOf(a)) return;
      a.classList.add('wiki-link');
      a.addEventListener('mouseenter', () => scheduleOpen(a));
      a.addEventListener('mouseleave', scheduleClose);
      a.addEventListener('focus', () => scheduleOpen(a));
      a.addEventListener('blur', scheduleClose);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    window.addEventListener('scroll', close, { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
