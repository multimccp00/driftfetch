# Current 0.5.1

- The adapter reads each gallery item's opened image URL (`rel-link`) instead of the thumbnail `<img>` URL. It never uses the 460px grid previews as download targets.
- Selected images are individual resumable queue entries, so they support pause, retry, history and duplicate handling. They are saved under the normal grouping folder plus a sanitized gallery-title folder.
- The adapter caps a gallery at 100 discovered images, matching Current's existing collection limit. It reports when a gallery exceeds that limit.

## Validation

The extraction test covers a gallery item whose visible preview URL differs from its opened image URL; only the opened URL is accepted. The application build and the full automated suite pass with 64 tests.

The site determines the highest image delivery URL it exposes. For the supplied public gallery, Current found 16 opened image URLs at the site's 1280px endpoint. The page advertises larger display dimensions for some images, but the corresponding 1920px CDN endpoint was unavailable during the check, so Current preserves the highest URL the page actually exposes instead of inventing a resolution.
