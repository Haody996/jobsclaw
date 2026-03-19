import nodemailer from 'nodemailer'
import type { JobMatch } from './match-jobs-llm'

function buildEmailHtml(
  firstName: string,
  matches: JobMatch[],
  keywords: string,
  location: string,
  clientUrl: string
): string {
  const jobRows = matches
    .map(
      (job, i) => `
      <tr>
        <td style="padding:20px 24px; border-bottom:1px solid #e2e8f0;">
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
      </tr>`
    )
    .join('')

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
        Top ${matches.length} matches for <strong>${keywords}</strong> in <strong>${location}</strong>
      </p>
    </div>

    <!-- Greeting -->
    <div style="padding:24px 24px 0;">
      <p style="margin:0; font-size:15px; color:#334155;">
        Hi <strong>${firstName}</strong>, here are today's best job matches picked just for you:
      </p>
    </div>

    <!-- Job list -->
    <table style="width:100%; border-collapse:collapse; margin-top:16px;">
      ${jobRows}
    </table>

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
  matches: JobMatch[],
  keywords: string,
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
  const html = buildEmailHtml(firstName, matches, keywords, location, clientUrl)

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: toEmail,
    subject: `${matches.length} New Job Matches — ${keywords} in ${location}`,
    html,
  })
}
