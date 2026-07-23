# CategoryLab Milestone Email Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync the three approved launch milestones to Tencent CloudBase and send deduplicated T-15/T-7 email reminders while the CategoryLab page is closed.

**Architecture:** Keep CategoryLab local-first, then sync only the minimal reminder snapshot through the existing `supplierFeedbackApi`. Add a focused CommonJS reminder module for normalization, window selection, message rendering, deduplication, and scanning. A timer wakes hourly and the worker gates execution to 09:00 in `Asia/Shanghai`, avoiding CloudBase Cron timezone ambiguity.

**Tech Stack:** Static HTML/CSS/JavaScript, browser `localStorage`, Tencent CloudBase Node.js function and NoSQL database, Nodemailer over QQ SMTP, Node.js built-in test runner, Playwright.

## Global Constraints

- Reminder nodes are exactly `prototype` (原型开发), `consumer` (众测), and `pilot` (中试).
- Reminder thresholds are exactly T-15 and T-7.
- Production recipients are `louise.lu@peets.cn`, `chenkoli@peets.cn`, and `pd_cw03@peets.cn`.
- Completed nodes with an actual date are skipped.
- Historical thresholds passed before activation are not backfilled.
- No SMTP credential, admin code, or sync token may enter source control or command output.
- Existing browser data remains authoritative and must survive sync failure.
- First real email is sent only to `louise.lu@peets.cn`.

---

### Task 1: Reminder Domain Module

**Files:**
- Create: `cloudbase/functions/supplierFeedbackApi/launch-reminders.js`
- Create: `tests/categorylab-launch-reminders.test.cjs`

**Interfaces:**
- Produces: `normalizeReminderSnapshot(snapshot)`, `reminderWindow(node, today, activationDate)`, `buildReminderKey(campaign, node, threshold)`, `buildLaunchReminderMessage(reminder, options)`, and `scanLaunchReminders(dependencies)`.
- Consumes: injected collection adapters and injected `send` function so tests never send real mail.

- [ ] **Step 1: Write failing domain tests**

Test T-15 for 8–15 remaining days, T-7 for 0–7 remaining days, actual-date skip, activation-date baseline, plan-date keying, and the approved recipients/message content.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
node --test tests/categorylab-launch-reminders.test.cjs
```

Expected: fail because `launch-reminders.js` does not exist.

- [ ] **Step 3: Implement the minimal pure reminder module**

Use date-only values in `Asia/Shanghai`. Return one pending threshold per node, preferring T-7 once that window opens. Render a concise HTML/text message with campaign, node, planned date, remaining days, launch date, and CategoryLab URL.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run the same command. Expected: all reminder-domain tests pass and no network call occurs.

- [ ] **Step 5: Commit**

```bash
git add cloudbase/functions/supplierFeedbackApi/launch-reminders.js tests/categorylab-launch-reminders.test.cjs
git commit -m "feat(categorylab): add milestone reminder engine"
```

### Task 2: CloudBase Authorization, Sync, Scan, and Test Actions

**Files:**
- Modify: `cloudbase/functions/supplierFeedbackApi/index.js`
- Create: `tests/categorylab-launch-reminder-api.test.cjs`

**Interfaces:**
- Produces HTTP actions `enableLaunchReminders`, `syncLaunchReminders`, and `launchReminderStatus`.
- Produces direct-only actions `scanLaunchReminders` and `sendLaunchReminderTest`.
- Uses collections `categorylab_launch_reminders`, `categorylab_reminder_workspaces`, and `categorylab_reminder_deliveries`.

- [ ] **Step 1: Write failing API tests**

Verify that enable requires the existing admin authorization check, returns a random scoped token, stores only its SHA-256 hash, sync rejects an invalid token, sync normalizes only the three allowed nodes, test email is direct-invocation-only, and timer events call the scanner only at Shanghai 09:00.

- [ ] **Step 2: Run the focused test and confirm RED**

```bash
node --test tests/categorylab-launch-reminder-api.test.cjs
```

Expected: fail because the new actions and exports do not exist.

- [ ] **Step 3: Implement API integration**

Add `X-CategoryLab-Reminder-Token` to CORS headers. Exchange the management code for a scoped token, hash it before storage, upsert reminder snapshots by campaign ID, deactivate missing campaigns, expose non-sensitive sync status, dispatch timer events, and keep the existing supplier API behavior unchanged.

- [ ] **Step 4: Add reminder mail configuration**

Read `MAIL_LAUNCH_REMINDER_TO` separately from supplier notification recipients. Reuse `MAIL_SMTP_USER` and `MAIL_SMTP_PASS`; use `MAIL_TEST_TO` only for the direct test action. Never return SMTP values in HTTP responses.

- [ ] **Step 5: Run API and existing tests**

```bash
node --test tests/categorylab-launch-reminder-api.test.cjs tests/categorylab-launch-reminders.test.cjs
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add cloudbase/functions/supplierFeedbackApi/index.js tests/categorylab-launch-reminder-api.test.cjs
git commit -m "feat(categorylab): add cloud reminder sync API"
```

### Task 3: CategoryLab Sync Controls

**Files:**
- Modify: `decks/category-lab/categorylab.html`
- Modify: `decks/category-lab/cloudbase-config.js`
- Modify: `tests/categorylab-calendar-schedule-editing.test.mjs`

**Interfaces:**
- Produces browser functions `launchReminderSnapshot()`, `enableLaunchReminderSync(adminCode)`, `scheduleLaunchReminderSync()`, `syncLaunchReminders()`, and `renderLaunchReminderSyncStatus()`.
- Stores only the scoped reminder token in `localStorage` under `categorylab-launch-reminder-token-v1`.

- [ ] **Step 1: Write failing Playwright tests**

Intercept the CloudBase endpoint. Verify that enabling sends the management code once, the returned scoped token is stored, a launch save schedules a snapshot containing only the three approved nodes, sync failure leaves `burger-bom-tool-v1` unchanged, and retry succeeds.

- [ ] **Step 2: Run the focused Playwright test and confirm RED**

```bash
NODE_PATH=/Users/louise.lu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules /Users/louise.lu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test --test-name-pattern="cloud reminder" tests/categorylab-calendar-schedule-editing.test.mjs
```

Expected: fail because no cloud reminder controls exist.

- [ ] **Step 3: Implement compact sync UI and automatic save hook**

Place one compact `云提醒` control beside the year controls. Its status is `未开启`, `同步中`, `已同步`, or `同步失败`. The setup modal asks for the existing CategoryLab management code once; successful exchange clears the input and schedules an immediate sync. Change `persist()` to save local state first and then debounce cloud sync.

- [ ] **Step 4: Run the focused and full browser suites**

Expected: cloud reminder tests and all existing CategoryLab tests pass.

- [ ] **Step 5: Commit**

```bash
git add decks/category-lab/categorylab.html decks/category-lab/cloudbase-config.js tests/categorylab-calendar-schedule-editing.test.mjs
git commit -m "feat(categorylab): sync milestone reminders to cloud"
```

### Task 4: CloudBase Deployment and Real Louise-Only Test

**Files:**
- Modify: `cloudbase/functions/supplierFeedbackApi/package.json` only if dependency metadata changed.
- Modify: `/Users/louise.lu/Documents/Louise-peet's workstream/12 Category Lab System｜品类工作台迭代/CATEGORY_LAB_DEPLOYMENT_LINKS.md`

