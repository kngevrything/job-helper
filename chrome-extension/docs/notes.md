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

Confirmed live against a real posting reached through a
`/jobs/search-results/?currentJobId=...` page (a Yahoo listing) that
this page shape doesn't expose ANY of the DOM company/title selectors
above, nor JSON-LD, unlike the standalone `/jobs/view/` page. It falls
all the way through to the `document.title` parse, the least reliable
tier. That tier itself had a real bug on this posting's title
(`"Senior Software Engineer - Developer Experience & Tools | Yahoo |
LinkedIn"`): splitting on `-` and `|` interchangeably grabbed
"Developer Experience & Tools" (part of the job title, which contains
its own hyphen) as the company instead of "Yahoo". Fixed by preferring
a split on `|` first when one is present (a job title can contain a
hyphen but not a pipe) and only falling back to hyphen-splitting when
there's no pipe in the title at all. No selectors have been found yet
for the search-results page's actual company-name element, so a
posting reached that way still won't get above "low" confidence, it
just gets the *right* low-confidence answer now instead of a wrong one.

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

### Ashby

Ashby job board pages (`jobs.ashbyhq.com/{orgSlug}/{jobId}`) are fully
client-side rendered -- confirmed live, server-side, against a real
posting: the initial HTML has no JSON-LD, no `og:*` meta tags, and
`<title>` is a static `"Jobs"` placeholder until the SPA hydrates. So
instead of scraping rendered markup as the primary source the way
Greenhouse/Lever do, this calls Ashby's own public Job Board API --
`https://api.ashbyhq.com/posting-api/job-board/{orgSlug}`, the same
unauthenticated JSON endpoint Ashby documents for embedding a job
board on a company's own careers page. Confirmed live: a server-side
`GET .../posting-api/job-board/1password` returned
`{ jobs: [{ id, title, jobUrl, ... }] }` with no auth needed. `jobId`
from the URL is matched against each entry's `id` to find that
posting's `title`.

**Caveat -- weaker verification than the other four scrapers.** That
API call was made server-side, with no browser and no CORS
enforcement in the loop -- there was no working Chrome connection
available to drive an actual browser against `jobs.ashbyhq.com` when
this was written. Two things are consequently unverified, unlike
everything else in this section:

- Whether `api.ashbyhq.com` actually sends CORS headers permitting a
  `fetch()` from a `jobs.ashbyhq.com` content script. If it doesn't,
  `tryJobBoardApi()` fails closed (catches the error, returns `null`)
  and the scraper falls through to the DOM/title tiers below --
  degraded confidence, not a break.
