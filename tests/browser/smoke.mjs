// Local browser smoke harness (dev-only; needs node_modules/puppeteer).
// Serves the repo root, loads a page in headless Chromium, collects console
// errors, and runs a per-page check function. Usage:
//   node tests/browser/smoke.mjs <which>
// where <which> is one of: kit | chapter
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import puppeteer from 'puppeteer';

const ROOT = process.cwd();
const PORT = 8099;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript',
  '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml',
  '.woff2':'font/woff2', '.woff':'font/woff', '.ttf':'font/ttf', '.map':'application/json' };

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      try {
        let p = decodeURIComponent(req.url.split('?')[0]);
        if (p === '/favicon.ico') { res.writeHead(204).end(); return; }
        if (p.endsWith('/')) p += 'index.html';
        const fp = normalize(join(ROOT, p));
        if (!fp.startsWith(ROOT)) { res.writeHead(403).end(); return; }
        const body = await readFile(fp);
        res.writeHead(200, { 'content-type': MIME[extname(fp)] || 'application/octet-stream' });
        res.end(body);
      } catch { res.writeHead(404).end('not found'); }
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

const CHECKS = {
  // Verify kit.js lazily mounts a demo and exposes the full ctx.
  async kit(page) {
    await page.goto(`http://127.0.0.1:${PORT}/tests/manual/kit.html`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('[data-mounted="1"]', { timeout: 5000 });
    const mounts = await page.evaluate(() => window.__kitMounts);
    const text = await page.$eval('.demo', el => el.textContent);
    const keys = 'Theme,Plot,Anim,CanvasDraw,integrate,Controls,Diagram,linalg';
    assert(mounts === 1, `expected 1 mount, got ${mounts}`);
    assert(text.includes(`ctx=${keys}`), `ctx keys mismatch: ${text}`);
    return `mounted once; ctx=${keys}`;
  },
  // Verify the cart-pole chapter: 4 demos mount, KaTeX renders, no console errors.
  async chapter(page) {
    await page.goto(`http://127.0.0.1:${PORT}/dist/02-cartpole/index.html`, { waitUntil: 'networkidle0' });
    // Scroll through so IntersectionObserver mounts every demo.
    await page.evaluate(async () => {
      for (let y = 0; y <= document.body.scrollHeight; y += 300) {
        window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60));
      }
    });
    await new Promise(r => setTimeout(r, 800));
    const demoCount = await page.$$eval('.demo', els => els.length);
    const canvases = await page.$$eval('canvas', els => els.length);
    const katex = await page.$$eval('.katex', els => els.length);
    assert(demoCount === 4, `expected 4 .demo, got ${demoCount}`);
    assert(canvases >= 3, `expected >=3 canvases, got ${canvases}`);
    assert(katex >= 1, `expected KaTeX-rendered math, got ${katex}`);
    return `4 demos, ${canvases} canvases, ${katex} math spans`;
  },
  // Verify the /graph/ page: the chapter-map DAG mounts with 13 nodes, 4 live links.
  async graph(page) {
    await page.goto(`http://127.0.0.1:${PORT}/dist/graph/index.html`, { waitUntil: 'networkidle0' });
    await page.evaluate(async () => {
      for (let y = 0; y <= document.body.scrollHeight; y += 300) {
        window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60));
      }
    });
    await new Promise(r => setTimeout(r, 800));
    const nodes = await page.$$eval('.cm-node', els => els.length);
    const live = await page.$$eval('.cm svg a', els => els.length);
    const breaks = await page.$$eval('.cm-break', els => els.length);
    const hrefs = await page.$$eval('.cm svg a', els => els.map(a => a.getAttribute('href')));
    assert(nodes === 13, `expected 13 nodes, got ${nodes}`);
    assert(live === 4, `expected 4 live links, got ${live}`);
    assert(breaks === 5, `expected 5 failure-edge labels, got ${breaks}`);
    assert(hrefs.every(h => /^\/[\w-]+\/$/.test(h)), `unexpected hrefs: ${hrefs}`);
    return `13 nodes, 4 live links, 5 failure edges`;
  },
};

function assert(cond, msg) { if (!cond) throw new Error(msg); }

const which = process.argv[2] || 'kit';
const server = await serve();
const errors = [];
const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
try {
  const page = await browser.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  const summary = await CHECKS[which](page);
  if (errors.length) { console.log('CONSOLE ERRORS:\n' + errors.join('\n')); throw new Error('console errors present'); }
  console.log(`SMOKE_OK [${which}]: ${summary}; 0 console errors`);
} finally {
  await browser.close();
  server.close();
}
