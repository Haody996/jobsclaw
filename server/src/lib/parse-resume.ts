export interface ParsedProfile {
  firstName?: string
  lastName?: string
  phone?: string
  city?: string
  state?: string
  zip?: string
  linkedinUrl?: string
  portfolioUrl?: string
}

export function parseResumeText(text: string): ParsedProfile {
  const result: ParsedProfile = {}

  // Phone — matches common US/international formats
  const phoneMatch = text.match(/(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/)
  if (phoneMatch) result.phone = phoneMatch[0].trim()

  // LinkedIn URL
  const linkedinMatch = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w%-]+\/?/i)
  if (linkedinMatch) {
    const url = linkedinMatch[0]
    result.linkedinUrl = url.startsWith('http') ? url : `https://${url}`
  }

  // GitHub (portfolio fallback)
  const githubMatch = text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[\w-]+\/?/i)
  if (githubMatch) {
    const url = githubMatch[0]
    result.portfolioUrl = url.startsWith('http') ? url : `https://${url}`
  }

  // Other portfolio URL (if no GitHub found)
  if (!result.portfolioUrl) {
    const portfolioMatch = text.match(
      /https?:\/\/(?!.*(?:linkedin|github|google|facebook|twitter|instagram|apple|microsoft))[^\s,<>"']+/i
    )
    if (portfolioMatch) result.portfolioUrl = portfolioMatch[0].replace(/[.,;)]+$/, '')
  }

  // US state abbreviation + ZIP code
  const stateZipMatch = text.match(/\b([A-Z]{2})[,\s]+(\d{5}(?:-\d{4})?)\b/)
  if (stateZipMatch) {
    result.state = stateZipMatch[1]
    result.zip = stateZipMatch[2]
  }

  // City — word(s) immediately before state abbreviation
  if (result.state) {
    const cityRegex = new RegExp(`([A-Z][\\w\\s]{1,30}),?\\s+${result.state}\\b`)
    const cityMatch = text.match(cityRegex)
    if (cityMatch) {
      // Take only last segment in case of multi-line capture
      result.city = cityMatch[1].split(/\n/).pop()?.trim()
    }
  }

  // Name — look for "Firstname Lastname" pattern in the first 10 non-empty lines
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  for (const line of lines.slice(0, 10)) {
    // Skip lines that look like contact info
    if (line.includes('@') || line.includes('http') || line.includes('linkedin') || /\d{3}/.test(line)) continue
    // Match 2–3 title-case words (a name)
    const nameMatch = line.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})$/)
    if (nameMatch) {
      const parts = nameMatch[1].split(/\s+/)
      result.firstName = parts[0]
      result.lastName = parts.slice(1).join(' ')
      break
    }
  }

  return result
}
