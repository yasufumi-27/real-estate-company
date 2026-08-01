/* ============================================================
   物件PDFアップロード機能（デモ）
   GitHub Pages は静的ホスティングのためサーバーを持ちません。
   アップロードしたPDFはブラウザ内の IndexedDB に保存され、
   同じ端末・同じブラウザからのみ閲覧できます。
   ============================================================ */
(function (global) {
  'use strict';

  var DB_NAME = 'minato-realestate';
  var DB_VERSION = 1;
  var STORE = 'properties';
  var MAX_SIZE = 10 * 1024 * 1024; // 10MB

  /* ---------- IndexedDB ---------- */
  function openDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('category', 'category', { unique: false });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function tx(mode, fn) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode);
        var result = fn(t.objectStore(STORE));
        t.oncomplete = function () { db.close(); resolve(result && result.result !== undefined ? result.result : result); };
        t.onerror = function () { db.close(); reject(t.error); };
      });
    });
  }

  function listByCategory(category) {
    return tx('readonly', function (store) { return store.getAll(); }).then(function (rows) {
      return (rows || [])
        .filter(function (r) { return r.category === category; })
        .sort(function (a, b) { return b.createdAt - a.createdAt; });
    });
  }

  function put(record) { return tx('readwrite', function (store) { return store.put(record); }); }
  function remove(id) { return tx('readwrite', function (store) { return store.delete(id); }); }

  /* ---------- Utils ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }
  function uid() { return 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }

  /* ---------- カード描画 ---------- */
  function cardHTML(item) {
    var rows = [
      ['所在地', item.area],
      ['間取り', item.layout],
      ['面積', item.size],
      ['交通', item.access]
    ].filter(function (r) { return r[1]; })
      .map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('');

    var isSample = item.sample === true;
    var foot = isSample
      ? '<span class="pcard__file">' + esc(item.fileLabel || 'サンプル資料.pdf') + '</span>' +
        '<a class="btn btn--sm btn--ghost" href="' + esc(item.pdfPath) + '" target="_blank" rel="noopener">PDFを見る</a>'
      : '<span class="pcard__file">' + esc(item.fileName) + ' / ' + formatSize(item.fileSize) + '</span>' +
        '<span style="display:flex;gap:8px">' +
        '<button class="btn btn--sm btn--ghost" type="button" data-open="' + esc(item.id) + '">PDFを見る</button>' +
        '<button class="btn btn--sm btn--danger" type="button" data-del="' + esc(item.id) + '">削除</button>' +
        '</span>';

    return '' +
      '<article class="pcard">' +
      '<div class="pcard__top">' +
      '<span class="pcard__tag' + (isSample ? '' : ' pcard__tag--user') + '">' + (isSample ? '掲載中' : 'アップロード済み') + '</span>' +
      '<h3>' + esc(item.title) + '</h3>' +
      '<p class="pcard__price">' + esc(item.price || '価格応談') + '</p>' +
      (rows ? '<dl>' + rows + '</dl>' : '') +
      (item.note ? '<p class="pcard__note">' + esc(item.note) + '</p>' : '') +
      '</div>' +
      '<div class="pcard__foot">' + foot + '</div>' +
      '</article>';
  }

  /* ---------- 初期化 ---------- */
  function init(options) {
    var category = options.category;
    var samples = options.samples || [];
    var listEl = document.querySelector(options.listSelector);
    var form = document.querySelector(options.formSelector);
    var msgEl = form ? form.querySelector('[data-msg]') : null;
    var fileInput = form ? form.querySelector('input[type="file"]') : null;
    var dropzone = form ? form.querySelector('.dropzone') : null;
    var dropLabel = dropzone ? dropzone.querySelector('[data-drop-label]') : null;
    var keywordEl = document.querySelector(options.keywordSelector);
    var uploads = [];

    function message(text, ok) {
      if (!msgEl) return;
      msgEl.textContent = text;
      msgEl.className = 'msg ' + (ok ? 'msg--ok' : 'msg--ng');
    }

    function render() {
      var keyword = keywordEl ? keywordEl.value.trim() : '';
      var items = uploads.concat(samples);
      if (keyword) {
        var lower = keyword.toLowerCase();
        items = items.filter(function (i) {
          return [i.title, i.area, i.access, i.note, i.price, i.layout]
            .filter(Boolean).join(' ').toLowerCase().indexOf(lower) !== -1;
        });
      }
      if (!items.length) {
        listEl.innerHTML = '<div class="empty">該当する物件がありません。条件を変えてお試しください。</div>';
        return;
      }
      listEl.innerHTML = items.map(cardHTML).join('');
    }

    function reload() {
      return listByCategory(category).then(function (rows) {
        uploads = rows;
        render();
      }).catch(function (err) {
        console.error(err);
        listEl.innerHTML = '<div class="empty">保存済みデータの読み込みに失敗しました。</div>';
      });
    }

    /* ファイル選択・ドラッグ&ドロップ */
    if (dropzone && fileInput) {
      dropzone.addEventListener('click', function () { fileInput.click(); });
      dropzone.addEventListener('dragover', function (e) {
        e.preventDefault();
        dropzone.classList.add('is-drag');
      });
      dropzone.addEventListener('dragleave', function () { dropzone.classList.remove('is-drag'); });
      dropzone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropzone.classList.remove('is-drag');
        if (e.dataTransfer.files && e.dataTransfer.files.length) {
          fileInput.files = e.dataTransfer.files;
          updateDropLabel();
        }
      });
      fileInput.addEventListener('change', updateDropLabel);
    }

    function updateDropLabel() {
      if (!dropLabel) return;
      var file = fileInput.files && fileInput.files[0];
      dropLabel.innerHTML = file
        ? '<b>' + esc(file.name) + '</b>（' + formatSize(file.size) + '）を選択中'
        : 'PDFをドラッグ＆ドロップ、または<b>クリックして選択</b>';
    }

    /* 登録 */
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var file = fileInput.files && fileInput.files[0];
        var data = new FormData(form);
        var title = String(data.get('title') || '').trim();

        if (!title) { message('物件名を入力してください。', false); return; }
        if (!file) { message('PDFファイルを選択してください。', false); return; }
        if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
          message('PDF形式のファイルのみアップロードできます。', false); return;
        }
        if (file.size > MAX_SIZE) {
          message('ファイルサイズは10MBまでです（選択：' + formatSize(file.size) + '）。', false); return;
        }

        put({
          id: uid(),
          category: category,
          title: title,
          area: String(data.get('area') || '').trim(),
          price: String(data.get('price') || '').trim(),
          layout: String(data.get('layout') || '').trim(),
          size: String(data.get('size') || '').trim(),
          access: String(data.get('access') || '').trim(),
          note: String(data.get('note') || '').trim(),
          fileName: file.name,
          fileSize: file.size,
          blob: file,
          createdAt: Date.now()
        }).then(function () {
          form.reset();
          updateDropLabel();
          message('物件情報を登録しました。一覧に追加されています。', true);
          return reload();
        }).catch(function (err) {
          console.error(err);
          message('保存に失敗しました。ブラウザの空き容量をご確認ください。', false);
        });
      });
    }

    /* 一覧の操作（PDF表示・削除） */
    listEl.addEventListener('click', function (e) {
      var openBtn = e.target.closest('[data-open]');
      var delBtn = e.target.closest('[data-del]');

      if (openBtn) {
        var target = uploads.filter(function (u) { return u.id === openBtn.getAttribute('data-open'); })[0];
        if (!target) return;
        var url = URL.createObjectURL(target.blob);
        window.open(url, '_blank', 'noopener');
        setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      }

      if (delBtn) {
        var id = delBtn.getAttribute('data-del');
        if (!window.confirm('この物件情報を削除します。よろしいですか？')) return;
        remove(id).then(reload).then(function () { message('物件情報を削除しました。', true); });
      }
    });

    if (keywordEl) keywordEl.addEventListener('input', render);

    updateDropLabel();
    reload();
  }

  global.PropertyBoard = { init: init };
})(window);
