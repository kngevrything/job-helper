// Indeed job page scraper.
//
// Indeed shows a posting three ways, all confirmed live (2026-10):
//   - standalone:  /viewjob?jk=<id>
//   - search split view:  /jobs?q=...&vjk=<id>  (job in a right-hand pane)
//   - homepage feed (signed in):  /?vjk=<id>
// Only the standalone page emits JobPosting JSON-LD. The split view has
// none, and its document.title is the search title, not the job's. So
// unlike LinkedIn, the DOM is tried FIRST here: Indeed's current layout
// renders the same data-testid components in both the standalone page
// and the split-view pane, and they always reflect the job actually on
// screen. JSON-LD is the fallback, then the older pre-2026 layout's
// selectors, then document.title (standalone page only).
//
// The split-view homepage feed (/?vjk=) was NOT verified directly: it
// needs a signed-in session. It's assumed to use the same pane
// component as the search split view.

function extractJobId(url) {
  const u = new URL(url);
  // jk = standalone page, vjk = job open in a split-view pane.
  return u.searchParams.get('jk') || u.searchParams.get('vjk') || null;
}

function canonicalJobUrl(rawUrl, jobId) {
  // Search/homepage URLs carry the query and tracking params and aren't
  // a stable link to the posting. /viewjob?jk=<id> is what Indeed's own
  // <link rel="canonical"> uses. Keep the origin so regional hosts
  // (ca.indeed.com, uk.indeed.com) stay on their own site.
  if (jobId) {
    return `${new URL(rawUrl).origin}/viewjob?jk=${jobId}`;
  }
  return rawUrl.split('?')[0].split('#')[0];
}

function textOf(selector) {
  const el = document.querySelector(selector);
  const text = el && el.innerText ? el.innerText.trim() : '';
  return text || null;
}

function tryTestIdDom() {
  // Current layout (confirmed live on both standalone and search split
  // view). The company block's first line is the company name, followed
  // by rating/location lines.
  const jobTitle = textOf('[data-testid="vj-job-title"]');
  const meta = textOf('[data-testid="company-info-metadata"]');
  const company = meta ? meta.split('\n')[0].trim() || null : null;
  if (jobTitle || company) {
    return {
      jobTitle,
      company,
      confidence: jobTitle && company ? 'high' : 'low',
      via: 'dom',
    };
  }
  return null;
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

function tryLegacyDom() {
  // Pre-2026 layout. Not present on any page checked live, kept in case
  // Indeed still serves it to some users/regions.
  const jobTitle =
    textOf('[data-testid="jobsearch-JobInfoHeader-title"]') ||
    textOf('h1.jobsearch-JobInfoHeader-title');
  const company =
    textOf('[data-testid="inlineHeader-companyName"]') ||
    textOf('[data-company-name="true"]');
  if (jobTitle || company) {
    return {
      jobTitle: jobTitle ? jobTitle.replace(/\s*-\s*job post\s*$/i, '') : null,
      company,
      confidence: jobTitle && company ? 'medium' : 'low',
      via: 'dom-legacy',
    };
  }
  return null;
}

function tryDocumentTitle() {
  // Standalone page only: "Job Title - City, ST - Indeed.com". On search
  // and homepage URLs the title is the search's, never the job's, so
  // parsing it there would produce a confidently wrong job title.
  if (!/^\/viewjob/.test(window.location.pathname)) return null;
  const raw = (document.title || '').replace(/\s*-\s*Indeed\.com\s*$/i, '').trim();
  const parts = raw.split(/\s-\s/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  // No company in this title format.
  return { jobTitle: parts[0], company: null, confidence: 'low', via: 'document-title' };
}

function scrapeIndeed() {
  const result = tryTestIdDom() || tryJsonLd() || tryLegacyDom() || tryDocumentTitle() || {
    jobTitle: null,
    company: null,
    confidence: 'low',
    via: 'none',
  };

  const jobId = extractJobId(window.location.href);

  return {
    ok: true,
    source: 'indeed',
    jobTitle: result.jobTitle,
    company: result.company,
    jobUrl: canonicalJobUrl(window.location.href, jobId),
    jobId,
    confidence: result.confidence,
    scrapedVia: result.via,
  };
}

// ---------------------------------------------------------------------
// Job description scraping. Same DOM-first ordering as above, for the
// same reason: the split view has no JSON-LD at all.

function htmlDescriptionToText(html) {
  if (!html) return null;
  const withBreaks = html
    .replace(/<\s*li[^>]*>/gi, '\n- ')
    .replace(/<\s*(br|\/p|\/div|\/h[1-6])\s*\/?>/gi, '\n');
  const container = document.createElement('div');
  container.innerHTML = withBreaks;
  const text = container.textContent || '';
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function tidy(text) {
  const t = (text || '').replace(/\n{3,}/g, '\n\n').trim();
  return t || null;
}

function tryDescriptionByHeading() {
  // Current layout: an h4 "Full job description" (data-testid
  // vj-job-description-heading) whose next sibling is the description
  // body. Confirmed live on standalone and split view.
  const heading = document.querySelector('[data-testid="vj-job-description-heading"]');
  if (!heading || !heading.nextElementSibling) return null;
  return tidy(heading.nextElementSibling.innerText);
}

function tryDescriptionLegacyDom() {
  const el = document.querySelector('#jobDescriptionText');
  return el ? tidy(el.innerText) : null;
}

function tryDescriptionJsonLd() {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent);
      const candidates = Array.isArray(data) ? data : [data];
      for (const item of candidates) {
        if (item && item['@type'] === 'JobPosting' && item.description) {
          const text = htmlDescriptionToText(item.description);
          if (text) return text;
        }
      }
    } catch (e) {
      // keep looking
    }
  }
  return null;
}

function scrapeIndeedDescription() {
  const text =
    tryDescriptionByHeading() || tryDescriptionLegacyDom() || tryDescriptionJsonLd();
  if (!text) {
    return { ok: false, error: 'Could not find a job description on this page.' };
  }
  return { ok: true, description: text };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'SCRAPE_JOB') {
    try {
      sendResponse(scrapeIndeed());
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
    return true;
  }
  if (message && message.type === 'GET_JOB_DESCRIPTION') {
    try {
      sendResponse(scrapeIndeedDescription());
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
    return true;
  }
  return true;
});
