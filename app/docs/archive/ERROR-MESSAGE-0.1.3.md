# Current 0.1.3 extraction error wording

Unsupported extraction now explains that a source may require additional extraction support or an account session. It suggests connecting a Chrome profile only when full playback requires signing in, and makes clear that a session may not resolve unsupported extraction. It no longer assumes the submitted URL is a listing or redirect page.

On startup, saved errors matching the exact old generic message are replaced with the new wording. Their status and download identity remain unchanged; this does not retry downloads or change site compatibility. Explicit login/session errors retain their separate messages.

Validation: production build and all 38 existing tests passed. An isolated desktop check loaded an older failed entry, verified its message was updated while its failed state was preserved, and opened the details dialog. The rendered message was visually inspected. See `error-message-report-0.1.3.json`.
