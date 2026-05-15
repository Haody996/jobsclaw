-- Drop LinkedIn login credentials from Profile. The auto-apply worker no
-- longer logs into LinkedIn (it only handles non-Easy-Apply jobs by following
-- the external Apply-on-company-site redirect to the ATS), so these fields
-- are unused and removing them eliminates the plaintext-password issue.

ALTER TABLE "Profile" DROP COLUMN IF EXISTS "linkedinEmail";
ALTER TABLE "Profile" DROP COLUMN IF EXISTS "linkedinPassword";
