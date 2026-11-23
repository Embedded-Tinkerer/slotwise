// Files the person attaches to an AI request (PDFs, images, text). They are
// read on the phone and sent to Gemini inline with the prompt.

import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import { attachmentMime } from './attachmentTypes';

export interface Attachment {
  name: string;
  mimeType: string;
  size: number;
  /** Base64 file contents. */
  data: string;
}

/** Gemini accepts up to ~20 MB of inline data per request; keep headroom. */
export const MAX_TOTAL_BYTES = 15 * 1024 * 1024;

export { attachmentMime } from './attachmentTypes';

/**
 * Opens the system file picker. Returns the files that can be used and a
 * message about any that were skipped.
 */
export async function pickAttachments(current: Attachment[]): Promise<{ added: Attachment[]; skipped?: string }> {
  const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true, type: '*/*' });
  if (res.canceled) return { added: [] };
  const added: Attachment[] = [];
  const skipped: string[] = [];
  let total = current.reduce((s, a) => s + a.size, 0);
  for (const asset of res.assets) {
    const mime = attachmentMime(asset.name, asset.mimeType);
    if (!mime) {
      skipped.push(`${asset.name} (save Word, Excel or PowerPoint files as PDF first)`);
      continue;
    }
    const size = asset.size ?? 0;
    if (total + size > MAX_TOTAL_BYTES) {
      skipped.push(`${asset.name} (attachments are limited to 15 MB in total)`);
      continue;
    }
    const data = await readBase64(asset);
    total += size || Math.round((data.length * 3) / 4);
    added.push({ name: asset.name, mimeType: mime, size: size || Math.round((data.length * 3) / 4), data });
  }
  return { added, skipped: skipped.length ? `Skipped: ${skipped.join('; ')}` : undefined };
}

async function readBase64(asset: DocumentPicker.DocumentPickerAsset): Promise<string> {
  if (Platform.OS !== 'web') return new File(asset.uri).base64();
  const blob: Blob = asset.file ?? (await (await fetch(asset.uri)).blob());
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}
