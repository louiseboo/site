const assert = require("node:assert/strict");
const test = require("node:test");

const {
  APPROVED_NODE_KEYS,
  buildLaunchReminderMessage,
  buildReminderKey,
  normalizeReminderSnapshot,
  reminderWindow,
  scanLaunchReminders,
  shanghaiDate,
  shouldRunScheduledScan
} = require("../cloudbase/functions/supplierFeedbackApi/launch-reminders");

const CAMPAIGN = {
  id: "fy26-aug-osmanthus",
  name: "8月：桂花1",
  launchDate: "2026-08-06",
  activationDate: "2026-07-01",
  nodes: {
    prototype: { plannedDate: "2026-07-31", actualDate: "" },
    consumer: { plannedDate: "2026-08-07", actualDate: "" },
    npc: { plannedDate: "2026-08-08", actualDate: "" },
    pilot: { plannedDate: "2026-08-14", actualDate: "" },
    mass: { plannedDate: "2026-08-20", actualDate: "" }
  }
};

test("normalizes only the three approved reminder nodes", () => {
  const normalized = normalizeReminderSnapshot(CAMPAIGN);
  assert.deepEqual(APPROVED_NODE_KEYS, ["prototype", "consumer", "pilot"]);
  assert.deepEqual(Object.keys(normalized.nodes), APPROVED_NODE_KEYS);
  assert.equal(normalized.nodes.npc, undefined);
  assert.equal(normalized.nodes.mass, undefined);
});

test("selects T-15 and T-7 windows and skips completed or overdue nodes", () => {
  const base = { plannedDate: "2026-08-20", actualDate: "" };
  assert.equal(reminderWindow(base, "2026-08-05", "2026-07-01").threshold, 15);
  assert.equal(reminderWindow(base, "2026-08-13", "2026-07-01").threshold, 7);
  assert.equal(reminderWindow({ ...base, actualDate: "2026-08-01" }, "2026-08-05", "2026-07-01"), null);
  assert.equal(reminderWindow(base, "2026-08-21", "2026-07-01"), null);
});

test("does not backfill thresholds that passed before activation", () => {
  const node = { plannedDate: "2026-08-20", actualDate: "" };
  assert.equal(reminderWindow(node, "2026-08-10", "2026-08-10"), null);
  assert.equal(reminderWindow(node, "2026-08-13", "2026-08-10").threshold, 7);
  assert.equal(reminderWindow(node, "2026-08-15", "2026-08-15"), null);
});

test("dedupe key changes when the planned date changes", () => {
  const first = buildReminderKey(CAMPAIGN, { key: "consumer", plannedDate: "2026-08-07" }, 15);
  const moved = buildReminderKey(CAMPAIGN, { key: "consumer", plannedDate: "2026-08-09" }, 15);
  assert.notEqual(first, moved);
  assert.match(first, /fy26-aug-osmanthus:consumer:T15:2026-08-07/);
});

test("renders a concise Louise-only test message", () => {
  const message = buildLaunchReminderMessage({
    campaign: CAMPAIGN,
    node: { key: "consumer", label: "众测", plannedDate: "2026-08-07" },
    threshold: 15,
    remainingDays: 15
  }, {
    from: "Category Lab 档期提醒 <sender@example.com>",
    to: ["louise.lu@peets.cn"],
    categoryLabUrl: "https://example.com/categorylab"
  });
  assert.equal(message.to, "louise.lu@peets.cn");
  assert.equal(message.subject, "[Category Lab 档期提醒][T-15] 8月：桂花1 · 众测");
  assert.match(message.text, /计划日期：2026-08-07/);
  assert.match(message.text, /距离节点：15 天/);
  assert.doesNotMatch(message.text, /chenkoli|pd_cw03/);
});

test("scanner sends once and records delivery only after success", async () => {
  const sent = [];
  const recorded = [];
  const existing = new Set();
  const snapshots = [{
    ...CAMPAIGN,
    nodes: {
      prototype: { plannedDate: "2026-08-20", actualDate: "" },
      consumer: { plannedDate: "2026-09-01", actualDate: "" },
      pilot: { plannedDate: "2026-09-15", actualDate: "" }
    }
  }];
  const dependencies = {
    now: new Date("2026-08-05T01:00:00.000Z"),
    listSnapshots: async () => snapshots,
    hasDelivery: async key => existing.has(key),
    recordDelivery: async delivery => {
      existing.add(delivery.key);
      recorded.push(delivery);
    },
    send: async message => {
      sent.push(message);
      return { messageId: "test-message-id" };
    },
    config: {
      from: "Category Lab 档期提醒 <sender@example.com>",
      recipients: ["louise.lu@peets.cn"],
      categoryLabUrl: "https://example.com/categorylab"
    }
  };

  const first = await scanLaunchReminders(dependencies);
  const second = await scanLaunchReminders(dependencies);
  assert.equal(first.sent, 1);
  assert.equal(second.sent, 0);
  assert.equal(sent.length, 1);
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].messageId, "test-message-id");
});

test("scheduled scan is gated to Shanghai 09:00", () => {
  assert.equal(shanghaiDate(new Date("2026-07-23T01:00:00.000Z")), "2026-07-23");
  assert.equal(shouldRunScheduledScan(new Date("2026-07-23T01:00:00.000Z")), true);
  assert.equal(shouldRunScheduledScan(new Date("2026-07-23T02:00:00.000Z")), false);
});
