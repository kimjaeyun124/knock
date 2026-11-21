/** 조건부 className 을 이어 붙인다. (거짓 값은 건너뛴다) */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}
