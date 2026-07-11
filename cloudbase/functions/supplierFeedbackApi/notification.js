const nodemailer = require("nodemailer");

function text(value, fallback = "-") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function cleanHeader(value, fallback = "-") {
  return text(value, fallback).replace(/[\r\n]+/g, " ");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlValue(value) {
  return escapeHtml(text(value)).replace(/\r?\n/g, "<br>");
}

function submittedAt(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return text(value);
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date).replace(/\//g, "-");
}

function safeFilename(value) {
  const normalized = text(value, "未命名产品")
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || "未命名产品";
}

function attachmentFilename(record, index) {
  return `${safeFilename(record?.product_name)}-产品照-${index + 1}.jpg`;
}

function detailRow(label, value) {
  return `
    <tr>
      <td style="width:150px;padding:10px 12px;border-bottom:1px solid #e6e0d4;color:#7a7164;font-size:13px;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e6e0d4;color:#2b2620;font-size:14px;line-height:1.65;vertical-align:top;">${htmlValue(value)}</td>
    </tr>`;
}

function buildNotificationMessage(record = {}, options = {}) {
  const from = cleanHeader(options.from, "Category Lab 产品信息通知");
  const to = Array.isArray(options.to)
    ? options.to.map(address => cleanHeader(address, "")).filter(Boolean).join(", ")
    : cleanHeader(options.to, "");
  const inboxUrl = String(options.inboxUrl || "").trim();
  const product = cleanHeader(record.product_name, "未命名产品");
  const version = cleanHeader(record.version_label, "未填版本");
  const supplier = cleanHeader(record.supplier_name, "未知供应商");
  const subject = `[Category Lab 新提交] ${product} · ${version} · ${supplier}`;
  const rows = [
    ["供应商", record.supplier_name],
    ["送样时间", record.sample_date],
    ["类型", record.product_type],
    ["测试类别", record.test_category],
    ["品名", record.product_name],
    ["版本", record.version_label],
    ["产品规格（g）", record.finished_spec],
    ["长度（mm）", record.length_mm],
    ["宽度（mm）", record.width_mm],
    ["高度（mm）", record.height_mm],
    ["本版调整点", record.version_change],
    ["核心原料及卖点", record.core_ingredients_selling_points],
    ["产品结构", record.ingredients_structure],
    ["提交时间", submittedAt(record.created_at)]
  ];
  const button = inboxUrl
    ? `<a href="${escapeHtml(inboxUrl)}" style="display:inline-block;padding:11px 18px;background:#2b2620;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:700;">打开产品信息收件箱</a>`
    : "";

  return {
    from,
    to,
    subject,
    html: `<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;padding:0;background:#f7f4ee;font-family:'Noto Sans SC','Microsoft YaHei',Arial,sans-serif;color:#2b2620;">
    <div style="max-width:720px;margin:0 auto;padding:32px 18px;">
      <div style="background:#fffdf8;border:1px solid #e1d8c8;">
        <div style="padding:26px 28px 20px;border-bottom:1px solid #e6e0d4;">
          <div style="margin-bottom:7px;color:#8a7f70;font-size:12px;letter-spacing:0;">CATEGORY LAB · 产品信息通知</div>
          <h1 style="margin:0 0 8px;font-family:'Noto Serif SC','Songti SC',serif;font-size:24px;line-height:1.35;color:#2b2620;">${escapeHtml(product)}</h1>
          <p style="margin:0;color:#6b6254;font-size:13px;line-height:1.6;">${escapeHtml(supplier)} · ${escapeHtml(version)} · ${escapeHtml(submittedAt(record.created_at))}</p>
        </div>
        <div style="padding:12px 28px 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
            ${rows.map(([label, value]) => detailRow(label, value)).join("")}
          </table>
          <div style="padding-top:22px;">${button}</div>
          <p style="margin:18px 0 0;color:#9a9081;font-size:12px;line-height:1.6;">产品照片已随邮件附上。本邮件由 Category Lab 自动发送，请在收件箱内完成后续整理。</p>
        </div>
      </div>
    </div>
  </body>
</html>`,
    attachments: Array.isArray(options.attachments) ? options.attachments : []
  };
}

async function sendNotification({ smtpUser, smtpPass, message }) {
  if (!String(smtpUser || "").trim()) throw new Error("缺少 MAIL_SMTP_USER。");
  if (!String(smtpPass || "").trim()) throw new Error("缺少 MAIL_SMTP_PASS。");
  if (!String(message?.to || "").trim()) throw new Error("缺少邮件收件人。");

  const transport = nodemailer.createTransport({
    host: "smtp.qq.com",
    port: 465,
    secure: true,
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  });
  return transport.sendMail(message);
}

module.exports = {
  attachmentFilename,
  buildNotificationMessage,
  escapeHtml,
  sendNotification,
  submittedAt
};
