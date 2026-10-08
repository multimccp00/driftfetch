export type Status =
  | "resolving"
  | "review"
  | "collection"
  | "queued"
  | "downloading"
  | "processing"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "duplicate";
export interface Entry {
  id: string;
  title: string;
  url: string;
  thumbnail?: string;
  /** url is the media file itself, so the page title must be carried over. */
  mediaFile?: boolean;
}
export interface CollectionReadAttempt {
  reader: "api" | "html";
  outcome: "reading" | "succeeded" | "empty" | "failed" | "cancelled";
  failureCode?: string;
}
export interface CollectionDiscovery {
  pagesRead: number;
  postsReturned: number;
  uniquePosts: number;
  duplicatePosts: number;
  postsWithoutFiles: number;
  invalidPosts: number;
  sharedFileUrls: number;
  stopReason: "empty-page" | "repeated-page" | "page-limit";
}
export interface Job {
  extensionId?: string;
  extensionChecks?: ExtensionCheck[];
  collectionReadAttempts?: CollectionReadAttempt[];
  collectionDiscovery?: CollectionDiscovery;
  holdForReview?: boolean;
  availableHeight?: number;
  refreshing?: boolean;
  formatsError?: string;
  formatsCheckedAt?: number;
  checkedEngineVersion?: string;
  linkType?:
    | "direct file"
    | "embedded video"
    | "redirect"
    | "collection"
    | "image gallery"
    | "profile"
    | "video page";
  queueOrder?: number;
  retryCount?: number;
  retryAt?: number;
  scheduleHeld?: boolean;
  fileMissing?: boolean;
  speedLimitKiB?: number;
  fragmentConcurrency?: number;
  requestDelaySec?: number;
  formats?: VideoFormat[];
  selectedFormatId?: string;
  actualFormatId?: string;
  failureStage?: "extraction" | "download";
  failureCode?: string;
  id: string;
  originalUrl: string;
  resolvedUrl?: string;
  mediaKey?: string;
  title: string;
  source: string;
  status: Status;
  progress: number;
  speed?: number;
  eta?: number;
  totalBytes?: number;
  downloadedBytes?: number;
  quality?: string;
  /** Source thumbnail address; the app loads it through the main process. */
  thumbnailUrl?: string;
  preferredFormatId?: string;
  duration?: number;
  error?: string;
  filePath?: string;
  /** Files written in the current run; shown for profile downloads. */
  filesSaved?: number;
  expectedFiles?: number;
  verifiedFiles?: number;
  missingFiles?: number;
  sourceItemCount?: number;
  discoveredItems?: number;
  selectedAll?: boolean;
  targetDir?: string;
  outputTemplate?: string;
  qualityLimit?: Settings["quality"];
  entries?: Entry[];
  collectionKind?: "videos" | "images";
  /** Read and download a tag search incrementally instead of prelisting it. */
  imageSearch?: boolean;
  collectionLimited?: boolean;
  galleryFolder?: string;
  groupName?: string;
  gallerySource?: string;
  /** Title from the collection page, kept over the bare file name. */
  entryTitle?: string;
  /** Page that embeds a bare media file; sent as Referer. */
  refererUrl?: string;
  imageUrls?: string[];
  /** gallery-dl --range of the selected items, 1-based. */
  galleryRange?: string;
  duplicateOf?: string;
  force?: boolean;
  startRequested?: boolean;
  createdAt: number;
  updatedAt: number;
  /** When the download last finished. */
  finishedAt?: number;
}
export interface ExtensionCheck {
  stage: "submitted" | "redirect";
  outcome:
    | "not-installed"
    | "disabled"
    | "load-failed"
    | "not-matched"
    | "selected"
    | "check-failed";
}
export interface VideoFormat {
  id: string;
  height?: number;
  ext: string;
  bitrate?: number;
  size?: number;
  separateAudio: boolean;
}
export interface Capture {
  id: string;
  at: number;
  origin: "clipboard" | "manual";
  source: string;
  jobId?: string;
  duplicate: boolean;
}
interface SourceRule {
  source: string;
  quality?: "best" | "1080" | "720";
  speedLimitKiB?: number;
  fragmentConcurrency?: number;
  /** Downloads from this source running at once; sites that rate-limit need 1. */
  maxSimultaneous?: number;
  /** Seconds to wait between requests and files from this source. */
  requestDelaySec?: number;
  downloadDir?: string;
  autoDownload?: boolean;
}
export interface Settings {
  warnBelowHeight: number;
  speedLimitKiB: number;
  automaticRetries: boolean;
  scheduleEnabled: boolean;
  scheduleStart: string;
  scheduleEnd: string;
  clipboardWatch: boolean;
  captureNotifications: boolean;
  autoDownload: boolean;
  autoDownloadCollections: boolean;
  previewCollections: boolean;
  quality: "best" | "1080" | "720";
  concurrency: number;
  fragmentConcurrency: number;
  downloadDir: string;
  folderWatchDir: string;
  completionAction: "none" | "notify";
  sourceRules: SourceRule[];
  grouping: "source" | "date" | "none";
  filenameTemplate: string;
  launchAtLogin: boolean;
  /** "system" follows Windows. */
  theme: "dark" | "light" | "system";
  /** Version of the privacy note the user has seen; 0 = not yet shown. */
  privacyNoticeVersion: number;
}
export interface SessionInfo {
  domain: string;
  kind: "chrome" | "file" | "browser" | "api" | "credentials";
  profile?: string;
  updatedAt: number;
}
export interface AccountField {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
}
export interface ExtensionManifest {
  apiVersion: 1;
  id: string;
  name: string;
  version: string;
  domains: string[];
  account?: {
    label: string;
    kind: "api" | "credentials";
    fields: AccountField[];
  };
}
export interface ExtensionInfo extends ExtensionManifest {
  enabled: boolean;
  error?: string;
}
export interface EngineInfo {
  version: string;
  available: boolean;
  ffmpegAvailable: boolean;
  jsRuntimeAvailable: boolean;
  jsRuntimeVersion?: string;
  canRollback: boolean;
  busy: boolean;
  message?: string;
}
export interface Snapshot {
  extensions: ExtensionInfo[];
  appVersion: string;
  captures: Capture[];
  jobs: Job[];
  settings: Settings;
  sessions: SessionInfo[];
  engine: EngineInfo;
  chromeProfiles: string[];
}
export type Action =
  "start" | "pause" | "cancel" | "retry" | "again" | "remove" | "next";
