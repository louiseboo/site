# Product Calendar And Menu Linkage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Link Product Calendar, launch foods, monthly menus, the annual matrix, and managed Core products through one shared data model.

**Architecture:** Launch products remain the source of truth for LTO and inherit their campaign month. A versioned managed-menu collection owns Core and Seasonal Core products. Rendering helpers merge both sources into monthly menus and a category-by-month matrix.

**Tech Stack:** Single-file HTML/CSS/JavaScript, browser localStorage, Node test runner, Playwright.

## Global Constraints

- Preserve the existing visual system, 12-month Dashboard, launch data, and webpage edits.
- LTO uses its campaign month and has no required launch/delist date fields.
- Menu ordering is Bakery, Sandwich&Meal, Cake&Dessert, CPG.
- Do not create old-file backups.

---

### Task 1: Lock The Linkage Contract With Browser Tests

**Files:**
- Create: `tests/categorylab-product-calendar-linkage.test.mjs`
- Test: `decks/category-lab/categorylab.html`

**Interfaces:**
- Consumes: Product Calendar tab and `window.productCalendarDecoratedPeriods()`.
- Produces: Regression coverage for month cards, LTO linkage, monthly menu, annual matrix, and product management.

- [ ] **Step 1: Write failing browser tests** for the removed subtitle, 12 month cards, selected-month LTO appearance, category ordering, 12 matrix month columns, and managed-product add/edit/delete controls.
- [ ] **Step 2: Run `node --test tests/categorylab-product-calendar-linkage.test.mjs`** and confirm failures are caused by the missing linked menu and matrix behavior.

### Task 2: Add Shared Menu Data And Rendering

**Files:**
- Modify: `decks/category-lab/categorylab.html`
- Test: `tests/categorylab-product-calendar-linkage.test.mjs`

**Interfaces:**
- Consumes: `state.launchProjects`, selected product calendar year/month, and managed menu products.
- Produces: `productCalendarMonthlyMenuItems(period)`, menu board HTML, annual matrix HTML, and product manager HTML.

- [ ] **Step 1: Add versioned managed-menu defaults and persistence** using the supplied workbook's Core and Seasonal Core records.
- [ ] **Step 2: Extend launch-product editing** with menu type, price, breakfast offer, meal offer, and add-on offer fields on the existing launch object.
- [ ] **Step 3: Merge launch LTO and managed products** for each month without cross-month date calculations.
- [ ] **Step 4: Replace the current menu cards and editable SQ matrix** with compact workbook-aligned menu rows and a sticky category-by-12-month matrix.
- [ ] **Step 5: Add Product Management CRUD and active-state controls** below the annual matrix.
- [ ] **Step 6: Run the focused browser test** and make it pass.

### Task 3: Verify, Sync, Publish

**Files:**
- Modify: `categorylab.html` in the Category Lab workstream mirror.

**Interfaces:**
- Consumes: Verified repository HTML.
- Produces: Matching local mirror, GitHub branch, and Tencent CloudBase deployment.

- [ ] **Step 1: Run all CategoryLab tests** with `node --test tests/*.test.mjs`.
- [ ] **Step 2: Capture desktop and tablet screenshots** and inspect menu/matrix readability and interactions.
- [ ] **Step 3: Copy the verified HTML to the workstream mirror** without creating a backup.
- [ ] **Step 4: Commit and push `tencent-active`**, then deploy the same commit to Tencent CloudBase.
- [ ] **Step 5: Verify the deployed URL** and confirm the live Product Calendar contains the linked data.

