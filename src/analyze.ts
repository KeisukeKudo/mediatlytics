import { createUserContent, GoogleGenAI, createPartFromUri, GenerateContentConfig } from "@google/genai";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "path";
import yaml from "js-yaml";
import { findUp } from "find-up";

dotenv.config();

const root = await findUp("package.json").then((file) => (file ? path.dirname(file) : ""));

type AnalyzeResult = {
  title: string;
  content: string;
};

type Prompt = {
  model: { name: string; config: GenerateContentConfig };
  prompt: { instruction: string; content: string };
};

function genAI(): GoogleGenAI {
  return new GoogleGenAI({
    vertexai: true,
    project: process.env.PROJECT_ID,
    location: process.env.LOCATION,
  });
}

function loadPromptConfig(filename: string): Prompt {
  const promptPath = path.join(root, "./prompts", filename);
  const fileContents = fs.readFileSync(promptPath, "utf8");
  const config = yaml.load(fileContents) as Prompt;
  return config;
}

function formatPrompt(template: string, params: Record<string, string>): string {
  let result = template;
  for (const [k, v] of Object.entries(params)) {
    result = result.replace(new RegExp(`\\{${k}\\}`, "g"), v);
  }
  return result;
}

function selectTemplate(mimetype: string): Prompt {
  if (mimetype.startsWith("video/")) {
    return loadPromptConfig("video-analysis.yaml");
  }
  if (mimetype.startsWith("image/")) {
    return loadPromptConfig("image-analysis.yaml");
  }
  throw new Error(`Unsupported mimetype: ${mimetype}`);
}

/**
 *
 * @param {string} title
 * @param {string} uri Google Cloud Storage URI
 * @param {string} userPrompt
 * @param {string} mimetype
 * @returns
 */
export async function analyze(title: string, uri: string, userPrompt: string, mimetype: string): Promise<AnalyzeResult> {
  const prompt = selectTemplate(mimetype);
  const promptText = `${prompt.prompt.instruction}
<user_prompt>${userPrompt}</user_prompt>
${formatPrompt(prompt.prompt.content, { title })}`;

  const ai = genAI();
  const response = await ai.models.generateContent({
    model: prompt.model.name,
    config: prompt.model.config,
    contents: createUserContent([createPartFromUri(uri, mimetype), promptText]),
  });

  return {
    title,
    content: response.text ?? "",
  };
}
