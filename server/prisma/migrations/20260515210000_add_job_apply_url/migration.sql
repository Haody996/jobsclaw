-- Real, fillable apply URL resolved via jsearch at sourcing time. LinkedIn
-- job URLs hide the external apply link behind a login wall, so each match
-- is stamped with a resolved ATS URL up front; the apply worker uses it
-- instead of (or before) a live lookup.

ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "applyUrl" TEXT;
