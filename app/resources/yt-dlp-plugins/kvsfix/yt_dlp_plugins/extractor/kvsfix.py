import re

from yt_dlp.extractor.generic import GenericIE


class KvsFlashvarsFixIE(GenericIE, plugin_name='kvsfix'):
    def _extract_kvs(self, url, webpage, video_id):
        # Some KVS sites put JS expressions in flashvars, e.g.
        # adv_pre_vast: '/frk/?keywords=' + current_keyword, which js_to_json
        # cannot parse. Drop the concatenations; only ad fields use them.
        webpage = re.sub(r'''(['"])\s*\+\s*(?:['"]|[\w$.]+)''', r'\1', webpage)
        # Some also define flashvars twice: a low-quality UC Browser branch
        # first, then the full one in `else`. yt-dlp reads the first, so hide
        # all but the last.
        count = len(re.findall(r'var\s+flashvars\s*=', webpage))
        if count > 1:  # re.sub treats count=0 as "replace all"
            webpage = re.sub(r'var\s+flashvars\s*=', 'var _flashvars =', webpage, count=count - 1)
        return super()._extract_kvs(url, webpage, video_id)
