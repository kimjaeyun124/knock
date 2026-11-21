// 브라우저 푸시(Web Push)용 VAPID 키 쌍을 만들어 .env 에 붙여 넣을 형식으로 출력한다.
//
//   npm run vapid:generate
//
// 비공개 키(VAPID_PRIVATE_KEY)는 서버 전용 비밀값이다. 저장소에 올리거나 다른 사람에게 보내지 마세요.
// 공개 키는 브라우저에 전달되지만 비밀이 아니다. VAPID_SUBJECT 는 운영자 연락처(mailto: 또는 https://)로 직접 채운다.
import { generateVAPIDKeys } from 'web-push'

const { publicKey, privateKey } = generateVAPIDKeys()
process.stdout.write(
  [
    '# 아래 세 줄을 .env 에 붙여 넣으세요. VAPID_SUBJECT 는 운영자 연락처로 바꿔 주세요.',
    `VAPID_PUBLIC_KEY=${publicKey}`,
    `VAPID_PRIVATE_KEY=${privateKey}`,
    'VAPID_SUBJECT=mailto:운영자-이메일@example.com',
    '',
  ].join('\n'),
)
