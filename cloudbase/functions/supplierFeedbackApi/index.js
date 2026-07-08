const crypto = require("crypto");
const http = require("http");

const COLLECTION = "supplier_feedback_records";
const IMAGE_LIMIT = 6;
const PUBLIC_ACTIONS = new Set([
  "ping",
  "submitSupplierFeedback",
  "getSupplierFeedbackByFollowupCode",
  "completeSupplierFeedback"
]);

let cachedApp;

function getApp() {
  if (cachedApp) return cachedApp;
  const cloudbase = require("@cloudbase/node-sdk");
  cachedApp = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
  return cachedApp;
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, X-CategoryLab-Admin-Code",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(body)
  };
}

function parseEventBody(event = {}) {
  if (!event.body) return event || {};
  if (typeof event.body === "object") return event.body;
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  return raw ? JSON.parse(raw) : {};
}

function text(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed || "";
}

function nullableText(value) {
  const trimmed = text(value);
  return trimmed || null;
}

function quoteToNumber(value) {
  const cleaned = String(value ?? "").replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRecordPayload(payload = {}) {
  return {
    product_name: text(payload.product_name),
    supplier_name: text(payload.supplier_name),
    version_label: nullableText(payload.version_label),
    sample_date: nullableText(payload.sample_date),
    product_type: nullableText(payload.product_type),
    test_category: nullableText(payload.test_category),
    version_change: nullableText(payload.version_change),
    finished_spec: nullableText(payload.finished_spec),
    ingredients_structure: nullableText(payload.ingredients_structure),
    image_paths: Array.isArray(payload.image_paths) ? payload.image_paths : [],
    quote_rmb: quoteToNumber(payload.quote_rmb),
    core_ingredients_selling_points: nullableText(payload.core_ingredients_selling_points),
    tasting_scene: nullableText(payload.tasting_scene),
    tasting_feedback: nullableText(payload.tasting_feedback),
    round_conclusion: nullableText(payload.round_conclusion),
    next_step_direction: nullableText(payload.next_step_direction),
    key_blocker: nullableText(payload.key_blocker),
    status: ["待处理", "已确认"].includes(payload.status) ? payload.status : "待处理"
  };
}

function normalizeFeedbackPayload(payload = {}) {
  return {
    tasting_scene: nullableText(payload.tasting_scene),
    tasting_feedback: nullableText(payload.tasting_feedback),
    round_conclusion: nullableText(payload.round_conclusion),
    next_step_direction: nullableText(payload.next_step_direction)
  };
}

function requireFields(payload, names) {
  const missing = names.filter(name => !text(payload[name]));
  if (missing.length) {
    throw new Error(`缺少必填字段：${missing.join(", ")}`);
  }
}

function makeFollowupCode() {
  return `P${crypto.randomBytes(4).toString("hex").slice(0, 7)}`.toUpperCase();
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function publicRecord(record = {}) {
  const { edit_token_hash, ...safe } = record;
  return safe;
}

function databaseWriteRecord(record = {}) {
  const { _id, ...safe } = record;
  return safe;
}

function dataUrlToBuffer(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error("图片数据格式不正确。");
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64")
  };
}

async function generateUniqueFollowupCode(collection) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = makeFollowupCode();
    const existing = await collection.where({ followup_code: code }).limit(1).get();
    if (!existing.data?.length) return code;
  }
  throw new Error("提交编号生成失败，请重试。");
}

async function uploadImages(app, recordId, images = []) {
  const uploaded = [];
  for (const [index, image] of images.slice(0, IMAGE_LIMIT).entries()) {
    if (!image?.dataUrl) continue;
    const { buffer, mimeType } = dataUrlToBuffer(image.dataUrl);
    const suffix = mimeType.includes("png") ? "png" : "jpg";
    const cloudPath = `supplier-feedback/${recordId}/${Date.now()}-${index + 1}.${suffix}`;
    const uploadResult = await app.uploadFile({
      cloudPath,
      fileContent: buffer
    });
    const fileID = uploadResult.fileID;
    let publicUrl = "";
    if (fileID) {
      const urlResult = await app.getTempFileURL({
        fileList: [{ fileID, maxAge: 60 * 60 * 24 * 365 }]
      });
      publicUrl = urlResult.fileList?.[0]?.tempFileURL || "";
    }
    uploaded.push({
      path: cloudPath,
      fileID,
      publicUrl,
      name: text(image.name) || `产品照 ${index + 1}`,
      type: mimeType,
      size: buffer.length
    });
  }
  return uploaded;
}

function adminCodeFromEvent(event = {}, body = {}) {
  const headers = event.headers || {};
  return text(
    body.adminCode ||
    headers["x-categorylab-admin-code"] ||
    headers["X-CategoryLab-Admin-Code"]
  );
}

