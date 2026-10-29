import CheckIcon from '@cherrystudio/app-icons/icons/check';
import { Image, Spinner } from '@cherrystudio/ui/components';
import { cn } from '@cherrystudio/ui/utils';
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { ReferenceGalleryEntry } from '@/shared/contracts/referenceGallery';

/** One costume or pose: the thumbnail, its own title, and whether it is referenced. */
export const ReferenceGalleryTile = memo(function ReferenceGalleryTile({
  disabled,
  entry,
  isAttached,
  isPending,
  onPress,
}: {
  disabled: boolean;
  entry: ReferenceGalleryEntry;
  isAttached: boolean;
  isPending: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={entry.title}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: isAttached }}
      className="flex-1 active:opacity-80"
      disabled={disabled}
      onPress={onPress}
    >
      <View
        className={cn(
          'overflow-hidden rounded-2xl border bg-secondary',
          isAttached ? 'border-border-selected' : 'border-border-subtle',
        )}
        style={{ aspectRatio: 3 / 4 }}
      >
        <Image
          cachePolicy="memory-disk"
          contentFit="cover"
          recyclingKey={entry.id}
          source={entry.thumbUrl}
          style={{ height: '100%', width: '100%' }}
          transition={120}
        />
        {isPending ? (
          <View className="absolute inset-0 items-center justify-center bg-background/45">
            <Spinner size="sm" />
          </View>
        ) : null}
        {isAttached && !isPending ? (
          <View className="absolute top-1.5 right-1.5 size-6 items-center justify-center rounded-full bg-foreground">
            <CheckIcon className="size-4 text-background" />
          </View>
        ) : null}
      </View>
      <Text className="pt-1.5 text-xs leading-4 text-foreground" numberOfLines={2}>
        {entry.title}
      </Text>
    </Pressable>
  );
});
