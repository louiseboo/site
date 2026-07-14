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

async function openProductCalendar() {
  await page.goto(`${baseUrl}${categoryLabPath}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "My Calendar 档期产品开发", exact: true }).click();
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
  await openProductCalendar();
});

test.after(async () => {
  await browser?.close();
  await new Promise(resolveClose => server?.close(resolveClose));
});

test("product calendar keeps twelve month cards and removes redundant subtitle", async () => {
  assert.equal(await page.locator("#productCalendarGrid .calendar-month-card").count(), 12);
  assert.equal(await page.getByText("飞书产品日历 · 按月份查看档期、食品与菜单。", { exact: true }).count(), 0);
});

test("launch LTO appears once in its campaign month menu", async () => {
  await page.locator('[data-product-calendar-period="2026-07"]').click();
  const menu = page.locator(".calendar-menu-table");
  await menu.waitFor();
  const blueberryRows = menu.locator("tbody tr", { hasText: "蓝莓轻芝士慕斯蛋糕" });
  assert.equal(await blueberryRows.count(), 1);
  assert.match(await blueberryRows.first().innerText(), /LTO/);
  assert.equal(await blueberryRows.first().locator("[data-edit-launch-product]").count(), 1);
});

test("monthly menu uses workbook category order and offer columns", async () => {
  const headers = (await page.locator(".calendar-menu-table thead th").allTextContents()).map(value => value.trim());
  assert.deepEqual(headers, ["产品", "售价", "早餐随心搭", "正餐随心搭", "加价购", "操作"]);
  const categories = await page.locator(".calendar-menu-table [data-menu-category]").evaluateAll(nodes =>
    [...new Set(nodes.map(node => node.getAttribute("data-menu-category")))]
  );
  assert.deepEqual(categories.slice(0, 4), ["Bakery", "Sandwich&Meal", "Cake&Dessert", "CPG"]);
});

test("annual matrix has sticky categories and twelve horizontal months", async () => {
  const matrix = page.locator(".product-calendar-table.annual-menu-matrix");
  await matrix.waitFor();
  assert.equal(await matrix.locator("thead [data-matrix-month]").count(), 12);
  assert.deepEqual(
    (await matrix.locator("thead [data-matrix-month]").allTextContents()).map(value => value.trim()),
    Array.from({ length: 12 }, (_, index) => `${index + 1}月`)
  );
  assert.deepEqual(
    (await matrix.locator("tbody [data-matrix-category]").allTextContents()).map(value => value.trim()),
    ["Bakery", "Sandwich&Meal", "Cake&Dessert", "CPG"]
  );
});

test("product management owns core products while LTO stays linked to schedule", async () => {
  const manager = page.locator(".calendar-product-manager");
  await manager.waitFor();
  assert.equal(await manager.locator("[data-open-menu-product]").count(), 1);
  assert.ok(await manager.locator('[data-menu-product-type="core"]').count() > 0);
  assert.ok(await manager.locator('[data-menu-product-type="seasonal"]').count() > 0);
  assert.equal(await manager.locator('[data-menu-product-type="lto"] [data-edit-menu-product]').count(), 0);
  assert.ok(await manager.locator('[data-menu-product-type="core"] [data-edit-menu-product]').count() > 0);
  assert.ok(await manager.locator('[data-menu-product-type="core"] [data-delete-menu-product]').count() > 0);
});

test("managed core product can be added, edited, deactivated, and deleted", async () => {
  const productName = "菜单联动测试产品";
  await page.locator("[data-open-menu-product]").click();
  await page.locator("#menuProductName").fill(productName);
  await page.locator("#menuProductGroup").selectOption("Bakery");
  await page.locator("#menuProductType").selectOption("core");
  await page.locator("#menuProductPrice").fill("21");
  await page.locator("#menuProductBreakfastOffer").fill("+1元");
  await page.locator("#menuProductForm button[type=submit]").click();

  let row = page.locator(".calendar-product-manager-table tbody tr", { hasText: productName });
  assert.equal(await row.count(), 1);
  assert.match(await row.innerText(), /21/);
  assert.match(await page.locator(".calendar-menu-table tbody tr", { hasText: productName }).innerText(), /\+1元/);

  await row.locator("[data-edit-menu-product]").click();
  await page.locator("#menuProductPrice").fill("23");
  await page.locator("#menuProductActive").selectOption("0");
  await page.locator("#menuProductForm button[type=submit]").click();
  row = page.locator(".calendar-product-manager-table tbody tr", { hasText: productName });
  assert.match(await row.innerText(), /23/);
  assert.match(await row.innerText(), /已下市/);
  assert.equal(await page.locator(".calendar-menu-table tbody tr", { hasText: productName }).count(), 0);

  await row.locator("[data-delete-menu-product]").click();
  await page.locator("#confirmOkBtn").click();
  assert.equal(await page.locator(".calendar-product-manager-table tbody tr", { hasText: productName }).count(), 0);
});
