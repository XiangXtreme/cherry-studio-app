import type { ReferenceGalleryCatalog } from '@/shared/contracts/referenceGallery';

import { createReferenceGalleryCache } from '../referenceGalleryCache';

const mockFiles = new Map<string, { bytes: Uint8Array; time: number }>();
const mockDirectories = new Set<string>();
let mockTime = 1;

jest.mock('expo-file-system', () => {
  const join = (parts: (string | { uri: string })[]) =>
    parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(parts);
    }
    get name() {
      return this.uri.split('/').at(-1)!;
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    get size() {
      return mockFiles.get(this.uri)?.bytes.byteLength ?? 0;
    }
    get modificationTime() {
      return mockFiles.get(this.uri)?.time ?? null;
    }
    text() {
      return Promise.resolve(new TextDecoder().decode(mockFiles.get(this.uri)!.bytes));
    }
    writeSync(content: string | Uint8Array) {
      const bytes =
        typeof content === 'string' ? new TextEncoder().encode(content) : new Uint8Array(content);
      mockFiles.set(this.uri, { bytes, time: mockTime++ });
    }
    delete() {
      mockFiles.delete(this.uri);
    }
  }
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(parts);
    }
    get exists() {
      return mockDirectories.has(this.uri);
    }
    create() {
      mockDirectories.add(this.uri);
    }
    list() {
      return [...mockFiles.keys()]
        .filter((uri) => uri.startsWith(this.uri + '/'))
        .map((uri) => new File(uri));
    }
  }
  return { Directory, File, Paths: { cache: { uri: 'cache' } } };
});

const catalog: ReferenceGalleryCatalog = {
  entries: [
    {
      category: '春季',
      description: '描述',
      id: 'SPR-0001',
      source: 'costume',
      thumbUrl: 'https://example.test/thumbs/SPR-0001.webp',
      title: '名称',
    },
  ],
  fetchedAt: 1_700_000_000_000,
  source: 'costume',
};

describe('reference gallery cache', () => {
  beforeEach(() => {
    mockFiles.clear();
    mockDirectories.clear();
  });

  it('round-trips a validated catalog', async () => {
    const cache = createReferenceGalleryCache();
    cache.write(catalog);
    await expect(cache.read('costume')).resolves.toEqual(catalog);
    await expect(cache.read('pose')).resolves.toBeUndefined();
  });

  it('treats a damaged snapshot as a miss', async () => {
    const cache = createReferenceGalleryCache();
    cache.write(catalog);
    const key = [...mockFiles.keys()].find((uri) => uri.includes('catalog.v'));
    mockFiles.set(key!, { bytes: new TextEncoder().encode('{'), time: mockTime++ });
    await expect(cache.read('costume')).resolves.toBeUndefined();
  });
});
