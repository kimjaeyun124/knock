import { Link } from 'react-router'
import { Card } from '@/components/ui/Card'
import { buttonStyles } from '@/components/ui/buttonStyles'

export function NotFoundPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-h1">페이지를 찾을 수 없습니다</h1>
      <Card>
        <p className="text-ink-muted">주소가 바뀌었거나 없는 페이지입니다.</p>
        <Link to="/" className={`mt-4 ${buttonStyles()}`}>
          홈으로 돌아가기
        </Link>
      </Card>
    </div>
  )
}
