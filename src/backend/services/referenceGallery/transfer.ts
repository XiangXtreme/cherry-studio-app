import { createHttpClient, type HttpClient } from '@/backend/services/http';
import { inspectImage } from '@/backend/utils/imageInspection';
import {
  ReferenceGalleryError,
  type ReferenceGallerySourceId,
} from '@/shared/contracts/referenceGallery';

import {
  REFERENCE_GALLERY_SOURCES,
  referenceGalleryCatalogUrls,
  referenceGalleryImageUrls,
  referenceGalleryMirrorBase,
  splitPublisherUrl,
} from './sources';

const CATALOG_TIMEOUT_MS = 20_000;
const IMAGE_TIMEOUT_MS = 30_000;
const MAX_CATALOG_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export type ReferenceGalleryTransfer = {
  fetchCatalogPayload(source: ReferenceGallerySourceId, signal?: AbortSignal): Promise<unknown>;
  fetchReferenceBytes(
    source: ReferenceGallerySourceId,
    id: string,
    signal?: AbortSignal,
  ): Promise<{ bytes: Uint8Array; mediaType: string }>;
};

/** One transport per immutable origin; the transport owns the timeout policy. */
const clients = new Map<string, HttpClient>();

function clientFor(url: string, timeoutMs: number) {
  const { baseUrl, path } = splitPublisherUrl(url);
  const key = `${baseUrl}|${timeoutMs}`;
  let client = clients.get(key);
  if (!client) {
    client = createHttpClient({ baseUrl, timeoutMs });
    clients.set(key, client);
  }
  return { client, path };
}

async function requestBytes(
  url: string,
  input: { maxBytes: number; signal?: AbortSignal; timeoutMs: number },
): Promise<Uint8Array> {
  const { client, path } = clientFor(url, input.timeoutMs);
  const response = await client.request<ArrayBuffer>({
    credentials: 'omit',
    maxResponseBytes: input.maxBytes,
    method: 'GET',
    path,
    responseType: 'arraybuffer',
    signal: input.signal,
  });
  return new Uint8Array(response.data);
}

export function createReferenceGalleryTransfer(
  options: { mirror?: () => string | undefined } = {},
): ReferenceGalleryTransfer {
  const mirror = options.mirror ?? referenceGalleryMirrorBase;
  return {
    async fetchCatalogPayload(sourceId, signal) {
      const source = REFERENCE_GALLERY_SOURCES[sourceId];
      let cause: unknown;
      for (const url of referenceGalleryCatalogUrls(source, mirror())) {
        try {
          const bytes = await requestBytes(url, {
            maxBytes: MAX_CATALOG_BYTES,
            signal,
            timeoutMs: CATALOG_TIMEOUT_MS,
          });
          try {
            return JSON.parse(new TextDecoder().decode(bytes));
          } catch (error) {
            throw new ReferenceGalleryError(
              'catalog-invalid',
              'The gallery catalog was not valid JSON.',
              { cause: error },
            );
          }
        } catch (error) {
          signal?.throwIfAborted();
          cause = error;
        }
      }
      throw new ReferenceGalleryError(
        'catalog-unavailable',
        'No gallery catalog could be reached.',
        { cause },
      );
    },

    async fetchReferenceBytes(sourceId, id, signal) {
      const source = REFERENCE_GALLERY_SOURCES[sourceId];
      let cause: unknown;
      for (const url of referenceGalleryImageUrls(source, id, mirror())) {
        try {
          const bytes = await requestBytes(url, {
            maxBytes: MAX_IMAGE_BYTES,
            signal,
            timeoutMs: IMAGE_TIMEOUT_MS,
          });
          const inspected = inspectImage(bytes);
          if (
            inspected.mediaType !== source.referenceMediaType ||
            inspected.width < 1 ||
            inspected.height < 1
          )
            throw new ReferenceGalleryError(
              'image-invalid',
              'The gallery image was not the expected still image.',
            );
          return { bytes, mediaType: inspected.mediaType };
        } catch (error) {
          signal?.throwIfAborted();
          cause = error;
        }
      }
      throw new ReferenceGalleryError(
        'image-unavailable',
        'The gallery image could not be downloaded.',
        {
          cause,
        },
      );
    },
  };
}
