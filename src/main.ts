import bolt from "@slack/bolt";
import dotenv from "dotenv";
import { getStorageUri } from "./storage.js";
import { analyze } from "./analyze.js";

dotenv.config();

const app = new bolt.App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

app.use(async ({ context, next }) => {
  if (context.retryNum) {
    console.debug("retryNum", context.retryNum);
    return;
  }
  await next();
});

/**
 * DM チャンネルのみ､添付ファイルがあり､スレッドメッセージでない場合に処理を実行
 */
app.message(async ({ message, say, client, context }) => {
  if (message.channel_type !== "im" || "thread_ts" in message || !("files" in message)) {
    return;
  }

  try {
    const progress = await say({ text: "分析中…… 🔎", thread_ts: message.ts });

    const files = (message.files ?? []).filter((file) => {
      const mimetype = file.mimetype ?? "";
      return mimetype.startsWith("video/") || mimetype.startsWith("image/");
    });
    if (files.length === 0) {
      await client.chat.update({
        channel: progress.channel ?? "",
        ts: progress.ts ?? "",
        text: `分析するファイルがありませんでした。
｢コンピューターからアップロード｣ からファイルを選択して、もう一度お試しください。`,
      });
      return;
    }

    const userId = context.userId ?? "";
    const userPrompt = message.text ?? "";
    const gcsFiles = await Promise.all(
      files.map(async (file) => {
        const ts = message.ts;
        return getStorageUri(file, userId, ts).catch(async (e) => {
          await handleError(`ファイル「${file.name}」の処理中にエラーが発生しました`, e, ts, say);
          return null;
        });
      })
    );
    const results = await Promise.all(
      gcsFiles.filter((file) => file !== null).map((file) => analyze(file.title, file.uri, userPrompt, file.mimetype))
    );

    await Promise.all(
      results.map((result) => {
        const title = result.title ?? "";
        return client.filesUploadV2({
          channel_id: message.channel ?? "",
          thread_ts: message.ts,
          initial_comment: `${title} の分析が完了しました。`,
          filename: `${title}.md`,
          content: result.content,
        });
      })
    );

    await client.chat.delete({
      channel: progress.channel ?? "",
      ts: progress.ts ?? "",
    });
    console.info("finished", `${results.length} files`);
  } catch (e) {
    await handleError("分析に失敗しました", e, message.ts, say);
  }
});

async function handleError(label: string, error: any, ts: string, say: bolt.SayFn) {
  console.error(`${label}: `, error);
  await say({
    text: label,
    thread_ts: ts,
  }).catch(console.error);
}

(async () => {
  await app.start(Number(process.env.PORT) || 8080);
  console.info("🔍 Mediatlytics is running!");
})();
