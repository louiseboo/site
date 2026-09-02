import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../decks/category-lab/supplier-submit.html", import.meta.url), "utf8");

test("supplier form creates one batch id before mapping products", () => {
  assert.match(source, /const submissionBatchId = rowId\(\);\s*const payloads = products\.map/);
});

test("supplier form stamps the shared id and zero-based product index", () => {
  assert.match(source, /submission_batch_id:\s*batchMetadata\.submissionBatchId/);
  assert.match(source, /batch_item_index:[^\n]*batchMetadata\.batchItemIndex/);
  assert.match(source, /submissionBatchId,\s*batchItemIndex:\s*index/);
});

test("fallback image update keeps the original batch metadata", () => {
  assert.match(source, /productPayload\(item\.product, images, item\.batchMetadata\)/);
});
