// Greenhouse job page scraper.
// Greenhouse job boards come in two shapes ("boards.greenhouse.io/..." legacy,
// "job-boards.greenhouse.io/..." newer React one), plus some companies embed
// a Greenhouse board on their own domain. Rather than special-case each DOM
// layout, we prefer the schema.org JobPosting JSON-LD block that most
// Greenhouse boards emit for SEO -- when present it's the most reliable
// source. DOM selectors are a fallback for boards that don't emit it.

function extractJobIdFromUrl(url) {
  const pathMatch = url.match(/\/jobs\/(\d+)/);
  if (pathMatch) return pathMatch[1];
  // Greenhouse's embedded application-form URLs
  // (job-boards.greenhouse.io/embed/job_app?for={company}&token={id})
  // carry the job id in a "token" query param instead of the URL path.
  // Confirmed live against a real Speechify embed link.
  try {
    const token = new URL(url).searchParams.get('token');
    if (token && /^\d+$/.test(token)) return token;
  } catch (e) {
    // malformed URL, nothing to extract
  }
  return null;
}

function canonicalizeEmbedUrl(url) {
  // The embed form URL itself isn't a useful saved link: stripping its
  // query string (as the normal jobUrl logic does below) throws away
  // the "for"/"token" params that are the only thing identifying the
  // posting, leaving a dead ".../embed/job_app" link. When both are
  // present, reconstruct the canonical non-embed posting URL instead.
  // Confirmed live against a real Speechify embed link; only handles
  // job-boards.greenhouse.io, the one host this shape has been observed on.
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    return null;
  }
  if (parsed.hostname !== 'job-boards.greenhouse.io') return null;
  if (!parsed.pathname.startsWith('/embed/job_app')) return null;
  const company = parsed.searchParams.get('for');
  const token = parsed.searchParams.get('token');
  if (!company || !token || !/^\d+$/.test(token)) return null;
  return `https://job-boards.greenhouse.io/${company}/jobs/${token}`;
}

function tryJsonLd() {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent);
      const candidates = Array.isArray(data) ? data : [data];
      for (const item of candidates) {
        if (item && (item['@type'] === 'JobPosting')) {
          const company =
            (item.hiringOrganization && item.hiringOrganization.name) || null;
          const title = item.title || null;
          if (title || company) {
            return { jobTitle: title, company, confidence: 'high', via: 'json-ld' };
          }
        }
      }
    } catch (e) {
      // malformed JSON-LD on the page, ignore and keep looking
    }
  }
  return null;
}

function tryDomSelectors() {
  // Covers both legacy and job-boards.greenhouse.io layouts we've seen.
  const titleSelectors = [
    '#header .app-title',
    'h1.app-title',
    'h1[class*="job"]',
    'h1',
  ];
  const companySelectors = [
    '.company-name',
    '#header .company-name',
    'a.company-name',
    'img[alt][class*="logo"]', // fall through to alt text below
  ];

  let jobTitle = null;
  for (const sel of titleSelectors) {
    const el = document.querySelector(sel);
    if (el && el.textContent.trim()) {
      jobTitle = el.textContent.trim();
      break;
    }
  }

  let company = null;
  for (const sel of companySelectors) {
    const el = document.querySelector(sel);
    if (!el) continue;
    if (el.tagName === 'IMG' && el.alt && el.alt.trim()) {
      // Company logo <img> alt text is commonly authored as "{Company}
      // Logo" (confirmed live on Speechify's job-boards.greenhouse.io
      // posting: alt="Speechify Logo"), so strip a trailing "Logo" word
      // rather than using the raw alt text as the company name.
      company = el.alt.trim().replace(/\s+logo$/i, '').trim();
      break;
    }
    if (el.textContent && el.textContent.trim()) {
      company = el.textContent.trim();
      break;
    }
  }

  if (jobTitle || company) {
    return { jobTitle, company, confidence: company && jobTitle ? 'medium' : 'low', via: 'dom' };
  }
  return null;
}

