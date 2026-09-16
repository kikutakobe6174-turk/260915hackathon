# ひかり塾 定期テスト演習 準備＆記録システム（フロントエンド）

集団授業塾向けの「学校別・定期テスト演習」準備＆記録システムです。Next.jsフロントエンドと、Gemini画像解析・問題生成・SQLite永続化を担うFastAPIバックエンドを同じリポジトリに収録しています。

## セットアップと起動

### 1. バックエンド

Python 3.11以上を用意し、PowerShellで次を実行します。

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
# .env を開き、GEMINI_API_KEY を設定
python run.py
```

`http://127.0.0.1:8000` で起動し、初回起動時に `backend/data/app.db` とseedデータを作成します。APIキーを設定しない場合もマスタ・テスト・問題APIは利用できますが、LLM機能は固定データへ切り替わらず、日本語の設定エラーを返します。

### 2. フロントエンド

```powershell
npm install
Copy-Item .env.local.example .env.local
npm run dev
```

`http://localhost:3000` で起動します。先にバックエンドを起動してください。

## 環境変数（`.env.local`）

| 変数 | 説明 | デフォルト |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | バックエンド（FastAPI）のベースURL | `http://localhost:8000` |

バックエンド側の `CORS_ORIGIN` は、このフロントエンドを配信するオリジン（例 `http://localhost:3000`、スマホ実機で試す場合は後述のHTTPS URL）に合わせて設定してください。

### バックエンド環境変数（`backend/.env`）

| 変数 | 説明 | デフォルト |
|---|---|---|
| `GEMINI_API_KEY` | Google AI Studioで発行したAPIキー。バックエンドだけが読む | なし（LLM APIは明示的エラー） |
| `GEMINI_MODEL` | 画像入力・構造化出力対応のGeminiモデル | `gemini-3.5-flash-lite` |
| `GEMINI_QUOTA_TEMPLATE_FALLBACK` | Geminiが429を返した場合だけ分析・問題テンプレートへ切り替える | `true` |
| `CORS_ORIGIN` | 許可するフロントエンドorigin。カンマ区切り可 | `http://localhost:3000` |
| `DATABASE_PATH` | SQLiteファイル | `backend/data/app.db` |

`GEMINI_API_KEY` は `NEXT_PUBLIC_` で始まる変数や `.env.local` へ入れないでください。`backend/.env` は `.gitignore` の対象です。

無料枠またはレート上限によるHTTP 429のときだけ、編集可能なローカルテンプレートへ切り替わります。テンプレートは元資料を解析した結果ではないため、画面に警告を表示し、ジョブのproviderも `quota-template` として通常のGemini結果と区別します。APIキー未設定・認証失敗・ネットワーク障害では切り替わりません。

## メインフロー（分析からPDF・Word保存まで）

1. seedの `operator1 / password123` でログインし、テスト一覧からseedテストを開きます。
2. ホーム中央へ画像またはPDFをドラッグ＆ドロップし、「分析する」を押します。対応形式はPDF・JPEG・PNG・WebPです。
3. Geminiの解析後、難しさ・単元・問題形式・出題量の4カードを確認します。小問番号・配点・確信度は「詳細を見る」で確認・修正できます。
4. 大きな「この分析をもとに問題を生成」を押すと、必要に応じて解析を確定し、`単元×形式×難易度` の構成と同じ問題群を生成します。
5. 学校配布用のA4プレビューを確認し、「PDFで保存」または「Wordで保存」を押します。編集した問題は出力前に下書きへ反映されます。
6. 問題編集や問題バンクへの一括保存は、プレビュー下部の詳細欄から行えます。

## 学校配布用PDF・Wordの作成

1. テスト詳細の「問題バンク」または「冊子構成」を開きます。
2. 「印刷プレビュー・PDF出力」を押し、収録する問題、制限時間、満点を確認します。
3. 「PDFで保存」または「Wordで保存」を押すと、FastAPIがファイルを生成し、`2026_高2_数学II_2学期中間_対策問題.pdf` / `.docx` のような名前でダウンロードします。

配点は、Gemini解析で確定した小問の配点をそのまま使います。問題バンクへ保存する時点で各問題に配点を確定させるため、同じテストを解析し直しても出力済みの配点はぶれません。小問ごとに「（5点）」を表示し、大問の〔配点〕はその合計、満点と得点欄も合計値になります。画面プレビュー・PDF・Wordは同じ規則で計算するため、3者の配点表示は必ず一致します。解析配点を復元できない問題（手入力の問題など）が1つでも含まれる場合だけ、従来どおり満点を大問へ等分します。

### 解答・解説版

同じ画面の「解答解説PDF」「解答解説Word」を押すと、問題用とは別に、DBへ保存済みの正答・解説・3段階ヒントを載せた解答解説版を出力します。ファイル名は `..._対策問題_解答解説.pdf` / `.docx` です。配布用ではないため氏名欄・得点欄は入りません。配点表示は問題用と同じです。

