# Supplier Submission Batch Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve one supplier form submission as an ordered batch in the `待处理` inbox while keeping every product record independent and leaving all processed inbox views unchanged.

**Architecture:** Add `submission_batch_id` and `batch_item_index` as additive record metadata at submission time and pass them through the CloudBase normalization layer. The admin page gets a separate pending-only rendering path that groups by batch and orders by item index; confirmed, imported, and all views continue through the existing product/version hierarchy. A one-time idempotent script backfills only pending legacy records before the frontend is deployed.

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js 20, Tencent CloudBase function and document database, Node test runner, Playwright with local Google Chrome, Git branch `tencent-active`.

## Global Constraints

- Apply batch grouping only when `statusFilter === "待处理"`.
- Keep `已确认`, `已导入 Category Lab`, and `全部` hierarchy and sorting unchanged.
- Keep each product as an independent record with its existing ID, status, follow-up code, edit token, timestamps, images, notification email, and Category Lab import behavior.
- Do not add a batch-confirm action; confirmation remains one product at a time.
- Use one `submission_batch_id` per supplier submit click and zero-based `batch_item_index` values in original product-card order.
- Treat any record without valid batch metadata as a visible singleton batch.
- When search matches one pending product, show the full still-pending batch so the original submission context is preserved.
- Backfill only records still in `待处理`; do not rewrite confirmed or imported history.
- Do not submit synthetic production records during verification because that would trigger the live four-recipient notification email.
- Keep temporary migration and live-verification scripts in `/tmp` and delete them before completion.
- Production CloudBase environment is `louise-ai-d2gi63mlafa5599c4`; deploy from `/Users/louise.lu/Documents/louiseboo-site` on `tencent-active`.

---

### Task 1: Persist Submission Batch Metadata Through CloudBase

**Files:**
- Modify: `cloudbase/functions/supplierFeedbackApi/index.js:103-174`
- Create: `tests/categorylab-supplier-submission-batch-api.test.cjs`

**Interfaces:**
- Consumes: public request payload fields `submission_batch_id: string | null` and `batch_item_index: number | null`.
- Produces: `normalizeRecordPayload(payload)` and `normalizeAdminUpdatePayload(payload)` preserve valid batch metadata; `sanitizePublicSubmissionPayload(payload)` allows these two non-sensitive fields through.

- [ ] **Step 1: Write the failing API normalization tests**

Create `tests/categorylab-supplier-submission-batch-api.test.cjs`:

```js
const assert = require("node:assert/strict");
const test = require("node:test");

const api = require("../cloudbase/functions/supplierFeedbackApi/index");

test("public supplier payload preserves valid submission batch metadata", () => {
  const payload = api._private.sanitizePublicSubmissionPayload({
    product_name: "产品 A",
    supplier_name: "供应商 A",
    submission_batch_id: "batch-20260901-a",
    batch_item_index: 2,
    quote_rmb: 88
  });

  assert.equal(payload.submission_batch_id, "batch-20260901-a");
  assert.equal(payload.batch_item_index, 2);
  assert.equal(payload.quote_rmb, undefined);
});

test("invalid batch indices normalize to null", () => {
  for (const value of [-1, 1.5, "not-a-number", ""]) {
    const payload = api._private.normalizeRecordPayload({ batch_item_index: value });
    assert.equal(payload.batch_item_index, null);
  }
});

test("admin update accepts batch metadata without affecting unrelated fields", () => {
  const patch = api._private.normalizeAdminUpdatePayload({
    submission_batch_id: "batch-backfill-a",
    batch_item_index: 0
  });

  assert.deepEqual(patch, {
    submission_batch_id: "batch-backfill-a",
    batch_item_index: 0
  });
});
```

- [ ] **Step 2: Run the focused tests and verify the new contract is absent**

Run:

```bash
node --test tests/categorylab-supplier-submission-batch-api.test.cjs
```

Expected: FAIL because `submission_batch_id` and `batch_item_index` are not returned.

- [ ] **Step 3: Add strict additive normalization**

