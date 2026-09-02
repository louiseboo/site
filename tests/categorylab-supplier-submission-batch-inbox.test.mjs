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
const inboxPath = "/decks/category-lab/supplier-submissions-admin.html";
const seedRecords = [
  { id: "a-0", submission_batch_id: "batch-a", batch_item_index: 0, supplier_name: "佰翔空厨食品有限公司", product_name: "牛肝菌黑松露恰巴塔", version_label: "V1", sample_date: "2026-08-22", product_type: "烘焙", test_category: "新品提案", version_change: "第一项", status: "待处理", created_at: "2026-08-28T02:00:00.000Z", updated_at: "2026-08-28T02:00:00.000Z" },
  { id: "a-1", submission_batch_id: "batch-a", batch_item_index: 1, supplier_name: "佰翔空厨食品有限公司", product_name: "黑豆松子恰巴塔", version_label: "V1", sample_date: "2026-08-22", product_type: "烘焙", test_category: "新品提案", version_change: "第二项", status: "待处理", created_at: "2026-08-28T02:00:02.000Z", updated_at: "2026-08-28T02:00:02.000Z" },
  { id: "a-2", submission_batch_id: "batch-a", batch_item_index: 2, supplier_name: "佰翔空厨食品有限公司", product_name: "云朵吐司", version_label: "V1", sample_date: "2026-08-22", product_type: "烘焙", test_category: "新品提案", version_change: "第三项", status: "待处理", created_at: "2026-08-28T02:00:04.000Z", updated_at: "2026-08-28T02:00:04.000Z" },
  { id: "legacy-0", supplier_name: "百嘉宜", product_name: "莓果山楂蛋糕", version_label: "V3", sample_date: "2026-08-27", product_type: "蛋糕", test_category: "档期测试", status: "待处理", created_at: "2026-08-27T02:00:00.000Z", updated_at: "2026-08-27T02:00:00.000Z" },
  { id: "confirmed-0", submission_batch_id: "old-batch", batch_item_index: 0, supplier_name: "供应商 B", product_name: "已确认产品", version_label: "V1", product_type: "蛋糕", test_category: "新品提案", status: "已确认", created_at: "2026-08-20T02:00:00.000Z", updated_at: "2026-08-20T02:00:00.000Z" }
];

let server;
let browser;
let page;
let baseUrl;
let records;

function contentType(pathname) {
  return {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8"
  }[extname(pathname)] || "application/octet-stream";
}

test.before(async () => {
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
      const relativePath = normalize(pathname).replace(/^[/\\]+/, "");
      const filePath = join(repoRoot, relativePath || "index.html");
      if (!filePath.startsWith(`${repoRoot}/`)) {
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
});

test.after(async () => {
  await browser?.close();
  await new Promise(resolveClose => server?.close(resolveClose));
});

test.beforeEach(async () => {
  records = structuredClone(seedRecords);
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.addInitScript(() => {
    localStorage.setItem("burger-bom-tool-v1", JSON.stringify({
      devRecords: [{ supplierSubmissionId: "confirmed-0" }]
    }));
  });
  await page.route("**/api/supplier-feedback", async route => {
    const body = route.request().postDataJSON();
    if (body.action === "adminList") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { records } })
      });
      return;
    }
    if (body.action === "adminUpdate") {
      const index = records.findIndex(row => row.id === body.id);
      records[index] = { ...records[index], ...body.payload, updated_at: "2026-09-01T04:00:00.000Z" };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: { record: records[index] } })
      });
      return;
    }
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: `Unexpected action: ${body.action}` })
    });
  });
  await page.goto(`${baseUrl}${inboxPath}?backend=cloudbase`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-submission-batch-key]").first().waitFor();
});

test.afterEach(async () => {
  await page?.close();
});

test("pending view groups by submission and preserves original product order", async () => {
  assert.equal(await page.locator("[data-submission-batch-key]").count(), 2);
  assert.deepEqual(
    await page.locator('[data-submission-batch-key="batch:batch-a"] [data-record-id] .pending-batch-product-name').allTextContents(),
    ["牛肝菌黑松露恰巴塔", "黑豆松子恰巴塔", "云朵吐司"]
  );
  assert.match(await page.locator('[data-submission-batch-key="record:legacy-0"]').innerText(), /1 个产品/);
});

test("pending search keeps the matching product's full submission batch", async () => {
  await page.locator("#searchInput").fill("黑豆松子");
  assert.equal(await page.locator('[data-submission-batch-key="batch:batch-a"] [data-record-id]').count(), 3);
  assert.equal(await page.locator('[data-submission-batch-key="record:legacy-0"]').count(), 0);
});

test("confirmation advances inside the batch and removes the batch after its final product", async () => {
  await page.locator('[data-record-id="a-0"]').click();
  await page.locator("[data-confirm-active]").click();
  await page.locator('[data-submission-batch-key="batch:batch-a"] [data-record-id="a-1"].active').waitFor();
  assert.match(await page.locator('[data-submission-batch-key="batch:batch-a"] [data-submission-batch-count]').innerText(), /2 个产品/);
  assert.equal(await page.locator('[data-record-id="a-0"]').count(), 0);
  assert.equal(await page.locator('[data-status-filter="待处理"].active').count(), 1);

  await page.locator("[data-confirm-active]").click();
  await page.locator('[data-record-id="a-2"].active').waitFor();
  await page.locator("[data-confirm-active]").click();
  await page.locator('[data-submission-batch-key="batch:batch-a"]').waitFor({ state: "detached" });
  assert.equal(await page.locator('[data-submission-batch-key="batch:batch-a"]').count(), 0);
  assert.equal(await page.locator('[data-submission-batch-key="record:legacy-0"]').count(), 1);
});

test("processed and all views continue to use product grouping", async () => {
  await page.locator('[data-status-filter="已确认"]').click();
  assert.equal(await page.locator("[data-submission-batch-key]").count(), 0);
  assert.equal(await page.locator("[data-product-group-key]").count(), 1);

  await page.locator('[data-status-filter="已导入"]').click();
  assert.equal(await page.locator("[data-submission-batch-key]").count(), 0);
  assert.equal(await page.locator("[data-product-group-key]").count(), 1);

  await page.locator('[data-status-filter=""]').click();
  assert.equal(await page.locator("[data-submission-batch-key]").count(), 0);
  assert.ok(await page.locator("[data-product-group-key]").count() >= 1);
});
