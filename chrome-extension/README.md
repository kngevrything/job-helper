# Job App Tracker - WIP

This part of the project is still being developed and the kinks being worked
out. Use of the Chrome Extension is not advised at this point.

# Job App Tracker Bridge — Phase 0 (scaffold + Greenhouse + LinkedIn capture)

Status: task 1 (scaffold), task 2's Greenhouse, LinkedIn, Workday, and
Lever scrapers, and the first half of task 3 (capture flow against
Mongo) from `phase-0-scope.md`. Update flow, Indeed, the generic
fallback, and client-side excelRowText/starterPromptText regeneration
aren't built — this proves capture end-to-end first.

## Install / set up

This extension is a **bridge**, not a standalone app — it scrapes job
postings and writes them into the `job-tracker` Next.js/Mongo app that
lives elsewhere in this same repo. It has nothing to save to until that
app is running and reachable, so set that up first if you haven't:
see [`job-tracker/README.md`](../job-tracker/README.md) (native or
Docker, both covered there). Note the URL it ends up reachable at —
`http://localhost:3000` for a local dev server, or a homelab
hostname/port if you're hosting it elsewhere — you'll enter that in
step 5 below.

1. Clone this repo, if you haven't already:

   ```bash
   git clone <repo-url>
   ```

2. Go to `chrome://extensions` in Chrome.
3. Enable **Developer mode** (toggle, top right).
4. Click **Load unpacked** and select the `chrome-extension/` folder
   specifically — not the repo root. (The repo root has no
   `manifest.json`; Chrome will reject it if you pick the wrong
   folder.) Requires Chrome 114+ (side panel API).
5. Click the extension's icon in the toolbar to open it — if you don't
   see it there, click the puzzle-piece icon and pin it so it's easy to
   find later. This opens Chrome's **side panel**, docked to the browser
   window rather than a popup (see below for why). Open settings (⚙),
   enter your `job-tracker` app's base URL from the prerequisite above,
   and click **Connect**. Chrome will prompt you to approve access to
   that exact origin the first time — that's expected, see "Why
   'Connect' instead of it just working" below for why the origin isn't
   just hardcoded.
6. Open a Greenhouse, LinkedIn, Workday, or Lever job posting and click
   the extension icon (or switch to a tab that already has one open) —
   it should auto-scrape and pre-fill the form. If it doesn't, see
   "What works right now" below for which sites are supported and what
   each scraper actually does.

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

**Auto-rescan:** the panel now rescans automatically on tab switch, on
tab navigation completing, and on browser window focus change — no
more manually clicking Rescan after switching tabs. If the newly active
tab's content script isn't reachable (most commonly: that tab was
already open before the extension was loaded/reloaded, so Chrome never
auto-injected it), the panel injects it on demand via
`chrome.scripting.executeScript` and retries once, instead of asking
you to reload the tab yourself.

**Known trade-off:** auto-rescan overwrites whatever's currently in the
form the moment it detects a switch to a recognized job site — so if
you're mid-edit and briefly alt-tab away and back, expect your typed
values to get replaced by a fresh scrape rather than preserved. The
300ms draft autosave should have already captured your edits before you
switched, so nothing's unrecoverable, but the visible fields will
change without a prompt. The tab/window listeners also aren't scoped to
just this panel's own window — switching tabs in an unrelated browser
window triggers a redundant (harmless, just wasted) rescan too, since
there's no cheap way to filter that from a side panel context.

## Why "Connect" instead of it just working

Your API's origin isn't fixed (localhost in dev, a homelab hostname
otherwise), so it can't be hardcoded into `manifest.json`'s
`host_permissions` at build time. Instead, `manifest.json` declares
`localhost` and `<all_urls>` as **optional** host permissions, and the
panel requests permission for the _exact_ origin you type in, via
`chrome.permissions.request`. Chrome will show a one-time approval
prompt the first time; after that it's granted until you revoke it in
`chrome://extensions`.

If you'd rather skip that runtime-prompt UX for your own homelab
hostname, you can instead hardcode it directly into
`host_permissions` in `manifest.json` (e.g.
`"http://homelab.local:3000/*"`) and drop the Connect step — that's a
one-line change once you know the final hostname.

## What works right now

- Open a Greenhouse, LinkedIn, Workday-hosted (`*.myworkdayjobs.com`
  — Autodesk and many other large employers), or Lever (`jobs.lever.co`)
  job posting. Content scripts run automatically on all four.
