# Latest Supplier Submission Email Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send one production-format test email to Louise only, using the newest CloudBase supplier record and its saved product photos, while leaving automatic four-recipient notifications disabled until Louise approves the result.

**Architecture:** Extract email rendering and delivery into a focused CommonJS module beside the CloudBase function. The function stores supplier data first, then uses QQ SMTP through environment variables; a direct-invocation-only test action reads the newest record and overrides the recipient with `MAIL_TEST_TO`. Formatting is tested with Node's built-in test runner from `/tmp`, so no test artifact remains in the iCloud workspace.

**Tech Stack:** Node.js 20, Tencent CloudBase Node SDK, Nodemailer, QQ SMTP over TLS port 465, Node `node:test`.

## Global Constraints

- Test recipient is Louise only; Chenko, Lainey, and Kava must not receive the first test.
- Sender credentials and recipient addresses live only in Tencent CloudBase environment variables.
- QQ login password is never used; only the SMTP authorization code is accepted.
- Supplier submission remains successful when notification delivery fails.
- Product photos are attached, up to the existing six-image submission limit.
- Temporary tests and deployment tooling are removed from `/tmp` before completion.
- Automatic notification remains disabled during the first visual test.

---

### Task 1: Email Rendering and Attachments

**Files:**
- Create: `cloudbase/functions/supplierFeedbackApi/notification.js`
- Modify: `cloudbase/functions/supplierFeedbackApi/package.json`
- Modify: `cloudbase/functions/supplierFeedbackApi/package-lock.json`
- Test: `/tmp/categorylab-notification.test.cjs`

**Interfaces:**
- Consumes: a supplier record and an array of `{ filename, content, contentType }` image attachments.
- Produces: `buildNotificationMessage(record, options)` and `sendNotification(options)`.

- [ ] **Step 1: Write the failing formatter test**

