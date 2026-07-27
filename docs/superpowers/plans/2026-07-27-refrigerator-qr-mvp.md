# 17F Refrigerator QR Checkout MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a lightweight multi-user refrigerator MVP where one QR identifies one physical box and every checkout decrements the shared quantity in slices.

**Architecture:** A standalone mobile page calls a dedicated Tencent CloudBase HTTP function. The function validates a team access code, performs idempotent checkout inside a database transaction, and appends an audit record. The old Netlify page is preserved as a source snapshot; its embedded records seed product suggestions but never become authoritative inventory without a physical count.

**Tech Stack:** Plain HTML/CSS/JavaScript, Node.js 20, Node built-in test runner, `@cloudbase/node-sdk@3.18.3`, CloudBase CLI `3.6.4`, and locally vendored `qrcode-generator@2.0.4` (MIT).

## Global Constraints

- One physical box has one QR; individual slices do not receive QR codes.
- Pilot inventory unit is exactly `片`.
- CloudBase is the only authoritative quantity. Browser storage may remember a name and access code only.
- The first scan requires name plus a shared team code; admin actions require a separate admin code.
- QR payloads contain only an application URL and a 48-hex-character box token.
- Access codes exist only in function environment variables and temporary deployment state; never Git, HTML, screenshots, QR URLs, or logs.
- Checkout is atomic, never negative, and idempotent by `request_id`.
- Exclude SSO, photos, Benchmark, schedules, reminders, location QR codes, offline checkout, approvals, and full stocktaking.
- Do not overwrite existing CategoryLab pages or the intern's Netlify deployment.
- Preserve unrelated worktree changes and remove temporary downloads, npm packs, deployment configs, and verification artifacts.

---

## File Map

- `scripts/snapshot-refrigerator-source.mjs` — fetch, validate, snapshot, and parse the public page.
- `decks/refrigerator/data/product-seed.json` — generated product suggestions, with no live quantity.
- `cloudbase/functions/refrigeratorApi/inventory.js` — validation, box creation, and checkout domain logic.
- `cloudbase/functions/refrigeratorApi/cloudbase-store.js` — CloudBase collection/transaction adapter.
- `cloudbase/functions/refrigeratorApi/index.js` — CORS, auth, and HTTP action dispatch.
- `decks/refrigerator/index.html`, `styles.css`, `app.js` — scan and checkout.
- `decks/refrigerator/admin.html`, `admin.js` — box registration, QR label, lists, and CSV.
- `decks/refrigerator/cloudbase-config.js` — public API address only.
- `decks/refrigerator/vendor/qrcode.js`, `vendor/LICENSE` — local QR runtime and license.
- `tests/refrigerator-seed-extraction.test.mjs`, `tests/refrigerator-api.test.cjs`, `tests/refrigerator-pages.test.mjs` — regression suite.
- `scripts/deploy-refrigerator.sh` — secret-safe CloudBase deploy.
- `/Users/louise.lu/Documents/Louise-peet's workstream/12 Category Lab System｜品类工作台迭代/20260727_冰箱系统原网页快照_Codex.html` — exact source snapshot outside Git.

---

### Task 1: Preserve the old page and extract non-authoritative product suggestions

**Files:**
- Create: `scripts/snapshot-refrigerator-source.mjs`
- Create: `tests/refrigerator-seed-extraction.test.mjs`
- Generate: `decks/refrigerator/data/product-seed.json`
- Generate outside Git: `/Users/louise.lu/Documents/Louise-peet's workstream/12 Category Lab System｜品类工作台迭代/20260727_冰箱系统原网页快照_Codex.html`

**Interfaces:**
- Produces `extractSeedItems(html: string): object[]`.
- Produces `buildProductCatalog(items: object[]): CatalogRow[]`.
- `CatalogRow` is `{source_id, product_name, category, supplier, version, production_date, position}` and contains no quantity.

- [ ] **Step 1: Write failing parser tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { buildProductCatalog, extractSeedItems } from "../scripts/snapshot-refrigerator-source.mjs";

test("extracts embedded JSON without executing page code", () => {
  const html = `<script>const seedItems = [{"id":"P001","name":"栗子蛋糕","quantity":10}];
const scheduleItems = [];</script>`;
  assert.equal(extractSeedItems(html)[0].name, "栗子蛋糕");
});

