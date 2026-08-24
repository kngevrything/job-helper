// Workday-hosted job board scraper (*.myworkdayjobs.com) -- covers
// Autodesk and any other company using Workday's Candidate Experience
// (CxS) career site platform, not just Autodesk specifically.
//
// jobId comes exclusively from the URL slug (extractRequisitionId),
// verified against three real tenants (SHI, Autodesk, Yahoo). It
// deliberately does NOT use anything from the Workday internal JSON API below --
// live-testing on a real Autodesk posting showed the API's id-ish
// fields (jobPostingId etc.) hold Workday's internal routing
// identifier, which turned out to just be the full URL slug again, not
// the short requisition number ("26WD97962") actually shown on the
// page. Title/company still come from the API when it succeeds, since
// those weren't observed to have the same problem.
//
// Two data sources for title/company, in order of trust:
//
// 1. Workday's own internal JSON API. Every myworkdayjobs.com career
//    site is a React SPA that fetches its own job data from
//    /wday/cxs/{tenant}/{site}/job/{externalPath} (a GET, same-origin,
//    no CORS issue from inside a content script). This convention is
//    documented consistently across multiple independent scraping
//    write-ups. Confirmed live against a real Autodesk posting to
//    return *something* (200 OK, parseable JSON), though not every
//    field on it should be trusted -- see the jobId note above.
//
// 2. Page metadata (<meta property="og:title">, <title>) and the URL
//    itself. This *was* verified against a real Autodesk posting: the
//    title matched the page's actual content exactly. Company name
//    isn't present in page metadata, so it's derived from the tenant
//    subdomain as a best-effort guess at formatting (e.g. "autodesk" ->
//    "Autodesk") -- flagged accordingly, never "high" confidence on
//    its own.

function parseWorkdayUrl(href) {
  const u = new URL(href);
  const hostMatch = u.hostname.match(/^([^.]+)\.(wd\d+)\.myworkdayjobs\.com$/i);
  if (!hostMatch) return null;

  const tenant = hostMatch[1];
  const wdServer = hostMatch[2];

  // Path is typically /{locale}/{site}/details/{externalPath}, but the
  // locale prefix is optional depending on tenant config, and some
  // tenants (confirmed live: Yahoo, "ouryahoo.wd5.myworkdayjobs.com")
  // insert an extra location segment between "job"/"details" and the
  // real slug, e.g.
  // /en-US/careers/job/United-States-of-America/Senior-...-Tools_JR0027211
  // -- taking the segment immediately after "job"/"details" would grab
  // "United-States-of-America" instead of the actual externalPath there.
  // Workday's CxS API convention (and Autodesk/SHI, confirmed earlier)
  // always has the real slug as the LAST path segment regardless of how
  // many segments come before it, so anchor "site" off "job"/"details"
  // but take externalPath from the end of the path instead of a fixed
  // offset from the anchor.
  const pathParts = u.pathname.split('/').filter(Boolean);
  const anchorIdx = pathParts.findIndex((p) => p === 'details' || p === 'job');
  if (anchorIdx < 1 || anchorIdx + 1 >= pathParts.length) return null;

  return {
    tenant,
    wdServer,
    site: pathParts[anchorIdx - 1],
    externalPath: pathParts[pathParts.length - 1],
  };
}

function extractRequisitionId(externalPath) {
  const afterUnderscore = externalPath.split('_').pop();
  if (!afterUnderscore) return null;
  // Strips a trailing "-<n>" posting-instance counter, e.g.
  // "26WD97962-1" -> "26WD97962".
  return afterUnderscore.replace(/-\d+$/, '');
}

function deriveCompanyFromTenant(tenant) {
  // Rough title-case of the subdomain. Not guaranteed to match the
  // company's actual branding/capitalization (e.g. multi-word or
  // stylized names) -- a formatting guess, not verified data.
  return tenant
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

async function scrapeViaWorkdayApi(parsed) {
  const apiUrl = `https://${parsed.tenant}.${parsed.wdServer}.myworkdayjobs.com/wday/cxs/${parsed.tenant}/${parsed.site}/job/${parsed.externalPath}`;
  const res = await fetch(apiUrl, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Workday API returned HTTP ${res.status}`);
  }
  const data = await res.json();
  const info = data.jobPostingInfo || data;

  const title = info.title || info.jobTitle || null;
  const company =
    (info.hiringOrganization && info.hiringOrganization.name) ||
    info.company ||
    info.employer ||
    null;

  // Deliberately NOT reading an id/reqId out of the API response here.
  // Live-tested on a real Autodesk posting: whatever field the API
  // exposes under jobPostingId/id (Workday's internal routing
  // identifier, it turns out) held the full URL slug
  // ("Principal-Software-Engineer_26WD97962-1"), not the short
  // requisition number ("26WD97962") shown on the page. The
  // URL-parsing approach in extractRequisitionId() has been verified
  // correct against two real tenants (SHI, Autodesk), so that's now the
  // single source of truth for jobId regardless of what the API says.
  if (!title && !company) return null;
  return { title, company };
}

function scrapeFromMeta() {
  const ogTitle = document.querySelector('meta[property="og:title"]');
  const title =
    (ogTitle && ogTitle.content && ogTitle.content.trim()) ||
    (document.title || '').replace(/\s*[-|]\s*.*$/, '').trim() ||
    null;
  return { title };
}

async function scrapeWorkday() {
  const parsed = parseWorkdayUrl(window.location.href);

  let title = null;
  let company = null;
  // jobId comes exclusively from the URL slug now -- see the comment in
  // scrapeViaWorkdayApi() for why the API's id-ish fields aren't trusted.
  const reqId = parsed ? extractRequisitionId(parsed.externalPath) : null;
  let via = 'none';
  let apiSucceeded = false;

  if (parsed) {
    try {
      const apiResult = await scrapeViaWorkdayApi(parsed);
      if (apiResult) {
        title = apiResult.title;
        company = apiResult.company;
        via = 'workday-api';
        apiSucceeded = true;
      }
    } catch (err) {
      // API shape/route didn't match for this tenant -- fall through.
    }
  }

  if (!title) {
    const metaResult = scrapeFromMeta();
    title = metaResult.title;
    if (via === 'none' && title) via = 'meta';
  }

  let companyIsGuessed = false;
  if (!company && parsed) {
    company = deriveCompanyFromTenant(parsed.tenant);
    companyIsGuessed = true;
  }

  // Confidence: only "high" if the API itself gave us both title and a
  // real (non-guessed) company. Anything relying on the subdomain guess
  // or the meta-title fallback is at best "medium".
  let confidence = 'low';
  if (apiSucceeded && title && company && !companyIsGuessed) {
    confidence = 'high';
  } else if (title) {
    confidence = 'medium';
  }

  const canonicalLink = document.querySelector('link[rel="canonical"]');
  const jobUrl = canonicalLink
    ? canonicalLink.href
    : window.location.href.split('?')[0].split('#')[0];

  return {
    ok: true,
    source: 'workday',
    jobTitle: title,
    company,
    jobUrl,
    jobId: reqId,
    confidence,
    scrapedVia: via,
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'SCRAPE_JOB') {
    scrapeWorkday()
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true; // keep the message channel open for the async response
  }
  return true;
});
