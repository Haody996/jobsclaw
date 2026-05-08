export type ATSName =
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'workday'
  | 'icims'
  | 'linkedin'
  | 'indeed'
  | 'generic'

export function detectATS(url: string): ATSName {
  if (url.includes('greenhouse.io') || url.includes('boards.greenhouse')) return 'greenhouse'
  if (url.includes('lever.co') || url.includes('jobs.lever')) return 'lever'
  if (url.includes('ashbyhq.com') || url.includes('jobs.ashby')) return 'ashby'
  if (url.includes('myworkdayjobs.com') || url.includes('wd1.myworkdayjobs') || url.includes('wd5.myworkdayjobs')) return 'workday'
  if (url.includes('.icims.com')) return 'icims'
  if (url.includes('linkedin.com/jobs')) return 'linkedin'
  if (url.includes('indeed.com')) return 'indeed'
  return 'generic'
}
