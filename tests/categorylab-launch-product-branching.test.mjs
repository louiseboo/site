import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const categoryLabPath = "/decks/category-lab/categorylab.html";

let server;
let browser;
let page;
let baseUrl;

function contentType(pathname) {
  return {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml"
  }[extname(pathname)] || "application/octet-stream";
}

async function openLaunchPage() {
  await page.goto(`${baseUrl}${categoryLabPath}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "My Calendar 档期产品开发", exact: true }).click();
  await page.locator("#launch.active").waitFor();
  await page.locator("#launchTimelineBoard .timeline-project-info").first().waitFor();
}

test.before(async () => {
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
      const relativePath = normalize(pathname).replace(/^[/\\]+/, "");
      const filePath = join(repoRoot, relativePath || "index.html");
      if (!filePath.startsWith(repoRoot)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const body = await readFile(filePath);
      response.writeHead(200, { "content-type": contentType(filePath) });
      response.end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await openLaunchPage();
});

test.after(async () => {
  await browser?.close();
  await new Promise(resolveClose => server?.close(resolveClose));
});

test("timeline uses one marker per campaign milestone", async () => {
  const duplicateKeys = await page.locator(".timeline-track-cell").evaluateAll(cells =>
    cells.flatMap((cell, rowIndex) => {
      const counts = {};
      cell.querySelectorAll("[data-milestone-key]").forEach(node => {
        const key = node.getAttribute("data-milestone-key");
        counts[key] = (counts[key] || 0) + 1;
      });
      return Object.entries(counts)
        .filter(([, count]) => count > 1)
        .map(([key, count]) => ({ rowIndex, key, count }));
    })
  );

  assert.deepEqual(duplicateKeys, []);

  const laneErrors = await page.locator(".timeline-track-cell").evaluateAll(cells =>
    cells.flatMap((cell, rowIndex) =>
      Array.from(cell.querySelectorAll("[data-milestone-key]")).flatMap(node => {
        const actualDate = node.getAttribute("data-actual-date") || "";
        const expectedActualLane = Boolean(actualDate);
        const onActualLane = node.classList.contains("actual");
        return expectedActualLane === onActualLane
          ? []
          : [{ rowIndex, key: node.getAttribute("data-milestone-key"), actualDate, onActualLane }];
      })
    )
  );
  assert.deepEqual(laneErrors, []);
});

test("timeline campaign summaries do not list food names", async () => {
  const summaries = await page.locator(".timeline-project-info").allTextContents();
  assert.ok(summaries.length > 0);
  assert.ok(summaries.every(summary => /\d+\s*个食品/.test(summary)));
  assert.ok(summaries.every(summary => !summary.includes("蓝莓轻芝士慕斯蛋糕")));
});

test("campaign product centers expand independently and persist", async () => {
  assert.equal(await page.locator("[data-launch-expand-all]").count(), 1);
  assert.equal(await page.locator("[data-launch-collapse-all]").count(), 1);

  const toggles = page.locator("[data-launch-campaign-toggle]");
  const campaignCount = await toggles.count();
  assert.ok(campaignCount > 1);

  const tables = page.locator(".launch-product-overview");
  assert.ok(await tables.count() > 0);
  const headerRows = await tables.locator("thead tr").allTextContents();
  assert.ok(headerRows.every(row => row.replace(/\s+/g, "") === "食品众测NPC中试大生产"));

  await page.locator("[data-launch-collapse-all]").click();
  assert.equal(await page.locator("[data-launch-campaign-products]:visible").count(), 0);

  const firstToggle = toggles.first();
  const firstCampaignId = await firstToggle.getAttribute("data-launch-campaign-toggle");
  await firstToggle.click();
  assert.equal(await page.locator("[data-launch-campaign-products]:visible").count(), 1);

  await openLaunchPage();
  assert.equal(
    await page.locator(`[data-launch-campaign-products="${firstCampaignId}"]:visible`).count(),
    1
  );

  await page.locator("[data-launch-expand-all]").click();
  assert.equal(
    await page.locator("[data-launch-campaign-products]:visible").count(),
    campaignCount
  );
});

test("food selection opens one complete Coffee Bar flow without duplicate boards", async () => {
  assert.equal(await page.locator(".launch-list-panel").count(), 0);
  assert.equal(await page.locator(".launch-flow-panel").count(), 0);

  const productButtons = page.locator("[data-launch-campaign-products]:visible [data-select-launch-product]");
  const productCount = await productButtons.count();
  assert.ok(productCount > 0);
  await productButtons.first().click();

  assert.equal(await page.locator("#coffeeBarChecklist").count(), 1);
  assert.ok(await page.locator("#coffeeBarChecklist .flow-check").count() > 0);
  assert.equal(await page.locator("#coffeeBarChecklist [data-edit-launch-product]").count(), 1);
  assert.equal(await page.locator("#coffeeBarChecklist [data-delete-launch-product]").count(), 1);
  assert.equal(await page.locator("#coffeeBarChecklist [data-open-launch-product]").count(), 0);
});

test("food milestone actual dates remain editable and persist", async () => {
  const productButtons = page.locator("[data-launch-campaign-products]:visible [data-select-launch-product]");
  const productCount = await productButtons.count();
  assert.ok(productCount > 0);
  const productButton = productButtons.first();
  const productId = await productButton.getAttribute("data-select-launch-product");
  await productButton.click();

  const node = page.locator(`.launch-product-overview [data-select-launch-node="${productId}"][data-milestone-key="consumer"]`);
  assert.equal(await node.count(), 1);
  await node.click();

  let input = page.locator(`[data-launch-actual="${productId}"][data-milestone-key="consumer"]`);
  assert.equal(await input.count(), 1);
  const original = await input.evaluate(element => element.value);
  const replacement = original === "2026-04-11" ? "2026-04-12" : "2026-04-11";
  await input.fill(replacement);
  await input.press("Tab");

  await openLaunchPage();
  const reopenedProduct = page.locator(`[data-select-launch-product="${productId}"]`);
  assert.ok(await reopenedProduct.count() > 0);
  await reopenedProduct.first().click();
  const reopenedNode = page.locator(`.launch-product-overview [data-select-launch-node="${productId}"][data-milestone-key="consumer"]`);
  assert.equal(await reopenedNode.count(), 1);
  await reopenedNode.click();
  input = page.locator(`[data-launch-actual="${productId}"][data-milestone-key="consumer"]`);
  assert.equal(await input.count(), 1);
  assert.equal(await input.evaluate(element => element.value), replacement);

  await input.fill(original);
  await input.press("Tab");
});

test("campaign aggregation and editing preserve product-level dates", async () => {
  const result = await page.evaluate(() => {
    const unchanged = window.launchPlannedDatesAfterCampaignEdit({
      launchDate: "2026-10-01",
      plannedDates: { consumer: "2026-09-01", npc: "2026-09-15", launch: "2026-10-01" }
    }, "2026-10-01");
    const shifted = window.launchPlannedDatesAfterCampaignEdit({
      launchDate: "2026-10-01",
      plannedDates: { consumer: "2026-09-01", npc: "2026-09-15", launch: "2026-10-01" }
    }, "2026-10-08");
    const campaign = window.buildLaunchCampaigns([
      { id: "food-a", name: "食品 A", launchCampaignId: "campaign-test", launchCampaign: "测试档期", launchDate: "2026-10-01", actualDates: { consumer: "2026-09-02" }, plannedDates: {} },
      { id: "food-b", name: "食品 B", launchCampaignId: "campaign-test", launchCampaign: "测试档期", launchDate: "2026-10-01", actualDates: {}, plannedDates: {} }
    ])[0];
    return {
      unchanged,
      shifted,
      campaignConsumerActual: campaign.actualDates.consumer || "",
      launchTooltip: window.launchMilestoneTooltip({ key: "launch", plannedDate: "2026-10-01" })
    };
  });

  assert.equal(result.unchanged.consumer, "2026-09-01");
  assert.equal(result.unchanged.npc, "2026-09-15");
  assert.equal(result.shifted.consumer, "2026-09-08");
  assert.equal(result.shifted.npc, "2026-09-22");
  assert.equal(result.campaignConsumerActual, "");
  assert.equal(result.launchTooltip, "计划日期：2026-10-01");

  const ariaValues = await page.locator("[data-launch-campaign-toggle]").evaluateAll(nodes =>
    nodes.map(node => node.getAttribute("aria-expanded"))
  );
  assert.ok(ariaValues.length > 0);
  assert.ok(ariaValues.every(value => value === "true" || value === "false"));
});
