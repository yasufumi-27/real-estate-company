/* 共通処理：スマートフォン用メニューの開閉 / フッターの年表示 */
(function () {
  var toggle = document.querySelector('.nav-toggle');
  var list = document.querySelector('.gnav ul');
  if (toggle && list) {
    toggle.addEventListener('click', function () {
      var open = list.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
  }
  var year = document.querySelector('[data-year]');
  if (year) year.textContent = String(new Date().getFullYear());
})();
