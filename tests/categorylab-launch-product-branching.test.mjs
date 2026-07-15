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

test("timeline separates planned dots above from actual dots below", async () => {
  const markerErrors = await page.locator(".timeline-track-cell").evaluateAll(cells =>
    cells.flatMap((cell, rowIndex) => {
      const counts = { planned: {}, actual: {} };
      cell.querySelectorAll(".timeline-dot[data-milestone-key]").forEach(node => {
        const key = node.getAttribute("data-milestone-key");
        const lane = node.classList.contains("actual") ? "actual" : "planned";
        counts[lane][key] = (counts[lane][key] || 0) + 1;
      });
      const errors = [];
      Object.entries(counts.planned).forEach(([key, count]) => {
        if (count !== 1) errors.push({ rowIndex, lane: "planned", key, count });
      });
      Object.entries(counts.actual).forEach(([key, count]) => {
        if (count > 1) errors.push({ rowIndex, lane: "actual", key, count });
        if (key === "launch") errors.push({ rowIndex, lane: "actual", key, reason: "launch must remain planned-only" });
      });
      cell.querySelectorAll(".timeline-dot.planned").forEach(node => {
        const tooltip = node.getAttribute("data-tooltip") || "";
        if (!tooltip.includes("计划日期") || tooltip.includes("实际日期")) {
          errors.push({ rowIndex, lane: "planned", tooltip });
        }
      });
      cell.querySelectorAll(".timeline-dot.actual").forEach(node => {
        const tooltip = node.getAttribute("data-tooltip") || "";
        const actualDate = node.getAttribute("data-actual-date") || "";
        const source = node.getAttribute("data-actual-source") || "";
        const key = node.getAttribute("data-milestone-key");
        const plannedDate = cell.querySelector(`.timeline-dot.planned[data-milestone-key="${key}"]`)?.getAttribute("data-planned-date") || "";
        const invalidFallback = source === "planned-fallback" && actualDate !== plannedDate;
        if (!actualDate || !["recorded", "planned-fallback"].includes(source) || invalidFallback || !tooltip.includes("实际日期") || tooltip.includes("计划日期")) {
          errors.push({ rowIndex, lane: "actual", tooltip, actualDate, plannedDate, source });
        }
      });
      return errors;
    })
  );
  assert.deepEqual(markerErrors, []);
  assert.ok(await page.locator(".timeline-dot.planned").count() > 0);
  assert.ok(await page.locator(".timeline-dot.actual").count() > 0);
});

test("timeline campaign summaries do not list food names", async () => {
  const summaries = await page.locator(".timeline-project-info").allTextContents();
  assert.ok(summaries.length > 0);
  assert.ok(summaries.every(summary => /\d+\s*个食品/.test(summary)));
  assert.ok(summaries.every(summary => !summary.includes("蓝莓轻芝士慕斯蛋糕")));
});

test("campaign keeps seven milestones and aggregates product nodes by the latest actual date", async () => {
  const result = await page.evaluate(() => {
    const campaign = window.buildLaunchCampaigns([
      {
        id: "tracked-food-a",
        name: "食品 A",
        launchCampaignId: "tracked-campaign",
        launchCampaign: "四节点测试档期",
        launchDate: "2026-07-01",
        plannedDates: {},
        checkedFlow: {},
        actualDates: {
          prototype: "2026-01-05",
          consumer: "2026-06-01",
          npc: "2026-06-10",
          pilot: "2026-07-01",
          mass: "2026-06-20",
          warehouse: "2026-06-25"
        }
      },
      {
        id: "tracked-food-b",
        name: "食品 B",
        launchCampaignId: "tracked-campaign",
        launchCampaign: "四节点测试档期",
        launchDate: "2026-07-01",
        plannedDates: {},
        checkedFlow: {},
        actualDates: {
          prototype: "2026-01-05",
          consumer: "2026-06-03",
          npc: "2026-06-12",
          pilot: "2026-07-03",
          mass: "2026-06-23",
          warehouse: "2026-06-25"
        }
      }
    ])[0];
    const completion = window.launchCompletion(campaign);
    return {
      keys: completion.milestones.map(item => item.key),
      done: completion.done,
      total: completion.total,
      status: window.launchProjectStatus(campaign),
      aggregateDates: campaign.actualDates
    };
  });

  assert.deepEqual(result.keys, ["prototype", "consumer", "npc", "pilot", "mass", "warehouse", "launch"]);
  assert.equal(result.done, 7);
  assert.equal(result.total, 7);
  assert.equal(result.status, "已完结");
  assert.equal(result.aggregateDates.consumer, "2026-06-03");
  assert.equal(result.aggregateDates.mass, "2026-06-23");
});

