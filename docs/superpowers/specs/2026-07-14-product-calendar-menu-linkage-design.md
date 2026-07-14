# Product Calendar And Menu Linkage Design

## Goal

Make launch schedule food records the single source for LTO items, while a compact product manager owns Core and Seasonal Core items. The Product Calendar must derive its selected-month menu and annual 1-12 month matrix automatically without asking for LTO launch or delist dates.

## Confirmed Rules

- Keep the existing 12-month Dashboard and month selection interaction.
- Remove `飞书产品日历 · 按月份查看档期、食品与菜单。`.
- A food entered under a launch schedule appears automatically in the corresponding Product Calendar month.
- A launch-linked food marked LTO is active for that schedule month only. Cross-month overlap is intentionally ignored.
- Core and Seasonal Core are maintained in Product Management with active/inactive state, price, and menu offer fields.
- The selected-month menu displays Bakery, Sandwich&Meal, Cake&Dessert, then CPG.
- Menu offer fields follow the supplied workbook: `早餐随心搭`, `正餐随心搭`, and `加价购`.
- The annual matrix shows categories on the left and months 1-12 horizontally. It is derived from the same product data rather than manually duplicated.
- Editing or deleting a launch food updates the month detail, selected-month menu, and annual matrix on the next render.

## Data Ownership

### LTO

LTO continues to live in `state.launchProjects`. Additional menu metadata is stored on the same launch-product object: `menuType`, `price`, `breakfastOffer`, `mealOffer`, and `addOnOffer`. Month ownership comes from its campaign.

### Core And Seasonal Core

A new local product-management collection stores stable menu products. Each record contains `id`, `name`, `group`, `category`, `menuType`, `price`, the three offer fields, and `active`. Initial 2026 records are seeded from the supplied `2026.6.3.xlsx` menu.

## Views

### Month Detail

The left panel continues to show the selected month and its launch foods. Launch-food edit/delete actions continue to use the launch product workflow.

### Selected-Month Menu

Replace the loose item cards with category sections containing compact menu rows. Each row shows product name, menu type, price, and the three offer positions. LTO rows link to launch-product editing; Core and Seasonal Core rows link to Product Management editing.

### Annual Matrix

Render a horizontally scrollable table with a sticky category column and 12 month columns. Each category/month cell lists the active Core and Seasonal Core products plus that month's LTO products.

### Product Management

Place Product Management below the annual matrix. It supports add, edit, active/inactive toggle, and delete for Core and Seasonal Core. Launch-linked LTO rows are visible as linked records and are edited from the launch schedule.

## Persistence And Compatibility

- Preserve existing launch-project data and all non-empty webpage edits.
- Introduce a versioned localStorage key for managed menu products.
- Do not overwrite saved managed products when default seed data changes.
- Retire the old editable SQ matrix from the rendered Product Calendar, but leave its stored data untouched for backward safety.

## Verification

- Browser tests confirm the removed subtitle, unchanged 12 month cards, LTO month linkage, menu ordering, 12-column annual matrix, and managed-product CRUD.
- Desktop and tablet screenshots confirm readable horizontal matrix scrolling and no overlapping controls.

