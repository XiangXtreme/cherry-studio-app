import type { ReferenceGalleryEntry } from '@/shared/contracts/referenceGallery';

/** The file name the conversation's Agent reads, so it carries the item's own title. */
const MAX_BASE_LENGTH = 60;

export function referenceGalleryFileName(entry: ReferenceGalleryEntry, mediaType: string): string {
  const extension =
    mediaType === 'image/webp' ? 'webp' : mediaType === 'image/jpeg' ? 'jpg' : 'png';
  const base = entry.title
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, MAX_BASE_LENGTH)
    .trim();
  return `${base || entry.id}.${extension}`;
}
