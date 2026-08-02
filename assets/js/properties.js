/* ============================================================
   物件データの共通処理
   - 保存先：ブラウザ内の IndexedDB（GitHub Pages は静的公開のためサーバーを持ちません）
   - 公開ページ（借りたい／買いたい）の一覧表示
   - 担当者用ページ（admin.html）からも同じデータを読み書きします
   ============================================================ */
(function (global) {
  'use strict';

  var DB_NAME = 'minato-realestate';
  var DB_VERSION = 2;
  var STORE = 'properties';
  var META = 'meta';
  var MAX_SIZE = 10 * 1024 * 1024; // 10MB

  /* ---------- 初期データ（はじめて開いたときに登録される見本の物件） ---------- */
  var SEED = [
    { category: 'rent', title: 'みなとレジデンス 302号室', price: '8.5万円', area: '横浜市中区みなと町2-4',
      access: 'みなと駅 徒歩7分', layout: '1LDK', size: '42.50㎡',
      note: '南向き／オートロック／宅配ボックス／2階以上',
      pdfKind: 'path', pdfPath: 'assets/pdf/rent-sample-1.pdf', fileName: 'minato-residence-302.pdf' },
    { category: 'rent', title: 'グリーンコート山手 105号室', price: '6.2万円', area: '横浜市中区山手町5-11',
      access: '山手駅 徒歩10分', layout: '1K', size: '25.80㎡',
      note: '独立洗面台／インターネット無料／即入居可',
      pdfKind: 'path', pdfPath: 'assets/pdf/rent-sample-2.pdf', fileName: 'greencourt-yamate-105.pdf' },
    { category: 'rent', title: '本町テラスハウス B棟', price: '13.8万円', area: '横浜市中区本町7-2',
      access: '本町駅 徒歩5分', layout: '3LDK', size: '78.20㎡',
      note: '駐車場1台込み／ペット相談可／角部屋',
      pdfKind: 'path', pdfPath: 'assets/pdf/rent-sample-3.pdf', fileName: 'honcho-terrace-b.pdf' },
    { category: 'buy', title: 'みなと町 中古戸建', price: '3,480万円', area: '横浜市中区みなと町4-8',
      access: 'みなと駅 徒歩9分', layout: '4LDK', size: '土地120.40㎡／建物98.60㎡',
      note: '築15年／駐車2台／2025年内外装リフォーム済',
      pdfKind: 'path', pdfPath: 'assets/pdf/buy-sample-1.pdf', fileName: 'minato-house.pdf' },
    { category: 'buy', title: 'パークマンション山手 8階', price: '4,180万円', area: '横浜市中区山手町3-1',
      access: '山手駅 徒歩6分', layout: '3LDK', size: '専有71.35㎡',
      note: '南東角部屋／眺望良好／管理費12,000円',
      pdfKind: 'path', pdfPath: 'assets/pdf/buy-sample-2.pdf', fileName: 'park-mansion-yamate.pdf' },
    { category: 'buy', title: '本町 売地（建築条件なし）', price: '2,650万円', area: '横浜市中区本町6-14',
      access: '本町駅 徒歩12分', layout: '—', size: '土地145.20㎡',
      note: '第一種住居地域／建ぺい率60%・容積率200%／整形地',
      pdfKind: 'path', pdfPath: 'assets/pdf/buy-sample-3.pdf', fileName: 'honcho-land.pdf' }
  ];

  /* ---------- IndexedDB ---------- */
  function openDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' });
        // v1 のデータ形式（pdfKind なし）を v2 に合わせる
        if (e.oldVersion === 1) {
          var store = req.transaction.objectStore(STORE);
          store.openCursor().onsuccess = function (ev) {
            var cur = ev.target.result;
            if (!cur) return;
            var v = cur.value;
            if (!v.pdfKind) { v.pdfKind = 'file'; cur.update(v); }
            cur.continue();
          };
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function run(stores, mode, fn) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(stores, mode);
        var out;
        Promise.resolve(fn(t)).then(function (v) { out = v; });
        t.oncomplete = function () { db.close(); resolve(out); };
        t.onerror = function () { db.close(); reject(t.error); };
        t.onabort = function () { db.close(); reject(t.error); };
      });
    });
  }

  function getAllRaw() {
    return run([STORE], 'readonly', function (t) {
      return new Promise(function (res) {
        var r = t.objectStore(STORE).getAll();
        r.onsuccess = function () { res(r.result || []); };
      });
    });
  }

  /* 初回のみ見本データを登録する */
  function ensureSeed() {
    return run([STORE, META], 'readwrite', function (t) {
      return new Promise(function (res) {
        var metaReq = t.objectStore(META).get('seeded');
        metaReq.onsuccess = function () {
          if (metaReq.result) { res(false); return; }
          var countReq = t.objectStore(STORE).count();
          countReq.onsuccess = function () {
            var store = t.objectStore(STORE);
            if (countReq.result === 0) {
              SEED.forEach(function (s, i) {
                var rec = Object.assign({}, s);
                rec.id = 'seed-' + i;
                rec.order = i;
                rec.createdAt = Date.now();
                rec.updatedAt = Date.now();
                store.put(rec);
              });
            }
            t.objectStore(META).put({ key: 'seeded', value: true });
            res(true);
          };
        };
      });
    });
  }

  function list(category) {
    return ensureSeed().then(getAllRaw).then(function (rows) {
      return rows
        .filter(function (r) { return !category || r.category === category; })
        .sort(function (a, b) { return (a.order || 0) - (b.order || 0) || a.createdAt - b.createdAt; });
    });
  }

  function get(id) {
    return run([STORE], 'readonly', function (t) {
      return new Promise(function (res) {
        var r = t.objectStore(STORE).get(id);
        r.onsuccess = function () { res(r.result); };
      });
    });
  }

  function save(record) {
    return run([STORE], 'readwrite', function (t) { t.objectStore(STORE).put(record); });
  }

  function remove(id) {
    return run([STORE], 'readwrite', function (t) { t.objectStore(STORE).delete(id); });
  }

  function replaceAll(records) {
    return run([STORE, META], 'readwrite', function (t) {
      var store = t.objectStore(STORE);
      store.clear();
      records.forEach(function (r) { store.put(r); });
      t.objectStore(META).put({ key: 'seeded', value: true });
    });
  }

  /* ---------- 共通ユーティリティ ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function formatSize(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  function uid() { return 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }

  /* 書き出しファイルの中のPDF（文字列）を、表示できる形にもどす */
  function dataUrlToBlob(dataUrl) {
    var parts = String(dataUrl).split(',');
    var mime = (parts[0].match(/:(.*?);/) || [])[1] || 'application/pdf';
    var bin = atob(parts[1]);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  /* 公開中の物件データ（data/properties.json）を読む */
  function loadPublished() {
    return fetch('data/properties.json', { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error('not found');
      return res.json();
    }).then(function (data) {
      if (!data || data.format !== 'minato-bukken' || !Array.isArray(data.items)) throw new Error('invalid');
      return data.items.map(function (item) {
        var rec = Object.assign({}, item);
        if (rec.pdfData) {
          try { rec.blob = dataUrlToBlob(rec.pdfData); rec.pdfKind = 'file'; } catch (e) { /* PDFなし扱い */ }
          delete rec.pdfData;
        }
        return rec;
      });
    });
  }

  /* PDFを新しいタブで開く */
  function openPdf(item) {
    if (item.pdfKind === 'path' && item.pdfPath) {
      window.open(item.pdfPath, '_blank', 'noopener');
      return;
    }
    if (item.blob) {
      var url = URL.createObjectURL(item.blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      return;
    }
    window.alert('この物件にはPDFが登録されていません。');
  }

  function matches(item, keyword) {
    if (!keyword) return true;
    var lower = keyword.toLowerCase();
    return [item.title, item.area, item.access, item.note, item.price, item.layout, item.size]
      .filter(Boolean).join(' ').toLowerCase().indexOf(lower) !== -1;
  }

  /* ---------- 公開ページ（借りたい／買いたい）の一覧 ---------- */
  function initPublic(options) {
    var listEl = document.querySelector(options.listSelector);
    var keywordEl = options.keywordSelector ? document.querySelector(options.keywordSelector) : null;
    var items = [];

    function cardHTML(item) {
      var rows = [['所在地', item.area], ['間取り', item.layout], ['面積', item.size], ['交通', item.access]]
        .filter(function (r) { return r[1]; })
        .map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('');

      var hasPdf = (item.pdfKind === 'path' && item.pdfPath) || item.blob;
      return '<article class="pcard">' +
        '<div class="pcard__top">' +
        '<span class="pcard__tag">掲載中</span>' +
        '<h3>' + esc(item.title) + '</h3>' +
        '<p class="pcard__price">' + esc(item.price || '価格応談') + '</p>' +
        (rows ? '<dl>' + rows + '</dl>' : '') +
        (item.note ? '<p class="pcard__note">' + esc(item.note) + '</p>' : '') +
        '</div>' +
        '<div class="pcard__foot">' +
        '<span class="pcard__file">' + esc(item.fileName || '') + '</span>' +
        (hasPdf
          ? '<button class="btn btn--sm btn--ghost" type="button" data-open="' + esc(item.id) + '">物件資料（PDF）を見る</button>'
          : '<span class="pcard__file">資料準備中</span>') +
        '</div></article>';
    }

    function render() {
      var keyword = keywordEl ? keywordEl.value.trim() : '';
      var shown = items.filter(function (i) { return matches(i, keyword); });
      listEl.innerHTML = shown.length
        ? shown.map(cardHTML).join('')
        : '<div class="empty">該当する物件がありませんでした。条件を変えてお試しください。</div>';
    }

    listEl.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-open]');
      if (!btn) return;
      var id = btn.getAttribute('data-open');
      var item = items.filter(function (i) { return i.id === id; })[0];
      if (item) openPdf(item);
    });

    if (keywordEl) keywordEl.addEventListener('input', render);

    listEl.innerHTML = '<div class="empty">物件情報を読み込んでいます…</div>';

    /* 通常はサイトに公開されているデータ（data/properties.json）を表示します。
       担当者用ページの「見え方を確認する」から開いたとき（?preview=1）は、
       そのパソコンで編集中の内容を表示します。 */
    var isPreview = /[?&]preview=1\b/.test(location.search);
    var source = isPreview
      ? list(options.category)
      : loadPublished().then(function (rows) {
          return rows.filter(function (r) { return r.category === options.category; })
            .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
        }).catch(function () { return list(options.category); });

    if (isPreview) {
      var badge = document.createElement('p');
      badge.className = 'notice';
      badge.innerHTML = '<b>これは確認用の表示です。</b>いまお使いのパソコンで編集中の内容を表示しています。' +
        'お客様に見えているのは、更新ページで書き出したデータを担当者が反映したあとの内容です。';
      listEl.parentNode.insertBefore(badge, listEl);
    }

    source.then(function (rows) {
      items = rows;
      render();
    }).catch(function (err) {
      console.error(err);
      listEl.innerHTML = '<div class="empty">物件情報を読み込めませんでした。ブラウザを更新してお試しください。</div>';
    });
  }

  global.PropertyStore = {
    list: list, get: get, save: save, remove: remove, replaceAll: replaceAll,
    esc: esc, formatSize: formatSize, uid: uid, openPdf: openPdf, matches: matches,
    dataUrlToBlob: dataUrlToBlob, loadPublished: loadPublished,
    MAX_SIZE: MAX_SIZE
  };
  global.PropertyBoard = { initPublic: initPublic };
})(window);
