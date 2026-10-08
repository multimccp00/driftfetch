# Optional providers and accounts

Current starts with no custom extensions installed. Add a `.current-extension` file in **Settings → Extensions**, then enable it. Adding a file does not execute its code. Enabling it shows the provider name and domains and asks whether you trust it. Each enabled extension runs in its own process, started with Node's permission model (`--permission`): it cannot read or write files, start programs or load native add-ons, and it gets no environment variables from the app. It can use the network, and it receives the saved credentials for its own domains only, so enable only extensions from authors you trust. A call that takes too long, or code that crashes, stops that process; the next call starts a fresh one. Disabling or removing an extension stops its process immediately. Removing an extension preserves downloads and account records.

In **Settings → Accounts**, choose or enter a domain and select a connection type. Browser sign-in, Chrome sessions, and Netscape cookie files work without extensions. Enabled providers can declare API or username/password fields for their domains. The form is generated from the provider schema. Values are encrypted with Electron safeStorage in the main process, never returned to the renderer or diagnostic report, and cleared from the form after saving. Saving replaces the previous connection for that domain. Existing API account records retain their domain and field names and can be used again by a matching provider without re-entry. Surrounding whitespace is trimmed for API fields on both save and read; username/password account values preserve their spacing. After correcting account access, use Download again to read a collection afresh: Retry resumes its existing selected list.

## Authoring

Keep private provider sources in `local-extensions/` (ignored by Git and excluded from app packaging). A provider directory contains `manifest.json` and `provider.ts`. Bundle with:

```powershell
node scripts/build-extension.mjs <provider-directory>
```

This creates one portable `.current-extension` JSON file containing a manifest and bundled CommonJS code. Distribute that file separately from Current. Optional providers are not imported or bundled by the core build; their account schemas and domain rules live in their own packages. Third-party bundled download engines retain their own upstream source support.

Example manifest:

```json
{
  "apiVersion": 1,
  "id": "landscapes",
  "name": "Landscape samples",
  "version": "1.0.0",
  "domains": ["images.example.com"],
  "account": {
    "label": "API credentials",
    "kind": "api",
    "fields": [
      { "key": "apiKey", "label": "API key", "secret": true, "required": true }
    ]
  }
}
```

Use `kind: "credentials"` for a provider accepting account fields such as username and password. `secret: true` masks an input. The account schema is optional. Domains are lowercase canonical hostnames; the host strips a leading `www.` consistently with Accounts. Other subdomains require separate declarations, and wildcards are not supported. Only one enabled provider may own each domain. IDs must be lowercase letters/digits/hyphens, begin with a letter, and not be Windows device names. API version 1 supports image collections.

The host checks both the submitted link and the destination of an ordinary HTTP redirect. Details and copied diagnostics record whether a domain's extension was absent, disabled, unable to load, unable to recognize the link, or selected. Disabled extensions are never executed; ordinary engines can still try the link. Older entries require a new lookup to record these checks.

Export a default object with these methods:

```ts
export default {
  matches(url: string): boolean { /* recognize supported link shapes */ },
  async resolve(url: string, context: {
    signal: AbortSignal;
    credentials(): Promise<Record<string, string>>;
  }) {
    // Return {title, mediaKey?, entries:[{id,title,url}], sourceItemCount?, collectionLimited?}.
    // Honor context.signal on all requests. Use stable source IDs and original media URLs.
    // Never include credentials in titles, IDs, URLs returned as metadata, or logs.
  }
};
```

Optional `fallback(url, context)` preserves the existing API-to-HTML reader diagnostics. It runs after a primary exception, never after cancellation; undefined primary output does not invoke it. Optional `galleryArguments(values)` returns an argument array for streaming image-engine jobs. Arguments run without a shell, and `--option key=value` pairs whose key contains key, token, secret or password are moved to a temporary config file so they stay out of the process list. Credentials are scoped by the host to the provider's declared domain. The sandbox cannot restrict which hosts an extension contacts. Helper libraries must be bundled into the extension file, because file access (and so `require` of other files) is denied.

Only collection metadata is accepted: providers cannot replace job IDs, queue states, or filesystem destinations through their return value. Collection IDs, titles and HTTP(S) URLs are validated, then normal deduplication, review, transfer and file verification apply. Unknown totals remain unknown. Installing a provider does not fix discovery gaps in its implementation.

Entries may include an optional HTTP(S) `thumbnail` URL. It is display metadata only: keep `url` pointing to the original download. Collection previews fetch bounded raster images in the main process and return only image data to the renderer, without sending account credentials. Unavailable/protected previews show a placeholder and do not block selection. The preview setting defaults to on and overrides automatic gallery selection until the user confirms chosen items.

Providers can return an optional `collectionDiscovery` object containing only numeric counters: `pagesRead`, `postsReturned`, `uniquePosts`, `duplicatePosts`, `postsWithoutFiles`, `invalidPosts`, and `sharedFileUrls`, plus `stopReason` (`empty-page`, `repeated-page`, or `page-limit`). The host copies these bounded fields into Details and diagnostic reports, dropping extra properties. Do not include URLs, IDs, response text or credentials. Source totals count posts; file totals count unique selected URLs, so several distinct post IDs may refer to one saved file. Missing file links, invalid post records and incomplete pagination keep an all-items download in Needs attention even when every selected file was saved. Deliberately selected subsets are not certified as full collections.

`extension-sdk/paged-collection.ts` (SDK helper for providers, not used by the app itself) provides a reusable metadata-page accumulator for providers. It retains stable IDs before deduplicating file URLs, distinguishes missing links from shared URLs, accepts JSON or XML post envelopes, retries one premature empty page, and bounds repeated-page loops. Its XML response parser preserves the source's count; a bare JSON array has no inferred total. Use fresh discovery after updating a reader: Retry retains the previous list, while Download again calls the updated provider. To update an installed extension, remove the previous version, add the new `.current-extension` file, and enable it. Saved accounts and downloaded files are kept.

Extensions are stored in the app's user-data `extensions` directory. Their enabled state persists. Backups do not include extension code or credentials. Pending work is restored for review; re-add its provider and account as needed.