Add the helper above `normalizeRecordPayload` and include both fields in its returned object:

```js
function nullableBatchItemIndex(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeRecordPayload(payload = {}) {
  return {
    product_name: text(payload.product_name),
    supplier_name: text(payload.supplier_name),
    submission_batch_id: nullableText(payload.submission_batch_id),
    batch_item_index: nullableBatchItemIndex(payload.batch_item_index),
    version_label: nullableText(payload.version_label),
    sample_date: nullableText(payload.sample_date),
    product_type: nullableText(payload.product_type),
    test_category: nullableText(payload.test_category),
    campaign_year: nullableText(payload.campaign_year),
    campaign: nullableText(payload.campaign),
    version_change: nullableText(payload.version_change),
    finished_spec: nullableText(payload.finished_spec),
    length_mm: nullableText(payload.length_mm),
    width_mm: nullableText(payload.width_mm),
    height_mm: nullableText(payload.height_mm),
    ingredients_structure: nullableText(payload.ingredients_structure),
    image_paths: Array.isArray(payload.image_paths) ? payload.image_paths : [],
    quote_rmb: quoteToNumber(payload.quote_rmb),
    core_ingredients_selling_points: nullableText(payload.core_ingredients_selling_points),
    tasting_scene: nullableText(payload.tasting_scene),
    tasting_feedback: nullableText(payload.tasting_feedback),
    round_conclusion: nullableText(payload.round_conclusion),
    next_step_direction: nullableText(payload.next_step_direction),
    key_blocker: nullableText(payload.key_blocker),
    status: ["待处理", "已确认"].includes(payload.status) ? payload.status : "待处理"
  };
}
```

Do not delete the two batch fields in `sanitizePublicSubmissionPayload`; they contain no supplier-visible secret and are required by `submitSupplierFeedback`. `normalizeAdminUpdatePayload` will automatically accept them because it iterates the normalized keys already present in the caller payload.

- [ ] **Step 4: Run API and full regression tests**

Run:

```bash
node --check cloudbase/functions/supplierFeedbackApi/index.js
node --test tests/categorylab-supplier-submission-batch-api.test.cjs
node --test tests/*.test.*
```

Expected: syntax check exits 0; focused tests PASS; existing suite PASS.

- [ ] **Step 5: Commit the backend contract**

```bash
git add cloudbase/functions/supplierFeedbackApi/index.js tests/categorylab-supplier-submission-batch-api.test.cjs
git commit -m "Add supplier submission batch metadata"
```

### Task 2: Stamp One Batch ID and Original Order on Supplier Products

**Files:**
- Modify: `decks/category-lab/supplier-submit.html:1048-1195`
- Create: `tests/categorylab-supplier-submission-batch-form.test.mjs`

**Interfaces:**
- Consumes: existing `rowId()` UUID helper and `products` array order.
- Produces: `productPayload(product, imagePaths, batchMetadata)` where `batchMetadata` is `{ submissionBatchId: string, batchItemIndex: number }`.

- [ ] **Step 1: Write the failing supplier-form source contract test**

Create `tests/categorylab-supplier-submission-batch-form.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../decks/category-lab/supplier-submit.html", import.meta.url), "utf8");

test("supplier form creates one batch id before mapping products", () => {
  assert.match(source, /const submissionBatchId = rowId\(\);\s*const payloads = products\.map/);
});

test("supplier form stamps the shared id and zero-based product index", () => {
  assert.match(source, /submission_batch_id:\s*batchMetadata\.submissionBatchId/);
  assert.match(source, /batch_item_index:\s*batchMetadata\.batchItemIndex/);
  assert.match(source, /submissionBatchId,\s*batchItemIndex:\s*index/);
});

test("fallback image update keeps the original batch metadata", () => {
  assert.match(source, /productPayload\(item\.product, images, item\.batchMetadata\)/);
});
```

- [ ] **Step 2: Run the focused form tests and verify failure**

Run:

```bash
node --test tests/categorylab-supplier-submission-batch-form.test.mjs
```

Expected: FAIL because the supplier form does not create or attach batch metadata.

