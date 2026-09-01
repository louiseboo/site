const assert = require("node:assert/strict");
const test = require("node:test");

const api = require("../cloudbase/functions/supplierFeedbackApi/index");

test("public supplier payload preserves valid submission batch metadata", () => {
  const payload = api._private.sanitizePublicSubmissionPayload({
    product_name: "产品 A",
    supplier_name: "供应商 A",
    submission_batch_id: "batch-20260901-a",
    batch_item_index: 2,
    quote_rmb: 88
  });

  assert.equal(payload.submission_batch_id, "batch-20260901-a");
  assert.equal(payload.batch_item_index, 2);
  assert.equal(payload.quote_rmb, undefined);
});

test("invalid batch indices normalize to null", () => {
  for (const value of [-1, 1.5, "not-a-number", ""]) {
    const payload = api._private.normalizeRecordPayload({ batch_item_index: value });
    assert.equal(payload.batch_item_index, null);
  }
});

test("admin update accepts batch metadata without affecting unrelated fields", () => {
  const patch = api._private.normalizeAdminUpdatePayload({
    submission_batch_id: "batch-backfill-a",
    batch_item_index: 0
  });

  assert.deepEqual(patch, {
    submission_batch_id: "batch-backfill-a",
    batch_item_index: 0
  });
});
