import {
  ReferenceGalleryError,
  type ReferenceGalleryCatalog,
  type ReferenceGalleryImage,
  type ReferenceGalleryModule,
  type ReferenceGallerySourceId,
} from '@/shared/contracts/referenceGallery';

import { createReferenceGalleryCache, type ReferenceGalleryCache } from './referenceGalleryCache';
import { parseReferenceGalleryPayload } from './schemas';
import {
  isReferenceGallerySourceId,
  REFERENCE_GALLERY_ID_PATTERN,
  REFERENCE_GALLERY_SOURCES,
} from './sources';
import { createReferenceGalleryTransfer, type ReferenceGalleryTransfer } from './transfer';

/** Snapshots are pinned, so a week-old catalog is still a valid one. */
const CATALOG_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type ReferenceGalleryModuleOverrides = {
  cache?: ReferenceGalleryCache;
  transfer?: ReferenceGalleryTransfer;
  now?: () => number;
};

/**
 * The built-in reference galleries. Neither publisher allows redistributing
 * their images, so this module only reads: a small catalog snapshot per
 * source, and one image when the user explicitly picks it.
 */
export function createReferenceGalleryModule(
  overrides: ReferenceGalleryModuleOverrides = {},
): ReferenceGalleryModule {
  const cache = overrides.cache ?? createReferenceGalleryCache();
  const transfer = overrides.transfer ?? createReferenceGalleryTransfer();
  const now = overrides.now ?? Date.now;
  // A second tap on the same tile joins the running download instead of racing it.
  const downloads = new Map<string, Promise<ReferenceGalleryImage>>();

  const download = async (
    source: ReferenceGallerySourceId,
    id: string,
    signal?: AbortSignal,
  ): Promise<ReferenceGalleryImage> => {
    const definition = REFERENCE_GALLERY_SOURCES[source];
    const cached = cache.image(source, id, definition.referenceExtension);
    if (cached) return { ...cached, mediaType: definition.referenceMediaType };

    const key = `${source}:${id}`;
    const running = downloads.get(key);
    if (running) return running;

    const task = (async () => {
      const { bytes, mediaType } = await transfer.fetchReferenceBytes(source, id, signal);
      const stored = cache.writeImage(source, id, bytes, definition.referenceExtension);
      return { ...stored, mediaType };
    })().finally(() => downloads.delete(key));
    downloads.set(key, task);
    return task;
  };

  return {
    async loadCatalog(source, signal) {
      const cached = await cache.read(source);
      if (cached && now() - cached.fetchedAt < CATALOG_TTL_MS) return cached;
      try {
        const entries = parseReferenceGalleryPayload(
          source,
          await transfer.fetchCatalogPayload(source, signal),
        );
        const catalog: ReferenceGalleryCatalog = { source, fetchedAt: now(), entries };
        cache.write(catalog);
        return catalog;
      } catch (error) {
        // A stale snapshot still browses; it beats an empty panel.
        if (cached) return cached;
        throw asGalleryError(error, 'catalog-unavailable');
      }
    },

    async refreshCatalog(source) {
      const entries = parseReferenceGalleryPayload(
        source,
        await transfer.fetchCatalogPayload(source),
      );
      const catalog: ReferenceGalleryCatalog = { source, fetchedAt: now(), entries };
      cache.write(catalog);
      return catalog;
    },

    async downloadReference({ id, source, signal }) {
      if (!isReferenceGallerySourceId(source) || !REFERENCE_GALLERY_ID_PATTERN.test(id))
        throw new ReferenceGalleryError('image-invalid', 'Unknown gallery entry.');
      try {
        return await download(source, id, signal);
      } catch (error) {
        signal?.throwIfAborted();
        throw asGalleryError(error, 'image-unavailable');
      }
    },
  };
}

function asGalleryError(error: unknown, code: 'catalog-unavailable' | 'image-unavailable') {
  return error instanceof ReferenceGalleryError
    ? error
    : new ReferenceGalleryError(code, 'The reference gallery request failed.', { cause: error });
}
