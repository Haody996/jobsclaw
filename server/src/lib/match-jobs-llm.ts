import { GoogleGenerativeAI, SchemaType, type GenerationConfig } from '@google/generative-ai'
import type { ScrapedJob } from './scrape-linkedin'

export interface JobMatch {
  company: string
  title: string
  link: string
  location: string
  match_rationale: string
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

const MODELS = ['gemini-2.5-flash-preview-05-20', 'gemini-2.0-flash']

const GENERATION_CONFIG: GenerationConfig = {
  responseMimeType: 'application/json',
  responseSchema: {
    type: SchemaType.OBJECT,
    properties: {
      top_matches: {
        type: SchemaType.ARRAY,
        minItems: 1,
        maxItems: 5,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            company: { type: SchemaType.STRING },
            title: { type: SchemaType.STRING },
            link: { type: SchemaType.STRING },
            location: { type: SchemaType.STRING },
            match_rationale: { type: SchemaType.STRING },
          },
          required: ['company', 'title', 'link', 'location', 'match_rationale'],
        },
      },
    },
    required: ['top_matches'],
  },
}

const SYSTEM_INSTRUCTION =
  "You are an expert technical recruiter. Analyze the candidate's resume and select the top 5 best-matching jobs from the provided list. " +
  'For each match, write a punchy 1-2 sentence match_rationale explaining exactly why this job fits the candidate.'

export async function matchJobsToResume(
  resumeText: string,
  jobs: ScrapedJob[]
): Promise<JobMatch[]> {
  const prompt =
    `Resume (first 4000 chars):\n${resumeText.slice(0, 4000)}\n\n` +
    `Jobs (${jobs.length} total):\n${JSON.stringify(jobs)}`

  let lastError: Error | undefined
  for (const modelName of MODELS) {
    try {
      console.log(`[match-jobs-llm] Trying ${modelName}…`)
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: GENERATION_CONFIG,
        systemInstruction: SYSTEM_INSTRUCTION,
      })
      const result = await model.generateContent(prompt)
      const text = result.response.text()
      const parsed = JSON.parse(text) as { top_matches: JobMatch[] }
      if (!Array.isArray(parsed.top_matches) || parsed.top_matches.length === 0) {
        throw new Error('no matches returned')
      }
      console.log(`[match-jobs-llm] ${modelName} succeeded`)
      return parsed.top_matches
    } catch (err: any) {
      lastError = err
      console.warn(`[match-jobs-llm] ${modelName} failed: ${err?.message}`)
    }
  }
  throw new Error(`All Gemini models failed: ${lastError?.message}`)
}
