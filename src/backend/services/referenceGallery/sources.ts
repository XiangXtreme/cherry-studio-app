import type { ReferenceGallerySourceId } from '@/shared/contracts/referenceGallery';

/**
 * Where each built-in gallery is read from. Catalogs are pinned to a commit so
 * the ids an entry shows keep matching the publisher's images; bump both the
 * commit and this comment together.
 *
 * Neither publisher's terms allow redistributing the image data, so nothing
 * here is bundled: the catalogs are small JSON snapshots and every image is
 * fetched on the user's explicit request.
 */
export type ReferenceGallerySource = {
  id: ReferenceGallerySourceId;
  /** Snapshot URLs, in fallback order. */
  catalogUrls: readonly string[];
  /** Image origins (optionally including a repository path), in fallback order. */
  imageBaseUrls: readonly string[];
  thumbnailPath(id: string): string;
  referencePath(id: string): string;
  /** Container of the full-size reference used for image edit requests. */
  referenceExtension: 'png' | 'webp';
  referenceMediaType: string;
};

const COSTUME_COMMIT = 'c2464f6523c82a71b1c5498e9da6ce2b7882c77e';
const POSE_COMMIT = '072a3690af6e7e0011abbe0fa1ccc08939fbb47d';

export const REFERENCE_GALLERY_SOURCES: Record<ReferenceGallerySourceId, ReferenceGallerySource> = {
  costume: {
    id: 'costume',
    catalogUrls: [
      `https://cdn.jsdelivr.net/gh/haojunsun/ai-costume-gallery-zh@${COSTUME_COMMIT}/data/costume-zh.json`,
      `https://raw.githubusercontent.com/haojunsun/ai-costume-gallery-zh/${COSTUME_COMMIT}/data/costume-zh.json`,
    ],
    imageBaseUrls: ['https://ai-costume-gallery.pages.dev'],
    thumbnailPath: (id) => `/thumbs/${id}.webp`,
    // The WebP preview is ~93 KB against a ~1.1 MB PNG; the model downsizes anyway.
    referencePath: (id) => `/img/${id}.webp`,
    referenceExtension: 'webp',
    referenceMediaType: 'image/webp',
  },
  pose: {
    id: 'pose',
    catalogUrls: [
      'https://ai-pose-gallery.anhao.app/data/pose-zh.json',
      `https://cdn.jsdelivr.net/gh/anhao/ai-pose-gallery-zh@${POSE_COMMIT}/data/pose-zh.json`,
    ],
    imageBaseUrls: [
      'https://ai-pose-gallery.anhao.app',
      `https://raw.githubusercontent.com/anhao/ai-pose-gallery-zh/${POSE_COMMIT}`,
    ],
    thumbnailPath: (id) => `/thumbs/${id}.jpg`,
    referencePath: (id) => `/img/${id}.png`,
    referenceExtension: 'png',
    referenceMediaType: 'image/png',
  },
};

/**
 * Optional self-hosted mirror in front of both publishers, for a deployment
 * that keeps the images next to its own model endpoint. The value is a root,
 * optionally carrying a path token (`https://refs.example.com/t/<token>`), and
 * the mirror answers `<mirror>/<source>/catalog.json`,
 * `<mirror>/<source>/thumbs/<id>.<ext>`, and `<mirror>/<source>/img/<id>.<ext>`.
 * A missing or non-HTTPS value is ignored, and the publisher stays behind every
 * URL as a fallback, so an unreachable mirror degrades instead of failing.
 */
export function normalizeReferenceGalleryMirror(
  value: string | undefined | null,
): string | undefined {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return undefined;
  try {
    if (new URL(trimmed).protocol !== 'https:') return undefined;
  } catch {
    return undefined;
  }
  return trimmed.replace(/\/+$/, '');
}

/** Build-time default; the app also stores a mirror the user edits at runtime. */
export function referenceGalleryMirrorBase(): string | undefined {
  return normalizeReferenceGalleryMirror(process.env.EXPO_PUBLIC_REFERENCE_GALLERY_MIRROR);
}

/** Ids become file names and URL segments, so they are constrained before use. */
export const REFERENCE_GALLERY_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function isReferenceGallerySourceId(value: unknown): value is ReferenceGallerySourceId {
  return value === 'costume' || value === 'pose';
}

/** Snapshot URLs in fallback order; a configured mirror is tried first. */
export function referenceGalleryCatalogUrls(
  source: ReferenceGallerySource,
  mirror = referenceGalleryMirrorBase(),
): readonly string[] {
  return mirror
    ? [`${mirror}/${source.id}/catalog.json`, ...source.catalogUrls]
    : [...source.catalogUrls];
}

export function referenceGalleryThumbnailUrl(
  source: ReferenceGallerySource,
  id: string,
  mirror = referenceGalleryMirrorBase(),
): string {
  return mirror
    ? `${mirror}/${source.id}${source.thumbnailPath(id)}`
    : `${source.imageBaseUrls[0]}${source.thumbnailPath(id)}`;
}

/** Candidate image URLs in fallback order; the caller tries them in sequence. */
export function referenceGalleryImageUrls(
  source: ReferenceGallerySource,
  id: string,
  mirror = referenceGalleryMirrorBase(),
): string[] {
  const published = source.imageBaseUrls.map((base) => `${base}${source.referencePath(id)}`);
  return mirror ? [`${mirror}/${source.id}${source.referencePath(id)}`, ...published] : published;
}

/**
 * A publisher URL split into the transport's immutable base and a relative
 * path. Absolute paths are never passed to the transport, so a published
 * redirect cannot move the request to another authority.
 */
export function splitPublisherUrl(url: string): { baseUrl: string; path: string } {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('Reference gallery sources must use HTTPS.');
  return { baseUrl: parsed.origin, path: `${parsed.pathname}${parsed.search}` };
}
