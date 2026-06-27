# My website, my field.

Louise's public-facing home for food-product decks, launch materials, and review-ready PPT artifacts.

[Open the site](https://louiseboo-site.vercel.app) · [Browse the deck data](data/decks.json)

---

## Why this exists

I work in food product management: category strategy, product development, consumer testing, supplier coordination, launch execution, and post-launch review.

This site is the place where those materials can become easy to open, easy to review, and easy to keep over time.

Not a portfolio page.
Not a generic slide dump.

A practical field library for the work behind food products.

## What lives here

- Product committee and leadership decks
- PPT / PDF / HTML versions of launch and review materials
- Food category strategy, product-testing, and rollout documentation
- Lightweight public-facing pages that make materials easier to inspect

The current version is an experiment build. It validates the site shell, deck-card system, search/filter interaction, upload workflow, and Vercel deployment path before real PPT files are added.

## How I use it

1. Put PPT, PDF, or exported HTML files under `decks/`.
2. Add or update the matching record in `data/decks.json`.
3. Commit directly on `main`.
4. Deploy with Vercel.
5. Open the live URL and review the page like a real reader would.

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
