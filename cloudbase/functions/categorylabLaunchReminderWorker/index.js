const SHANGHAI_TIME_ZONE = "Asia/Shanghai";

function text(value) {
  return String(value ?? "").trim();
}

function shanghaiHour(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: SHANGHAI_TIME_ZONE,
    hour: "2-digit",
    hour12: false
  });
  return Number(formatter.formatToParts(now).find(part => part.type === "hour")?.value || "");
}

function shouldRun(now = new Date()) {
  return shanghaiHour(now) === 9;
}

async function invokeReminderScan(env = process.env, fetchImpl = globalThis.fetch) {
  const apiUrl = text(env.CATEGORYLAB_REMINDER_API_URL);
  const token = text(env.CATEGORYLAB_REMINDER_WORKER_TOKEN);
  if (!apiUrl) throw new Error("缺少 CATEGORYLAB_REMINDER_API_URL。");
  if (!token) throw new Error("缺少 CATEGORYLAB_REMINDER_WORKER_TOKEN。");
  if (typeof fetchImpl !== "function") throw new Error("当前运行环境不支持 fetch。");
  const response = await fetchImpl(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CategoryLab-Reminder-Worker-Token": token
    },
    body: JSON.stringify({ action: "runLaunchReminderScanFromWorker" })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error(result.error || `档期提醒扫描失败（${response.status}）`);
  return result.data || {};
}

async function handleTimer(event = {}, dependencies = {}) {
  const now = dependencies.now || new Date();
  if (!shouldRun(now)) {
    return { scheduleSkipped: true, reason: "outside-shanghai-09", checkedAt: now.toISOString() };
  }
  const scan = dependencies.scan || (() => invokeReminderScan(dependencies.env || process.env, dependencies.fetch));
  const summary = await scan(event);
  return { scheduleSkipped: false, checkedAt: now.toISOString(), ...summary };
}

exports.main = async event => handleTimer(event);

exports._private = {
  handleTimer,
  invokeReminderScan,
  shanghaiHour,
  shouldRun
};
