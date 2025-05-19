import bolt from "@slack/bolt";
import dotenv from "dotenv";
import { getStorageUri } from "./storage.js";
import { analyze } from "./analyze.js";

dotenv.config();

const app = new bolt.App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

app.use(async ({ next }) => {
  await next();
});

app.message(async ({ message, say, client, context }) => {
  // DM チャンネルではない or スレッドメッセージではない or 添付ファイルがない場合は無視
  if (message.channel_type !== "im" || "thread_ts" in message || !("files" in message)) {
    return;
  }

  const progress = await say({ text: "分析中…… 🔎", thread_ts: message.ts });

  try {
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
    const gcsFiles = await Promise.all(files.map(async (file) => getStorageUri(file, userId, message.ts, say)));
    const results = await Promise.all(
      gcsFiles.filter((file) => file !== null).map((file) => analyze(file.title, file.uri, userPrompt, file.mimetype))
    );

    for (const result of results) {
      const title = result.title ?? "";
      await client.filesUploadV2({
        channel_id: message.channel ?? "",
        thread_ts: message.ts,
        initial_comment: `${title} の分析が完了しました。`,
        filename: `${title}.md`,
        content: result.content,
      });
    }
    await client.chat.delete({
      channel: progress.channel ?? "",
      ts: progress.ts ?? "",
    });
    console.info("finished", `${results.length} files`);
  } catch (error) {
    console.error("分析に失敗:", error);
    await say({ text: "分析に失敗しました。", thread_ts: message.ts });
  }
});

(async () => {
  await app.start(Number(process.env.PORT) || 8080);
  console.info("🔍 Mediatlytics is running!");
})();
