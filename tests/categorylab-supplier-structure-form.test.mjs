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
const formPath = "/decks/category-lab/supplier-submit.html";

let server;
let browser;
let page;
let baseUrl;

function contentType(pathname) {
  return {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8"
  }[extname(pathname)] || "application/octet-stream";
}

test.before(async () => {
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
      const relativePath = normalize(pathname).replace(/^[/\\]+/, "");
      const filePath = join(repoRoot, relativePath || "index.html");
      if (!filePath.startsWith(`${repoRoot}/`)) {
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
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true
  });
});

test.after(async () => {
  await browser?.close();
  await new Promise(resolveClose => server?.close(resolveClose));
});

test.beforeEach(async () => {
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${baseUrl}${formPath}?backend=cloudbase`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-structure-field="name"]').first().waitFor();
});

test.afterEach(async () => {
  await page?.close();
});

test("structure guidance labels layers from bottom to top", async () => {
  assert.match(await page.locator("[data-structure-guidance]").innerText(), /从下到上.*每一行只填一层/);
  assert.equal(await page.locator("[data-structure-layer-label]").first().innerText(), "第1层｜最底层");
  await page.getByRole("button", { name: "向上新增一层" }).click();
  assert.deepEqual(await page.locator("[data-structure-layer-label]").allTextContents(), ["第1层｜最底层", "第2层"]);
});

test("weight heading aligns with its inputs wherever the table header is shown", async () => {
  for (const width of [1063, 760, 521]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await page.evaluate(() => {
      const heading = document.querySelector("th.weight-cell");
      const input = document.querySelector('[data-structure-field="weight"]');
      const headingRange = document.createRange();
      headingRange.selectNodeContents(heading);
      const headingRect = headingRange.getBoundingClientRect();
      const inputRect = input.getBoundingClientRect();
      return {
        headingCenter: (headingRect.left + headingRect.right) / 2,
        inputCenter: (inputRect.left + inputRect.right) / 2,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth
      };
    });

    assert.ok(
      Math.abs(geometry.headingCenter - geometry.inputCenter) <= 1,
      `${width}px: weight heading should share the input center line (${geometry.headingCenter} vs ${geometry.inputCenter})`
    );
    assert.equal(geometry.documentWidth, geometry.viewportWidth, `${width}px: page should not overflow horizontally`);
  }
});

test("desktop weight input shares the description input top edge", async () => {
  for (const width of [1075, 760, 521]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await page.evaluate(() => {
      const row = document.querySelector(".structure-table tbody tr");
      const top = selector => row.querySelector(selector).getBoundingClientRect().top;
      return {
        descriptionTop: top('[data-structure-field="name"]'),
        weightTop: top('[data-structure-field="weight"]')
      };
    });

    assert.ok(
      Math.abs(geometry.weightTop - geometry.descriptionTop) <= 1,
      `${width}px: weight should align with the description input (${geometry.weightTop} vs ${geometry.descriptionTop})`
    );
  }
});

test("desktop delete button shares the input top edge and height", async () => {
  for (const width of [1118, 760, 521]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await page.evaluate(() => {
      const row = document.querySelector(".structure-table tbody tr");
      const inputRect = row.querySelector('[data-structure-field="name"]').getBoundingClientRect();
      const deleteRect = row.querySelector("[data-delete-structure]").getBoundingClientRect();
      return {
        inputTop: inputRect.top,
        inputHeight: inputRect.height,
        deleteTop: deleteRect.top,
        deleteHeight: deleteRect.height
      };
    });

    assert.ok(
      Math.abs(geometry.deleteTop - geometry.inputTop) <= 1,
      `${width}px: delete should align with the input top (${geometry.deleteTop} vs ${geometry.inputTop})`
    );
    assert.ok(
      Math.abs(geometry.deleteHeight - geometry.inputHeight) <= 1,
      `${width}px: delete should match the input height (${geometry.deleteHeight} vs ${geometry.inputHeight})`
    );
  }
});

test("mobile structure rows remain readable and touch friendly", async () => {
  await page.setViewportSize({ width: 320, height: 700 });
  const geometry = await page.evaluate(() => {
    const row = document.querySelector(".structure-table tbody tr");
    const descriptionInput = row.querySelector('[data-structure-field="name"]');
    const weightInput = row.querySelector('[data-structure-field="weight"]');
    const deleteButton = row.querySelector("[data-delete-structure]");
    return {
      rowDisplay: getComputedStyle(row).display,
      descriptionWidth: descriptionInput.getBoundingClientRect().width,
      weightWidth: weightInput.getBoundingClientRect().width,
      deleteHeight: deleteButton.getBoundingClientRect().height,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth
    };
  });

  assert.equal(geometry.rowDisplay, "grid");
  assert.ok(geometry.descriptionWidth >= 180, `description input should stay readable (${geometry.descriptionWidth}px)`);
  assert.ok(geometry.weightWidth >= 100, `weight input should stay readable (${geometry.weightWidth}px)`);
  assert.ok(geometry.deleteHeight >= 44, `delete target should be at least 44px high (${geometry.deleteHeight}px)`);
  assert.equal(geometry.documentWidth, geometry.viewportWidth, "mobile page should not overflow horizontally");
});

test("structure description removes symbols and asks for another layer", async () => {
  const input = page.locator('[data-structure-field="name"]').first();
  await input.fill("饼干底A1 / 奶油");
  assert.equal(await input.inputValue(), "饼干底A1奶油");
  assert.match(await page.locator("[data-structure-error]").first().innerText(), /向上新增一层/);
});

test("structure filtering waits until Chinese composition ends", async () => {
  const input = page.locator('[data-structure-field="name"]').first();
  await input.evaluate(element => {
    element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    element.value = "慕斯·";
    element.dispatchEvent(new InputEvent("input", { bubbles: true, data: "·", inputType: "insertCompositionText" }));
  });
  assert.equal(await input.inputValue(), "慕斯·");
  await input.evaluate(element => element.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "慕斯·" })));
  assert.equal(await input.inputValue(), "慕斯");
});

test("weights recalculate percentages and serialized line breaks", async () => {
  await page.locator('[data-structure-field="name"]').first().fill("饼干底");
  await page.locator('[data-structure-field="weight"]').first().fill("20");
  await page.getByRole("button", { name: "向上新增一层" }).click();
  await page.locator('[data-structure-field="name"]').nth(1).fill("芝士慕斯");
  await page.locator('[data-structure-field="weight"]').nth(1).fill("80");
  assert.deepEqual(await page.locator("[data-structure-percent]").allTextContents(), ["20%", "80%"]);
  const stored = await page.locator('[data-product-field="ingredientsStructure"]').inputValue();
  assert.equal(stored, "第1层｜最底层：饼干底 20g（20%）\n第2层：芝士慕斯 80g（80%）\n自动计算总克重：100g");
});
