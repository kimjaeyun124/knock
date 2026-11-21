// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const tokensCss = read('./tokens.css')
const indexCss = read('./index.css')

/** `--name: value;` 를 찾아 var() 참조를 끝까지 풀어 최종 값을 돌려준다. */
function resolve(name: string): string {
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(tokensCss)
  if (!match?.[1]) throw new Error(`디자인 토큰 ${name} 을(를) 찾을 수 없습니다.`)
  const value = match[1].replace(/\/\*.*?\*\//g, '').trim()
  const reference = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value)
  return reference?.[1] ? resolve(reference[1]) : value
}

const token = (name: string) => resolve(`--color-${name}`)

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(token(a)), luminance(token(b))].sort((x, y) => y - x)
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05)
}

describe('기본 팔레트', () => {
  it.each([
    ['canvas', '#f5f4fa'], // Background (맑은 라벤더빛)
    ['surface', '#ffffff'], // Surface
    ['brand', '#4f46e5'], // Primary (인디고)
    ['brand-strong', '#3730a3'], // Primary Hover
    ['ink', '#1c1b2e'], // Text Primary
    ['ink-muted', '#5a5772'], // Text Secondary
    ['line', '#e7e5f1'], // Border
    ['status-ok', '#1b7f43'], // Success
    ['status-warn', '#a8550a'], // Warning
    ['status-danger', '#c62828'], // Danger
    ['accent', '#ffc24a'], // 노크 노랑 (장식 전용)
  ])('%s 는 %s 이다', (name, hex) => {
    expect(token(name)).toBe(hex)
  })
})

describe('글자 대비 (WCAG AA 4.5:1)', () => {
  const pairs: [string, string][] = [
    ['ink', 'canvas'],
    ['ink', 'surface'],
    ['ink-muted', 'canvas'],
    ['ink-muted', 'surface'],
    ['ink-muted', 'brand-soft'],
    ['ink-muted', 'status-muted-soft'],
    ['brand', 'surface'],
    ['brand', 'canvas'],
    ['brand-strong', 'brand-soft'],
    ['brand-strong', 'surface'],
    ['ink-inverse', 'brand'],
    ['ink-inverse', 'brand-strong'],
    ['ink-inverse', 'ink'],
    ['ink-inverse', 'status-ok'],
    ['ink-inverse', 'status-warn'],
    ['ink-inverse', 'status-danger'],
    ['ink-inverse', 'status-danger-strong'],
    // 상태 배지: 옅은 바탕 위의 -strong 글자
    ['status-ok-strong', 'status-ok-soft'],
    ['status-warn-strong', 'status-warn-soft'],
    ['status-danger-strong', 'status-danger-soft'],
    ['status-muted-strong', 'status-muted-soft'],
    // 흰 카드·바탕 위의 상태 글자(오류 문구 등)
    ['status-ok', 'surface'],
    ['status-warn', 'surface'],
    ['status-danger', 'surface'],
    ['status-danger', 'canvas'],
    // 안내 상자: 상태 바탕 위의 기본 글자
    ['ink', 'status-ok-soft'],
    ['ink', 'status-warn-soft'],
    ['ink', 'status-danger-soft'],
    ['ink', 'status-muted-soft'],
    ['ink', 'brand-soft'],
  ]
  it.each(pairs)('%s 글자 / %s 배경', (fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('조작 요소 테두리·아이콘 대비 (WCAG 비텍스트 3:1)', () => {
  const pairs: [string, string][] = [
    ['line-strong', 'surface'],
    ['line-strong', 'canvas'],
    ['brand', 'surface'],
    ['focus', 'surface'],
    ['focus', 'canvas'],
    ['status-ok', 'status-ok-soft'],
    ['status-warn', 'status-warn-soft'],
    ['status-danger', 'surface'],
    ['status-danger', 'status-danger-soft'],
  ]
  it.each(pairs)('%s / %s', (fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(3)
  })
})

describe('규칙', () => {
  it('그라데이션과 유리 효과를 쓰지 않는다', () => {
    expect(tokensCss + indexCss).not.toMatch(/gradient|backdrop-filter|blur\(/i)
  })

  it('간격은 4px 단위, 기준 글자는 16px 이다', () => {
    expect(resolve('--spacing')).toBe('0.25rem')
    expect(indexCss).toMatch(/html\s*{[^}]*font-size:\s*100%/)
    expect(resolve('--text-body')).toBe('1rem')
  })

  it('요구된 글자 단계가 모두 정의되어 있다', () => {
    for (const step of [
      'display',
      'h1',
      'h2',
      'h3',
      'body-lg',
      'body',
      'body-sm',
      'label',
      'caption',
      'numeric',
    ]) {
      expect(resolve(`--text-${step}`), step).toMatch(/rem$/)
    }
  })

  it('컴포넌트가 색 값을 직접 쓰지 않는다 (의미 토큰만 쓴다)', () => {
    const dir = new URL('../components/ui/', import.meta.url)
    const sources = readdirSync(dir).filter(
      (file) => /\.tsx?$/.test(file) && !file.includes('.test.'),
    )
    expect(sources.length).toBeGreaterThan(10)
    for (const file of sources) {
      const code = readFileSync(new URL(file, dir), 'utf8')
      expect(code, `${file}: 16진수 색`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(code, `${file}: rgb()/hsl() 색`).not.toMatch(/\b(rgb|hsl)a?\(/)
      expect(code, `${file}: 임의 값 색`).not.toMatch(/(bg|text|border|fill|stroke)-\[/)
      expect(code, `${file}: Tailwind 기본 팔레트`).not.toMatch(
        /\b(bg|text|border|fill)-(red|green|blue|amber|slate|gray|yellow|orange|emerald)-\d/,
      )
    }
  })
  it('옅은 바탕 위의 글자는 대비가 충분한 색을 쓴다 (-strong 상태색, 기본 글자색)', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) walk(path)
        else if (/\.tsx$/.test(entry.name) && !entry.name.includes('.test.')) {
          readFileSync(path, 'utf8')
            .split('\n')
            .forEach((line, index) => {
              // 보조 글자색(ink-muted)과 강조 바탕(brand-soft)의 대비는 위 표에서 두 테마 모두 따로 검사한다.
              if (
                /bg-status-(ok|warn|danger|muted)-soft/.test(line) &&
                /text-status-(ok|warn|danger|muted)(?![\w-])/.test(line)
              ) {
                offenders.push(`${path.replace(root, '')}:${index + 1}`)
              }
            })
        }
      }
    }
    walk(root)
    expect(offenders).toEqual([])
  })
})
