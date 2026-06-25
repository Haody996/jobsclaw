import { searchJobs } from './jsearch'

// Resolves a job (title + company) to a real, fillable apply URL via jsearch.
// LinkedIn hides external apply URLs from logged-out scrapers, so we look the
// job up in jsearch's aggregated index and pick the best non-LinkedIn link.
// Used both at sourcing time (attach a URL to each match) and apply time
// (resolve / get fallback candidates).

const LOG = '[resolve-apply-url]'

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// Strip trailing legal-entity suffixes so "Parsec Automation, LLC" and
// "Parsec Automation Corp." normalize to the same thing.
const LEGAL_SUFFIXES = [
  'llc', 'inc', 'incorporated', 'corp', 'corporation', 'ltd', 'limited',
  'co', 'company', 'lp', 'llp', 'plc', 'gmbh', 'ag', 'sa', 'srl', 'bv', 'pllc', 'pc',
]
function normalizeCompany(s: string): string {
  let n = normalize(s)
  let changed = true
  while (changed) {
    changed = false
    for (const suf of LEGAL_SUFFIXES) {
      if (n.endsWith(' ' + suf)) {
        n = n.slice(0, -(suf.length + 1)).trim()
        changed = true
      }
    }
  }
  return n
}

// Sites we cannot get past without a real session (Cloudflare/captcha/login).
const BOT_PROTECTED_HOSTS = ['ziprecruiter.com', 'glassdoor.com', 'monster.com', 'simplyhired.com']
// Known ATS hosts our adapters can actually fill — highest priority.
const DIRECT_ATS_HOSTS = ['greenhouse.io', 'boards.greenhouse', 'lever.co', 'ashbyhq.com', 'myworkdayjobs.com', 'icims.com']

function urlScore(link: string): number {
  if (!link) return -100
  if (link.includes('linkedin.com')) return -100
  if (DIRECT_ATS_HOSTS.some((h) => link.includes(h))) return 100
  if (BOT_PROTECTED_HOSTS.some((h) => link.includes(h))) return -50
  if (link.includes('indeed.com')) return 0 // dedicated flow, but frequently Cloudflare-gated — try last
  return 10 // unknown host, prefer over bot-protected/indeed but below direct ATS
}

interface ResolveOpts {
  /** How many jsearch query variants to run (default 3). Sourcing uses 1 to limit API spend. */
  maxQueries?: number
}

/** Distinguishable failure reason when no candidates surface — lets callers
 *  surface a clear error instead of the generic "no usable link". */
export class ResolveQuotaExhausted extends Error {
  constructor() { super('jsearch quota exhausted (HTTP 429) — Auto Apply URL resolution is unavailable until the API quota resets or the plan is upgraded.') }
}

// Returns a ranked list of candidate apply URLs (best first), excluding
// LinkedIn and fully bot-protected hosts.
export async function resolveApplyUrls(
  title: string,
  company: string,
  location?: string | null,
  opts: ResolveOpts = {}
): Promise<string[]> {
  // Ordered most-productive-first: a bare "title company" query reliably
  // returns hits, while the location-qualified variant is often too narrow
  // and returns nothing. maxQueries truncates from the front.
  const allQueries = [
    `${title} ${company}`,
    `${title} at ${company}${location ? ' ' + location : ''}`,
    `"${company}" "${title}"`,
  ]
  const queries = allQueries.slice(0, Math.max(1, opts.maxQueries ?? 3))

  const wantTitle = normalize(title)
  const wantCompany = normalizeCompany(company)

  type Candidate = { link: string; publisher: string; isDirect: boolean; matchScore: number }
  const seen = new Set<string>()
  const candidates: Candidate[] = []
  let queriesRan = 0
  let queriesRateLimited = 0

  for (const q of queries) {
    let results: Awaited<ReturnType<typeof searchJobs>> = []
    try {
      results = await searchJobs({ q, num_pages: 1 })
      queriesRan++
    } catch (err: any) {
      const status = err?.response?.status
      if (status === 429) queriesRateLimited++
      console.error(`${LOG} query failed:`, q, '→', err?.message || err)
      continue
    }

    for (const j of results) {
      const t = normalize(j.job_title)
      const c = normalizeCompany(j.employer_name)
      const titleMatch = t === wantTitle ? 2 : (t.includes(wantTitle) || wantTitle.includes(t) ? 1 : 0)
      const companyMatch = c === wantCompany ? 2 : (c.includes(wantCompany) || wantCompany.includes(c) ? 1 : 0)
      if (companyMatch === 0 || titleMatch === 0) continue
      const matchScore = titleMatch + companyMatch

      const opts2: { link: string; publisher: string; isDirect: boolean }[] = []
      if (j.apply_options && j.apply_options.length) {
        for (const o of j.apply_options) opts2.push({ link: o.apply_link, publisher: o.publisher, isDirect: !!o.is_direct })
      } else if (j.job_apply_link) {
        opts2.push({ link: j.job_apply_link, publisher: j.job_publisher || '?', isDirect: !!j.job_apply_is_direct })
      }
      for (const o of opts2) {
        if (!o.link || seen.has(o.link)) continue
        seen.add(o.link)
        candidates.push({ ...o, matchScore })
      }
    }

    // First query that already surfaced a direct-ATS hit is good enough.
    if (candidates.some((c) => urlScore(c.link) >= 100)) break
  }

  if (candidates.length === 0) {
    // If every query 429'd, surface that distinctly so the caller can show
    // a "quota exhausted" message instead of "no data".
    if (queriesRan === 0 && queriesRateLimited > 0) throw new ResolveQuotaExhausted()
    return []
  }

  const ranked = candidates
    .map((c) => ({ ...c, total: urlScore(c.link) + (c.isDirect ? 50 : 0) + c.matchScore * 5 }))
    .sort((a, b) => b.total - a.total)

  console.log(`${LOG} "${title}" @ "${company}" → ${ranked.length} candidate(s); top:`,
    ranked.slice(0, 3).map((c) => `[${c.total}] ${c.publisher}${c.isDirect ? '*' : ''} ${c.link.slice(0, 60)}`).join(' | '))

  return ranked.filter((c) => c.total > -50).map((c) => c.link)
}

// Convenience: a single best apply URL, or null. Used at sourcing time to
// stamp each match with a usable URL. Runs up to 2 jsearch queries (the
// resolver early-exits once a direct-ATS hit is found, so it's often just 1).
export async function resolveBestApplyUrl(
  title: string,
  company: string,
  location?: string | null
): Promise<string | null> {
  const urls = await resolveApplyUrls(title, company, location, { maxQueries: 2 })
  return urls[0] ?? null
}