function assertAdmin(event, body) {
  const expected = process.env.CATEGORYLAB_ADMIN_CODE;
  if (!expected) throw new Error("后台访问码尚未配置。");
  if (adminCodeFromEvent(event, body) !== expected) {
    throw new Error("访问码不正确。");
  }
}

async function submitSupplierFeedback(app, collection, body) {
  const payload = normalizeRecordPayload(body.payload);
  requireFields(payload, ["product_name", "supplier_name"]);

  const id = crypto.randomUUID();
  const editToken = crypto.randomBytes(24).toString("hex");
  const now = new Date().toISOString();
  const followupCode = await generateUniqueFollowupCode(collection);
  const imagePaths = await uploadImages(app, id, body.images || []);
  const record = {
    ...payload,
    _id: id,
    id,
    edit_token_hash: hashToken(editToken),
    followup_code: followupCode,
    image_paths: imagePaths,
    status: "待处理",
    created_at: now,
    updated_at: now
  };
  await collection.doc(id).set(databaseWriteRecord(record));
  return { id, edit_token: editToken, record: publicRecord(record) };
}

async function getByFollowupCode(collection, code) {
  const normalized = text(code).toUpperCase();
  if (!normalized) throw new Error("请填写提交编号。");
  const result = await collection.where({ followup_code: normalized }).limit(1).get();
  const record = result.data?.[0];
  if (!record) throw new Error("提交编号不存在，请检查第一段提交成功后显示的编号。");
  return publicRecord(record);
}

async function completeSupplierFeedback(collection, body) {
  const record = await getByFollowupCode(collection, body.followupCode);
  const patch = {
    ...normalizeFeedbackPayload(body.payload),
    updated_at: new Date().toISOString()
  };
  await collection.doc(record.id).update(patch);
  return publicRecord({ ...record, ...patch });
}

async function adminList(collection, event, body) {
  assertAdmin(event, body);
  const result = await collection.orderBy("created_at", "desc").limit(1000).get();
  return { records: (result.data || []).map(publicRecord) };
}

async function adminUpdate(collection, event, body) {
  assertAdmin(event, body);
  const id = text(body.id);
  if (!id) throw new Error("缺少记录 ID。");
  const normalized = normalizeRecordPayload(body.payload);
  if (!Object.hasOwn(body.payload || {}, "image_paths")) delete normalized.image_paths;
  const payload = {
    ...normalized,
    ...normalizeFeedbackPayload(body.payload),
    updated_at: new Date().toISOString()
  };
  await collection.doc(id).update(payload);
  const updated = await collection.doc(id).get();
  return { record: publicRecord(updated.data?.[0] || { id, ...payload }) };
}

async function adminDelete(collection, event, body) {
  assertAdmin(event, body);
  const id = text(body.id);
  if (!id) throw new Error("缺少记录 ID。");
  await collection.doc(id).remove();
  return { ok: true };
}

async function handleEvent(event = {}) {
  if (event.httpMethod === "OPTIONS" || event.requestContext?.http?.method === "OPTIONS") {
    return jsonResponse(204, {});
  }

  try {
    const body = parseEventBody(event);
    const action = text(body.action);
    if (!PUBLIC_ACTIONS.has(action) && !action.startsWith("admin")) {
      throw new Error("请求类型不支持。");
    }

    const app = getApp();
    const collection = app.database().collection(COLLECTION);
    let data;

    if (action === "ping") data = { ok: true };
    else if (action === "submitSupplierFeedback") data = await submitSupplierFeedback(app, collection, body);
    else if (action === "getSupplierFeedbackByFollowupCode") data = await getByFollowupCode(collection, body.followupCode);
    else if (action === "completeSupplierFeedback") data = await completeSupplierFeedback(collection, body);
    else if (action === "adminLogin") {
      assertAdmin(event, body);
      data = { profile: { display_name: "Louise", role: "owner" } };
    } else if (action === "adminList") data = await adminList(collection, event, body);
    else if (action === "adminUpdate") data = await adminUpdate(collection, event, body);
    else if (action === "adminDelete") data = await adminDelete(collection, event, body);

    return jsonResponse(200, { ok: true, data });
  } catch (error) {
    return jsonResponse(400, {
      ok: false,
      error: error.message || "请求失败。"
    });
  }
}

function startServer() {
  const port = Number(process.env.PORT || 9000);
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", async () => {
      const result = await handleEvent({
        httpMethod: req.method,
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8")
      });
      res.writeHead(result.statusCode, result.headers);
      res.end(result.body || "");
    });
  });
  server.listen(port, "0.0.0.0");
}

if (require.main === module) startServer();

exports.main = handleEvent;

exports._private = {
  makeFollowupCode,
  parseEventBody,
  normalizeRecordPayload,
  requireFields,
  databaseWriteRecord
};
