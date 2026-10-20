"""DriftFetch: build Instagram reels from the reels list itself.

gallery-dl lists a profile's reels, then asks Instagram for each one's
details (/api/v1/media/<id>/info/), even for reels already saved. Instagram
now often redirects that request to its home page, which stops the reels
part. The list usually carries the same media data, so a complete entry is
used as it is, and only an incomplete one is asked for separately.

Loaded through gallery-dl's extractor.module-sources option. It defines no
extractors of its own: a profile download builds its reels part from
InstagramReelsExtractor directly, so the class is patched in place.
"""

from gallery_dl.extractor import instagram


def _url(entry):
    return bool(entry and entry.get("url"))


def complete(media):
    """Whether a reels-list entry has everything gallery-dl reads from a post."""
    try:
        if not (media.get("pk") and media.get("code") and media["user"]["pk"]):
            return False
        if not _url(media["image_versions2"]["candidates"][0]):
            return False
        # 1 image, 2 video; carousels (8) need per-item data the list lacks.
        kind = media.get("media_type", 2)
        if kind == 2:
            return _url(media["video_versions"][-1])
        return kind == 1
    except (KeyError, IndexError, TypeError, AttributeError):
        return False


def posts(self):
    listed = asked = 0
    for reel in self.api.user_reels(self.item):
        media = reel.get("media") or reel
        if not listed and not asked:
            self.log.debug(
                "DriftFetch: reels list fields: %s", ", ".join(sorted(media)))
        if complete(media):
            listed += 1
            media.setdefault("caption", None)
            yield media
        else:
            asked += 1
            yield from self.api.media(media["code"])
    self.log.debug(
        "DriftFetch: %s reels from the list, %s asked for separately",
        listed, asked)


instagram.InstagramReelsExtractor.posts = posts
