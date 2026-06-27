# Food Product Work

Louise's public-facing library for food-product work: readable decks, report pages, and review-ready artifacts without raw business data.

[Open the site](https://louiseboo-site.vercel.app) · [Browse the deck data](data/decks.json)

---

## Why this exists

I work in food product management: category strategy, product development, consumer testing, supplier coordination, launch execution, and post-launch review.

This site is the place where those materials can become easy to open, easy to review, and easy to keep over time.

Not a portfolio page.
Not a generic slide dump.

A practical field library for the work behind food products.

## What lives here

- PPT, PDF, Word, Excel, and exported HTML files that are safe to publish
- Anonymized consumer-testing report pages
- Food category, product-testing, and rollout summaries
- Lightweight public-facing pages that make materials easier to inspect

Raw data, third-party market reports, product-meeting materials, and company-brand references are kept out of the public repository.

The current version is an experiment build. It validates the site shell, deck-card system, search/filter interaction, upload workflow, and Vercel deployment path with the first public HTML report batch.

## How I use it

1. Put PPT, PDF, or exported HTML files under `decks/`.
2. Add or update the matching record in `data/decks.json`.
3. Commit directly on `main`.
4. Deploy with Vercel.
5. Open the live URL and review the page like a real reader would.

For public uploads, make a clean copy first: remove raw rows, names, private notes, company marks, supplier details, cost data, and third-party report content.

## Design principles

Food work needs evidence, not decoration.

- Keep the page restrained, warm, and business-readable.
- Let real materials carry the story.
- Make every card answer: what is this, why does it matter, and where should I open it?
- Prefer clear product-manager language over vague strategy language.
- Build for repeated use, not one-off presentation drama.

## File map

| Path | Role |
| --- | --- |
| `index.html` | Static PPT library page |
| `styles.css` | Visual system and responsive layout |
| `data/decks.json` | Editable deck library data |
| `decks/` | Upload target for PPT, PDF, and exported HTML |
| `assets/` | Visual assets used by the site |
| `vercel.json` | Vercel static-site settings |

## Current live URL

The working deployment is:

```text
https://louiseboo-site.vercel.app
```
