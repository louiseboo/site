# 众测产品信息本地预览 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 在现有收件箱实现众测产品报价只读总览，并提供本地桌面和手机预览。

**Architecture:** 保留现有收件箱和产品详情，新增独立总览容器。复用产品身份、版本排序和档期归一函数；预览服务器仅提供示例数据并拒绝所有写入。

**Tech Stack:** 原生 HTML/CSS/JavaScript、Node test、Playwright。

## Global Constraints

- 不推送、不部署、不修改线上数据。
- 报价属于对应版本，新版缺价不得回退旧价。
- 年份、档期、产品身份依次分组；包含众测后优化，不增加报价入口。
- 保留现有编辑保护；预览明确标识为示例数据。

### Task 1: 测试及本地预览边界

Files: `tests/categorylab-crowd-products.test.mjs`、`tests/support/crowd-preview-server.mjs`。

Interface: `startPreview(port = 0)` 返回已监听的本地 HTTP server；`previewRecords` 为示例产品版本数组。服务器只接受 GET 和只读 adminList，其余请求返回 403。

- [x] 写浏览器测试，先断言入口缺失：`assert.equal(await page.locator('#crowdProductsTab').count(), 1)`。
- [x] 运行 `NODE_PATH=/Users/louise.lu/.npm/_npx/e41f203b7505f1fb/node_modules node --test tests/categorylab-crowd-products.test.mjs`，确认因入口缺失失败。
- [x] 覆盖分组、CNY 别名、新版待报价、旧版本展开、查询、详情返回、草稿保护、移动端和写入拒绝。

### Task 2: 总览实现

File: `decks/category-lab/supplier-submissions-admin.html`。

Interfaces: `buildCrowdSections(allRecords, query)` 产生 `{year, campaigns:[{name, products:[{key, latest, versions}]}]}`；`renderCrowdProducts()` 负责总览内容；`setCrowdView(visible)` 负责独立视图切换。

- [x] 新增顶部 `#crowdProductsTab` 和 `#crowdProductsPane`，隐藏与显示使用现有 `.hidden`。
- [x] 筛选条件：`row.round_conclusion === '通过且进入众测' || row.tasting_scene === '众测后优化'`。
- [x] 用 `effectiveProductGroupKey(row, allRecords)` 确定身份，`compareRecordSequence` 排序，价格只读取 `latest.quote_rmb`。
- [x] 入口和查看记录均经过 `runWithUnsavedGuard`；返回保持原有状态筛选，顶部搜索在总览和收件箱各自保留。
- [x] 使用桌面四列表格、移动端卡片；原报价编辑功能不变，总览不新增编辑动作。
- [x] 运行上述测试至通过，再运行现有全部 `.test.mjs` 回归。

### Task 3: 本地交付

- [x] `NODE_PATH=/Users/louise.lu/.npm/_npx/e41f203b7505f1fb/node_modules node tests/support/crowd-preview-server.mjs` 启动 loopback 预览。
- [x] 以 1440px、390px 和 360px 检查横向溢出、版本展开、详情入口，保存截图至 `/tmp`。
- [x] `git diff --check`，查看本地 diff，说明测试结果与示例数据边界，打开 Codex 预览。
- [x] 不执行 push 或部署，留待 Louise 查看。
