/* ============================================================
   担当者用「物件情報の更新ページ」
   追加・書きかえ・PDFの入れかえ・削除・並べかえ・書き出し・読み込み
   ============================================================ */
(function () {
  'use strict';

  var S = window.PropertyStore;
  var esc = S.esc;

  var state = { category: 'rent', editingId: null, items: [], pickedFile: null };

  var el = {
    tabs: document.querySelectorAll('[data-cat]'),
    rows: document.getElementById('rows'),
    count: document.getElementById('count'),
    addBtn: document.getElementById('addBtn'),
    editor: document.getElementById('editor'),
    editorTitle: document.getElementById('editorTitle'),
    editorLead: document.getElementById('editorLead'),
    form: document.getElementById('editorForm'),
    error: document.getElementById('editorError'),
    flash: document.getElementById('flash'),
    filepick: document.getElementById('filepick'),
    fileInput: document.getElementById('pdfFile'),
    fileNow: document.getElementById('fileNow'),
    fileHint: document.getElementById('fileHint'),
    exportBtn: document.getElementById('exportBtn'),
    importInput: document.getElementById('importFile'),
    viewLink: document.getElementById('viewLink')
  };

  var CAT_LABEL = { rent: '借りたい（賃貸）', buy: '買いたい（売買）' };
  var CAT_PAGE = { rent: 'rent.html?preview=1', buy: 'buy.html?preview=1' };

  /* ---------- メッセージ表示 ---------- */
  function flash(text, ok, subHtml) {
    el.flash.className = 'flash ' + (ok ? 'flash--ok' : 'flash--ng');
    el.flash.innerHTML = esc(text) + (subHtml ? '<span class="flash__sub">' + subHtml + '</span>' : '');
    el.flash.hidden = false;
    el.flash.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function clearFlash() { el.flash.hidden = true; }

  function showError(title, detail) {
    el.error.innerHTML = '<b>' + esc(title) + '</b>' + esc(detail || '');
    el.error.hidden = false;
    el.error.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function clearError() { el.error.hidden = true; }

  /* ---------- 一覧の表示 ---------- */
  function pdfLabel(item) {
    if (item.pdfKind === 'path' && item.pdfPath) return esc(item.fileName || item.pdfPath);
    if (item.blob) return esc(item.fileName || 'PDF') + '（' + S.formatSize(item.fileSize) + '）';
    return null;
  }

  function rowHTML(item, index, total) {
    var meta = [item.area, item.layout, item.size, item.access].filter(Boolean).join('／');
    var pdf = pdfLabel(item);
    return '<div class="row' + (state.editingId === item.id ? ' row--editing' : '') + '">' +
      '<div>' +
        '<span class="row__no">' + (index + 1) + '番目</span>' +
        '<h3>' + esc(item.title) + '</h3>' +
        '<p class="row__price">' + esc(item.price || '価格未入力') + '</p>' +
        (meta ? '<p class="row__meta">' + esc(meta) + '</p>' : '') +
        (item.note ? '<p class="row__meta">' + esc(item.note) + '</p>' : '') +
        '<p class="row__pdf">' + (pdf ? '物件資料：<b>' + pdf + '</b>' : '物件資料：まだ登録されていません') + '</p>' +
      '</div>' +
      '<div class="row__actions">' +
        '<button class="bigbtn" type="button" data-edit="' + esc(item.id) + '">内容を書きかえる</button>' +
        '<button class="bigbtn bigbtn--danger" type="button" data-del="' + esc(item.id) + '">この物件を消す</button>' +
        '<div class="row__sort">' +
          '<button class="bigbtn bigbtn--gray" type="button" data-up="' + esc(item.id) + '"' + (index === 0 ? ' disabled' : '') + '>↑ 上へ</button>' +
          '<button class="bigbtn bigbtn--gray" type="button" data-down="' + esc(item.id) + '"' + (index === total - 1 ? ' disabled' : '') + '>↓ 下へ</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function render() {
    el.rows.innerHTML = state.items.length
      ? state.items.map(function (item, i) { return rowHTML(item, i, state.items.length); }).join('')
      : '<div class="empty" style="font-size:15px">まだ物件が1件も登録されていません。<br>下の「新しい物件を追加する」ボタンから登録してください。</div>';
    el.count.textContent = state.items.length;
    el.viewLink.href = CAT_PAGE[state.category];
  }

  function reload() {
    return S.list(state.category).then(function (rows) {
      state.items = rows;
      render();
    });
  }

  /* ---------- 種類の切り替え ---------- */
  el.tabs.forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.category = btn.getAttribute('data-cat');
      el.tabs.forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.getAttribute('data-cat') === state.category));
      });
      closeEditor();
      clearFlash();
      document.getElementById('listTitle').textContent =
        CAT_LABEL[state.category] + ' のページに載っている物件';
      reload();
    });
  });

  /* ---------- 入力フォーム ---------- */
  function setFileLabel(item) {
    var current = item && pdfLabel(item);
    if (state.pickedFile) {
      el.fileNow.innerHTML = 'これから登録するPDF：<b>' + esc(state.pickedFile.name) + '</b>（' + S.formatSize(state.pickedFile.size) + '）';
      el.fileHint.textContent = '別のPDFに変えたいときは、もう一度ここをクリックしてください。';
    } else if (current) {
      el.fileNow.innerHTML = 'いま登録されているPDF：<b>' + current + '</b>';
      el.fileHint.textContent = 'PDFを変えないときは、このまま何もしなくて大丈夫です。';
    } else {
      el.fileNow.innerHTML = 'PDFはまだ登録されていません。';
      el.fileHint.textContent = 'PDFがなくても登録できます（ホームページには「資料準備中」と表示されます）。';
    }
  }

  function openEditor(item) {
    clearError();
    clearFlash();
    state.editingId = item ? item.id : null;
    state.pickedFile = null;
    el.fileInput.value = '';

    var f = el.form.elements;
    ['title', 'price', 'area', 'access', 'layout', 'size', 'note'].forEach(function (name) {
      f[name].value = item ? (item[name] || '') : '';
    });

    if (item) {
      el.editorTitle.textContent = '「' + item.title + '」を書きかえています';
      el.editorLead.textContent = '直したいところだけ書きかえて、いちばん下の「この内容で保存する」を押してください。';
    } else {
      el.editorTitle.textContent = '新しい物件を追加します（' + CAT_LABEL[state.category] + '）';
      el.editorLead.textContent = '物件名だけ必ず入れてください。ほかの欄は空のままでも登録できます。';
    }

    setFileLabel(item);
    el.editor.hidden = false;
    render();
    el.editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    f.title.focus({ preventScroll: true });
  }

  function closeEditor() {
    el.editor.hidden = true;
    state.editingId = null;
    state.pickedFile = null;
    clearError();
  }

  el.addBtn.addEventListener('click', function () { openEditor(null); });
  document.getElementById('cancelBtn').addEventListener('click', function () {
    if (window.confirm('入力した内容は保存されません。やめてよろしいですか？')) {
      closeEditor();
      render();
    }
  });

  /* PDFの選択（クリック／ドラッグ＆ドロップ） */
  el.filepick.addEventListener('click', function () { el.fileInput.click(); });
  el.filepick.addEventListener('dragover', function (e) { e.preventDefault(); el.filepick.classList.add('is-drag'); });
  el.filepick.addEventListener('dragleave', function () { el.filepick.classList.remove('is-drag'); });
  el.filepick.addEventListener('drop', function (e) {
    e.preventDefault();
    el.filepick.classList.remove('is-drag');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) acceptFile(e.dataTransfer.files[0]);
  });
  el.fileInput.addEventListener('change', function () {
    if (el.fileInput.files && el.fileInput.files[0]) acceptFile(el.fileInput.files[0]);
  });

  function currentItem() {
    return state.items.filter(function (i) { return i.id === state.editingId; })[0];
  }

  function acceptFile(file) {
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
      state.pickedFile = null;
      el.fileInput.value = '';
      showError('PDFファイルではないようです。', '選んだファイル「' + file.name + '」はPDFではありません。ファイル名の最後が「.pdf」のものを選んでください。');
      setFileLabel(currentItem());
      return;
    }
    if (file.size > S.MAX_SIZE) {
      state.pickedFile = null;
      el.fileInput.value = '';
      showError('ファイルが大きすぎます。', '10MBまでのPDFを選んでください（選んだファイルは ' + S.formatSize(file.size) + ' です）。');
      setFileLabel(currentItem());
      return;
    }
    clearError();
    state.pickedFile = file;
    setFileLabel(currentItem());
  }

  /* 保存 */
  el.form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearError();

    var f = el.form.elements;
    var title = f.title.value.trim();
    if (!title) {
      showError('物件名が入力されていません。', '「物件名」の欄に、物件の名前を入れてから保存してください。');
      f.title.focus();
      return;
    }

    var editing = currentItem();
    var record;

    if (editing) {
      record = Object.assign({}, editing);
    } else {
      var maxOrder = state.items.reduce(function (m, i) { return Math.max(m, i.order || 0); }, -1);
      record = { id: S.uid(), category: state.category, order: maxOrder + 1, createdAt: Date.now(), pdfKind: 'none' };
    }

    record.title = title;
    ['price', 'area', 'access', 'layout', 'size', 'note'].forEach(function (name) {
      record[name] = f[name].value.trim();
    });
    record.updatedAt = Date.now();

    if (state.pickedFile) {
      record.pdfKind = 'file';
      record.blob = state.pickedFile;
      record.fileName = state.pickedFile.name;
      record.fileSize = state.pickedFile.size;
      delete record.pdfPath;
    }

    S.save(record).then(function () {
      var wasNew = !editing;
      closeEditor();
      return reload().then(function () {
        flash(
          wasNew ? '「' + title + '」を追加しました。' : '「' + title + '」の内容を書きかえました。',
          true,
          '「ホームページでの見え方を確認する」ボタンで、表示を確かめられます。'
        );
      });
    }).catch(function (err) {
      console.error(err);
      showError('保存できませんでした。', 'お手数ですが、もう一度「この内容で保存する」を押してください。それでも保存できない場合は担当者にご連絡ください。');
    });
  });

  /* ---------- 一覧のボタン ---------- */
  el.rows.addEventListener('click', function (e) {
    var edit = e.target.closest('[data-edit]');
    var del = e.target.closest('[data-del]');
    var up = e.target.closest('[data-up]');
    var down = e.target.closest('[data-down]');

    if (edit) {
      var item = state.items.filter(function (i) { return i.id === edit.getAttribute('data-edit'); })[0];
      if (item) openEditor(item);
      return;
    }

    if (del) {
      var target = state.items.filter(function (i) { return i.id === del.getAttribute('data-del'); })[0];
      if (!target) return;
      if (!window.confirm('「' + target.title + '」をホームページから消します。\n\nこの操作はもとにもどせません。よろしいですか？')) return;
      S.remove(target.id).then(reload).then(function () {
        flash('「' + target.title + '」を消しました。', true);
      });
      return;
    }

    if (up || down) {
      var id = (up || down).getAttribute(up ? 'data-up' : 'data-down');
      var idx = state.items.findIndex(function (i) { return i.id === id; });
      var swapIdx = up ? idx - 1 : idx + 1;
      if (idx < 0 || swapIdx < 0 || swapIdx >= state.items.length) return;

      var a = state.items[idx], b = state.items[swapIdx];
      var aOrder = a.order || 0, bOrder = b.order || 0;
      if (aOrder === bOrder) { aOrder = idx; bOrder = swapIdx; }
      a.order = bOrder; b.order = aOrder;
      Promise.all([S.save(a), S.save(b)]).then(reload);
    }
  });

  /* ---------- 書き出し ---------- */
  function blobToDataUrl(blob) {
    return new Promise(function (res, rej) {
      var reader = new FileReader();
      reader.onload = function () { res(reader.result); };
      reader.onerror = function () { rej(reader.error); };
      reader.readAsDataURL(blob);
    });
  }

  el.exportBtn.addEventListener('click', function () {
    clearFlash();
    el.exportBtn.disabled = true;
    el.exportBtn.textContent = '準備しています…';

    S.list(null).then(function (all) {
      return Promise.all(all.map(function (item) {
        var out = Object.assign({}, item);
        delete out.blob;
        if (item.blob) {
          return blobToDataUrl(item.blob).then(function (dataUrl) {
            out.pdfData = dataUrl;
            return out;
          });
        }
        return out;
      }));
    }).then(function (items) {
      var now = new Date();
      var stamp = now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0');
      var data = { format: 'minato-bukken', version: 1, exportedAt: now.toISOString(), items: items };
      var blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = '物件データ_' + stamp + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 30000);

      flash('物件データを書き出しました。', true,
        'パソコンの「ダウンロード」フォルダに <b>物件データ_' + stamp + '.json</b> という名前で保存されています。' +
        'このファイルをメールに添付して、ホームページの担当者へお送りください。');
    }).catch(function (err) {
      console.error(err);
      flash('書き出しできませんでした。もう一度お試しください。', false);
    }).then(function () {
      el.exportBtn.disabled = false;
      el.exportBtn.textContent = '物件データを書き出す（ファイルに保存）';
    });
  });

  /* ---------- 読み込み ---------- */
  document.getElementById('importBtn').addEventListener('click', function () { el.importInput.click(); });

  el.importInput.addEventListener('change', function () {
    var file = el.importInput.files && el.importInput.files[0];
    el.importInput.value = '';
    if (!file) return;
    clearFlash();

    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try {
        data = JSON.parse(String(reader.result));
      } catch (err) {
        flash('このファイルは読み込めませんでした。', false,
          '「物件データ_〇〇.json」という名前のファイルを選んでください。');
        return;
      }
      if (!data || data.format !== 'minato-bukken' || !Array.isArray(data.items)) {
        flash('このファイルは物件データではないようです。', false,
          '「書き出す」ボタンで作られたファイルを選んでください。');
        return;
      }
      if (!window.confirm('いまホームページに載っている物件をすべて消して、\nこのファイルの内容（' + data.items.length + '件）に入れかえます。\n\nよろしいですか？')) return;

      var records = data.items.map(function (item) {
        var rec = Object.assign({}, item);
        if (rec.pdfData) {
          try { rec.blob = S.dataUrlToBlob(rec.pdfData); } catch (e) { /* PDFなしとして扱う */ }
          delete rec.pdfData;
        }
        return rec;
      });

      S.replaceAll(records).then(reload).then(function () {
        flash('ファイルの内容を読み込みました。（' + records.length + '件）', true);
      }).catch(function (err) {
        console.error(err);
        flash('読み込みに失敗しました。もう一度お試しください。', false);
      });
    };
    reader.readAsText(file);
  });

  /* ---------- 開始 ---------- */
  reload();
})();
