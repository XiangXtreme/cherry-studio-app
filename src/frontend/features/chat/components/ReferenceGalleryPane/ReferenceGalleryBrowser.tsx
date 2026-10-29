import XIcon from '@cherrystudio/app-icons/icons/x';
import { Button, Chip, ContentState, SearchField, Switch, Tabs } from '@cherrystudio/ui/components';
import { FlashList } from '@shopify/flash-list';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';

import type {
  ReferenceGalleryEntry,
  ReferenceGallerySourceId,
} from '@/shared/contracts/referenceGallery';

import { ReferenceGalleryTile } from './components/ReferenceGalleryTile';
import {
  referenceGalleryAttachmentId,
  useReferenceGalleryAttachments,
} from './hooks/useReferenceGalleryAttachments';
import { useReferenceGalleryCatalog } from './hooks/useReferenceGalleryCatalog';
import {
  filterReferenceGalleryEntries,
  referenceGalleryCategories,
} from './utils/referenceGalleryFilter';

/** Where each catalog's images and terms come from; the footer links here. */
const SOURCE_SITES: Record<ReferenceGallerySourceId, string> = {
  costume: 'https://ai-costume-gallery.pages.dev/',
  pose: 'https://ai-pose-gallery.anhao.app/',
};

/**
 * The pane's content: source tabs, search, category chips, the grid, and the
 * footer that owns the description toggle and the return to the conversation.
 */
export function ReferenceGalleryBrowser({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [source, setSource] = useState<ReferenceGallerySourceId>('costume');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>();
  const [writeDescription, setWriteDescription] = useState(true);
  const catalog = useReferenceGalleryCatalog(source);
  const gallery = useReferenceGalleryAttachments();

  const entries = useMemo(() => catalog.data?.entries ?? [], [catalog.data]);
  const categories = useMemo(() => referenceGalleryCategories(entries), [entries]);
  const visible = useMemo(
    () => filterReferenceGalleryEntries(entries, { category, query }),
    [category, entries, query],
  );
  const extraData = useMemo(
    () => ({ attachedIds: gallery.attachedIds, pendingId: gallery.pendingId }),
    [gallery.attachedIds, gallery.pendingId],
  );

  const changeSource = (next: ReferenceGallerySourceId) => {
    setSource(next);
    setCategory(undefined);
    setQuery('');
  };

  const renderItem = ({ item }: { item: ReferenceGalleryEntry }) => {
    const attachmentId = referenceGalleryAttachmentId(item);
    const isAttached = gallery.attachedIds.has(attachmentId);
    const isPending = gallery.pendingId === attachmentId;
    return (
      <View className="pb-2.5" style={{ paddingHorizontal: 5 }}>
        <ReferenceGalleryTile
          disabled={gallery.isFull && !isAttached}
          entry={item}
          isAttached={isAttached}
          isPending={isPending}
          onPress={() => void gallery.toggle(item, { writeDescription })}
        />
      </View>
    );
  };

  return (
    <View className="flex-1">
      <View className="flex-row items-center justify-between px-3 pt-3 pb-1">
        <Text accessibilityRole="header" className="text-base font-semibold text-foreground">
          {t('chat.referenceGallery.title')}
        </Text>
        <Pressable
          accessibilityLabel={t('chat.referenceGallery.close')}
          accessibilityRole="button"
          hitSlop={10}
          onPress={onClose}
          testID="reference-gallery-close"
        >
          <XIcon className="size-5 text-foreground" />
        </Pressable>
      </View>

      <View className="px-3 pt-1.5">
        <Tabs
          accessibilityLabel={t('chat.referenceGallery.title')}
          items={[
            { label: t('chat.referenceGallery.costume'), value: 'costume' },
            { label: t('chat.referenceGallery.pose'), value: 'pose' },
          ]}
          layout="hug"
          onValueChange={(value) => changeSource(value as ReferenceGallerySourceId)}
          value={source}
        />
        <View className="pt-2">
          <SearchField
            accessibilityLabel={t('chat.referenceGallery.search')}
            clearAccessibilityLabel={t('common.clear')}
            onChangeText={setQuery}
            placeholder={t('chat.referenceGallery.search')}
            value={query}
          />
        </View>
      </View>

      <ScrollView
        accessibilityLabel={t('chat.referenceGallery.categories')}
        className="grow-0"
        contentContainerClassName="gap-1 px-3 py-2"
        horizontal
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
      >
        <Chip.Selectable
          className={category ? 'border-transparent bg-transparent' : 'border-transparent'}
          hitSlop={6}
          onSelectedChange={() => setCategory(undefined)}
          selected={category === undefined}
        >
          <Chip.Label className={category ? 'text-muted-foreground' : 'text-foreground'}>
            {t('chat.referenceGallery.all')}
          </Chip.Label>
        </Chip.Selectable>
        {categories.map((item) => {
          const selected = category === item.category;
          return (
            <Chip.Selectable
              className={selected ? 'border-transparent' : 'border-transparent bg-transparent'}
              hitSlop={6}
              key={item.category}
              onSelectedChange={() => setCategory(selected ? undefined : item.category)}
              selected={selected}
            >
              <Chip.Label className={selected ? 'text-foreground' : 'text-muted-foreground'}>
                {item.category}
              </Chip.Label>
            </Chip.Selectable>
          );
        })}
      </ScrollView>

      <View className="flex-1">
        {catalog.isPending && !catalog.data ? (
          <View className="flex-1 justify-center">
            <ContentState.Loading title={t('chat.referenceGallery.loading')} />
          </View>
        ) : catalog.isError && !catalog.data ? (
          <View className="flex-1 justify-center px-4">
            <ContentState.Error
              primaryAction={{
                children: t('chat.referenceGallery.retry'),
                disabled: catalog.isRetrying,
                onPress: () => void catalog.retry(),
              }}
              title={t('chat.referenceGallery.loadFailed')}
            />
          </View>
        ) : visible.length === 0 ? (
          <View className="flex-1 justify-center">
            <ContentState.Empty title={t('chat.referenceGallery.empty')} />
          </View>
        ) : (
          <FlashList
            contentContainerStyle={{ paddingHorizontal: 7, paddingTop: 2 }}
            data={visible}
            extraData={extraData}
            keyboardShouldPersistTaps="handled"
            keyExtractor={(item) => item.id}
            numColumns={2}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            testID="reference-gallery-grid"
          />
        )}
      </View>

      <View className="gap-2 border-t border-border-subtle px-3 pt-2 pb-3">
        <View className="flex-row items-center justify-between gap-2">
          <View className="min-w-0 flex-1 flex-row items-center gap-2">
            <Switch
              accessibilityLabel={t('chat.referenceGallery.withDescription')}
              onValueChange={setWriteDescription}
              size="sm"
              value={writeDescription}
            />
            <Text className="min-w-0 shrink text-xs text-muted-foreground">
              {t('chat.referenceGallery.withDescription')}
            </Text>
          </View>
          <Text className="shrink-0 text-xs text-muted-foreground">
            {t('chat.referenceGallery.selectedCount', { count: gallery.attachedIds.size })}
          </Text>
        </View>
        <Button onPress={onClose} testID="reference-gallery-done">
          <Button.Label>{t('common.done')}</Button.Label>
        </Button>
        <Pressable
          accessibilityRole="link"
          onPress={() => void Linking.openURL(SOURCE_SITES[source])}
        >
          <Text className="text-[11px] leading-4 text-muted-foreground">
            {t('chat.referenceGallery.attribution')} · {t('chat.referenceGallery.terms')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
