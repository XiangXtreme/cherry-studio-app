import {
  REFERENCE_GALLERY_SOURCES,
  referenceGalleryCatalogUrls,
  referenceGalleryImageUrls,
  referenceGalleryMirrorBase,
  referenceGalleryThumbnailUrl,
  normalizeReferenceGalleryMirror,
} from '../sources';

const MIRROR = 'https://refs.example.com/t/rotating-token/';
const originalMirror = process.env.EXPO_PUBLIC_REFERENCE_GALLERY_MIRROR;

function useMirror(value: string | undefined) {
  if (value === undefined) delete process.env.EXPO_PUBLIC_REFERENCE_GALLERY_MIRROR;
  else process.env.EXPO_PUBLIC_REFERENCE_GALLERY_MIRROR = value;
}

afterEach(() => useMirror(originalMirror));

describe('reference gallery sources', () => {
  it('reads the publishers when no mirror is configured', () => {
    useMirror(undefined);
    expect(referenceGalleryMirrorBase()).toBeUndefined();
    expect(referenceGalleryCatalogUrls(REFERENCE_GALLERY_SOURCES.costume)[0]).toContain(
      'cdn.jsdelivr.net',
    );
    expect(referenceGalleryThumbnailUrl(REFERENCE_GALLERY_SOURCES.costume, 'SPR-0001')).toBe(
      'https://ai-costume-gallery.pages.dev/thumbs/SPR-0001.webp',
    );
    expect(referenceGalleryImageUrls(REFERENCE_GALLERY_SOURCES.costume, 'SPR-0001')).toEqual([
      'https://ai-costume-gallery.pages.dev/img/SPR-0001.webp',
    ]);
  });

  it('puts a configured mirror in front of the publisher everywhere', () => {
    useMirror(MIRROR);
    expect(referenceGalleryMirrorBase()).toBe('https://refs.example.com/t/rotating-token');

    expect(referenceGalleryCatalogUrls(REFERENCE_GALLERY_SOURCES.pose)[0]).toBe(
      'https://refs.example.com/t/rotating-token/pose/catalog.json',
    );
    expect(referenceGalleryThumbnailUrl(REFERENCE_GALLERY_SOURCES.costume, 'SPR-0001')).toBe(
      'https://refs.example.com/t/rotating-token/costume/thumbs/SPR-0001.webp',
    );
    expect(referenceGalleryImageUrls(REFERENCE_GALLERY_SOURCES.pose, 'P001')[0]).toBe(
      'https://refs.example.com/t/rotating-token/pose/img/P001.png',
    );
  });

  it('keeps the publisher behind the mirror as a fallback', () => {
    useMirror(MIRROR);
    expect(referenceGalleryCatalogUrls(REFERENCE_GALLERY_SOURCES.costume)).toHaveLength(3);
    expect(referenceGalleryImageUrls(REFERENCE_GALLERY_SOURCES.pose, 'P001')).toHaveLength(3);
    expect(referenceGalleryCatalogUrls(REFERENCE_GALLERY_SOURCES.costume)[1]).toContain(
      'ai-costume-gallery-zh',
    );
  });

  it('ignores a mirror that is not an HTTPS root', () => {
    useMirror('http://refs.example.com');
    expect(referenceGalleryMirrorBase()).toBeUndefined();
    useMirror('not a url');
    expect(referenceGalleryMirrorBase()).toBeUndefined();
  });

  it('normalizes a stored mirror the same way as the build-time default', () => {
    expect(normalizeReferenceGalleryMirror('  https://refs.example.com/t/token//  ')).toBe(
      'https://refs.example.com/t/token',
    );
    expect(normalizeReferenceGalleryMirror('')).toBeUndefined();
    expect(normalizeReferenceGalleryMirror('https://refs.example.com/')).toBe(
      'https://refs.example.com',
    );
  });

  it('takes an explicit mirror ahead of the build-time default', () => {
    useMirror(MIRROR);
    expect(
      referenceGalleryCatalogUrls(REFERENCE_GALLERY_SOURCES.costume, 'https://runtime.example')[0],
    ).toBe('https://runtime.example/costume/catalog.json');
    expect(
      referenceGalleryThumbnailUrl(
        REFERENCE_GALLERY_SOURCES.pose,
        'P001',
        'https://runtime.example',
      ),
    ).toBe('https://runtime.example/pose/thumbs/P001.jpg');
  });
});