test("launch dashboard keeps seven milestones with separate campaign and product actual editing", async () => {
  await page.locator("[data-launch-expand-all]").click();
  const dashboard = page.locator("[data-launch-campaign-products]:visible .launch-milestone-dashboard").first();
  assert.equal(await dashboard.locator(".launch-milestone-card").count(), 7);
  assert.deepEqual(
    (await dashboard.locator(".launch-milestone-card strong").allTextContents()).map(value => value.replace(/T-?\d+|上市日/g, "").trim()),
    ["原型开发", "众测", "NPC", "中试", "大生产", "到仓", "上市"]
  );
  await dashboard.locator(".btn[data-open-launch-actuals]").click();
  assert.equal(await page.locator(".launch-product-node-editor [data-launch-actual]:visible").count(), 1);

  await dashboard.locator('[data-milestone-key="prototype"]').click();
  assert.equal(await page.locator('#launchScheduleModal.open [data-launch-campaign-actual="prototype"]').count(), 1);
  assert.equal(await page.locator('#launchScheduleModal [data-launch-campaign-actual="warehouse"]').count(), 1);
  assert.equal(await page.locator('#launchScheduleModal [data-launch-actual-summary]').count(), 4);
  await page.locator('[data-close-modal="launchScheduleModal"]').click();
});

