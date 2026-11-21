-- 움직임 신호의 분류(eventClass): 판단 엔진이 받을 때 정해 저장한다.
-- 기존 기록은 지금까지 타임라인이 보여 주던 유형과 같게 채운다:
--   현관 신호 → ENTRANCE_ACTIVITY, 침대 주변 규칙(침대 주변 움직임·침대→이동 경로)의 근거였던 신호 → BED_EXIT_CANDIDATE, 나머지 → MOTION_DETECTED

ALTER TABLE "MovementEvent" ADD COLUMN "eventClass" TEXT NOT NULL DEFAULT 'MOTION_DETECTED';

UPDATE "MovementEvent" SET "eventClass" = 'ENTRANCE_ACTIVITY' WHERE "zone" = 'ENTRANCE';

UPDATE "MovementEvent" SET "eventClass" = 'BED_EXIT_CANDIDATE'
WHERE "zone" <> 'ENTRANCE'
  AND "id" IN (
    SELECT e."eventId" FROM "AlertEvidence" e
    JOIN "Alert" a ON a."id" = e."alertId"
    WHERE a."type" IN ('BED_AREA_ACTIVITY', 'BED_TO_PATH')
  );

CREATE INDEX "MovementEvent_householdId_eventClass_occurredAt_idx" ON "MovementEvent"("householdId", "eventClass", "occurredAt");
