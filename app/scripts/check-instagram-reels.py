"""Offline check of resources/gallery-dl-modules/driftfetch_instagram_reels.py.

Needs the gallery-dl source of the bundled version (for example an unpacked
wheel: pip download gallery-dl==<version> --no-deps) and requests:

    python scripts/check-instagram-reels.py <gallery-dl source> resources/gallery-dl-modules
"""
import sys

sys.path[:0] = [sys.argv[1], sys.argv[2]]  # gallery-dl source, module folder

from gallery_dl import extractor  # noqa: E402
import driftfetch_instagram_reels as mod  # noqa: E402

video = {
    "pk": "111", "id": "111_9", "code": "AbC", "media_type": 2,
    "user": {"pk": "9", "username": "someone"},
    "taken_at": 1700000000,
    "image_versions2": {"candidates": [
        {"url": "https://cdn.example/i.jpg", "width": 720, "height": 1280}]},
    "video_versions": [
        {"url": "https://cdn.example/v.mp4", "width": 720, "height": 1280}],
}
carousel = dict(video, pk="222", code="DeF", media_type=8)
bare = {"code": "GhI"}

assert mod.complete(video)
assert not mod.complete(carousel)
assert not mod.complete(bare)
assert not mod.complete(dict(video, video_versions=[]))

asked = []


class API:
    def user_reels(self, handle):
        return [{"media": dict(video)}, {"media": carousel}, {"media": bare}]

    def media(self, code):
        asked.append(code)
        return [{"code": code, "from": "details"}]


extr = extractor.find("https://www.instagram.com/someone/reels/")
assert extr.posts.__func__ is mod.posts, "reels extractor not patched"
extr.api = API()
extr.item = "someone"
out = list(extr.posts())
assert out[0]["code"] == "AbC" and out[0]["caption"] is None, out[0]
assert asked == ["DeF", "GhI"], asked

# gallery-dl's own parser accepts a listed reel as it is.
extr.initialize()
extr.videos_dash = False
post = extr._parse_post(out[0])
assert post["post_shortcode"] == "AbC"
assert post["_files"][0]["video_url"] == "https://cdn.example/v.mp4", post
print("reels module check passed")
