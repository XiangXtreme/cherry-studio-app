import {
  ReferenceGalleryError,
  type ReferenceGalleryCatalog,
} from '@/shared/contracts/referenceGallery';

import { createReferenceGalleryModule } from '../createReferenceGalleryModule';
import type { ReferenceGalleryCache } from '../referenceGalleryCache';
import type { ReferenceGalleryTransfer } from '../transfer';

const costumePayload = [
  {
    id: 'SPR-0001',
    分类: '春季',
    服装名称: '针织衫',
    中文描述: '象牙白针织衫',
  },
];

function memoryCache() {
  let stored: ReferenceGalleryCatalog | undefined;
  const images = new Map<string, { uri: string; byteLength: number }>();
  const cache: ReferenceGalleryCache = {
    image: (source, id) => images.get(`${source}:${id}`),
    read: async () => stored,
    write: (catalog) => {
      stored = catalog;
    },
    writeImage: (source, id, bytes) => {
      const value = { uri: `file:///${source}/${id}.webp`, byteLength: bytes.byteLength };
      images.set(`${source}:${id}`, value);
      return value;
    },
  };
  return cache;
}

function fakeTransfer(overrides: Partial<ReferenceGalleryTransfer> = {}) {
  const transfer: ReferenceGalleryTransfer = {
    fetchCatalogPayload: jest.fn(async () => costumePayload),
    fetchReferenceBytes: jest.fn(async () => ({
      bytes: Uint8Array.from([1, 2, 3]),
      mediaType: 'image/webp',
    })),
    ...overrides,
  };
  return transfer;
}

describe('reference gallery module', () => {
  it('caches a fresh catalog instead of refetching it', async () => {
    const transfer = fakeTransfer();
    const gallery = createReferenceGalleryModule({
      cache: memoryCache(),
      now: () => 1000,
      transfer,
    });
    await expect(gallery.loadCatalog('costume')).resolves.toMatchObject({ source: 'costume' });
    await expect(gallery.loadCatalog('costume')).resolves.toMatchObject({ source: 'costume' });
    expect(transfer.fetchCatalogPayload).toHaveBeenCalledTimes(1);
  });

  it('serves a stale catalog when the publisher is unreachable', async () => {
    const cache = memoryCache();
    const now = 1000;
    const gallery = createReferenceGalleryModule({
      cache,
      now: () => now,
      transfer: fakeTransfer(),
    });
    await gallery.loadCatalog('costume');
    const failing = createReferenceGalleryModule({
      cache,
      now: () => 1000 + 30 * 24 * 60 * 60 * 1000,
      transfer: fakeTransfer({
        fetchCatalogPayload: jest.fn(async () => {
          throw new Error('offline');
        }),
      }),
    });
    await expect(failing.loadCatalog('costume')).resolves.toMatchObject({ source: 'costume' });
  });

  it('reports an empty cache plus an unreachable publisher', async () => {
    const gallery = createReferenceGalleryModule({
      cache: memoryCache(),
      transfer: fakeTransfer({
        fetchCatalogPayload: jest.fn(async () => {
          throw new Error('offline');
        }),
      }),
    });
    await expect(gallery.loadCatalog('costume')).rejects.toMatchObject({
      code: 'catalog-unavailable',
    });
  });

  it('refreshes past a warm cache', async () => {
    const transfer = fakeTransfer();
    const gallery = createReferenceGalleryModule({ cache: memoryCache(), transfer });
    await gallery.loadCatalog('costume');
    await gallery.refreshCatalog('costume');
    expect(transfer.fetchCatalogPayload).toHaveBeenCalledTimes(2);
  });

  it('reuses a downloaded reference and shares one running download', async () => {
    const cache = memoryCache();
    const transfer = fakeTransfer();
    const gallery = createReferenceGalleryModule({ cache, transfer });
    const [first, second] = await Promise.all([
      gallery.downloadReference({ id: 'SPR-0001', source: 'costume' }),
      gallery.downloadReference({ id: 'SPR-0001', source: 'costume' }),
    ]);
    expect(first).toEqual(second);
    expect(transfer.fetchReferenceBytes).toHaveBeenCalledTimes(1);
    await expect(
      gallery.downloadReference({ id: 'SPR-0001', source: 'costume' }),
    ).resolves.toMatchObject({ mediaType: 'image/webp' });
    expect(transfer.fetchReferenceBytes).toHaveBeenCalledTimes(1);
  });

  it('rejects an id that could escape the cache directory', async () => {
    const transfer = fakeTransfer();
    const gallery = createReferenceGalleryModule({ cache: memoryCache(), transfer });
    await expect(
      gallery.downloadReference({ id: '../secret', source: 'costume' }),
    ).rejects.toBeInstanceOf(ReferenceGalleryError);
    expect(transfer.fetchReferenceBytes).not.toHaveBeenCalled();
  });

  it('rebuilds thumbnails from the current mirror, even for a cached catalog', async () => {
    const cache = memoryCache();
    let mirror: string | undefined;
    const gallery = createReferenceGalleryModule({
      cache,
      mirror: () => mirror,
      transfer: fakeTransfer(),
    });
    const published = await gallery.loadCatalog('costume');
    expect(published.entries[0]?.thumbUrl).toBe(
      'https://ai-costume-gallery.pages.dev/thumbs/SPR-0001.webp',
    );

    mirror = 'https://refs.example.com/t/token';
    const mirrored = await gallery.loadCatalog('costume');
    expect(mirrored.entries[0]?.thumbUrl).toBe(
      'https://refs.example.com/t/token/costume/thumbs/SPR-0001.webp',
    );
  });

  it('wraps a failed download', async () => {
    const gallery = createReferenceGalleryModule({
      cache: memoryCache(),
      transfer: fakeTransfer({
        fetchReferenceBytes: jest.fn(async () => {
          throw new Error('network');
        }),
      }),
    });
    await expect(
      gallery.downloadReference({ id: 'SPR-0001', source: 'costume' }),
    ).rejects.toMatchObject({ code: 'image-unavailable' });
  });
});
