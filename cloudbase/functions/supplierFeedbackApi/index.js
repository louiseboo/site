const crypto = require("crypto");
const http = require("http");
const {
  attachmentFilename,
  buildNotificationMessage,
  sendNotification
} = require("./notification");

const COLLECTION = "supplier_feedback_records";
const IMAGE_LIMIT = 6;
const PUBLIC_ACTIONS = new Set([
  "ping",
  "submitSupplierFeedback"
]);
const CATEGORY_LAB_OWNER_ACCESS_DIGESTS = new Set([
  "2287a4cfed43e12623e7483ffdd5b9d580af1471d36c3df3f1295c4869d7bd78"
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
      "Access-Control-Allow-Headers": "Content-Type, X-CategoryLab-Admin-Code, X-CategoryLab-Access-Digest",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(body)
  };
}

function redirectResponse(location) {
  return {
    statusCode: 302,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Location": location
    },
    body: ""
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

function queryParams(event = {}) {
  const direct = event.queryStringParameters || event.query || {};
  if (direct && Object.keys(direct).length) return direct;
  const rawUrl = event.url || event.path || event.rawPath || "";
  try {
    return Object.fromEntries(new URL(rawUrl, "https://example.local").searchParams.entries());
  } catch (error) {
    return {};
  }
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
    campaign: nullableText(payload.campaign),
    version_change: nullableText(payload.version_change),
    finished_spec: nullableText(payload.finished_spec),
    length_mm: nullableText(payload.length_mm),
    width_mm: nullableText(payload.width_mm),
    height_mm: nullableText(payload.height_mm),
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

function sanitizePublicSubmissionPayload(payload = {}) {
  const normalized = normalizeRecordPayload(payload);
  delete normalized.quote_rmb;
  delete normalized.tasting_scene;
  delete normalized.tasting_feedback;
  delete normalized.round_conclusion;
  delete normalized.next_step_direction;
  delete normalized.key_blocker;
  delete normalized.campaign;
  return normalized;
}

function normalizeFeedbackPayload(payload = {}) {
  return {
    tasting_scene: nullableText(payload.tasting_scene),
    tasting_feedback: nullableText(payload.tasting_feedback),
    round_conclusion: nullableText(payload.round_conclusion),
    next_step_direction: nullableText(payload.next_step_direction)
  };
}

function normalizeAdminUpdatePayload(payload = {}) {
  const normalized = normalizeRecordPayload(payload);
  const patch = {};
  Object.keys(normalized).forEach(key => {
    if (Object.hasOwn(payload, key)) patch[key] = normalized[key];
  });
  if (Object.hasOwn(payload, "product_group_id")) {
    patch.product_group_id = nullableText(payload.product_group_id);
  }
  return patch;
}

function normalizeGroupingSupplier(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function validateProductGroupingRecords(records = []) {
  if (!records.length) throw new Error("没有可归组的产品记录。");
  const suppliers = new Set(records.map(record => normalizeGroupingSupplier(record.supplier_name)).filter(Boolean));
  if (suppliers.size !== 1 || records.some(record => !normalizeGroupingSupplier(record.supplier_name))) {
    throw new Error("只能合并同一供应商的产品记录。");
  }
  return true;
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

function publicSubmissionRecord(record = {}) {
  const {
    edit_token_hash,
    notification_status,
    notification_sent_at,
    notification_error,
    notification_test_sent_at,
    notification_test_error,
    ...safe
  } = record;
  return safe;
}

function notificationRecipients(value) {
  return String(value || "")
    .split(/[;,]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function notificationConfig(env = process.env) {
  const smtpUser = text(env.MAIL_SMTP_USER);
  return {
    enabled: String(env.MAIL_NOTIFY_ENABLED || "").toLowerCase() === "true",
    smtpUser,
    smtpPass: text(env.MAIL_SMTP_PASS),
    from: `Category Lab 产品信息通知 <${smtpUser}>`,
    testTo: notificationRecipients(env.MAIL_TEST_TO)[0] || "",
    notifyTo: notificationRecipients(env.MAIL_NOTIFY_TO),
    inboxUrl: text(env.MAIL_INBOX_URL)
  };
}

function isDirectInvocation(event = {}) {
  return !(
    event.httpMethod ||
    event.path ||
    event.url ||
    event.rawPath ||
    event.requestContext?.http?.method
  );
}

function isNotificationTestAuthorized(event = {}, body = {}, env = process.env) {
  if (isDirectInvocation(event)) return true;
  const expected = text(env.CATEGORYLAB_ADMIN_CODE);
  const provided = adminCodeFromEvent(event, body);
  return Boolean(expected && provided && hashToken(expected) === hashToken(provided));
}

function notificationError(error) {
  return String(error?.message || error || "邮件发送失败。")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 500);
}

async function downloadNotificationAttachments(app, record = {}) {
  const attachments = [];
  const images = Array.isArray(record.image_paths) ? record.image_paths.slice(0, IMAGE_LIMIT) : [];
  for (const [index, image] of images.entries()) {
    if (!image?.fileID) continue;
    try {
      const downloaded = await app.downloadFile({ fileID: image.fileID });
      const content = downloaded?.fileContent;
      if (!content) continue;
      attachments.push({
        filename: attachmentFilename(record, index),
        content: Buffer.isBuffer(content) ? content : Buffer.from(content),
        contentType: text(image.type) || "image/jpeg"
      });
    } catch (error) {
      // A broken image must not block the text notification or supplier submission.
    }
  }
  return attachments;
}

async function updateNotificationMetadata(collection, id, patch) {
  try {
    await collection.doc(id).update(patch);
  } catch (error) {
    return false;
  }
  return true;
}

async function notifyRecord(app, collection, record, recipients, dependencies = {}) {
  const config = dependencies.config || notificationConfig();
  const send = dependencies.send || sendNotification;
  const mode = dependencies.mode === "test" ? "test" : "automatic";
  const now = new Date().toISOString();

  try {
    if (!config.smtpUser) throw new Error("缺少 MAIL_SMTP_USER。");
    if (!config.smtpPass) throw new Error("缺少 MAIL_SMTP_PASS。");
    if (!Array.isArray(recipients) || !recipients.length) throw new Error("缺少邮件收件人。");
    const attachments = await downloadNotificationAttachments(app, record);
    const message = buildNotificationMessage(record, {
      from: config.from,
      to: recipients,
      inboxUrl: config.inboxUrl,
      attachments
    });
    const result = await send({
      smtpUser: config.smtpUser,
      smtpPass: config.smtpPass,
      message
    });
    const patch = mode === "test"
      ? {
          notification_test_sent_at: now,
          notification_test_error: null,
          updated_at: now
        }
      : {
          notification_status: "sent",
          notification_sent_at: now,
          notification_error: null,
          updated_at: now
        };
    await updateNotificationMetadata(collection, record.id, patch);
    return { ok: true, messageId: text(result?.messageId), attachments: attachments.length };
  } catch (error) {
    const message = notificationError(error);
    const patch = mode === "test"
      ? {
          notification_test_error: message,
          updated_at: now
        }
      : {
          notification_status: "failed",
          notification_error: message,
          updated_at: now
        };
    await updateNotificationMetadata(collection, record.id, patch);
    return { ok: false, error: message };
  }
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

async function tempUrlForFileID(app, fileID, maxAge = 60 * 60) {
  const id = text(fileID);
  if (!id || !id.startsWith("cloud://")) throw new Error("图片 fileID 不正确。");
  const urlResult = await app.getTempFileURL({
    fileList: [{ fileID: id, maxAge }]
  });
  const file = urlResult.fileList?.[0] || {};
  const url = file.tempFileURL || file.url || "";
  if (!url) throw new Error("图片临时链接生成失败。");
  return url;
}

async function refreshImageUrls(app, imagePaths = []) {
  if (!Array.isArray(imagePaths) || !imagePaths.length) return [];
  return Promise.all(imagePaths.map(async image => {
    if (!image?.fileID) return image;
    try {
      return {
        ...image,
        publicUrl: await tempUrlForFileID(app, image.fileID)
      };
    } catch (error) {
      return image;
    }
  }));
}

async function hydrateRecordImages(app, record = {}) {
  return {
    ...record,
    image_paths: await refreshImageUrls(app, record.image_paths)
  };
}

function adminCodeFromEvent(event = {}, body = {}) {
  const headers = event.headers || {};
  return text(
    body.adminCode ||
    headers["x-categorylab-admin-code"] ||
    headers["X-CategoryLab-Admin-Code"]
  );
}

function categoryLabAccessDigestFromEvent(event = {}, body = {}) {
  const headers = event.headers || {};
  return text(
    body.categoryLabAccessDigest ||
    headers["x-categorylab-access-digest"] ||
    headers["X-CategoryLab-Access-Digest"]
  );
}

function assertAdmin() {}

async function submitSupplierFeedback(app, collection, body) {
  const payload = sanitizePublicSubmissionPayload(body.payload);
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
  const mailConfig = notificationConfig();
  if (mailConfig.enabled) {
    await notifyRecord(app, collection, record, mailConfig.notifyTo, { config: mailConfig });
  }
  return { id, edit_token: editToken, record: publicSubmissionRecord(record) };
}

async function sendLatestNotificationTest(app, collection, event, body) {
  if (!isNotificationTestAuthorized(event, body)) throw new Error("测试邮件授权失败。");
  const config = notificationConfig();
  if (!config.testTo) throw new Error("缺少 MAIL_TEST_TO。");
  const result = await collection.orderBy("created_at", "desc").limit(1).get();
  const record = publicRecord(result.data?.[0] || {});
  if (!record.id) throw new Error("没有可用于测试邮件的产品记录。");
  const notification = await notifyRecord(app, collection, record, [config.testTo], {
    config,
    mode: "test"
  });
  if (!notification.ok) throw new Error(notification.error || "测试邮件发送失败。");
  return {
    recordId: record.id,
    productName: record.product_name,
    recipient: config.testTo,
    messageId: notification.messageId,
    attachments: notification.attachments
  };
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
  const records = await Promise.all((result.data || []).map(record => hydrateRecordImages(getApp(), publicRecord(record))));
  return { records };
}

async function adminUpdate(collection, event, body) {
  assertAdmin(event, body);
  const id = text(body.id);
  if (!id) throw new Error("缺少记录 ID。");
  const normalized = normalizeAdminUpdatePayload(body.payload || {});
  const payload = {
    ...normalized,
    updated_at: new Date().toISOString()
  };
  await collection.doc(id).update(payload);
  const updated = await collection.doc(id).get();
  const record = await hydrateRecordImages(getApp(), publicRecord(updated.data?.[0] || { id, ...payload }));
  return { record };
}

async function adminSetProductGroup(collection, event, body) {
  assertAdmin(event, body);
  const recordIds = [...new Set((Array.isArray(body.recordIds) ? body.recordIds : []).map(text).filter(Boolean))];
  if (!recordIds.length || recordIds.length > 100) throw new Error("产品归组记录数量必须在 1 到 100 条之间。");
  const snapshots = await Promise.all(recordIds.map(id => collection.doc(id).get()));
  const records = snapshots.map(result => result.data?.[0] || null);
  if (records.some(record => !record)) throw new Error("部分产品记录不存在，请刷新收件箱后重试。");
  validateProductGroupingRecords(records);
  const productGroupId = nullableText(body.productGroupId);
  const updatedAt = new Date().toISOString();
  await Promise.all(recordIds.map(id => collection.doc(id).update({
    product_group_id: productGroupId,
    updated_at: updatedAt
  })));
  const updatedSnapshots = await Promise.all(recordIds.map(id => collection.doc(id).get()));
  const updatedRecords = await Promise.all(updatedSnapshots.map((result, index) =>
    hydrateRecordImages(getApp(), publicRecord(result.data?.[0] || { id: recordIds[index], product_group_id: productGroupId, updated_at: updatedAt }))
  ));
  return { records: updatedRecords };
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
    const method = event.httpMethod || event.requestContext?.http?.method || "POST";
    const query = queryParams(event);
    if (method === "GET" && text(query.action) === "image") {
      const tempUrl = await tempUrlForFileID(getApp(), query.fileID || query.fileId);
      return redirectResponse(tempUrl);
    }

    const body = parseEventBody(event);
    const action = text(body.action);
    const directNotificationTest = action === "sendLatestNotificationTest";
    if (!PUBLIC_ACTIONS.has(action) && !action.startsWith("admin") && !directNotificationTest) {
      throw new Error("请求类型不支持。");
    }
    if (directNotificationTest && !isNotificationTestAuthorized(event, body)) {
      throw new Error("测试邮件授权失败。");
    }

    const app = getApp();
    const collection = app.database().collection(COLLECTION);
    let data;

    if (action === "ping") data = { ok: true };
    else if (directNotificationTest) data = await sendLatestNotificationTest(app, collection, event, body);
    else if (action === "submitSupplierFeedback") data = await submitSupplierFeedback(app, collection, body);
    else if (action === "adminLogin") {
      assertAdmin(event, body);
      data = { profile: { display_name: "Louise", role: "owner" } };
    } else if (action === "adminList") data = await adminList(collection, event, body);
    else if (action === "adminUpdate") data = await adminUpdate(collection, event, body);
    else if (action === "adminSetProductGroup") data = await adminSetProductGroup(collection, event, body);
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
      const query = Object.fromEntries(new URL(req.url, "http://localhost").searchParams.entries());
      const result = await handleEvent({
        httpMethod: req.method,
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8"),
        url: req.url,
        queryStringParameters: query
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
  normalizeAdminUpdatePayload,
  validateProductGroupingRecords,
  requireFields,
  databaseWriteRecord,
  sanitizePublicSubmissionPayload,
  publicSubmissionRecord,
  notificationConfig,
  isDirectInvocation,
  isNotificationTestAuthorized,
  downloadNotificationAttachments,
  notifyRecord,
  isPublicAction: action => PUBLIC_ACTIONS.has(action)
};
