import type { ReferenceGalleryEntry } from '@/shared/contracts/referenceGallery';

import { referenceGalleryFileName } from '../referenceGalleryFileName';

const entry = (title: string): ReferenceGalleryEntry => ({
  category: '春季',
  description: '',
  id: 'SPR-0001',
  source: 'costume',
  thumbUrl: 'https://example.test/thumbs/SPR-0001.webp',
  title,
});

describe('reference gallery file names', () => {
  it('carries the item title and the image extension', () => {
    expect(referenceGalleryFileName(entry('象牙白针织衫'), 'image/webp')).toBe('象牙白针织衫.webp');
    expect(referenceGalleryFileName(entry('S形站姿'), 'image/png')).toBe('S形站姿.png');
  });

  it('removes characters a file name cannot hold', () => {
    expect(referenceGalleryFileName(entry('a/b:c*d?e"f<g>h|i'), 'image/png')).toBe(
      'a b c d e f g h i.png',
    );
  });

  it('bounds the length and never returns an empty base', () => {
    expect(referenceGalleryFileName(entry('长'.repeat(200)), 'image/png')).toHaveLength(64);
    expect(referenceGalleryFileName(entry('  '), 'image/png')).toBe('SPR-0001.png');
  });
});
