# CategoryLab Launch Product Branching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the CategoryLab launch page so the annual timeline stays campaign-level while each campaign can independently expose a four-node food-product center.

**Architecture:** Keep the existing single-file CategoryLab architecture and its current launch campaign/product data model. Add pure rendering helpers and a separate browser-local expansion-state map, render product centers inline inside the campaign timeline grid, and reuse the existing Coffee Bar checklist only for the currently selected food.

**Tech Stack:** Static HTML/CSS/JavaScript, browser `localStorage`, Node.js built-in test runner, Playwright for end-to-end interaction checks, Tencent CloudBase static hosting.

## Global Constraints

- Do not clear, rebuild, or overwrite Louise's existing web-edited launch, product, planned-date, actual-date, checklist, or note data.
- Preserve the current warm paper visual system, typography, colors, 2026/2027 year controls, search, status metrics, and hide-completed control.
- A timeline milestone renders exactly one marker: actual lane when an actual/display-actual date exists, otherwise planned lane.
- Timeline milestone hover text contains only planned date and actual date.
- Each campaign independently expands or collapses; current filtered campaigns also support expand all and collapse all.
- Product overview columns are exactly `食品`, `众测`, `NPC`, `中试`, `大生产`.
- The complete Coffee Bar flow remains available for the selected food, including add, edit, delete, notes, and knowledge-base import.
- Normal completion includes syncing the workstream mirror, committing and pushing `tencent-active`, and deploying Tencent CloudBase.

---

### Task 1: Add browser-level regression coverage

**Files:**
- Create: `tests/categorylab-launch-product-branching.test.mjs`
- Test: `decks/category-lab/categorylab.html`

**Interfaces:**
- Consumes: CategoryLab's existing `My Calendar` navigation and launch DOM.
- Produces: Playwright assertions for marker uniqueness, campaign summary cleanliness, independent expand/collapse, four-node headers, and persisted expansion state.

- [ ] **Step 1: Write the failing end-to-end tests**

Create a Node test that starts a local HTTP server, opens CategoryLab in Chromium, enters `My Calendar`, and asserts the approved behavior:

```js
test("timeline uses one marker per campaign milestone", async () => {
  const duplicateKeys = await page.locator(".timeline-track-cell").evaluateAll(cells =>
    cells.flatMap(cell => {
      const counts = {};
      cell.querySelectorAll("[data-milestone-key]").forEach(node => {
        const key = node.getAttribute("data-milestone-key");
        counts[key] = (counts[key] || 0) + 1;
      });
      return Object.entries(counts).filter(([, count]) => count > 1);
    })
  );
  assert.deepEqual(duplicateKeys, []);
});

test("campaign product centers expand independently and show four nodes", async () => {
  assert.equal(await page.locator("[data-launch-expand-all]").count(), 1);
  assert.equal(await page.locator("[data-launch-collapse-all]").count(), 1);
  assert.deepEqual(
    await page.locator(".launch-product-overview thead th").allTextContents(),
    ["食品", "众测", "NPC", "中试", "大生产"]
  );
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
NODE_PATH=/Users/louise.lu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules \
/Users/louise.lu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node \
  --test tests/categorylab-launch-product-branching.test.mjs
```

Expected: FAIL because current timeline renders both planned and actual points and does not expose campaign product-center controls.

- [ ] **Step 3: Keep the failing test uncommitted until Tasks 2 and 3 pass**

Do not weaken assertions to match the existing UI.

---

### Task 2: Remove duplicate timeline markers and simplify campaign summaries

**Files:**
- Modify: `decks/category-lab/categorylab.html:1693-1898`
- Modify: `decks/category-lab/categorylab.html:6823-6884`
- Test: `tests/categorylab-launch-product-branching.test.mjs`

**Interfaces:**
- Consumes: `calculateLaunchMilestones(project)`, `launchMilestoneTitle(milestone)`, and `launchTimelinePosition(date, minTime, maxTime)`.
- Produces: `launchTimelineMarker(milestone)` returning `{ lane: "actual" | "planned", date: string }`, and timeline rows with one marker per milestone key.

- [ ] **Step 1: Add the failing marker-lane assertion**

Extend the test so a milestone with an actual date must have one `.timeline-dot.actual`, while a milestone without one must have one non-actual `.timeline-dot`.

- [ ] **Step 2: Run the focused test and verify RED**

Run the Task 1 command with `--test-name-pattern="timeline uses one marker"`.

Expected: FAIL with duplicate marker counts.

- [ ] **Step 3: Add the minimal marker selector**

Add:

```js
function launchTimelineMarker(milestone) {
  const actualDate = milestone?.displayActualDate || milestone?.actualDate || "";
  return actualDate
    ? { lane: "actual", date: actualDate }
    : { lane: "planned", date: milestone?.plannedDate || "" };
}
```

Render one marker for each milestone using the returned lane/date. Preserve `data-milestone-key`, tooltip, keyboard focus, launch-square styling, and status tone.

- [ ] **Step 4: Replace food-name text with an aggregate summary**

Add a helper that returns product count and counts for normal, risk, and pending foods. Render only category, product count, current campaign stage, and aggregate counts in `.timeline-project-info`; do not render a joined product-name list.

- [ ] **Step 5: Run the focused marker and summary tests and verify GREEN**

Expected: marker test and summary test PASS.

---

### Task 3: Add independent campaign product centers

**Files:**
- Modify: `decks/category-lab/categorylab.html:1661-1898`
- Modify: `decks/category-lab/categorylab.html:3273-3332`
- Modify: `decks/category-lab/categorylab.html:4953-5455`
- Modify: `decks/category-lab/categorylab.html:6823-7128`
- Modify: `decks/category-lab/categorylab.html:7977-8009`
- Modify: `decks/category-lab/categorylab.html:12429-12578`
- Test: `tests/categorylab-launch-product-branching.test.mjs`