Create `/tmp/categorylab-notification.test.cjs` with assertions that the subject contains product, version, and supplier; the HTML contains all supplier fields and the fixed inbox link; attachment names use `品名-产品照-N.jpg`; HTML metacharacters are escaped.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test /tmp/categorylab-notification.test.cjs`

Expected: FAIL because `notification.js` does not exist.

- [ ] **Step 3: Add Nodemailer and implement the message builder**

Run: `npm install nodemailer@^7.0.0`

Implement `buildNotificationMessage(record, { from, to, inboxUrl, attachments })` returning `{ from, to, subject, html, attachments }`. Use a compact table-like HTML layout with labels for supplier, sample date, type, test category, product name, version, product spec in grams, dimensions, version changes, core ingredients and selling points, product structure, and submission time.

- [ ] **Step 4: Implement QQ SMTP delivery**

Implement `sendNotification({ smtpUser, smtpPass, message })` with `nodemailer.createTransport({ host: "smtp.qq.com", port: 465, secure: true, auth: { user: smtpUser, pass: smtpPass } })` and return the provider message ID.

- [ ] **Step 5: Run formatter tests**

Run: `node --test /tmp/categorylab-notification.test.cjs`

Expected: all formatter and attachment assertions PASS.

- [ ] **Step 6: Commit the isolated mail module**

Run:

```bash
git add cloudbase/functions/supplierFeedbackApi/notification.js cloudbase/functions/supplierFeedbackApi/package.json cloudbase/functions/supplierFeedbackApi/package-lock.json
git commit -m "Add supplier submission email formatter"
```

### Task 2: CloudBase Notification Integration

**Files:**
- Modify: `cloudbase/functions/supplierFeedbackApi/index.js`
- Test: `/tmp/categorylab-notification-integration.test.cjs`

**Interfaces:**
- Consumes: `buildNotificationMessage` and `sendNotification` from Task 1.
- Produces: `downloadNotificationAttachments(app, record)`, `notifyRecord(app, collection, record, recipients)`, and direct action `sendLatestNotificationTest`.

- [ ] **Step 1: Write failing integration tests**

Create `/tmp/categorylab-notification-integration.test.cjs` to verify that notification failure is caught after database persistence, the public supplier response excludes notification error fields, the direct test action rejects HTTP events, and the test action uses only `MAIL_TEST_TO`.

- [ ] **Step 2: Run integration tests to verify they fail**

Run: `node --test /tmp/categorylab-notification-integration.test.cjs`

Expected: FAIL because the integration helpers and direct test action do not exist.

- [ ] **Step 3: Implement environment-driven notification configuration**

Read `MAIL_SMTP_USER`, `MAIL_SMTP_PASS`, `MAIL_TEST_TO`, `MAIL_NOTIFY_TO`, `MAIL_NOTIFY_ENABLED`, and `MAIL_INBOX_URL`. Throw a clear internal error when the SMTP user, authorization code, or requested recipient is absent.

- [ ] **Step 4: Download saved CloudBase photos for attachments**

For every `image_paths[].fileID`, call `app.downloadFile({ fileID })` and create a JPG attachment named from the product and image index. Skip only files that cannot be downloaded and retain the text email.

- [ ] **Step 5: Preserve supplier submission on mail failure**

After `collection.doc(id).set(...)`, call notification only when `MAIL_NOTIFY_ENABLED === "true"`. Catch delivery errors, update `notification_status`, `notification_error`, and `updated_at`, and still return a successful supplier submission response without internal notification fields.

- [ ] **Step 6: Add direct-invocation-only latest-record test action**

When `action === "sendLatestNotificationTest"` and the event is not an HTTP event, load the newest record, send only to `MAIL_TEST_TO`, update notification metadata, and return the record ID plus SMTP message ID. Reject the same action from HTTP requests.

- [ ] **Step 7: Run integration and syntax tests**

Run:

```bash
node --test /tmp/categorylab-notification.test.cjs /tmp/categorylab-notification-integration.test.cjs
node --check cloudbase/functions/supplierFeedbackApi/index.js
node --check cloudbase/functions/supplierFeedbackApi/notification.js
```

Expected: all tests PASS and both syntax checks exit 0.

- [ ] **Step 8: Commit backend integration**

Run:

```bash
git add cloudbase/functions/supplierFeedbackApi/index.js
git commit -m "Add controlled supplier email notification"
```

### Task 3: Configure and Send One Louise-Only Test

**Files:**
- Modify: Tencent CloudBase function environment only; no credential file.
- Remove: `/tmp/categorylab-notification.test.cjs`, `/tmp/categorylab-notification-integration.test.cjs`, `/tmp/codex-cloudbase-cli`.

**Interfaces:**
- Consumes: direct action `sendLatestNotificationTest` and CloudBase environment variables.
- Produces: one real email in `louise.lu@peets.cn` using the newest supplier submission.

- [ ] **Step 1: Deploy the function with automatic delivery disabled**

Deploy `supplierFeedbackApi` to environment `louise-ai-d2gi63mlafa5599c4` with `MAIL_NOTIFY_ENABLED=false`.

- [ ] **Step 2: Have Louise enter the QQ SMTP authorization code securely**

Louise enters the authorization code directly in the Tencent CloudBase environment variable `MAIL_SMTP_PASS`. Do not paste it into chat, a shell command saved in history, source code, or GitHub.

- [ ] **Step 3: Configure non-secret environment values**

Set `MAIL_SMTP_USER`, `MAIL_TEST_TO`, `MAIL_NOTIFY_TO`, and `MAIL_INBOX_URL`; keep `MAIL_NOTIFY_ENABLED=false`.

- [ ] **Step 4: Invoke the function directly once**

Invoke with `{ "action": "sendLatestNotificationTest" }` through the CloudBase function invocation interface, not the public HTTP endpoint.

Expected: result contains `ok: true`, the newest record ID, and an SMTP message ID; only Louise receives the message.

- [ ] **Step 5: Verify the received email with Louise**

Check subject, sender display name, all field labels and values, inbox link, photo count, image readability, and whether the message reached Inbox rather than Junk.

- [ ] **Step 6: Clean temporary artifacts and commit deployment metadata changes only if any exist**

Remove all `/tmp` test and CLI directories, run `git status --short`, and leave no authorization code or generated test artifact in the repository.
