const assert = require("node:assert/strict");
const test = require("node:test");

const api = require("../cloudbase/functions/supplierFeedbackApi/index");

class MemoryDoc {
  constructor(collection, id) {
    this.collection = collection;
    this.id = id;
  }

  async get() {
    const value = this.collection.records.get(this.id);
    return { data: value ? [{ ...value }] : [] };
  }

  async set(value) {
    this.collection.records.set(this.id, { _id: this.id, ...value });
    return { id: this.id };
  }

  async update(patch) {
    const current = this.collection.records.get(this.id) || { _id: this.id };
    this.collection.records.set(this.id, { ...current, ...patch });
    return { updated: 1 };
  }

  async remove() {
    this.collection.records.delete(this.id);
    return { deleted: 1 };
  }
}

class MemoryQuery {
  constructor(collection, query = {}) {
    this.collection = collection;
    this.query = query;
    this.limitValue = 1000;
  }

  limit(value) {
    this.limitValue = value;
    return this;
  }

  orderBy() {
    return this;
  }

  async get() {
    const data = [...this.collection.records.values()]
      .filter(record => Object.entries(this.query).every(([key, value]) => record[key] === value))
      .slice(0, this.limitValue)
      .map(record => ({ ...record }));
    return { data };
  }
}

class MemoryCollection extends MemoryQuery {
  constructor() {
    super(null, {});
    this.collection = this;
    this.records = new Map();
  }

  doc(id) {
    return new MemoryDoc(this, id);
  }

  where(query) {
    return new MemoryQuery(this, query);
  }
}

function memoryApp() {
  const collections = new Map();
  return {
    collections,
    database() {
      return {
        collection(name) {
          if (!collections.has(name)) collections.set(name, new MemoryCollection());
          return collections.get(name);
        }
      };
    }
  };
}

function httpEvent(body, token = "") {
  return {
    httpMethod: "POST",
    headers: token ? { "X-CategoryLab-Reminder-Token": token } : {},
    body: JSON.stringify(body)
  };
}

function responseBody(response) {
  return JSON.parse(response.body);
}

const env = {
  CATEGORYLAB_ADMIN_CODE: "test-admin-code",
  MAIL_SMTP_USER: "sender@example.com",
  MAIL_SMTP_PASS: "not-a-real-password",
  MAIL_TEST_TO: "louise.lu@peets.cn",
  MAIL_LAUNCH_REMINDER_TO: "louise.lu@peets.cn,chenkoli@peets.cn,pd_cw03@peets.cn",
  MAIL_CATEGORYLAB_URL: "https://example.com/categorylab"
};

test("enable exchanges admin authorization for a scoped token and stores only its hash", async () => {
  const app = memoryApp();
  const denied = await api._private.handleEvent(httpEvent({
    action: "enableLaunchReminders",
    adminCode: "wrong"
  }), { app, env, now: new Date("2026-07-23T01:00:00.000Z") });
  assert.equal(denied.statusCode, 400);

  const allowed = await api._private.handleEvent(httpEvent({
    action: "enableLaunchReminders",
    adminCode: "test-admin-code"
  }), { app, env, now: new Date("2026-07-23T01:00:00.000Z") });
  const payload = responseBody(allowed);
  assert.equal(allowed.statusCode, 200);
  assert.match(payload.data.token, /^[a-f0-9]{48}$/);
  assert.equal(payload.data.activationDate, "2026-07-23");

  const workspace = app.collections.get("categorylab_reminder_workspaces").records.get("categorylab-default");
  assert.ok(workspace.token_hash);
  assert.notEqual(workspace.token_hash, payload.data.token);
  assert.equal(JSON.stringify(workspace).includes(payload.data.token), false);
});

test("sync rejects a wrong token and stores only approved nodes", async () => {
  const app = memoryApp();
  const enabled = responseBody(await api._private.handleEvent(httpEvent({
    action: "enableLaunchReminders",
    adminCode: "test-admin-code"
  }), { app, env, now: new Date("2026-07-23T01:00:00.000Z") })).data;

  const snapshot = {
    id: "aug-osmanthus",
    name: "8月：桂花1",
    launchDate: "2026-08-06",
    nodes: {
      prototype: { plannedDate: "2026-07-31", actualDate: "" },
      consumer: { plannedDate: "2026-08-07", actualDate: "" },
      npc: { plannedDate: "2026-08-08", actualDate: "" },
      pilot: { plannedDate: "2026-08-14", actualDate: "" },
      mass: { plannedDate: "2026-08-20", actualDate: "" }
    }
  };
  const denied = await api._private.handleEvent(httpEvent({ action: "syncLaunchReminders", snapshots: [snapshot] }, "wrong"), { app, env });
  assert.equal(denied.statusCode, 400);

  const synced = await api._private.handleEvent(httpEvent({ action: "syncLaunchReminders", snapshots: [snapshot] }, enabled.token), {
    app,
    env,
    now: new Date("2026-07-23T01:05:00.000Z")
  });
  assert.equal(synced.statusCode, 200);
  assert.equal(responseBody(synced).data.synced, 1);
  const records = [...app.collections.get("categorylab_launch_reminders").records.values()];
  assert.equal(records.length, 1);
  assert.deepEqual(Object.keys(records[0].nodes), ["prototype", "consumer", "pilot"]);
  assert.equal(records[0].nodes.npc, undefined);
});

test("launch reminder test is direct-only and sends only to Louise", async () => {
  const app = memoryApp();
  const sent = [];
  const publicAttempt = await api._private.handleEvent(httpEvent({ action: "sendLaunchReminderTest" }), {
    app,
    env,
    sendLaunchEmail: async message => sent.push(message)
  });
  assert.equal(publicAttempt.statusCode, 400);

  const direct = await api._private.handleEvent({ action: "sendLaunchReminderTest" }, {
    app,
    env,
    now: new Date("2026-07-23T01:00:00.000Z"),
    sendLaunchEmail: async message => {
      sent.push(message);
      return { messageId: "louise-test-message" };
    }
  });
  const payload = responseBody(direct);
  assert.equal(direct.statusCode, 200);
  assert.equal(payload.data.recipient, "louise.lu@peets.cn");
  assert.equal(payload.data.messageId, "louise-test-message");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "louise.lu@peets.cn");
  assert.doesNotMatch(sent[0].to, /chenkoli|pd_cw03/);
});

test("timer events run only at Shanghai 09:00", async () => {
  const app = memoryApp();
  const skipped = await api._private.handleEvent({ Type: "Timer", TriggerName: "categorylabLaunchReminderHourly" }, {
    app,
    env,
    now: new Date("2026-07-23T02:00:00.000Z"),
    sendLaunchEmail: async () => { throw new Error("must not send"); }
  });
  assert.equal(responseBody(skipped).data.scheduleSkipped, true);

  const ran = await api._private.handleEvent({ Type: "Timer", TriggerName: "categorylabLaunchReminderHourly" }, {
    app,
    env,
    now: new Date("2026-07-23T01:00:00.000Z"),
    sendLaunchEmail: async () => ({ messageId: "unused" })
  });
  assert.equal(responseBody(ran).data.scheduleSkipped, false);
  assert.equal(responseBody(ran).data.scanned, 0);
});
