# Supplier Structure and Inbox Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make supplier/product hierarchy visually unmistakable, enforce one structure layer per row, calculate layer percentages, preserve structure line breaks, and collapse FY27 CNY aliases into one campaign.

**Architecture:** Keep the two existing single-file interfaces and add small pure helpers inside their current scripts. The supplier form remains the source of structured layer data; it derives percentages and serializes one layer per newline. The inbox canonicalizes campaign aliases before grouping and uses dedicated semantic classes for company headers, product selection, section-title bars, and structure lines.

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js test runner, Playwright with local Chrome, Tencent CloudBase HTTP API and hosting.

## Global Constraints

- Structure descriptions allow only Chinese Han characters, English letters, and digits; spaces and all symbols are rejected.
- Validation applies only to the structure description field; weight keeps decimal input and other text fields are unchanged.
- Chinese IME composition must finish before filtering.
- Layer order is bottom to top; the first row is `第1层｜最底层`.
- Company active/expanded color is warm oat `#eadbc0`; selected product color is pale sage `#e7efe5` with a muted green accent.
- Percentages are derived from the current product's positive layer weights and display at most one decimal place.
- FY27 `01月｜CNY` and `01月｜CNY（含烘焙 / 三明治换新）` resolve to the standard long name.
- Do not delete, merge, or reassign any supplier record.

---

### Task 1: Supplier structure validation, layer labels, and percentages

**Files:**
- Create: `tests/categorylab-supplier-structure-form.test.mjs`
- Modify: `decks/category-lab/supplier-submit.html:167-248,716-1025,1230-1270`

**Interfaces:**
- Consumes: existing `products`, `numeric`, `formatWeight`, `structureTotal`, `syncProductFromCard`, and `updateProductSummary`.
- Produces: `normalizeStructureDescription(value): string`, `structureDescriptionIsValid(value): boolean`, `formatStructurePercent(weight,total): string`, and newline-separated `structureText(product): string`.

- [ ] **Step 1: Write the browser tests first**

Create a local static server and Playwright page following `tests/categorylab-supplier-submission-batch-inbox.test.mjs`. Add independent tests that assert:

```js
test("structure guidance labels layers from bottom to top", async () => {
  assert.match(await page.locator("[data-structure-guidance]").innerText(), /从下到上.*每一行只填一层/);
  assert.equal(await page.locator("[data-structure-layer-label]").first().innerText(), "第1层｜最底层");
  await page.getByRole("button", { name: "向上新增一层" }).click();
  assert.deepEqual(await page.locator("[data-structure-layer-label]").allTextContents(), ["第1层｜最底层", "第2层"]);
});

test("structure description removes symbols and asks for another layer", async () => {
  const input = page.locator('[data-structure-field="name"]').first();
  await input.fill("饼干底A1 / 奶油");
  assert.equal(await input.inputValue(), "饼干底A1奶油");
  assert.match(await page.locator("[data-structure-error]").first().innerText(), /向上新增一层/);
});

test("weights recalculate percentages and serialized line breaks", async () => {
  await page.locator('[data-structure-field="name"]').first().fill("饼干底");
  await page.locator('[data-structure-field="weight"]').first().fill("20");
  await page.getByRole("button", { name: "向上新增一层" }).click();
  await page.locator('[data-structure-field="name"]').nth(1).fill("芝士慕斯");
  await page.locator('[data-structure-field="weight"]').nth(1).fill("80");
  assert.deepEqual(await page.locator("[data-structure-percent]").allTextContents(), ["20%", "80%"]);
  const stored = await page.locator('[data-product-field="ingredientsStructure"]').inputValue();
  assert.equal(stored, "第1层｜最底层：饼干底 20g（20%）\n第2层：芝士慕斯 80g（80%）\n自动计算总克重：100g");
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `node --test tests/categorylab-supplier-structure-form.test.mjs`  
Expected: FAIL because the guidance, layer labels, symbol filtering, percent cells, and serialized labels do not exist.

- [ ] **Step 3: Add minimal form helpers and markup**

Implement Unicode-aware filtering after NFKC normalization:

```js
function normalizeStructureDescription(value) {
  return String(value || "").normalize("NFKC").replace(/[^\p{Script=Han}A-Za-z0-9]/gu, "");
}

function structureDescriptionIsValid(value) {
  const text = String(value || "");
  return text === normalizeStructureDescription(text);
}

