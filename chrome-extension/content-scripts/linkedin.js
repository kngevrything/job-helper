// LinkedIn job page scraper.
//
// LinkedIn's DOM is heavily obfuscated and changes often, and the same
// posting can be viewed several ways (a direct /jobs/view/<id> permalink,
// or embedded inside /jobs/search/ or /jobs/collections/ with the id only
// in a ?currentJobId= query param). We try structured data first (some
// LinkedIn job pages emit schema.org JobPosting JSON-LD for SEO), then a
// list of known-but-fragile class-name selectors covering both the
// logged-in and public page layouts, then document.title as a last
// resort. None of the DOM selectors are guaranteed stable -- LinkedIn
// changes these without notice -- so anything below "high" confidence is
// flagged for the user to confirm rather than trusted blindly.

function extractJobId(url) {
  const u = new URL(url);

  const viewMatch = u.pathname.match(/\/jobs\/view\/(\d+)/);
  if (viewMatch) return viewMatch[1];

  // Slug-style permalinks: .../some-job-title-at-company-1234567890
  const trailingDigits = u.pathname.match(/-(\d{6,})\/?$/);
  if (trailingDigits) return trailingDigits[1];

  // Search/collections pages carry the open job as a query param instead
  // of in the path.
  const currentJobId = u.searchParams.get('currentJobId');
  if (currentJobId) return currentJobId;

  return null;
}

function canonicalJobUrl(rawUrl, jobId) {
  // /jobs/search/ and /jobs/collections/ URLs are not a stable permalink
  // to the specific posting -- if we have an id, prefer the canonical
  // /jobs/view/ form so the saved link still works later.
  if (jobId) {
    return `https://www.linkedin.com/jobs/view/${jobId}/`;
  }
  return rawUrl.split('?')[0].split('#')[0];
}

function tryJsonLd() {
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

function firstMatch(selectors) {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.textContent && el.textContent.trim()) {
      return el.textContent.trim();
    }
  }
  return null;
}

function tryDomSelectors() {
  // Covers the logged-in "unified top card" layout and the older/public
  // "topcard" layout. LinkedIn ships both depending on auth state and
  // rollout, and neither is documented or stable -- expect this to need
  // updates when LinkedIn next reshuffles their class names.
  const titleSelectors = [
    '.job-details-jobs-unified-top-card__job-title h1',
    '.job-details-jobs-unified-top-card__job-title',
    '.jobs-unified-top-card__job-title',
    '.top-card-layout__title',
    'h1.t-24',
    'h1',
  ];
  const companySelectors = [
    '.job-details-jobs-unified-top-card__company-name a',
    '.job-details-jobs-unified-top-card__company-name',
    '.jobs-unified-top-card__company-name a',
    '.jobs-unified-top-card__company-name',
    '.topcard__org-name-link',
    '.topcard__flavor--black-link',
  ];

  const jobTitle = firstMatch(titleSelectors);
  const company = firstMatch(companySelectors);

  if (jobTitle || company) {
    return {
      jobTitle,
      company,
      confidence: jobTitle && company ? 'medium' : 'low',
      via: 'dom',
    };
  }
  return null;
}

function tryDocumentTitle() {
  // LinkedIn's <title> is commonly one of:
  //   "Job Title hiring at Company | LinkedIn"
  //   "Company hiring Job Title in City, State | LinkedIn"
  //   "Job Title - Company | LinkedIn"
  // This is a rough parse of whichever shape shows up -- always flagged
  // low confidence, never trust it over a DOM or JSON-LD hit.
  const raw = (document.title || '').replace(/\s*\|\s*LinkedIn\s*$/i, '').trim();

  let match = raw.match(/^(.*?)\s+hiring\s+(.*?)\s+in\s+.*$/i);
  if (match) {
    return { jobTitle: match[2].trim(), company: match[1].trim(), confidence: 'low', via: 'document-title' };
  }

  match = raw.match(/^(.*?)\s+hiring\s+at\s+(.*)$/i);
  if (match) {
    return { jobTitle: match[1].trim(), company: match[2].trim(), confidence: 'low', via: 'document-title' };
  }

  // Prefer splitting on "|" when present: a job title can contain a
  // hyphen but not a pipe, so hyphen-splitting alone can misread a
  // hyphenated title as "job title - company". First segment is the
  // job title, last is the company.
  const pipeParts = raw.split('|').map((p) => p.trim()).filter(Boolean);
  if (pipeParts.length >= 2) {
    return {
      jobTitle: pipeParts[0],
      company: pipeParts[pipeParts.length - 1],
      confidence: 'low',
      via: 'document-title',
    };
  }

  // No pipe: fall back to the simpler "Job Title - Company" shape.
  const parts = raw.split(/\s-\s/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { jobTitle: parts[0], company: parts[1], confidence: 'low', via: 'document-title' };
  }
  if (parts.length === 1) {
    return { jobTitle: parts[0], company: null, confidence: 'low', via: 'document-title' };
  }
  return null;
}

function scrapeLinkedIn() {
  const result = tryJsonLd() || tryDomSelectors() || tryDocumentTitle() || {
    jobTitle: null,
    company: null,
    confidence: 'low',
    via: 'none',
  };

  const jobId = extractJobId(window.location.href);

  return {
    ok: true,
    source: 'linkedin',
    jobTitle: result.jobTitle,
    company: result.company,
    jobUrl: canonicalJobUrl(window.location.href, jobId),
    jobId,
    confidence: result.confidence,
    scrapedVia: result.via,
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'SCRAPE_JOB') {
    try {
      sendResponse(scrapeLinkedIn());
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
  }
  return true;
});
