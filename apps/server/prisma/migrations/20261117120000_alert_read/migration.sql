-- CreateTable
CREATE TABLE "AlertRead" (
    "alertId" TEXT NOT NULL,
    "guardianId" TEXT NOT NULL,
    "readAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("alertId", "guardianId"),
    CONSTRAINT "AlertRead_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AlertRead_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AlertRead_guardianId_idx" ON "AlertRead"("guardianId");

-- 이미 종료된 과거 알림은 읽은 것으로 시작한다. (처음 쓸 때 읽지 않은 알림이 한꺼번에 쏟아지지 않게)
-- 아직 진행 중인 알림은 읽지 않은 상태로 남겨 둔다.
INSERT INTO "AlertRead" ("alertId", "guardianId", "readAt")
SELECT a."id", g."id", CURRENT_TIMESTAMP
FROM "Alert" a
JOIN "Guardian" g ON g."householdId" = a."householdId"
WHERE a."status" = 'RESOLVED';
