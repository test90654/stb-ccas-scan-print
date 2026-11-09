/**
 * 機器バーコード中継（Google Apps Script）
 * スマホ読取ページ → このスクリプト → スプレッドシート → 事務所PCのユーザースクリプト
 *
 * 1. 新しいGoogleスプレッドシートを作り、［拡張機能］→［Apps Script］にこのコードを貼る
 * 2. ［プロジェクトの設定］→［スクリプト プロパティ］に
 *      プロパティ TOKEN ／ 値 推測されにくい合言葉   を追加する（コードには書かない）
 * 3. ［デプロイ］→［新しいデプロイ］→ 種類「ウェブアプリ」
 *      実行ユーザー：自分 ／ アクセスできるユーザー：全員
 * 4. 表示された「ウェブアプリURL」(…/exec) を控える
 */

const TOKEN = PropertiesService.getScriptProperties().getProperty('TOKEN') || '';
const SHEET_NAME = 'scans';
const HEADER = ['受付日時', '顧客番号', '担当者', '種別', '番号', '型番', '送信ID'];

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADER);
    sh.getRange('B:B').setNumberFormat('@'); // 顧客番号は文字列
    sh.getRange('E:E').setNumberFormat('@'); // 20桁のC-CAS番号が数値化で壊れないように
    sh.setFrozenRows(1);
  }
  return sh;
}

function norm_(s) {
  return String(s == null ? '' : s).replace(/[\s\-ー－]/g, '').toUpperCase();
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** スマホからの送信 */
function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'bad_json' }); }
  if (!TOKEN || body.token !== TOKEN) return out_({ ok: false, error: 'token' });
  if (!body.custNo || !Array.isArray(body.devices) || !body.devices.length) {
    return out_({ ok: false, error: 'empty' });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet_();
    // 同じ送信IDの再送は二重登録しない
    const ids = sh.getRange(1, 7, sh.getLastRow(), 1).getValues().flat();
    if (body.id && ids.indexOf(body.id) >= 0) return out_({ ok: true, duplicate: true });

    const now = new Date();
    const rows = body.devices.map(d => [
      now, "'" + String(body.custNo), body.staff || '',
      d.type === 'cas' ? 'C-CAS' : 'STB', "'" + String(d.no), d.model || '', body.id || ''
    ]);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, HEADER.length).setValues(rows);
    return out_({ ok: true, count: rows.length });
  } finally {
    lock.releaseLock();
  }
}

/** 事務所PCからの取得  ?token=…&cust=顧客番号  （cust 省略時は最近50件） */
function doGet(e) {
  const p = e.parameter || {};
  if (!TOKEN || p.token !== TOKEN) return out_({ ok: false, error: 'token' });

  const values = sheet_().getDataRange().getValues().slice(1);
  let items = values.map(r => ({
    at: r[0] instanceof Date ? r[0].toISOString() : String(r[0]),
    custNo: String(r[1]), staff: String(r[2]), type: String(r[3]),
    no: String(r[4]), model: String(r[5]), id: String(r[6])
  }));

  if (p.cust) {
    const c = norm_(p.cust);
    items = items.filter(x => norm_(x.custNo) === c);
  } else {
    items = items.slice(-50);
  }
  return out_({ ok: true, items: items });
}