test("July source campaign is completed and an empty campaign can be completed manually", async () => {
  const july = await page.evaluate(() => {
    const campaign = window.buildLaunchCampaigns(state.launchProjects || []).find(item => item.name === "7月：埃塞利姆古吉");
    return {
      status: window.launchProjectStatus(campaign),
      completion: window.launchCompletion(campaign)
    };
  });
  assert.equal(july.status, "已完结");
  assert.equal(july.completion.done, 7);
  assert.equal(july.completion.total, 7);

  const emptyCampaign = await page.evaluate(() => {
    const campaign = window.buildLaunchCampaigns(state.launchProjects || []).find(item =>
      item.name === "9月：桂花2" && window.visibleLaunchProducts(item.products || []).length === 0
    );
    return campaign ? { id: campaign.id, name: campaign.name } : null;
  });
  assert.ok(emptyCampaign);
  await page.evaluate(id => window.openLaunchProjectModal(id), emptyCampaign.id);
  await page.locator("#launchCompletionStatus").selectOption("done");
  await page.locator("#launchProjectForm button[type=submit]").click();
  assert.equal(
    await page.evaluate(name => {
      const campaign = window.buildLaunchCampaigns(state.launchProjects || []).find(item => item.name === name);
      return window.launchProjectStatus(campaign);
    }, emptyCampaign.name),
    "已完结"
  );

  await page.evaluate(name => {
    const campaign = window.buildLaunchCampaigns(state.launchProjects || []).find(item => item.name === name);
    (campaign?.products || []).forEach(product => { product.calendarCompleted = false; });
    persist();
    renderLaunchProjects();
  }, emptyCampaign.name);
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
  assert.ok(headerRows.every(row => row.replace(/\s+/g, "") === "食品众测NPC中试大生产操作"));

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

test("campaigns without foods keep the complete Coffee Bar workflow visible", async () => {
  const emptyCampaign = page.locator(".timeline-project-info").filter({ hasText: "0 个食品" }).first();
  assert.equal(await emptyCampaign.count(), 1);
  await emptyCampaign.evaluate(element => element.click());
  const expectedFlowItems = [
    "Brief", "初版配方确认", "初版报价", "稳定性测试", "众测", "NPC", "配方确认",
    "产品名称确认", "中试跟产", "三方跟产", "中试", "运输测试", "中试验收", "二次中试",
    "二次中试验收", "三方跟产验收", "ID 照", "factsheet初版稿件", "factsheet提交审核",
    "审核Tony", "审核Dan", "factsheet发送", "规格书", "大生产", "大生产验收",
    "烤程SOP", "Memo", "上市"
  ];
  const visibleFlowItems = await page.locator("#coffeeBarChecklist .flow-check").allTextContents();
  assert.deepEqual(visibleFlowItems.map(item => item.trim()), expectedFlowItems);
  assert.match(await page.locator("#launchActiveProjectLabel").innerText(), /未关联食品/);
  assert.equal(await page.locator("#coffeeBarChecklist [data-edit-launch-product]").count(), 0);
  assert.equal(await page.locator("#coffeeBarChecklist [data-delete-launch-product]").count(), 0);

  const firstFlowCheck = page.locator("#coffeeBarChecklist [data-flow-check]").first();
  if (!(await firstFlowCheck.isChecked())) await firstFlowCheck.check();
  await page.locator("#launchIssueNote").fill("档期任务承接测试");
  const activeProductCenter = page.locator(".timeline-project-info.active + .timeline-track-cell + .launch-campaign-products");
  assert.equal(await activeProductCenter.count(), 1);
  await activeProductCenter.locator("[data-open-launch-product]").click();
  await page.locator("#launchProductName").fill("流程承接测试食品");
  await page.locator("#saveLaunchProductBtn").click();
  assert.match(await page.locator("#launchActiveProjectLabel").innerText(), /流程承接测试食品/);
  assert.equal(await page.locator("#coffeeBarChecklist [data-flow-check]").first().isChecked(), true);
  assert.equal(await page.locator("#launchIssueNote").inputValue(), "档期任务承接测试");
});

test("food management is centralized in the product center", async () => {
  assert.equal(await page.locator(".launch-list-panel").count(), 0);
  assert.equal(await page.locator(".launch-flow-panel").count(), 1);
  assert.equal(await page.locator(".launch-inline-flow").count(), 0);

  await page.locator("[data-launch-expand-all]").click();
  const multiProductCenter = page.locator("[data-launch-campaign-products]:visible").filter({
    has: page.locator("tbody tr:nth-child(2)")
  }).first();
  const productButtons = multiProductCenter.locator("[data-select-launch-product]");
  const productCount = await productButtons.count();
  assert.ok(productCount > 1);
  assert.equal(await multiProductCenter.locator("[data-open-launch-product]").count(), 1);
  assert.equal(await multiProductCenter.locator("tbody [data-edit-launch-product]").count(), productCount);
  assert.equal(await multiProductCenter.locator("tbody [data-delete-launch-product]").count(), productCount);

  const firstProductName = (await productButtons.first().innerText()).split("\n")[0].trim();
  await multiProductCenter.locator("tbody [data-edit-launch-product]").first().click();
  assert.equal(await page.locator("#launchProductModal").getAttribute("class"), "modal open");
  assert.equal(await page.locator("#launchProductName").inputValue(), firstProductName);
  assert.deepEqual(
    await page.locator("#launchProductBreakfastOffer option").evaluateAll(options => options.map(option => option.value)),
    ["", "+1元", "+4元"]
  );
  assert.deepEqual(
    await page.locator("#launchProductMealOffer option").evaluateAll(options => options.map(option => option.value)),
    ["", "+1元", "+4元", "+9元"]
  );
  assert.equal(await page.locator("#launchProductAddOnOffer").evaluate(element => element.tagName), "INPUT");
  await page.locator('[data-close-modal="launchProductModal"]').click();
  await productButtons.first().click();

  assert.equal(await page.locator("#coffeeBarChecklist").count(), 1);
  assert.ok((await page.locator("#launchActiveProjectLabel").innerText()).includes(firstProductName));
  assert.ok(await page.locator("#coffeeBarChecklist .flow-check").count() > 0);
  assert.equal(await page.locator("#coffeeBarChecklist [data-edit-launch-product]").count(), 0);
  assert.equal(await page.locator("#coffeeBarChecklist [data-delete-launch-product]").count(), 0);
  assert.equal(await page.locator("#coffeeBarChecklist [data-open-launch-product]").count(), 0);

  const flowPicker = page.locator("#coffeeBarChecklist .launch-flow-product-picker [data-select-launch-product]");
  assert.ok(await flowPicker.count() > 1);
  const firstProductId = await flowPicker.first().getAttribute("data-select-launch-product");
  const secondProductId = await flowPicker.nth(1).getAttribute("data-select-launch-product");
  let firstFlowCheck = page.locator("#coffeeBarChecklist [data-flow-check]").first();
  if (!(await firstFlowCheck.isChecked())) await firstFlowCheck.check();

  await page.locator(`#coffeeBarChecklist [data-select-launch-product="${secondProductId}"]`).click();
  let secondFlowCheck = page.locator("#coffeeBarChecklist [data-flow-check]").first();
  if (await secondFlowCheck.isChecked()) await secondFlowCheck.uncheck();

  await page.locator(`#coffeeBarChecklist [data-select-launch-product="${firstProductId}"]`).click();
  firstFlowCheck = page.locator("#coffeeBarChecklist [data-flow-check]").first();
  assert.equal(await firstFlowCheck.isChecked(), true);
  await page.locator(`#coffeeBarChecklist [data-select-launch-product="${secondProductId}"]`).click();
  secondFlowCheck = page.locator("#coffeeBarChecklist [data-flow-check]").first();
  assert.equal(await secondFlowCheck.isChecked(), false);

  await openLaunchPage();
  await page.locator(`[data-launch-campaign-products] [data-select-launch-product="${firstProductId}"]`).first().click();
  assert.equal(await page.locator("#coffeeBarChecklist [data-flow-check]").first().isChecked(), true);
  await page.locator(`#coffeeBarChecklist [data-select-launch-product="${secondProductId}"]`).click();
  assert.equal(await page.locator("#coffeeBarChecklist [data-flow-check]").first().isChecked(), false);
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
