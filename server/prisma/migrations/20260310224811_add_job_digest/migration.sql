-- CreateTable
CREATE TABLE "JobPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "keywords" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "dailyEmailTime" TEXT NOT NULL DEFAULT '09:00',
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobMatchHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "runDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobLinks" TEXT[],
    "topMatches" JSONB NOT NULL,

    CONSTRAINT "JobMatchHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobPreference_userId_key" ON "JobPreference"("userId");

-- AddForeignKey
ALTER TABLE "JobPreference" ADD CONSTRAINT "JobPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMatchHistory" ADD CONSTRAINT "JobMatchHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
