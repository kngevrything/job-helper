# Design notes

Implementation rationale, scraper internals, and known rough edges for
anyone building on top of this extension. None of this is needed to
install or use it, see [`README.md`](../README.md) for that.

## Why the side panel instead of a popup or a standalone window

Chrome's default anchored extension window closes the instant it loses
focus, a hard platform behavior. A detached `chrome.windows.create`
window fixes that, but introduces a different problem: it's just
another window, easy to lose behind your job-search tabs and
everything else open.

The side panel solves both: it's docked to the browser window itself
(`manifest.json`'s `side_panel.default_path`, enabled on icon-click
via `chrome.sidePanel.setPanelBehavior` in `background.js`), so it
can't get buried behind other windows, and it stays open across tab
switches within that window rather than closing on blur. On top of
that, form values still autosave to a draft in `chrome.storage.local`
(cleared once a save actually succeeds), so even closing the panel
outright doesn't lose an in-progress capture. A **Clear** button next
to Rescan wipes the draft and starts fresh.

**Permission note:** `sidePanel` and `tabs` are both required. `tabs`
so the panel can read whatever tab you're currently looking at as you
switch around while it stays open (plain `activeTab` only covers the
tab active at the moment you first clicked the icon). `tabs` is
broader: it lets the extension read the URL/title of any open tab, not
just that one.

**Auto-rescan:** the panel rescans automatically on tab switch, on tab
navigation completing, and on browser window focus change. If the
newly active tab's content script isn't reachable (most commonly: that
tab was already open before the extension was loaded/reloaded, so
Chrome never auto-injected it), the panel injects it on demand via
`chrome.scripting.executeScript` and retries once, instead of asking
you to reload the tab yourself.

**Known trade-off:** auto-rescan overwrites whatever's currently in
the form the moment it detects a switch to a recognized job site, so
if you're mid-edit and briefly alt-tab away and back, expect your
typed values to get replaced by a fresh scrape rather than preserved.
The 300ms draft autosave should have already captured your edits
before you switched, so nothing's unrecoverable, but the visible
fields will change without a prompt. The tab/window listeners also
aren't scoped to just this panel's own window: switching tabs in an
unrelated browser window triggers a redundant (harmless, just wasted)
rescan too, since there's no cheap way to filter that from a side
panel context.

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
`"http://homelab.local:3000/*"`) and drop the Connect step, that's a
one-line change once you know the final hostname.

## Scraper implementation details

All four scrapers are also documented at the top of their own
`content-scripts/*.js` file; this is the same information gathered in
one place for a quicker read.

### Greenhouse

Prefers the page's JSON-LD `JobPosting` schema, falls back to DOM
selectors, then `document.title` parsing.

Confirmed live that `job-boards.greenhouse.io` (the newer React
layout, distinct from legacy `boards.greenhouse.io`) emits no JSON-LD
and doesn't match the legacy DOM company selectors. Its `h1` still
yields a job title via the generic DOM fallback, but company comes
back empty from all three main tiers. Two more sources kick in
specifically to backfill company when that happens:
`"Job Application for {Title} at {Company}"`, this layout's actual
`<title>` format (no dash/pipe separator, so it doesn't match the
dash-split parsing above), and, as a last resort, the company slug
already present in every Greenhouse job URL
(`{boards,job-boards}.greenhouse.io/{company}/jobs/{id}`), title-cased
as a guess with no claim its casing matches the real branding.

`jobId` is parsed from the URL path (`/jobs/<digits>`). If a board you
use has a different URL shape, that'll come back empty, worth checking
against a couple of real postings you've actually applied to. The
company-name DOM fallback guesses at a few common layouts that haven't
been verified against a live page. The `job-boards.greenhouse.io`
fallbacks above have only been confirmed against one posting
(SecurityScorecard); if that layout's title format varies by tenant,
or a tenant's slug doesn't resemble their real name at all, this will
still come back with a guess you need to double check, not an empty
field.

### LinkedIn

Same fallback order as Greenhouse, but the DOM selectors here are on
much shakier ground: LinkedIn's markup is unstable, differs between
logged-in and public views, and changes without notice. Treat
medium/low-confidence LinkedIn scrapes as a starting point to verify,
not a fact.

