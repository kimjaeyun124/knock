import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import {
  ButtonSection,
  FormSection,
  NavigationSection,
  OverlaySection,
  StateSection,
  StatusSection,
} from './ComponentSections'
import { ColorSection, SpacingSection, TypographySection } from './TokenSections'

/**
 * 디자인 시스템 미리보기. 토큰과 공통 컴포넌트를 한 화면에서 확인한다.
 * 새 화면을 만들기 전에 여기서 쓸 수 있는 조각을 먼저 찾는다. (문서: docs/DESIGN_SYSTEM.md)
 */
export function DesignPage() {
  return (
    <div className="space-y-10">
      <PageHeader
        title="디자인 시스템"
        description="색·글자·간격 토큰과 공통 컴포넌트의 모든 종류와 상태를 보여 주는 개발용 화면입니다."
        meta={<StatusBadge tone="muted">개발용 미리보기</StatusBadge>}
      />
      <ColorSection />
      <TypographySection />
      <SpacingSection />
      <ButtonSection />
      <StatusSection />
      <FormSection />
      <NavigationSection />
      <OverlaySection />
      <StateSection />
    </div>
  )
}
