-- 센서 상태 모니터링: heartbeat 시각, 센서별 연결 끊김 기준, 데이터 수신 오류 기록
ALTER TABLE "Sensor" ADD COLUMN "lastHeartbeatAt" DATETIME;
ALTER TABLE "Sensor" ADD COLUMN "offlineAfterSeconds" INTEGER;
ALTER TABLE "Sensor" ADD COLUMN "receiveErrorCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Sensor" ADD COLUMN "lastReceiveErrorAt" DATETIME;
ALTER TABLE "Sensor" ADD COLUMN "lastReceiveError" TEXT;
-- 지금까지는 신호(움직임·heartbeat)를 구분해 저장하지 않았다. 마지막 신호 시각을 마지막 heartbeat 의 하한으로 채우지 않는다. (알 수 없으면 비워 둔다)