- What `document.title` becomes once the SPA hydrates, and whether
  there's a stable DOM selector for the job title. The `h1` and
  `document.title` fallback tiers are generic guesses (the `h1` tier
  mirrors Greenhouse's own last-resort selector), not confirmed
  against a real rendered Ashby page.

The API response also has no company/organization name field at all
(confirmed against the same live response) -- only per-job fields --
so `company` always falls back to the same tiers as Greenhouse/Lever:
`document.title` parsing, then a title-cased guess off the URL's org
slug (e.g. won't recover "1Password" from "1password"), same
last-resort caveat as those two.

Test this against a couple of real postings once you can drive a
browser against it, and tighten or replace the unverified tiers based
on what you actually see.

### GitHub

GitHub's public job board (`github.careers`) is a white-labeled iCIMS
"Company Hub" site -- the login portal at
`careers-githubinc.icims.com` confirms iCIMS under the hood, but
candidates browse `github.careers`, not an `icims.com` subdomain.
Other iCIMS-powered career sites use their own custom domains too, so
this scraper is matched to `github.careers` specifically rather than a
general iCIMS host pattern; a different company's iCIMS-backed career
site would need its own domain added the same way.

Single-tenant site -- only GitHub postings live here -- so `company`
is hardcoded to `"GitHub"` instead of guessed from a URL slug or
subdomain the way Greenhouse/Workday/Ashby fall back. That's more
reliable than any of those guesses, since there's no ambiguity about
who's hiring.

`jobTitle` prefers a page JSON-LD `JobPosting` block if present, then
falls back to `og:title`/`document.title`. Verified live against one
real posting (`github.careers/careers-home/jobs/5611?lang=en-us`):
both `og:title` and `<title>` read `"{Job Title} in {Location} |
GitHub, Inc."`, e.g. `"Staff Software Engineer in United States |
GitHub, Inc."`. That fetch found no JSON-LD block, but it was a
non-browser HTML fetch that may not reflect everything a real browser
sees, so JSON-LD's absence isn't fully confirmed -- it's kept as an
optional first tier in case a real browser turns up more.

Splitting the location back off the title is the fragile part: the
suffix is always `"... in {Location}"`, and a title could itself
contain `" in "` (e.g. "Engineer in Test" combined with a location
would read "Engineer in Test in United States"). Splitting on the
LAST `" in "` occurrence handles that correctly, since the location is
always appended last -- but this is regex-shaped reasoning about one
observed title format, not something tested against a title that
actually has that ambiguity. Only tested against one real posting
overall, so confidence never goes above "medium" -- test against a
couple more real postings (ideally one with a title containing "in")
before trusting it unattended, same caveat as Ashby.

`jobId` comes from the URL path: job URLs live under a few different
prefixes (`/careers-home/jobs/<id>`, `/early-in-profession/jobs/<id>`,
etc.), but the id is always the numeric segment right after `/jobs/`,
so the regex anchors on that instead of a fixed prefix. Confirmed
against several real URLs found via search (ids like 4180, 5306,
5611, 5441 across at least two different prefixes).

### Indeed

Matches every `*.indeed.com` page, since a posting can be open in
three URL shapes, all handled:

- standalone `/viewjob?jk=<id>`
- search split view `/jobs?q=...&vjk=<id>`
- signed-in homepage feed `/?vjk=<id>`

`jobId` is the `jk` or `vjk` param. `jobUrl` is normalized to
`{origin}/viewjob?jk=<id>`, which matches Indeed's own
`<link rel="canonical">`.

Confirmed live (2026-10) that Indeed's current layout dropped the
long-documented selectors (`#jobDescriptionText`,
`jobsearch-JobInfoHeader-title`, `inlineHeader-companyName`): none
exist on either page shape. The new layout uses `data-testid`
components instead: `vj-job-title` (title), `company-info-metadata`
(first line is the company), and `vj-job-description-heading` (the
"Full job description" h4, whose next sibling is the description).
Those render identically on the standalone page and in the split-view
pane, and update when you click another card.

Only the standalone page emits JobPosting JSON-LD, and the split view's
`document.title` is the search's title, not the job's. So unlike
LinkedIn, the DOM testids are tried FIRST (they always reflect the job
on screen), then JSON-LD, then the old selectors, then
`document.title` (standalone page only, and it has no company in it).

A testid hit with both title and company is reported as high
confidence, so the casing correction won't silently rewrite the
company, it'll offer the chip instead.

**Not verified:** the signed-in homepage feed (`/?vjk=`). Logged out,
that URL just shows the landing page, so it's assumed to use the same
pane component as the search split view.

### Jobright

Job pages are `jobright.ai/jobs/info/<24-hex id>`, usually reached
from Jobright's alert emails with `utm_*`/`imp_id` tracking params.
`jobId` is the hex id; `jobUrl` drops the params and matches the
page's `<link rel="canonical">`.

A plain HTTP fetch gets a JavaScript "Security check" interstitial,
so nothing here was verifiable server-side. Checked live (2026-10) in
a real browser against one posting: title and company agree across
all four tiers, which run in this order:

1. DOM: `h1[class*="index_job-title"]` and
   `[class*="index_company-name"]`. The class suffixes are CSS-module
   hashes, so selectors match the stable prefix only.
2. `__NEXT_DATA__` `props.pageProps.dataSource.jobResult.jobTitle` and
   `.companyResult.companyName`.
3. JSON-LD JobPosting. Its `title` can carry a `[Remote] ` prefix,
   which is stripped.
4. `document.title`: `"{Title} @ {Company} | Jobright.ai"`.

JSON-LD and `__NEXT_DATA__` are only used when their job id matches
the URL's. Whether Jobright swaps jobs client-side without refreshing
them is unknown; the guard keeps a stale job from being reported.

**Description:** from the JSON-LD `description`. It is NOT the
employer's original JD: Jobright rewrites every posting into its own
Responsibilities / Qualification / Benefits / Company sections (plus
H1B history). The original only exists on the company site behind
Jobright's Apply button. Good enough for triage, but don't treat
wording in it as the company's.

**Salary:** the description text has none, so the webapp's
`parseSalary` would come back "unknown". The content script returns
`salary` alongside the description (`jobResult.salaryDesc`, e.g.
`$300K/yr - $385K/yr`, falling back to JSON-LD `baseSalary`), and Save
JD passes it to `/api/jd-inbox`.

**Not verified:** a second posting, a posting with no salary, and
signed-in list/recommendation pages (off `/jobs/info/`, the scraper
returns blank fields rather than guessing).

## Company casing correction

Every scraper above ends up guessing company casing from a URL slug or
subdomain when the page/API itself doesn't supply a real name --
Ashby's API has no company field at all, so it's *always* a guess
there, but Greenhouse, Lever, and Workday fall back the same way
whenever their own better tiers come up empty. A slug like
`jobs.ashbyhq.com/1password/...` title-cases to `"1password"`, not
`"1Password"` -- there's no way to recover real branding from a URL
segment.

Left alone, that means the same company can end up saved under
multiple casings across records ("1password" vs "1Password"), which
reads as two different companies anywhere the comparison isn't
collation-aware (skimming the table, exporting to a spreadsheet,
`Ctrl+F`). Fixed with a small correction loop between the extension
and `job-tracker`, not by trying to make any scraper smarter about
casing -- there's no reliable source for real branding short of asking
you.

**`job-tracker`:** a new read-only endpoint,
`GET /api/job-applications/company-casing?company=<guess>`
(`src/app/api/job-applications/company-casing/route.ts`), does a
case-insensitive lookup via the same `DUPLICATE_MATCH_COLLATION` the
duplicate-check endpoint and the unique index itself use, and returns
the casing from your most recently created matching application, or
`null` if you've never applied there.

**Extension (`panel.js`):** calls that lookup two ways --

- After every scrape (all four sites), using that scraper's own
  overall `confidence` value. There's no separate per-field confidence
  for company -- every scraper already downgrades `confidence` to
  medium/low specifically when company came from a slug/subdomain
  guess (see each scraper's section above), so "not high" is already a
  reliable stand-in for "company is probably a guess."
- On manual typing/blur in the Company field (debounced 600ms, same
  shape as `scheduleDuplicateCheck`), always passed `confidence:
  'high'` -- a hand-typed value is deliberate the same way a
  high-confidence scrape is.

Behavior splits on that confidence: a guessed (not-high-confidence)
value gets silently rewritten to match your saved casing, no notice,
nothing to dismiss. A high-confidence value (real page/API data, or
something you typed yourself) that still disagrees with your history
is never auto-overwritten -- instead `#casingConflictNotice` shows a
one-click chip with the saved casing (`showCasingSuggestion()` /
`hideCasingConflict()`), so you decide, since a real disagreement
could mean the company's branding actually changed or an old record
was entered inconsistently, not that this scrape is wrong.

**Deliberately not applied to `job-tracker`'s own Add-application
form.** That form's `TypeaheadInput` for company is intentionally
free-form (see `job-tracker`'s CLAUDE.md) -- the same company name can
legitimately belong to different real entities there (e.g. a staffing
vendor posting under a client's name), so nudging toward one "correct"
casing would be actively wrong sometimes. The extension's version is
safe from that problem because every suggestion is anchored to one
specific job posting URL you're actively looking at, not a bare
freeform company name with no other context.

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

### Glassdoor

Matches `*.glassdoor.com` and `*.glassdoor.co.in`. `.co.in` is the
India site: the job alert emails link there even for US jobs (likely
the account's country setting). Drop it from the manifest and
`detectSite()` once alerts point at `.com`.

Cloudflare blocks automated browsers on Glassdoor ("Humans only"), so
nothing was checked live. Built and tested (2026-10) against three
pages saved from a real Chrome session: two `/job-listing/` alert
pages and one `/Job/...SRCH...` search split view.

- **Title:** `h1[id^="jd-job-title-"]`. The search page has a second
  h1 (the search heading), so match by id, not tag.
- **Company:** `[class*="EmployerProfile_employerNameHeading"]` inside
  `[data-test="job-details-header"]`. Class suffixes are CSS-module
  hashes, so selectors match the prefix.
- **jobId:** from the h1 id (`jd-job-title-<id>`), which is right in
  both page shapes, then the `jl`/`jobListingId` param, then the
  selected card's `data-jobid`.
- **jobUrl:** `https://www.glassdoor.com/job-listing/<slug>?jl=<id>`.
  Glassdoor's own ItemList JSON-LD uses the `.com` host even when the
  page came from `.co.in`. On the search page the slug comes from that
  ItemList (server-rendered jobs only); a job clicked client-side falls
  back to `/Job/<search>.htm?jl=<id>`, the format Glassdoor's own
  `serpUrlForJobListing` uses. Not verified that either link opens on
  `.com`, since Glassdoor can't be loaded here.
- **Description:** `[class*="JobDetails_jobDescription"]`. It holds the
  full text even while collapsed (matched JSON-LD's last line). JSON-LD
  JobPosting is the fallback, standalone page only.
- **Company mismatch:** one posting showed "Paladin Technologies" in
  the header and page title but "Bosch Building Technologies LLC" in
  JSON-LD `hiringOrganization` and the URL slug. The header wins (it's
  what you see), but confidence drops to `medium` so the panel flags
  it. "FormFactor" vs "FormFactor, Inc." counts as the same.
- **Salary:** not scraped. On `.co.in` the job cards show salaries
  converted to INR, and the detail pane had none for these postings.
- The API's `/api/jd-inbox` board allow-list needed `glassdoor` added.

### Monster

Checked live (2026-10) in the built-in browser, no bot wall. Two page
shapes, same job view component (`[data-testid="svx-job-view-wrapper"]`):
`/jobs/search?q=...&id=<uuid>` (alert emails, job in a right-hand
pane) and `/job-openings/<slug>--<uuid>` (standalone).

- **Split view needs width.** At ~830px the search page shows only the
  list, no pane. At 1440px the pane appears. Nothing to scrape without
  it.
- **Title / company:** `[data-testid="jobTitle"]` (h2 in the pane, h1
  standalone) and `[data-testid="company"]`, scoped to the job view so
  the cards' identical test ids don't match.
- **jobId gotcha:** clicking another card does NOT update the URL's
  `id`, and the card buttons' `aria-pressed` stays on the first job.
  Only the article's `card-selected` class moves. So the id comes from
  the card whose button `aria-label` is `"<title> at <company>"`, then
  the selected card's `data-job-id`, and the URL `id` only as a last
  resort (confidence drops to `medium`). Standalone: JSON-LD
  `identifier.value`, then the uuid in the path.
- **jobUrl:** the card's own `/job-openings/<slug>--<uuid>` link. The
  slug includes the location (`...-charleston-sc--<uuid>`), and a
  guessed slug returns 410 Gone, so it's never built by hand.
- **Description:** `[data-testid="svx-description-container-inner"]`,
  full text (the pane's "+ show more" belongs to the skills widget).
  At narrow width the standalone page collapses it and a trailing
  "Show more" label is stripped. JSON-LD fallback, standalone only.
- **Salary:** the facts table's `Salary` row
  (`$160,000–$200,000 Per Year`) when present. Not every posting has
  one, and the standalone JSON-LD had no `baseSalary`.
- The API's `/api/jd-inbox` board allow-list needed `monster` added.
