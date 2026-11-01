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
  status: 'idle' | 'researching' | 'completed' | 'error';
  notionSyncStatus: 'unsynced' | 'syncing' | 'synced';
  notionPageId?: string;
  notionPageUrl: string;
  notionLastSyncedAt?: string;
  notionSyncOperation?: 'created' | 'updated';
  groundingSources?: GroundingSource[];
  errorMessage?: string;
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

