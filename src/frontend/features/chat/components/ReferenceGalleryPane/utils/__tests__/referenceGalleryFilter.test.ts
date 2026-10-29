import type { ReferenceGalleryEntry } from '@/shared/contracts/referenceGallery';

import {
  filterReferenceGalleryEntries,
  referenceGalleryCategories,
} from '../referenceGalleryFilter';

const entry = (overrides: Partial<ReferenceGalleryEntry>): ReferenceGalleryEntry => ({
  category: '春季',
  description: '',
  id: 'SPR-0001',
  source: 'costume',
  thumbUrl: 'https://example.test/thumbs/SPR-0001.webp',
  title: '象牙白荷叶边针织衫',
  ...overrides,
});

describe('reference gallery filtering', () => {
  const entries = [
    entry({ description: '象牙白针织衫、牛仔裙' }),
    entry({ category: '夏季', id: 'SUM-0007', title: '黄色碎花吊带衫' }),
    entry({ angle: '正面', category: '站姿', id: 'P001', source: 'pose', title: 'S形站姿' }),
  ];

  it('matches titles, descriptions, and ids', () => {
    expect(filterReferenceGalleryEntries(entries, { query: '碎花' })).toHaveLength(1);
    expect(filterReferenceGalleryEntries(entries, { query: '牛仔' })).toHaveLength(1);
    expect(filterReferenceGalleryEntries(entries, { query: 'p001' })).toHaveLength(1);
  });

  it('requires every term, case-insensitively', () => {
    expect(filterReferenceGalleryEntries(entries, { query: '象牙白 针织衫' })).toHaveLength(1);
    expect(filterReferenceGalleryEntries(entries, { query: '象牙白 碎花' })).toHaveLength(0);
  });

  it('composes a category with the query', () => {
    expect(filterReferenceGalleryEntries(entries, { category: '夏季', query: '' })).toHaveLength(1);
    expect(
      filterReferenceGalleryEntries(entries, { category: '夏季', query: '针织' }),
    ).toHaveLength(0);
  });

  it('counts categories in catalog order', () => {
    expect(referenceGalleryCategories(entries)).toEqual([
      { category: '春季', count: 1 },
      { category: '夏季', count: 1 },
      { category: '站姿', count: 1 },
    ]);
  });
});
