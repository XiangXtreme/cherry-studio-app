import { useState } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ComposerAttachmentDraft } from '@/frontend/components/Composer/utils/composerAttachments';
import type { ReferenceGalleryEntry } from '@/shared/contracts/referenceGallery';

import { useReferenceGalleryAttachments } from '../useReferenceGalleryAttachments';

let mockAttachments: ComposerAttachmentDraft[] = [];
let mockDraft = '';
const mockInsertText = jest.fn();
const mockToastShow = jest.fn();
const mockDownload = jest.fn();

jest.mock('@/frontend/data', () => ({
  useBackendModule: () => ({ downloadReference: (...args: unknown[]) => mockDownload(...args) }),
}));
jest.mock('@/frontend/components/Composer', () => ({
  useComposerActions: () => ({
    addAttachments: (next: ComposerAttachmentDraft[]) => {
      mockAttachments = [...mockAttachments, ...next];
    },
    removeAttachment: (id: string) => {
      mockAttachments = mockAttachments.filter((attachment) => attachment.id !== id);
    },
  }),
  useComposerMeta: () => ({ inputRef: { current: { insertText: mockInsertText } } }),
  useComposerState: () => ({ attachments: mockAttachments, draft: mockDraft }),
}));
jest.mock('@/frontend/components/Composer/utils/composerAttachments', () => ({
  createPhotoAttachmentDraft: ({
    fileName,
    id,
    uri,
  }: {
    fileName: string;
    id: string;
    uri: string;
  }) => ({ id: `photo:${id}`, kind: 'image', mediaType: 'image/webp', name: fileName, uri }),
}));
jest.mock('@cherrystudio/ui/components', () => ({
  useToast: () => ({ toast: { show: mockToastShow } }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name?: string; reference?: string }) =>
      options ? `${key}:${options.name ?? options.reference ?? ''}` : key,
  }),
}));

const entry = (id: string, title = '针织衫', source: ReferenceGalleryEntry['source'] = 'costume') =>
  ({
    category: '春季',
    description: '描述',
    id,
    source,
    thumbUrl: `https://example.test/thumbs/${id}.webp`,
    title,
  }) satisfies ReferenceGalleryEntry;

const galleryAttachment = (id: string): ComposerAttachmentDraft => ({
  fileEntryId: id as never,
  id: `reference-gallery:costume:${id}`,
  kind: 'image',
  mediaType: 'image/webp',
  name: '参考.webp',
  status: 'ready',
  uri: `file:///cache/${id}.webp`,
});

describe('reference gallery attachments', () => {
  let renderer: ReactTestRenderer;
  let result: ReturnType<typeof useReferenceGalleryAttachments>;
  let rerender: () => void;

  function Probe() {
    const [, force] = useState(0);
    rerender = () => force((value) => value + 1);
    result = useReferenceGalleryAttachments();
    return null;
  }

  beforeEach(() => {
    mockAttachments = [];
    mockDraft = '';
    mockInsertText.mockReset();
    mockToastShow.mockReset();
    mockDownload.mockReset();
    mockDownload.mockResolvedValue({
      byteLength: 93,
      mediaType: 'image/webp',
      uri: 'file:///cache/SPR-0001.webp',
    });
    act(() => {
      renderer = create(<Probe />);
    });
  });

  afterEach(() => act(() => renderer.unmount()));

  it('adds a namespaced attachment named after the item', async () => {
    await act(async () => {
      await result.toggle(entry('SPR-0001'), { writeDescription: false });
    });
    expect(mockDownload).toHaveBeenCalledWith({ id: 'SPR-0001', source: 'costume' });
    expect(mockAttachments).toHaveLength(1);
    expect(mockAttachments[0]).toMatchObject({
      id: 'reference-gallery:costume:SPR-0001',
      kind: 'image',
      mediaType: 'image/webp',
      name: '针织衫.webp',
      uri: 'file:///cache/SPR-0001.webp',
    });
    expect(mockInsertText).not.toHaveBeenCalled();
  });

  it('removes the same attachment when the tile is tapped again', async () => {
    await act(async () => {
      await result.toggle(entry('SPR-0001'), { writeDescription: false });
    });
    act(() => rerender());
    await act(async () => {
      await result.toggle(entry('SPR-0001'), { writeDescription: false });
    });
    expect(mockAttachments).toHaveLength(0);
    expect(mockDownload).toHaveBeenCalledTimes(1);
  });

  it('writes the localized description once when asked', async () => {
    mockDraft = '把人物换成这套衣服';
    act(() => rerender());
    await act(async () => {
      await result.toggle(entry('SPR-0001'), { writeDescription: true });
    });
    expect(mockInsertText).toHaveBeenCalledWith(
      '\nchat.referenceGallery.costumeDescription:针织衫\nchat.referenceGallery.referenceTag:costume:SPR-0001',
    );

    // Removing and re-adding the same reference must not duplicate the lines.
    mockInsertText.mockReset();
    mockDraft = '已有 chat.referenceGallery.referenceTag:costume:SPR-0001';
    act(() => rerender());
    await act(async () => {
      await result.toggle(entry('SPR-0001'), { writeDescription: true });
    });
    act(() => rerender());
    await act(async () => {
      await result.toggle(entry('SPR-0001'), { writeDescription: true });
    });
    expect(mockInsertText).not.toHaveBeenCalled();
  });

  it('stops at the attachment limit', async () => {
    mockAttachments = ['a', 'b', 'c', 'd'].map(galleryAttachment);
    act(() => rerender());
    await act(async () => {
      await result.toggle(entry('SPR-0009'), { writeDescription: false });
    });
    expect(mockDownload).not.toHaveBeenCalled();
    expect(mockToastShow).toHaveBeenCalledWith(
      expect.objectContaining({ label: expect.any(String), variant: 'warning' }),
    );
  });

  it('reports a failed download without attaching anything', async () => {
    mockDownload.mockRejectedValue(new Error('network'));
    await act(async () => {
      await result.toggle(entry('SPR-0001'), { writeDescription: false });
    });
    expect(mockAttachments).toHaveLength(0);
    expect(mockToastShow).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'chat.referenceGallery.downloadFailed', variant: 'danger' }),
    );
  });
});
