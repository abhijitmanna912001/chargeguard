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

async function openFresh(width: number, path: string, height = 800) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  const resp = await page.goto(`${BASE}${path}`);
  await page.waitForLoadState("networkidle").catch(() => {});
  return { ctx, page, errors, status: resp?.status() ?? 0 };
}

// Disputes list and Metrics: HTTP, console, scroll (Metrics is restyled in Stage 3, so only reported).
for (const width of [360, 1280]) {
  for (const [name, path] of [["disputes", "/disputes"], ["metrics", "/metrics"]] as const) {
    const { ctx, page, errors, status } = await openFresh(width, path);
    await page.screenshot({ path: `${OUT}/${name}-${width}.png`, fullPage: true });
    const { sw, cw } = await noHScroll(page);
    record(`${name} ${width}: HTTP ok`, status < 400, String(status));
    record(`${name} ${width}: no console errors`, errors.length === 0, errors.join(" | "));
    record(`${name} ${width}: no horizontal scroll`, sw <= cw, `scrollWidth ${sw} / clientWidth ${cw}`);
    if (name === "disputes") {
      const axe = await axeSerious(page);
      record(`disputes ${width}: axe serious/critical`, axe.length === 0, `${axe.length} finding(s)`);
      axe.forEach((a) => console.log(`   axe: ${a}`));
      // No row/card may scroll or clip its own content.
      const overflowing = await page.evaluate(() =>
        [...document.querySelectorAll("tbody tr")].filter((r) => r.scrollWidth > r.clientWidth + 1).length,
      );
      record(`disputes ${width}: no row or card overflows`, overflowing === 0, `${overflowing} overflowing`);
      const { log, bad } = await tabAudit(page, 8);
      console.log(`   tab order @${width}: ${log.join(" > ")}`);
      record(`disputes ${width}: focus indicator on 8 tabs`, bad.length === 0, bad.join(", "));
      const row = page.locator("tbody tr").first();
      const box = await row.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width - 6, box.y + box.height / 2);
        await page.waitForURL(/\/disputes\/[^/]+$/, { timeout: 10000 }).catch(() => {});
        record(`disputes ${width}: clicking the empty side of a row opens it`, /\/disputes\/[^/]+$/.test(new URL(page.url()).pathname), new URL(page.url()).pathname);
      }
    }
    await ctx.close();
  }
}