**Interfaces:**
- Consumes: `buildLaunchCampaigns`, `calculateLaunchMilestones`, `launchCampaignById`, `openLaunchProductModal`, `openLaunchProjectModal`, `deleteLaunchCampaign`, and `renderCoffeeBarChecklist`.
- Produces: `launchCampaignExpansionState`, `launchCampaignIsExpanded(campaign)`, `setLaunchCampaignExpanded(campaignId, expanded)`, `setVisibleLaunchCampaignsExpanded(expanded)`, and `launchProductOverviewHtml(campaign)`.

- [ ] **Step 1: Add the failing expansion and persistence tests**

Verify:

```js
await page.locator("[data-launch-collapse-all]").click();
assert.equal(await page.locator("[data-launch-campaign-products]:visible").count(), 0);

const firstToggle = page.locator("[data-launch-campaign-toggle]").first();
await firstToggle.click();
assert.equal(await page.locator("[data-launch-campaign-products]:visible").count(), 1);

await page.reload();
assert.equal(await page.locator("[data-launch-campaign-products]:visible").count(), 1);
```

- [ ] **Step 2: Run the focused expansion tests and verify RED**

Expected: FAIL because expansion controls and product centers do not exist.

- [ ] **Step 3: Add browser-local expansion state**

Add `CATEGORYLAB_LAUNCH_CAMPAIGN_EXPANSION_STORAGE_KEY = "categorylab-launch-campaign-expansion-v1"`. Store a map by launch year and campaign ID. Explicit `false` must survive reload; when no value exists, only the active campaign is expanded.

- [ ] **Step 4: Render campaign controls and inline product centers**

Add `全部展开` and `全部收起` beside `隐藏已完成`. Each timeline campaign gets an `aria-expanded` toggle. Expanded product centers span both timeline grid columns and render:

```html
<table class="launch-product-overview">
  <thead><tr><th>食品</th><th>众测</th><th>NPC</th><th>中试</th><th>大生产</th></tr></thead>
</table>
```

Cells show actual date plus timing status when present; otherwise planned date plus pending status. Use existing red, amber, green, and muted colors.

- [ ] **Step 5: Reuse the Coffee Bar checklist inside the active campaign**

When a food name is selected, render one inline `#coffeeBarChecklist` under that campaign's four-node table. Remove the duplicate standalone grouped list and standalone Coffee Bar panel. Keep one campaign-level `新增食品`, `编辑档期`, and `删除档期` action set; keep food-level `编辑` and `删除` inside the selected food flow without a second `新增食品` button.

- [ ] **Step 6: Wire event delegation**

Handle `data-launch-campaign-toggle`, `data-launch-expand-all`, and `data-launch-collapse-all` before generic `data-select-launch` handling. Expanding/collapsing must not change the current year, search, filters, active food, or launch data.

- [ ] **Step 7: Run all launch branching tests and verify GREEN**

Expected: all tests PASS, including reload persistence and exact table headers.

- [ ] **Step 8: Commit the green implementation**

```bash
git add decks/category-lab/categorylab.html tests/categorylab-launch-product-branching.test.mjs
git commit -m "Redesign launch timeline product branching"
```

---

### Task 4: Visual QA, data regression, sync, and deployment

**Files:**
- Modify: `decks/category-lab/categorylab.html` only if QA finds a defect.
- Sync: `/Users/louise.lu/Documents/Louise-peet's workstream/12 Category Lab System｜品类工作台迭代/categorylab.html`
- Modify: `/Users/louise.lu/Documents/Louise-peet's workstream/12 Category Lab System｜品类工作台迭代/CATEGORY_LAB_DEPLOYMENT_LINKS.md`
- Create and keep as QA evidence: `design-qa.md`.
- Create temporarily and remove before completion: browser screenshots and local server artifacts.

**Interfaces:**
- Consumes: completed implementation and existing Tencent CloudBase deployment workflow.
- Produces: verified local and deployed CategoryLab with synchronized repo/workstream copies.

- [ ] **Step 1: Run syntax and automated regression checks**

Run the Node test command, extract the inline script and run `node --check`, and run `git diff --check`.

- [ ] **Step 2: Run browser interaction QA**

At desktop width verify:

- one marker per milestone;
- hover contains only planned and actual date;
- independent toggle, expand all, collapse all, and reload persistence;
- exact four-node headers;
- food selection opens the complete flow;
- add/edit/delete food and add/edit/delete campaign controls remain reachable;
- 2026/2027, search, status metrics, and hide completed still work;
- browser console has no errors.

- [ ] **Step 3: Run design QA against the approved A-layout structure**

Save `design-qa.md`, fix P0/P1/P2 issues, and require `final result: passed`. Keep the final report as the required build gate, but remove temporary screenshots after verification because this workspace is iCloud-synced.

- [ ] **Step 4: Sync the workstream mirror**

Copy the verified repo HTML to the workstream `categorylab.html`, then compare SHA-256 hashes.

- [ ] **Step 5: Push GitHub and deploy Tencent CloudBase**

Push `tencent-active`, deploy environment `louise-ai-d2gi63mlafa5599c4`, verify the online HTML contains the new expansion controls, and update `CATEGORY_LAB_DEPLOYMENT_LINKS.md` with the deployed commit.

- [ ] **Step 6: Final verification**

Confirm clean git status, no running verification sessions, no temporary artifacts, matching repo/workstream hashes, and the live URL:

```text
https://louise-ai-d2gi63mlafa5599c4-1434918374.tcloudbaseapp.com/decks/category-lab/categorylab
```
