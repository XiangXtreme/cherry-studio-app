import { fetch } from 'expo/fetch';

import { inspectImage } from '@/backend/utils/imageInspection';
import type { DocumentExportIssue, ExportDocument } from '@/shared/contracts/documentExport';

import { safeExportUrl } from './normalizeDocument';

export type PreparedAsset = { dataUrl: string };
export type ReadManagedImage = (id: string, signal: AbortSignal) => Promise<Uint8Array>;

export async function resolveDocumentAssets(
  sources: ReadonlyMap<string, NonNullable<ExportDocument['assets']>[string]>,
  cache: Map<string, PreparedAsset>,
  readManagedImage: ReadManagedImage,
  signal: AbortSignal,
): Promise<{ images: Map<string, string>; issues: DocumentExportIssue[] }> {
  const images = new Map<string, string>();
  const issues: DocumentExportIssue[] = [];
  for (const [key, source] of sources) {
    signal.throwIfAborted();
    try {
      let asset = cache.get(key);
      if (!asset) {
        const bytes =
          source.kind === 'managed-file'
            ? await readManagedImage(source.fileEntryId, signal)
            : await fetchImage(source.url, signal);
        signal.throwIfAborted();
        const { width, height, mediaType } = inspectImage(bytes);
        if (width < 1 || height < 1) throw new Error('Invalid image dimensions');
        // Admit valid source images at their original size; device allocation decides capacity.
        asset = {
          dataUrl: `data:${mediaType};base64,${encodeBase64(bytes)}`,
        };
        cache.set(key, asset);
      }
      images.set(key, asset.dataUrl);
    } catch {
      signal.throwIfAborted();
      // Failed resources stay retryable; no private file paths or URLs in diagnostic copy.
      issues.push({ code: 'image-unavailable', label: 'Image' });
    }
  }
  return { images, issues };
}

async function fetchImage(value: string, signal: AbortSignal): Promise<Uint8Array> {
  const url = safeExportUrl(value);
  if (!url?.startsWith('https://') && !url?.startsWith('http://'))
    throw new Error('Invalid image URL');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 15_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    signal.throwIfAborted();
    const response = await fetch(url, {
      credentials: 'omit',
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('Image unavailable');
    reader = response.body?.getReader();
    if (!reader) throw new Error('Image stream unavailable');
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      controller.signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      chunks.push(chunk.value);
    }
    controller.signal.throwIfAborted();
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } finally {
    if (reader) await reader.cancel().catch(() => {});
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    controller.abort();
  }
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
