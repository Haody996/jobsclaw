-- Auto Apply confidence tier set at sourcing time.
-- 'ready'        = applyUrl host is a known ATS (Greenhouse/Lever/Ashby/Workday/iCIMS) → Auto Apply offered
-- 'maybe'        = applyUrl is an unwrappable aggregator (Built In etc.) or Indeed → Try Auto Apply (amber)
-- 'unsupported'  = no usable URL, custom SPA, Cloudflare-gated, etc. → manual apply only

ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "applyTier" TEXT;
