# Job App Tracker Bridge

This part of the project is still being developed and the kinks are
being worked out. Use of the Chrome Extension is not advised at this
point.

Captures job applications from Greenhouse, LinkedIn, Workday, and
Lever job postings and writes them into your `job-tracker` app. The
update flow, an Indeed scraper, a generic fallback scraper, and
client-side excelRowText/starterPromptText regeneration aren't built
yet, this proves capture end-to-end first.

## Install / set up

This extension is a **companion**, not a standalone app. It scrapes job
postings and writes them into the `job-tracker` Next.js/Mongo app that
lives elsewhere in this same repo. It has nothing to save to until that
app is running and reachable, so set that up first if you haven't:
see [`job-tracker/README.md`](../job-tracker/README.md) (native or
Docker, both covered there). Note the URL it ends up reachable at:
`http://localhost:3000` for a local dev server, or a homelab
hostname/port if you're hosting it elsewhere. You'll enter that in
step 5 below.

1. Clone this repo, if you haven't already:

   ```bash
   git clone <repo-url>
   ```

2. Go to `chrome://extensions` in Chrome.
3. Enable **Developer mode** (toggle, top right).
4. Click **Load unpacked** and select the `chrome-extension/` folder
   specifically, not the repo root. (The repo root has no
   `manifest.json`; Chrome will reject it if you pick the wrong
   folder.) Requires Chrome 114+ (side panel API).
5. Click the extension's icon in the toolbar to open it. If you don't
   see it there, click the puzzle-piece icon and pin it so it's easy to
   find later. This opens Chrome's side panel: it stays docked to the
   browser window and open across tab switches, unlike a popup that
   closes the moment it loses focus. Open settings (⚙), enter your
   `job-tracker` app's base URL from the prerequisite above, and click
   **Connect**. Chrome will prompt you to approve access to that exact
   origin the first time, since the app's URL varies by where you host
   it and can't be baked in ahead of time.
6. Open a Greenhouse, LinkedIn, Workday, or Lever job posting and click
   the extension icon (or switch to a tab that already has one open).
   It should auto-scrape and pre-fill the form. If it doesn't, see
   "What works right now" below for which sites are supported.

## What works right now

- Open a Greenhouse, LinkedIn, Workday-hosted (`*.myworkdayjobs.com`),
  or Lever (`jobs.lever.co`) job posting, and the extension auto-fills
  job title, company, URL, and job ID. Low-confidence scrapes are
  flagged "unverified, please confirm" so you know to double-check
  before saving.
  - **Greenhouse** and **Workday** are the most reliable.
  - **LinkedIn** scraping is best-effort: LinkedIn's page layout is
    obfuscated and changes without notice, so treat anything flagged
    low or medium confidence as a starting point to verify, not a fact.
  - **Lever** works, but has only been tested against one real
    posting, so treat it as less proven than the others.
  - On any unsupported site, the form is left blank for manual entry:
    nothing blocks you from typing a capture in by hand.
- The panel automatically rescans when you switch tabs or windows. If
  you're mid-edit and briefly switch away, your typed values get
  replaced by a fresh scrape without warning. Your edits are autosaved
  as a draft first, so nothing is lost, but the visible fields will
  change unexpectedly.
- Edit anything, then **Save application** to submit it to your
  `job-tracker` app. A duplicate application (same company and job ID)
  is flagged before you save, not just after, both right after a
  scrape and if you edit the company or job ID fields by hand.
- If "Create files" is checked and the save succeeds, the panel fetches
  the generated Excel row and starter-prompt text and gives you a Copy
  button for each.

## What's deliberately not built yet

- Update flow (recent list, search, status/notes editing).
- Indeed scraper and a generic fallback scraper for other sites.
- Client-side regeneration of the Excel row/starter-prompt text (these
  currently come from a lookup against your API instead).
- Notion as an alternative backend, planned as a separate, parallel
  effort; not started.

## Files

```
manifest.json                  MV3 manifest, permissions
background.js                  Enables click-to-open side panel behavior
content-scripts/greenhouse.js  Greenhouse scraper
content-scripts/linkedin.js    LinkedIn scraper
content-scripts/workday.js     Workday scraper
content-scripts/lever.js       Lever scraper
sidepanel/panel.html           Panel markup: settings + capture form
sidepanel/panel.css            Styling
sidepanel/panel.js             Permission handling, scrape request, draft autosave, submit logic
```

## Known limitations

- LinkedIn's scraper is the least reliable of the four, always confirm
  before saving.
- No duplicate-record link yet: the duplicate warning tells you it's a
  duplicate but doesn't jump you to the existing record.
- Company name on some Greenhouse and Workday postings is a
  best-effort guess rather than scraped directly; double-check it
  whenever it's flagged low-confidence.

For implementation rationale, per-scraper internals, and other rough
edges (useful if you're extending this), see
[`docs/notes.md`](./docs/notes.md).
