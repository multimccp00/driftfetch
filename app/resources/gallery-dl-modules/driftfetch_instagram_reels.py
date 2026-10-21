"""DriftFetch: Instagram reels without gallery-dl's per-reel details request.

gallery-dl lists a profile's reels, then asks Instagram for each one's
details (/api/v1/media/<id>/info/), even for reels already saved. Instagram
now often redirects that request to its home page, which stopped the whole
reels part. Here, for each listed reel:

1. A reel already in the download archive is skipped without any request.
   With gallery-dl's "abort:N" skip setting, N of them in a row end the
   list, as saved files do for other parts (gallery-dl never sees these).
2. A complete list entry is used as it is (the list usually lacks videos).
3. Otherwise the reel's media comes from the single-post GraphQL query the
   Instagram website uses, then from the reel's own page, and only then from
   gallery-dl's original details request.
4. A reel that still fails is logged and skipped, so the rest still download;
   one error at the end marks the reels part for a retry.

Loaded through gallery-dl's extractor.module-sources option. It defines no
extractors of its own: a profile download builds its reels part from
InstagramReelsExtractor directly, so the class is patched in place.
"""

import copy
import json
import sqlite3

from gallery_dl import text, util
from gallery_dl.extractor import instagram

POST_QUERY = "PolarisLoggedOutDesktopWWWPostRootContentQuery"
POST_DOC_ID = "27130156389949648"
REELS_QUERY = "PolarisProfileReelsTabContentQuery_connection"
# A way of reading reels that fails this many times in a row is dropped for the run.
GIVE_UP_AFTER = 3


def _url(entry):
    return bool(entry and entry.get("url"))


def _media_ok(item):
    """Whether one image or video has the links gallery-dl downloads."""
    if not _url(item["image_versions2"]["candidates"][0]):
        return False
    if item.get("media_type", 2) == 2:
        return _url(item["video_versions"][-1])
    return True


def complete(media):
    """Whether a reel entry has everything gallery-dl reads from a post."""
    try:
        if not (media.get("pk") and media.get("code") and media["user"]["pk"]):
            return False
        if media.get("media_type") == 8:
            items = media["carousel_media"]
            return bool(items) and all(_media_ok(item) for item in items)
        return _media_ok(media)
    except (KeyError, IndexError, TypeError, AttributeError):
        return False


def _fill_users(media):
    """The website's answers name users by "id"; gallery-dl reads "pk" and names."""
    def fill(user):
        if isinstance(user, dict):
            user.setdefault("pk", user.get("id"))
            user.setdefault("username", None)
            user.setdefault("full_name", None)

    for item in (media, *(media.get("carousel_media") or ())):
        for tag in (item.get("usertags") or {}).get("in") or ():
            fill(tag.get("user"))
        for mention in item.get("reel_mentions") or ():
            fill(mention.get("user"))
    for user in media.get("coauthor_producers") or ():
        fill(user)
    media.setdefault("caption", None)
    return media


def _parses(self, media):
    """Whether gallery-dl's own parser reads the reel, tried on a copy."""
    try:
        self._parse_post(copy.deepcopy(media))
        return True, ""
    except Exception as exc:
        return False, f"gallery-dl cannot read it: {exc.__class__.__name__}: {exc}"


def _archive_check(self):
    """A lookup in gallery-dl's download archive; False when there is none."""
    path = self.config("archive")
    if not path:
        return lambda pk: False
    try:
        db = sqlite3.connect(
            f"file:{util.expand_path(path)}?mode=ro", uri=True,
            check_same_thread=False)
    except sqlite3.Error:
        return lambda pk: False

    def archived(pk):
        try:
            return db.execute(
                "SELECT 1 FROM archive WHERE entry=?",
                (f"{self.category}{pk}",)).fetchone() is not None
        except sqlite3.Error:
            return False
    return archived


