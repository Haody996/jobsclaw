import Anthropic from '@anthropic-ai/sdk'
import type { ScrapedJob } from './scrape-linkedin'

export interface JobMatch {
  company: string
  title: string
  link: string
  location: string
  match_rationale: string
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function matchJobsToResume(
  resumeText: string,
  jobs: ScrapedJob[]
): Promise<JobMatch[]> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system:
      "You are an expert technical recruiter. I will provide a candidate's resume text and a JSON array of recent job postings. " +
      'Analyze the technical skills, experience level, and domain expertise in the resume, then select the top 5 best-matching jobs. ' +
      'Return ONLY a JSON object matching the required schema. Do not include markdown formatting or conversational text.',
    tools: [
      {
        name: 'select_top_matches',
        description: 'Select the top 5 best-matching jobs for this candidate',
        input_schema: {
          type: 'object' as const,
          properties: {
            top_matches: {
              type: 'array',
              minItems: 1,
              maxItems: 5,
              items: {
                type: 'object',
                properties: {
                  company: { type: 'string' },
                  title: { type: 'string' },
                  link: { type: 'string' },
                  location: { type: 'string' },
                  match_rationale: {
                    type: 'string',
                    description:
                      'A punchy 1-2 sentence explanation of exactly why this job fits the candidate.',
                  },
                },
                required: ['company', 'title', 'link', 'location', 'match_rationale'],
              },
            },
          },
          required: ['top_matches'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'select_top_matches' },
    messages: [
      {
        role: 'user',
        content:
          `Resume (first 4000 chars):\n${resumeText.slice(0, 4000)}\n\n` +
          `Jobs (${jobs.length} total):\n${JSON.stringify(jobs)}`,
      },
    ],
  })

  const toolUse = response.content.find((b) => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('LLM did not return a tool_use block')
  }

  const input = toolUse.input as { top_matches: JobMatch[] }
  return input.top_matches
}
