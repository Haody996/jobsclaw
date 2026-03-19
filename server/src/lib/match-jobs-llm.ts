import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'
import type { ScrapedJob } from './scrape-linkedin'

export interface JobMatch {
  company: string
  title: string
  link: string
  location: string
  match_rationale: string
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

const model = genAI.getGenerativeModel({
  model: 'gemini-2.0-flash',
  generationConfig: {
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
  },
  systemInstruction:
    "You are an expert technical recruiter. Analyze the candidate's resume and select the top 5 best-matching jobs from the provided list. " +
    'For each match, write a punchy 1-2 sentence match_rationale explaining exactly why this job fits the candidate.',
})

export async function matchJobsToResume(
  resumeText: string,
  jobs: ScrapedJob[]
): Promise<JobMatch[]> {
  const prompt =
    `Resume (first 4000 chars):\n${resumeText.slice(0, 4000)}\n\n` +
    `Jobs (${jobs.length} total):\n${JSON.stringify(jobs)}`

  const result = await model.generateContent(prompt)
  const text = result.response.text()

  const parsed = JSON.parse(text) as { top_matches: JobMatch[] }
  if (!Array.isArray(parsed.top_matches) || parsed.top_matches.length === 0) {
    throw new Error('Gemini returned no matches')
  }
  return parsed.top_matches
}