`jobId` is pulled from the URL path (`/jobs/view/<id>`, or a trailing
`-<id>` slug) or, when you're viewing a job from inside
search/collections results, from the `?currentJobId=` query param. The
saved `jobUrl` is normalized to the canonical `/jobs/view/<id>/` form
when an id was found, since search/collections URLs aren't stable
permalinks to the posting.

I'm fairly confident about the URL/id parsing, much less confident
about the class-name selectors, since LinkedIn's markup is obfuscated,
varies by auth state, and changes without notice. Worth testing
against a few real postings (both logged-in and, if you use it,
logged-out) before trusting it unattended.

### Workday

Tries Workday's own internal JSON API first
(`/wday/cxs/{tenant}/{site}/job/{externalPath}`, same-origin fetch
from the content script, the same endpoint the page's own React app
calls) for title/company, but `jobId` always comes from parsing the
URL slug directly, never from the API. Live-testing on a real Autodesk
posting showed the API's id-ish fields hold Workday's internal routing
identifier, which is just the full URL slug again, not the short
requisition number actually shown on the page, so that field is
ignored entirely. The URL-parsing extraction (e.g.
`Principal-Software-Engineer_26WD97962-1` -> `26WD97962`) has been
verified against three real tenants (Autodesk, SHI, and Yahoo). Company
name isn't in page metadata either way, so it's guessed from the tenant
subdomain (`autodesk` -> `Autodesk`) when the API doesn't supply one,
never treated as high-confidence.

`externalPath` (the slug used in the API call and in requisition-id
parsing) is taken from the last segment of the URL path, not a fixed
offset from the `job`/`details` anchor segment. Confirmed live on a
real Yahoo posting (`ouryahoo.wd5.myworkdayjobs.com`) that some tenants
insert an extra location segment between `job` and the real slug
(`/en-US/careers/job/United-States-of-America/Senior-...-Tools_JR0027211`),
which would have been misparsed as the externalPath if the code assumed
the slug always comes immediately after `job`/`details`. Taking the
last path segment instead works for both that shape and the simpler
Autodesk/SHI shape, where the slug was already the last segment.

The internal JSON API does respond (confirmed live on real Autodesk and
Yahoo postings), but not every field on it should be trusted, as above.
The URL-parsing extraction has held up across three real tenants
(Autodesk, SHI, Yahoo); title/company from the API weren't observed to
have the same problem, but that's based on a handful of tenants' live
behavior, not a guarantee across all Workday deployments.

### Lever

`company` and posting id come directly from the URL path
(`jobs.lever.co/{company}/{postingId}`): the posting id is an opaque
UUID used as-is, no parsing needed. For the human-readable company
name, prefers JSON-LD (if present, unverified) or `og:title`, Lever's
format is `"{Company} - {Job Title}"`, company **first**, the opposite
order from Greenhouse/LinkedIn, falling back to `document.title`, and
only guessing from the URL slug (never above medium-confidence) if
none of those produced a name.

Verified against one real Lever posting, same single-sample caveat as
the other non-Greenhouse scrapers. The JSON-LD tier specifically is
untested: I haven't confirmed a real Lever posting that actually emits
a `JobPosting` schema block, unlike Greenhouse/LinkedIn where that's
been observed directly. The `og:title` tier is the one that's actually
been verified live, and only against a single posting/tenant.

## Other known rough edges

- **Duplicate-list lookup cost:** the "Create files" flow pulls your
  _entire_ application list on every save just to find one record
  (`fetchCreatedRecord()` in `panel.js`), since the API doesn't return
  `excelRowText`/`starterPromptText` from the POST itself and no
  single-record GET endpoint is confirmed to exist. Fine at ~300
  records, but if you ever get (or already have) a
  `GET /api/job-applications/[id]` endpoint, that'd be a much cheaper
  swap: one line change in `fetchCreatedRecord()`.
- **No duplicate-record link on 409:** right now the duplicate warning
  (both the scrape-time one and the POST's 409) just tells you it's a
  duplicate; ideally this would link to the existing record. Can wire
  that up once the update flow exists to jump to it.