**Interfaces:**
- Cloud function: `supplierFeedbackApi`.
- Timer trigger: `categorylabLaunchReminderHourly`, cron `0 0 * * * * *`; code executes scans only at 09:00 `Asia/Shanghai`.

- [ ] **Step 1: Run all local tests before deployment**

Run all Node and Playwright suites. Expected: zero failures.

- [ ] **Step 2: Deploy function code without overwriting environment variables**

Deploy code with `tcb fn deploy supplierFeedbackApi --dir cloudbase/functions/supplierFeedbackApi --force -e louise-ai-d2gi63mlafa5599c4`. Do not use a checked-in `envVariables` block.

- [ ] **Step 3: Verify required cloud environment variable names**

Confirm the presence, without printing values, of `MAIL_SMTP_USER`, `MAIL_SMTP_PASS`, `MAIL_TEST_TO`, `MAIL_LAUNCH_REMINDER_TO`, and `CATEGORYLAB_ADMIN_CODE`. If SMTP variables are absent, stop cloud email activation and report the exact blocker; do not substitute a different sender silently.

- [ ] **Step 4: Create and inspect the timer trigger**

```bash
tcb fn trigger create supplierFeedbackApi --trigger-name categorylabLaunchReminderHourly --cron "0 0 * * * * *" -e louise-ai-d2gi63mlafa5599c4
tcb fn detail supplierFeedbackApi -e louise-ai-d2gi63mlafa5599c4
```

Expected: the named trigger appears once.

- [ ] **Step 5: Invoke the real test action**

Invoke `sendLaunchReminderTest` directly. Expected: recipient is exactly `louise.lu@peets.cn`, a non-empty provider message ID is returned, and no Chenko or Wei address is used.

### Task 5: Production Page, Mirror, GitHub, and Online Verification

**Files:**
- Sync: `decks/category-lab/categorylab.html` to `/Users/louise.lu/Documents/Louise-peet's workstream/12 Category Lab System｜品类工作台迭代/categorylab.html`
- Update: `/Users/louise.lu/Documents/Louise-peet's workstream/12 Category Lab System｜品类工作台迭代/CATEGORY_LAB_DEPLOYMENT_LINKS.md`

- [ ] **Step 1: Sync the HTML mirror and compare hashes**

Expected: repo HTML and workstream mirror are byte-identical.

- [ ] **Step 2: Push the active branch and deploy static hosting**

Push `tencent-active`, deploy CategoryLab HTML and `cloudbase-config.js`, and record the final commit in the deployment links document.

- [ ] **Step 3: Verify the live UI with Playwright**

Open the cache-busted Tencent URL, confirm the cloud reminder control is visible, confirm local campaign data remains present, and verify that no secret appears in HTML or network response bodies.

- [ ] **Step 4: Verify function logs and repository state**

Confirm the test invocation log, trigger configuration, clean worktree, local/remote SHA equality, and no temporary artifacts.

- [ ] **Step 5: Submit the Raven execution receipt**

Use `/Users/louise.lu/Documents/Raven/tools/submit_knowledge_receipt.py` and report the verified receipt path. State separately whether cloud email activation succeeded or remains blocked by SMTP configuration.
