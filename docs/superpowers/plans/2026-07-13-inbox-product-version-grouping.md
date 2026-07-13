# 产品信息收件箱版本归组 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在产品信息收件箱中以产品组展示独立的 V1/V2/V3 记录，并支持保守的模糊建议、人工持久化合并和纠错。

**Architecture:** 收件箱 HTML 内增加纯函数层，负责名称规范化、产品组构建、版本排序和候选相似度；渲染层将现有单层列表替换为产品组和版本两层列表。腾讯云函数新增管理员批量归组动作，只写入可选的 `product_group_id`，不改变供应商提交接口和每个版本的独立记录。

**Tech Stack:** 单文件 HTML/CSS/JavaScript、Node.js `node:test` 临时回归测试、腾讯云 CloudBase Node.js 云函数、CloudBase 静态托管。

## Global Constraints

- V1/V2/V3 每个版本始终是独立记录，保存、确认、导入和删除只作用于当前版本。
- 不同供应商绝不自动匹配或人工合并。
- 精确名称可自动归组；模糊名称只能提示，必须人工确认。
- `versionStage` 继续作为独立阶段标识，不替代 `version_label`。
- 供应商提交页在实施期间保持维护提示；完成全部验证后才恢复正式页面。
- 测试文件、截图、CLI 和部署临时文件只放 `/private/tmp`，完成后全部删除。
- 不创建 HTML 备份副本，不修改现有供应商数据。

---

### Task 1: 产品归组纯函数与回归测试

**Files:**
- Create temporarily: `/private/tmp/categorylab-inbox-product-grouping.test.cjs`
- Modify: `decks/category-lab/supplier-submissions-admin.html`

**Interfaces:**
- Produces: `normalizeGroupingText(value)`, `automaticProductKey(row)`, `effectiveProductGroupKey(row, allRecords)`, `compareVersions(a, b)`, `buildProductGroups(allRecords, matchingRecords)`, `productSimilarity(a, b)`, `suggestProductGroups(group, groups)`.
- Consumes: existing `createdTime(row)`, `deriveVersionStage(row, records)` and `records` array.

- [ ] **Step 1: Write the failing grouping tests**

Create temporary Node tests that extract the grouping helper block from the inbox HTML and assert:

```js
assert.equal(normalizeGroupingText(" 芋泥·巴斯克 "), "芋泥巴斯克");
assert.equal(automaticProductKey(a), automaticProductKey(b));
assert.notEqual(automaticProductKey(a), automaticProductKey(differentSupplier));
assert.deepEqual(group.records.map(row => row.version_label), ["V1", "V2", "V3", "V10", "首版"]);
assert.equal(productSimilarity("芋泥巴斯克", "芋泥巴斯克蛋糕").isCandidate, true);
assert.equal(productSimilarity("芋泥巴斯克", "开心果蛋糕").isCandidate, false);
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test /private/tmp/categorylab-inbox-product-grouping.test.cjs`

Expected: FAIL because grouping helpers do not exist.

- [ ] **Step 3: Implement minimal grouping helpers**

Add a delimited pure-function block before `createdTime(row)`. Manual `product_group_id` takes priority. Ungrouped records use normalized supplier and product name. Existing names inside a manual group are aliases for later exact matches from the same supplier.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test /private/tmp/categorylab-inbox-product-grouping.test.cjs`

Expected: all grouping and fuzzy-candidate tests PASS.

---

### Task 2: 两层产品组列表与版本切换

**Files:**
- Modify: `decks/category-lab/supplier-submissions-admin.html`
- Test temporarily: `/private/tmp/categorylab-inbox-product-grouping.test.cjs`

**Interfaces:**
- Consumes: Task 1 grouping helpers.
- Produces: `visibleProductGroups()`, `activeProductGroup()`, `renderVersionSwitcher(row)`, collapsed group state in browser memory.

- [ ] **Step 1: Add failing static and behavior assertions**

Assert the inbox contains product-group controls, version child buttons and version switcher; the stable URL continues removing `id`; filtering a group keeps nonmatching sibling versions available.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test /private/tmp/categorylab-inbox-product-grouping.test.cjs`

Expected: FAIL because the two-level list is absent.

- [ ] **Step 3: Implement grouped rendering**

Replace `renderList()` with product-group rendering:

```text
产品组标题：最新品名 / 供应商 / 版本数 / 状态摘要 / 最新时间
版本子项：版本号 / 阶段标识 / 状态 / 调整点摘要 / 提交时间
```

The active group stays open. Group filters decide visibility, but each visible group renders all versions and dims siblings that do not match the current filter.

- [ ] **Step 4: Add version switcher above detail content**

The switcher changes `activeRecordId`, keeps the URL free of record-specific suffixes, rerenders detail/meta/list, and does not call the API.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `node --test /private/tmp/categorylab-inbox-product-grouping.test.cjs`

Expected: all list, filter, ordering and URL assertions PASS.

