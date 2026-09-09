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

// ---------------------------------------------------------------------
// Job description ("About the job") scraping.
//
// Same reliability ordering as the title/company scrape above: LinkedIn's
// JobPosting JSON-LD (when present) carries the full description as an
// HTML string and doesn't depend on which DOM layout got served or
// whether a "...show more" toggle has been expanded, so it's tried
// first. DOM selectors are the fallback for pages that don't emit it,
// and are just as fragile/unstable as the title/company ones above.

function htmlDescriptionToText(html) {
  if (!html) return null;
  // Insert newlines at block-level boundaries before stripping tags, so
  // paragraphs and bullet points don't get squashed into one run-on
  // line. Bullets get a leading "- " so list structure survives too.
  const withBreaks = html
    .replace(/<\s*li[^>]*>/gi, '\n- ')
    .replace(/<\s*(br|\/p|\/div|\/h[1-6])\s*\/?>/gi, '\n');
  const container = document.createElement('div');
  container.innerHTML = withBreaks;
  const text = container.textContent || '';
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
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
      // malformed/unrelated JSON-LD block, keep looking
    }
  }
  return null;
}

// LinkedIn's current logged-in job-details layout (confirmed live,
// 2026-09) renders everything with fully hashed/atomic CSS class names
// (e.g. "_9cb3f17d", "a9b72b69") -- there is no stable class or id to
// select on at all, which is why the selectors below (kept for the
// older/public layout, which still uses readable class names) come up
// empty on this one. The "About the job" heading text itself is stable
// though, so find that and walk up the tree until the container's text
// grows meaningfully past the heading's own text -- that's the actual
// description block, regardless of how it's classed or how deep it's
// nested. Confirmed against a live posting: heading and its immediate
// wrapper both measured exactly the heading's own length, and the next
// ancestor up jumped to the full ~5100-character description, so this
// stops at the first ancestor that clears a small threshold rather than
// assuming a fixed number of levels.
function tryDescriptionByHeadingText() {
  const HEADING_PHRASES = ['about the job', 'about this job'];
  const isHeadingMatch = (el) => {
    if (el.children.length > 0) return false;
    const t = (el.textContent || '').trim().toLowerCase();
    return HEADING_PHRASES.includes(t);
  };

  const heading =
    Array.from(document.querySelectorAll('h1,h2,h3,h4')).find(isHeadingMatch) ||
    Array.from(document.querySelectorAll('div,span,p,strong,b,legend')).find(isHeadingMatch);
  if (!heading) return null;

  const headingText = heading.textContent.trim();
  let container = heading.parentElement;
  let sectionText = null;
  for (let i = 0; i < 6 && container; i++) {
    const text = (container.innerText || '').trim();
    // +40 is a low bar on purpose -- real description content is
    // thousands of characters past the heading alone, while wrapper
    // divs that only contain the heading itself match it almost
    // exactly. This just needs to skip those, not tune precisely.
    if (text.length - headingText.length > 40) {
      sectionText = text;
      break;
    }
    container = container.parentElement;
  }
  if (!sectionText) return null;

  // The matched container's text starts with the heading itself
  // (that's how we found it) -- strip that off so the copied text is
  // just the description, not "About the job\n\n<description>".
  if (sectionText.toLowerCase().startsWith(headingText.toLowerCase())) {
    sectionText = sectionText.slice(headingText.length).trim();
  }
  sectionText = sectionText.replace(/\n{3,}/g, '\n\n').trim();
  return sectionText || null;
}

function tryDescriptionDom() {
  // Covers the logged-in "job details" panel (both current and recent
  // past class names) and the older/public page layout.
  const selectors = [
    '#job-details',
    '.jobs-description__content .jobs-box__html-content',
    '.jobs-description-content__text',
    '.show-more-less-html__markup',
    '.description__text',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    // innerText (not textContent) so line breaks between paragraphs/
    // bullets survive -- textContent would run everything into one
    // block of text.
    if (el && el.innerText && el.innerText.trim()) {
      return el.innerText.replace(/\n{3,}/g, '\n\n').trim();
    }
  }
  return null;
}

function scrapeLinkedInDescription() {
  const text = tryDescriptionJsonLd() || tryDescriptionByHeadingText() || tryDescriptionDom();
  if (!text) {
    return { ok: false, error: 'Could not find a job description on this page.' };
  }
  return { ok: true, description: text };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'SCRAPE_JOB') {
    try {
      sendResponse(scrapeLinkedIn());
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
    return true;
  }
  if (message && message.type === 'GET_JOB_DESCRIPTION') {
    try {
      sendResponse(scrapeLinkedInDescription());
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
    return true;
  }
  return true;
});
