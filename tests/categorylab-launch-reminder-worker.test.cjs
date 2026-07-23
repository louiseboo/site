const assert = require("node:assert/strict");
const test = require("node:test");

const { handleTimer } = require("../cloudbase/functions/categorylabLaunchReminderWorker/index")._private;

test("worker scans only during Shanghai 09:00", async () => {
  let scans = 0;
  const scan = async () => {
    scans += 1;
    return { scanned: 3, due: 1, sent: 1, skipped: 0, failed: 0, errors: [] };
  };

  const outside = await handleTimer({}, {
    now: new Date("2026-07-23T00:00:00.000Z"),
    scan
  });
  assert.equal(outside.scheduleSkipped, true);
  assert.equal(scans, 0);

  const scheduled = await handleTimer({}, {
    now: new Date("2026-07-23T01:00:00.000Z"),
    scan
  });
  assert.equal(scheduled.scheduleSkipped, false);
  assert.equal(scheduled.sent, 1);
  assert.equal(scans, 1);
});

test("worker surfaces scan failures for CloudBase retry and logs", async () => {
  await assert.rejects(
    () => handleTimer({}, {
      now: new Date("2026-07-23T01:00:00.000Z"),
      scan: async () => { throw new Error("smtp unavailable"); }
    }),
    /smtp unavailable/
  );
});