def _from_graphql(self, media):
    """The single-post query the website uses, sent with gallery-dl's session."""
    # Same tokens, headers and page as the reels list request that just worked.
    headers, body = self.api._prepare_graphql(REELS_QUERY)
    headers["X-FB-Friendly-Name"] = body["fb_api_req_friendly_name"] = \
        POST_QUERY
    headers["Referer"] = f"{self.root}/reel/{media['code']}/"
    headers.pop("X-Root-Field-Name", None)
    body["doc_id"] = POST_DOC_ID
    body["variables"] = util.json_dumps({"media_id": str(media["pk"])})
    response = self.request(
        f"{self.root}/api/graphql", method="POST", headers=headers, data=body)
    return util.json_loads(response.text)["data"]["xig_polaris_media"][
        "if_not_gated_logged_out"]


def _from_page(self, media):
    """The media the reel's own page embeds for the website."""
    page = self.request(f"{self.root}/reel/{media['code']}/").text
    pos = page.find('"xig_polaris_media":')
    if pos < 0:
        raise ValueError("no media on the page")
    found, _ = json.JSONDecoder().raw_decode(page, page.find("{", pos))
    return found["if_not_gated_logged_out"]


def _from_details(self, media):
    """gallery-dl's own per-reel details request."""
    return next(iter(self.api.media(media["code"])))


METHODS = (
    ("graphql", _from_graphql),
    ("page", _from_page),
    ("details", _from_details),
)


def _abort_after(self):
    """N from an "abort:N" skip setting (--abort N), else None."""
    skip = self.config("skip")
    if isinstance(skip, str) and skip.startswith("abort:"):
        return text.parse_int(skip.split(":")[1]) or None
    return None


def posts(self):
    archived = _archive_check(self)
    abort_after = _abort_after(self)
    in_a_row = 0
    counts = dict.fromkeys(
        ("archived", "listed", "failed", *(name for name, _ in METHODS)), 0)
    misses = dict.fromkeys((name for name, _ in METHODS), 0)
    first = True

    for reel in self.api.user_reels(self.item):
        media = reel.get("media") or reel
        if first:
            first = False
            self.log.debug(
                "DriftFetch: reels list fields: %s", ", ".join(sorted(media)))

        if media.get("pk") and archived(media["pk"]):
            counts["archived"] += 1
            in_a_row += 1
            if abort_after and in_a_row >= abort_after:
                self.log.debug(
                    "DriftFetch: %s saved reels in a row; stopping", in_a_row)
                break
            continue
        in_a_row = 0
        if complete(media) and _parses(self, _fill_users(media))[0]:
            counts["listed"] += 1
            yield media
            continue

        for name, method in METHODS:
            if misses[name] >= GIVE_UP_AFTER:
                continue
            try:
                full = _fill_users({**media, **(method(self, media) or {})})
            except Exception as exc:
                full, ok = None, False
                reason = f"{exc.__class__.__name__}: {exc}"
            else:
                ok, reason = (_parses(self, full) if complete(full)
                              else (False, "incomplete media"))
            if ok:
                misses[name] = 0
                counts[name] += 1
                yield full
                break
            misses[name] += 1
            self.log.debug(
                "DriftFetch: reel %s via %s failed (%s)",
                media.get("code"), name, reason)
        else:
            counts["failed"] += 1
            if all(n >= GIVE_UP_AFTER for n in misses.values()):
                self.log.debug("DriftFetch: no way of reading reels is left")
                break

    self.log.debug(
        "DriftFetch: reels %s",
        ", ".join(f"{k}={v}" for k, v in counts.items()))
    if counts["failed"]:
        # A non-zero exit marks the part for a retry. DriftFetch restarts a part
        # whose errors start "Failed to download" from the top, which costs only
        # list pages now that saved reels need no request.
        self.status |= 1
        self.log.error(
            "Failed to download %s reels; retry later", counts["failed"])


instagram.InstagramReelsExtractor.posts = posts
