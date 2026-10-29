import { useToast } from '@cherrystudio/ui/components';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  useComposerActions,
  useComposerMeta,
  useComposerState,
} from '@/frontend/components/Composer';
import { createPhotoAttachmentDraft } from '@/frontend/components/Composer/utils/composerAttachments';
import { useBackendModule } from '@/frontend/data';
import type { ReferenceGalleryEntry } from '@/shared/contracts/referenceGallery';

import { referenceGalleryFileName } from '../utils/referenceGalleryFileName';

/** Attachment ids the panel owns; the composer's list is the single source of truth. */
export const REFERENCE_GALLERY_ATTACHMENT_PREFIX = 'reference-gallery:';

/** Enough for an outfit plus a couple of poses without flooding the message. */
export const MAX_REFERENCE_GALLERY_ATTACHMENTS = 4;

export function referenceGalleryAttachmentId(
  entry: Pick<ReferenceGalleryEntry, 'id' | 'source'>,
): string {
  return `${REFERENCE_GALLERY_ATTACHMENT_PREFIX}${entry.source}:${entry.id}`;
}

/**
 * Toggling a tile adds or removes a composer attachment. The attachment is a
 * transient source, so nothing reaches managed storage unless the user sends;
 * the Agent then receives the reference as an ordinary image attachment.
 */
export function useReferenceGalleryAttachments() {
  const gallery = useBackendModule('referenceGallery');
  const { attachments, draft } = useComposerState();
  const { addAttachments, removeAttachment } = useComposerActions();
  const { inputRef } = useComposerMeta();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [pendingId, setPendingId] = useState<string>();

  const attachedIds = useMemo(
    () =>
      new Set(
        attachments
          .filter((attachment) => attachment.id.startsWith(REFERENCE_GALLERY_ATTACHMENT_PREFIX))
          .map((attachment) => attachment.id),
      ),
    [attachments],
  );

  const insertDescription = useCallback(
    (entry: ReferenceGalleryEntry) => {
      const line = t(
        entry.source === 'costume'
          ? 'chat.referenceGallery.costumeDescription'
          : 'chat.referenceGallery.poseDescription',
        { angle: entry.angle ?? '', name: entry.title },
      );
      // The id is what an image tool resolves without a binary channel: the
      // conversation is the only place the model can carry it from.
      const reference = t('chat.referenceGallery.referenceTag', {
        reference: `${entry.source}:${entry.id}`,
      });
      if (draft.includes(reference)) return;
      const separator = draft.trim().length > 0 ? '\n' : '';
      inputRef.current?.insertText(`${separator}${line}\n${reference}`);
    },
    [draft, inputRef, t],
  );

  const toggle = useCallback(
    async (entry: ReferenceGalleryEntry, options: { writeDescription: boolean }) => {
      const id = referenceGalleryAttachmentId(entry);
      if (attachedIds.has(id)) {
        removeAttachment(id);
        return;
      }
      if (attachedIds.size >= MAX_REFERENCE_GALLERY_ATTACHMENTS) {
        toast.show({
          label: t('chat.referenceGallery.limitReached', {
            count: MAX_REFERENCE_GALLERY_ATTACHMENTS,
          }),
          variant: 'warning',
        });
        return;
      }
      if (pendingId) return;
      setPendingId(id);
      try {
        const image = await gallery.downloadReference({ id: entry.id, source: entry.source });
        addAttachments([
          {
            ...createPhotoAttachmentDraft({
              fileName: referenceGalleryFileName(entry, image.mediaType),
              id,
              uri: image.uri,
            }),
            id,
            mediaType: image.mediaType,
            size: image.byteLength,
          },
        ]);
        if (options.writeDescription) insertDescription(entry);
      } catch {
        toast.show({ label: t('chat.referenceGallery.downloadFailed'), variant: 'danger' });
      } finally {
        setPendingId(undefined);
      }
    },
    [
      addAttachments,
      attachedIds,
      gallery,
      insertDescription,
      pendingId,
      removeAttachment,
      t,
      toast,
    ],
  );

  return {
    attachedIds,
    isFull: attachedIds.size >= MAX_REFERENCE_GALLERY_ATTACHMENTS,
    pendingId,
    toggle,
  };
}
