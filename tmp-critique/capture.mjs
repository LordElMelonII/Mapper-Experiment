// Assessment A (design critique) — visual capture ONLY. No repo source touched.
// Runs against the already-running shared harness at :4200.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = 'tmp-critique';
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:4200';
const log = (...a) => console.log('[critique]', ...a);

const settle = (page, ms = 450) => page.waitForTimeout(ms);

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  log('saved', name);
}

async function hookReady(page) {
  await page.waitForFunction(() => window.__TME_E2E__ !== undefined, null, { timeout: 20000 });
}

async function nodePoint(page, id) {
  return page.evaluate((nodeId) => {
    const hook = window.__TME_E2E__;
    const canvas = document.querySelector('[data-testid="tme-canvas"]');
    if (!hook || !canvas) return null;
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

async function canvasFracPoint(page, fx, fy) {
  return page.evaluate(([a, b]) => {
    const canvas = document.querySelector('[data-testid="tme-canvas"]');
    const r = canvas.getBoundingClientRect();
    return { x: r.left + r.width * a, y: r.top + r.height * b };
  }, [fx, fy]);
}

// ---------------------------------------------------------------------------
// DESKTOP 1280x800
// ---------------------------------------------------------------------------
const browser = await chromium.launch();
const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await desktop.newPage();
page.on('pageerror', (e) => log('PAGEERROR', e.message));

// (a) first paint / mapless — Maps panel auto-opens (picker-first)
await page.goto(`${BASE}/?map=none`);
await hookReady(page);
await settle(page, 900);
await shot(page, 'd01-mapless');

// (b) author a fresh map through the UI itself
await page.getByTestId('tme-maps-create-input').fill('Northern Marches');
await page.getByTestId('tme-maps-create').click();
await page.waitForFunction(() => window.__TME_E2E__?.loadedMapId?.() !== null, null, { timeout: 10000 });
await settle(page, 700);
// close the maps panel to see the bare new map
await page.getByTestId('tme-maps-panel-close').click().catch(() => {});
await settle(page, 400);
// enter editor mode (default tool: Node)
await page.getByTestId('tme-editor-toggle').click();
await settle(page, 400);
// place 4 nodes on empty canvas (upper-left / center, clear of chrome)
const spots = [
  await canvasFracPoint(page, 0.22, 0.28),
  await canvasFracPoint(page, 0.42, 0.18),
  await canvasFracPoint(page, 0.58, 0.32),
  await canvasFracPoint(page, 0.34, 0.44),
];
for (const s of spots) {
  await page.mouse.click(s.x, s.y);
  await settle(page, 320);
}
// one arc: switch to Arc tool, tap node1 then node2 (the placed spots)
await page.getByTestId('tme-tool-arc').click();
await settle(page, 300);
await page.mouse.click(spots[0].x, spots[0].y);
await settle(page, 300);
await page.mouse.click(spots[1].x, spots[1].y);
await settle(page, 500);
await shot(page, 'd02-authored');

// fresh load of the demo world for the rest
await page.goto(`${BASE}/`);
await hookReady(page);
await page.waitForFunction(() => window.__TME_E2E__.nodeLabels().length > 0, null, { timeout: 15000 });
await settle(page, 900);
await shot(page, 'd03-fx1-default');

// (c) route panel: tap a node (non-pin) -> chip + route legs
{
  const p = await nodePoint(page, 'fuyuki-bridge');
  if (p) { await page.mouse.click(p.x, p.y); await settle(page, 600); }
  await shot(page, 'd04-route');
}

// (d) property panel: editor mode + node selection
await page.getByTestId('tme-editor-toggle').click();
await settle(page, 450);
{
  const p = await nodePoint(page, 'kotomine-church');
  if (p) { await page.mouse.click(p.x, p.y); await settle(page, 600); }
  await shot(page, 'd05-property');
}

// (e) arc panel: tap an edge between shopping-district and tohsaka-residence
let arcOk = false;
for (const t of [0.5, 0.4, 0.6, 0.3]) {
  const p = await edgePoint(page, 'shopping-district', 'tohsaka-residence', t);
  if (!p) break;
  await page.mouse.click(p.x, p.y);
  await settle(page, 450);
  const visible = await page.getByTestId('tme-arc-panel').isVisible().catch(() => false);
  if (visible) { arcOk = true; break; }
}
if (arcOk) await shot(page, 'd06-arc');
else log('arc panel not reached — skipping d06');

// (f)+(h) layer manager + inline delete confirm "dialog"
await page.getByTestId('tme-layer-manage').click();
await settle(page, 500);
const delBtns = page.locator('[data-testid="tme-layer-delete"]');
if ((await delBtns.count()) > 1) {
  await delBtns.nth(1).click();
  await settle(page, 400);
}
await shot(page, 'd07-layer-manager-delete');

await desktop.close();

// ---------------------------------------------------------------------------
// PHONE 390x844, touch
// ---------------------------------------------------------------------------
const phone = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});
const p2 = await phone.newPage();
p2.on('pageerror', (e) => log('PAGEERROR(phone)', e.message));

await p2.goto(`${BASE}/`);
await hookReady(p2);
await p2.waitForFunction(() => window.__TME_E2E__.nodeLabels().length > 0, null, { timeout: 15000 });
await settle(p2, 1000);
await shot(p2, 'p01-first-paint');

// editor mode on the phone bottom rail
await p2.getByTestId('tme-editor-toggle').tap();
await settle(p2, 600);
await shot(p2, 'p02-edit-tools');

// route sheet: open via the sheet rail (find a hittable point), then tap a node
{
  const at = await p2.evaluate(() => {
    const rail = document.querySelector('[data-testid="tme-sheet-rail"]');
    if (rail === null) return null;
    const r = rail.getBoundingClientRect();
    for (let dy = 6; dy <= r.height - 6; dy += 6) {
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + dy);
      if (hit !== null && (hit === rail || rail.contains(hit))) return { x: r.width / 2, y: dy };
    }
    return null;
  });
  if (at) { await p2.getByTestId('tme-sheet-rail').tap({ position: at }); await settle(p2, 500); }
  const np = await nodePoint(p2, 'kotomine-church');
  if (np) { await p2.touchscreen.tap(np.x, np.y); await settle(p2, 600); }
  await shot(p2, 'p03-route-sheet');
}

// property sheet: editor mode already on; tap a node
{
  const np = await nodePoint(p2, 'tohsaka-residence');
  if (np) { await p2.touchscreen.tap(np.x, np.y); await settle(p2, 600); }
  await shot(p2, 'p04-property-sheet');
}

// maps panel sheet via the rail's Maps toggle
{
  // close property panel first: tap Done if present
  await p2.getByTestId('tme-node-done').tap().catch(() => {});
  await settle(p2, 400);
  // leave editor mode to see the default bottom bar
  await p2.getByTestId('tme-editor-toggle').tap().catch(() => {});
  await settle(p2, 400);
  await p2.getByTestId('tme-maps-toggle').tap();
  await settle(p2, 600);
  await shot(p2, 'p05-maps-panel');
}

await phone.close();
await browser.close();
log('DONE');
