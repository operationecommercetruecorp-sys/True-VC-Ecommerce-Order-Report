# VC Ecommerce — Sales & Fulfillment Dashboard

Standalone, single-file HTML dashboard (React + Recharts, loaded from CDN) for VC
Ecommerce order data. No build step — open `index.html` in a browser, or serve it
statically (e.g. GitHub Pages), and it auto-loads the latest data from the linked
Google Sheet on every page load.

**Live data source:** [Google Sheet](https://docs.google.com/spreadsheets/d/1bYyHpuElzEqgacVLz6iDJ056XdpG_iPvH5YNLtToPto/edit)
(private — access is brokered through the Apps Script proxy below, so the sheet
itself never needs to be shared publicly).

## How it works

```
Google Sheet (private)
   │  read server-side by the deploying account
   ▼
Apps Script Web App  (apps-script/Code.gs)
   │  formats every date cell to a fixed DD/MM/YYYY HH:mm string,
   │  serializes the whole sheet to CSV
   ▼
index.html  (fetch() on load)
   │  PapaParse → cleanRows() → typed row objects
   │  parseDate() reconstructs a JS Date from the fixed string format
   ▼
Dashboard UI (KPIs, charts, tables)
```

If the live fetch fails for any reason (network, deployment access, sheet
structure change), the dashboard falls back to its last-known embedded dataset
and shows a banner explaining why, rather than showing a blank page. You can
also manually upload a `.csv`/`.xlsx` export at any time via the upload button
in the header — it goes through the same `cleanRows()` pipeline.

## Why date parsing needed extra care

Google Sheets stores "Order Create Date" as a real date/time value, not text.
Two independent layers previously caused dates to silently disappear from
charts, so both are handled explicitly now:

1. **Export side (`apps-script/Code.gs`)** — When Apps Script reads a date cell
   with `getValues()`, it comes back as a native JS `Date` object in whatever
   timezone/locale the Apps Script runtime defaults to. Left alone, that can
   serialize inconsistently between runs. `Code.gs` now force-formats every
   column listed in `DATE_COLUMNS` to a single fixed shape —
   `DD/MM/YYYY HH:mm` — in the *sheet's own* timezone, before it's ever turned
   into CSV.
2. **Parse side (`index.html` → `parseDate()`)** — Accepts that fixed
   `DD/MM/YYYY HH:mm` shape without requiring zero-padding (`2/8/2026 9:14` is
   valid), plus `YYYY-MM-DD`/`YYYY/MM/DD` and free-text month formats as a
   fallback for manually-uploaded files that weren't produced by the proxy.
   It also guards against an implausible future date (a classic symptom of a
   day/month swap introduced somewhere upstream) by swapping day↔month back
   when that lands the date in the plausible past.

Blank cells, `-`, `#N/A`, and `N/A` are treated as "no date" everywhere in the
pipeline and excluded from date-bucketed calculations rather than crashing or
silently zeroing them out.

## Required columns

`cleanRows()` in `index.html` expects these headers (case-sensitive) to be
present in whatever CSV/XLSX it's given, whether from the live proxy or a
manual upload:

```
Order Create Date, Order ID, Order operator, Order Type, Order Status,
Payment Status, Order Workflow Status, Order Cancelled reason,
Order Fulfillment Success/Failed reason, Brand Name, Product Name,
Material Code, quantity, Total Payment, Delivery Type, Delivery Shop Name,
Shipping Address Province, Current Package RC, New Package RC,
Total day to customer
```

Any other columns in the source sheet are ignored — they don't need to be
removed.

## Setting up the Apps Script proxy (one-time, or after a redeploy)

1. Open the Google Sheet → **Extensions → Apps Script**.
2. Replace the script content with [`apps-script/Code.gs`](apps-script/Code.gs)
   from this repo (or copy it in fresh).
3. Confirm `SHEET_ID` at the top matches the sheet's ID from its URL.
4. **Deploy → New deployment → type: Web app.**
   - Execute as: **Me** (the deploying account — this is what lets the sheet
     itself stay private).
   - Who has access: **Anyone** (required for the browser `fetch()` in
     `index.html` to reach it without a Google login prompt).
5. Copy the resulting `/exec` URL and paste it into `SHEET_CSV_URL` in
   `index.html` (search for `SHEET_CSV_URL`).
6. Optional: run `testDateFormatting()` from the Apps Script editor (**Run**
   menu) first to sanity-check the date output before deploying.

Re-deploying after edits requires **Deploy → Manage deployments → edit (pencil)
→ New version** — editing the script alone does not update the live `/exec`
URL's behavior until you publish a new version.

## Editing the dashboard

Everything lives in `index.html` — no build step, no `npm install`. Open it in
a browser to preview changes locally, or point any static file server at the
folder. Key sections (searchable by comment headers in the file):

- `cleanRows()` / `pick()` — field mapping from raw sheet columns to the
  dashboard's internal row shape. Any new column a widget needs must be wired
  in here or it silently drops from live data.
- `parseDate()` / `parseDateRaw()` — date parsing, described above.
- `bucketTDC()` — converts raw "Total day to customer" numbers into the fixed
  buckets used by the delivery-speed widgets.
- `TABS` — the All Data / Device / Postpaid / Prepaid / IOT tab filters.

## Deploying / sharing

This is a static file — commit changes to this repo and either:

- **GitHub Pages**: enable Pages on this repo (Settings → Pages → deploy from
  `main` / root), and share the resulting `https://<user>.github.io/<repo>/`
  URL, or
- Share `index.html` directly (e.g. via SharePoint) — overwriting the same
  file preserves any existing share link.

Either way, the dashboard always fetches fresh data from the live Google
Sheet on load — there's no separate "publish the data" step.
