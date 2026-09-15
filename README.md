# ひかり塾 定期テスト演習 準備＆記録システム（フロントエンド）

集団授業塾向けの「学校別・定期テスト演習」準備＆記録システムの MVP フロントエンド（Next.js App Router + TypeScript）。
バックエンド（FastAPI + SQLAlchemy + SQLite）は同リポジトリの [`backend/`](./backend/README.md) にあります。このフロントエンドは単体では動作せず、バックエンドを先に起動しておく必要があります。

## セットアップ

```bash
npm install
copy .env.local.example .env.local
npm run dev
```

`http://localhost:3000` で起動します。あらかじめバックエンド（`http://127.0.0.1:8000`）を起動しておいてください。手順は [`backend/README.md`](./backend/README.md) を参照してください。

## 環境変数（`.env.local`）

| 変数 | 説明 | デフォルト |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | バックエンド（FastAPI）のベースURL | `http://localhost:8000` |

バックエンド側の `CORS_ORIGIN` は、このフロントエンドを配信するオリジン（例 `http://localhost:3000`、スマホ実機で試す場合は後述のHTTPS URL）に合わせて設定してください。

## 初期ユーザー（バックエンドのseedスクリプトで作成）

| login_id | password | role |
|---|---|---|
| operator1 | password123 | operator（運営者） |
| teacher1 | password123 | teacher（先生） |

ログイン情報はメモリ上の React Context にのみ保持され、どこにも永続化されません。ページを再読み込みすると再ログインが必要です（仕様どおりの挙動です）。

## テスト

```bash
npm run test        # 1回実行
npm run test:watch  # watchモード
```

Vitest + React Testing Library を使用しています。

- `__tests__/answerSheetGrid.test.ts` — 解答用紙入力のキーボード操作（O/X=正誤, 0-3=ヒント段階, R=戻り, C=赤カード, Enter/↓/↑=行移動）と、戻り問題を元の問題の直後に字下げ表示する並び替えロジックの単体テスト
- `__tests__/AnswerSheetPage.test.tsx` — 解答用紙入力画面のキーボード操作の結合テスト（APIをモックし、実際のキー入力→保存→矛盾チェック警告表示までを検証）
- `__tests__/CameraCapture.test.tsx` — カメラ共通コンポーネントのエラー時フォールバック（`getUserMedia` をモックし、権限拒否・カメラなし・非対応ブラウザそれぞれでファイル選択フォールバックが表示されることを検証）

## スマホ実機でカメラ機能を試す方法

`getUserMedia()` は安全なコンテキスト（HTTPS または localhost）でのみ動作します。開発PCとスマホを同一ネットワークに置いた上で、以下のいずれかで HTTPS 化してください。

- `next dev --experimental-https` … Next.js組み込みの自己署名証明書でHTTPS起動（`https://localhost:3000`。スマホからは後述のホスト名でアクセス）
- `next dev --experimental-https -H 0.0.0.0` … 同一ネットワーク内の他端末（スマホ）からアクセスできるようにホスト名を開放
- [`mkcert`](https://github.com/FiloSottile/mkcert) でローカル証明書を発行し、`--experimental-https-key` / `--experimental-https-cert` を指定
- `ngrok http 3000` のようなトンネリングツールで一時的にHTTPS URLを発行

いずれの場合も、バックエンドの `CORS_ORIGIN` をそのHTTPS URL（例 `https://192.168.1.10:3000`）に合わせて更新し、フロントエンドの `NEXT_PUBLIC_API_BASE_URL` がスマホから到達可能なバックエンドのURLになっているか確認してください。

撮影した画像はブラウザのメモリ上でのみ扱われ、`localStorage` / `IndexedDB` / サーバーのディスクには一切保存されません。送信後は画面のstateから破棄されます。

## 技術スタック

- Next.js（App Router）+ TypeScript
- Tailwind CSS + Radix UI（shadcn/ui流の自前コンポーネント）
- KaTeX（問題文のLaTeXレンダリング）
- Vitest + React Testing Library（テスト）
- バックエンドとの通信はすべてJSON（画像もbase64でJSONに含めて送信）

## ディレクトリ構成

```
app/                      Next.js App Router のページ
  login/                  ログイン画面
  (main)/                 認証必須の画面（Sidebar+Headerを共有）
components/
  ui/                     shadcn/ui流の共通UIコンポーネント
  camera/CameraCapture.tsx カメラ共通コンポーネント
  problems/               問題編集・LaTeXプレビュー
  masters/                マスタ管理（CSV取込含む）
contexts/AuthContext.tsx  ログインユーザーのメモリ上Context
lib/
  api/                    バックエンドAPIクライアント（機能別）
  types/                  バックエンドのPydanticスキーマに対応する型定義
  answerSheetGrid.ts       解答用紙入力グリッドの純粋関数ロジック
__tests__/                Vitestのテストファイル
```
