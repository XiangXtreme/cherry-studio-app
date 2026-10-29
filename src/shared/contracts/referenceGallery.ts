/**
 * The two curated galleries shown beside a chat as photographic references.
 *
 * Images are third-party works: they are read from their publishers at request
 * time and never bundled with the app. Only the catalog metadata is cached.
 */
export type ReferenceGallerySourceId = 'costume' | 'pose';

/** One selectable reference: a costume or a pose, already safe to render. */
export type ReferenceGalleryEntry = {
  /** Stable upstream id; also the image file name, so it is validated as one. */
  id: string;
  source: ReferenceGallerySourceId;
  /** Costume title or pose name, in the gallery's own language. */
  title: string;
  /** Upstream description, used when the caller offers to write a prompt line. */
  description: string;
  category: string;
  /** Pose galleries group poses into a system; costumes leave it empty. */
  group?: string;
  /** Pose viewing angle; absent for costumes. */
  angle?: string;
  /** Remote thumbnail, owned by expo-image's disk cache rather than ours. */
  thumbUrl: string;
};

export type ReferenceGalleryCatalog = {
  source: ReferenceGallerySourceId;
  /** When this snapshot was retrieved, for the cache's freshness check. */
  fetchedAt: number;
  entries: readonly ReferenceGalleryEntry[];
};

export type ReferenceGalleryErrorCode =
  | 'catalog-unavailable'
  | 'catalog-invalid'
  | 'image-unavailable'
  | 'image-invalid';

export class ReferenceGalleryError extends Error {
  constructor(
    readonly code: ReferenceGalleryErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ReferenceGalleryError';
  }
}

export function isReferenceGalleryError(error: unknown): error is ReferenceGalleryError {
  return error instanceof ReferenceGalleryError;
}

export type ReferenceGalleryImage = {
  /** Cached file URI, handed to the composer as a transient attachment source. */
  uri: string;
  mediaType: string;
  byteLength: number;
};

export interface ReferenceGalleryModule {
  /**
   * Cached catalog, refreshed when it is older than the module's TTL. A failed
   * refresh keeps serving the stale snapshot; only an empty cache throws.
   */
  loadCatalog(
    source: ReferenceGallerySourceId,
    signal?: AbortSignal,
  ): Promise<ReferenceGalleryCatalog>;
  /** Ignores the cache and contacts the publisher; the retry path for errors. */
  refreshCatalog(source: ReferenceGallerySourceId): Promise<ReferenceGalleryCatalog>;
  /** Downloads and validates one reference image into the cache. */
  downloadReference(input: {
    id: string;
    source: ReferenceGallerySourceId;
    signal?: AbortSignal;
  }): Promise<ReferenceGalleryImage>;
}
