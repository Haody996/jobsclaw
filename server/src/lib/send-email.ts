import nodemailer from 'nodemailer'
import type { JobMatch, MatchSection } from './match-jobs-llm'

function buildJobRows(matches: JobMatch[]): string {
  return matches
    .map((job, i) => {
      const score = job.compatibility_score != null
        ? (job.compatibility_score / 10).toFixed(1)
        : null
      const scoreColor = job.compatibility_score != null
        ? job.compatibility_score >= 85 ? '#15803d' : job.compatibility_score >= 65 ? '#a16207' : '#475569'
        : '#475569'
      const scoreBg = job.compatibility_score != null
        ? job.compatibility_score >= 85 ? '#dcfce7' : job.compatibility_score >= 65 ? '#fef9c3' : '#f1f5f9'
        : '#f1f5f9'
      return `
      <tr>
        <td style="padding:20px 24px; border-bottom:1px solid #e2e8f0;">
          <table style="width:100%; border-collapse:collapse;"><tr>
            <td style="vertical-align:top;">
              <p style="margin:0 0 2px; font-size:15px; font-weight:700; color:#1e293b;">
                ${i + 1}.&nbsp;
                <a href="${job.link}" style="color:#4f46e5; text-decoration:none;">${job.title}</a>
              </p>
              <p style="margin:0 0 8px; font-size:13px; color:#64748b; font-weight:600;">
                ${job.company}${job.location ? ` &middot; ${job.location}` : ''}
              </p>
              <p style="margin:0; font-size:14px; color:#475569; line-height:1.5;">
                ${job.match_rationale}
              </p>
            </td>
            ${score ? `<td style="vertical-align:top; text-align:right; white-space:nowrap; padding-left:12px; width:1%;"><span style="display:inline-block; background:${scoreBg}; color:${scoreColor}; font-size:12px; font-weight:700; padding:3px 10px; border-radius:20px;">${score} / 10</span></td>` : ''}
          </tr></table>
        </td>
      </tr>`
    })
    .join('')
}

function buildSectionHtml(section: MatchSection): string {
  if (section.matches.length === 0) {
    return `
    <div style="padding:16px 24px; border-bottom:2px solid #e2e8f0;">
      <h2 style="margin:0 0 4px; font-size:16px; font-weight:700; color:#4f46e5;">${section.searchTitle}</h2>
      <p style="margin:0; font-size:13px; color:#94a3b8;">No matches found for this search</p>
    </div>`
  }
  return `
    <div style="padding:16px 24px 0; border-bottom:2px solid #e2e8f0;">
      <h2 style="margin:0 0 4px; font-size:16px; font-weight:700; color:#4f46e5;">${section.searchTitle}</h2>
      <p style="margin:0 0 8px; font-size:13px; color:#94a3b8;">${section.matches.length} match${section.matches.length !== 1 ? 'es' : ''}</p>
    </div>
    <table style="width:100%; border-collapse:collapse;">
      ${buildJobRows(section.matches)}
    </table>`
}

function buildEmailHtml(
  firstName: string,
  sections: MatchSection[],
  location: string,
  clientUrl: string
): string {
  const totalMatches = sections.reduce((s, sec) => s + sec.matches.length, 0)
  const searchTitles = sections.map((s) => s.searchTitle).join(', ')
  const sectionBlocks = sections.map(buildSectionHtml).join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0; padding:0; background:#f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <div style="max-width:600px; margin:40px auto; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%); padding:32px 24px;">
      <h1 style="margin:0; font-size:22px; color:#ffffff; font-weight:700;">
        Your Daily Job Digest
      </h1>
      <p style="margin:6px 0 0; font-size:14px; color:#c7d2fe;">
        ${totalMatches} matches across ${sections.length} search${sections.length !== 1 ? 'es' : ''}${location ? ` in <strong>${location}</strong>` : ''}
      </p>
    </div>

    <!-- Greeting -->
    <div style="padding:24px 24px 0;">
      <p style="margin:0; font-size:15px; color:#334155;">
        Hi <strong>${firstName}</strong>, here are today's best job matches picked just for you:
      </p>
    </div>

    <!-- Sections -->
    ${sectionBlocks}

    <!-- Footer -->
    <div style="padding:24px; background:#f8fafc; border-top:1px solid #e2e8f0;">
      <p style="margin:0; font-size:12px; color:#94a3b8; text-align:center;">
        You're receiving this because you enabled Daily Job Digest in JobsClaw.&nbsp;
        <a href="${clientUrl}/profile" style="color:#4f46e5;">Manage preferences</a>
      </p>
    </div>
  </div>
</body>
</html>`
}

export async function sendDigestEmail(
  toEmail: string,
  firstName: string,
  sections: MatchSection[],
  location: string
): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })

  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173'
  const html = buildEmailHtml(firstName, sections, location, clientUrl)
  const totalMatches = sections.reduce((s, sec) => s + sec.matches.length, 0)
  const searchTitles = sections.map((s) => s.searchTitle).join(', ')

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: toEmail,
    subject: `${totalMatches} New Job Matches — ${searchTitles}${location ? ` in ${location}` : ''}`,
    html,
  })
}
