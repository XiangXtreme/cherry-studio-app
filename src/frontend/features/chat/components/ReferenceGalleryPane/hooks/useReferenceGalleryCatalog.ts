import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { useBackendModule } from '@/frontend/data';
import type { ReferenceGallerySourceId } from '@/shared/contracts/referenceGallery';

/** The catalog is a pinned snapshot; five minutes of browser state is enough. */
const STALE_MS = 5 * 60 * 1000;

export function useReferenceGalleryCatalog(source: ReferenceGallerySourceId) {
  const gallery = useBackendModule('referenceGallery');
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['reference-gallery', source] as const, [source]);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => gallery.loadCatalog(source, signal),
    staleTime: STALE_MS,
  });
  const [isRetrying, setIsRetrying] = useState(false);

  const retry = useCallback(async () => {
    setIsRetrying(true);
    try {
      queryClient.setQueryData(queryKey, await gallery.refreshCatalog(source));
    } catch {
      // The failure state stays; the button is the only affordance it needs.
    } finally {
      setIsRetrying(false);
    }
  }, [gallery, queryClient, queryKey, source]);

  return { ...query, isRetrying, retry };
}
