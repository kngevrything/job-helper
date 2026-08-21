// Lever job page scraper (jobs.lever.co/{company}/{postingId}).
//
// Unlike Workday, Lever's posting id doesn't need any parsing/stripping
// -- it's just the second URL path segment, an opaque UUID, used as-is.
// The URL's company segment is also read directly (no subdomain-casing
// guess needed the way Workday's tenant subdomain is), but it's a raw
// slug (e.g. "acme-inc"), not necessarily the company's real display
// casing/branding -- so for the human-readable company name we prefer
// og:title, which Lever renders as "{Company} - {Job Title}" (company
// FIRST -- the opposite order from Greenhouse/LinkedIn's og:title).
// Verified against one real Lever posting; treat that the same as the
// other scrapers' low-sample verifications -- plausible, not
// battle-tested across many tenants. If og:title/JSON-LD don't give us
// a real company name, the URL slug is used as a last-resort guess and
// flagged accordingly, same pattern as Workday's tenant-subdomain guess.

function parseLeverUrl(href) {
  const u = new URL(href);
  if (!/(^|\.)lever\.co$/i.test(u.hostname)) return null;

  const pathParts = u.pathname.split('/').filter(Boolean);
  if (pathParts.length < 2) return null;

  return {
    companySlug: pathParts[0],
    postingId: pathParts[1],
  };
}

function slugToTitleCase(slug) {
  // Rough formatting guess for the URL slug -- NOT trusted as the
  // company's actual branding/capitalization, only used as a last
  // resort if og:title/JSON-LD don't give us a real company name.
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

function tryJsonLd() {
  // Some Lever postings emit a schema.org JobPosting JSON-LD block, same
  // as Greenhouse/LinkedIn -- this has NOT been confirmed live on an
  // actual Lever page the way the og:title tier below has, so a hit
  // here is a bonus, not something to lean on.
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent);
      const candidates = Array.isArray(data) ? data : [data];
      for (const item of candidates) {
        if (item && item['@type'] === 'JobPosting') {
          const company =
            (item.hiringOrganization && item.hiringOrganization.name) || null;
          const title = item.title || null;
          if (title || company) {
            return { jobTitle: title, company, confidence: 'high', via: 'json-ld' };
          }
        }
      }
    } catch (e) {
      // malformed/unrelated JSON-LD block, keep looking
    }
  }
  return null;
}

function tryOgTitle() {
  // Lever's og:title is "{Company} - {Job Title}" -- company FIRST,
  // opposite order from Greenhouse/LinkedIn. Verified against one real
  // posting.
  const ogTitle = document.querySelector('meta[property="og:title"]');
  const raw = ogTitle && ogTitle.content && ogTitle.content.trim();
  if (!raw) return null;

  const parts = raw.split(/\s[-|]\s/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      company: parts[0],
      jobTitle: parts.slice(1).join(' - '),
      confidence: 'high',
      via: 'og-title',
    };
  }
  if (parts.length === 1) {
    return { company: null, jobTitle: parts[0], confidence: 'low', via: 'og-title' };
  }
  return null;
}

function tryDocumentTitle() {
  // document.title mirrored og:title on the one posting this was
  // checked against, but that's not confirmed as a stable pattern --
  // kept as a last-resort fallback only, same "company - title" split.
  const raw = (document.title || '').trim();
  const parts = raw.split(/\s[-|]\s/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      company: parts[0],
      jobTitle: parts.slice(1).join(' - '),
      confidence: 'low',
      via: 'document-title',
    };
  }
  if (parts.length === 1) {
    return { company: null, jobTitle: parts[0], confidence: 'low', via: 'document-title' };
  }
  return null;
}

function scrapeLever() {
  const parsed = parseLeverUrl(window.location.href);
  const result = tryJsonLd() || tryOgTitle() || tryDocumentTitle() || {
    jobTitle: null,
    company: null,
    confidence: 'low',
    via: 'none',
  };

  let company = result.company;
  let companyIsGuessed = false;
  if (!company && parsed) {
    company = slugToTitleCase(parsed.companySlug);
    companyIsGuessed = true;
  }

  let confidence = result.confidence;
  if (companyIsGuessed && confidence === 'high') {
    // Don't call it high confidence if we had to fall back to guessing
    // the company from the URL slug -- only the job title tier was
    // actually confirmed.
    confidence = 'medium';
  }

  const jobUrl = parsed
    ? `https://jobs.lever.co/${parsed.companySlug}/${parsed.postingId}`
    : window.location.href.split('?')[0].split('#')[0];

  return {
    ok: true,
    source: 'lever',
    jobTitle: result.jobTitle,
    company,
    jobUrl,
    jobId: parsed ? parsed.postingId : null,
    confidence,
    scrapedVia: result.via,
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'SCRAPE_JOB') {
    try {
      sendResponse(scrapeLever());
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
  }
  return true;
});