- Click the extension icon (opens the side panel) — it scrapes
  `jobTitle`, `company`, `jobUrl`, `jobId` from the page and pre-fills
  the form. Low-confidence scrapes are flagged "unverified — please
  confirm."
  - **Greenhouse:** prefers the page's JSON-LD `JobPosting` schema,
    falls back to DOM selectors, then `document.title` parsing. Confirmed
    live that `job-boards.greenhouse.io` (the newer React layout,
    distinct from legacy `boards.greenhouse.io`) emits no JSON-LD and
    doesn't match the legacy DOM company selectors — its `h1` still
    yields a job title via the generic DOM fallback, but company comes
    back empty from all three main tiers. Two more sources kick in
    specifically to backfill company when that happens:
    `"Job Application for {Title} at {Company}"` — this layout's actual
    `<title>` format, no dash/pipe separator so it doesn't match the
    dash-split parsing above — and, as a last resort, the company slug
    already present in every Greenhouse job URL
    (`{boards,job-boards}.greenhouse.io/{company}/jobs/{id}`), title-cased
    as a guess with no claim its casing matches the real branding.
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
  - **Workday:** tries Workday's own internal JSON API first
    (`/wday/cxs/{tenant}/{site}/job/{externalPath}`, same-origin fetch
    from the content script — the same endpoint the page's own React app
    calls) for title/company, but `jobId` always comes from parsing the
    URL slug directly, never from the API. Live-testing on a real
    Autodesk posting showed the API's id-ish fields hold Workday's
    internal routing identifier, which is just the full URL slug again
    — not the short requisition number actually shown on the page — so
    that field is ignored entirely. The URL-parsing extraction (e.g.
    `Principal-Software-Engineer_26WD97962-1` → `26WD97962`) has been
    verified against two real tenants (Autodesk and SHI). Company name
    isn't in page metadata either way, so it's guessed from the tenant
    subdomain (`autodesk` → `Autodesk`) when the API doesn't supply
    one — never treated as high-confidence.
  - **Lever:** `company` and posting id come directly from the URL path
    (`jobs.lever.co/{company}/{postingId}`) — the posting id is an
    opaque UUID used as-is, no parsing needed. For the human-readable
    company name, prefers JSON-LD (if present, unverified) or
    `og:title` — Lever's format is `"{Company} - {Job Title}"`, company
    **first**, the opposite order from Greenhouse/LinkedIn — falling
    back to `document.title`, and only guessing from the URL slug
    (never above medium-confidence) if none of those produced a name.
    Verified against one real Lever posting, same single-sample caveat
    as the other non-Greenhouse scrapers.
- Edit anything, then **Save application** →
  `POST {apiBaseUrl}/api/job-applications` with
  `{ company, jobId, jobTitle, jobUrl, createFiles }`.
- A 409 response is surfaced as a clear "already applied" message
  instead of a generic error.
- **Duplicate warning on scrape, not just on submit:** right after a
  scrape (or a restored draft) populates the form, the panel calls
  `GET {apiBaseUrl}/api/job-applications/check?company=&jobId=` — a
  read-only sibling of the POST route's own `{ company, jobId }`
  duplicate check — and shows "Already applied — STATUS, applied
  &lt;date&gt;" if it finds a match, before you've invested any effort
  filling out the rest of the form. This is an early warning only, not
  a lock — Save stays enabled regardless, and the POST's 409 (backed by
  the real unique index) stays the authoritative last word, since the
  check-then-act gap between this GET and a later Save is real (e.g.
  the Next.js app open in another tab at the same time). Fails silently
  on any network/API error, same as the rest of the capture flow. The
  same check also re-fires on manual edits to the Company/Job ID
  fields — not just on scrape — so fixing a bad scrape or typing in a
  capture by hand (a site with no scraper) still gets flagged: a
  600ms debounce while you're actively typing, and immediately on blur
  so tabbing out of the field doesn't wait out the debounce.
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

  **Known rough edge:** this pulls your _entire_ application list on
  every save just to find one record. Fine at ~300 records, but if you
  ever get (or already have) a `GET /api/job-applications/[id]`
  endpoint, that'd be a much cheaper swap — one line change in
  `fetchCreatedRecord()`.

## What's deliberately not built yet

- Update flow (recent list, search, status/notes `PATCH`) — task 4.
- Indeed scraper and the generic fallback — rest of task 2. (Lever is
  now built — see "What works right now" above.)
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
content-scripts/workday.js     Workday scraper (internal JSON API → meta/DOM fallback)
content-scripts/lever.js       Lever scraper (URL path for id/company → JSON-LD/og:title for names)
sidepanel/panel.html           Panel markup: settings + capture form
sidepanel/panel.css            Styling
sidepanel/panel.js             Permission handling, scrape request, draft autosave, submit logic
```

## Known rough edges worth knowing about before you build on top of this

- `jobId` on Greenhouse is parsed from the URL path (`/jobs/<digits>`).
  If a board you use has a different URL shape, that'll come back
  empty — worth checking against a couple of real postings you've
  actually applied to.
- The Greenhouse company-name DOM fallback guesses at a few common
  layouts; I haven't been able to verify these against a live page from
  here. The JSON-LD path is much more trustworthy when present.
- Confirmed live (SecurityScorecard posting on `job-boards.greenhouse.io`)
  that this newer layout emits no JSON-LD and misses the legacy DOM
  company selectors, which is what the `"... at {Company}"` title-parse
  and URL-slug-guess fallbacks above exist for — but only that one
  posting has actually been checked. If `job-boards.greenhouse.io`'s
  title format varies by tenant, or a tenant's slug doesn't resemble
  their real name at all, this will still come back with a guess you
  need to double check, not an empty field.
- LinkedIn's DOM selectors are on genuinely unstable ground — I'm
  fairly confident about the URL/id parsing, much less confident about
  the class-name selectors, since LinkedIn's markup is obfuscated,
  varies by auth state, and changes without notice. Worth testing
  against a few real postings (both logged-in and, if you use it,
  logged-out) before trusting it unattended.
- Workday's internal JSON API does respond (confirmed live on a real
  Autodesk posting), but not every field on it should be trusted — its
  id-ish fields turned out to hold the full URL slug rather than the
  short requisition number, so `jobId` intentionally ignores the API
  entirely and relies only on URL parsing, which has held up across two
  real tenants (Autodesk, SHI). Title/company from the API weren't
  observed to have the same problem, but that's based on one tenant's
  live behavior, not a guarantee across all Workday deployments.
- No duplicate-record link on 409 yet (scope doc mentions "ideally
  linking to the existing record") — right now it just tells you it's a
  duplicate. Can wire that up once the update flow exists to jump to it.
- Lever's JSON-LD tier is untested — I haven't confirmed a real Lever
  posting that actually emits a `JobPosting` schema block, unlike
  Greenhouse/LinkedIn where that's been observed directly. The
  `og:title` tier is the one that's actually been verified live, and
  only against a single posting/tenant.
