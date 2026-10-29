import { Directory, File, Paths } from 'expo-file-system';

import type {
  ReferenceGalleryCatalog,
  ReferenceGallerySourceId,
} from '@/shared/contracts/referenceGallery';

import { referenceGalleryCatalogSchema } from './schemas';

/** Bump when the cached shape changes; a stale file then reads as a miss. */
const CACHE_VERSION = 3;
const MAX_CATALOG_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_FILES = 160;
const MAX_IMAGE_BYTES = 64 * 1024 * 1024;

export type CachedReferenceImage = { uri: string; byteLength: number };

/**
 * The gallery's disposable disk state. A catalog is a validated snapshot; an
 * image is a downloaded file the composer imports on send. Nothing here is
 * canonical, so a failed read is a miss rather than an error.
 */
export type ReferenceGalleryCache = {
  read(source: ReferenceGallerySourceId): Promise<ReferenceGalleryCatalog | undefined>;
  write(catalog: ReferenceGalleryCatalog): void;
  image(
    source: ReferenceGallerySourceId,
    id: string,
    extension: string,
  ): CachedReferenceImage | undefined;
  writeImage(
    source: ReferenceGallerySourceId,
    id: string,
    bytes: Uint8Array,
    extension: string,
  ): CachedReferenceImage;
};

function sourceDirectory(source: ReferenceGallerySourceId): Directory {
  return new Directory(Paths.cache, 'ReferenceGallery', source);
}

function imageDirectory(source: ReferenceGallerySourceId): Directory {
  return new Directory(Paths.cache, 'ReferenceGallery', source, 'images');
}

function catalogFile(source: ReferenceGallerySourceId): File {
  return new File(sourceDirectory(source), `catalog.v${CACHE_VERSION}.json`);
}

export function createReferenceGalleryCache(): ReferenceGalleryCache {
  return {
    async read(source) {
      try {
        const file = catalogFile(source);
        if (!file.exists || file.size > MAX_CATALOG_BYTES) return undefined;
        const parsed = referenceGalleryCatalogSchema.parse(JSON.parse(await file.text()));
        return parsed.source === source ? parsed : undefined;
      } catch {
        // An interrupted write or an OS-purged cache is a miss, not a failure.
        return undefined;
      }
    },

    write(catalog) {
      try {
        const directory = sourceDirectory(catalog.source);
        directory.create({ intermediates: true, idempotent: true });
        const data = JSON.stringify(referenceGalleryCatalogSchema.parse(catalog));
        if (new TextEncoder().encode(data).byteLength > MAX_CATALOG_BYTES) return;
        catalogFile(catalog.source).writeSync(data);
      } catch {
        // Caching is an optimization; a failed write must not fail the request.
      }
    },

    image(source, id, extension) {
      const file = new File(imageDirectory(source), `${id}.${extension}`);
      return file.exists && file.size > 0 ? { uri: file.uri, byteLength: file.size } : undefined;
    },

    writeImage(source, id, bytes, extension) {
      const directory = imageDirectory(source);
      directory.create({ intermediates: true, idempotent: true });
      const file = new File(directory, `${id}.${extension}`);
      file.writeSync(bytes);
      pruneImages(directory);
      return { uri: file.uri, byteLength: file.size };
    },
  };
}

/** Bounds disk retention without evicting the image just written. */
function pruneImages(directory: Directory) {
  try {
    const files = directory
      .list()
      .filter((entry): entry is File => entry instanceof File)
      .sort((left, right) => (right.modificationTime ?? 0) - (left.modificationTime ?? 0));
    let bytes = 0;
    for (const [index, file] of files.entries()) {
      bytes += file.size;
      if (index >= MAX_IMAGE_FILES || bytes > MAX_IMAGE_BYTES) file.delete();
    }
  } catch {
    // Retention is best-effort; the OS evicts Caches regardless.
  }
}
