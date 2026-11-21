import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// 클라이언트로 번들되는 코드(web, shared)에서 process.env를 쓰면
// 서버 비밀값이 번들에 섞일 위험이 있으므로 금지한다.
const noProcessEnv = {
  'no-restricted-globals': [
    'error',
    {
      name: 'process',
      message:
        '웹/공유 코드에서는 process를 사용하지 않습니다. 브라우저에 공개할 값은 VITE_ 접두사 환경변수(lib/env.ts)로만 읽습니다.',
    },
  ],
}

export default defineConfig([
  // apps/web/public 은 빌드 없이 그대로 배포되는 정적 파일(서비스 워커)이다. 브라우저 전용 전역(self)을 쓰며 테스트가 직접 실행해 검증한다.
  globalIgnores([
    '**/dist/**',
    '**/coverage/**',
    '**/node_modules/**',
    '**/generated/**',
    'apps/web/public/**',
    // Playwright 가 만드는 리포트·결과물
    '**/playwright-report/**',
    '**/test-results/**',
    // 휴대폰 앱(Expo)은 자체 lint 설정(npx expo lint)을 쓴다.
    'mobile/**',
  ]),

  // JS 설정 파일 (스크립트, 설정)
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },

  // TypeScript 공통 (타입 정보 기반 검사)
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': 'error',
    },
  },

  // 서버
  {
    files: ['apps/server/**/*.ts'],
    languageOptions: { globals: globals.node },
  },

  // 웹
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
    rules: noProcessEnv,
  },

  // 웹 설정 파일 (Node에서 실행)
  {
    files: ['apps/web/*.ts'],
    languageOptions: { globals: globals.node },
  },

  // 공유 패키지의 스키마는 설정이 적용된 z(src/zod.ts)로만 만든다. (브라우저의 CSP 위반 방지, 이유는 zod.ts 참고)
  {
    files: ['packages/shared/src/**/*.ts'],
    ignores: ['packages/shared/src/zod.ts', 'packages/shared/src/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'zod',
              message:
                "스키마는 './zod' 에서 z 를 가져와 만드세요. (브라우저에서 eval 을 쓰지 않도록 설정되어 있습니다)",
            },
          ],
        },
      ],
    },
  },

  // 공유 패키지 (서버·웹 양쪽에서 쓰이므로 환경 비의존)
  {
    files: ['packages/shared/src/**/*.ts'],
    rules: noProcessEnv,
  },

  // 테스트 파일·도우미: 모킹과 헬퍼 모듈 때문에 일부 규칙 완화
  {
    files: ['**/*.test.{ts,tsx}', 'apps/web/src/test/**'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
])