function formatStructurePercent(weight, total) {
  if (!(weight > 0) || !(total > 0)) return "—";
  return `${Number(((weight / total) * 100).toFixed(1))}%`;
}
```

Add fixed guidance, layer labels, `占比`, `data-structure-percent`, and inline error slots. Track composing inputs with a `WeakSet`; filter on ordinary `input` and on `compositionend`, and repeat validation in `requiredProductStructure`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/categorylab-supplier-structure-form.test.mjs`  
Expected: all tests PASS with no console or page errors.

- [ ] **Step 5: Commit the form behavior**

```bash
git add decks/category-lab/supplier-submit.html tests/categorylab-supplier-structure-form.test.mjs
git commit -m "Enforce layered supplier product structures"
```

### Task 2: Inbox hierarchy colors, title bars, structure lines, and CNY canonicalization

**Files:**
- Modify: `tests/categorylab-supplier-submission-batch-inbox.test.mjs`
- Modify: `decks/category-lab/supplier-submissions-admin.html:1-1700,1899-1930,2180-2240,2820-3170,3310-3465`

**Interfaces:**
- Consumes: existing pending batch rendering, `campaignRecord`, `campaignGroupSections`, `campaignPickerField`, `sectionHtml`, and `nl`.
- Produces: `canonicalCampaignName(year,name): string`, semantic `.company-block-*`, `.pending-product-*`, `.section-title-bar`, and `.structure-lines` rendering.

- [ ] **Step 1: Add failing inbox tests**

Extend the seed with confirmed records using both FY27 CNY labels and a newline-separated structure. Assert:

```js
test("company and selected product use different semantic colors", async () => {
  const company = page.locator("[data-submission-batch-key]").first();
  const product = company.locator("[data-record-id]").first();
  await product.click();
  assert.notEqual(
    await company.locator(".submission-batch-head").evaluate(el => getComputedStyle(el).backgroundColor),
    await product.evaluate(el => getComputedStyle(el).backgroundColor)
  );
});

test("middle detail headings render as title bars", async () => {
  assert.ok(await page.locator(".section-title-bar").count() >= 4);
});

test("FY27 CNY aliases render as one campaign section", async () => {
  await page.locator('[data-status-filter="已确认"]').click();
  assert.equal(await page.locator("[data-campaign-group-section]").count(), 1);
  assert.match(await page.locator("[data-campaign-group]").innerText(), /01月｜CNY（含烘焙 \/ 三明治换新）/);
});

test("product structure keeps one visual line per stored layer", async () => {
  assert.equal(await page.locator('[data-structure-line]').count(), 3);
});
```

- [ ] **Step 2: Run the inbox test and verify RED**

Run: `node --test tests/categorylab-supplier-submission-batch-inbox.test.mjs`  
Expected: FAIL because click colors are shared, title bars and structure-line nodes do not exist, and exact campaign strings split CNY.

- [ ] **Step 3: Implement the visual and campaign helpers**

Add semantic color tokens and bind them to company and product states:

```css
:root { --company-active-bg:#eadbc0; --product-active-bg:#e7efe5; --product-active-line:#6f8068; }
.submission-batch[aria-expanded="true"] > .submission-batch-head { background:var(--company-active-bg); }
.pending-batch-item.active { background:var(--product-active-bg); box-shadow:inset 3px 0 0 var(--product-active-line); }
.section-title-bar { background:var(--side); border:1px solid var(--line-soft); border-radius:5px; padding:7px 10px; }
```

Canonicalize only the known FY27 alias:

```js
function canonicalCampaignName(year, name) {
  const normalizedYear = normalizeCampaignYear(year);
  const value = String(name || "").trim();
  if (normalizedYear === "2027" && ["01月｜CNY", "01月｜CNY（含烘焙 / 三明治换新）"].includes(value)) {
    return "01月｜CNY（含烘焙 / 三明治换新）";
  }
  return value;
}
```

Use it in grouping, picker state, and save payload generation. Add a dedicated structure renderer that splits only stored newlines and wraps each non-empty line in `data-structure-line`; do not guess separators in legacy single-line text.

- [ ] **Step 4: Run the inbox test and verify GREEN**

Run: `node --test tests/categorylab-supplier-submission-batch-inbox.test.mjs`  
Expected: all tests PASS with one CNY group and distinct company/product states.

- [ ] **Step 5: Commit the inbox behavior**

