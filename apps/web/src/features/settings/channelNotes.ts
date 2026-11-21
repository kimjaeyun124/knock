import type { Channel } from '@tetris/shared'

/** 채널별 설명. 무엇이 되고 무엇이 안 되는지 사실대로 적는다. */
export const CHANNEL_NOTES: Record<Channel, string> = {
  IN_APP: '이 앱 화면이 열려 있을 때만 전달됩니다. 화면을 닫아 두면 받을 수 없습니다.',
  WEB_PUSH:
    '등록한 기기로 보냅니다. 서버에 푸시 키(VAPID)가 설정되어 있어야 하며, 설정이 없으면 "연동되지 않음"입니다. iPhone·iPad는 홈 화면에 추가한 웹앱에서만 받을 수 있습니다.',
  WATCH:
    '아직 만들지 않았습니다. 스마트워치 앱(iPhone·Android)이 필요하며, 이 버전에서는 휴대폰에 알림을 받을 수 있는 앱이 없어 워치로 전달되지 않습니다.',
  SMS: '이 버전에서는 연동하지 않았습니다. (외부 사업자와의 계약이 필요합니다)',
  KAKAO: '이 버전에서는 연동하지 않았습니다. (외부 사업자와의 계약이 필요합니다)',
}
