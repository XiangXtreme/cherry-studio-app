import { ReferenceGalleryError } from '@/shared/contracts/referenceGallery';

import { parseReferenceGalleryPayload } from '../schemas';

const costume = [
  {
    id: 'SPR-0001',
    分类: '春季',
    服装名称: '象牙白荷叶边针织衫 · 牛仔迷你半身裙',
    中文描述: '象牙白荷叶边针织衫、牛仔迷你半身裙',
    英文关键词: 'ivory frill knit',
  },
];

const pose = [
  {
    id: 'full_sexy_P001_front',
    体系: '全身单人・性感系',
    分类: '站姿',
    姿势名称: 'S形站姿・胯部侧顶',
    角度: '正面',
  },
];

describe('reference gallery catalog payload', () => {
  it('maps a costume snapshot onto entries with publisher thumbnails', () => {
    const [entry] = parseReferenceGalleryPayload('costume', costume);
    expect(entry).toMatchObject({
      category: '春季',
      description: '象牙白荷叶边针织衫、牛仔迷你半身裙',
      id: 'SPR-0001',
      source: 'costume',
      thumbUrl: 'https://ai-costume-gallery.pages.dev/thumbs/SPR-0001.webp',
      title: '象牙白荷叶边针织衫 · 牛仔迷你半身裙',
    });
    expect(entry.group).toBeUndefined();
  });

  it('keeps the pose system and angle', () => {
    const [entry] = parseReferenceGalleryPayload('pose', pose);
    expect(entry).toMatchObject({
      angle: '正面',
      group: '全身单人・性感系',
      id: 'full_sexy_P001_front',
      source: 'pose',
      thumbUrl: 'https://ai-pose-gallery.anhao.app/thumbs/full_sexy_P001_front.jpg',
    });
  });

  it('drops unusable rows but keeps the rest', () => {
    const entries = parseReferenceGalleryPayload('costume', [
      ...costume,
      { ...costume[0], id: '../../etc/passwd' },
      costume[0],
    ]);
    expect(entries).toHaveLength(1);
  });

  it('rejects an unreadable or empty snapshot', () => {
    expect(() => parseReferenceGalleryPayload('costume', 'not a catalog')).toThrow(
      ReferenceGalleryError,
    );
    expect(() => parseReferenceGalleryPayload('costume', [])).toThrow(ReferenceGalleryError);
  });
});
