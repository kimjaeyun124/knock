-- 설정 페이지: 모니터링 사용 여부·요일 일정, 센서별 민감도, 배터리 알림 분리

ALTER TABLE "DetectionSettings" ADD COLUMN "monitoringEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "DetectionSettings" ADD COLUMN "activeWeekdays" INTEGER NOT NULL DEFAULT 127;

ALTER TABLE "AlertPreferences" ADD COLUMN "lowBattery" BOOLEAN NOT NULL DEFAULT true;
-- 지금까지 "센서 이상" 하나로 배터리 알림까지 껐던 가구는 배터리 알림도 끈 상태를 유지한다.
UPDATE "AlertPreferences" SET "lowBattery" = "sensorIssues";

ALTER TABLE "Sensor" ADD COLUMN "sensitivity" TEXT;
