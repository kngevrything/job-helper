// Greenhouse job page scraper.
// Greenhouse job boards come in two shapes ("boards.greenhouse.io/..." legacy,
// "job-boards.greenhouse.io/..." newer React one), plus some companies embed
// a Greenhouse board on their own domain. Rather than special-case each DOM
// layout, we prefer the schema.org JobPosting JSON-LD block that most
// Greenhouse boards emit for SEO -- when present it's the most reliable
// source. DOM selectors are a fallback for boards that don't emit it.

function extractJobIdFromUrl(url) {
  const match = url.match(/\/jobs\/(\d+)/);
  return match ? match[1] : null;
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
      company = el.alt.trim();
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

function scrapeGreenhouse() {
  const result = tryJsonLd() || tryDomSelectors() || tryDocumentTitle() || {
    jobTitle: null,
    company: null,
    confidence: 'low',
    via: 'none',
  };

  return {
    ok: true,
    source: 'greenhouse',
    jobTitle: result.jobTitle,
    company: result.company,
    jobUrl: window.location.href.split('?')[0].split('#')[0],
    jobId: extractJobIdFromUrl(window.location.href),
    confidence: result.confidence,
    scrapedVia: result.via,
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
