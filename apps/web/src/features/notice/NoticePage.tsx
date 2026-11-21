import { Link } from 'react-router'
import { SERVICE_NAME } from '@/app/paths'
import { Mark } from '@/components/layout/Logo'
import { ServiceLimits } from '@/components/common/ServiceLimits'
import { Card } from '@/components/ui/Card'

/**
 * 서비스 안내와 한계. 로그인하지 않아도 볼 수 있다.
 * 이 서비스가 믿을 만한 도구인지 판단하는 데 필요한 내용을 사실대로 적는다. (문구는 docs/COPY_GUIDE.md 기준)
 */
export function NoticePage() {
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
      <div>
        <p className="flex items-center gap-2 text-h3 font-extrabold tracking-tight">
          <Mark />
          {SERVICE_NAME}
        </p>
        <h1 className="text-2xl font-bold">서비스 안내와 한계</h1>
      </div>

      <Card title="이 서비스가 하는 일">
        <p>
          침대 옆·이동 경로·현관에 둔 움직임 센서의 신호를 모아, 야간 시간대에 정해 둔 규칙으로
          살펴보고 확인이 필요해 보일 때 보호자에게 알립니다. 센서 연결, 배터리, 알림 전달 상태도
          숨기지 않고 화면에 보여 줍니다.
        </p>
      </Card>

      <Card title="하지 못하는 일">
        <ServiceLimits />
      </Card>

      <Card title="알림은 이렇게 전달됩니다">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <span className="font-semibold">앱 화면 알림</span>: 이 화면이 열려 있을 때만
            전달됩니다.
          </li>
          <li>
            <span className="font-semibold">브라우저 푸시</span>: 서버 관리자가 푸시 키를 설정하고
            보호자가 기기를 등록한 경우에만 전달됩니다. 설정되어 있지 않으면 "연동되지 않음"으로
            표시됩니다.
          </li>
          <li>
            <span className="font-semibold">문자·카카오 알림톡</span>: 이 버전에서는 연동하지
            않았습니다.
          </li>
          <li>
            전달에 실패하면 최대 3번까지 다시 시도하고, 그래도 아무에게도 전달하지 못하면 "알림을
            전달하지 못했습니다" 알림을 남기며 화면 상단에도 표시합니다.
          </li>
        </ul>
      </Card>

      <Card title="화면의 상태 표시를 읽는 방법">
        <dl className="space-y-2">
          <div>
            <dt className="font-semibold">모니터링 중</dt>
            <dd className="text-ink-muted">
              사용 중인 센서가 모두 연결되어 있고 열린 알림이 없습니다. 어르신의 상태가 괜찮다는
              뜻은 아닙니다.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">확인 필요 · 즉시 확인 권장</dt>
            <dd className="text-ink-muted">
              센서가 움직임을 감지했습니다. 상황을 직접 확인해 주세요. 신호 하나로 무슨 일이
              있었는지 알 수는 없습니다.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">모니터링 불완전</dt>
            <dd className="text-ink-muted">
              센서가 없거나, 연결이 끊겼거나, 첫 신호를 기다리거나, 배터리가 부족하거나, 알림 전달에
              실패했습니다. 이때는 움직임을 놓칠 수 있습니다.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">상태 확인 불가</dt>
            <dd className="text-ink-muted">
              서버나 센서 정보를 불러오지 못해 지금 상태를 알 수 없습니다.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">연결 정상</dt>
            <dd className="text-ink-muted">
              서버와 실시간 연결이 살아 있다는 뜻이며, 어르신의 상태와는 관계가 없습니다.
            </dd>
          </div>
        </dl>
      </Card>

      <Card title="수집하는 정보">
        <ul className="list-disc space-y-2 pl-5">
          <li>센서의 움직임 신호(발생 시각과 구역), 센서의 연결 상태와 배터리 값</li>
          <li>
            보호자 계정(이메일, 표시 이름)과 돌봄 대상의 호칭. 실명 대신 "어르신" 같은 호칭만
            저장합니다.
          </li>
          <li>센서 모니터링에서는 카메라·마이크·위치 정보를 수집하지 않습니다.</li>
          <li>
            시연 서버에서만 열리는 "웹캠 움직임 감지" 화면은 움직임 판단을 브라우저 안에서 합니다.
            "영상 함께 보내기"를 켜 두면(기본 켜짐) 알림이 새로 만들어진 순간부터 약 4초의 영상만
            서버에 저장해 로그인한 보호자가 알림 상세에서 볼 수 있게 하고, 7일 뒤 자동으로 지웁니다.
            알림이 되지 않은 움직임의 영상은 저장하지 않으며, 소리는 녹음하지 않습니다. 운영
            서버에서는 이 화면이 열리지 않습니다.
          </li>
          <li>움직임 기록은 설정한 기간(기본 90일)이 지나면 자동으로 삭제됩니다.</li>
          <li>
            "시뮬레이션"이라고 표시된 데이터는 개발·시연용 가상 데이터이며 실제 상황이 아닙니다.
          </li>
        </ul>
      </Card>

      <p className="flex flex-wrap gap-4">
        <Link
          to="/"
          className="inline-flex min-h-12 items-center font-semibold text-brand-strong underline"
        >
          앱으로 돌아가기
        </Link>
        <Link
          to="/login"
          className="inline-flex min-h-12 items-center font-semibold text-brand-strong underline"
        >
          로그인
        </Link>
      </p>
    </main>
  )
}
