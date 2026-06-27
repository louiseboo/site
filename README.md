# luis-site

Louise's static PPT library and review site.

Site URL: https://luis-site.vercel.com

## Purpose

This repository stores the public-facing shell for Louise's PPT materials. New PPT, PDF, or exported HTML files can be uploaded into the site, listed in the library data file, and deployed directly from `main`.

The current version is an experiment build: it validates the homepage layout, deck-card system, search/filter interaction, upload workflow, and Vercel deployment path before real PPT files are added.

## Workflow

1. Put PPT, PDF, or exported HTML files under `decks/`.
2. Add or update the matching record in `data/decks.json`.
3. Commit directly on `main`.
4. Deploy with Vercel.
5. Return the live URL for review.

## File Map

- `index.html` renders the PPT library page.
- `styles.css` owns the visual system and responsive layout.
- `data/decks.json` is the editable deck library list.
- `decks/` is the upload target for PPT/PDF/HTML files.
- `assets/` stores visual assets used by the site.
- `vercel.json` stores Vercel static-site settings.

## Design Direction

The site follows the existing executive deck direction: charcoal and cream surfaces, restrained orange/gold/sage accents, dense but readable cards, and direct product-manager language. It should feel like a practical material library, not a marketing landing page.
