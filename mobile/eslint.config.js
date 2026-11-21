// 노크 앱의 lint 설정 (Expo 권장 규칙). 저장소 루트의 lint 는 mobile/ 를 건너뛴다.
const { defineConfig } = require('eslint/config')
const expoConfig = require('eslint-config-expo/flat')

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'ios/*', 'android/*', '.expo/*'],
  },
])
