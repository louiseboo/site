# Supplier structure input and inbox clarity design

Date: 2026-09-02  
Scope: Category Lab supplier submission form and product information inbox

## Goal

Make supplier submissions easier to read and harder to enter incorrectly:

- visually separate a supplier/company submission from the products inside it;
- require one product-structure layer per row, entered from bottom to top;
- calculate each layer's percentage from its entered weight;
- preserve those layer breaks wherever the structure is reviewed;
- merge the two visible FY27 CNY sections into the single intended campaign.

## 1. Supplier and product visual blocks

The pending inbox keeps the existing submission-batch hierarchy and changes only its visual emphasis.

- The supplier/company header uses the existing warm side-panel color `#f3efe6`.
- Product rows use the lighter panel color `#fffdf8`.
- A small inset gap and border separate the product body from the supplier header.
- The active product keeps the existing dark left accent, so selection remains obvious.
- No new decorative color system or additional grouping level is introduced.

This creates two stable visual roles: the colored company bar identifies one submission, and the lighter rows below it identify the products in that submission.

## 2. Product-structure guidance and enforced input

The restriction applies only to the product-structure **description** input. Product name, selling points, version notes, and other text fields keep their current behavior. Weight inputs continue to accept digits and a decimal point.

The structure area displays a fixed instruction above the table:

> 填写顺序：从下到上。每一行只填一层；有下一层时，请点击“向上新增一层”。

Each row is labelled by its position:

- first row: `第1层｜最底层`;
- later rows: `第2层`, `第3层`, and so on.

The add button becomes `向上新增一层`, and the description placeholder becomes `只填这一层，如：饼干底`.

Allowed description characters are:

- Chinese Han characters;
- English letters `A-Z` and `a-z`;
- digits `0-9`.

Spaces, punctuation, emoji, slashes, brackets, percent signs, and other symbols are rejected. Full-width English letters and digits are normalized to their half-width forms before validation. Chinese IME composition is allowed to finish before validation so normal Chinese typing is not interrupted.

When an invalid character is typed or pasted:

1. the invalid character is not retained in the field;
2. the affected row shows the inline message `每一行只能填写一层。请点击“向上新增一层”继续填写。`;
3. the field remains focused so the supplier can continue without losing other input;
4. submission validation repeats the same rule, preventing bypass through paste or browser behavior.

## 3. Weight percentage

Add a read-only `占比` column immediately to the right of `重量(g)` and before the delete action.

- Percentage = current row weight / sum of all positive layer weights in the same product.
- Recalculate immediately whenever any layer weight changes, a layer is added, or a layer is deleted.
- Display at most one decimal place and remove an unnecessary trailing `.0`.
- If the row has no positive weight or the current total is zero, display `—`.
- The existing total-weight and finished-spec comparison remain unchanged.

The submitted `ingredients_structure` text is regenerated from the structured rows in bottom-to-top order. Each populated layer occupies one newline and includes its layer number, description, weight when present, and calculated percentage when available. The total weight remains on its own final line. Percentages are derived at submission time rather than accepted as supplier input.

Example:

```text
第1层｜最底层：饼干底 20g（20%）
第2层：芝士慕斯 60g（60%）
第3层：抹茶淋面 20g（20%）
自动计算总克重：100g
```

## 4. Review and confirmed display

Product-structure content is rendered with its stored newline boundaries in the inbox detail/review surface and in confirmed-product summaries wherever the structure is the displayed text. It must not be collapsed into one continuous browser line.

New submissions therefore show exactly one structure layer per visual line. Legacy records remain readable without destructive parsing: existing newline-separated content keeps its line breaks, while legacy single-line content is left unchanged rather than guessed into layers.

## 5. FY27 CNY root cause and correction

The live inbox currently contains two exact campaign strings for the same FY27 campaign:

- old alias: `01月｜CNY`;
- current standard: `01月｜CNY（含烘焙 / 三明治换新）`.

The inbox groups by the complete campaign string, so the alias creates a second visible section. Live inspection found two records carrying the old alias. Because those are the latest versions of two product groups, the separate header currently summarizes two products and five grouped version records.

The correction has two parts:

1. Add one campaign canonicalization rule for FY27: both strings resolve to `01月｜CNY（含烘焙 / 三明治换新）` for grouping, sorting, selection, and future saves.
2. Update only the two confirmed live records that still store the old alias to the standard value. No record is deleted, merged, or reassigned to a different year.

This makes the confirmed inbox show one FY27 CNY section while retaining all product/version history.

## 6. Testing and acceptance

Automated tests are written before production changes and must cover:

- supplier and product blocks have distinct semantic classes and palette roles;
- fixed bottom-to-top guidance, layer labels, and `向上新增一层` copy;
- allowed Chinese, English, and numeric input is retained;
- spaces and representative punctuation/symbols are rejected with the required message;
- Chinese IME composition is not filtered mid-composition;
- submit-time validation blocks invalid structure descriptions;
- percentages recalculate after editing, adding, and deleting layers;
- stored structure text is newline-separated and includes correct percentages;
- confirmed/review rendering preserves structure newlines;
- both FY27 CNY labels group under the standard campaign;
- all existing supplier form, inbox, batch, confirmation, image, and Category Lab import regression tests continue to pass.

Before deployment, verify both desktop and narrow/mobile widths. After deployment, read live data again and confirm:

- one FY27 CNY section is visible;
- the old alias count is zero and the standard campaign contains all prior records;
- the pending inbox shows distinct company and product color blocks;
- a non-destructive browser test demonstrates input rejection, percentage calculation, and line-broken review output without creating a real supplier submission.

## Rollback

The UI changes are contained in the supplier form and inbox HTML. Reverting those files restores the previous interaction. The CNY data correction changes only two campaign-name strings; rollback consists of restoring those two record IDs to the old alias if required. No records or images are deleted.
