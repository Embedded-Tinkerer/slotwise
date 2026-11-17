// Gemini client. The API key is pasted in by the user and kept in the
// phone's secure storage; requests go straight from the phone to Google.

import * as SecureStore from 'expo-secure-store';

import type { Attachment } from './attachments';
import { RESPONSE_SCHEMA, buildPrompt, toDrafts, type Draft } from './parse';
import {
  PROJECT_SCHEMA,
  buildProjectPrompt,
  toProjectPlan,
  type ProjectPlan,
  type ProjectPlanInput,
} from './projectPlan';

const KEY = 'slotwise_gemini_key';
export const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest';
export const GEMINI_KEY_URL = 'https://aistudio.google.com/apikey';

export async function getGeminiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY);
}

export async function setGeminiKey(key: string | null): Promise<void> {
  if (key && key.trim()) await SecureStore.setItemAsync(KEY, key.trim());
  else await SecureStore.deleteItemAsync(KEY);
}

/** Calls Gemini with a JSON response schema and returns the parsed JSON. */
export async function generateJson(
  prompt: string,
  schema: object,
  model: string = DEFAULT_GEMINI_MODEL,
  attachments: Attachment[] = [],
): Promise<unknown> {
  const key = await getGeminiKey();
  if (!key) throw new Error('Add your Gemini API key first (Settings → AI assistant).');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model || DEFAULT_GEMINI_MODEL)}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            ...attachments.map((a) => ({ inlineData: { mimeType: a.mimeType, data: a.data } })),
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    let msg = body.slice(0, 300);
    try {
      msg = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? msg;
    } catch {
      // keep raw text
    }
    throw new Error(`Gemini error ${res.status}: ${msg}`);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const out = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!out) throw new Error('Gemini returned an empty answer. Try rephrasing.');
  return JSON.parse(out);
}

export async function draftFromText(text: string, model?: string, attachments: Attachment[] = []): Promise<Draft[]> {
  const note = attachments.length
    ? `${text}\n\n(Attached: ${attachments.map((a) => a.name).join(', ')}. Use them to find tasks, dates and appointments.)`
    : text;
  return toDrafts(await generateJson(buildPrompt(note, new Date()), RESPONSE_SCHEMA, model, attachments));
}

export async function draftProject(
  input: ProjectPlanInput,
  model?: string,
  attachments: Attachment[] = [],
): Promise<ProjectPlan> {
  const prompt = buildProjectPrompt({ ...input, attachmentNames: attachments.map((a) => a.name) }, new Date());
  return toProjectPlan(await generateJson(prompt, PROJECT_SCHEMA, model, attachments));
}
