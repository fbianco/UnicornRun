// ---------------------------------------------------------------------------
// Builds docs/deck/unicorn-run-under-the-hood.pdf from the slide files.
//
//   node docs/deck/build-pdf.mjs
//
// The slides (project/slides/*.html, one <section> each, order in
// project/deck.json) are written for the Slides viewer, where pictures are
// uploaded files ("/_blob/<id>"). This script puts every slide on one
// 1920 x 1080 page, points the pictures at their copies in docs/images, and
// prints it with headless Chrome (set CHROME=... if it is not found).
// ---------------------------------------------------------------------------
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const project = path.join(here, 'project');
const outPdf = path.join(here, 'unicorn-run-under-the-hood.pdf');
const port = 8131;
const debugPort = 9335;

// uploaded picture id -> local copy
const BLOBS = {
  eac8793842de4694846e6a0196c005a5: 'race.png',
  c3a8be39e204ea9c46d1175bc6ea66a8: 'jump.png',
  '305599280ce82f9ef41a3e3d3118790e': 'campanel.png',
  '57cb4441327fcd6038c1f820e9b78c16': 'results.png',
  ea1c3cdcf8ec1447257e9b5f42729635: 'gallery.png',
  fdb43a35a83c13e34840264b5f45100a: 'lobby.png',
  '90d7b581adad5f9dd052da2614974c29': 'training.png',
  '95aba6dd7dca7ca7c95237efa94a4807': 'jumpline.png',
};

// the slide format's defaults (see the Slides reference: format.md)
const CSS = `
@page { size: 1920px 1080px; margin: 0 }
* { box-sizing: border-box; margin: 0 }
html, body { padding: 0; background: #1e0e34 }
section { position: relative; width: 1920px; height: 1080px; overflow: hidden; font-size: 32px; line-height: 1.4; break-after: page }
section:last-of-type { break-after: auto }
div { display: flex; flex-direction: column }
h1 { font-size: 96px; font-weight: 600; line-height: 1.1 }
h2 { font-size: 64px; font-weight: 600; line-height: 1.15 }
h3 { font-size: 44px; font-weight: 600; line-height: 1.2 }
aside { display: none }
img, svg { display: block; flex-shrink: 0 }
table { border-collapse: collapse; width: 100% }
th, td { padding: 0.35em 0.6em; border: 1px solid rgba(127, 110, 160, 0.35); text-align: left; vertical-align: top }
th { font-weight: 700 }
x-connector { display: block; flex: none; align-self: center; height: 0; border-top-style: solid; border-top-color: currentColor; position: relative }
x-connector[head="end"]::after { content: ""; position: absolute; right: -4px; top: -11px; border-left: 16px solid currentColor; border-top: 9px solid transparent; border-bottom: 9px solid transparent }
`;

const deck = JSON.parse(fs.readFileSync(path.join(project, 'deck.json'), 'utf8'));
const fonts = Object.values(deck.faces ?? {}).filter((f) => f.href).map((f) => `<link rel="stylesheet" href="${f.href}">`).join('\n');
const slides = deck.order.map((id) => {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error(`bad slide id ${id}`);
  return fs.readFileSync(path.join(project, 'slides', `${id}.html`), 'utf8')
    .replace(/\/_blob\/([0-9a-f]{32})/g, (m, blob) => {
      if (!BLOBS[blob]) throw new Error(`slide ${id}: no local copy of picture ${blob}`);
      return `../images/${BLOBS[blob]}`;
    });
});
const html = `<!doctype html><html><head><meta charset="utf-8"><title>${deck.title}</title>
${fonts}<style>${CSS}</style></head><body>
${slides.join('\n')}
</body></html>`;
const printFile = path.join(here, '.print.html');
fs.writeFileSync(printFile, html);

const chrome = process.env.CHROME ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find((p) => fs.existsSync(p));
if (!chrome) throw new Error('Chrome not found: set CHROME=/path/to/chrome');

const server = spawn(process.execPath, [path.join(repo, 'tests/dev-server.mjs'), String(port)], { stdio: 'ignore' });
const profile = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'), 'deck-pdf-'));
const browser = spawn(chrome, ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`,
  '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let ws;
  for (let i = 0; i < 60 && !ws; i++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find((t) => t.type === 'page');
      if (page) ws = new WebSocket(page.webSocketDebuggerUrl);
    } catch { await sleep(250); }
  }
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

  await send('Page.enable');
  await send('Page.navigate', { url: `http://localhost:${port}/docs/deck/.print.html` });
  // wait until the fonts and every picture are in
  for (let i = 0; i < 120; i++) {
    const r = await send('Runtime.evaluate', {
      expression: `document.readyState === 'complete' && [...document.images].every((im) => im.complete && im.naturalWidth > 0) && document.fonts.status === 'loaded'`,
      returnByValue: true,
    });
    if (r.result?.result?.value) break;
    await sleep(250);
  }
  await send('Runtime.evaluate', { expression: 'document.fonts.ready', awaitPromise: true });
  const pdf = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 });
  if (!pdf.result?.data) throw new Error('printing failed: ' + JSON.stringify(pdf.error));
  fs.writeFileSync(outPdf, Buffer.from(pdf.result.data, 'base64'));
  console.log(`${path.relative(repo, outPdf)}: ${slides.length} slides`);
  ws.close();
} finally {
  browser.kill();
  server.kill();
  fs.rmSync(printFile, { force: true });
  await sleep(500);
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
