// Rebuilds index.html + thumbnail.png from the owner's public GitHub Pages repos.
// Per-demo overrides (title, tag, desc, color) live in demos.json; new repos fall back to page title / repo description.
import { chromium } from 'playwright';
import fs from 'node:fs';

const OWNER = process.env.OWNER || 'nzhang-cpu';
const SELF = process.env.SELF_REPO || 'demo';
const PALETTE = ['#38bdf8', '#a78bfa', '#34e0a1', '#fb923c', '#f472b6', '#facc15'];
const overrides = JSON.parse(fs.readFileSync('demos.json', 'utf8'));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const headers = { 'User-Agent': 'demo-index', Accept: 'application/vnd.github+json' };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
const res = await fetch(`https://api.github.com/users/${OWNER}/repos?per_page=100&type=owner`, { headers });
if (!res.ok) throw new Error(`GitHub API ${res.status}`);
const repos = (await res.json())
  .filter((r) => r.has_pages && !r.fork && !r.archived && !r.private && r.name !== SELF && r.name !== `${OWNER}.github.io`)
  .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at));

fs.mkdirSync('img', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const demos = [];
for (const [i, r] of repos.entries()) {
  const url = `https://${OWNER}.github.io/${r.name}/`;
  const o = overrides[r.name] || {};
  let title = '';
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(4000);
    title = await page.title();
    const shot = await page.screenshot();
    if (shot.length > 20000) fs.writeFileSync(`img/${r.name}.png`, shot); // tiny = blank render, keep the old one
  } catch (e) {
    console.warn(`screenshot failed for ${r.name}: ${e.message}`);
  }
  demos.push({
    name: r.name, url,
    title: o.title || title || r.name,
    tag: o.tag || 'Demo',
    desc: o.desc || r.description || 'A live demo.',
    color: o.color || PALETTE[i % PALETTE.length],
    hasImg: fs.existsSync(`img/${r.name}.png`),
  });
}
await browser.close();

const placeholder = `<div class="ph"><span class="m">Hi! How can I help you today?</span><span class="u">Show me what you can do</span><span class="m">Open the demo to see ✦</span><b style="width:60%"></b></div>`;
const cards = demos.map((d) => `  <a class="card" style="--c:${d.color}" href="${d.url}" data-k="${esc(d.name.replace(/-/g, ' '))}">
    <div class="shot"><div class="frame"><div class="bar"><i></i><i></i><i></i></div>${d.hasImg ? `<img src="img/${d.name}.png" alt="${esc(d.title)} preview" loading="lazy">` : placeholder}</div></div>
    <div class="info"><div class="tag">${esc(d.tag)}</div><h2>${esc(d.title)}</h2><p>${esc(d.desc)}</p>
    <div class="go"><span class="live"><span class="dot"></span>Live</span><b>Open demo →</b></div></div>
  </a>`).join('\n');
fs.writeFileSync('index.html', fs.readFileSync('_src/template.html', 'utf8').replace('{{CARDS}}', cards).replaceAll('{{COUNT}}', demos.length));

const withImg = demos.filter((d) => d.hasImg).slice(0, 3);
const shots = withImg.map((d, i) => `<div class="w ${['a', 'b2', 'c'][i]}"><div class="b"><i></i><i></i><i></i></div><img src="../img/${d.name}.png"></div>`).join('\n');
fs.writeFileSync('_src/thumb.html', fs.readFileSync('_src/thumb.template.html', 'utf8').replace('{{SHOTS}}', shots).replaceAll('{{COUNT}}', demos.length));
const tp = await chromium.launch();
const tpage = await tp.newPage({ viewport: { width: 1200, height: 630 } });
await tpage.goto('file://' + process.cwd() + '/_src/thumb.html');
await tpage.waitForTimeout(500);
await tpage.screenshot({ path: 'thumbnail.png' });
await tp.close();
console.log(`built ${demos.length} demos: ${demos.map((d) => d.name).join(', ')}`);
