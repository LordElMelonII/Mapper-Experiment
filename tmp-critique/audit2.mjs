// Assessment A — pass 2: display:contents-aware walker (wide floaters),
// phone view-mode route, placed-user-node editing path.
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:4200';
const settle = (page, ms = 450) => page.waitForTimeout(ms);
const STYLE_PROPS = ['color', 'background-color', 'border', 'border-radius', 'font-size', 'font-weight', 'opacity', 'box-shadow'];

async function dumpChrome(page, label) {
  console.log(`\n===== DUMP: ${label} =====`);
  const lines = await page.evaluate((props) => {
    const out = [];
    const walk = (el, depth) => {
      for (const child of el.children) {
        const cs = getComputedStyle(child);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const r = child.getBoundingClientRect();
        const inView = r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
        if (inView) {
          const tid = child.getAttribute('data-testid') ?? '';
          const cls = (child.getAttribute('class') ?? '').split(' ').filter(Boolean).slice(0, 3).join('.');
          const tag = child.tagName.toLowerCase();
          const ownText = Array.from(child.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
          const styles = props.map((p) => `${p}:${cs.getPropertyValue(p)}`).filter((s) => !s.endsWith(':'));
          out.push(`${'  '.repeat(depth)}${tag}${tid ? `[${tid}]` : ''}${cls ? `.${cls}` : ''} rect(${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}) ${ownText ? `TEXT="${ownText.slice(0, 100)}" ` : ''}${styles.join(' | ')}`);
        }
        walk(child, depth + 1); // ALWAYS recurse unless display:none
      }
    };
    walk(document.body, 0);
    return out;
  }, STYLE_PROPS);
  for (const l of lines) console.log(l);
}

async function nodePoint(page, id) {
  return page.evaluate((nodeId) => {
    const hook = window.__TME_E2E__;
    const p = hook.nodeRenderedPosition(nodeId);
    if (!p) return null;
    const r = document.querySelector('[data-testid="tme-canvas"]').getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  }, id);
}

const browser = await chromium.launch();

// ---------- DESKTOP: mapless first paint (Maps panel auto-open) ----------
const d = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await d.newPage();
await page.goto(`${BASE}/?map=none`);
await page.waitForFunction(() => window.__TME_E2E__ !== undefined, null, { timeout: 20000 });
await settle(page, 900);
await dumpChrome(page, 'DESKTOP mapless — auto-opened Maps floater');

// ---------- DESKTOP: placed user node — what editing surface exists? ----------
await page.getByTestId('tme-maps-create-input').fill('Test Realm');
await page.getByTestId('tme-maps-create').click();
await page.waitForFunction(() => window.__TME_E2E__?.loadedMapId?.() !== null, null, { timeout: 10000 });
await settle(page, 500);
await page.getByTestId('tme-maps-panel-close').click().catch(() => {});
await settle(page, 300);
await page.getByTestId('tme-editor-toggle').click();
await settle(page, 300);
const spot = await page.evaluate(() => {
  const r = document.querySelector('[data-testid="tme-canvas"]').getBoundingClientRect();
  return { x: r.left + r.width * 0.3, y: r.top + r.height * 0.3 };
});
await page.mouse.click(spot.x, spot.y); // place one user node
await settle(page, 400);
const placed = await page.evaluate(() => {
  const hook = window.__TME_E2E__;
  return { labels: hook.nodeLabels(), edges: hook.edgeIds().length, selected: hook.selectedNodeId() };
});
console.log('\n===== PLACED USER NODE STATE =====\n' + JSON.stringify(placed));
const propOpen = await page.getByTestId('tme-property-panel').isVisible().catch(() => false);
console.log('property panel visible after placing a user node:', propOpen);
await dumpChrome(page, 'DESKTOP after placing 1 user node (no library node)');

// select the placed node explicitly (tap it again) — does ANY editor open?
await page.mouse.click(spot.x, spot.y);
await settle(page, 400);
const propOpen2 = await page.getByTestId('tme-property-panel').isVisible().catch(() => false);
console.log('property panel visible after SELECTING the placed user node:', propOpen2);
await dumpChrome(page, 'DESKTOP placed user node SELECTED');

// ---------- DESKTOP: route panel with content (floater) ----------
await page.goto(`${BASE}/`);
await page.waitForFunction(() => window.__TME_E2E__ !== undefined && window.__TME_E2E__.nodeLabels().length > 0, null, { timeout: 15000 });
await settle(page, 800);
{
  const p = await nodePoint(page, 'fuyuki-bridge');
  if (p) { await page.mouse.click(p.x, p.y); await settle(page, 600); }
}
await dumpChrome(page, 'DESKTOP route floater w/ content (fuyuki-bridge)');

// property panel maximized
await page.getByTestId('tme-editor-toggle').click();
await settle(page, 400);
{
  const p = await nodePoint(page, 'kotomine-church');
  if (p) { await page.mouse.click(p.x, p.y); await settle(page, 600); }
}
await dumpChrome(page, 'DESKTOP property panel maximized (kotomine-church)');
await d.close();

// ---------- PHONE: view-mode route (the primary ask-for-a-route flow) ----------
const ph = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const pp = await ph.newPage();
await pp.goto(`${BASE}/`);
await pp.waitForFunction(() => window.__TME_E2E__ !== undefined && window.__TME_E2E__.nodeLabels().length > 0, null, { timeout: 15000 });
await settle(pp, 900);
await pp.screenshot({ path: 'tmp-critique/p06-view-route-collapsed.png' });
// open the sheet rail
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
const np = await nodePoint(pp, 'fuyuki-bridge');
if (np) { await pp.touchscreen.tap(np.x, np.y); await settle(pp, 700); }
await pp.screenshot({ path: 'tmp-critique/p07-view-route-open.png' });
await dumpChrome(pp, 'PHONE view-mode route after tapping Fuyuki Bridge');
await ph.close();
await browser.close();
console.log('\nPASS2 DONE');