APIは同じエンドポイントに `"include_answers": true` を渡すだけです。

PDFはWeb画面のスクリーンショットではありません。ReportLabでA4用紙を組版します。Wordはpython-docxで編集可能なA4文書を生成します。どちらも学校名・学年・科目・氏名欄・得点欄・大問・小問・配点・解答欄・ページ番号を含み、AI・ジョブID・難易度などの管理情報は出力されません。

入力画像はブラウザでの確認・再試行中だけ保持し、確定時に破棄します。バックエンドは画像をファイルやDBへ保存しません。解析ジョブIDと生成ジョブIDは別々に永続化され、問題には `source: "llm"`、生成ジョブID、親の解析ジョブIDが保存されます。

## デモ用の緩和モード（DEMO_RELAXED_VALIDATION）

Geminiの出力に対する内容面の検証が厳しく、「数学校閲後も問題文・正答・解説の検証条件を満たしませんでした。」などで生成が止まることがあります。デモ中に処理を止めないための応急フラグです。

```
# backend/.env
DEMO_RELAXED_VALIDATION=true   # 既定は false（従来どおりの厳格検証）
```

有効なとき、次の検証で落ちても**警告ログだけ残して結果を通します**。画面にエラーは出ません。

- 思考途中・自己訂正マーカー（`unfinished_markers`）の検出
- 生成された問題の構成・問題数が元テストと一致しない
- 解析の `total_points` と小問配点の合計が一致しない（小問の配点はそのまま使い、総配点を合計へ寄せます）

有効・無効によらず、次の場合は**従来どおりエラー**にします。

- 問題文・正答・解説が空
- JSONとして壊れている
- 必須フィールドが欠けている（ヒントが3段ない場合を含む）
- 存在しない単元ID・形式IDが含まれている

ログには `relaxed validation accepted: problem generation (...)` のように、どの段で緩和が働いたかが残ります。現在の状態は `GET /health` の `relaxed_validation` で確認できます。厳格検証へ戻すにはフラグを `false` にしてバックエンドを再起動してください。既存の検証コード（`_validate_generated_problems`）は残してあり、フラグOFFで完全に元の挙動に戻ります。

## MVPで非表示にしている機能

バックエンドAPIが未実装で、操作するとエラーになる画面は、ナビゲーションから外してあります。ページ・ルート・APIクライアントのコードは削除していないため、対応するエンドポイントを実装したあと `lib/featureFlags.ts` の `UNAVAILABLE_ROUTES` から該当パスを外すだけで元に戻ります。

| 非表示 | 未実装のAPI |
|---|---|
| 授業回一覧 `/lessons` | `GET/POST /lessons`, `/lessons/{id}/answer-sheets` |
| 解答用紙・採点記録 `/answer-sheets/{id}` | `/answer-sheets/{id}`, `/attempts`, `/confirm`, `/llm/sheet-draft` |
| 各種マスタ管理 `/masters/*` | `/schools`・`/textbooks`・`/formats`・`/units` の POST/PUT/DELETE、`/students` 一式、CSV取込 |
| 問題編集の「下書きを生成」 | `/llm/problem-draft`（`LLM_PROBLEM_DRAFT_AVAILABLE` で制御） |

上記のURLへ直接アクセスしても404や500にはならず、`(main)` レイアウトが「この機能は現在準備中です」という画面を表示します。

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
npm run lint
npm run build
```

Vitest + React Testing Library を使用しています。

- `__tests__/answerSheetGrid.test.ts` — 解答用紙入力のキーボード操作（O/X=正誤, 0-3=ヒント段階, R=戻り, C=赤カード, Enter/↓/↑=行移動）と、戻り問題を元の問題の直後に字下げ表示する並び替えロジックの単体テスト
- `__tests__/AnswerSheetPage.test.tsx` — 解答用紙入力画面のキーボード操作の結合テスト（APIをモックし、実際のキー入力→保存→矛盾チェック警告表示までを検証）
- `__tests__/CameraCapture.test.tsx` — カメラ共通コンポーネントのエラー時フォールバック（`getUserMedia` をモックし、権限拒否・カメラなし・非対応ブラウザそれぞれでファイル選択フォールバックが表示されることを検証）

バックエンドの通常テストはGemini通信を `FakeProvider` に差し替え、画像解析→修正→確定→同数生成→編集→問題バンク保存と、ジョブIDの関連を検証します。

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
pytest -q
```

`backend/.env` に実際の `GEMINI_API_KEY` がある場合だけ、次のテストも実通信します（未設定時はskip）。

```powershell
pytest -q tests/test_gemini_smoke.py
```

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
- ReportLab（日本語フォント埋め込みの学校配布用PDF生成）
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
