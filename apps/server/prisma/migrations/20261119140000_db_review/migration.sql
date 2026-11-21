-- 데이터 모델 점검(docs/DATABASE.md): 수정 시각(updatedAt), 장치 고유 번호(deviceId), 조회용 인덱스
--
-- Prisma 가 만든 테이블 재구성 스크립트이다. 기존 행의 updatedAt 은 생성 시각(createdAt)으로 채운다.
-- (SQLite 는 ALTER TABLE 로 CURRENT_TIMESTAMP 기본값을 가진 열을 추가할 수 없어 표를 다시 만든다.)


-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CareRecipient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "memo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CareRecipient_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CareRecipient" ("alias", "createdAt", "householdId", "id", "memo", "updatedAt") SELECT "alias", "createdAt", "householdId", "id", "memo", "createdAt" FROM "CareRecipient";
DROP TABLE "CareRecipient";
ALTER TABLE "new_CareRecipient" RENAME TO "CareRecipient";
CREATE UNIQUE INDEX "CareRecipient_householdId_key" ON "CareRecipient"("householdId");
CREATE TABLE "new_Guardian" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'OWNER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Guardian_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Guardian" ("createdAt", "displayName", "email", "householdId", "id", "passwordHash", "role", "updatedAt") SELECT "createdAt", "displayName", "email", "householdId", "id", "passwordHash", "role", "createdAt" FROM "Guardian";
DROP TABLE "Guardian";
ALTER TABLE "new_Guardian" RENAME TO "Guardian";
CREATE UNIQUE INDEX "Guardian_email_key" ON "Guardian"("email");
CREATE INDEX "Guardian_householdId_idx" ON "Guardian"("householdId");
CREATE TABLE "new_Household" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "setupCompletedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "onboardingStep" INTEGER NOT NULL DEFAULT 1
);
INSERT INTO "new_Household" ("createdAt", "id", "name", "onboardingStep", "setupCompletedAt", "updatedAt") SELECT "createdAt", "id", "name", "onboardingStep", "setupCompletedAt", "createdAt" FROM "Household";
DROP TABLE "Household";
ALTER TABLE "new_Household" RENAME TO "Household";
CREATE TABLE "new_Sensor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "deviceId" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'MOTION',
    "zone" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" DATETIME,
    "batteryPercent" INTEGER,
    "firmwareVersion" TEXT,
    "sensitivity" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Sensor_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Sensor" ("batteryPercent", "createdAt", "firmwareVersion", "householdId", "id", "isActive", "kind", "lastSeenAt", "name", "origin", "sensitivity", "tokenHash", "zone", "updatedAt") SELECT "batteryPercent", "createdAt", "firmwareVersion", "householdId", "id", "isActive", "kind", "lastSeenAt", "name", "origin", "sensitivity", "tokenHash", "zone", "createdAt" FROM "Sensor";
DROP TABLE "Sensor";
ALTER TABLE "new_Sensor" RENAME TO "Sensor";
CREATE UNIQUE INDEX "Sensor_tokenHash_key" ON "Sensor"("tokenHash");
CREATE INDEX "Sensor_householdId_zone_idx" ON "Sensor"("householdId", "zone");
CREATE UNIQUE INDEX "Sensor_householdId_deviceId_key" ON "Sensor"("householdId", "deviceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "NotificationDelivery_guardianId_idx" ON "NotificationDelivery"("guardianId");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_nextAttemptAt_idx" ON "NotificationDelivery"("status", "nextAttemptAt");

