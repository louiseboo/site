const APPROVED_NODES = Object.freeze({
  prototype: "原型开发",
  consumer: "众测",
  pilot: "中试"
});
const APPROVED_NODE_KEYS = Object.freeze(Object.keys(APPROVED_NODES));
const SHANGHAI_TIME_ZONE = "Asia/Shanghai";

function text(value) {
  return String(value ?? "").trim();
}

function dateValue(value) {
  const normalized = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function dateParts(value) {
  const normalized = dateValue(value);
  if (!normalized) return null;
  const [year, month, day] = normalized.split("-").map(Number);
  return { year, month, day };
}

function dateNumber(value) {
  const parts = dateParts(value);
  return parts ? Date.UTC(parts.year, parts.month - 1, parts.day) : NaN;
}

function dayDiff(left, right) {
  const leftTime = dateNumber(left);
  const rightTime = dateNumber(right);
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return NaN;
  return Math.round((leftTime - rightTime) / 86400000);
}

function addDays(value, days) {
  const timestamp = dateNumber(value);
  if (!Number.isFinite(timestamp)) return "";
  const date = new Date(timestamp + Number(days || 0) * 86400000);
  return date.toISOString().slice(0, 10);
}

function zonedPart(now, type) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: SHANGHAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false
  });
  return formatter.formatToParts(now).find(part => part.type === type)?.value || "";
}

function shanghaiDate(now = new Date()) {
  const year = zonedPart(now, "year");
  const month = zonedPart(now, "month");
  const day = zonedPart(now, "day");
  return year && month && day ? `${year}-${month}-${day}` : "";
}

function shanghaiHour(now = new Date()) {
  return Number(zonedPart(now, "hour"));
}

function shouldRunScheduledScan(now = new Date()) {
  return shanghaiHour(now) === 9;
}

function normalizeReminderSnapshot(snapshot = {}) {
  const sourceNodes = snapshot.nodes && typeof snapshot.nodes === "object" ? snapshot.nodes : {};
  const nodes = Object.fromEntries(APPROVED_NODE_KEYS.map(key => {
    const source = sourceNodes[key] || {};
    return [key, {
      key,
      label: APPROVED_NODES[key],
      plannedDate: dateValue(source.plannedDate),
      actualDate: dateValue(source.actualDate)
    }];
  }));
  return {
    id: text(snapshot.id || snapshot.campaignId),
    name: text(snapshot.name || snapshot.campaignName) || "未命名档期",
    launchDate: dateValue(snapshot.launchDate),
    activationDate: dateValue(snapshot.activationDate),
    active: snapshot.active !== false,
    nodes
  };
}

function reminderWindow(node = {}, today, activationDate = "") {
  const plannedDate = dateValue(node.plannedDate);
  const actualDate = dateValue(node.actualDate);
  const currentDate = dateValue(today);
  if (!plannedDate || !currentDate || actualDate) return null;
  const remainingDays = dayDiff(plannedDate, currentDate);
  if (!Number.isFinite(remainingDays) || remainingDays < 0 || remainingDays > 15) return null;
  const threshold = remainingDays <= 7 ? 7 : 15;
  const thresholdDate = addDays(plannedDate, -threshold);
  const activated = dateValue(activationDate);
  if (activated && thresholdDate < activated) return null;
  return { threshold, thresholdDate, remainingDays };
}

