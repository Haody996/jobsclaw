export interface ApplyContext {
  page: any // Playwright Page
  job: { id: string; url: string; title: string; company: string }
  profile: {
    firstName: string
    lastName: string
    phone?: string | null
    city?: string | null
    state?: string | null
    zip?: string | null
    address?: string | null
    country?: string
    linkedinUrl?: string | null
    portfolioUrl?: string | null
    resumePath?: string | null
    resumeText?: string | null
    bio?: string | null
  }
  email: string
  answers: { question: string; answer: string }[]
}

export interface ATSAdapter {
  name: string
  canHandle(url: string): boolean
  apply(ctx: ApplyContext): Promise<void>
}
