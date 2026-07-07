# Louise Boo / Food Product Work

Personal food-product workspace for category systems, consumer-testing readouts,
and browser-ready product notes.

[Open the site](https://louiseboo-site.vercel.app) · [Open Category Lab](https://louiseboo-site.vercel.app/decks/category-lab/categorylab)

---

## What This Is

This repo powers a public-facing homepage for Louise Boo's food product work.
It is designed like a working field shelf: fast to open, easy to scan, and
warm enough to feel personal.

The first featured workspace is **Category Lab**, a browser page for category
thinking, product signals, and system experiments. The library also includes
consumer-testing and product-validation report pages.

## Category Lab Supabase

Category Lab keeps the public pages on Vercel and uses Supabase as the long-term
data layer for supplier submissions, images, internal accounts, and permissions.

### Setup

1. Create a Supabase project.
2. Open Supabase SQL Editor and run `supabase/categorylab_schema.sql`.
3. Create internal users in Supabase Auth.
4. Set roles in SQL:

```sql
update public.categorylab_profiles
set role = 'owner'
where email = 'your-email@example.com';
```

Valid roles are `owner`, `pm`, `viewer`, and `supplier`. `owner` and `pm` can
edit feedback and import records into Category Lab. `viewer` can read only.
Suppliers can use the public form without registration.

5. Fill `decks/category-lab/supabase-config.js` with the public project URL and
Publishable key from Supabase Project Settings > API Keys.

```js
window.CATEGORYLAB_SUPABASE = {
  url: "https://your-project.supabase.co",
  anonKey: "your-public-publishable-key",
  bucket: "supplier-feedback-images"
};
```

### Links

- Supplier form: `/supplier-submit`
- Internal inbox: `/supplier-inbox`
- Category Lab: `/decks/category-lab/categorylab`

## Current Highlights

- **Category Lab 个人工作台** - the main food category workbench.
- **Consumer Testing Reports** - product readouts for cakes, candy, and bread.
- **Food Product Lens** - category strategy, testing signals, launch thinking,
  and practical product systems.

## Design Direction

The homepage uses a personal-profile structure with a food-product identity:
warm paper, tomato red, matcha green, butter yellow, charcoal type, and an
original kawaii cat food illustration for a softer profile signal.

## File Map

| Path | Role |
| --- | --- |
| `index.html` | Homepage and library UI |
| `styles.css` | Visual system and responsive layout |
| `data/decks.json` | Editable library data |
| `decks/` | Browser-ready materials |
| `supabase/categorylab_schema.sql` | Database, storage, auth profile, and RLS setup |
| `assets/` | Site imagery and marks |
| `vercel.json` | Vercel static-site settings |

## Live URL

```text
https://louiseboo-site.vercel.app
```