- [ ] **Step 3: Extend `productPayload` without changing visible form fields**

Change the signature and add the metadata next to the supplier identity:

```js
function productPayload(product, imagePaths = [], batchMetadata = {}) {
  const sharedSupplier = field("supplierName").value.trim();
  const sharedDate = field("sampleDate").value;
  const sharedProductType = field("productType").value;
  const sharedTestCategory = field("testCategory").value.trim();
  return {
    product_name: productValue(product, "productName").trim(),
    supplier_name: sharedSupplier,
    submission_batch_id: batchMetadata.submissionBatchId || null,
    batch_item_index: Number.isInteger(batchMetadata.batchItemIndex) ? batchMetadata.batchItemIndex : null,
    version_label: productValue(product, "versionLabel").trim(),
    sample_date: sharedDate,
    product_type: sharedProductType,
    test_category: sharedTestCategory,
    version_change: productValue(product, "versionChange").trim(),
    finished_spec: productValue(product, "finishedSpec").trim(),
    length_mm: productValue(product, "lengthMm").trim(),
    width_mm: productValue(product, "widthMm").trim(),
    height_mm: productValue(product, "heightMm").trim(),
    ingredients_structure: structureText(product).trim(),
    image_paths: imagePaths,
    core_ingredients_selling_points: productValue(product, "coreIngredientsSellingPoints").trim()
  };
}
```

- [ ] **Step 4: Create one ID per click and reuse metadata after image upload**

Replace the start of `submitCreate()` payload construction with:

```js
const submissionBatchId = rowId();
const payloads = products.map((product, index) => {
  const batchMetadata = { submissionBatchId, batchItemIndex: index };
  return {
    product,
    index,
    batchMetadata,
    payload: productPayload(product, [], batchMetadata)
  };
});
```

Change the Supabase fallback image update payload to:

```js
p_payload: productPayload(item.product, images, item.batchMetadata)
```

The CloudBase loop, image uploads, result IDs, and notification call remain otherwise unchanged.

- [ ] **Step 5: Parse the inline script and run the focused tests**

Run:

```bash
node --test tests/categorylab-supplier-submission-batch-form.test.mjs
node -e 'const fs=require("fs"),vm=require("vm");const html=fs.readFileSync("decks/category-lab/supplier-submit.html","utf8");const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(s=>s.trim());scripts.forEach((s,i)=>new vm.Script(s,{filename:`supplier-submit-inline-${i}.js`}));'
```

Expected: tests PASS and inline JavaScript parsing exits 0.

- [ ] **Step 6: Commit the supplier submission change**

```bash
git add decks/category-lab/supplier-submit.html tests/categorylab-supplier-submission-batch-form.test.mjs
git commit -m "Group products from one supplier submission"
```

### Task 3: Render Ordered Submission Batches Only in the Pending Inbox

**Files:**
- Modify: `decks/category-lab/supplier-submissions-admin.html:522-651`
- Modify: `decks/category-lab/supplier-submissions-admin.html:1910-1930`
- Modify: `decks/category-lab/supplier-submissions-admin.html:2445-2660`
- Modify: `decks/category-lab/supplier-submissions-admin.html:2945-2980`
- Modify: `decks/category-lab/supplier-submissions-admin.html:3680-3687`
- Modify: `decks/category-lab/supplier-submissions-admin.html:3917-4010`
- Create: `tests/categorylab-supplier-submission-batch-inbox.test.mjs`

**Interfaces:**
- Consumes: records with optional `submission_batch_id` and `batch_item_index`, current `visibleRecords()`, `renderAll()`, `saveRow()`, and unsaved-change guard.
- Produces: `pendingSubmissionBatches()`, `pendingRecordsInDisplayOrder()`, `nextPendingRecordId(id)`, and `renderPendingSubmissionList()` used only by the pending tab.

- [ ] **Step 1: Write a failing Playwright test with CloudBase API fixtures**

