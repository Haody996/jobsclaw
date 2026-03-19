# JobsClaw

AI-powered job application assistant — find, match, and track jobs effortlessly.

Live at [jobsclaw.net](https://jobsclaw.net)

## Features

- **AI Job Matches** — Claude AI ranks scraped LinkedIn jobs against your resume; live progress updates
- **Daily Email Digest** — automated daily email with your top 5 matched jobs
- **Job Board** — browse weekly-refreshed jobs stored in DB (no live API calls on every load)
- **Auto Apply** — automated LinkedIn Easy Apply via Playwright
- **Application Tracker** — track status of all your applications
- **Profile & Resume** — upload PDF resume with auto-extracted text; autocomplete for keywords & location
- **Google Sign-In** — OAuth2 login alongside email/password

## Tech Stack

- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Backend:** Node.js + Express + TypeScript
- **Database:** PostgreSQL (Prisma ORM)
- **Queue:** BullMQ + Redis
- **AI:** Anthropic Claude (Haiku) for job matching
- **Email:** Nodemailer (SMTP)
- **Scraping:** Playwright + Cheerio

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL
- Redis
- Docker + Docker Compose (for deployment)

### Local Development

```bash
# Install dependencies
cd server && npm install
cd ../client && npm install

# Set up environment
cp .env.example server/.env
# Edit server/.env with your values

# Run database migrations
cd server && npx prisma migrate dev

# Start dev servers (two terminals)
cd server && npm run dev        # API on :3001
cd client && npm run dev        # UI on :5173
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing auth tokens |
| `REDIS_URL` | Redis connection string |
| `ANTHROPIC_API_KEY` | Claude API key (console.anthropic.com) |
| `SMTP_HOST` | SMTP server host |
| `SMTP_PORT` | SMTP port (587 for TLS) |
| `SMTP_USER` | SMTP username / email |
| `SMTP_PASS` | SMTP password / app password |
| `CLIENT_URL` | Frontend URL (for CORS) |

## Deployment

Uses Docker Compose. Includes app, sourcing worker, Postgres, and Redis.

```bash
cp .env.example .env
nano .env          # fill in secrets

./deploy.sh        # build + migrate + start
```

See [`nginx/jobsclaw.net.conf`](nginx/jobsclaw.net.conf) for the Nginx reverse proxy config.

## Workers

```bash
cd server
npm run worker            # LinkedIn Easy Apply worker
npm run sourcing-worker   # Daily job digest worker
```
