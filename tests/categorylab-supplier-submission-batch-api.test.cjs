const assert = require("node:assert/strict");
const test = require("node:test");

const api = require("../cloudbase/functions/supplierFeedbackApi/index");

function memorySupplierApp() {
  const records = new Map();
  const collection = {
    records,
    where(query) {
      return {
        limit() {
          return this;
        },
        async get() {
          return {
            data: [...records.values()].filter(record =>
              Object.entries(query).every(([key, value]) => record[key] === value)
            )
          };
        }
      };
    },
    doc(id) {
      return {
        async set(value) {
          records.set(id, { _id: id, ...value });
          return { id };
        }
      };
    }
  };

  return {
    collection,
    app: {
      database() {
        return {
          collection() {
            return collection;
          }
        };
      }
    }
  };
}

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

test("invalid submission batch IDs normalize to null without coercion", () => {
  for (const value of [null, undefined, "", "   ", 123, true, false, ["batch-a"], { id: "batch-a" }]) {
    const payload = api._private.normalizeRecordPayload({ submission_batch_id: value });
    assert.equal(payload.submission_batch_id, null);
  }
});

test("invalid batch indices normalize to null without coercion", () => {
  for (const value of [
    -1,
    1.5,
    "2",
    "not-a-number",
    "",
    true,
    false,
    [],
    {},
    Number.MAX_SAFE_INTEGER + 1,
    Infinity,
    NaN
  ]) {
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

test("public handleEvent persists batch metadata and strips supplier-forbidden fields", async () => {
  const { app, collection } = memorySupplierApp();
  const response = await api._private.handleEvent({
    httpMethod: "POST",
    body: JSON.stringify({
      action: "submitSupplierFeedback",
      payload: {
        product_name: "产品 A",
        supplier_name: "供应商 A",
        submission_batch_id: "batch-handle-event-a",
        batch_item_index: 1,
        quote_rmb: 88,
        tasting_scene: "内部试吃",
        tasting_feedback: "内部反馈",
        round_conclusion: "继续调整",
        next_step_direction: "调整甜度",
        key_blocker: "内部卡点",
        campaign_year: "2026",
        campaign: "秋季"
      }
    })
  }, { app });

  assert.equal(response.statusCode, 200);
  const result = JSON.parse(response.body);
  const stored = collection.records.get(result.data.id);
  assert.ok(stored);
  assert.equal(stored.submission_batch_id, "batch-handle-event-a");
  assert.equal(stored.batch_item_index, 1);

  for (const field of [
    "quote_rmb",
    "tasting_scene",
    "tasting_feedback",
    "round_conclusion",
    "next_step_direction",
    "key_blocker",
    "campaign_year",
    "campaign"
  ]) {
    assert.equal(Object.hasOwn(stored, field), false, `${field} must not be stored`);
  }
});
