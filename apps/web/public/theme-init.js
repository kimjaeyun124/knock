// 첫 화면이 그려지기 전에 저장된 테마·글자 크기를 적용해, 어두운 테마에서 화면이 번쩍이는 것을 막는다.
// (인라인 스크립트는 CSP 로 막혀 있어 별도 파일로 둔다. 저장 키는 src/lib/devicePrefs.ts 와 같다.)
;(function () {
  try {
    var root = document.documentElement
    var theme = localStorage.getItem('tetris.theme')
    var dark =
      theme === 'dark' ||
      (theme !== 'light' &&
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches)
    root.dataset.theme = dark ? 'dark' : 'light'
    var size = localStorage.getItem('tetris.textSize')
    root.dataset.textSize = size === 'large' || size === 'xlarge' ? size : 'normal'
  } catch (e) {
    // 저장소를 읽을 수 없으면 기본(밝은 테마·보통 글자)으로 둔다.
  }
})()