function tryDocumentTitle() {
  // Greenhouse <title> is commonly "Job Title - Company" or "Company - Job Title".
  const title = document.title || '';
  const parts = title.split(/\s[-|]\s/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { jobTitle: parts[0], company: parts[1], confidence: 'low', via: 'document-title' };
  }
  if (parts.length === 1) {
    return { jobTitle: parts[0], company: null, confidence: 'low', via: 'document-title' };
  }
  return null;
}

function tryTitleAtPattern() {
  // job-boards.greenhouse.io -- the newer React-driven layout, distinct
  // from legacy boards.greenhouse.io -- renders <title> as
  // "Job Application for {Job Title} at {Company}", with no dash/pipe
  // separator, so it never matches tryDocumentTitle()'s split above.
  // Confirmed live on a real job-boards.greenhouse.io posting
  // (SecurityScorecard/8029601) that this layout also emits no
  // JobPosting JSON-LD and that the legacy DOM company selectors above
  // don't match its markup -- tryDomSelectors() there returns a title
  // via the generic `h1` fallback but leaves company null, and since it
  // returns non-null it short-circuits past this function entirely in
  // the || chain below. That's why this is called separately, only to
  // backfill company, rather than being another link in that chain.
  const raw = document.title || '';
  const match = raw.match(/^Job Application for (.+?) at (.+)$/i);
  if (!match) return null;
  return { jobTitle: match[1].trim(), company: match[2].trim() };
}

function extractCompanySlugFromUrl(url) {
  // Last resort: both legacy (boards.greenhouse.io/{company}/jobs/{id})
  // and newer (job-boards.greenhouse.io/{company}/jobs/{id}) layouts
  // put the company token as the first URL path segment. No guarantee
  // this slug's casing matches the company's real branding (e.g.
  // "securityscorecard" won't recover "SecurityScorecard") -- only used
  // when nothing on the page itself named the company.
  const u = new URL(url);
  const pathParts = u.pathname.split('/').filter(Boolean);
  return pathParts.length > 0 ? pathParts[0] : null;
}

function slugToTitleCase(slug) {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

function scrapeGreenhouse() {
  const result = tryJsonLd() || tryDomSelectors() || tryDocumentTitle() || {
    jobTitle: null,
    company: null,
    confidence: 'low',
    via: 'none',
  };

  let jobTitle = result.jobTitle;
  let company = result.company;
  let confidence = result.confidence;
  let via = result.via;

  if (!company) {
    const titleAt = tryTitleAtPattern();
    if (titleAt) {
      company = titleAt.company;
      if (!jobTitle) jobTitle = titleAt.jobTitle;
      via = via === 'none' ? 'document-title-at' : `${via}+document-title-at`;
      // Page-authored text with real casing, but only confirmed against
      // one live posting/layout -- never call it "high" on its own.
      confidence = 'medium';
    } else {
      const slug = extractCompanySlugFromUrl(window.location.href);
      if (slug) {
        company = slugToTitleCase(slug);
        via = via === 'none' ? 'url-slug-guess' : `${via}+url-slug-guess`;
        // A pure casing guess off the URL slug -- least trustworthy
        // source in this scraper, regardless of how good the title tier
        // was.
        confidence = 'low';
      }
    }
  }

  const jobUrl =
    canonicalizeEmbedUrl(window.location.href) ||
    window.location.href.split('?')[0].split('#')[0];

  return {
    ok: true,
    source: 'greenhouse',
    jobTitle,
    company,
    jobUrl,
    jobId: extractJobIdFromUrl(window.location.href),
    confidence,
    scrapedVia: via,
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'SCRAPE_JOB') {
    try {
      sendResponse(scrapeGreenhouse());
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
  }
  // No async work here, but returning true is harmless and keeps the
  // channel open in case we need to make this async later.
  return true;
});
