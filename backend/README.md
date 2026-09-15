# 260915hackathon backend

フロントエンド（`lib/api/*.ts` / `lib/types/api.ts`）が期待するAPI契約をそのまま実装した FastAPI バックエンド。SQLite のファイルDB（`app.db`）を使い、追加インフラは不要です。

## セットアップ

```bash
cd backend
python -m venv .venv
# Windows
.venv/Scripts/pip install -r requirements.txt
# macOS/Linux
# .venv/bin/pip install -r requirements.txt

cp .env.example .env
# .env に GEMINI_API_KEY を設定すると /llm/* が実際にGeminiを呼び出します。
# 未設定の場合、/llm/* はエラー(LLM_UNAVAILABLE, HTTP 502)を返しますが、それ以外のAPIは通常通り動作します。
```

## シードデータ投入

```bash
.venv/Scripts/python -m app.seed
```

学校・教科書・単元・形式・サンプルテスト・出題傾向データと、以下のデモユーザーを投入します（既にデータがある場合はスキップされます）。

| ロール | login_id | password |
| --- | --- | --- |
| operator | `operator1` | `password123` |
| teacher | `teacher1` | `password123` |

## 起動

```bash
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

フロントエンド（`npm run dev`、`http://localhost:3000`）からの CORS を許可済みです。フロント側の `.env.local` の `NEXT_PUBLIC_API_BASE_URL` が `http://localhost:8000` を指していればそのまま接続できます。

## テスト

```bash
.venv/Scripts/python -m pytest
```

Gemini呼び出しはモックしてあるため、`GEMINI_API_KEY` なしでも全テストが通ります。

## 実装上の注意（仕様が明文化されていない部分の解釈）

- **coverage（`GET /tests/{id}/coverage`）**: `required` はそのテストの出題傾向（`TrendItem`）で該当する単元×形式×難易度の組み合わせが出現した件数、`reviewed`/`draft` はその組み合わせを持つ問題（`Problem`）の件数です。`multiplier` は将来の仕様確定時に調整しやすいよう `app/services/coverage.py` の `COVERAGE_MULTIPLIER` に1箇所で固定値(1)として定義しています。
- **stats（`GET /problems/stats`）**: `flags` は簡易ヒューリスティックです（3回以上出題されて正答率50%未満なら `low_accuracy`、ヒント3段を使って2回以上不正解なら `needs_review`）。
- **出題傾向の `reviewed`**: `PUT /tests/{id}/trends`（画面上の「確認して保存」ボタン）を呼んだ時点で `reviewed=true, reviewed_by, reviewed_at` を設定しています。傾向データに個別レビューエンドポイントはフロントに存在しないため、保存＝確認済みという扱いです。
- **`POST /llm/trend-problem-draft`（過去問の傾向をもとにした作問、新機能）**: テスト×単元ごとに、その単元の出題傾向（形式・難易度の組み合わせ）を最大5パターンに絞り、組み合わせごとに1問ずつGeminiで下書きを生成します。前提単元は、その単元について既に「確認済み」になっている前提単元マップ（`Prerequisite.confirmed=true`）から自動的に補完します。
