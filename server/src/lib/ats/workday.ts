import type { ATSAdapter } from './types'

// Workday requires account creation and has a heavily dynamic React app.
// Automation is extremely brittle — mark as manual-required.
export const workdayAdapter: ATSAdapter = {
  name: 'workday',
  canHandle: (url) =>
    url.includes('myworkdayjobs.com') ||
    url.includes('wd1.myworkdayjobs') ||
    url.includes('wd5.myworkdayjobs'),

  async apply() {
    throw new Error(
      'Workday applications require account creation and cannot be automated reliably. Please apply manually via the link.'
    )
  },
}
