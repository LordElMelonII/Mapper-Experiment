// Assessment A — computed-style / geometry audit (screenshots already saved).
// Dumps every VISIBLE chrome element: rect, text, key computed styles.
// Plus canvas-graph facts via the repo's own __TME_E2E__ hook.
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:4200';
const log = (...a) => console.log('[audit]', ...a);
const settle = (page, ms = 450) => page.waitForTimeout(ms);

const STYLE_PROPS = [
  'color', 'background-color', 'border', 'border-radius', 'font-size',
  'font-weight', 'font-family', 'opacity', 'box-shadow',
];

async function dumpChrome(page, label) {
  console.log(`\n===== CHROME DUMP: ${label} =====`);
  const lines = await page.evaluate((props) => {
    const out = [];
    const walk = (el, depth) => {
      for (const child of el.children) {
        const r = child.getBoundingClientRect();
        const cs = getComputedStyle(child);
        const visible = r.width > 0 && r.height > 0 && cs.display !== 'none'
          && cs.visibility !== 'hidden' && (parseFloat(cs.opacity || '1') > 0.05)
          && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
        if (visible) {
          const tid = child.getAttribute('data-testid') ?? '';
          const cls = (child.getAttribute('class') ?? '').split(' ').filter(Boolean).slice(0, 3).join('.');
          const tag = child.tagName.toLowerCase();
          const ownText = Array.from(child.childNodes)
            .filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
          const styles = props.map((p) => `${p}:${cs.getPropertyValue(p)}`).filter((s) => !s.endsWith(':'));
          out.push(
            `${'  '.repeat(depth)}${tag}${tid ? `[${tid}]` : ''}${cls ? `.${cls}` : ''} ` +
            `rect(${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}) ` +
            (ownText ? `TEXT="${ownText.slice(0, 90)}" ` : '') + styles.join(' | '),
          );
          walk(child, depth + 1);
        }
      }
    };
    walk(document.body, 0);
    return out;
  }, STYLE_PROPS);
  for (const l of lines) console.log(l);
}

async function dumpGraph(page, label) {
  const facts = await page.evaluate(() => {
    const hook = window.__TME_E2E__;
    const labels = hook.nodeLabels();
    const canvas = document.querySelector('[data-testid="tme-canvas"]').getBoundingClientRect();
    const zoom = hook.zoom();
    const nodes = labels.map((lbl, i) => {
      const bb = hook.nodeRenderedBoundingBox(String(i)); // may be null; ids differ
      return `${i}:${lbl}${bb ? `@(${Math.round(bb.x)},${Math.round(bb.y)})` : ''}`;
    });
    return { count: labels.length, sample: labels.slice(0, 24), zoom: zoom.toFixed(3), canvas: { w: Math.round(canvas.width), h: Math.round(canvas.height) } };
  });
  console.log(`\n===== GRAPH: ${label} =====`);
  console.log(JSON.stringify(facts, null, 1));
}

async function nodePoint(page, id) {
  return page.evaluate((nodeId) => {
    const hook = window.__TME_E2E__;
    const canvas = document.querySelector('[data-testid="tme-canvas"]');
    const p = hook.nodeRenderedPosition(nodeId);
    if (!p) return null;
    const r = canvas.getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  }, id);
}

