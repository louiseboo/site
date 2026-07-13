# Round Conclusion and Version Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two conclusions and derive a separate, sequence-aware version-stage label in the inbox before passing it to Category Lab.

**Architecture:** Add pure helpers to the inbox for normalized product identity, version ordering, prior-stage detection, and current stage derivation. Persist only the existing feedback fields in CloudBase; compute the stage in the inbox and copy it into Category Lab local data as `versionStage`. Category Lab preserves, displays, exports, and recalculates the stage when a record moves into a later milestone.

**Tech Stack:** Static HTML, browser JavaScript, Node.js temporary regression tests, Tencent CloudBase static hosting.

## Global Constraints

- Keep `V1 / V2 / V3` unchanged as the sampling version number.
- Add these conclusions in order after “通过且进入众测”: “通过且进入中试”, “通过且进入大生产”.
- Do not show an optimization-stage label unless an earlier version of the same supplier and normalized product name contains the required passed milestone.
- A current milestone conclusion overrides the current feedback-scene optimization label.
- Preserve existing records and database fields.
- Remove temporary tests and deployment tooling before completion.

---

### Task 1: Inbox Conclusion and Stage Derivation

**Files:**
- Modify: `decks/category-lab/supplier-submissions-admin.html`
- Test: `/tmp/categorylab-version-stage.test.cjs`

**Interfaces:**
- Produces: `productIdentity(row)`, `compareRecordSequence(a, b)`, `deriveVersionStage(row, allRecords)`.
- Stage output: `"" | "众测版" | "众测优化版" | "中试版" | "中试优化版" | "大生产版" | "大生产优化版"`.

- [ ] **Step 1: Write a failing temporary test** covering the two new options, same-product matching, milestone labels, required prior milestones for optimization labels, and conclusion priority.
- [ ] **Step 2: Run `node --test /tmp/categorylab-version-stage.test.cjs`** and confirm failure because the helpers and options are absent.
- [ ] **Step 3: Implement the pure helpers** with exact matching on normalized supplier and product name, numeric V ordering with submission-time fallback, and the six stage outputs.
- [ ] **Step 4: Display the stage** in the list metadata, detail metadata, supplier facts, right metadata, and a live preview under the round-conclusion control.
- [ ] **Step 5: Extend both conclusion arrays** to `继续调整 / 暂停 / 通过且储备 / 通过且进入众测 / 通过且进入中试 / 通过且进入大生产`.
- [ ] **Step 6: Add `versionStage: deriveVersionStage(row, records)`** to `categoryLabRecord(row)` without changing `version`.
- [ ] **Step 7: Run the temporary test and inline-script syntax check** and require all assertions to pass.

### Task 2: Category Lab Stage Preservation and Display

**Files:**
- Modify: `decks/category-lab/categorylab.html`
- Test: `/tmp/categorylab-version-stage.test.cjs`

**Interfaces:**
- Consumes: imported `record.versionStage` and existing `record.version`, `record.feedbackSource`, `record.roundConclusion`.
- Produces: preserved `versionStage` in local state, OEM list/detail display, and CSV column.

- [ ] **Step 1: Extend `#sensoryRoundConclusion` and `normalizeTastingRoundConclusion`** with the two new conclusions.
- [ ] **Step 2: Add `versionStageFromConclusion(roundConclusion)`** for the three milestone labels and preserve an imported optimization label when no later milestone conclusion overrides it.
- [ ] **Step 3: Update `migrateDevRecord` and sensory save** so `versionStage` survives reload and recalculates when the record enters a later milestone.
- [ ] **Step 4: Display `V数字 · 版本阶段`** in the OEM record table and add “版本阶段” to record details.
- [ ] **Step 5: Add “版本阶段” immediately after “版本”** in the development CSV header and row values.
- [ ] **Step 6: Run the shared test, parse both HTML scripts, and run `git diff --check`** with zero failures.

### Task 3: Sync and Deploy

**Files:**
- Sync: `decks/category-lab/categorylab.html` to the 12-folder mirror `category lab.html`.
- Deploy: `supplier-submissions-admin.html` and `categorylab.html`.

- [ ] **Step 1: Commit the two HTML changes** on `tencent-active`.
- [ ] **Step 2: Push all pending commits** to `origin/tencent-active`.
- [ ] **Step 3: Deploy both HTML files** to Tencent CloudBase environment `louise-ai-d2gi63mlafa5599c4`.
- [ ] **Step 4: Fetch both live pages with cache-busting queries** and verify both new conclusions plus the version-stage helpers/display markers are present.
- [ ] **Step 5: Remove `/tmp/categorylab-version-stage.test.cjs`, `/tmp/codex-cloudbase-cli`, and `/tmp/categorylab-cloudbase-static`** and confirm a clean worktree.
