# Job App Tracker - WIP
This part of the project is still being developed and the kinks being worked 
out. 

# Job App Tracker Bridge — Phase 0 (scaffold + Greenhouse + LinkedIn capture)

Status: task 1 (scaffold), task 2's Greenhouse and LinkedIn scrapers, and
the first half of task 3 (capture flow against Mongo) from
`phase-0-scope.md`. Update flow, Indeed, the generic fallback, and the
excelRowText/starterPromptText regeneration client-side aren't built —
this proves capture end-to-end first.

## Load it

1. `chrome://extensions` → enable Developer mode → **Load unpacked** →
   select this folder. Requires Chrome 114+ (side panel API).
2. Click the extension icon — this opens Chrome's **side panel**, docked
   to the browser window. Open settings (⚙), enter your Next.js app's
   base URL (e.g. `http://localhost:3000` or your homelab hostname), and
   click **Connect**.

## Why the side panel instead of a popup or a standalone window

Anchored browser-action popups close the instant they lose focus — a
hard Chrome platform behavior. A detached `chrome.windows.create` window
fixes that, but introduces a different problem: it's just another
window, easy to lose behind your job-search tabs and everything else
open.

The side panel solves both: it's docked to the browser window itself
(`manifest.json`'s `side_panel.default_path`, enabled on icon-click via
`chrome.sidePanel.setPanelBehavior` in `background.js`), so it can't get
buried behind other windows, and it stays open across tab switches
within that window rather than closing on blur. On top of that, form
values still autosave to a draft in `chrome.storage.local` (cleared once
a save actually succeeds), so even closing the panel outright doesn't
lose an in-progress capture. A **Clear** button next to Rescan wipes the
draft and starts fresh.

**Permission note:** `sidePanel` and `tabs` are both required — `tabs`
so the panel can read whatever tab you're currently looking at as you
switch around while it stays open (plain `activeTab` only covers the
tab active at the moment you first clicked the icon). `tabs` is broader:
it lets the extension read the URL/title of any open tab, not just
that one.

**Not wired up yet:** the panel doesn't currently auto-rescan when you
switch to a different job posting tab — you still click Rescan. Could
add a `chrome.tabs.onActivated` listener for that if useful.

## Why "Connect" instead of it just working

Your API's origin isn't fixed (localhost in dev, a homelab hostname
otherwise), so it can't be hardcoded into `manifest.json`'s
`host_permissions` at build time. Instead, `manifest.json` declares
`localhost` and `<all_urls>` as **optional** host permissions, and the
popup requests permission for the *exact* origin you type in, via
`chrome.permissions.request`. Chrome will show a one-time approval
prompt the first time; after that it's granted until you revoke it in
`chrome://extensions`.

If you'd rather skip that runtime-prompt UX for your own homelab
hostname, you can instead hardcode it directly into
`host_permissions` in `manifest.json` (e.g.
`"http://homelab.local:3000/*"`) and drop the Connect step — that's a
one-line change once you know the final hostname.

## What works right now

- Open a Greenhouse or LinkedIn job posting. Content scripts run
  automatically on `*.greenhouse.io` and `linkedin.com/jobs/*`.
- Click the extension icon (opens the side panel) — it scrapes
  `jobTitle`, `company`, `jobUrl`, `jobId` from the page and pre-fills
  the form. Low-confidence scrapes are flagged "unverified — please
  confirm."
  - **Greenhouse:** prefers the page's JSON-LD `JobPosting` schema,
    falls back to DOM selectors, then `document.title` parsing.
  - **LinkedIn:** same fallback order, but the DOM selectors here are on
    much shakier ground — LinkedIn's markup is unstable, differs
    between logged-in and public views, and changes without notice.
    Treat medium/low-confidence LinkedIn scrapes as a starting point to
    verify, not a fact. `jobId` is pulled from the URL path
    (`/jobs/view/<id>`, or a trailing `-<id>` slug) or, when you're
    viewing a job from inside search/collections results, from the
    `?currentJobId=` query param — the saved `jobUrl` is normalized to
    the canonical `/jobs/view/<id>/` form when an id was found, since
    search/collections URLs aren't stable permalinks to the posting.
- Edit anything, then **Save application** →
  `POST {apiBaseUrl}/api/job-applications` with
  `{ company, jobId, jobTitle, jobUrl, createFiles }`.
- A 409 response is surfaced as a clear "already applied" message
  instead of a generic error.
- If the API is unreachable (e.g. homelab server down), you get an
  explicit "could not reach the Mongo API" message rather than a
  silent failure.
- On any non-Greenhouse page, the scraper step is skipped and the form
  is left blank for manual entry — nothing blocks you from typing a
  capture in by hand.
- **If "Create files" is checked and the save succeeds**, the panel does
  a follow-up `GET /api/job-applications`, finds the just-created record
  by `_id`/`id`, and pulls `excelRowText`/`starterPromptText` off it —
  the API doesn't return those from the POST itself, so this is a
  second request against the list endpoint, filtered client-side, since
  that's the only GET endpoint currently confirmed to exist. Each field
  gets its own read-only box with a Copy button. Copying uses
  `navigator.clipboard.writeText()` on the raw string (not a DOM
  selection), so tabs/newlines/special characters in the Excel row
  survive exactly — selection-based copying can silently collapse
  whitespace, which is what usually breaks a tab-separated paste into
  Excel.

  **Known rough edge:** this pulls your *entire* application list on
  every save just to find one record. Fine at ~300 records, but if you
  ever get (or already have) a `GET /api/job-applications/[id]`
  endpoint, that'd be a much cheaper swap — one line change in
  `fetchCreatedRecord()`.

## What's deliberately not built yet

- Update flow (recent list, search, status/notes `PATCH`) — task 4.
- Indeed scraper and the generic fallback — rest of task 2.
- The `excelRowText`/`starterPromptText` regeneration + copy buttons
  originally scoped as client-side — currently these come from a
  post-add lookup against your API instead (see below), not client-side
  template logic, since I don't have `generateOutputs.ts` to port.
- Notion spike — task 6, separate and parallel per the scope doc.

## Files

```
manifest.json                  MV3 manifest, permissions
background.js                  Enables click-to-open side panel behavior
content-scripts/greenhouse.js  Greenhouse scraper (JSON-LD → DOM → title fallback)
content-scripts/linkedin.js    LinkedIn scraper (JSON-LD → DOM → title fallback)
sidepanel/popup.html           Panel markup: settings + capture form
sidepanel/popup.css            Styling
sidepanel/popup.js             Permission handling, scrape request, draft autosave, submit logic
```

## Known rough edges worth knowing about before you build on top of this

- `jobId` on Greenhouse is parsed from the URL path (`/jobs/<digits>`).
  If a board you use has a different URL shape, that'll come back
  empty — worth checking against a couple of real postings you've
  actually applied to.
- The Greenhouse company-name DOM fallback guesses at a few common
  layouts; I haven't been able to verify these against a live page from
  here. The JSON-LD path is much more trustworthy when present.
- LinkedIn's DOM selectors are on genuinely unstable ground — I'm
  fairly confident about the URL/id parsing, much less confident about
  the class-name selectors, since LinkedIn's markup is obfuscated,
  varies by auth state, and changes without notice. Worth testing
  against a few real postings (both logged-in and, if you use it,
  logged-out) before trusting it unattended.
- No duplicate-record link on 409 yet (scope doc mentions "ideally
  linking to the existing record") — right now it just tells you it's a
  duplicate. Can wire that up once the update flow exists to jump to it.