export interface DesktopAPI {
  refreshFormats(id: string): Promise<void>;
  backup(action: "export" | "restore", password: string): Promise<string>;
  reorder(id: string, beforeId?: string, after?: boolean): Promise<void>;
  checkFiles(): Promise<void>;
  clearHistory(): Promise<void>;
  exportHistory(ids: string[]): Promise<string>;
  clearDownloads(): Promise<void>;
  /** Restores the most recently removed entries (within 30 s). */
  undoRemove(): Promise<number>;
  locateFile(id: string): Promise<void>;
  setFormat(id: string, formatId: string): Promise<void>;
  copyDiagnostic(id: string): Promise<void>;
  clearCaptures(): Promise<void>;
  appAction(action: "shortcut" | "update"): Promise<void>;
  onNavigate(listener: (page: "downloads" | "captures") => void): () => void;
  snapshot(): Promise<Snapshot>;
  /** The full job, including the format and entry lists the snapshot omits for finished jobs. */
  jobDetail(id: string): Promise<Job | undefined>;
  /** The job's source thumbnail as image data, or null when none can be loaded. */
  jobThumbnail(id: string): Promise<string | null>;
  addLinks(
    text: string,
    review?: boolean,
    groupName?: string,
  ): Promise<{ added: number; duplicates: number; truncated: number }>;
  action(ids: string[], action: Action): Promise<void>;
  selectCollection(
    id: string,
    entryIds: string[],
  ): Promise<{ added: number; duplicates: number } | undefined>;
  previewCollectionEntry(id: string, entryId: string): Promise<string | null>;
  cancelCollectionPreviews(id: string): Promise<void>;
  settings(patch: Partial<Settings>): Promise<void>;
  chooseFolder(): Promise<string | null>;
  chooseFolderWatch(): Promise<string | null>;
  openFolder(id?: string): Promise<void>;
  openFile(id: string): Promise<void>;
  openSource(id: string): Promise<void>;
  openLicenses(): Promise<void>;
  chromeSession(domain: string, profile: string): Promise<void>;
  importSession(domain: string): Promise<boolean>;
  browserSession(domain: string): Promise<void>;
  saveAccount(domain: string, values: Record<string, string>): Promise<void>;
  importExtension(): Promise<boolean>;
  extensionAction(
    id: string,
    action: "enable" | "disable" | "remove",
  ): Promise<void>;
  removeSession(domain: string): Promise<void>;
  engineAction(action: "update" | "rollback"): Promise<void>;
  windowAction(
    action: "minimize" | "maximize" | "close" | "quit",
  ): Promise<void>;
  /** The capture popup asked to show this download's details. */
  onOpenJob(listener: (id: string) => void): () => void;
  isMaximized(): Promise<boolean>;
  onMaximized(listener: (maximized: boolean) => void): () => void;
  subscribe(listener: (snapshot: Snapshot) => void): () => void;
}
declare global {
  interface Window {
    current: DesktopAPI;
  }
}
