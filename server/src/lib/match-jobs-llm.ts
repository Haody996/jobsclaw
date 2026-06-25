import { GoogleGenerativeAI, SchemaType, type GenerationConfig } from '@google/generative-ai'
import type { ScrapedJob } from './scrape-linkedin'

export interface JobMatch {
  company: string
  title: string
  link: string
  location: string
  match_rationale: string
  compatibility_score: number
  isEasyApply?: boolean
  /** Real, fillable apply URL resolved via jsearch at sourcing time. */
  applyUrl?: string
  /** Confidence tier for Auto Apply — drives the UI CTA.
   *  'ready'        = applyUrl host is a known ATS, will work
   *  'maybe'        = applyUrl is an unwrappable aggregator (Built In etc.)
   *  'unsupported'  = no usable URL, custom SPA, Cloudflare host, etc. */
  applyTier?: 'ready' | 'maybe' | 'unsupported'
}

export interface MatchSection {
  searchTitle: string
  matches: JobMatch[]
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash-001']

function buildConfig(matchLimit: number): { generationConfig: GenerationConfig; systemInstruction: string } {
  return {
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          top_matches: {
            type: SchemaType.ARRAY,
            minItems: 1,
            maxItems: matchLimit,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                company: { type: SchemaType.STRING },
                title: { type: SchemaType.STRING },
                link: { type: SchemaType.STRING },
                location: { type: SchemaType.STRING },
                match_rationale: { type: SchemaType.STRING },
                compatibility_score: { type: SchemaType.INTEGER },
              },
              required: ['company', 'title', 'link', 'location', 'match_rationale', 'compatibility_score'],
            },
          },
        },
        required: ['top_matches'],
      },
    },
    systemInstruction:
      `You are an expert technical recruiter. Analyze the candidate's resume and select the top ${matchLimit} best-matching jobs from the provided list. ` +
      'For each match, write a punchy 1-2 sentence match_rationale explaining exactly why this job fits the candidate. ' +
      'Also provide a compatibility_score from 0 to 100 representing how well the candidate matches the job requirements.',
  }
}

export async function matchJobsToResume(
  resumeText: string,
  jobs: ScrapedJob[],
  matchLimit = 5
): Promise<JobMatch[]> {
  const { generationConfig, systemInstruction } = buildConfig(matchLimit)
  const prompt =
    `Resume (first 4000 chars):\n${resumeText.slice(0, 4000)}\n\n` +
    `Jobs (${jobs.length} total):\n${JSON.stringify(jobs)}`

  let lastError: Error | undefined
  for (const modelName of MODELS) {
    try {
      console.log(`[match-jobs-llm] Trying ${modelName}…`)
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig,
        systemInstruction,
      })
      const result = await model.generateContent(prompt)
      const text = result.response.text()
      const parsed = JSON.parse(text) as { top_matches: JobMatch[] }
      if (!Array.isArray(parsed.top_matches) || parsed.top_matches.length === 0) {
        throw new Error('no matches returned')
      }
      console.log(`[match-jobs-llm] ${modelName} succeeded`)
      // Attach isEasyApply from source jobs (LLM doesn't return this field)
      const byLink = new Map(jobs.map((j) => [j.link, j]))
      return parsed.top_matches.map((m) => ({
        ...m,
        isEasyApply: byLink.get(m.link)?.isEasyApply ?? false,
      }))
    } catch (err: any) {
      lastError = err
      console.warn(`[match-jobs-llm] ${modelName} failed: ${err?.message}`)
    }
  }
  throw new Error(`All Gemini models failed: ${lastError?.message}`)
}
