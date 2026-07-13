# Inbox Test Category Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add visually clear `档期测试` and `新品提案` sections to the pending and confirmed inbox views, with confirmed campaign records ordered by launch sequence.

**Architecture:** Keep the existing status filter and product-version grouping intact. Add one pure section-building layer after `visibleProductGroups()`, then render section bars around the existing product-group markup. Use `CAMPAIGN_OPTIONS` as the authoritative launch order and preserve existing sorting for all other cases.

**Tech Stack:** Static HTML, CSS, browser JavaScript, Node.js `node:test`, Playwright, Tencent CloudBase hosting.

## Global Constraints

- Use only `档期测试`, `新品提案`, and `未分类`; do not introduce `新品测试`.
- Do not modify supplier records, database fields, supplier form values, or Category Lab import payloads.
- Pending and confirmed views show sections; all and imported views keep the current unsectioned list.
- Confirmed campaign records use `CAMPAIGN_OPTIONS` launch order; missing or unknown campaign values sort last.
- Keep each version record independent and preserve current expand, edit, confirm, import, delete, and manual grouping behavior.
- Put verification files in `/private/tmp` and delete them after deployment.

---

### Task 1: Category Section Data Model

**Files:**
- Modify: `decks/category-lab/supplier-submissions-admin.html`
- Test: `/private/tmp/categorylab-inbox-test-category-sections.test.cjs`

**Interfaces:**
- Consumes: `latestGroupValue(group, field)`, `groupingTime(row)`, `optionRank(options, value)`, `CAMPAIGN_OPTIONS`.
- Produces: `testCategorySectionKey(group): "campaign" | "proposal" | "uncategorized"`; `buildTestCategorySections(groups, filter, campaignOptions): Array<{key,label,note,groups}>`.

- [ ] **Step 1: Write failing pure-function tests**

Create tests that assert:

```js
assert.deepEqual(
  buildTestCategorySections(groups, "待处理", CAMPAIGN_OPTIONS).map(section => section.label),
  ["档期测试", "新品提案", "未分类"]
);
assert.deepEqual(
  buildTestCategorySections(groups, "已确认", CAMPAIGN_OPTIONS)[0].groups.map(group => group.latest.campaign),
  ["0106 Q1 烘焙换新", "0806 桂花档期", ""]
);
assert.equal(buildTestCategorySections(groups, "", CAMPAIGN_OPTIONS)[0].label, "");
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `node --test /private/tmp/categorylab-inbox-test-category-sections.test.cjs`

Expected: FAIL because `buildTestCategorySections` is not defined.

- [ ] **Step 3: Implement section helpers**

Add helpers that classify from the latest non-empty `test_category`, preserve the incoming group order for pending/proposal sections, and sort only confirmed campaign groups by `CAMPAIGN_OPTIONS` rank then latest submission time.

- [ ] **Step 4: Run tests and confirm GREEN**

Run: `node --test /private/tmp/categorylab-inbox-test-category-sections.test.cjs`

Expected: all category and campaign-order tests pass.

### Task 2: Strong Section Bar Rendering

**Files:**
- Modify: `decks/category-lab/supplier-submissions-admin.html`
- Test: `/private/tmp/categorylab-inbox-test-category-sections.playwright.cjs`

**Interfaces:**
- Consumes: `buildTestCategorySections(visibleProductGroups(), statusFilter, CAMPAIGN_OPTIONS)`.
- Produces: `.test-category-section`, `.test-category-bar`, `.campaign-section`, `.proposal-section`, `.uncategorized-section` DOM surfaces.

- [ ] **Step 1: Write failing browser assertions**

Assert that pending and confirmed views render visible section bars, confirmed campaign products follow launch order, and all/imported views contain no section bars.

- [ ] **Step 2: Run Playwright and confirm RED**

Run with bundled Playwright and local server.

Expected: FAIL because `.test-category-bar` does not exist.

- [ ] **Step 3: Add section CSS and markup**

Use full-width 42px minimum-height bars with a 3px left accent, top and bottom borders, bold title, and right-side count. Use warm gold-brown for campaign, muted green for proposal, and neutral gray for uncategorized. The confirmed campaign bar includes `按上市顺序`.

- [ ] **Step 4: Preserve existing product-group interactions**

Render the current product-group markup unchanged inside each section and keep the active/expanded state keyed by product group, not section.

- [ ] **Step 5: Run desktop and narrow-width Playwright checks**

Verify at 1440x900 and 900x900 that section copy fits, group toggles still work, pending does not show confirmed versions, and no horizontal overflow is introduced.

### Task 3: Release and Cleanup

**Files:**
- Deploy: `decks/category-lab/supplier-submissions-admin.html`
- Restore: `decks/category-lab/supplier-submit.html`

**Interfaces:**
- Consumes: passing Node and Playwright verification.
- Produces: GitHub `tencent-active` commit and matching Tencent CloudBase hosting files.

- [ ] **Step 1: Run final verification**

Run Node tests, inline-script parsing, `git diff --check`, and Playwright interaction checks.

- [ ] **Step 2: Commit and push only this feature's files**

```bash
git add decks/category-lab/supplier-submissions-admin.html docs/superpowers/specs/2026-07-13-inbox-test-category-sections-design.md docs/superpowers/plans/2026-07-13-inbox-test-category-sections.md
git commit -m "Group inbox records by test category"
git push origin tencent-active
```

- [ ] **Step 3: Deploy and verify Tencent hosting**

Deploy the inbox page, verify the section helper and CSS markers online, then restore the formal supplier submission page and confirm its maintenance flag is false.

- [ ] **Step 4: Remove only this task's temporary files**

Delete the maintenance page, Node test, Playwright script, screenshot, local server, and temporary CloudBase CLI created by this task. Do not touch unrelated worktree files.
