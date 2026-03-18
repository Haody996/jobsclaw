import axios from 'axios'

export interface JSearchJob {
  job_id: string
  job_title: string
  employer_name: string
  job_city: string
  job_state: string
  job_country: string
  job_description: string
  job_apply_link: string
  job_source: string
  job_employment_type: string
  job_salary_min?: number
  job_salary_max?: number
  job_salary_currency?: string
  job_salary_period?: string
  job_is_remote: boolean
  job_posted_at_datetime_utc?: string
}

export interface SearchParams {
  q: string
  page?: number
  num_pages?: number
  date_posted?: string  // 'all' | 'today' | '3days' | 'week' | 'month'
  employment_types?: string  // 'FULLTIME,PARTTIME,CONTRACTOR,INTERN'
  remote_jobs_only?: boolean
  job_requirements?: string
  query?: string
}

const BASE_URL = 'https://jsearch.p.rapidapi.com'

export async function searchJobs(params: SearchParams): Promise<JSearchJob[]> {
  const apiKey = process.env.RAPIDAPI_KEY
  if (!apiKey) {
    console.warn('RAPIDAPI_KEY not set — returning empty results')
    return []
  }

  const { data } = await axios.get(`${BASE_URL}/search`, {
    headers: {
      'x-rapidapi-host': 'jsearch.p.rapidapi.com',
      'x-rapidapi-key': apiKey,
    },
    params: {
      query: params.q,
      page: params.page ?? 1,
      num_pages: params.num_pages ?? 1,
      date_posted: params.date_posted ?? 'all',
      employment_types: params.employment_types,
      remote_jobs_only: params.remote_jobs_only ? 'true' : undefined,
    },
  })

  return (data.data || []) as JSearchJob[]
}

export function formatSalary(job: JSearchJob): string | null {
  if (!job.job_salary_min && !job.job_salary_max) return null
  const currency = job.job_salary_currency || 'USD'
  const period = job.job_salary_period || 'YEAR'
  const fmt = (n: number) => `${currency} ${n.toLocaleString()}`
  if (job.job_salary_min && job.job_salary_max) {
    return `${fmt(job.job_salary_min)} – ${fmt(job.job_salary_max)} / ${period}`
  }
  return `${fmt(job.job_salary_min || job.job_salary_max!)} / ${period}`
}
