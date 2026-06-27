# Food Product Workstream GitHub Roadmap

This document is a working map for turning Louise's local food-product workstream into GitHub-backed assets without accidentally publishing confidential company material.

Source checked: Louise's local food-product workstream folder.

## Current Inventory

The local workstream is organized by business workflow and is already a useful source-of-truth structure.

Observed scale on 2026-06-27:

| Metric | Value |
| --- | ---: |
| Total size | 7.4G |
| Files | 1324 |
| Directories | 353 |

Largest areas:

| Area | Size | Notes |
| --- | ---: | --- |
| `08 Market Intelligence` | 3.3G | External reports, market visits, event materials, competitor scans |
| `11 Supplier Management` | 1.5G | Supplier files, qualification, product books, commercial follow-up |
| `03 Category Lab & Know-how` | 1.4G | Category exploration, images, videos, category know-how |
| `06 Product Meeting & Decks` | 994M | Product meeting decks, seasonal decks, leadership materials |
| `00 Food Business HQ` | 124M | Sales, metrics, portfolio cockpit |

Main file types:

| Type | Count |
| --- | ---: |
| PDF | 273 |
| Markdown | 150 |
| JPG | 133 |
| MJS | 123 |
| XLSX | 90 |
| DOCX | 75 |
| PPTX | 55 |
| PNG | 45 |
| MP4 | 27 |
| HTML | 22 |

## Upload Decision

Do not upload the whole folder as-is to the public `louiseboo/site` repository.

Reasons:

1. Confidentiality risk: the folder includes sales, supplier, cost, QA, personnel, testing, and leadership materials.
2. GitHub size limits: several files are larger than 100MB, including PPTX/XLSX files over 200MB and one PPTX around 783MB.
3. Tooling gap: `git lfs` is not currently installed locally.
4. Repository purpose: `louiseboo/site` is a public-facing material library, not a raw business archive.

## Recommended Architecture

Use three layers instead of one raw upload.

| Layer | Location | What Goes In |
| --- | --- | --- |
| Public site | `louiseboo/site` | Sanitized PPT/PDF/HTML artifacts that are safe to show publicly |
| Private index | private GitHub repo or local-only docs | File map, project map, non-public workstream metadata |
| Local source of truth | Louise's local food-product workstream folder | Original files, raw data, supplier docs, sales files, working drafts |

## Module Classification

| Folder | Default GitHub Treatment | Reason |
| --- | --- | --- |
| `00 Food Business HQ` | Do not publish publicly | Sales, portfolio metrics, internal business dashboard |
| `01 NPD Docs & QA` | Private only / publish only heavily redacted exports | Product docs, ingredients, QA, compliance |
| `02 Consumer Testing & Points` | Publish only anonymized HTML summaries | Raw survey and tester data should stay private |
| `03 Category Lab & Know-how` | Mixed | Generic frameworks may be public; images, SOP, BOM, and videos need review |
| `04 Store Display & Launch` | Private only | Packaging, costs, store execution, launch detail |
| `05 Leadership Weekly` | Private only | Management communication and risks |
| `06 Product Meeting & Decks` | Exclude for now | Product-meeting materials should not be part of the public first batch |
| `07 PMO & Automation` | Private only | Owners, dates, blockers, automation notes |
| `08 Market Intelligence` | Mixed | Own summaries may be public; paid or third-party reports need rights check |
| `09 Strategic Projects` | Mixed/private by default | Strategy and cross-team decisions need review |
| `10 Product Stability & Rollout` | Private only | Issue logs, stability, product fixes |
| `11 Supplier Management` | Do not publish publicly | Supplier data, qualification, quotations, commercial details |
| `12 Category Lab System` | Public candidate after review | Website/tool prototypes may be publishable if data is removed |

## Public Site Queue

Confirmed first-batch priority:

1. PPT
2. PDF
3. Word
4. Excel
5. HTML reports
6. Consumer-testing reports

Current public batch:

1. One-page anonymized consumer-testing HTML reports from `02 Consumer Testing & Points/outputs/众测评分口径`.

Excluded from the public batch:

1. Original/raw data files.
2. Product-meeting materials.
3. Third-party market reports.
4. Company-brand references; public copy should say "Food Product Work".

## GitHub Rules

Default rules for `louiseboo/site`:

1. Commit directly on `main`, matching the site workflow.
2. Upload only curated files under `decks/`.
3. Keep original local filenames only when they are safe and readable.
4. Add every uploaded artifact to `data/decks.json`.
5. Deploy after each batch and return the live URL.
6. Never publish raw Excel data, supplier documents, cost sheets, personnel files, or unredacted survey exports.

## Confirmed Decisions

1. Keep `louiseboo/site` public.
2. Public pages should use "Food Product Work" instead of company-brand language.
3. Original/raw data is not uploaded.
4. HTML files can be uploaded after cleanup.
5. Product-meeting materials are excluded for now.
6. Third-party market reports are excluded.

## Remaining Questions For Louise

These are the useful next decisions after the first public batch:

1. Should public Word and Excel files be converted to PDF first, or uploaded as editable downloads?
2. Should PPT files be published as PDF-only for easier browser review?
3. Should any Category Lab prototypes be published after removing cost, supplier, and internal-operating fields?
4. What is the maximum level of product detail allowed in public consumer-testing summaries?

## Next Execution Path

After the questions above are answered:

1. Build a candidate manifest with source path, public title, category, sensitivity level, target URL, and action.
2. Copy only approved files into `decks/`.
3. Normalize filenames for stable URLs.
4. Update `data/decks.json`.
5. Run a local site check.
6. Commit to `main`.
7. Push or use the GitHub web fallback if local GitHub auth is still blocked.
8. Deploy to Vercel and return the live URL.
