import { Storage } from "@google-cloud/storage";
import dotenv from "dotenv";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { SayFn } from "@slack/bolt";
import path from "path";
import { findUp } from "find-up";
import fs from "node:fs";

dotenv.config();

const root = await findUp("package.json").then((file) => (file ? path.dirname(file) : ""));

type File = {
  title: string;
  uri: string;
  mimetype: string;
};

/**
 * Slackからファイルをダウンロードし､Google Cloud Storageにアップロードする
 *
 * @param {any} file
 * @param {string} userId
 * @param {string} ts
 * @param {SayFn} say
 * @returns Google Cloud Storage URI
 */
export async function getStorageUri(file: any, userId: string, ts: string, say: SayFn): Promise<File | null> {
  const tempPath = path.join(root, "./temp", `${userId}-${ts}-${file.name}`);
  try {
    const response = await fetch(file.url_private_download, {
      headers: {
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      },
    });

    if (!response.ok || response.body === null) {
      throw new Error(`ダウンロード失敗: ${response.status} ${response.statusText}`);
    }
    const stream = fs.createWriteStream(tempPath);
    const readable = Readable.fromWeb(response.body as any);
    await pipeline(readable, stream);
    console.debug(`store: ${tempPath}`);

    const storage = new Storage();
    const prefix = process.env.STORAGE_PREFIX ?? "";
    const destPath = [prefix, userId, ts, file.name].filter((e) => e !== "").join("/");
    const bucketName = process.env.STORAGE_BUCKET;
    if (!bucketName) {
      throw new Error("STORAGE_BUCKET is not set");
    }
    const options = {
      destination: destPath,
    };
    await storage.bucket(bucketName).upload(tempPath, options);
    console.debug(`upload: ${destPath}`);
    return {
      title: (file.title ?? "").replace(/\.[^/.]+$/, ""),
      uri: `gs://${bucketName}/${destPath}`,
      mimetype: file.mimetype,
    };
  } catch (error) {
    console.error("ファイルのダウンロードに失敗:", error);
    await say({
      text: `ファイル「${file.name}」の処理中にエラーが発生しました`,
      thread_ts: ts,
    });
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
  return null;
}