test("catalog suggestions never claim live quantity", () => {
  const rows = buildProductCatalog([
    { id:"P001", name:"栗子蛋糕", category:"蛋糕", supplier:"怡安", version:"中试", productionDate:"2026-07-27", position:"冷冻左上", quantity:10 },
    { id:"P002", name:"栗子蛋糕", category:"蛋糕", supplier:"怡安", version:"中试", productionDate:"2026-07-27", position:"冷冻左上", quantity:7 }
  ]);
  assert.equal(rows.length, 1);
  assert.equal(Object.hasOwn(rows[0], "quantity"), false);
});
```

- [ ] **Step 2: Run tests and verify `ERR_MODULE_NOT_FOUND`**

```bash
node --test tests/refrigerator-seed-extraction.test.mjs
```

- [ ] **Step 3: Implement the parser and snapshot command**

```js
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const SOURCE_URL = "https://6a5dee4463812150ade087f8--lainey-refrigerator.netlify.app/";
export const SNAPSHOT_PATH = "/Users/louise.lu/Documents/Louise-peet's workstream/12 Category Lab System｜品类工作台迭代/20260727_冰箱系统原网页快照_Codex.html";
export const CATALOG_PATH = fileURLToPath(new URL("../decks/refrigerator/data/product-seed.json", import.meta.url));

export function extractSeedItems(html) {
  const match = String(html).match(/const\s+seedItems\s*=\s*(\[[\s\S]*?\]);\s*\nconst\s+scheduleItems\s*=/);
  if (!match) throw new Error("seedItems block not found");
  const rows = JSON.parse(match[1]);
  if (!Array.isArray(rows) || !rows.length) throw new Error("seedItems is empty");
  return rows;
}

export function buildProductCatalog(items) {
  const seen = new Set();
  return items.flatMap(item => {
    const row = {
      source_id: String(item.id || ""),
      product_name: String(item.name || "").trim(),
      category: String(item.category || "").trim(),
      supplier: String(item.supplier || "").trim(),
      version: String(item.version || "").trim(),
      production_date: String(item.productionDate || "").trim(),
      position: String(item.position || "").trim()
    };
    const key = [row.product_name,row.category,row.supplier,row.version,row.production_date,row.position].join("\u001f");
    if (!row.product_name || seen.has(key)) return [];
    seen.add(key);
    return [row];
  });
}

