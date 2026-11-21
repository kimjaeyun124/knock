/** 같은 가구의 보호자 기기들이 함께 받는 방. 센서·알림 데이터 갱신은 이 방으로 보낸다. */
export const householdRoom = (householdId: string): string => `household:${householdId}`
/** 한 로그인 세션의 연결들. 로그아웃·만료 시 이 방의 연결을 끊는다. */
export const sessionRoom = (sessionId: string): string => `session:${sessionId}`
/** 한 보호자의 열려 있는 화면들. 알림 전달은 이 방으로 보낸다. */
export const guardianRoom = (guardianId: string): string => `guardian:${guardianId}`
