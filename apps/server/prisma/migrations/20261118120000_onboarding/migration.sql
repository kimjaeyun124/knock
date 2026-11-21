-- 초기 설정 진행 단계, 보호 대상 메모, 알림 수신 설정

ALTER TABLE "Household" ADD COLUMN "onboardingStep" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CareRecipient" ADD COLUMN "memo" TEXT;

-- 이미 초기 설정을 마친 가구는 마지막 단계로 표시한다.
UPDATE "Household" SET "onboardingStep" = 6 WHERE "setupCompletedAt" IS NOT NULL;

CREATE TABLE "AlertPreferences" (
    "householdId" TEXT NOT NULL PRIMARY KEY,
    "bedAreaActivity" BOOLEAN NOT NULL DEFAULT true,
    "bedToPath" BOOLEAN NOT NULL DEFAULT true,
    "entranceApproach" BOOLEAN NOT NULL DEFAULT true,
    "repeatedMovement" BOOLEAN NOT NULL DEFAULT true,
    "sensorIssues" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AlertPreferences_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