export async function snapshotAndExtract(fetchImpl = fetch) {
  const response = await fetchImpl(SOURCE_URL, { redirect:"follow" });
  if (!response.ok) throw new Error(`source returned HTTP ${response.status}`);
  const html = await response.text();
  if (html.length < 100000 || !html.includes("17F研发室冰箱管理")) throw new Error("source validation failed");
  const items = extractSeedItems(html);
  const catalog = buildProductCatalog(items);
  await mkdir(dirname(CATALOG_PATH), { recursive:true });
  await writeFile(SNAPSHOT_PATH, html, "utf8");
  await writeFile(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  return { snapshotBytes:Buffer.byteLength(html), seedItems:items.length, catalogItems:catalog.length };
}

if (fileURLToPath(import.meta.url) === process.argv[1]) console.log(JSON.stringify(await snapshotAndExtract()));
```

- [ ] **Step 4: Run and verify real output**

```bash
node --test tests/refrigerator-seed-extraction.test.mjs
node scripts/snapshot-refrigerator-source.mjs
test -s "/Users/louise.lu/Documents/Louise-peet's workstream/12 Category Lab System｜品类工作台迭代/20260727_冰箱系统原网页快照_Codex.html"
node -e 'const rows=require("./decks/refrigerator/data/product-seed.json"); if(rows.length<40||rows.some(r=>"quantity" in r)) process.exit(1); console.log(rows.length)'
```

Expected: tests PASS, snapshot exceeds 100000 bytes, source reports 55 seed items, catalog has at least 40 suggestions.

- [ ] **Step 5: Commit only repo files**

```bash
git add scripts/snapshot-refrigerator-source.mjs tests/refrigerator-seed-extraction.test.mjs decks/refrigerator/data/product-seed.json
git commit -m "Add refrigerator source snapshot extraction"
```

---

### Task 2: Implement transactional inventory logic

**Files:**
- Create: `cloudbase/functions/refrigeratorApi/inventory.js`
- Create: `cloudbase/functions/refrigeratorApi/cloudbase-store.js`
- Create: `tests/refrigerator-api.test.cjs`

**Interfaces:**
- Produces `createBoxRecord(input, options): {box, token}`.
- Produces `checkoutBox(store, input, options): Promise<{box, operation}>`.
- Produces `makeCloudbaseStore(app)` with `createBox`, `getBoxByToken`, `listBoxes`, `listOperations`, and `transaction`.

- [ ] **Step 1: Write failing tests for 10→9, idempotent retry, and insufficient stock**

```js
const assert = require("node:assert/strict");
const test = require("node:test");
const { checkoutBox, createBoxRecord } = require("../cloudbase/functions/refrigeratorApi/inventory");

function memoryStore() {
  const boxes = new Map(), operations = new Map();
  return {
    boxes, operations,
    async createBox(box) { boxes.set(box.public_token, {...box}); },
    async getBoxByToken(token) { return boxes.get(token) ? {...boxes.get(token)} : null; },
    async listBoxes() { return [...boxes.values()]; },
    async listOperations() { return [...operations.values()]; },
    async transaction(callback) {
      return callback({
        async getBoxByToken(token) { return boxes.get(token) ? {...boxes.get(token)} : null; },
        async getOperation(id) { return operations.get(id) ? {...operations.get(id)} : null; },
        async updateBox(id, patch) {
          const row = [...boxes.values()].find(item => item.box_id === id);
          boxes.set(row.public_token, {...row, ...patch});
        },
        async createOperation(row) { operations.set(row.request_id, {...row}); }
      });
    }
  };
}

test("one box starts at ten slices and defaults checkout to one", async () => {
  const store = memoryStore();
  const created = createBoxRecord({product_name:"栗子蛋糕",initial_quantity:10}, {randomBytes:() => Buffer.alloc(24, 8)});
  await store.createBox(created.box);
  const input = {token:created.token,request_id:"req-1",person:"Louise",purpose:"试吃",quantity:1};
  const first = await checkoutBox(store,input,{now:new Date("2026-07-27T01:00:00Z")});
  const retry = await checkoutBox(store,input,{now:new Date("2026-07-27T01:00:01Z")});
  assert.equal(first.box.remaining_quantity,9);
  assert.deepEqual(retry,first);
  assert.equal(store.operations.size,1);
});

test("cannot overdraw stock", async () => {
  const store = memoryStore();
  const created = createBoxRecord({product_name:"栗子蛋糕",initial_quantity:1}, {randomBytes:() => Buffer.alloc(24, 9)});
  await store.createBox(created.box);
  await assert.rejects(checkoutBox(store,{token:created.token,request_id:"req-2",person:"Louise",quantity:2}),/库存不足/);
});
```

- [ ] **Step 2: Run and verify `MODULE_NOT_FOUND`**

```bash
node --test tests/refrigerator-api.test.cjs
```

- [ ] **Step 3: Implement `inventory.js`**

```js
const crypto = require("crypto");
const text = value => String(value ?? "").trim();
function positiveInteger(value,label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label}必须是正整数。`);
  return parsed;
}
function publicBox(box) { const {public_token,...safe}=box; return safe; }

function createBoxRecord(input={}, options={}) {
  const now=options.now||new Date(), randomBytes=options.randomBytes||crypto.randomBytes;
  const product_name=text(input.product_name);
  if (!product_name) throw new Error("产品名称不能为空。");
  const initial_quantity=positiveInteger(input.initial_quantity,"初始数量");
  const token=randomBytes(24).toString("hex"), stamp=now.toISOString();
  return { token, box:{
    box_id:`BOX-${stamp.slice(0,10).replaceAll("-","")}-${randomBytes(3).toString("hex").toUpperCase()}`,
    public_token:token, product_name, category:text(input.category), supplier:text(input.supplier),
    version:text(input.version), batch:text(input.batch), production_date:text(input.production_date),
    position:text(input.position), unit:"片", initial_quantity, remaining_quantity:initial_quantity,
    status:"active", created_at:stamp, updated_at:stamp
  }};
}

async function checkoutBox(store,input={},options={}) {
  const token=text(input.token), request_id=text(input.request_id), person=text(input.person);
  const purpose=text(input.purpose)||"试吃/测试", quantity=positiveInteger(input.quantity??1,"领用数量");
  if (!token||!request_id||!person) throw new Error("二维码、请求编号和领用人不能为空。");
  const stamp=(options.now||new Date()).toISOString();
  return store.transaction(async tx => {
    const existing=await tx.getOperation(request_id);
    if (existing) return existing.result;
    const box=await tx.getBoxByToken(token);
    if (!box) throw new Error("二维码无效或盒子不存在。");
    if (box.remaining_quantity<quantity) throw new Error(`库存不足，当前仅剩 ${box.remaining_quantity} 片。`);
    const after=box.remaining_quantity-quantity, status=after===0?"empty":"active";
    const operation={operation_id:request_id,request_id,box_id:box.box_id,action:"checkout",person,purpose,quantity,before_quantity:box.remaining_quantity,after_quantity:after,created_at:stamp};
    const result={box:publicBox({...box,remaining_quantity:after,status,updated_at:stamp}),operation};
    await tx.updateBox(box.box_id,{remaining_quantity:after,status,updated_at:stamp});
    await tx.createOperation({...operation,result});
    return result;
  });
}
module.exports={checkoutBox,createBoxRecord,publicBox};
```

- [ ] **Step 4: Implement `cloudbase-store.js`**

```js
const BOXES="refrigerator_boxes", OPERATIONS="refrigerator_operations";
const first=result => result?.data?.[0]||null;
function makeCloudbaseStore(app) {
  const db=app.database();
  const methods=collections=>({
    async getBoxByToken(token){return first(await collections.boxes.where({public_token:token}).limit(1).get());},
    async getOperation(id){return first(await collections.operations.doc(id).get());},
    async updateBox(id,patch){return collections.boxes.doc(id).update(patch);},
    async createOperation(row){return collections.operations.doc(row.request_id).set(row);}
  });
  return {
    async createBox(box){return db.collection(BOXES).doc(box.box_id).set(box);},
    async getBoxByToken(token){return first(await db.collection(BOXES).where({public_token:token}).limit(1).get());},
    async listBoxes(){return (await db.collection(BOXES).orderBy("updated_at","desc").limit(1000).get()).data||[];},
    async listOperations(){return (await db.collection(OPERATIONS).orderBy("created_at","desc").limit(1000).get()).data||[];},
    async transaction(callback){return db.runTransaction(tx=>callback(methods({boxes:tx.collection(BOXES),operations:tx.collection(OPERATIONS)})));}
  };
}
module.exports={BOXES,OPERATIONS,makeCloudbaseStore};
```

- [ ] **Step 5: Run tests and commit**

```bash
node --test tests/refrigerator-api.test.cjs
git add cloudbase/functions/refrigeratorApi/inventory.js cloudbase/functions/refrigeratorApi/cloudbase-store.js tests/refrigerator-api.test.cjs
git commit -m "Add transactional refrigerator inventory domain"
```

Expected: tests PASS.

---

### Task 3: Add authenticated CloudBase HTTP actions

**Files:**
- Create: `cloudbase/functions/refrigeratorApi/index.js`
- Create: `cloudbase/functions/refrigeratorApi/package.json`
- Generate: `cloudbase/functions/refrigeratorApi/package-lock.json`
- Modify: `tests/refrigerator-api.test.cjs`

**Interfaces:**
- Public action: `health`.
- Team-code actions: `getBox`, `checkout`.
- Admin-code actions: `createBox`, `listBoxes`, `listOperations`.
- Headers: `X-Fridge-Access-Code`, `X-Fridge-Admin-Code`.

- [ ] **Step 1: Add failing HTTP tests**

```js
const api=require("../cloudbase/functions/refrigeratorApi/index");
const event=(body,headers={})=>({httpMethod:"POST",headers,body:JSON.stringify(body)});
const body=response=>JSON.parse(response.body);

test("wrong team code reveals no box detail",async()=>{
  const denied=await api._private.handleEvent(event({action:"getBox",token:"x"}),{store:memoryStore(),env:{FRIDGE_ACCESS_CODE:"246810",FRIDGE_ADMIN_CODE:"admin"}});
  assert.equal(denied.statusCode,403);
  assert.equal(JSON.stringify(body(denied)).includes("栗子蛋糕"),false);
});

test("admin creates ten slices and a colleague checks out one",async()=>{
  const store=memoryStore(), env={FRIDGE_ACCESS_CODE:"246810",FRIDGE_ADMIN_CODE:"admin"};
  const created=body(await api._private.handleEvent(event({action:"createBox",product_name:"栗子蛋糕",initial_quantity:10},{"X-Fridge-Admin-Code":"admin"}),{store,env,randomBytes:()=>Buffer.alloc(24,5)})).data;
  const checked=body(await api._private.handleEvent(event({action:"checkout",token:created.token,request_id:"http-1",person:"Louise",quantity:1},{"X-Fridge-Access-Code":"246810"}),{store,env})).data;
  assert.equal(checked.box.remaining_quantity,9);
});
```

- [ ] **Step 2: Run and verify `MODULE_NOT_FOUND`**

```bash
node --test tests/refrigerator-api.test.cjs
```

- [ ] **Step 3: Implement handler**

`index.js` must:
- Parse normal and Base64 bodies.
- Reply to `OPTIONS`.
- Return `Cache-Control: no-store`.
- Compare SHA-256 digests with `crypto.timingSafeEqual`.
- Never include `public_token` in `getBox`, `listBoxes`, or checkout box responses.
- Dispatch exactly the six actions above.
- Export `main` and `_private.handleEvent` for tests.
- Return 403 for wrong codes, 400 for validation/action errors, and 200 for successful actions.

Core dispatch:

```js
if(action==="health") return jsonResponse(200,{ok:true,data:{service:"refrigeratorApi"}});
if(adminActions.has(action)&&!codeMatches(header(event,"X-Fridge-Admin-Code"),env.FRIDGE_ADMIN_CODE)) return jsonResponse(403,{ok:false,error:"管理员验证失败。"});
if(!adminActions.has(action)&&!codeMatches(header(event,"X-Fridge-Access-Code"),env.FRIDGE_ACCESS_CODE)) return jsonResponse(403,{ok:false,error:"访问码不正确。"});
if(action==="createBox"){const created=createBoxRecord(request,{now:deps.now,randomBytes:deps.randomBytes});await store.createBox(created.box);return jsonResponse(200,{ok:true,data:{box:publicBox(created.box),token:created.token}});}
if(action==="getBox"){const box=await store.getBoxByToken(String(request.token||""));if(!box)throw new Error("二维码无效或盒子不存在。");return jsonResponse(200,{ok:true,data:{box:publicBox(box)}});}
if(action==="checkout") return jsonResponse(200,{ok:true,data:await checkoutBox(store,request,{now:deps.now})});
if(action==="listBoxes") return jsonResponse(200,{ok:true,data:{boxes:(await store.listBoxes()).map(publicBox)}});
if(action==="listOperations") return jsonResponse(200,{ok:true,data:{operations:await store.listOperations()}});
```

- [ ] **Step 4: Pin dependency and generate lockfile**

```json
{"name":"refrigerator-api","version":"1.0.0","private":true,"main":"index.js","engines":{"node":">=20"},"dependencies":{"@cloudbase/node-sdk":"3.18.3"}}
```

```bash
npm install --package-lock-only --ignore-scripts --prefix cloudbase/functions/refrigeratorApi
node --check cloudbase/functions/refrigeratorApi/index.js
node --test tests/refrigerator-api.test.cjs
```

Expected: syntax and tests PASS.

- [ ] **Step 5: Commit**

```bash
git add cloudbase/functions/refrigeratorApi/index.js cloudbase/functions/refrigeratorApi/package.json cloudbase/functions/refrigeratorApi/package-lock.json tests/refrigerator-api.test.cjs
git commit -m "Add authenticated refrigerator CloudBase API"
```

---

### Task 4: Build the scan-and-checkout page

**Files:**
- Create: `decks/refrigerator/index.html`
- Create: `decks/refrigerator/styles.css`
- Create: `decks/refrigerator/app.js`
- Create: `decks/refrigerator/cloudbase-config.js`
- Create: `tests/refrigerator-pages.test.mjs`

**Interfaces:**
- Query: `box=<48-hex-token>`.
- Config: `window.REFRIGERATOR_CLOUDBASE.apiUrl`.
- Stores only `fridge-person-v1` and `fridge-access-code-v1`.

- [ ] **Step 1: Write failing static assertions**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
const root=new URL("../decks/refrigerator/",import.meta.url);

test("scan page is one-box checkout with no local inventory",async()=>{
  const [html,js]=await Promise.all([readFile(new URL("index.html",root),"utf8"),readFile(new URL("app.js",root),"utf8")]);
  assert.match(html,/领用 1 片/);
  assert.match(js,/URLSearchParams/);
  assert.match(js,/crypto\.randomUUID/);
  assert.doesNotMatch(js,/remaining_quantity\s*[-+]=/);
  assert.doesNotMatch(js,/localStorage\.setItem\([^,]*(inventory|quantity|boxes)/i);
});
```

- [ ] **Step 2: Run and verify `ENOENT`**

```bash
node --test tests/refrigerator-pages.test.mjs
```

- [ ] **Step 3: Create mobile UI**

`index.html` contains:
- `credentialCard`: name, team code, and one enter button.
- `boxCard`: product, batch, position, remaining slices, quantity default 1, purpose default `试吃/测试`, and `领用 1 片`.
- `aria-live` status.
- `noindex,nofollow`.
- No full inventory list.

`app.js`:
- Rejects missing/non-48-hex box tokens before API access.
- Calls `getBox`, then renders the server quantity.
- Locks the checkout button before sending.
- Sends `crypto.randomUUID()` as `request_id`.
- On success replaces the whole displayed box with server response.
- On error never displays success and re-enables only when stock may remain.
- Remembers only name and team code.

`cloudbase-config.js` is exactly:

```js
window.REFRIGERATOR_CLOUDBASE={apiUrl:"https://louise-ai-d2gi63mlafa5599c4-1434918374.ap-shanghai.app.tcloudbase.com/api/refrigerator"};
```

`styles.css` supplies 44px tap targets, visible focus, safe-area padding, disabled states, high-contrast messages, and a 390px-first layout.

- [ ] **Step 4: Test and commit**

```bash
node --test tests/refrigerator-pages.test.mjs tests/refrigerator-api.test.cjs
node --check decks/refrigerator/app.js
git add decks/refrigerator/index.html decks/refrigerator/styles.css decks/refrigerator/app.js decks/refrigerator/cloudbase-config.js tests/refrigerator-pages.test.mjs
git commit -m "Add refrigerator QR checkout page"
```

Expected: tests and syntax PASS.

---

### Task 5: Build registration, local QR labels, lists, and CSV

**Files:**
- Create: `decks/refrigerator/admin.html`
- Create: `decks/refrigerator/admin.js`
- Create: `decks/refrigerator/vendor/qrcode.js`
- Create: `decks/refrigerator/vendor/LICENSE`
- Modify: `tests/refrigerator-pages.test.mjs`

**Interfaces:**
- Reads `data/product-seed.json` only for suggestions.
- Calls admin actions with `X-Fridge-Admin-Code`.
- Label URL is `/decks/refrigerator/?box=<token>`.

- [ ] **Step 1: Add failing security assertions**

```js
test("admin creates QR locally and never embeds a code",async()=>{
  const [html,js]=await Promise.all([readFile(new URL("admin.html",root),"utf8"),readFile(new URL("admin.js",root),"utf8")]);
  assert.match(html,/vendor\/qrcode\.js/);
  assert.match(js,/searchParams\.set\("box"/);
  assert.doesNotMatch(js,/searchParams\.set\([^)]*(access|code|admin)/i);
  assert.match(js,/product-seed\.json/);
  assert.match(js,/text\/csv/);
});
```

- [ ] **Step 2: Run and verify `ENOENT`**

```bash
node --test tests/refrigerator-pages.test.mjs
```

- [ ] **Step 3: Vendor pinned QR runtime and license**

```bash
tmp_qr_dir=$(mktemp -d)
npm pack qrcode-generator@2.0.4 --pack-destination "$tmp_qr_dir"
tar -xzf "$tmp_qr_dir/qrcode-generator-2.0.4.tgz" -C "$tmp_qr_dir"
mkdir -p decks/refrigerator/vendor
cp "$tmp_qr_dir/package/dist/qrcode.js" decks/refrigerator/vendor/qrcode.js
cp "$tmp_qr_dir/package/LICENSE" decks/refrigerator/vendor/LICENSE
rm -rf "$tmp_qr_dir"
```

Expected: browser function `qrcode` exists; license is MIT; no tarball remains.

- [ ] **Step 4: Implement admin page**

`admin.html` contains admin-code entry, product datalist, batch/date, position, actual slices default 10, create button, print label, box list, operation list, and CSV export.

`admin.js` must:
- Store admin code in `sessionStorage`, never `localStorage`.
- Escape dynamic text by DOM `textContent`, not `innerHTML`.
- Create a box through the API.
- Build `new URL("./", location.href)`, clear its search, and set only `box`.
- Generate SVG using `qrcode(0,"M")`.
- Print product, batch, initial slices, and short box ID beside QR.
- Load boxes and operations from CloudBase.
- Export UTF-8 BOM CSV with box/operation rows.
- Use `window.print()` and a print stylesheet that hides controls.

- [ ] **Step 5: Test and commit**

```bash
node --test tests/refrigerator-pages.test.mjs tests/refrigerator-api.test.cjs
node --check decks/refrigerator/admin.js
git add decks/refrigerator/admin.html decks/refrigerator/admin.js decks/refrigerator/vendor/qrcode.js decks/refrigerator/vendor/LICENSE tests/refrigerator-pages.test.mjs
git commit -m "Add refrigerator registration and QR labels"
```

Expected: tests PASS and no temporary npm files remain.

---

### Task 6: Deploy without committing secrets

**Files:**
- Create: `scripts/deploy-refrigerator.sh`
- Modify: `README.md`

**Interfaces:**
- Requires `FRIDGE_ACCESS_CODE` and `FRIDGE_ADMIN_CODE`.
- Deploys `refrigeratorApi` to environment `louise-ai-d2gi63mlafa5599c4`, route `/api/refrigerator`.
- Deploys only `decks/refrigerator` to `/decks/refrigerator`.

- [ ] **Step 1: Create strict deployment script**

```bash
#!/usr/bin/env bash
set -euo pipefail
: "${FRIDGE_ACCESS_CODE:?FRIDGE_ACCESS_CODE is required}"
: "${FRIDGE_ADMIN_CODE:?FRIDGE_ADMIN_CODE is required}"
repo_dir=$(cd "$(dirname "$0")/.." && pwd)
env_id="louise-ai-d2gi63mlafa5599c4"
config_path=$(mktemp)
chmod 600 "$config_path"
cleanup(){ rm -f "$config_path"; }
trap cleanup EXIT

node - "$config_path" "$env_id" "$FRIDGE_ACCESS_CODE" "$FRIDGE_ADMIN_CODE" <<'NODE'
const fs=require("node:fs");
const [path,envId,accessCode,adminCode]=process.argv.slice(2);
fs.writeFileSync(path,JSON.stringify({envId,functionRoot:"cloudbase/functions",functions:[{
  name:"refrigeratorApi",runtime:"Nodejs20.19",handler:"index.main",timeout:10,memorySize:256,
  description:"17F refrigerator QR checkout MVP",envVariables:{FRIDGE_ACCESS_CODE:accessCode,FRIDGE_ADMIN_CODE:adminCode}
}]}));
NODE

cd "$repo_dir"
npm install --omit=dev --ignore-scripts --prefix cloudbase/functions/refrigeratorApi
npx -y --package=@cloudbase/cli@3.6.4 tcb --config-file "$config_path" -e "$env_id" fn deploy refrigeratorApi --dir cloudbase/functions/refrigeratorApi --force --httpFn --path /api/refrigerator
npx -y --package=@cloudbase/cli@3.6.4 tcb -e "$env_id" hosting deploy decks/refrigerator /decks/refrigerator
```

Set mode with `chmod 755 scripts/deploy-refrigerator.sh`.

- [ ] **Step 2: Document paths and secret boundary in README**

Document:
- `/decks/refrigerator/`
- `/decks/refrigerator/admin.html`
- function source path
- product suggestions are not physical counts
- deployment requires the two shell variables and neither belongs in Git, HTML, QR, screenshots, or logs.

- [ ] **Step 3: Run full predeploy verification**

```bash
node --test tests/refrigerator-*.test.*
node --check cloudbase/functions/refrigeratorApi/index.js
node --check cloudbase/functions/refrigeratorApi/inventory.js
node --check cloudbase/functions/refrigeratorApi/cloudbase-store.js
node --check decks/refrigerator/app.js
node --check decks/refrigerator/admin.js
git diff --check
```

Expected: all PASS/silent.

- [ ] **Step 4: Generate codes in the active shell and deploy**

```bash
export FRIDGE_ACCESS_CODE="$(node -e 'console.log(require("crypto").randomInt(100000,1000000))')"
export FRIDGE_ADMIN_CODE="$(node -e 'console.log(require("crypto").randomBytes(18).toString("base64url"))')"
./scripts/deploy-refrigerator.sh
```

Record codes only for the final secure user handoff.

- [ ] **Step 5: Verify health and static pages**

```bash
curl -fsS 'https://louise-ai-d2gi63mlafa5599c4-1434918374.ap-shanghai.app.tcloudbase.com/api/refrigerator' -H 'Content-Type: application/json' --data '{"action":"health"}'
curl -fsSI 'https://louise-ai-d2gi63mlafa5599c4-1434918374.tcloudbaseapp.com/decks/refrigerator/'
curl -fsSI 'https://louise-ai-d2gi63mlafa5599c4-1434918374.tcloudbaseapp.com/decks/refrigerator/admin.html'
```

Expected: health `ok:true`; pages HTTP 200.

- [ ] **Step 6: Commit deployment contract**

```bash
git add scripts/deploy-refrigerator.sh README.md
git commit -m "Add refrigerator MVP deployment workflow"
```

---

### Task 7: Verify shared inventory with a clearly non-authoritative demo box

**Files:**
- Modify implementation files only if defects are found.
- Do not commit access/admin codes, demo token, curl payloads, QR screenshots, or response files.

**Interfaces:**
- Demo box: product `扫码体验蛋糕`, batch `MVP-20260727`, position `MVP 测试，不对应真实库存`, initial quantity `10`.

- [ ] **Step 1: Create demo box**

Use the deployed admin API and capture the returned token only in a shell variable. Expected: 48-character token, 10 slices.

- [ ] **Step 2: Simulate two independent phones**

Phone A request: checkout 1 with `request_id=A`; repeat the identical request. Phone B request: checkout 3 with `request_id=B`.

Expected:
- First A returns 9.
- Repeated A still returns 9 and creates no new operation.
- B returns 6.
- Admin list shows exactly two operations.

- [ ] **Step 3: Verify privacy and floor**

Wrong team code must return HTTP 403 without product details. Checkout 7 from remaining 6 must fail and leave quantity at 6.

- [ ] **Step 4: Print/scan the real QR**

Open `https://louise-ai-d2gi63mlafa5599c4-1434918374.tcloudbaseapp.com/decks/refrigerator/admin.html`, render and print/save the demo label. Two physical phones scan the same label and both must show 6 before further checkout. This camera step requires Louise or a colleague to hold two phones and must not be claimed as completed until observed.

- [ ] **Step 5: Final regression, push, and cleanup**

```bash
node --test tests/refrigerator-*.test.*
git diff --check
git status --short --branch
git log --oneline --decorate -8
git push origin tencent-active
unset FRIDGE_ACCESS_CODE FRIDGE_ADMIN_CODE
```

Expected: tests PASS, only intended commits pushed, old Netlify and CategoryLab unchanged, no temporary artifacts or secrets remain.

---

## Final Handoff

Return:
- scan URL and admin URL;
- team access code and admin-code handoff method;
- exact snapshot path and catalog count;
- demo 10→9→6 results and idempotency result;
- test command and pass count;
- branch, final commit, and push status;
- literal remaining physical two-phone scan step;
- exact blocker if any, without softened success language.