// Dispute detail at all three widths, plus the Defend warning on a dispute that has a blocking flag.
if (!disputeHref) {
  record("dispute detail checks", false, "no dispute link found on the overview");
} else {
  const allLinks = await (async () => {
    const { ctx, page } = await openFresh(1280, "/");
    const hrefs = await page.locator('section[aria-labelledby="needs-decision-heading"] a[href^="/disputes/"]').evaluateAll((els) => els.map((e) => e.getAttribute("href")!));
    await ctx.close();
    return hrefs;
  })();

  // Find a dispute where selecting Defend shows the blocking-flag warning.
  let warnHref: string | null = null;
  for (const href of allLinks) {
    const { ctx, page } = await openFresh(1280, href);
    const defend = page.getByRole("button", { name: "Defend", exact: true });
    if ((await defend.count()) > 0) {
      await defend.click();
      if (await page.getByText(/defending overrides/i).isVisible().catch(() => false)) warnHref = href;
    }
    await ctx.close();
    if (warnHref) break;
  }
  record("a disputed page with the Defend warning exists in the demo data", warnHref !== null, warnHref ?? "none of the awaiting disputes has a blocking flag");

  for (const width of [360, 768, 1280]) {
    for (const href of new Set([disputeHref, warnHref].filter((h): h is string => !!h))) {
      const tag = `detail ${href.split("/").pop()} ${width}`;
      const { ctx, page, errors, status } = await openFresh(width, href);
      await page.getByRole("heading", { name: "Action log" }).waitFor({ timeout: 20000 }).catch(() => {});
      await page.screenshot({ path: `${OUT}/detail-${href.split("/").pop()}-${width}.png`, fullPage: true });
      record(`${tag}: HTTP ok`, status < 400, String(status));
      record(`${tag}: no console errors`, errors.length === 0, errors.join(" | "));
      const { sw, cw } = await noHScroll(page);
      record(`${tag}: no horizontal scroll`, sw <= cw, `scrollWidth ${sw} / clientWidth ${cw}`);
      const axe = await axeSerious(page);
      record(`${tag}: axe serious/critical`, axe.length === 0, `${axe.length} finding(s)`);
      axe.forEach((a) => console.log(`   axe: ${a}`));
      const { log, bad } = await tabAudit(page, 25);
      console.log(`   tab order @${width}: ${log.join(" > ")}`);
      record(`${tag}: focus indicator on 25 tabs`, bad.length === 0, bad.length ? `no ring: ${bad.join(", ")}` : "");

      // Layout: side column from lg up, single column below.
      const layout = await page.evaluate(() => {
        const log = document.getElementById("action-log-heading")?.getBoundingClientRect();
        const agent = document.getElementById("agent-panel-heading")?.getBoundingClientRect();
        return log && agent ? { logBesideAgent: log.left > agent.left + 100 && Math.abs(log.top - agent.top) < 40 } : null;
      });
      if (layout) {
        record(`${tag}: action log ${width >= 1024 ? "beside" : "below"} the agent column`, layout.logBesideAgent === (width >= 1024), JSON.stringify(layout));
      }

      if (href === warnHref) {
        const defend = page.getByRole("button", { name: "Defend", exact: true });
        const warnOk0 = !(await page.getByText(/defending overrides/i).isVisible().catch(() => false));
        record(`${tag}: no warning before Defend is selected`, warnOk0);
        await defend.click();
        const warning = page.getByText(/defending overrides/i);
        record(`${tag}: warning appears after selecting Defend`, await warning.isVisible());
        const confirm = page.getByRole("button", { name: "Confirm and defend" });
        record(`${tag}: confirm disabled until checkbox ticked`, await confirm.isDisabled());
        await page.getByRole("checkbox", { name: /I understand the rules advise against defending/ }).check();
        record(`${tag}: confirm enabled after ticking`, await confirm.isEnabled());
        // Never click Confirm: this check must not change data.
        await page.screenshot({ path: `${OUT}/detail-warning-${width}.png`, fullPage: true });
        const { sw: sw2, cw: cw2 } = await noHScroll(page);
        record(`${tag} (warning open): no horizontal scroll`, sw2 <= cw2, `scrollWidth ${sw2} / clientWidth ${cw2}`);
        const axe2 = await axeSerious(page);
        record(`${tag} (warning open): axe serious/critical`, axe2.length === 0, `${axe2.length} finding(s)`);
        axe2.forEach((a) => console.log(`   axe: ${a}`));
        // The focused checkbox and buttons need a visible ring.
        // Reach the checkbox by keyboard (Tab then Shift+Tab): a script-set focus after a click
        // does not count as keyboard focus, so :focus-visible would not apply.
        await page.getByRole("checkbox").focus();
        await page.keyboard.press("Tab");
        await page.keyboard.press("Shift+Tab");
        const ring = await page.evaluate(() => {
          const cs = getComputedStyle(document.activeElement as HTMLElement);
          return cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
        });
        record(`${tag} (warning open): checkbox focus ring`, ring);
      }
      await ctx.close();
    }
  }

  // Sidebar: sticky and full viewport height while the page scrolls.
  {
    const { ctx, page } = await openFresh(1280, warnHref ?? disputeHref, 600);
    await page.getByRole("heading", { name: "Action log" }).waitFor({ timeout: 20000 }).catch(() => {});
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const box = await page.locator("aside").boundingBox();
    const scrolled = await page.evaluate(() => window.scrollY);
    record("sidebar stays pinned (top 0, full height) after scrolling", !!box && scrolled > 0 && Math.abs(box.y) < 1 && Math.abs(box.height - 600) < 2, `scrollY ${scrolled}, aside y ${box?.y}, height ${box?.height}`);
    const demo = await page.getByText("Demo mode · simulated provider").boundingBox();
    record("sidebar footer (demo badge) is on screen", !!demo && demo.y + demo.height <= 600);
    await ctx.close();
  }

  // One shared max width on every page.
  {
    const widths: Record<string, number> = {};
    for (const [name, path] of [["overview", "/"], ["disputes", "/disputes"], ["metrics", "/metrics"], ["detail", disputeHref]] as const) {
      const { ctx, page } = await openFresh(1800, path);
      widths[name] = Math.round((await page.locator("main").boundingBox())?.width ?? 0);
      await ctx.close();
    }
    record("all pages share one content max width (1800px viewport)", new Set(Object.values(widths)).size === 1, JSON.stringify(widths));
  }
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots in ${OUT}/`);
process.exit(failed.length ? 1 : 0);