async function edgePoint(page, idA, idB, t) {
  const a = await nodePoint(page, idA);
  const b = await nodePoint(page, idB);
  if (!a || !b) return null;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

const browser = await chromium.launch();
const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await desktop.newPage();

// --- mapless ---
await page.goto(`${BASE}/?map=none`);
await page.waitForFunction(() => window.__TME_E2E__ !== undefined, null, { timeout: 20000 });
await settle(page, 900);
await dumpChrome(page, 'DESKTOP mapless (?map=none)');

// --- authoring flow ---
await page.getByTestId('tme-maps-create-input').fill('Northern Marches');
await page.getByTestId('tme-maps-create').click();
await page.waitForFunction(() => window.__TME_E2E__?.loadedMapId?.() !== null, null, { timeout: 10000 });
await settle(page, 700);
await page.getByTestId('tme-maps-panel-close').click().catch(() => {});
await settle(page, 400);
await dumpChrome(page, 'DESKTOP fresh map (created, panels closed)');
await page.getByTestId('tme-editor-toggle').click();
await settle(page, 400);
const frac = async (fx, fy) => page.evaluate(([a, b]) => {
  const r = document.querySelector('[data-testid="tme-canvas"]').getBoundingClientRect();
  return { x: r.left + r.width * a, y: r.top + r.height * b };
}, [fx, fy]);
const spots = [await frac(0.22, 0.28), await frac(0.42, 0.18), await frac(0.58, 0.32), await frac(0.34, 0.44)];
for (const s of spots) { await page.mouse.click(s.x, s.y); await settle(page, 320); }
await dumpGraph(page, 'after placing 4 nodes');
await dumpChrome(page, 'DESKTOP authored — 4 nodes placed (property panel state)');
await page.getByTestId('tme-tool-arc').click();
await settle(page, 250);
await page.mouse.click(spots[0].x, spots[0].y);
await settle(page, 250);
await page.mouse.click(spots[1].x, spots[1].y);
await settle(page, 500);
await dumpChrome(page, 'DESKTOP authored — arc drawn');

// --- default world ---
await page.goto(`${BASE}/`);
await page.waitForFunction(() => window.__TME_E2E__ !== undefined && window.__TME_E2E__.nodeLabels().length > 0, null, { timeout: 15000 });
await settle(page, 900);
await dumpChrome(page, 'DESKTOP fx1 default');
await dumpGraph(page, 'fx1 default');

// route: tap fuyuki-bridge
{
  const p = await nodePoint(page, 'fuyuki-bridge');
  if (p) { await page.mouse.click(p.x, p.y); await settle(page, 600); }
  await dumpChrome(page, 'DESKTOP route — fuyuki-bridge selected');
}
// property: editor + kotomine-church
await page.getByTestId('tme-editor-toggle').click();
await settle(page, 450);
{
  const p = await nodePoint(page, 'kotomine-church');
  if (p) { await page.mouse.click(p.x, p.y); await settle(page, 600); }
  await dumpChrome(page, 'DESKTOP property — kotomine-church (editor mode)');
}
// arc panel
for (const t of [0.5, 0.4, 0.6]) {
  const p = await edgePoint(page, 'shopping-district', 'tohsaka-residence', t);
  if (!p) break;
  await page.mouse.click(p.x, p.y);
  await settle(page, 450);
  if (await page.getByTestId('tme-arc-panel').isVisible().catch(() => false)) break;
}
await dumpChrome(page, 'DESKTOP arc panel');
// layer manager + delete confirm
await page.getByTestId('tme-layer-manage').click();
await settle(page, 500);
const del = page.locator('[data-testid="tme-layer-delete"]');
if ((await del.count()) > 1) { await del.nth(1).click(); await settle(page, 400); }
await dumpChrome(page, 'DESKTOP layer manager + delete confirm');
await desktop.close();

// --- phone ---
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const pp = await phone.newPage();
await pp.goto(`${BASE}/`);
await pp.waitForFunction(() => window.__TME_E2E__ !== undefined && window.__TME_E2E__.nodeLabels().length > 0, null, { timeout: 15000 });
await settle(pp, 1000);
await dumpChrome(pp, 'PHONE first paint');
await dumpGraph(pp, 'phone first paint');
await pp.getByTestId('tme-editor-toggle').tap();
await settle(pp, 600);
await dumpChrome(pp, 'PHONE edit mode');
// route sheet open + node tap
{
  const at = await pp.evaluate(() => {
    const rail = document.querySelector('[data-testid="tme-sheet-rail"]');
    if (!rail) return null;
    const r = rail.getBoundingClientRect();
    for (let dy = 6; dy <= r.height - 6; dy += 6) {
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + dy);
      if (hit && (hit === rail || rail.contains(hit))) return { x: r.width / 2, y: dy };
    }
    return null;
  });
  if (at) { await pp.getByTestId('tme-sheet-rail').tap({ position: at }); await settle(pp, 500); }
  const np = await nodePoint(pp, 'kotomine-church');
  if (np) { await pp.touchscreen.tap(np.x, np.y); await settle(pp, 600); }
  await dumpChrome(pp, 'PHONE route sheet + node tapped');
}
// property sheet
{
  const np = await nodePoint(pp, 'tohsaka-residence');
  if (np) { await pp.touchscreen.tap(np.x, np.y); await settle(pp, 600); }
  await dumpChrome(pp, 'PHONE property sheet');
  await pp.getByTestId('tme-node-done').tap().catch(() => {});
  await settle(pp, 400);
  await pp.getByTestId('tme-editor-toggle').tap().catch(() => {});
  await settle(pp, 400);
  await pp.getByTestId('tme-maps-toggle').tap();
  await settle(pp, 600);
  await dumpChrome(pp, 'PHONE maps panel');
}
await phone.close();
await browser.close();
log('AUDIT DONE');