Create `tests/categorylab-supplier-submission-batch-inbox.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the Playwright test and verify the pending batch UI is absent**

Run:

```bash
node --test tests/categorylab-supplier-submission-batch-inbox.test.mjs
```

Expected: FAIL because `[data-submission-batch-key]` is not rendered.

- [ ] **Step 3: Add pending-batch state and pure grouping helpers**

Add state beside the other collapsed sets:

```js
const collapsedSubmissionBatchKeys = new Set();
```

Add helpers after `visibleRecords()`:

```js
function submissionBatchKey(row) {
  const explicit = String(row.submission_batch_id || "").trim();
  return explicit ? `batch:${explicit}` : `record:${row.id}`;
}

function validBatchItemIndex(row) {
  if (row.batch_item_index === null || row.batch_item_index === undefined || row.batch_item_index === "") return null;
  const value = Number(row.batch_item_index);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function comparePendingBatchItems(a, b) {
  const aIndex = validBatchItemIndex(a);
  const bIndex = validBatchItemIndex(b);
  if (aIndex !== null && bIndex !== null && aIndex !== bIndex) return aIndex - bIndex;
  const timeDifference = new Date(a.created_at || 0) - new Date(b.created_at || 0);
  return timeDifference || String(a.id || "").localeCompare(String(b.id || ""), "zh-CN");
}

function pendingSubmissionBatches() {
  const matchingIds = new Set(visibleRecords().map(row => row.id));
  const byKey = new Map();
  records.filter(row => row.status === "待处理").forEach(row => {
    const key = submissionBatchKey(row);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(row);
  });
  return [...byKey.entries()]
    .map(([key, rows]) => {
      const orderedRecords = [...rows].sort(comparePendingBatchItems);
      const first = orderedRecords[0] || {};
      const submittedAt = orderedRecords.reduce((earliest, row) => {
        const value = new Date(row.created_at || 0).getTime();
        return Number.isFinite(value) ? Math.min(earliest, value) : earliest;
      }, Number.POSITIVE_INFINITY);
      return {
        key,
        supplier: first.supplier_name || "未知供应商",
        sampleDate: first.sample_date || "",
        submittedAt: Number.isFinite(submittedAt) ? submittedAt : 0,
        records: orderedRecords,
        matchesSearch: orderedRecords.some(row => matchingIds.has(row.id))
      };
    })
    .filter(batch => batch.matchesSearch)
    .sort((a, b) => b.submittedAt - a.submittedAt || a.key.localeCompare(b.key, "zh-CN"));
}

function pendingRecordsInDisplayOrder() {
  return pendingSubmissionBatches().flatMap(batch => batch.records);
}

function nextPendingRecordId(currentId) {
  const batches = pendingSubmissionBatches();
  const batchIndex = batches.findIndex(batch => batch.records.some(row => row.id === currentId));
  if (batchIndex < 0) return pendingRecordsInDisplayOrder().find(row => row.id !== currentId)?.id || "";
  const batch = batches[batchIndex];
  const rowIndex = batch.records.findIndex(row => row.id === currentId);
  const sameBatch = [...batch.records.slice(rowIndex + 1), ...batch.records.slice(0, rowIndex)].find(row => row.id !== currentId);
  if (sameBatch) return sameBatch.id;
  return [...batches.slice(batchIndex + 1), ...batches.slice(0, batchIndex)]
    .flatMap(item => item.records)
    .find(row => row.id !== currentId)?.id || "";
}
```

- [ ] **Step 4: Give pending selection its own display order**

Start `ensureActive()` with a pending branch:

```js
function ensureActive(preferredId = activeRecordId) {
  if (statusFilter === "待处理") {
    const availableRows = pendingRecordsInDisplayOrder();
    activeRecordId = preferredId && availableRows.some(row => row.id === preferredId)
      ? preferredId
      : (availableRows[0]?.id || "");
    syncUrl();
    return;
  }
  const groups = visibleProductGroupsInDisplayOrder();
  const availableRows = groups.flatMap(group => group.records);
  if (preferredId && availableRows.some(row => row.id === preferredId)) {
    activeRecordId = preferredId;
  } else {
    const matchingRows = visibleRecords();
    const preferredRows = searchInput.value.trim() ? matchingRows : availableRows;
    activeRecordId = preferredRows[0]?.id || availableRows[0]?.id || matchingRows[0]?.id || "";
  }
  syncUrl();
}
```

- [ ] **Step 5: Add pending-only batch markup and restrained styles**

Add styles beside `.product-group` and `.version-item`:

```css
.submission-batch {
  border-bottom: 1px solid var(--line-soft);
}
.submission-batch.active {
  background: var(--panel);
  box-shadow: inset 3px 0 0 var(--ink);
}
.submission-batch-head {
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--line-soft);
  background: transparent;
  color: var(--ink);
  padding: 14px 18px 12px;
  text-align: left;
  cursor: pointer;
}
.submission-batch-title,
.submission-batch-meta,
.pending-batch-item-head,
.pending-batch-item-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.submission-batch-title strong {
  font-family: var(--serif);
  font-size: 15px;
}
.submission-batch-meta,
.pending-batch-item-meta {
  margin-top: 5px;
  color: var(--muted);
  font-size: 11px;
}
.submission-batch[aria-expanded="false"] .submission-batch-body {
  display: none;
}
.pending-batch-item {
  width: 100%;
  border: 0;
  border-bottom: 1px solid var(--line-soft);
  background: transparent;
  padding: 14px 18px 14px 28px;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
}
.pending-batch-item.active {
  background: var(--panel);
}
.pending-batch-product-name {
  font-family: var(--serif);
  font-size: 15px;
  font-weight: 700;
}
.pending-batch-item-summary {
  display: -webkit-box;
  margin-top: 7px;
  overflow: hidden;
  color: var(--muted);
  font-size: 12.5px;
  line-height: 1.55;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
```

Add rendering helpers before `renderList()`:

```js
function pendingSubmissionItemHtml(row, index) {
  return `
    <button class="pending-batch-item ${row.id === activeRecordId ? "active" : ""}" data-record-id="${escapeAttr(row.id)}" type="button">
      <span class="pending-batch-item-head">
        <span class="pending-batch-product-name">${escapeHtml(compactText(row.product_name, "未命名产品"))}</span>
        <span class="item-time">第 ${index + 1} 项</span>
      </span>
      <span class="pending-batch-item-meta">
        <span>${escapeHtml(compactText(row.version_label, "未填版本"))} · ${escapeHtml(compactText(row.product_type, "未分类"))} · ${escapeHtml(compactText(row.test_category, "未分类"))}</span>
        <span>${escapeHtml(relativeTime(row.created_at))}</span>
      </span>
      <span class="pending-batch-item-summary">${escapeHtml(compactText(row.version_change || row.core_ingredients_selling_points || row.ingredients_structure, "暂无摘要"))}</span>
    </button>
  `;
}

function renderPendingSubmissionList() {
  const batches = pendingSubmissionBatches();
  if (!batches.length) {
    listEl.innerHTML = `<div class="empty-list">暂无匹配记录。</div>`;
    return;
  }
  const activeBatchKey = batches.find(batch => batch.records.some(row => row.id === activeRecordId))?.key || "";
  listEl.innerHTML = batches.map(batch => {
    const expanded = !collapsedSubmissionBatchKeys.has(batch.key);
    const submittedAt = batch.submittedAt ? dateText(new Date(batch.submittedAt).toISOString()) : "未记录";
    return `
      <section class="submission-batch ${batch.key === activeBatchKey ? "active" : ""}" data-submission-batch-key="${escapeAttr(batch.key)}" aria-expanded="${expanded}">
        <button class="submission-batch-head" data-submission-batch-toggle="${escapeAttr(batch.key)}" type="button" aria-expanded="${expanded}">
          <span class="submission-batch-title">
            <strong>${escapeHtml(batch.supplier)}</strong>
            <span data-submission-batch-count>${batch.records.length} 个产品</span>
          </span>
          <span class="submission-batch-meta">
            <span>送样 ${escapeHtml(batch.sampleDate || "未填写")} · 提交 ${escapeHtml(submittedAt)}</span>
            <span aria-hidden="true">${expanded ? "▼" : "▶"}</span>
          </span>
        </button>
        <div class="submission-batch-body">
          ${batch.records.map(pendingSubmissionItemHtml).join("")}
        </div>
      </section>
    `;
  }).join("");
}
```

Make `renderList()` dispatch before the existing product-group code:

```js
function renderList() {
  if (statusFilter === "待处理") {
    renderPendingSubmissionList();
    return;
  }
  const groups = visibleProductGroupsInDisplayOrder();
  // Keep the existing function body unchanged below this point.
```

- [ ] **Step 6: Keep confirmation in pending and select the next product**

Replace `confirmActiveRow()` with:

```js
async function confirmActiveRow(id = activeRecordId) {
  if (!roleCanEdit() || !id) return null;
  const confirmingFromPending = statusFilter === "待处理";
  const nextId = confirmingFromPending ? nextPendingRecordId(id) : id;
  const updated = await saveRow(id, { status: "已确认" });
  if (confirmingFromPending) {
    statusFilter = "待处理";
    renderAll(nextId);
  } else {
    statusFilter = "已确认";
    renderAll(id);
  }
  return updated;
}
```

At the start of the list click handler, before category toggles, add:

```js
const batchToggle = event.target.closest("[data-submission-batch-toggle]");
if (batchToggle) {
  const key = batchToggle.dataset.submissionBatchToggle;
  if (collapsedSubmissionBatchKeys.has(key)) collapsedSubmissionBatchKeys.delete(key);
  else collapsedSubmissionBatchKeys.add(key);
  renderList();
  return;
}
```

Clear `collapsedSubmissionBatchKeys` alongside the other collapsed sets when changing status tabs.

- [ ] **Step 7: Run focused UI and full regressions**

Run:

```bash
node --test tests/categorylab-supplier-submission-batch-inbox.test.mjs
node --test tests/*.test.*
node -e 'const fs=require("fs"),vm=require("vm");const html=fs.readFileSync("decks/category-lab/supplier-submissions-admin.html","utf8");const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(s=>s.trim());scripts.forEach((s,i)=>new vm.Script(s,{filename:`supplier-inbox-inline-${i}.js`}));'
git diff --check
```

Expected: focused and full tests PASS; inline parsing and whitespace checks exit 0.

- [ ] **Step 8: Commit the pending-only inbox UI**

```bash
git add decks/category-lab/supplier-submissions-admin.html tests/categorylab-supplier-submission-batch-inbox.test.mjs
git commit -m "Group pending products by supplier submission"
```

### Task 4: Deploy the Additive Backend and Backfill Current Pending Records

**Files:**
- Create temporarily: `/tmp/categorylab-backfill-pending-batches.mjs`
- Modify remotely: CloudBase function `supplierFeedbackApi`
- Modify remotely: pending documents in `supplier_feedback_submissions`

**Interfaces:**
- Consumes: live `adminList` records and the new `adminUpdate` batch fields.
- Produces: stable batch IDs and zero-based indices for pending records lacking metadata; existing explicit metadata is not overwritten.

- [ ] **Step 1: Deploy the backend before writing batch metadata**

Run:

```bash
npx -y --package=@cloudbase/cli@3.6.4 tcb fn deploy supplierFeedbackApi --dir cloudbase/functions/supplierFeedbackApi --force -e louise-ai-d2gi63mlafa5599c4
```

Expected: function deployment reports success for `supplierFeedbackApi`.

- [ ] **Step 2: Create an idempotent pending-only backfill script**

Create `/tmp/categorylab-backfill-pending-batches.mjs`:

```js
import { randomUUID } from "node:crypto";

const API_URL = "https://louise-ai-d2gi63mlafa5599c4.ap-shanghai.app.tcloudbase.com/api/supplier-feedback";
const apply = process.argv.includes("--apply");
const adminCode = process.env.CATEGORYLAB_ADMIN_CODE || "";

function normalize(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

async function request(action, payload = {}) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CategoryLab-Admin-Code": adminCode },
    body: JSON.stringify({ action, adminCode, ...payload })
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result.data;
}

function inferenceKey(row) {
  return [normalize(row.supplier_name), row.sample_date || "", normalize(row.product_type), normalize(row.test_category)].join("|");
}

const { records = [] } = await request("adminList");
const pending = records
  .filter(row => row.status === "待处理" && !String(row.submission_batch_id || "").trim())
  .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
const groups = [];
const lastByIdentity = new Map();

for (const row of pending) {
  const identity = inferenceKey(row);
  const createdAt = new Date(row.created_at || 0).getTime();
  const previous = lastByIdentity.get(identity);
  if (!previous || !Number.isFinite(createdAt) || createdAt - previous.lastCreatedAt > 15000) {
    const group = { batchId: randomUUID(), identity, rows: [] };
    groups.push(group);
    lastByIdentity.set(identity, { group, lastCreatedAt: createdAt });
  }
  const current = lastByIdentity.get(identity);
  current.group.rows.push(row);
  current.lastCreatedAt = createdAt;
}

console.table(groups.map(group => ({
  batchId: group.batchId,
  supplier: group.rows[0]?.supplier_name || "",
  sampleDate: group.rows[0]?.sample_date || "",
  productType: group.rows[0]?.product_type || "",
  testCategory: group.rows[0]?.test_category || "",
  products: group.rows.map(row => row.product_name).join(" -> "),
  count: group.rows.length
})));
console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", batches: groups.length, records: pending.length }));

if (apply) {
  for (const group of groups) {
    for (const [batchItemIndex, row] of group.rows.entries()) {
      await request("adminUpdate", {
        id: row.id,
        payload: { submission_batch_id: group.batchId, batch_item_index: batchItemIndex }
      });
    }
  }
  console.log(JSON.stringify({ updated: pending.length }));
}
```

- [ ] **Step 3: Dry-run and inspect every inferred pending batch**

Run:

```bash
node /tmp/categorylab-backfill-pending-batches.mjs
```

Expected from the 2026-09-01 audited snapshot: `3` batches and `7` records, with two three-product 佰翔空厨 batches and one single-product 百嘉宜 batch. If live pending data has changed, inspect the printed supplier, sample date, product type, category, timestamps, and product order before applying; the script still updates only records lacking explicit batch metadata.

- [ ] **Step 4: Apply once, then prove idempotence**

Run:

```bash
node /tmp/categorylab-backfill-pending-batches.mjs --apply
node /tmp/categorylab-backfill-pending-batches.mjs
```

Expected: apply reports the dry-run record count as updated; the second dry-run reports `0` records because all pending records now have explicit metadata.

- [ ] **Step 5: Delete the temporary migration script**

```bash
rm /tmp/categorylab-backfill-pending-batches.mjs
```

Expected: the file no longer exists; no migration artifact is added to Git or the workstream folder.

### Task 5: Push, Deploy the Frontend, and Verify the Live Workflow

**Files:**
- Verify: `decks/category-lab/supplier-submit.html`
- Verify: `decks/category-lab/supplier-submissions-admin.html`
- Verify: `cloudbase/functions/supplierFeedbackApi/index.js`
- Verify: `tests/categorylab-supplier-submission-batch-*.test.*`
- Create temporarily: `/tmp/categorylab-live-batch-check.mjs`

**Interfaces:**
- Consumes: committed backend, form, admin UI, and backfilled live pending records.
- Produces: pushed `tencent-active`, deployed CloudBase hosting, and live verification without creating or emailing a synthetic supplier submission.

- [ ] **Step 1: Run the complete local gate**

Run:

```bash
node --test tests/*.test.*
node --check cloudbase/functions/supplierFeedbackApi/index.js
node -e 'const fs=require("fs"),vm=require("vm");for(const file of ["decks/category-lab/supplier-submit.html","decks/category-lab/supplier-submissions-admin.html"]){const html=fs.readFileSync(file,"utf8");const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(s=>s.trim());scripts.forEach((s,i)=>new vm.Script(s,{filename:`${file}-inline-${i}.js`}));}'
git diff --check
git status --short --branch
```

Expected: all tests PASS, syntax and diff checks exit 0, and only intentional committed work is present. The existing email-notification implementation remains untouched by the diff.

- [ ] **Step 2: Push all approved commits to GitHub**

Run:

```bash
git push origin tencent-active
```

Expected: `origin/tencent-active` advances to the local HEAD, including the design, plan, backend, form, inbox, and regression-test commits.

- [ ] **Step 3: Deploy the Category Lab static hosting directory**

Run:

```bash
npx -y --package=@cloudbase/cli@3.6.4 tcb hosting deploy decks/category-lab /decks/category-lab -e louise-ai-d2gi63mlafa5599c4 --retry-count 3
```

Expected: CloudBase reports successful deployment of the updated supplier form and product information inbox.

- [ ] **Step 4: Verify live records and UI without triggering notification mail**

Create `/tmp/categorylab-live-batch-check.mjs`:

```js
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const API_URL = "https://louise-ai-d2gi63mlafa5599c4.ap-shanghai.app.tcloudbase.com/api/supplier-feedback";
const INBOX_URL = "https://louise-ai-d2gi63mlafa5599c4-1434918374.tcloudbaseapp.com/decks/category-lab/supplier-submissions-admin.html";

const apiResponse = await fetch(API_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "adminList" })
});
const apiPayload = await apiResponse.json();
assert.equal(apiResponse.ok, true);
assert.equal(apiPayload.ok, true);
const records = apiPayload.data.records || [];
const pending = records.filter(row => row.status === "待处理");
for (const row of pending) {
  assert.ok(String(row.submission_batch_id || "").trim(), `missing batch id: ${row.id}`);
  assert.notEqual(row.batch_item_index, null, `missing batch index: ${row.id}`);
  assert.notEqual(row.batch_item_index, "", `missing batch index: ${row.id}`);
  assert.ok(Number.isInteger(Number(row.batch_item_index)) && Number(row.batch_item_index) >= 0, `invalid batch index: ${row.id}`);
}

const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
try {
  await page.goto(INBOX_URL, { waitUntil: "networkidle" });
  await page.locator("#appPanel:not(.hidden)").waitFor();
  assert.equal(await page.locator('[data-status-filter="待处理"].active').count(), 1);
  if (pending.length) assert.ok(await page.locator("[data-submission-batch-key]").count() > 0);

  const confirmedCount = records.filter(row => row.status === "已确认").length;
  await page.locator('[data-status-filter="已确认"]').click();
  assert.equal(await page.locator("[data-submission-batch-key]").count(), 0);
  if (confirmedCount) assert.ok(await page.locator("[data-product-group-key]").count() > 0);
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ records: records.length, pending: pending.length, liveCheck: "passed" }));
} finally {
  await browser.close();
}
```

The script calls only `adminList`; it must not call `submitSupplierFeedback`. This prevents notification email to Chenko, Lainey, Louise, and Kava.

Run:

```bash
node /tmp/categorylab-live-batch-check.mjs
rm /tmp/categorylab-live-batch-check.mjs
```

Expected: live pending view has batch rows; confirmed view has only the existing product hierarchy; there are no page errors; all pending metadata checks pass; the temporary script is removed.

- [ ] **Step 5: Confirm production URLs and clean state**

Verify these unchanged URLs:

```text
https://louise-ai-d2gi63mlafa5599c4-1434918374.tcloudbaseapp.com/decks/category-lab/supplier-submit
https://louise-ai-d2gi63mlafa5599c4-1434918374.tcloudbaseapp.com/decks/category-lab/supplier-submissions-admin
```

Run:

```bash
git status --short --branch
find /tmp -maxdepth 1 -name 'categorylab-*batch*' -print
```

Expected: branch is aligned with `origin/tencent-active`, no uncommitted files remain, and the temporary-file search prints nothing. The 12 workstream currently has no duplicate `supplier-submit.html` or `supplier-submissions-admin.html`, so do not create new mirror copies; the deployed repo remains the single code source.
