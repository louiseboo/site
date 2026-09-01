# Supplier Submission Batch Inbox Design

Date: 2026-09-01  
Scope: Category Lab supplier form and the `待处理` view of the product information inbox

## Goal

Restore the context of one supplier form submission while products are first received and tested. Products submitted in one click must appear together and in the supplier's original entry order.

Batch context is temporary workflow context, not a new product archive hierarchy. Once a product is confirmed, it continues through the existing inbox classification, campaign, product, and version logic.

## Current Problem

The supplier form supports multiple product cards, but submits them to the backend one record at a time. Each record receives its own ID and timestamp. The inbox then groups records by supplier and product name and sorts by time, so products from one form submission are separated and may appear in reverse entry order.

Current production data confirms this pattern. The seven pending records on 2026-09-01 represent three submissions: two three-product submissions from 佰翔空厨 and one single-product submission from 百嘉宜.

## Approved Behavior

### Pending View

Only the `待处理` tab gains a submission-batch layer.

Each batch header shows:

- supplier name
- sample date
- submission time
- remaining pending product count

Expanding the batch shows every still-pending product in its original supplier entry order. Each product remains an independent record and opens the existing detail and product-manager editing surface.

Confirmation remains per product:

- confirming one product removes only that product from the pending batch
- the batch remains while other products are pending
- the batch disappears after its last product is confirmed
- after confirmation, the product appears in the existing confirmed workflow hierarchy

There is no batch-confirm action.

### Other Views

The following views keep their current behavior and hierarchy:

- `已确认`
- `已导入 Category Lab`
- `全部`

Campaign sorting, test-category grouping, product-type grouping, product grouping, version grouping, paused markers, search, import detection, and Category Lab writing behavior remain unchanged.

## Data Model

Add two additive fields to each supplier feedback record:

- `submission_batch_id`: stable ID shared by products submitted in one click
- `batch_item_index`: zero-based original product position in the form

The fields do not replace the existing record ID, follow-up code, product group ID, version label, status, or timestamps.

Records without a batch ID are treated as single-product batches. This makes the change backward compatible.

## Submission Flow

When the supplier clicks submit:

1. The browser creates one random batch ID before iterating over product cards.
2. Every product payload receives the same batch ID.
3. Each payload receives its array index as `batch_item_index`.
4. Products continue to be created as independent backend records.
5. Existing image upload and email-notification behavior remains unchanged.

A partial network failure may leave a partially created batch, matching the current per-product submission behavior. Successfully created products must remain visible; the change does not introduce an all-or-nothing transaction.

## Pending Inbox Rendering

For `statusFilter === "待处理"`:

1. Group pending records by `submission_batch_id`.
2. Treat records without a batch ID as singleton batches.
3. Sort batches by submission time descending.
4. Sort products inside each batch by `batch_item_index` ascending.
5. Fall back to `created_at` ascending when an index is absent.

The batch list does not modify or reuse the existing product/version grouping code. It is a separate rendering path used only by the pending tab.

When a confirmed record disappears from the active batch, selection moves to the next pending product in that batch; if none remains, it moves to the next batch.

## Existing Pending Records

Existing pending records will receive a one-time backfill before verification. Records may be assigned to the same batch only when all of these match:

- normalized supplier name
- sample date
- product type
- test category
- creation gap no greater than 15 seconds

Within an inferred batch, ascending creation time determines `batch_item_index`.

The backfill is limited to records that are still pending at deployment time. Confirmed history is not rewritten because batch grouping is not used after confirmation.

## Error Handling

- Missing batch metadata never hides a record; it renders as a singleton batch.
- Duplicate or invalid indices fall back to creation-time order.
- Confirm and save failures preserve the current product and batch selection and show the existing error message.
- Batch metadata is not supplier-visible and requires no additional form input.

## Verification

Automated and live checks must cover:

1. A three-product form submission creates three records with one batch ID and indices 0, 1, and 2.
2. The pending tab renders one batch and preserves product entry order.
3. Confirming one product removes only that product and updates the remaining count.
4. Confirming the final product removes the batch.
5. Confirmed, imported, and all views retain their existing hierarchy and sorting.
6. A legacy record without batch metadata remains visible as a singleton batch.
7. Existing seven pending records are shown as three batches after backfill.
8. Supplier submission, image upload, notification email, record editing, confirmation, deletion, and Category Lab import continue to work.

## Rollback

The new fields are additive and ignored by the previous frontend. Rolling back the supplier form and inbox code restores the previous display without deleting or transforming product records.
