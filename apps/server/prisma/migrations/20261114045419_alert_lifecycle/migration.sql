-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Alert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "origin" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "sensorId" TEXT,
    "triggeredAt" DATETIME NOT NULL,
    "acknowledgedAt" DATETIME,
    "acknowledgedById" TEXT,
    "resolvedAt" DATETIME,
    "resolution" TEXT,
    "note" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "lastEventAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "lastNotifiedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Alert_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Alert_sensorId_fkey" FOREIGN KEY ("sensorId") REFERENCES "Sensor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Alert" ("acknowledgedAt", "acknowledgedById", "dedupeKey", "householdId", "id", "message", "note", "origin", "resolution", "resolvedAt", "sensorId", "severity", "status", "title", "triggeredAt", "type") SELECT "acknowledgedAt", "acknowledgedById", "dedupeKey", "householdId", "id", "message", "note", "origin", "resolution", "resolvedAt", "sensorId", "severity", "status", "title", "triggeredAt", "type" FROM "Alert";
DROP TABLE "Alert";
ALTER TABLE "new_Alert" RENAME TO "Alert";
CREATE INDEX "Alert_householdId_status_triggeredAt_idx" ON "Alert"("householdId", "status", "triggeredAt");
CREATE INDEX "Alert_householdId_dedupeKey_idx" ON "Alert"("householdId", "dedupeKey");
CREATE TABLE "new_NotificationDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "alertId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "providerMode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" DATETIME,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationDelivery_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NotificationDelivery_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_NotificationDelivery" ("alertId", "attempts", "channel", "createdAt", "guardianId", "id", "lastError", "providerMode", "sentAt", "status") SELECT "alertId", "attempts", "channel", "createdAt", "guardianId", "id", "lastError", "providerMode", "sentAt", "status" FROM "NotificationDelivery";
DROP TABLE "NotificationDelivery";
ALTER TABLE "new_NotificationDelivery" RENAME TO "NotificationDelivery";
CREATE INDEX "NotificationDelivery_alertId_idx" ON "NotificationDelivery"("alertId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
