# Reference Gallery

The built-in costume and pose galleries. A conversation can attach one of their
images as a reference for the Agent's image tool, so this module only reads:
one small catalog snapshot per source, and one image when the user explicitly
picks it.

## Why nothing is bundled

Neither publisher allows redistributing its image data. The costume gallery
states that images and original data fall outside its MIT license and forbids
redistribution (including processed copies); the pose gallery's images belong
to the original author and are licensed for non-commercial use. The app
therefore ships no third-party image or catalog bytes:

- `sources.ts` pins a catalog snapshot per gallery to a commit, with a fallback
  mirror, so entry ids keep matching the publisher's images.
- A catalog is fetched on the first open of the pane, validated, and cached.
- Thumbnails are loaded by `expo-image` from the publisher and never pass
  through this module.
- `downloadReference` fetches the one image the user selected.

The pane names both sources and links their terms; nothing here runs in the
background.

## Contract

`ReferenceGalleryModule` (see `@/shared/contracts/referenceGallery`):

- `loadCatalog(source, signal)` returns a catalog no older than seven days. On a
  failed refresh it serves the stale snapshot; only an empty cache throws
  `catalog-unavailable`.
- `refreshCatalog(source)` always contacts the publisher. It is the retry path
  behind the pane's error state.
- `downloadReference({ source, id, signal })` returns a cached file URI. A
  second request for the same entry joins the running download, and a cached
  file is reused without a request.

Errors carry `catalog-unavailable`, `catalog-invalid`, `image-unavailable`, or
`image-invalid`. Ids are validated against `REFERENCE_GALLERY_ID_PATTERN`
before they become a URL segment or file name, and every URL is built from a
source base plus that id rather than from a publisher-supplied path.

## Storage and transport

- `Paths.cache/ReferenceGallery/<source>/catalog.vN.json` — normalized entries,
  bounded to 4 MB; a damaged or stale-version file reads as a miss.
- `Paths.cache/ReferenceGallery/<source>/images/<id>.<png|webp>` — retained up
  to 160 files or 64 MB. Caches are disposable and never enter backup or the
  database.
- `transfer.ts` is the only network code. It uses `createHttpClient` per origin
  with `credentials: 'omit'`, an 8 MB image cap, a 4 MB catalog cap, and 20 s /
  30 s timeouts. Image bytes pass `inspectImage`; PNG and WebP are confirmed
  before anything is written.

The costume reference uses the publisher's WebP preview (~93 KB) instead of its
~1.1 MB PNG: the model downsizes beyond roughly 2048 px, so the extra bytes
would only cost upload time. The pose gallery has no WebP preview, so its PNG
(~520 KB) is used.

## Self-hosted mirror (optional)

`EXPO_PUBLIC_REFERENCE_GALLERY_MIRROR` points the module at a private mirror in
front of both publishers, for a deployment that runs its image endpoint next to
a copy of the gallery files. It is read whenever a URL is built, so changing it
needs no cache purge; a missing or non-HTTPS value is ignored, and every URL
keeps the publisher behind it, so an unreachable mirror degrades to the public
source rather than failing the pane.

The mirror owns three paths per source, keyed by the catalog's own ids:

| Mirror path | Upstream |
| --- | --- |
| `<mirror>/costume/catalog.json` | the pinned jsDelivr costume snapshot |
| `<mirror>/costume/thumbs/<id>.webp` | `https://ai-costume-gallery.pages.dev/thumbs/<id>.webp` |
| `<mirror>/costume/img/<id>.webp` | `https://ai-costume-gallery.pages.dev/img/<id>.webp` |
| `<mirror>/pose/catalog.json` | `https://ai-pose-gallery.anhao.app/data/pose-zh.json` |
| `<mirror>/pose/thumbs/<id>.jpg` | `https://ai-pose-gallery.anhao.app/thumbs/<id>.jpg` |
| `<mirror>/pose/img/<id>.png` | `https://ai-pose-gallery.anhao.app/img/<id>.png` |

An nginx cache in front of those upstreams is enough to get mainland-China
latency without publishing the libraries again:

```nginx
proxy_cache_path /var/cache/refs levels=1:2 keys_zone=refs:32m
                 inactive=60d max_size=2g;

server {
  listen 443 ssl;
  server_name refs.example.com;

  proxy_cache refs;
  proxy_cache_valid 200 30d;
  proxy_cache_lock on;
  proxy_ignore_headers Cache-Control Expires Set-Cookie;
  proxy_hide_header Set-Cookie;
  proxy_ssl_server_name on;

  # Exact matches win over the prefixes below.
  location = /t/TOKEN/costume/catalog.json {
    proxy_pass https://cdn.jsdelivr.net/gh/haojunsun/ai-costume-gallery-zh@COMMIT/data/costume-zh.json;
  }
  location /t/TOKEN/costume/ {
    rewrite ^/t/TOKEN/costume/(.*)$ /$1 break;
    proxy_pass https://ai-costume-gallery.pages.dev;
  }

  location = /t/TOKEN/pose/catalog.json {
    proxy_pass https://ai-pose-gallery.anhao.app/data/pose-zh.json;
  }
  location /t/TOKEN/pose/ {
    rewrite ^/t/TOKEN/pose/(.*)$ /$1 break;
    proxy_pass https://ai-pose-gallery.anhao.app;
  }
}
```

The token in the path is obscurity, not security: it keeps the mirror out of
crawlers and casual traffic, but the value ships inside the app bundle. Keep the
mirror private and personal — serving these images to other people is
redistribution, which the published terms do not allow.

This only makes the transfer path faster. The phone still downloads the picked
reference before sending it, so the full win needs the image endpoint to accept
a reference URL and read the file itself, which the app does not do yet.

## Changing a source

Update the commit in `sources.ts` after verifying the gallery's counts and image
paths, then bump `CACHE_VERSION` in `referenceGalleryCache.ts` when the parsed
shape changes. `__tests__/schemas.test.ts` protects the normalization;
`createReferenceGalleryModule` takes its cache and transfer as overrides so the
module's behavior is testable without the network or the file system.
