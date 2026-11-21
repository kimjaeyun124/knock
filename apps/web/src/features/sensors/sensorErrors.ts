import { ApiError } from '@/services/apiClient'

/** 오류를 "무엇이 문제인지"와 "어떻게 하면 되는지"로 나눠 보여 주기 위한 형태 */
export interface SensorErrorInfo {
  cause: string
  solution: string
}

/**
 * 센서 관련 요청이 실패했을 때, 서버 메시지를 그대로 던지지 않고 원인과 해결 방법을 함께 알린다.
 * 서버가 구체적인 문장을 준 경우(예: 센서 수 제한)에는 그 문장을 원인으로 쓴다.
 */
export function describeSensorError(error: unknown): SensorErrorInfo {
  if (error instanceof ApiError) {
    if (error.kind === 'network') {
      return {
        cause: '서버에 연결할 수 없습니다.',
        solution:
          '인터넷 연결을 확인한 뒤 다시 시도해 주세요. 계속되면 서버가 켜져 있는지 확인해 주세요.',
      }
    }
    switch (error.status) {
      case 400:
      case 422:
        return {
          cause: error.message,
          solution: '입력한 값을 확인해 주세요. 센서 이름은 1~50자입니다.',
        }
      case 401:
        return {
          cause: '로그인이 만료되었습니다.',
          solution: '다시 로그인한 뒤 같은 작업을 해 주세요.',
        }
      case 404:
        return {
          cause: '센서를 찾을 수 없습니다. 이미 삭제되었거나 다른 기기에서 지웠을 수 있습니다.',
          solution: '센서 목록으로 돌아가 현재 등록된 센서를 확인해 주세요.',
        }
      case 409:
        return {
          cause: error.message,
          solution: '사용하지 않는 센서를 연결 해제한 뒤 다시 시도해 주세요.',
        }
      case 429:
        return {
          cause: '짧은 시간에 요청이 너무 많았습니다.',
          solution: '잠시 기다린 뒤 다시 시도해 주세요.',
        }
      default:
        if (error.status !== null && error.status >= 500) {
          return {
            cause: '서버에 문제가 생겨 요청을 처리하지 못했습니다.',
            solution: '잠시 후 다시 시도해 주세요. 계속되면 문의할 때 요청 번호를 알려 주세요.',
          }
        }
    }
    return { cause: error.message, solution: '잠시 후 다시 시도해 주세요.' }
  }
  return {
    cause: error instanceof Error ? error.message : '알 수 없는 오류가 생겼습니다.',
    solution: '잠시 후 다시 시도해 주세요.',
  }
}
