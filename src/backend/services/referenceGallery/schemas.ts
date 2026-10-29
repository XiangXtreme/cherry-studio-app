import * as z from 'zod';

import {
  ReferenceGalleryError,
  type ReferenceGalleryEntry,
  type ReferenceGallerySourceId,
} from '@/shared/contracts/referenceGallery';

import {
  REFERENCE_GALLERY_ID_PATTERN,
  REFERENCE_GALLERY_SOURCES,
  referenceGalleryThumbnailUrl,
} from './sources';

/** Larger than today's 1,407 / 1,439 so a publisher's growth is not an outage. */
const MAX_CATALOG_ENTRIES = 6000;

/** The entry shape as cached and as read by the app; kept strict on purpose. */
export const referenceGalleryEntrySchema = z.object({
  id: z.string().regex(REFERENCE_GALLERY_ID_PATTERN),
  source: z.enum(['costume', 'pose']),
  title: z.string().max(160),
  description: z.string().max(600),
  category: z.string().max(60),
  group: z.string().max(60).optional(),
  angle: z.string().max(24).optional(),
  thumbUrl: z.string(),
});

export const referenceGalleryCatalogSchema = z.object({
  source: z.enum(['costume', 'pose']),
  fetchedAt: z.number().int().nonnegative(),
  entries: z.array(referenceGalleryEntrySchema).max(MAX_CATALOG_ENTRIES),
});

const costumeCatalogSchema = z
  .array(
    z.object({
      id: z.string(),
      分类: z.string().trim().min(1).max(60),
      服装名称: z.string().trim().min(1).max(160),
      中文描述: z.string().trim().max(600).optional().default(''),
      英文关键词: z.string().trim().max(600).optional().default(''),
    }),
  )
  .max(MAX_CATALOG_ENTRIES);

const poseCatalogSchema = z
  .array(
    z.object({
      id: z.string(),
      体系: z.string().trim().min(1).max(60),
      分类: z.string().trim().min(1).max(60),
      姿势名称: z.string().trim().min(1).max(160),
      角度: z.string().trim().min(1).max(24),
    }),
  )
  .max(MAX_CATALOG_ENTRIES);

/**
 * Validates a publisher snapshot and maps it onto the app's entry shape.
 * Malformed rows are dropped individually; a catalog with no usable row is
 * rejected, because an empty tab reads as a broken feature.
 */
export function parseReferenceGalleryPayload(
  sourceId: ReferenceGallerySourceId,
  payload: unknown,
): ReferenceGalleryEntry[] {
  const source = REFERENCE_GALLERY_SOURCES[sourceId];
  const entries: ReferenceGalleryEntry[] = [];
  const seen = new Set<string>();
  try {
    if (sourceId === 'costume') {
      for (const item of costumeCatalogSchema.parse(payload)) {
        const id = item.id.trim();
        if (!REFERENCE_GALLERY_ID_PATTERN.test(id) || seen.has(id)) continue;
        seen.add(id);
        entries.push({
          id,
          source: sourceId,
          title: item.服装名称,
          description: item.中文描述 || item.英文关键词 || item.服装名称,
          category: item.分类,
          thumbUrl: referenceGalleryThumbnailUrl(source, id),
        });
      }
    } else {
      for (const item of poseCatalogSchema.parse(payload)) {
        const id = item.id.trim();
        if (!REFERENCE_GALLERY_ID_PATTERN.test(id) || seen.has(id)) continue;
        seen.add(id);
        entries.push({
          id,
          source: sourceId,
          title: item.姿势名称,
          description: `${item.分类} · ${item.体系}`,
          category: item.分类,
          group: item.体系,
          angle: item.角度,
          thumbUrl: referenceGalleryThumbnailUrl(source, id),
        });
      }
    }
  } catch (error) {
    throw new ReferenceGalleryError('catalog-invalid', 'The gallery catalog could not be read.', {
      cause: error,
    });
  }
  if (entries.length === 0)
    throw new ReferenceGalleryError('catalog-invalid', 'The gallery catalog was empty.');
  return entries;
}