function buildReminderKey(campaign = {}, node = {}, threshold) {
  return `${text(campaign.id || campaign.campaignId)}:${text(node.key)}:T${Number(threshold)}:${dateValue(node.plannedDate)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildLaunchReminderMessage(reminder = {}, options = {}) {
  const campaign = reminder.campaign || {};
  const node = reminder.node || {};
  const threshold = Number(reminder.threshold);
  const remainingDays = Number(reminder.remainingDays);
  const recipients = Array.isArray(options.to) ? options.to.filter(Boolean) : [options.to].filter(Boolean);
  const categoryLabUrl = text(options.categoryLabUrl);
  const subject = `[Category Lab 档期提醒][T-${threshold}] ${text(campaign.name) || "未命名档期"} · ${text(node.label) || APPROVED_NODES[node.key] || "节点"}`;
  const lines = [
    `档期：${text(campaign.name) || "未命名档期"}`,
    `节点：${text(node.label) || APPROVED_NODES[node.key] || "节点"}`,
    `计划日期：${dateValue(node.plannedDate) || "未定"}`,
    `距离节点：${remainingDays} 天`,
    `上市日期：${dateValue(campaign.launchDate) || "未定"}`,
    categoryLabUrl ? `打开档期管理：${categoryLabUrl}` : ""
  ].filter(Boolean);
  const rows = lines.slice(0, 5).map(line => {
    const [label, ...value] = line.split("：");
    return `<tr><td style="padding:8px 10px;border-bottom:1px solid #e6e0d4;color:#7a7164;">${escapeHtml(label)}</td><td style="padding:8px 10px;border-bottom:1px solid #e6e0d4;color:#2b2620;font-weight:700;">${escapeHtml(value.join("："))}</td></tr>`;
  }).join("");
  return {
    from: text(options.from),
    to: recipients.join(", "),
    subject,
    text: lines.join("\n"),
    html: `<!doctype html><html lang="zh-CN"><body style="margin:0;padding:24px;background:#f7f4ee;font-family:'Microsoft YaHei',Arial,sans-serif;color:#2b2620;"><div style="max-width:640px;margin:0 auto;background:#fffdf8;border:1px solid #e1d8c8;"><div style="padding:22px 24px;border-bottom:1px solid #e6e0d4;"><div style="font-size:12px;color:#8a7f70;">CATEGORY LAB · T-${threshold} 节点提醒</div><h1 style="margin:7px 0 0;font-size:22px;">${escapeHtml(text(campaign.name) || "未命名档期")}</h1></div><div style="padding:14px 24px 24px;"><table role="presentation" style="width:100%;border-collapse:collapse;">${rows}</table>${categoryLabUrl ? `<p style="margin:20px 0 0;"><a href="${escapeHtml(categoryLabUrl)}" style="display:inline-block;padding:10px 16px;background:#2b2620;color:#fff;text-decoration:none;border-radius:4px;font-weight:700;">打开档期管理</a></p>` : ""}</div></div></body></html>`
  };
}

async function scanLaunchReminders(dependencies = {}) {
  const now = dependencies.now || new Date();
  const today = shanghaiDate(now);
  const snapshots = await dependencies.listSnapshots();
  const summary = { scanned: 0, due: 0, sent: 0, skipped: 0, failed: 0, errors: [] };
  for (const source of snapshots || []) {
    const campaign = normalizeReminderSnapshot(source);
    if (!campaign.id || !campaign.active) continue;
    summary.scanned += 1;
    for (const key of APPROVED_NODE_KEYS) {
      const node = campaign.nodes[key];
      const window = reminderWindow(node, today, campaign.activationDate);
      if (!window) continue;
      summary.due += 1;
      const deliveryKey = buildReminderKey(campaign, node, window.threshold);
      if (await dependencies.hasDelivery(deliveryKey)) {
        summary.skipped += 1;
        continue;
      }
      const reminder = { campaign, node, ...window };
      const message = buildLaunchReminderMessage(reminder, {
        from: dependencies.config.from,
        to: dependencies.config.recipients,
        categoryLabUrl: dependencies.config.categoryLabUrl
      });
      try {
        const result = await dependencies.send(message);
        await dependencies.recordDelivery({
          key: deliveryKey,
          campaignId: campaign.id,
          campaignName: campaign.name,
          nodeKey: node.key,
          nodeLabel: node.label,
          threshold: window.threshold,
          plannedDate: node.plannedDate,
          sentAt: now.toISOString(),
          recipients: dependencies.config.recipients,
          messageId: text(result?.messageId)
        });
        summary.sent += 1;
      } catch (error) {
        summary.failed += 1;
        const failure = {
          key: deliveryKey,
          campaignId: campaign.id,
          nodeKey: node.key,
          threshold: window.threshold,
          plannedDate: node.plannedDate,
          failedAt: now.toISOString(),
          error: text(error?.message || error).slice(0, 500)
        };
        summary.errors.push(failure);
        if (dependencies.recordFailure) await dependencies.recordFailure(failure);
      }
    }
  }
  return summary;
}

module.exports = {
  APPROVED_NODES,
  APPROVED_NODE_KEYS,
  SHANGHAI_TIME_ZONE,
  addDays,
  buildLaunchReminderMessage,
  buildReminderKey,
  dayDiff,
  normalizeReminderSnapshot,
  reminderWindow,
  scanLaunchReminders,
  shanghaiDate,
  shouldRunScheduledScan
};