```bash
git add decks/category-lab/supplier-submissions-admin.html tests/categorylab-supplier-submission-batch-inbox.test.mjs
git commit -m "Clarify supplier inbox hierarchy"
```

### Task 3: Correct the two live FY27 CNY aliases

**Files:**
- No repository files modified.

**Interfaces:**
- Consumes: CloudBase `adminList` and `adminUpdate` actions.
- Produces: exactly two live records whose `campaign` value becomes the standard FY27 CNY name.

- [ ] **Step 1: Run a read-only preflight**

Fetch `adminList`, filter `campaign_year === "2027" && campaign === "01月｜CNY"`, and assert the IDs are exactly:

```text
9741525a-87a4-4bf8-8c42-8b45bae869a4
e530aea4-e390-4f0f-b43f-3b60224318c5
```

Expected: count `2`. Stop without mutation if the count or IDs differ.

- [ ] **Step 2: Update only those records**

For each verified ID, call `adminUpdate` with its complete current editable payload and change only:

```json
{"campaign":"01月｜CNY（含烘焙 / 三明治换新）"}
```

Expected: both responses return `ok: true` and preserve record IDs, year, status, product, supplier, images, and timestamps other than `updated_at`.

- [ ] **Step 3: Re-read live data**

Expected: FY27 old alias count `0`; standard FY27 CNY record count increases by `2`; total record count remains unchanged.

### Task 4: Regression, visual verification, sync, and deployment

**Files:**
- Verify: `decks/category-lab/supplier-submit.html`
- Verify: `decks/category-lab/supplier-submissions-admin.html`
- Sync final copies into `/Users/louise.lu/Documents/Louise-peet's workstream/12 Category Lab System｜品类工作台迭代/`

**Interfaces:**
- Consumes: completed form/inbox code and existing deploy configuration.
- Produces: passing local suite, clean repository, synchronized workstream mirror, pushed `tencent-active`, and verified CloudBase hosting.

- [ ] **Step 1: Run syntax and focused tests**

```bash
node -e 'const fs=require("fs"),vm=require("vm");for(const file of ["decks/category-lab/supplier-submit.html","decks/category-lab/supplier-submissions-admin.html"]){const html=fs.readFileSync(file,"utf8");const scripts=[...html.matchAll(/<script(?:\\s[^>]*)?>([\\s\\S]*?)<\\/script>/gi)].map(m=>m[1]).filter(s=>s.trim());scripts.forEach((s,i)=>new vm.Script(s,{filename:`${file}-${i}`}));}'
node --test tests/categorylab-supplier-structure-form.test.mjs tests/categorylab-supplier-submission-batch-inbox.test.mjs
```

Expected: syntax exit `0`; focused tests all PASS.

- [ ] **Step 2: Run all CategoryLab tests**

Run: `node --test tests/categorylab-*.test.*`  
Expected: all tests PASS with zero failures.

- [ ] **Step 3: Capture desktop and narrow screenshots**

Use Playwright at `1440×1000` and `430×932`. Confirm company warm-oat state, selected product pale-sage state, readable title bars, no horizontal overflow, percentage column alignment, and no clipped inline warning.

- [ ] **Step 4: Sync final HTML files**

Copy the two final HTML files into the active workstream mirror using the same filenames already present there. Compare SHA-256 hashes and require exact matches. Do not create backup copies.

- [ ] **Step 5: Commit any final verification-only adjustments**

```bash
git add decks/category-lab/supplier-submit.html decks/category-lab/supplier-submissions-admin.html tests/categorylab-supplier-structure-form.test.mjs tests/categorylab-supplier-submission-batch-inbox.test.mjs
git commit -m "Polish supplier structure workflow"
```

Skip this commit if no post-verification files changed.

- [ ] **Step 6: Push and deploy**

```bash
git push origin tencent-active
npx -y --package=@cloudbase/cli@3.6.4 tcb hosting deploy decks/category-lab /decks/category-lab -e louise-ai-d2gi63mlafa5599c4
```

Expected: push succeeds and CloudBase reports successful hosting deployment.

- [ ] **Step 7: Verify production without creating a submission**

Open the live supplier form and inbox. Exercise only client-side entry and mocked/non-submitting review interactions. Re-read `adminList` to confirm total record count is unchanged after verification, old FY27 CNY alias count is `0`, and the standard CNY section is singular.
