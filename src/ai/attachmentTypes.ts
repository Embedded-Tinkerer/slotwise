// Which attached files Gemini can read inline. Pure TypeScript, unit tested.

const BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  html: 'text/html',
  xml: 'text/xml',
  py: 'text/x-python',
  js: 'text/javascript',
  ts: 'text/plain',
  c: 'text/plain',
  h: 'text/plain',
  cpp: 'text/plain',
  rtf: 'text/rtf',
};

const SUPPORTED = /^(application\/pdf|image\/(png|jpeg|webp|heic|heif)|text\/.+|application\/json)$/;

/** MIME type to send for a file, or null if Gemini can't read it inline. */
export function attachmentMime(name: string, mimeType?: string): string | null {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  const fromExt = BY_EXT[ext];
  if (mimeType && SUPPORTED.test(mimeType)) return mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
  if (fromExt) return fromExt;
  return null;
}
