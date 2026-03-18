const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'are', 'you', 'will', 'have',
  'from', 'our', 'we', 'your', 'can', 'work', 'team', 'role', 'a', 'an', 'in',
  'of', 'to', 'be', 'as', 'at', 'or', 'on', 'is', 'it', 'by', 'do',
])

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s#+.]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t))
  )
}

export function computeMatchScore(jobDescription: string, resumeText: string): number {
  if (!resumeText || !jobDescription) return 0

  const jobTokens = tokenize(jobDescription)
  const resumeTokens = tokenize(resumeText)

  if (jobTokens.size === 0) return 0

  let matches = 0
  for (const token of jobTokens) {
    if (resumeTokens.has(token)) matches++
  }

  // Scale: full overlap = 100, but typical good match is ~40-60% overlap → cap at 100
  const raw = (matches / jobTokens.size) * 200
  return Math.min(100, Math.round(raw))
}
