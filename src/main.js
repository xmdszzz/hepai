/* 启动 */
(function () {
  'use strict';
  function boot() {
    if (!window.Game || !window.UI) {
      console.error('模块未加载完整');
      return;
    }
    window.UI.init();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
