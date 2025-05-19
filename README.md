# Mediatlytics

Mediatlytics (メディアトリティクス) は､ Slack 上で動画や画像をアップロードすることで､ AI が文字起こしや内容分析を行うボットです｡分析結果は Slack のスレッドに Markdown ファイルとして返信されます｡

## 主な機能

- **動画・画像の分析**: アップロードされたメディアファイルを AI が分析します
- **文字起こし**: 動画の音声をテキストに変換します
- **内容要約**: メディアコンテンツの主要なポイントを要約します
- **Slack 連携**: Slack ボットとして動作し､ DM 経由で簡単に利用できます

## セットアップ

### 前提条件

- Node.js v23+
- pnpm
- Google Cloud Storage
- Slack アカウントおよびワークスペース

### 1. リポジトリのクローン

```bash
git clone https://github.com/KeisukeKudo/mediatlytics.git
cd mediatlytics
```

### 2. 依存関係のインストール

```bash
pnpm install
```

### 3. 環境変数の設定

プロジェクトルートに `.env` ファイルを作成し､以下の情報を記述します｡

```properties
# Slack
SLACK_BOT_TOKEN=xoxb-YOUR_SLACK_BOT_TOKEN
SLACK_SIGNING_SECRET=YOUR_SLACK_SIGNING_SECRET

# Google Cloud
# gcloud auth application-default login を実施してる場合は不要
GOOGLE_APPLICATION_CREDENTIALS=./credentials/service-account-keyfile.json
PROJECT_ID=YOUR_GOOGLE_CLOUD_PROJECT_ID
LOCATION=YOUR_GOOGLE_CLOUD_REGION
STORAGE_BUCKET=YOUR_GCS_BUCKET_NAME
# GCS内の保存先プレフィックス
STORAGE_PREFIX=slack
```

**注意**: `GOOGLE_APPLICATION_CREDENTIALS` で指定するサービスアカウントキーファイルを適切な場所に配置してください｡このサービスアカウントには､Google Cloud Storage への読み書き権限と､Vertex AI (Gemini API) の利用権限が必要です｡

### 4. Slack アプリの設定

1.  [Slack API](https://api.slack.com/apps) で新しいアプリを作成します
1.  **OAuth & Permissions** で以下のスコープをボットトークンに追加します
    - `chat:write` (メッセージ送信)
    - `files:read` (ファイル読み取り)
    - `im:history` (DM 履歴読み取り)
    - `im:read` (DM 読み取り)
    - `im:write` (DM 書き込み)
    - `users:read` (ユーザー情報読み取り - オプション)
1.  **Event Subscriptions**
    - Request URL にデプロイした Cloud Run のエンドポイントなどを設定します｡
    - Subscribe to bot events で `message.im` (DM へのメッセージ) を追加します｡
1.  アプリをワークスペースにインストールします｡

## ローカルでの実行

```bash
pnpm build && pnpm start
```

ローカルのサーバーを外部へ公開します｡  
以下は `cloudflared` コマンドを使った例です｡

```bash
cloudflared tunnel --url http://localhost:8080
```

## デプロイ (Google Cloud Run)

### 1. TypeScript のビルド

```bash
pnpm build
```

### 2. Docker イメージのビルドとプッシュ (Cloud Build を使用)

`cloudbuild.yaml` をプロジェクトルートへ作成し､以下のように編集してください｡

```yaml
steps:
  - name: "gcr.io/cloud-builders/docker"
    args: ["build", "-t", "{region}-docker.pkg.dev/{project-id}/{repository}/{package}", "."]
    env:
      - "DOCKER_BUILDKIT=1"

images:
  - "{region}-docker.pkg.dev/{project-id}/{repository}/{package}"
```

ビルドコマンドを実行します｡

```bash
gcloud builds submit --config=cloudbuild.yaml
```

これにより､ Dockerfile に基づいて Docker イメージがビルドされ､ Artifact Registry にプッシュされます｡

### 3. Cloud Run へのデプロイ

```bash
gcloud run deploy mediatlytics \
  --image YOUR_IMAGE_URL
  --platform managed \
  --region YOUR_REGION \
  --allow-unauthenticated \
  --memory 512Mi \
  --set-env-vars="SLACK_BOT_TOKEN=YOUR_SLACK_BOT_TOKEN,SLACK_SIGNING_SECRET=YOUR_SLACK_SIGNING_SECRET,PROJECT_ID=YOUR_GOOGLE_CLOUD_PROJECT_ID,LOCATION=YOUR_GOOGLE_CLOUD_REGION,STORAGE_BUCKET=YOUR_GCS_BUCKET_NAME,STORAGE_PREFIX=slack"
```

## 使い方

1. Slack で Mediatlytics app のダイレクトメッセージを開きます
1. 分析したい動画または画像ファイルをアップロードします
1. 任意で､ファイルと一緒にテキストメッセージを送信することで､ AI への指示を追加できます
   - 例: ｢この動画広告のターゲット層と訴求ポイントを分析してください｣
1. ボットが ｢分析中…… 🔎｣ というメッセージがスレッドに投稿されます
1. 分析が完了すると､結果が Markdown ファイルとして同じスレッドに投稿されます

## プロンプトの管理

分析に使用される AI への指示 (プロンプト) は､ `prompts/` ディレクトリ内の YAML ファイルで管理されています｡

- `video-analysis.yaml`: 動画分析用のプロンプト
- `image-analysis.yaml`: 画像分析用のプロンプト

これらのファイルを編集することで､分析の内容や出力形式をカスタマイズできます｡
