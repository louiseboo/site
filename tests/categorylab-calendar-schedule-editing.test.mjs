import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const categoryLabPath = "/decks/category-lab/categorylab.html";

let server;
let browser;
let page;
let baseUrl;

function contentType(pathname) {
  return {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8"
  }[extname(pathname)] || "application/octet-stream";
}

async function openLaunchPage() {
  await page.goto(`${baseUrl}${categoryLabPath}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "My Calendar 档期产品开发", exact: true }).click();
  await page.locator("#launch.active").waitFor();
}

async function openProductCalendar() {
  await openLaunchPage();
  await page.getByRole("button", { name: "产品日历", exact: true }).click();
  await page.locator("#productCalendarGrid .calendar-month-card").first().waitFor();
}

test.before(async () => {
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
      const relativePath = normalize(pathname).replace(/^[/\\]+/, "");
      const filePath = join(repoRoot, relativePath || "index.html");
      if (!filePath.startsWith(repoRoot)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const body = await readFile(filePath);
      response.writeHead(200, { "content-type": contentType(filePath) });
      response.end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
});

test.after(async () => {
  await browser?.close();
  await new Promise(resolveClose => server?.close(resolveClose));
});

test("Chinese and marketing holidays are calculated for the selected year", async () => {
  await openLaunchPage();
  const events = await page.evaluate(() => window.productCalendarHolidayEvents(2026));
  const dates = Object.fromEntries(events.map(event => [event.name, event.date]));
  assert.equal(dates["春节"], "2026-02-17");
  assert.equal(dates["元宵节"], "2026-03-03");
  assert.equal(dates["清明节"], "2026-04-05");
  assert.equal(dates["端午节"], "2026-06-19");
  assert.equal(dates["七夕"], "2026-08-19");
  assert.equal(dates["中秋节"], "2026-09-25");
  assert.equal(dates["情人节"], "2026-02-14");
  assert.equal(dates["圣诞节"], "2026-12-25");
});

test("month detail links launch dates and counts, and month elements persist", async () => {
  await openProductCalendar();
  await page.locator('[data-product-calendar-period="2026-07"]').click();
  const detail = page.locator(".calendar-detail-panel");
  assert.match(await detail.innerText(), /档期\s*\d+/);
  assert.match(await detail.innerText(), /食品\s*\d+/);
  assert.match(await detail.innerText(), /上市日期/);
  assert.ok(await detail.locator("[data-holiday-date]").count() > 0);

  await detail.locator('[data-edit-product-calendar-month="2026-07"]').click();
  const input = page.locator("#productCalendarMonthElement");
  const original = await input.inputValue();
  await input.fill("夏季 / 莓果 / 测试元素");
  await page.locator("#productCalendarMonthForm button[type=submit]").click();
  assert.match(await detail.innerText(), /测试元素/);
  await openProductCalendar();
  await page.locator('[data-product-calendar-period="2026-07"]').click();
  assert.match(await page.locator(".calendar-detail-panel").innerText(), /测试元素/);

  await page.locator('[data-edit-product-calendar-month="2026-07"]').click();
  await input.fill(original);
  await page.locator("#productCalendarMonthForm button[type=submit]").click();
});

test("timeline shows holiday markers and a four-node dashboard", async () => {
  await openLaunchPage();
  const markers = page.locator(".timeline-holiday-marker");
  assert.ok(await markers.count() > 0);
  const firstMarkerTitle = await markers.first().getAttribute("title");
  assert.match(firstMarkerTitle || "", /重点节日.*\d{4}-\d{2}-\d{2}/);

  const firstNodeTooltip = await page.locator(".timeline-dot.planned").first().getAttribute("data-tooltip");
  assert.match(firstNodeTooltip || "", /众测|NPC|中试|大生产/);
  assert.match(firstNodeTooltip || "", /计划日期/);

  await page.locator("[data-launch-expand-all]").click();
  const strip = page.locator(".launch-milestone-strip").first();
  await strip.waitFor();
  assert.equal(await strip.locator("[data-open-launch-actuals][data-milestone-key]").count(), 4);
  assert.doesNotMatch(await strip.innerText(), /原型开发|到仓|上市/);
  assert.match(await strip.innerText(), /众测/);
  assert.match(await strip.innerText(), /T-118/);
  assert.equal(await strip.evaluate(element => getComputedStyle(element).overflowX), "auto");
});

test("campaign schedule editor can shift the four key milestones together", async () => {
  await openLaunchPage();
  await page.locator("[data-launch-expand-all]").click();
  const editButton = page.locator("[data-edit-launch-schedule]").first();
  const campaignId = await editButton.getAttribute("data-edit-launch-schedule");
  await editButton.click();
  const consumerInput = page.locator('[data-launch-schedule-date="consumer"]');
  const original = await consumerInput.inputValue();
  const expected = await page.evaluate(value => window.addDays(value, -30), original);
  await page.locator('[data-shift-launch-schedule="-30"]').click();
  assert.equal(await consumerInput.inputValue(), expected);
  await page.locator("#launchScheduleForm button[type=submit]").click();

  await openLaunchPage();
  await page.locator("[data-launch-expand-all]").click();
  await page.locator(`[data-edit-launch-schedule="${campaignId}"]`).click();
  assert.equal(await page.locator('[data-launch-schedule-date="consumer"]').inputValue(), expected);

  await page.locator("[data-reset-launch-schedule]").click();
  await page.locator("#launchScheduleForm button[type=submit]").click();
});
