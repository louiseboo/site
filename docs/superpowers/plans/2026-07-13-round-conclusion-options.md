# Round Conclusion Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add “通过且进入中试” and “通过且进入大生产” to the inbox and Category Lab round-conclusion controls without changing stored data.

**Architecture:** Extend the existing static option arrays in both HTML applications and the Category Lab normalization allowlist. Verify the exact option order with a temporary Node test outside the iCloud workspace, then sync and deploy the two HTML files.

**Tech Stack:** Static HTML, browser JavaScript, Node.js temporary regression test, Tencent CloudBase static hosting.

## Global Constraints

- Preserve all existing conclusion values and stored records.
- Use this order: `继续调整`, `暂停`, `通过且储备`, `通过且进入众测`, `通过且进入中试`, `通过且进入大生产`.
- Do not add database fields or modify supplier-facing forms.
- Remove temporary tests and deployment tooling before completion.

---

### Task 1: Extend Round Conclusion Options

**Files:**
- Modify: `decks/category-lab/supplier-submissions-admin.html`
- Modify: `decks/category-lab/categorylab.html`
- Test: `/tmp/categorylab-round-conclusion-options.test.cjs`

**Interfaces:**
- Consumes: existing `round_conclusion`, `roundConclusion`, and `normalizeTastingRoundConclusion` behavior.
- Produces: two additional selectable and normalized conclusion strings.

- [ ] **Step 1: Write the failing test**

```js
const expected = [
  "继续调整", "暂停", "通过且储备", "通过且进入众测",
  "通过且进入中试", "通过且进入大生产"
];
assertInboxOptions(expected);
assertCategoryLabSelectOptions(expected);
assertCategoryLabNormalizerOptions(expected);
```

- [ ] **Step 2: Verify the test fails because both new values are absent**

Run: `node --test /tmp/categorylab-round-conclusion-options.test.cjs`

Expected: FAIL showing the old four-value arrays.

- [ ] **Step 3: Extend all three option declarations**

Use the exact array:

```js
["继续调整", "暂停", "通过且储备", "通过且进入众测", "通过且进入中试", "通过且进入大生产"]
```

Add corresponding `<option>` elements to `#sensoryRoundConclusion` in the same order.

- [ ] **Step 4: Verify syntax and regression test**

Run:

```bash
node --test /tmp/categorylab-round-conclusion-options.test.cjs
node -e 'for (const file of ["decks/category-lab/supplier-submissions-admin.html","decks/category-lab/categorylab.html"]) { const html=require("fs").readFileSync(file,"utf8"); for (const script of html.matchAll(/<script(?:\\s[^>]*)?>([\\s\\S]*?)<\\/script>/gi)) if (script[1].trim()) new Function(script[1]); }'
git diff --check
```

Expected: test PASS, both HTML scripts parse, and diff check exits 0.

- [ ] **Step 5: Sync, commit, push, and deploy**

Copy `decks/category-lab/categorylab.html` to the 12-folder mirror `category lab.html`, commit both source files, push `tencent-active`, and deploy both HTML files to Tencent CloudBase static hosting.

- [ ] **Step 6: Verify live source and clean temporary files**

Fetch both deployed pages with a cache-busting query and assert both new strings are present. Remove `/tmp/categorylab-round-conclusion-options.test.cjs`, `/tmp/codex-cloudbase-cli`, and `/tmp/categorylab-cloudbase-static`.
