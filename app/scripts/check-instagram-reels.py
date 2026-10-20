"""Offline check of resources/gallery-dl-modules/driftfetch_instagram_reels.py.

Needs the gallery-dl source of the bundled version (for example an unpacked
wheel: pip download gallery-dl==<version> --no-deps) and requests:

    python scripts/check-instagram-reels.py <gallery-dl source> resources/gallery-dl-modules
"""

import json
import os
import sqlite3
import sys
import tempfile

sys.path[:0] = [sys.argv[1], sys.argv[2]]  # gallery-dl source, module folder

from gallery_dl import config, extractor  # noqa: E402
import driftfetch_instagram_reels as mod  # noqa: E402


def reel(pk, **extra):
    """A reels-list entry: an image but, as Instagram sends it, no video."""
    return {
        "pk": pk, "id": f"{pk}_9", "code": f"C{pk}", "media_type": 2,
        "user": {"pk": "9", "username": "someone"},
        "image_versions2": {"candidates": [
            {"url": f"https://cdn.example/{pk}.jpg",
             "width": 720, "height": 1280}]},
        **extra,
    }


def video(pk):
    return {"video_versions": [{"url": f"https://cdn.example/{pk}.mp4",
                                "width": 720, "height": 1280}],
            "taken_at": 1700000000}


assert mod.complete(reel("1", **video("1")))
assert not mod.complete(reel("1"))
assert not mod.complete({"code": "x"})
assert mod.complete(reel("1", media_type=8, carousel_media=[
    reel("1a", **video("1a")), reel("1b", media_type=1)]))
assert not mod.complete(reel("1", media_type=8, carousel_media=[reel("1a")]))

# One reel already saved: it must cost no request at all.
folder = tempfile.mkdtemp()
archive = os.path.join(folder, "archive.sqlite3")
db = sqlite3.connect(archive)
db.execute("CREATE TABLE archive (entry TEXT PRIMARY KEY) WITHOUT ROWID")
db.execute("INSERT INTO archive VALUES ('instagram100')")
db.commit()
db.close()
config.set(("extractor",), "archive", archive)

LIST = [reel("100"), reel("101"), reel("102"), reel("103"),
        reel("104", **video("104")), reel("105"), reel("106"), reel("107"),
        reel("108"), reel("109")]
calls = []


class Response:
    def __init__(self, text):
        self.text = text


class API:
    def user_reels(self, handle):
        return [{"media": dict(m)} for m in LIST]

    def _prepare_graphql(self, opname):
        assert opname == mod.REELS_QUERY
        return ({"X-FB-Friendly-Name": opname, "X-Root-Field-Name": "x"},
                {"fb_api_req_friendly_name": opname, "doc_id": "0"})

    def media(self, code):
        calls.append(("details", code))
        if code == "C103":
            return iter([video("103")])
        raise RuntimeError("HTTP redirect to home page")


def request(url, method="GET", headers=None, data=None, **kw):
    if url.endswith("/api/graphql"):
        assert headers["X-FB-Friendly-Name"] == mod.POST_QUERY
        assert data["doc_id"] == mod.POST_DOC_ID
        pk = json.loads(data["variables"])["media_id"]
        calls.append(("graphql", pk))
        if pk == "101":
            # As the website sends it: tagged users by "id", without "pk".
            tagged = {"usertags": {"in": [
                {"user": {"id": "5", "username": "tagged"}}]}}
            return Response(json.dumps({"data": {"xig_polaris_media": {
                "if_not_gated_logged_out": {**video("101"), **tagged}}}}))
        raise RuntimeError("HTTP redirect to home page")
    code = url.rstrip("/").rpartition("/")[2]
    calls.append(("page", code))
    if code == "C102":
        embedded = json.dumps({"xig_polaris_media": {
            "if_not_gated_logged_out": video("102")}})
        return Response(f"<script>{{\"x\":{embedded}}}</script>")
    return Response("<html></html>")


extr = extractor.find("https://www.instagram.com/someone/reels/")
assert extr.posts.__func__ is mod.posts, "reels extractor not patched"
extr.initialize()
extr.api = API()
extr.request = request
extr.item = "someone"
out = list(extr.posts())

assert [m["pk"] for m in out] == ["101", "102", "103", "104"], out
assert all(mod.complete(m) and m["caption"] is None for m in out)
assert not any(arg in ("100", "C100") for _, arg in calls), calls
# 105-107 fail every way; after three misses in a row each way is dropped,
# so 108 and 109 are never asked for.
assert not any(arg in ("108", "C108", "109", "C109") for _, arg in calls), calls
assert extr.status & 1, "failed reels must make the run non-zero"

# gallery-dl's own parser accepts the assembled reel.
extr.videos_dash = False
post = extr._parse_post(out[0])
assert post["post_shortcode"] == "C101"
assert post["_files"][0]["video_url"] == "https://cdn.example/101.mp4", post
print("reels module check passed")
