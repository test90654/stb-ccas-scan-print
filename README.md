# stb-ccas-scan-print

STB と C-CAS カードのバーコードをスマホで読み取り、既存の顧客管理システムの顧客ページに差し込んで一緒に印刷するためのツールです。既存システム自体は変更しません。

```
現場スマホ（index.html）
   └─ 顧客番号 + STB / C-CAS 番号を送信
        ↓
Google スプレッドシート（gas/Code.gs）
   └─ 顧客番号ごとに保存
        ↓
事務所PC（Tampermonkey + userscript/kiki-sashikomi.user.js）
   └─ 顧客ページに機器欄とバーコードを差し込み → 印刷
```

## 構成

| パス | 役割 |
|---|---|
| `index.html` | スマホ用の読取・送信ページ（GitHub Pages で配信） |
| `gas/Code.gs` | 中継用 Google Apps Script（スプレッドシートに保存・取得） |
| `userscript/kiki-sashikomi.user.js` | 既存の顧客ページに機器欄を差し込む Tampermonkey スクリプト |
| `docs/setup.md` | セットアップ手順と日々の使い方 |

## 秘密の値について

このリポジトリには、中継URL・合言葉・顧客システムのURLを **入れません**。

- 合言葉：Apps Script の「スクリプト プロパティ」に保存
- 中継URL・合言葉（スマホ側）：各スマホの「接続設定」で入力し、端末内に保存
- 顧客システムのURL・中継URL・合言葉（PC側）：Tampermonkey 上のスクリプトだけを書き換える

コミット前に `git diff` で、これらの値が含まれていないことを確認してください。

## 使っているライブラリ

- [ZXing (@zxing/library)](https://github.com/zxing-js/library) — バーコード読取
- [JsBarcode](https://github.com/lindell/JsBarcode) — 印刷用バーコード生成
