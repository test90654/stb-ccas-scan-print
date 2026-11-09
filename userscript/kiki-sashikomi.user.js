// ==UserScript==
// @name         機器バーコード差し込み（STB / C-CAS）
// @namespace    kiki-renkei
// @version      1.0
// @description  既存の顧客ページに、スマホで読み取ったSTB・C-CAS番号とバーコードを差し込んで一緒に印刷する
// @match        https://顧客システムのドメイン/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @require      https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js
// ==/UserScript==

(function () {
  'use strict';

  /* ================= 設定（ここだけ書き換える） =================
     実際の値は Tampermonkey 上でだけ書き換え、リポジトリには戻さないこと。
     （@match の顧客システムURL・GAS_URL・TOKEN は社外秘） */
  const CONFIG = {
    GAS_URL: 'https://script.google.com/macros/s/XXXXXXXXXXXX/exec',
    TOKEN:   'ここを合言葉に変更',

    // 顧客ページだと判定するURL（正規表現）。@match より絞りたいとき用
    PAGE_URL: /.*/,

    // 顧客番号の取り方（上から順に試す）
    CUST_NO_URL_PARAM: '',                                 // URLの ?xxx=顧客番号 の xxx。例: 'para0'
    CUST_NO_SELECTOR: '',                                  // 例: '#customerNo', 'td.cust-id'
    CUST_NO_REGEX: /顧客(?:番号|No\.?|ＮＯ|コード|ID)\s*[:：]?\s*([A-Za-z0-9\-]+)/,

    // 機器欄を差し込む位置（この要素の直後）。空ならページ末尾
    INSERT_AFTER_SELECTOR: '',                             // 例: '#customerDetail', 'form table:last-of-type'

    // 印刷時に既存ページから隠したい要素（メニュー、ボタン類など）
    HIDE_ON_PRINT: '',                                     // 例: 'header, nav, .side-menu, .btn-area'
  };
  /* ============================================================== */

  if (!CONFIG.PAGE_URL.test(location.href)) return;

  const P = 'kiki-';
  GM_addStyle(`
    #${P}panel{position:fixed;right:16px;bottom:16px;z-index:2147483000;width:300px;max-width:calc(100vw - 32px);
      background:#fff;color:#1b2430;border:1px solid #c9d2db;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.18);
      font:13px/1.5 "BIZ UDPGothic","Yu Gothic","Meiryo",sans-serif}
    #${P}panel .hd{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#0b6e8a;color:#fff;border-radius:10px 10px 0 0;font-weight:700;cursor:pointer}
    #${P}panel .bd{padding:10px 12px;display:grid;gap:8px}
    #${P}panel.min .bd{display:none}
    #${P}panel input{font:14px "BIZ UDGothic",Consolas,monospace;padding:6px 8px;border:1px solid #c9d2db;border-radius:6px;width:100%;box-sizing:border-box}
    #${P}panel .r{display:flex;gap:6px}
    #${P}panel button{font-weight:700;font-size:13px;font-family:inherit;padding:7px 10px;border-radius:6px;border:1px solid #c9d2db;background:#fff;color:#1b2430;cursor:pointer}
    #${P}panel button.p{background:#0b6e8a;border-color:#0b6e8a;color:#fff}
    #${P}panel button:disabled{opacity:.5;cursor:default}
    #${P}panel .st{font-size:12px;color:#5d6b7a}
    #${P}panel .st.err{color:#b3261e}
    #${P}panel .sends{display:grid;gap:4px;max-height:140px;overflow:auto}
    #${P}panel .sends label{display:flex;gap:6px;align-items:center;font-size:12px}
    #${P}block{all:initial;display:block;margin:16px 0;font:12px/1.5 "BIZ UDPGothic","Yu Gothic","Meiryo",sans-serif;color:#111}
    #${P}block *{box-sizing:border-box}
    #${P}block h4{font-size:14px;margin:0 0 6px;border-bottom:2px solid #111;padding-bottom:3px;letter-spacing:.1em}
    #${P}block table{width:100%;border-collapse:collapse}
    #${P}block th,#${P}block td{border:1px solid #333;padding:5px 8px;text-align:left;vertical-align:middle}
    #${P}block th{background:#eef1f4;font-weight:700;text-align:center;white-space:nowrap}
    #${P}block td.n{font-family:"BIZ UDGothic",Consolas,monospace;font-size:13px;white-space:nowrap}
    #${P}block svg{height:44px;width:auto;max-width:260px;display:block}
    #${P}block .meta{font-size:11px;color:#444;margin-top:4px}
    @media print{
      #${P}panel{display:none!important}
      #${P}block{page-break-inside:avoid;break-inside:avoid}
      body.${P}hide-extra .${P}hidden-print{display:none!important}
    }
  `);

  /* ---------- 顧客番号の検出 ---------- */
  function detectCustNo() {
    if (CONFIG.CUST_NO_URL_PARAM) {
      const v = new URLSearchParams(location.search).get(CONFIG.CUST_NO_URL_PARAM);
      if (v) return v.trim();
    }
    if (CONFIG.CUST_NO_SELECTOR) {
      const el = document.querySelector(CONFIG.CUST_NO_SELECTOR);
      if (el) return (el.value || el.textContent || '').trim();
    }
    const m = (document.body.innerText || '').match(CONFIG.CUST_NO_REGEX);
    return m ? m[1].trim() : '';
  }

  /* ---------- パネル ---------- */
  const panel = document.createElement('div');
  panel.id = P + 'panel';
  panel.innerHTML = `
    <div class="hd"><span>STB / C-CAS 差し込み</span><span class="tg">−</span></div>
    <div class="bd">
      <div class="r"><input id="${P}cust" placeholder="顧客番号"><button id="${P}get" class="p">取得</button></div>
      <div class="sends" id="${P}sends"></div>
      <div class="st" id="${P}st">顧客番号を確認して「取得」を押してください。</div>
      <div class="r"><button id="${P}print" class="p" disabled>この画面ごと印刷</button><button id="${P}remove" disabled>外す</button></div>
    </div>`;
  document.body.appendChild(panel);
  const $ = id => document.getElementById(P + id);
  panel.querySelector('.hd').onclick = () => {
    panel.classList.toggle('min');
    panel.querySelector('.tg').textContent = panel.classList.contains('min') ? '+' : '−';
  };
  $('cust').value = detectCustNo();

  const st = (msg, err) => { $('st').textContent = msg; $('st').className = 'st' + (err ? ' err' : ''); };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmtCas = n => { const d = String(n).replace(/\D/g, ''); return d.length === 20 ? d.match(/.{4}/g).join('-') : n; };

  /* ---------- 取得 ---------- */
  let groups = [];  // 送信ごとのまとまり（新しい順）

  function fetchItems(cust) {
    return new Promise((resolve, reject) => {
      const url = CONFIG.GAS_URL + '?token=' + encodeURIComponent(CONFIG.TOKEN) + '&cust=' + encodeURIComponent(cust);
      GM_xmlhttpRequest({
        method: 'GET', url, timeout: 20000,
        onload: r => { try { const j = JSON.parse(r.responseText); j.ok ? resolve(j.items) : reject(new Error(j.error === 'token' ? '合言葉（TOKEN）が一致しません' : j.error)); } catch (e) { reject(new Error('応答を読めません。GAS_URL を確認してください')); } },
        onerror: () => reject(new Error('中継スクリプトに接続できません')),
        ontimeout: () => reject(new Error('応答がありません（タイムアウト）')),
      });
    });
  }

  $('get').onclick = async () => {
    const cust = $('cust').value.trim();
    if (!cust) return st('顧客番号を入れてください。', true);
    $('get').disabled = true; st('取得中…');
    try {
      const items = await fetchItems(cust);
      const map = new Map();
      items.forEach(it => { if (!map.has(it.id)) map.set(it.id, []); map.get(it.id).push(it); });
      groups = [...map.values()].reverse();
      if (!groups.length) { $('sends').innerHTML = ''; return st('この顧客番号の読取データはまだありません。', true); }
      $('sends').innerHTML = groups.map((g, i) => {
        const d = new Date(g[0].at);
        return `<label><input type="checkbox" data-g="${i}" ${i === 0 ? 'checked' : ''} style="width:auto">
          ${d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          ${esc(g[0].staff)}（${g.length}台）</label>`;
      }).join('');
      $('sends').querySelectorAll('input').forEach(c => c.onchange = render);
      render();
      st(groups.length > 1 ? `${groups.length}回分の送信があります。印刷する分にチェックしてください。` : '差し込みました。');
    } catch (e) { st(e.message, true); }
    finally { $('get').disabled = false; }
  };

  /* ---------- 差し込みブロック ---------- */
  function render() {
    const picked = [...$('sends').querySelectorAll('input:checked')].flatMap(c => groups[+c.dataset.g]);
    let block = $('block');
    if (!picked.length) { if (block) block.remove(); $('print').disabled = $('remove').disabled = true; return; }
    if (!block) {
      block = document.createElement('div'); block.id = P + 'block';
      const anchor = CONFIG.INSERT_AFTER_SELECTOR && document.querySelector(CONFIG.INSERT_AFTER_SELECTOR);
      if (anchor) anchor.insertAdjacentElement('afterend', block); else panel.insertAdjacentElement('beforebegin', block);
    }
    const staff = [...new Set(picked.map(x => x.staff).filter(Boolean))].join('・');
    const last = new Date(Math.max(...picked.map(x => +new Date(x.at))));
    block.innerHTML = `
      <h4>設置機器（STB / C-CAS）</h4>
      <table>
        <tr><th style="width:6%">No</th><th style="width:11%">種別</th><th style="width:16%">型番</th><th>番号</th><th style="width:36%">バーコード</th></tr>
        ${picked.map((d, i) => `<tr>
          <td style="text-align:center">${i + 1}</td>
          <td style="text-align:center;font-weight:700">${esc(d.type)}</td>
          <td>${esc(d.model)}</td>
          <td class="n">${esc(d.type === 'C-CAS' ? fmtCas(d.no) : d.no)}</td>
          <td><svg id="${P}bc${i}"></svg></td></tr>`).join('')}
      </table>
      <div class="meta">読取：${last.toLocaleString('ja-JP')}　担当：${esc(staff) || '—'}</div>`;
    picked.forEach((d, i) => {
      try { JsBarcode('#' + P + 'bc' + i, d.no, { format: 'CODE128', height: 40, width: 1.4, displayValue: false, margin: 0 }); } catch (e) {}
    });
    $('print').disabled = $('remove').disabled = false;
  }

  $('remove').onclick = () => {
    const b = $('block'); if (b) b.remove();
    $('sends').querySelectorAll('input').forEach(c => c.checked = false);
    $('print').disabled = $('remove').disabled = true; st('外しました。');
  };

  $('print').onclick = () => {
    if (CONFIG.HIDE_ON_PRINT) {
      document.querySelectorAll(CONFIG.HIDE_ON_PRINT).forEach(el => el.classList.add(P + 'hidden-print'));
      document.body.classList.add(P + 'hide-extra');
    }
    window.print();
  };

  /* 画面遷移が再読み込みなしで起きるシステム向け：URLが変わったら顧客番号を取り直す */
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    const b = $('block'); if (b) b.remove();
    $('sends').innerHTML = ''; $('print').disabled = $('remove').disabled = true;
    setTimeout(() => { $('cust').value = detectCustNo(); st('顧客番号を確認して「取得」を押してください。'); }, 800);
  }, 1000);
})();
