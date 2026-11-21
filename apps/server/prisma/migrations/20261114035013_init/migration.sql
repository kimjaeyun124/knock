-- CreateTable
CREATE TABLE "Household" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Guardian" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'OWNER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Guardian_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guardianId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "Session_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CareRecipient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CareRecipient_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DetectionSettings" (
    "householdId" TEXT NOT NULL PRIMARY KEY,
    "nightStart" TEXT NOT NULL DEFAULT '22:00',
    "nightEnd" TEXT NOT NULL DEFAULT '06:00',
    "sensitivity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "sequenceWindowMinutes" INTEGER NOT NULL DEFAULT 10,
    "cooldownMinutes" INTEGER NOT NULL DEFAULT 10,
    "reminderMinutes" INTEGER NOT NULL DEFAULT 5,
    "offlineAfterSeconds" INTEGER NOT NULL DEFAULT 300,
    "lowBatteryPercent" INTEGER NOT NULL DEFAULT 20,
    "criticalBatteryPercent" INTEGER NOT NULL DEFAULT 10,
    "retentionDays" INTEGER NOT NULL DEFAULT 90,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DetectionSettings_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Sensor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'MOTION',
    "zone" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" DATETIME,
    "batteryPercent" INTEGER,
    "firmwareVersion" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Sensor_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SensorStatusLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sensorId" TEXT NOT NULL,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "detail" TEXT,
    CONSTRAINT "SensorStatusLog_sensorId_fkey" FOREIGN KEY ("sensorId") REFERENCES "Sensor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MovementEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "sensorId" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "deviceEventId" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "MovementEvent_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MovementEvent_sensorId_fkey" FOREIGN KEY ("sensorId") REFERENCES "Sensor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Alert" (
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
    CONSTRAINT "Alert_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Alert_sensorId_fkey" FOREIGN KEY ("sensorId") REFERENCES "Sensor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AlertEvidence" (
    "alertId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,

    PRIMARY KEY ("alertId", "eventId"),
    CONSTRAINT "AlertEvidence_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AlertEvidence_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "MovementEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "alertId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "providerMode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationDelivery_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NotificationDelivery_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Guardian_email_key" ON "Guardian"("email");

-- CreateIndex
CREATE INDEX "Guardian_householdId_idx" ON "Guardian"("householdId");

-- CreateIndex
CREATE INDEX "Session_guardianId_idx" ON "Session"("guardianId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CareRecipient_householdId_key" ON "CareRecipient"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "Sensor_tokenHash_key" ON "Sensor"("tokenHash");

-- CreateIndex
CREATE INDEX "Sensor_householdId_zone_idx" ON "Sensor"("householdId", "zone");

-- CreateIndex
CREATE INDEX "SensorStatusLog_sensorId_at_idx" ON "SensorStatusLog"("sensorId", "at");

-- CreateIndex
CREATE INDEX "MovementEvent_householdId_occurredAt_idx" ON "MovementEvent"("householdId", "occurredAt");

-- CreateIndex
CREATE INDEX "MovementEvent_sensorId_occurredAt_idx" ON "MovementEvent"("sensorId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "MovementEvent_sensorId_deviceEventId_key" ON "MovementEvent"("sensorId", "deviceEventId");

-- CreateIndex
CREATE INDEX "Alert_householdId_status_triggeredAt_idx" ON "Alert"("householdId", "status", "triggeredAt");

-- CreateIndex
CREATE INDEX "Alert_householdId_dedupeKey_idx" ON "Alert"("householdId", "dedupeKey");

-- CreateIndex
CREATE INDEX "NotificationDelivery_alertId_idx" ON "NotificationDelivery"("alertId");
