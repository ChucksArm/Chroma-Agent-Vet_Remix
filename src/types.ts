export type SocialPlatformType =
  | 'YouTube'
  | 'TikTok'
  | 'Instagram'
  | 'Twitter'
  | 'Substack'
  | 'Blog';

export interface WatchedItem {
  platform: SocialPlatformType;
  title: string;
  url: string;
  date: string;
  durationOrFormat: string;
  summary: string;
}

export interface CompetitorTie {
  company:
    | 'Fable'
    | 'Kindle'
    | 'Audible'
    | 'Kobo'
    | 'Libro.fm'
    | 'Everand'
    | 'Storytel'
    | 'BookBeat'
    | 'Apple Books'
    | 'Spotify audiobooks'
    | 'Goodreads'
    | 'Serial Reader'
    | 'XTEINK';
  relationshipType:
    | 'Discount Code'
    | 'Sponsorship'
    | 'Affiliate Link'
    | 'Book Club Host'
    | 'Hardware Review'
    | 'Organic Mention';
  details: string;
  activeConflictRisk: 'Low' | 'Moderate' | 'High';
}

export interface VettingDossier {
  overallSummary?: string; // Overall synthesis
  watchedOrRead: string; // What was watched/read
  audienceProfile: string; // Audience profile
  readingAppsEreadersAndAI: string; // Reading apps, e-readers, and AI
  competitorTiesAnalysis: string; // Brand Ties
  recommendChromaticsWhy: string; // Recommend Chromatics & why
  outreachLeadHook: string; // Outreach lead hook
  gutFeeling: string; // Gut feeling
  humanWatchComment?: string; // Boss Feedback Style: Short, touchy-feely, thoughtful & truthful human watch-note
  structuredResearchComment?: string; // Pre-emptive AI research structured 8-bullet breakdown
  formattedNotionComment: string; // Active Notion comment to sync/copy (defaults to humanWatchComment)
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export type VerdictType = 'Approved' | 'Pending Review' | 'Possible conflict' | 'Hold';
export type StageType = 'To vet' | 'Vetted' | 'Outreach' | 'Archived';
export type TeamTakeType = 'Strong fit' | 'Maybe' | 'Not a fit' | 'Unassigned';

export type ProjectToneMode =
  | 'nyc-20s'
  | 'bree-loose'
  | 'hybrid-nyc-bree'
  | 'sf-ya-6th-grade';

export type CommentBulletFormat =
  | 'numbered-and-dashes'
  | 'dashes-only'
  | 'numbered-only';

export type ModificationAuthorType = 'ai-agent' | 'brianna' | 'both-agent-and-brianna';

export type PreLiveStagingStatus =
  | 'unstaged'
  | 'in-staging-table'
  | 'pushed-to-notion-staging'
  | 'checked-in-notion'
  | 'live';

export type ChromaSyncableFieldKey =
  | 'overallSummary'
  | 'watchedOrRead'
  | 'audienceProfile'
  | 'readingAppsEreadersAndAI'
  | 'competitorTiesAnalysis'
  | 'recommendChromaticsWhy'
  | 'outreachLeadHook'
  | 'gutFeeling'
  | 'formattedNotionComment'
  | 'teamTake'
  | 'verdict'
  | 'stage'
  | 'researchNotes'
  | 'competitorWatchlistTies'
  | 'discoveredPostLinks';

export type FieldWriteStrategy = 'overwrite' | 'append';

export interface FieldSyncItemConfig {
  fieldKey: ChromaSyncableFieldKey;
  label: string;
  notionColumnName: string;
  checked: boolean;
  writeStrategy: FieldWriteStrategy;
  existingNotionValue: string;
  incomingValue: string;
  hasExistingDataConflict: boolean;
}

export interface ContactCardVersionSnapshot {
  versionId: string;
  versionLabel: string;
  timestamp: string;
  author:
    | 'Chroma Agent'
    | 'Brianna'
    | "Brianna's Desk Collab Table (c4357c4d-75c0-810f-95a6-0003bcac8153)"
    | "Max's Production Baseline";
  changesDescription: string;
  chromaSignature: string;
  notionVersionHistoryUrl: string;
  snapshotData: {
    teamTake: TeamTakeType;
    verdict: VerdictType;
    stage: StageType;
    researchNotes: string;
    vettingDossier: VettingDossier;
  };
}

export interface ModificationAttributionBlob {
  authorMode: ModificationAuthorType;
  lastUpdatedAt: string;
  blobId?: string;
  lastModifiedBy?: 'agent-only' | 'brianna' | 'agent-and-brianna';
  agentModifiedAt?: string;
  agentModificationSummary?: string;
  briannaModified?: boolean;
  briannaModifiedAt?: string;
  briannaModificationSummary?: string;
  agentBlob: {
    timestamp: string;
    toneModeApplied: string;
    fieldsGenerated: string[];
    agentCommentDraft: string;
    agentTeamTake: TeamTakeType;
    agentVerdict: VerdictType;
    summary: string;
  };
  briannaBlob: {
    hasBriannaEdits: boolean;
    timestamp?: string;
    fieldsModifiedByBrianna: string[];
    briannaCommentOverride?: string;
    briannaTeamTakeOverride?: TeamTakeType;
    briannaVerdictOverride?: VerdictType;
    briannaActionNote?: string;
  };
  serializedDiffBlob: string;
}

export interface CreatorRecord {
  id: string;
  rank: number;
  isTopTenPriority: boolean;
  isReferenceBenchmark?: boolean;
  savedStoriesWatched?: string[];
  toneOverride?: ProjectToneMode | 'reference-locked' | 'global';
  bossCritiqueNote?: string;
  originalStructuredReference?: string;
  name: string;
  handle: string;
  niche: string;
  platforms: SocialPlatformType[];
  followersCount: string;
  avgEngagementRate: string;
  mainLink: string;
  verdict: VerdictType;
  stage: StageType;
  teamTake: TeamTakeType;
  owner: string;
  vettedDate?: string;
  flagNote?: string;
  researchNotes: string; // Existing pre-vetting research notes on their Notion page
  watchedItems: WatchedItem[];
  competitorTies: CompetitorTie[];
  vettingDossier: VettingDossier;
  baselineDossier?: VettingDossier; // Preserves original creator-specific rich dossier across tone switches
  status: 'idle' | 'researching' | 'completed' | 'error';
  notionSyncStatus: 'unsynced' | 'syncing' | 'synced';
  notionPageId?: string;
  notionPageUrl: string;
  notionLastSyncedAt?: string;
  notionSyncOperation?: 'created' | 'updated';
  groundingSources?: GroundingSource[];
  errorMessage?: string;
  // Attribution Blob (AI Agent vs. Brianna) & Pre-Live Staging Table State
  modificationBlob?: ModificationAttributionBlob;
  preLiveStagingStatus?: PreLiveStagingStatus;
  notionStagingPageId?: string;
  notionStagingTableUrl?: string;
  notionStagingPushedAt?: string;
  notionStagingCheckedByBrianna?: boolean;
  madeLiveAt?: string;
  // Version Control, Latest Agent Run Changes, Chroma Agent Signature & Brianna's Desk Live Collab Migration
  lastChangedAt?: string;
  notionVersionControlUrl?: string;
  latestAgentRunChangesDescription?: string;
  chromaAgentSignature?: string;
  versionHistory?: ContactCardVersionSnapshot[];
  activeVersionId?: string;
  existingNotionTableData?: Partial<Record<ChromaSyncableFieldKey, string>>;
  hasExistingNotionData?: boolean;
  migratedToMaxProductionAt?: string;
}

export interface VettingQuestionsConfig {
  q1: string;
  q2: string;
  q3: string;
  q4: string;
  q5: string;
  leadHookPrompt: string;
  gutFeelingPrompt: string;
}

export interface ScannedNotionPageItem {
  id: string;
  title: string;
  type: 'hub_page' | 'database_view' | 'creator_page' | 'sop_block';
  url: string;
  lockedProperties: string[];
  extractedSummary: string;
  lastScannedAt: string;
}

export interface NotionWorkspaceScanResult {
  scanTimestamp: string;
  scanMode: 'live_notion_api' | 'indexed_workspace_blueprint';
  totalPagesIndexed: number;
  totalBlocksIndexed: number;
  outreachHubUrl: string;
  myContactsDeskUrl: string;
  missionObjective: string;
  vettingProtocolRules: string[];
  lockedSchemaColumns: string[];
  lockedTabs: string[];
  competitorWatchlist: string[];
  specialCreatorFlags: {
    creatorName: string;
    flagType: string;
    instruction: string;
  }[];
  scannedPages: ScannedNotionPageItem[];
  customUserReferenceNotes: string;
}

export interface NotionDatabaseColumnSpec {
  columnName: string;
  notionType: 'title' | 'number' | 'select' | 'multi_select' | 'url' | 'date' | 'rich_text';
  agentSourceField: string;
  category: 'Identity & Metrics' | 'Platforms & Links' | 'Notion Desk Status' | 'Competitor Radar' | '5 Evaluation Answers & @Bree Output';
  description: string;
  lockedInDesk?: boolean;
  options?: string[];
}

export interface NotionDatabaseFormatResult {
  formatted: boolean;
  databaseId: string;
  databaseUrl: string;
  formattedAt: string;
  mode: 'live_notion_api' | 'notion_desk_schema_ready';
  totalColumnsConfigured: number;
  columns: NotionDatabaseColumnSpec[];
}

