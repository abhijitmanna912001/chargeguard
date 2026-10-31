// Browser UI check (Playwright + axe). Manual tool: not part of `npm test`, not in CI.
// Assumes `npm run dev` is running on localhost:3000 and the demo DB is seeded
// (`npm run db:reset-demo -- --yes`). Reads only; never calls the live model.
import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Page } from "@playwright/test";

const BASE = process.env.UI_CHECK_BASE ?? "http://localhost:3000";
const OUT = "ui-check-output";
mkdirSync(OUT, { recursive: true });

const results: { check: string; ok: boolean; detail: string }[] = [];
function record(check: string, ok: boolean, detail = "") {
  results.push({ check, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${check}${detail ? `  -- ${detail}` : ""}`);
}

async function noHScroll(page: Page) {
  return page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
}

async function axeSerious(page: Page) {
  const r = await new AxeBuilder({ page }).analyze();
  return r.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .flatMap((v) =>
      v.nodes.map((n) => `${v.id} [${v.impact}] ${n.target.join(" ")} :: ${v.help}`),
    );
}

async function tabAudit(page: Page, n: number) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.mouse.click(1, 1).catch(() => {});
  const log: string[] = [];
  const bad: string[] = [];
  for (let i = 0; i < n; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      if (el.tagName === "NEXTJS-PORTAL") return { label: "(next dev overlay, ignored)", visible: true };
      const cs = getComputedStyle(el);
      const outline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
      const shadow = cs.boxShadow !== "none" && cs.boxShadow !== "";
      const name =
        el.getAttribute("aria-label") || (el.textContent ?? "").trim().slice(0, 30) || el.tagName;
      return { label: `${el.tagName.toLowerCase()}:${name}`, visible: outline || shadow };
    });
    if (!info) {
      log.push("(body)");
      continue;
    }
    log.push(info.label);
    if (!info.visible) bad.push(info.label);
  }
  return { log, bad };
}

const browser = await chromium.launch();
let disputeHref: string | null = null;

for (const width of [360, 768, 1280]) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(`${BASE}/`);
  await page.getByRole("heading", { name: "Needs your decision" }).waitFor({ timeout: 20000 });
  await page.screenshot({ path: `${OUT}/overview-${width}.png`, fullPage: true });

  const { sw, cw } = await noHScroll(page);
  record(`overview ${width}: no horizontal scroll`, sw <= cw, `scrollWidth ${sw} / clientWidth ${cw}`);
  record(`overview ${width}: no console errors`, errors.length === 0, errors.join(" | "));

  const axe = await axeSerious(page);
  record(`overview ${width}: axe serious/critical`, axe.length === 0, `${axe.length} finding(s)`);
  axe.forEach((a) => console.log(`   axe: ${a}`));

  const sidebar = page.locator("aside");
  const menuBtn = page.getByRole("button", { name: /open menu|close menu/i });
  if (width === 1280) {
    record("overview 1280: sidebar visible", await sidebar.isVisible());
    record("overview 1280: menu button hidden", !(await menuBtn.isVisible()));
  }
  if (width === 360) {
    record("overview 360: sidebar hidden", !(await sidebar.isVisible()));
    record("overview 360: menu button visible", await menuBtn.isVisible());
    await menuBtn.click();
    record("mobile menu: aria-expanded=true after open", (await menuBtn.getAttribute("aria-expanded")) === "true");
    await page.keyboard.press("Escape");
    record("mobile menu: Escape closes it", (await menuBtn.getAttribute("aria-expanded")) === "false");
  }

  const { log, bad } = await tabAudit(page, 15);
  console.log(`   tab order @${width}: ${log.join(" > ")}`);
  record(`overview ${width}: focus indicator on 15 tabs`, bad.length === 0, bad.length ? `no ring: ${bad.join(", ")}` : "");

  if (width === 1280) {
    const row = page.locator('section[aria-labelledby="needs-decision-heading"] a[href^="/disputes/"]').first();
    if ((await row.count()) === 0) {
      record("click Needs-your-decision row navigates", false, "no rows (seed the demo DB)");
    } else {
      disputeHref = await row.getAttribute("href");
      await row.click();
      await page.waitForURL(/\/disputes\/[^/]+$/, { timeout: 15000 }).catch(() => {});
      record("click Needs-your-decision row navigates", /\/disputes\/[^/]+$/.test(new URL(page.url()).pathname), new URL(page.url()).pathname);
    }
  }
  await ctx.close();
}

// Other pages: report only.
const pages: [string, string][] = [["disputes", "/disputes"], ["metrics", "/metrics"]];
if (disputeHref) pages.push(["dispute-detail", disputeHref]);
for (const width of [360, 1280]) {
  for (const [name, path] of pages) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 } });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    const resp = await page.goto(`${BASE}${path}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.screenshot({ path: `${OUT}/${name}-${width}.png`, fullPage: true });
    const { sw, cw } = await noHScroll(page);
    record(`${name} ${width}: HTTP ok`, (resp?.status() ?? 0) < 400, String(resp?.status()));
    record(`${name} ${width}: no console errors`, errors.length === 0, errors.join(" | "));
    record(`${name} ${width}: no horizontal scroll`, sw <= cw, `scrollWidth ${sw} / clientWidth ${cw}`);
    await ctx.close();
  }
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots in ${OUT}/`);
process.exit(failed.length ? 1 : 0);