---

### Task 3: 云端人工归组动作

**Files:**
- Modify: `cloudbase/functions/supplierFeedbackApi/index.js`
- Test temporarily: `/private/tmp/categorylab-cloudbase-product-grouping.test.cjs`

**Interfaces:**
- Produces: `normalizeProductGroupId(value)`, `validateProductGroupingRecords(records)`, `adminSetProductGroup(collection, event, body)` and action `adminSetProductGroup`.
- Consumes: existing `assertAdmin(event, body)`, `text(value)`, collection access and `publicRecord(record)`.

- [ ] **Step 1: Write failing backend tests**

Assert:

```js
assert.equal(normalizeAdminUpdatePayload({ product_group_id: " pg-1 " }).product_group_id, "pg-1");
assert.throws(() => validateProductGroupingRecords([supplierA, supplierB]), /同一供应商/);
assert.doesNotThrow(() => validateProductGroupingRecords([supplierA1, supplierA2]));
assert.equal(isPublicAction("adminSetProductGroup"), false);
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test /private/tmp/categorylab-cloudbase-product-grouping.test.cjs`

Expected: FAIL because `product_group_id` and grouping validation are not implemented.

- [ ] **Step 3: Implement the administrator action**

Add `product_group_id` only to the administrator normalization path, not `normalizeRecordPayload()` used by public submissions. `adminSetProductGroup` must authenticate, deduplicate 1-100 record IDs, read every record, validate one normalized supplier, update all IDs, and return hydrated updated records.

- [ ] **Step 4: Run backend tests and syntax checks**

Run:

```bash
node --test /private/tmp/categorylab-cloudbase-product-grouping.test.cjs
node --check cloudbase/functions/supplierFeedbackApi/index.js
```

Expected: PASS and no syntax errors.

---

### Task 4: 调整产品归组交互

**Files:**
- Modify: `decks/category-lab/supplier-submissions-admin.html`
- Test temporarily: `/private/tmp/categorylab-inbox-product-grouping.test.cjs`

**Interfaces:**
- Consumes: `suggestProductGroups`, `cloudbaseRequest("adminSetProductGroup", ...)` and current product group.
- Produces: grouping modal, merge action, move-current-version action, restore-auto-grouping action.

- [ ] **Step 1: Add failing interaction assertions**

Assert the UI contains “调整产品归组”, “可能属于同一产品”, “移出当前版本” and “恢复自动归组”, and that calls include all intended record IDs while preserving other fields.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test /private/tmp/categorylab-inbox-product-grouping.test.cjs`

Expected: FAIL because grouping controls are absent.

- [ ] **Step 3: Implement modal and actions**

Use a simple modal, no nested cards. Candidate groups are restricted to the same supplier and ranked by similarity. Merge uses a stable target group ID or generates `pg-${crypto.randomUUID()}`. Move-current generates its own group ID. Restore sends `null` for every manually grouped record in the current group.

- [ ] **Step 4: Run all temporary tests**

Run:

```bash
node --test /private/tmp/categorylab-inbox-product-grouping.test.cjs
node --test /private/tmp/categorylab-cloudbase-product-grouping.test.cjs
```

Expected: all tests PASS.

---

### Task 5: 浏览器验证、部署和恢复供应商提交页

**Files:**
- Deploy: `cloudbase/functions/supplierFeedbackApi`
- Deploy: `decks/category-lab/supplier-submissions-admin.html`
- Restore/deploy: `decks/category-lab/supplier-submit.html`
- Remove: all `/private/tmp/categorylab-*` tests/screenshots and `/private/tmp/codex-cloudbase-cli`

**Interfaces:**
- Consumes: completed frontend and backend implementation.
- Produces: live grouped inbox and restored supplier submission page.

- [ ] **Step 1: Run full fresh verification**

Run grouping tests, backend tests, both HTML inline-script parsing, `node --check`, and `git diff --check`.

- [ ] **Step 2: Verify desktop browser behavior**

With mock records, verify group layout, V1/V2/V3/V10 order, collapse/expand, version switching, fuzzy suggestions and no overflow at 1440 px. Save screenshots only in `/private/tmp`.

- [ ] **Step 3: Commit and push**

Commit inbox HTML, CloudBase function and plan/spec documents to `tencent-active`; push GitHub.

- [ ] **Step 4: Deploy backend then inbox**

Deploy `supplierFeedbackApi` to `louise-ai-d2gi63mlafa5599c4`, then deploy the inbox HTML. Verify both new strings and the protected grouping action online.

- [ ] **Step 5: Restore supplier submission page**

Deploy repository `decks/category-lab/supplier-submit.html` back to the same hosting path and verify the maintenance text is gone and the formal form title is present.

- [ ] **Step 6: Clean temporary artifacts and verify repository state**

Delete all temporary tests, screenshots, maintenance HTML and CLI files. Confirm `git status --short --branch` is clean and synchronized with `origin/tencent-active`.
