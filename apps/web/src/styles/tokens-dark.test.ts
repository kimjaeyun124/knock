// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const darkCss = read('./tokens-dark.css')
const lightCss = read('./tokens.css')

/** 어두운 테마가 직접 지정한 16진수 색 */
const dark: Record<string, string> = Object.fromEntries(
  [...darkCss.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{6});/g)].map((m) => [m[1]!, m[2]!]),
)

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(dark[a]!), luminance(dark[b]!)].sort((x, y) => y - x)
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)
}

describe('어두운 테마 토큰', () => {
  it('밝은 테마의 의미 토큰(색)을 빠짐없이 다시 정의한다', () => {
    const lightTokens = [...lightCss.matchAll(/--color-([\w-]+):/g)]
      .map((m) => m[1]!)
      .filter((name) => name !== '*')
    const missing = lightTokens.filter((name) => !(name in dark) && name !== 'overlay')
    expect(missing).toEqual([])
    expect(darkCss).toContain('--color-overlay')
  })

  it('<html data-theme="dark"> 에서만 적용되고 color-scheme 을 알린다', () => {
    expect(darkCss).toMatch(/:root\[data-theme='dark'\]\s*{/)
    expect(darkCss).toContain('color-scheme: dark')
  })

  it('그라데이션·유리 효과를 쓰지 않는다', () => {
    expect(darkCss).not.toMatch(/gradient|backdrop-filter|blur\(/i)
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
      ['status-ok-strong', 'status-ok-soft'],
      ['status-warn-strong', 'status-warn-soft'],
      ['status-danger-strong', 'status-danger-soft'],
      ['status-muted-strong', 'status-muted-soft'],
      ['status-ok', 'surface'],
      ['status-warn', 'surface'],
      ['status-danger', 'surface'],
      ['status-danger', 'canvas'],
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

  describe('조작 요소 테두리·아이콘 대비 (비텍스트 3:1)', () => {
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
})
