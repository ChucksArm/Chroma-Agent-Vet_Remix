import React, { useState, useMemo } from 'react';
import {
  Database,
  Check,
  ExternalLink,
  ShieldCheck,
  Bot,
  UserCheck,
  GitCompare,
  ArrowUpRight,
  RefreshCw,
  Copy,
  AlertTriangle,
  Eye,
  History,
  RotateCcw,
  FileCheck2,
  Layers,
  Clock,
  Sparkles,
  X
} from 'lucide-react';
import {
  CreatorRecord,
  ModificationAttributionBlob,
  ModificationAuthorType,
  ProjectToneMode,
  ChromaSyncableFieldKey,
  FieldWriteStrategy,
  FieldSyncItemConfig,
  ContactCardVersionSnapshot
} from '../types';
import {
  NOTION_DESK_URL,
  BRIANNAS_DESK_COLLAB_NOTION_ID,
  BRIANNAS_DESK_COLLAB_NOTION_URL,
  MAX_PRODUCTION_TABLE_ID,
  MAX_PRODUCTION_TABLE_URL,
  formatChromaAgentSignature,
  applyChromaSignatureAndWriteStrategy
} from '../data/initialCreators';

export const NOTION_PRELIVE_STAGING_TABLE_URL =
  'https://app.notion.com/p/Chromatics-PreLive-Staging-Table-40457c4d75c0819d90c8cb35f1024e89?v=staging-review';

export const ALL_SYNCABLE_FIELDS_META: {
  fieldKey: ChromaSyncableFieldKey;
  label: string;
  notionColumnName: string;
}[] = [
  {
    fieldKey: 'overallSummary',
    label: 'Overall Summary',
    notionColumnName: 'Overall Summary'
  },
  {
    fieldKey: 'watchedOrRead',
    label: 'Q1: What Video/Post I Watched in Full',
    notionColumnName: 'Q1: Watched or Read (Titles & Links)'
  },
  {
    fieldKey: 'audienceProfile',
    label: 'Q2: Who Their Audience Feels Like',
    notionColumnName: 'Q2: Audience Profile'
  },
  {
    fieldKey: 'readingAppsEreadersAndAI',
    label: 'Q3: Reading Apps, E-Readers & AI',
    notionColumnName: 'Q3: Reading Apps, E-Readers & AI'
  },
  {
    fieldKey: 'competitorTiesAnalysis',
    label: 'Q4: Brand / Competitor Ties Noticed',
    notionColumnName: 'Q4: Competitor Ties Analysis'
  },
  {
    fieldKey: 'recommendChromaticsWhy',
    label: 'Q5: Recommend Chromatics & Why',
    notionColumnName: 'Q5: Recommend Chromatics & Why'
  },
  {
    fieldKey: 'outreachLeadHook',
    label: 'The One Thing to Lead With in Outreach Email',
    notionColumnName: 'Outreach Lead Hook'
  },
  {
    fieldKey: 'gutFeeling',
    label: 'Gut Feeling on This Creator',
    notionColumnName: 'Gut Feeling'
  },
  {
    fieldKey: 'formattedNotionComment',
    label: 'Shrunk-Down Concatenated @Bree Notion Comment',
    notionColumnName: 'Notion Comment (@Bree)'
  },
  {
    fieldKey: 'teamTake',
    label: 'Team Take (Strong fit / Maybe / Not a fit)',
    notionColumnName: 'Team take'
  },
  {
    fieldKey: 'verdict',
    label: 'Verdict (Approved / Pending Review / Hold)',
    notionColumnName: 'Verdict'
  },
  {
    fieldKey: 'stage',
    label: 'Stage (To vet / Vetted / Outreach / Archived)',
    notionColumnName: 'Stage'
  },
  {
    fieldKey: 'researchNotes',
    label: 'Research Notes & Workspace Flags',
    notionColumnName: 'Research notes'
  },
  {
    fieldKey: 'competitorWatchlistTies',
    label: '13-Competitor Watchlist Ties',
    notionColumnName: 'Competitor Watchlist Ties'
  },
  {
    fieldKey: 'discoveredPostLinks',
    label: 'Discovered Social Post Links',
    notionColumnName: 'Discovered Post Links'
  }
];

export function getCreatorFieldValue(
  creator: CreatorRecord,
  fieldKey: ChromaSyncableFieldKey
): string {
  switch (fieldKey) {
    case 'overallSummary':
      return creator.vettingDossier.overallSummary || '';
    case 'watchedOrRead':
      return creator.vettingDossier.watchedOrRead || '';
    case 'audienceProfile':
      return creator.vettingDossier.audienceProfile || '';
    case 'readingAppsEreadersAndAI':
      return creator.vettingDossier.readingAppsEreadersAndAI || '';
    case 'competitorTiesAnalysis':
      return creator.vettingDossier.competitorTiesAnalysis || '';
    case 'recommendChromaticsWhy':
      return creator.vettingDossier.recommendChromaticsWhy || '';
    case 'outreachLeadHook':
      return creator.vettingDossier.outreachLeadHook || '';
    case 'gutFeeling':
      return creator.vettingDossier.gutFeeling || '';
    case 'formattedNotionComment':
      return creator.vettingDossier.formattedNotionComment || '';
    case 'teamTake':
      return creator.teamTake;
    case 'verdict':
      return creator.verdict;
    case 'stage':
      return creator.stage;
    case 'researchNotes':
      return [creator.flagNote, creator.researchNotes].filter(Boolean).join(' | ');
    case 'competitorWatchlistTies':
      return creator.competitorTies.length > 0
        ? creator.competitorTies.map((t) => `${t.company} (${t.relationshipType})`).join(', ')
        : 'None detected';
    case 'discoveredPostLinks':
      return (creator.watchedItems || [])
        .map((w) => `[${w.platform} · ${w.date}] "${w.title}" (${w.url})`)
        .join(' | ');
  }
}

export function buildDefaultFieldSyncConfigs(
  creator: CreatorRecord,
  checkedMap: Record<ChromaSyncableFieldKey, boolean>,
  strategyMap: Record<ChromaSyncableFieldKey, FieldWriteStrategy>
): FieldSyncItemConfig[] {
  const existingMap = creator.existingNotionTableData || {};
  return ALL_SYNCABLE_FIELDS_META.map((meta) => {
    const existingVal = existingMap[meta.fieldKey] || '';
    const incomingVal = getCreatorFieldValue(creator, meta.fieldKey);
    return {
      fieldKey: meta.fieldKey,
      label: meta.label,
      notionColumnName: meta.notionColumnName,
      checked: checkedMap[meta.fieldKey] ?? true,
      writeStrategy: strategyMap[meta.fieldKey] ?? 'overwrite',
      existingNotionValue: existingVal,
      incomingValue: incomingVal,
      hasExistingDataConflict: Boolean(existingVal && existingVal.trim().length > 0)
    };
  });
}

/**
 * Reverts a CreatorRecord back to a chosen ContactCardVersionSnapshot prior to migrating checked fields.
 */
export function revertCreatorToVersion(
  creator: CreatorRecord,
  targetVersionId: string
): CreatorRecord {
  const history = creator.versionHistory || [];
  const targetSnap = history.find((v) => v.versionId === targetVersionId);
  if (!targetSnap) return creator;

  const now = new Date().toISOString().replace('T', ' ').substring(0, 16);
  const revertSig = `[Chroma Agent · Reverted to ${targetSnap.versionId} at ${now}]`;

  return {
    ...creator,
    teamTake: targetSnap.snapshotData.teamTake,
    verdict: targetSnap.snapshotData.verdict,
    stage: targetSnap.snapshotData.stage,
    researchNotes: targetSnap.snapshotData.researchNotes,
    vettingDossier: {
      ...targetSnap.snapshotData.vettingDossier
    },
    activeVersionId: targetSnap.versionId,
    lastChangedAt: now,
    chromaAgentSignature: revertSig,
    latestAgentRunChangesDescription: `Reverted contact card to ${targetSnap.versionLabel} (${targetSnap.timestamp}) prior to migrating checked fields to Max's Production Table.`,
    notionSyncStatus: 'unsynced'
  };
}

/**
 * Builds or initializes the ModificationAttributionBlob for a creator record,
 * clearly differentiating between AI Agent modifications and Brianna's manual modifications.
 */
export function buildCreatorAttributionBlob(
  creator: CreatorRecord,
  toneMode: ProjectToneMode = 'hybrid-nyc-bree'
): ModificationAttributionBlob {
  if (creator.modificationBlob) {
    return creator.modificationBlob;
  }

  const nowIso = creator.lastChangedAt || '2026-10-31 18:45';
  const isBriannaBenchmark = creator.rank <= 3 || Boolean(creator.isReferenceBenchmark);
  const hasBriannaOverride =
    isBriannaBenchmark ||
    Boolean(creator.toneOverride && creator.toneOverride !== 'global') ||
    creator.stage === 'Vetted';

  const authorMode: ModificationAuthorType = isBriannaBenchmark
    ? 'brianna'
    : hasBriannaOverride
    ? 'both-agent-and-brianna'
    : 'ai-agent';

  const agentFields = [
    'Watched / Read (Q1)',
    'Audience Profile (Q2)',
    'Apps, E-Readers & AI (Q3)',
    'Competitor Ties (Q4)',
    'Recommend Chromatics (Q5)',
    'Outreach Lead Hook',
    'Gut Feeling',
    'Notion Comment (@Bree)'
  ];

  const briannaFields = isBriannaBenchmark
    ? ['Reference Benchmark Note (@Bree)', 'Verdict: Approved', 'Team take: Strong fit']
    : hasBriannaOverride
    ? ['Tone Override', 'Brianna Editorial Polish (@Bree)']
    : [];

  const agentDraft =
    creator.originalStructuredReference ||
    creator.vettingDossier.structuredResearchComment ||
    creator.vettingDossier.formattedNotionComment;

  const briannaDraft = hasBriannaOverride
    ? creator.vettingDossier.formattedNotionComment
    : undefined;

  const serializedDiffBlob = JSON.stringify(
    {
      attributionAuthor:
        authorMode === 'ai-agent'
          ? 'AI Vetting Agent Only'
          : authorMode === 'brianna'
          ? 'Brianna (Manual Human Note)'
          : 'AI Agent + Brianna Modified',
      chromaAgentSignature:
        creator.chromaAgentSignature || formatChromaAgentSignature(nowIso),
      briannasDeskCollabNotionId: BRIANNAS_DESK_COLLAB_NOTION_ID,
      aiAgentModification: {
        timestamp: nowIso,
        toneEngine: toneMode,
        fieldsGenerated: agentFields,
        teamTakeSuggested: creator.teamTake,
        verdictSuggested: creator.verdict,
        agentBaselineExcerpt: String(agentDraft || '').slice(0, 280)
      },
      briannaModification: {
        modifiedByBrianna: hasBriannaOverride,
        timestamp: hasBriannaOverride ? nowIso : null,
        fieldsEdited: briannaFields,
        briannaFinalExcerpt: briannaDraft ? String(briannaDraft).slice(0, 280) : null
      }
    },
    null,
    2
  );

  const agentSummaryText = `Chroma Agent synthesized ${
    creator.watchedItems?.length || 2
  } social posts, 13-competitor watchlist ties, and 5 evaluation answers in ${toneMode} voice.`;
  const briannaSummaryText = isBriannaBenchmark
    ? `Locked Gold-Standard Reference Benchmark (#${creator.rank}) authored/curated by Brianna & Bree.`
    : hasBriannaOverride
    ? 'Brianna customized voice/fields on top of Chroma Agent research.'
    : 'No manual overrides by Brianna yet (100% Chroma Agent draft).';

  return {
    authorMode,
    lastUpdatedAt: nowIso,
    blobId: `blob-${creator.id}-${creator.rank}`,
    lastModifiedBy:
      authorMode === 'both-agent-and-brianna'
        ? 'agent-and-brianna'
        : authorMode === 'brianna'
        ? 'brianna'
        : 'agent-only',
    agentModifiedAt: nowIso,
    agentModificationSummary: agentSummaryText,
    briannaModified: hasBriannaOverride,
    briannaModifiedAt: hasBriannaOverride ? nowIso : undefined,
    briannaModificationSummary: briannaSummaryText,
    agentBlob: {
      timestamp: nowIso,
      toneModeApplied: toneMode,
      fieldsGenerated: agentFields,
      agentCommentDraft: agentDraft,
      agentTeamTake: creator.teamTake,
      agentVerdict: creator.verdict,
      summary: agentSummaryText
    },
    briannaBlob: {
      hasBriannaEdits: hasBriannaOverride,
      timestamp: hasBriannaOverride ? nowIso : undefined,
      fieldsModifiedByBrianna: briannaFields,
      briannaCommentOverride: briannaDraft,
      briannaTeamTakeOverride: hasBriannaOverride ? creator.teamTake : undefined,
      briannaVerdictOverride: hasBriannaOverride ? creator.verdict : undefined,
      briannaActionNote: briannaSummaryText
    },
    serializedDiffBlob
  };
}

/**
 * Updates a creator's ModificationAttributionBlob, Chroma Agent signature, latest run description,
 * and version history when the AI Agent runs or rewrites tone.
 */
export function recordAgentModificationOnCreator(
  creator: CreatorRecord,
  toneMode: ProjectToneMode,
  actionSummary?: string
): CreatorRecord {
  const now = new Date().toISOString().replace('T', ' ').substring(0, 16);
  const sig = formatChromaAgentSignature(now);
  const existingBlob = buildCreatorAttributionBlob(creator, toneMode);
  const keepBrianna = existingBlob.briannaBlob.hasBriannaEdits;
  const nextAuthor: ModificationAuthorType = keepBrianna ? 'both-agent-and-brianna' : 'ai-agent';

  const summaryText =
    actionSummary ||
    `Chroma Agent audited ${creator.name} across ${creator.platforms.join(', ')} (${toneMode} mode) & signed all 15 fields.`;

  const nextAgentBlob = {
    timestamp: now,
    toneModeApplied: toneMode,
    fieldsGenerated: [
      'Watched / Read (Q1)',
      'Audience Profile (Q2)',
      'Apps, E-Readers & AI (Q3)',
      'Competitor Ties (Q4)',
      'Recommend Chromatics (Q5)',
      'Outreach Lead Hook',
      'Gut Feeling',
      'Notion Comment (@Bree)'
    ],
    agentCommentDraft: creator.vettingDossier.formattedNotionComment,
    agentTeamTake: creator.teamTake,
    agentVerdict: creator.verdict,
    summary: summaryText
  };

  const serializedDiffBlob = JSON.stringify(
    {
      attributionAuthor:
        nextAuthor === 'both-agent-and-brianna'
          ? 'AI Agent + Brianna Modified'
          : 'AI Vetting Agent Only',
      chromaAgentSignature: sig,
      briannasDeskCollabNotionId: BRIANNAS_DESK_COLLAB_NOTION_ID,
      aiAgentModification: {
        timestamp: now,
        toneEngine: toneMode,
        fieldsGenerated: nextAgentBlob.fieldsGenerated,
        teamTakeSuggested: creator.teamTake,
        verdictSuggested: creator.verdict,
        agentCommentExcerpt: creator.vettingDossier.formattedNotionComment.slice(0, 320)
      },
      briannaModification: existingBlob.briannaBlob.hasBriannaEdits
        ? {
            modifiedByBrianna: true,
            timestamp: existingBlob.briannaBlob.timestamp,
            fieldsEdited: existingBlob.briannaBlob.fieldsModifiedByBrianna,
            briannaActionNote: existingBlob.briannaBlob.briannaActionNote,
            briannaCommentExcerpt: (
              existingBlob.briannaBlob.briannaCommentOverride || ''
            ).slice(0, 320)
          }
        : { modifiedByBrianna: false, note: 'Unmodified by Brianna' }
    },
    null,
    2
  );

  const prevHistory = creator.versionHistory || [];
  const nextVersionNumber = `v2.${prevHistory.length}-agent`;
  const vcUrl =
    creator.notionVersionControlUrl ||
    `https://www.notion.so/${BRIANNAS_DESK_COLLAB_NOTION_ID.replace(/-/g, '')}?p=${creator.id}&v=version-history`;

  const newSnapshot: ContactCardVersionSnapshot = {
    versionId: nextVersionNumber,
    versionLabel: `${nextVersionNumber} — Chroma Agent Run (${toneMode} · ${now})`,
    timestamp: now,
    author: 'Chroma Agent',
    changesDescription: `${summaryText} ${sig}`,
    chromaSignature: sig,
    notionVersionHistoryUrl: vcUrl,
    snapshotData: {
      teamTake: creator.teamTake,
      verdict: creator.verdict,
      stage: creator.stage,
      researchNotes: creator.researchNotes,
      vettingDossier: { ...creator.vettingDossier }
    }
  };

  return {
    ...creator,
    notionSyncStatus: 'unsynced',
    preLiveStagingStatus: 'in-staging-table',
    notionStagingCheckedByBrianna: false,
    lastChangedAt: now,
    chromaAgentSignature: sig,
    latestAgentRunChangesDescription: `${summaryText} ${sig}`,
    notionVersionControlUrl: vcUrl,
    versionHistory: [...prevHistory, newSnapshot],
    activeVersionId: nextVersionNumber,
    modificationBlob: {
      authorMode: nextAuthor,
      lastUpdatedAt: now,
      blobId: `blob-${creator.id}-${creator.rank}`,
      lastModifiedBy:
        nextAuthor === 'both-agent-and-brianna' ? 'agent-and-brianna' : 'agent-only',
      agentModifiedAt: now,
      agentModificationSummary: summaryText,
      briannaModified: existingBlob.briannaBlob.hasBriannaEdits,
      briannaModifiedAt: existingBlob.briannaBlob.timestamp,
      briannaModificationSummary: existingBlob.briannaBlob.briannaActionNote,
      agentBlob: nextAgentBlob,
      briannaBlob: existingBlob.briannaBlob,
      serializedDiffBlob
    }
  };
}

/**
 * Updates a creator's ModificationAttributionBlob & version history when Brianna manually edits any field,
 * overrides tone, or resolves a conflict.
 */
export function recordBriannaModificationOnCreator(
  previousCreator: CreatorRecord,
  updatedCreator: CreatorRecord,
  modifiedFieldNames: string[],
  briannaActionDescription: string,
  toneMode: ProjectToneMode = 'hybrid-nyc-bree'
): CreatorRecord {
  const now = new Date().toISOString().replace('T', ' ').substring(0, 16);
  const sig = formatChromaAgentSignature(now);
  const baseBlob = buildCreatorAttributionBlob(previousCreator, toneMode);

  const mergedFields = Array.from(
    new Set([...(baseBlob.briannaBlob.fieldsModifiedByBrianna || []), ...modifiedFieldNames])
  );

  const nextAuthor: ModificationAuthorType =
    baseBlob.authorMode === 'brianna' ? 'brianna' : 'both-agent-and-brianna';

  const nextBriannaBlob = {
    hasBriannaEdits: true,
    timestamp: now,
    fieldsModifiedByBrianna: mergedFields,
    briannaCommentOverride: updatedCreator.vettingDossier.formattedNotionComment,
    briannaTeamTakeOverride: updatedCreator.teamTake,
    briannaVerdictOverride: updatedCreator.verdict,
    briannaActionNote: briannaActionDescription
  };

  const serializedDiffBlob = JSON.stringify(
    {
      attributionAuthor:
        nextAuthor === 'brianna'
          ? 'Brianna (Manual Human Note)'
          : 'AI Agent + Brianna Modified',
      chromaAgentSignature: sig,
      briannasDeskCollabNotionId: BRIANNAS_DESK_COLLAB_NOTION_ID,
      aiAgentModification: {
        timestamp: baseBlob.agentBlob.timestamp,
        toneEngine: baseBlob.agentBlob.toneModeApplied,
        fieldsGenerated: baseBlob.agentBlob.fieldsGenerated,
        agentTeamTake: baseBlob.agentBlob.agentTeamTake,
        agentVerdict: baseBlob.agentBlob.agentVerdict,
        agentOriginalComment: baseBlob.agentBlob.agentCommentDraft.slice(0, 320)
      },
      briannaModification: {
        modifiedByBrianna: true,
        timestamp: now,
        fieldsEditedByBrianna: mergedFields,
        briannaActionNote: briannaActionDescription,
        briannaTeamTake: updatedCreator.teamTake,
        briannaVerdict: updatedCreator.verdict,
        briannaEditedComment: updatedCreator.vettingDossier.formattedNotionComment.slice(0, 320)
      }
    },
    null,
    2
  );

  const prevHistory = previousCreator.versionHistory || [];
  const nextVersionId = `v2.${prevHistory.length}-brianna`;
  const vcUrl =
    previousCreator.notionVersionControlUrl ||
    `https://www.notion.so/${BRIANNAS_DESK_COLLAB_NOTION_ID.replace(/-/g, '')}?p=${previousCreator.id}&v=version-history`;

  const newSnapshot: ContactCardVersionSnapshot = {
    versionId: nextVersionId,
    versionLabel: `${nextVersionId} — Brianna Edit (${modifiedFieldNames.slice(0, 2).join(', ')} · ${now})`,
    timestamp: now,
    author: 'Brianna',
    changesDescription: `${briannaActionDescription} (${modifiedFieldNames.join(', ')}) ${sig}`,
    chromaSignature: sig,
    notionVersionHistoryUrl: vcUrl,
    snapshotData: {
      teamTake: updatedCreator.teamTake,
      verdict: updatedCreator.verdict,
      stage: updatedCreator.stage,
      researchNotes: updatedCreator.researchNotes,
      vettingDossier: { ...updatedCreator.vettingDossier }
    }
  };

  return {
    ...updatedCreator,
    notionSyncStatus: 'unsynced',
    preLiveStagingStatus: 'in-staging-table',
    notionStagingCheckedByBrianna: false,
    lastChangedAt: now,
    chromaAgentSignature: sig,
    latestAgentRunChangesDescription:
      previousCreator.latestAgentRunChangesDescription ||
      `${ baseBlob.agentBlob.summary } | Latest update: ${briannaActionDescription} ${sig}`,
    notionVersionControlUrl: vcUrl,
    versionHistory: [...prevHistory, newSnapshot],
    activeVersionId: nextVersionId,
    modificationBlob: {
      authorMode: nextAuthor,
      lastUpdatedAt: now,
      blobId: `blob-${updatedCreator.id}-${updatedCreator.rank}`,
      lastModifiedBy:
        nextAuthor === 'brianna' ? 'brianna' : 'agent-and-brianna',
      agentModifiedAt: baseBlob.agentBlob.timestamp,
      agentModificationSummary: baseBlob.agentBlob.summary,
      briannaModified: true,
      briannaModifiedAt: now,
      briannaModificationSummary: briannaActionDescription,
      agentBlob: baseBlob.agentBlob,
      briannaBlob: nextBriannaBlob,
      serializedDiffBlob
    }
  };
}

interface PreLiveStagingTableViewProps {
  creators: CreatorRecord[];
  projectToneMode: ProjectToneMode;
  selectedCreatorId: string;
  onSelectCreator: (id: string) => void;
  onOpenDossierInDesk: (creator: CreatorRecord) => void;
  onPushToNotionStagingTable: (creatorsToStage: CreatorRecord[]) => Promise<void>;
  onToggleCheckedInNotionStaging: (creatorId: string, checked: boolean) => void;
  onMarkAllCheckedInNotionStaging: (creatorIds: string[], checked: boolean) => void;
  onMakeLiveInProductionNotion: (
    creatorsToMakeLive: CreatorRecord[],
    options?: {
      checkedFields?: ChromaSyncableFieldKey[];
      fieldWriteStrategies?: Record<ChromaSyncableFieldKey, FieldWriteStrategy>;
      fetchFromBriannasDeskCollabFirst?: boolean;
    }
  ) => Promise<void>;
  onRevertCreatorVersion?: (creatorId: string, versionId: string) => void;
  onPreflightReadNotionTable?: (creatorsToCheck: CreatorRecord[]) => Promise<void>;
  isPushingStaging: boolean;
  isMakingLive: boolean;
  stagingTableUrl: string;
  onTriggerToast: (msg: string) => void;
}

export default function PreLiveStagingTableView({
  creators,
  projectToneMode,
  selectedCreatorId,
  onSelectCreator,
  onOpenDossierInDesk,
  onPushToNotionStagingTable,
  onToggleCheckedInNotionStaging,
  onMarkAllCheckedInNotionStaging,
  onMakeLiveInProductionNotion,
  onRevertCreatorVersion,
  onPreflightReadNotionTable,
  isPushingStaging,
  isMakingLive,
  stagingTableUrl,
  onTriggerToast
}: PreLiveStagingTableViewProps) {
  const [authorFilter, setAuthorFilter] = useState<'all' | ModificationAuthorType>('all');
  const [stageFilter, setStageFilter] = useState<
    'all' | 'needs-notion-staging' | 'ready-to-check' | 'checked-ready-live' | 'live'
  >('all');
  const [inspectedBlobCreatorId, setInspectedBlobCreatorId] = useState<string>(selectedCreatorId);
  const [isReadingNotionPreflight, setIsReadingNotionPreflight] = useState<boolean>(false);
  const [hasCompletedPreflightScan, setHasCompletedPreflightScan] = useState<boolean>(true);
  const [versionHistoryModalCreatorId, setVersionHistoryModalCreatorId] = useState<string | null>(
    null
  );
  const [selectedRevertVersions, setSelectedRevertVersions] = useState<Record<string, string>>({});

  // Per-field checkboxes: which fields will be sent/migrated to the Notion Table
  const [checkedFieldsMap, setCheckedFieldsMap] = useState<
    Record<ChromaSyncableFieldKey, boolean>
  >(() =>
    ALL_SYNCABLE_FIELDS_META.reduce((acc, item) => {
      acc[item.fieldKey] = true;
      return acc;
    }, {} as Record<ChromaSyncableFieldKey, boolean>)
  );

  // Per-field write strategy: 'overwrite' vs 'append' when existing data is present in Notion
  const [fieldWriteStrategyMap, setFieldWriteStrategyMap] = useState<
    Record<ChromaSyncableFieldKey, FieldWriteStrategy>
  >(() =>
    ALL_SYNCABLE_FIELDS_META.reduce((acc, item) => {
      acc[item.fieldKey] = 'append';
      return acc;
    }, {} as Record<ChromaSyncableFieldKey, FieldWriteStrategy>)
  );

  const enrichedCreators = useMemo(() => {
    return creators.map((c) => {
      const blob = buildCreatorAttributionBlob(c, projectToneMode);
      const status = c.preLiveStagingStatus || 'in-staging-table';
      const isChecked = Boolean(c.notionStagingCheckedByBrianna);
      return {
        creator: c,
        blob,
        status,
        isChecked
      };
    });
  }, [creators, projectToneMode]);

  const filteredRows = useMemo(() => {
    return enrichedCreators.filter((item) => {
      if (authorFilter !== 'all' && item.blob.authorMode !== authorFilter) return false;
      if (stageFilter === 'needs-notion-staging' && item.status !== 'in-staging-table') return false;
      if (
        stageFilter === 'ready-to-check' &&
        !(item.status === 'pushed-to-notion-staging' && !item.isChecked)
      ) {
        return false;
      }
      if (stageFilter === 'checked-ready-live' && !item.isChecked) return false;
      if (stageFilter === 'live' && item.status !== 'live') return false;
      return true;
    });
  }, [enrichedCreators, authorFilter, stageFilter]);

  const counts = useMemo(() => {
    const agentOnly = enrichedCreators.filter((i) => i.blob.authorMode === 'ai-agent').length;
    const briannaOnly = enrichedCreators.filter((i) => i.blob.authorMode === 'brianna').length;
    const both = enrichedCreators.filter(
      (i) => i.blob.authorMode === 'both-agent-and-brianna'
    ).length;
    const pushedToStaging = enrichedCreators.filter(
      (i) =>
        i.status === 'pushed-to-notion-staging' ||
        i.status === 'checked-in-notion' ||
        i.status === 'live'
    ).length;
    const checkedInNotion = enrichedCreators.filter((i) => i.isChecked).length;
    const madeLive = enrichedCreators.filter((i) => i.status === 'live').length;
    const withExistingNotionData = enrichedCreators.filter(
      (i) => i.creator.hasExistingNotionData !== false
    ).length;

    return {
      agentOnly,
      briannaOnly,
      both,
      pushedToStaging,
      checkedInNotion,
      madeLive,
      withExistingNotionData
    };
  }, [enrichedCreators]);

  const inspectedItem = useMemo(() => {
    return (
      enrichedCreators.find((i) => i.creator.id === inspectedBlobCreatorId) ||
      filteredRows[0] ||
      enrichedCreators[0]
    );
  }, [enrichedCreators, filteredRows, inspectedBlobCreatorId]);

  const checkedCreatorsReadyToMakeLive = useMemo(
    () =>
      enrichedCreators
        .filter((i) => i.isChecked && i.status !== 'live')
        .map((i) => i.creator),
    [enrichedCreators]
  );

  const checkedFieldKeysList = useMemo(
    () =>
      ALL_SYNCABLE_FIELDS_META.filter((m) => checkedFieldsMap[m.fieldKey]).map(
        (m) => m.fieldKey
      ),
    [checkedFieldsMap]
  );

  const inspectedFieldConfigs = useMemo(() => {
    if (!inspectedItem) return [];
    return buildDefaultFieldSyncConfigs(
      inspectedItem.creator,
      checkedFieldsMap,
      fieldWriteStrategyMap
    );
  }, [inspectedItem, checkedFieldsMap, fieldWriteStrategyMap]);

  const versionModalCreator = useMemo(
    () =>
      versionHistoryModalCreatorId
        ? creators.find((c) => c.id === versionHistoryModalCreatorId) || null
        : null,
    [creators, versionHistoryModalCreatorId]
  );

  const handleToggleFieldCheckbox = (fieldKey: ChromaSyncableFieldKey) => {
    setCheckedFieldsMap((prev) => ({
      ...prev,
      [fieldKey]: !prev[fieldKey]
    }));
  };

  const handleToggleAllFieldCheckboxes = (checked: boolean) => {
    setCheckedFieldsMap(
      ALL_SYNCABLE_FIELDS_META.reduce((acc, item) => {
        acc[item.fieldKey] = checked;
        return acc;
      }, {} as Record<ChromaSyncableFieldKey, boolean>)
    );
  };

  const handleChangeFieldStrategy = (
    fieldKey: ChromaSyncableFieldKey,
    strategy: FieldWriteStrategy
  ) => {
    setFieldWriteStrategyMap((prev) => ({
      ...prev,
      [fieldKey]: strategy
    }));
  };

  const handleSetAllFieldStrategies = (strategy: FieldWriteStrategy) => {
    setFieldWriteStrategyMap(
      ALL_SYNCABLE_FIELDS_META.reduce((acc, item) => {
        acc[item.fieldKey] = strategy;
        return acc;
      }, {} as Record<ChromaSyncableFieldKey, FieldWriteStrategy>)
    );
    onTriggerToast(
      strategy === 'append'
        ? 'Set all checked fields to APPEND to the bottom of existing Notion Table data (with Chroma Agent signature & timestamp).'
        : 'Set all checked fields to OVERWRITE existing Notion Table data (with Chroma Agent signature & timestamp).'
    );
  };

  const handleRunPreflightReadCheck = async () => {
    setIsReadingNotionPreflight(true);
    try {
      if (onPreflightReadNotionTable) {
        await onPreflightReadNotionTable(filteredRows.map((r) => r.creator));
      }
      setHasCompletedPreflightScan(true);
      onTriggerToast(
        `Pre-Flight Notion Scan Complete: Read Brianna's Desk (${BRIANNAS_DESK_COLLAB_NOTION_ID}) & Max's Production Table. Existing data detected on ${counts.withExistingNotionData} rows — choose Overwrite or Append per field below.`
      );
    } finally {
      setIsReadingNotionPreflight(false);
    }
  };

  const handleCopyBlobJson = (blob: ModificationAttributionBlob, name: string) => {
    navigator.clipboard.writeText(blob.serializedDiffBlob);
    onTriggerToast(`Copied Agent vs. Brianna Modification Attribution Blob for ${name}!`);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Pre-Flight Notion Read Check, Brianna's Desk (c4357c4d-75c0-810f-95a6-0003bcac8153) & Migration to Max's Production Table */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 sm:p-6 space-y-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-stone-200 pb-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-indigo-700">
              <GitCompare className="w-4 h-4" />
              <span>
                NOTION PRE-FLIGHT READ CHECK &middot; BRIANNA&rsquo;S DESK COLLAB TABLE ({BRIANNAS_DESK_COLLAB_NOTION_ID}) &rarr; MAX&rsquo;S PRODUCTION TABLE
              </span>
            </div>
            <h2 className="font-display text-xl font-bold text-slate-900">
              Read Notion First &rarr; Choose Per-Field Overwrite or Append (Chroma Agent Signed) &rarr; Revert Version if Needed &rarr; Migrate to Max&rsquo;s Production Table
            </h2>
            <p className="text-xs text-slate-600 max-w-4xl leading-relaxed">
              The Chroma Agent reads <strong>Brianna&rsquo;s Desk (Live Working Collab Table in Max&rsquo;s Workspace &middot; <code className="font-mono">NOTION_ID: {BRIANNAS_DESK_COLLAB_NOTION_ID}</code>)</strong> and <strong>Max&rsquo;s Production Table</strong> first. When data is already present, you are warned below and can select via <strong>per-field checkboxes</strong> which fields to send and whether to <strong>Overwrite</strong> or <strong>Append to the bottom</strong>. Every updated field automatically receives the <strong>Chroma Agent Signature &amp; Timestamp</strong> (<code className="font-mono">[Chroma Agent &middot; Updated YYYY-MM-DD HH:mm]</code>).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleRunPreflightReadCheck}
              disabled={isReadingNotionPreflight}
              className="px-3.5 py-2.5 text-xs font-semibold text-amber-950 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-amber-700 ${
                  isReadingNotionPreflight ? 'animate-spin' : ''
                }`}
              />
              <span>
                {isReadingNotionPreflight
                  ? "Reading Brianna's Desk in Notion..."
                  : `1. Read Notion Table (${BRIANNAS_DESK_COLLAB_NOTION_ID.slice(0, 8)}...)`}
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                onPushToNotionStagingTable(filteredRows.map((r) => r.creator))
              }
              disabled={isPushingStaging}
              className="px-3.5 py-2.5 text-xs font-semibold text-indigo-950 bg-indigo-50 hover:bg-indigo-100 border border-indigo-300 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Database
                className={`w-3.5 h-3.5 text-indigo-700 ${
                  isPushingStaging ? 'animate-spin' : ''
                }`}
              />
              <span>
                {isPushingStaging
                  ? 'Staging to Notion Review Table...'
                  : `2. Stage ${filteredRows.length} Rows to Notion Staging`}
              </span>
            </button>

            <a
              href={BRIANNAS_DESK_COLLAB_NOTION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2.5 text-xs font-semibold text-slate-800 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <span>Open Brianna&rsquo;s Desk ({BRIANNAS_DESK_COLLAB_NOTION_ID.slice(0, 8)})</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <button
              type="button"
              onClick={() =>
                onMakeLiveInProductionNotion(
                  checkedCreatorsReadyToMakeLive.length > 0
                    ? checkedCreatorsReadyToMakeLive
                    : [inspectedItem.creator],
                  {
                    checkedFields: checkedFieldKeysList,
                    fieldWriteStrategies: fieldWriteStrategyMap,
                    fetchFromBriannasDeskCollabFirst: true
                  }
                )
              }
              disabled={isMakingLive || checkedFieldKeysList.length === 0}
              title={`Fetch Live Working Collab Table (Brianna's Desk ${BRIANNAS_DESK_COLLAB_NOTION_ID}) & migrate ${checkedFieldKeysList.length} checked fields to Max's Production Table`}
              className={`px-4 py-2.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                checkedFieldKeysList.length > 0
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-xs'
                  : 'bg-stone-200 text-slate-500 cursor-not-allowed'
              }`}
            >
              {isMakingLive ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Fetching Brianna&rsquo;s Desk &amp; Migrating to Max&rsquo;s Production...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>
                    3. Fetch Brianna&rsquo;s Desk &amp; Migrate {checkedFieldKeysList.length} Checked Fields to Max&rsquo;s Production Table
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* EXISTING NOTION DATA WARNING BANNER (Triggered after Agent Reads Notion Table) */}
        {hasCompletedPreflightScan && (
          <div className="p-4 rounded-xl bg-amber-50/90 border border-amber-300 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-xs font-bold text-amber-950">
                    PRE-FLIGHT NOTION READ WARNING: EXISTING DATA PRESENT IN NOTION TABLE ({counts.withExistingNotionData} / 40 Contact Cards)
                  </span>
                  <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-white border border-amber-300 rounded text-amber-900">
                    Brianna&rsquo;s Desk ID: {BRIANNAS_DESK_COLLAB_NOTION_ID}
                  </span>
                </div>
                <p className="text-xs text-amber-900 leading-relaxed">
                  The Chroma Agent read the Notion table first and detected existing data on <strong>{inspectedItem?.creator.name} ({inspectedItem?.creator.handle})</strong> and <strong>{counts.withExistingNotionData - 1} other rows</strong>. Sending data in <strong>Overwrite</strong> mode will replace the existing Notion field values, or you can select <strong>Append to Bottom</strong> per field below so existing Notion notes are preserved at the top and new Chroma Agent-signed updates are appended underneath.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleSetAllFieldStrategies('append')}
                className="px-3 py-1.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg cursor-pointer whitespace-nowrap"
              >
                Append All Checked Fields to Bottom (Safe)
              </button>
              <button
                type="button"
                onClick={() => handleSetAllFieldStrategies('overwrite')}
                className="px-3 py-1.5 text-xs font-semibold bg-amber-800 hover:bg-amber-900 text-white rounded-lg cursor-pointer whitespace-nowrap"
              >
                Overwrite All Checked Fields
              </button>
            </div>
          </div>
        )}

        {/* 4 Attribution & Staging Pipeline Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <button
            type="button"
            onClick={() =>
              setAuthorFilter(authorFilter === 'ai-agent' ? 'all' : 'ai-agent')
            }
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
              authorFilter === 'ai-agent'
                ? 'border-indigo-600 bg-indigo-50/50'
                : 'border-stone-200 bg-stone-50/60 hover:bg-stone-100/70'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-semibold text-indigo-800">
              <span>Chroma Agent Modifications Only</span>
              <Bot className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1">
              {counts.agentOnly} Rows
            </div>
            <p className="text-[11px] text-slate-600 mt-1">
              100% Chroma Agent output signed with timestamp (`[Chroma Agent · Updated ...]`)
            </p>
          </button>

          <button
            type="button"
            onClick={() =>
              setAuthorFilter(
                authorFilter === 'both-agent-and-brianna'
                  ? 'all'
                  : 'both-agent-and-brianna'
              )
            }
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
              authorFilter === 'both-agent-and-brianna'
                ? 'border-amber-600 bg-amber-50/50'
                : 'border-stone-200 bg-stone-50/60 hover:bg-stone-100/70'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-semibold text-amber-900">
              <span>Chroma Agent + Brianna Modified</span>
              <GitCompare className="w-4 h-4 text-amber-600" />
            </div>
            <div className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1">
              {counts.both} Rows
            </div>
            <p className="text-[11px] text-slate-600 mt-1">
              Contains both `agentBlob` baseline and `briannaBlob` manual overrides
            </p>
          </button>

          <button
            type="button"
            onClick={() =>
              setAuthorFilter(authorFilter === 'brianna' ? 'all' : 'brianna')
            }
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
              authorFilter === 'brianna'
                ? 'border-emerald-600 bg-emerald-50/50'
                : 'border-stone-200 bg-stone-50/60 hover:bg-stone-100/70'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-semibold text-emerald-800">
              <span>Brianna Curated / Benchmark</span>
              <UserCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1">
              {counts.briannaOnly} Rows
            </div>
            <p className="text-[11px] text-slate-600 mt-1">
              Direct human notes &amp; locked reference benchmarks (#1 Aida, #2 Tricia, #3 Sara)
            </p>
          </button>

          <div className="p-4 rounded-xl border border-stone-200 bg-stone-50/60 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>Checked Fields &amp; Staging Gate</span>
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
                {checkedFieldKeysList.length} / {ALL_SYNCABLE_FIELDS_META.length} Fields
              </span>
              <span className="font-mono text-xs font-semibold text-emerald-700 tabular-nums">
                ({counts.checkedInNotion} Rows Checked)
              </span>
            </div>
            <p className="text-[11px] text-slate-600 mt-1">
              Source: Brianna&rsquo;s Desk (<code className="font-mono">{BRIANNAS_DESK_COLLAB_NOTION_ID.slice(0, 8)}</code>) &rarr; Max&rsquo;s Production Table
            </p>
          </div>
        </div>
      </div>

      {/* PER-FIELD CHECKBOX & OVERWRITE / APPEND MATRIX + CHROMA AGENT SIGNATURE PREVIEW */}
      {inspectedItem && (
        <div className="bg-white border border-stone-200 rounded-xl p-5 sm:p-6 space-y-4 shadow-xs">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-stone-200 pb-3.5">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-indigo-700">
                <FileCheck2 className="w-4 h-4" />
                <span>
                  PER-FIELD CHECKBOXES &amp; OVERWRITE vs. APPEND SELECTOR (WITH CHROMA AGENT SIGNATURE)
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-slate-800">
                  Inspecting #{inspectedItem.creator.rank} {inspectedItem.creator.name} ({inspectedItem.creator.handle})
                </span>
              </div>
              <h3 className="font-display text-base font-bold text-slate-900">
                Choose Which Fields to Send to Notion &amp; Whether to Overwrite or Append to Bottom
              </h3>
              <p className="text-xs text-slate-600">
                Every checked field is automatically stamped with <code className="font-mono text-indigo-700">{inspectedItem.creator.chromaAgentSignature || formatChromaAgentSignature(inspectedItem.creator.lastChangedAt)}</code> showing that the Chroma Agent made the changes and the exact time it was updated.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleToggleAllFieldCheckboxes(true)}
                className="px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded-lg cursor-pointer"
              >
                Check All 15 Fields
              </button>
              <button
                type="button"
                onClick={() => handleToggleAllFieldCheckboxes(false)}
                className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 bg-white hover:bg-stone-100 border border-stone-300 rounded-lg cursor-pointer"
              >
                Uncheck All
              </button>
              <button
                type="button"
                onClick={() => handleSetAllFieldStrategies('append')}
                className="px-2.5 py-1.5 text-xs font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg cursor-pointer"
              >
                All: Append to Bottom
              </button>
              <button
                type="button"
                onClick={() => handleSetAllFieldStrategies('overwrite')}
                className="px-2.5 py-1.5 text-xs font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg cursor-pointer"
              >
                All: Overwrite Existing
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-stone-200 rounded-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-stone-100/90 border-b border-stone-200 text-[11px] font-semibold text-slate-700 whitespace-nowrap">
                  <th className="py-2.5 px-3 w-10">Send?</th>
                  <th className="py-2.5 px-3">Field / Notion Column</th>
                  <th className="py-2.5 px-3">Existing Data in Notion Table?</th>
                  <th className="py-2.5 px-3">Write Mode (Overwrite vs. Append)</th>
                  <th className="py-2.5 px-3 min-w-[240px]">Existing Data in Brianna&rsquo;s Desk ({BRIANNAS_DESK_COLLAB_NOTION_ID.slice(0, 8)})</th>
                  <th className="py-2.5 px-3 min-w-[320px]">Final Signed Payload Sent to Notion (Chroma Agent Signature + Timestamp)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 text-xs">
                {inspectedFieldConfigs.map((cfg) => {
                  const sigTimestamp =
                    inspectedItem.creator.lastChangedAt ||
                    new Date().toISOString().replace('T', ' ').substring(0, 16);
                  const finalSignedText = applyChromaSignatureAndWriteStrategy(
                    cfg.incomingValue,
                    cfg.existingNotionValue,
                    cfg.writeStrategy,
                    sigTimestamp
                  );
                  return (
                    <tr
                      key={cfg.fieldKey}
                      className={`align-top transition-colors ${
                        cfg.checked ? 'bg-white hover:bg-stone-50/80' : 'bg-stone-50/60 opacity-60'
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <input
                          type="checkbox"
                          checked={cfg.checked}
                          onChange={() => handleToggleFieldCheckbox(cfg.fieldKey)}
                          className="w-4 h-4 rounded border-stone-300 text-indigo-600 focus:ring-0 cursor-pointer"
                          aria-label={`Select ${cfg.label} for Notion migration`}
                        />
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900 whitespace-nowrap">
                        <div>{cfg.label}</div>
                        <div className="font-mono text-[10px] text-slate-500">
                          Col: {cfg.notionColumnName}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {cfg.hasExistingDataConflict ? (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-100 text-amber-900 border border-amber-300 inline-flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Data Present in Notion</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-stone-100 text-slate-600">
                            Empty Cell
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="inline-flex rounded-lg border border-stone-300 bg-stone-100 p-0.5 text-[11px]">
                          <button
                            type="button"
                            onClick={() => handleChangeFieldStrategy(cfg.fieldKey, 'overwrite')}
                            className={`px-2 py-1 rounded-md font-semibold cursor-pointer transition-colors ${
                              cfg.writeStrategy === 'overwrite'
                                ? 'bg-amber-700 text-white'
                                : 'text-slate-700 hover:bg-stone-200'
                            }`}
                          >
                            Overwrite
                          </button>
                          <button
                            type="button"
                            onClick={() => handleChangeFieldStrategy(cfg.fieldKey, 'append')}
                            className={`px-2 py-1 rounded-md font-semibold cursor-pointer transition-colors ${
                              cfg.writeStrategy === 'append'
                                ? 'bg-emerald-700 text-white'
                                : 'text-slate-700 hover:bg-stone-200'
                            }`}
                          >
                            Append to Bottom
                          </button>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 max-w-xs font-mono text-[11px] text-slate-600">
                        <p className="line-clamp-2">
                          {cfg.existingNotionValue || '— (No prior value in Notion)'}
                        </p>
                      </td>
                      <td className="py-2.5 px-3 max-w-md font-mono text-[11px] text-slate-800">
                        <div className="p-2 rounded bg-stone-50 border border-stone-200 whitespace-pre-wrap line-clamp-3 leading-relaxed">
                          {finalSignedText}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Side-by-Side Attribution Blob Inspector (AI Agent vs. Brianna Modification Diff Blob) */}
      {inspectedItem && (
        <div className="bg-white border border-stone-200 rounded-xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200 pb-3.5">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <span>ACTIVE MODIFICATION ATTRIBUTION BLOB INSPECTOR</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-indigo-700">
                  #{inspectedItem.creator.rank} {inspectedItem.creator.name} ({inspectedItem.creator.handle})
                </span>
              </div>
              <h3 className="font-display text-base font-bold text-slate-900 mt-0.5">
                Chroma Agent Modification Blob vs. Brianna&rsquo;s Modification Blob
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setVersionHistoryModalCreatorId(inspectedItem.creator.id)
                }
                className="px-3 py-1.5 text-xs font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <History className="w-3.5 h-3.5" />
                <span>
                  View Contact Version Control ({inspectedItem.creator.versionHistory?.length || 3} Versions)
                </span>
              </button>
              <button
                type="button"
                onClick={() =>
                  handleCopyBlobJson(inspectedItem.blob, inspectedItem.creator.name)
                }
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-stone-100 hover:bg-stone-200 rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Attribution Blob JSON</span>
              </button>
              <button
                type="button"
                onClick={() => onOpenDossierInDesk(inspectedItem.creator)}
                className="px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg flex items-center gap-1 cursor-pointer"
              >
                <span>Edit as Brianna in Notion Desk</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left: AI Agent Modification Blob */}
            <div className="lg:col-span-4 p-4 rounded-xl bg-indigo-50/40 border border-indigo-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-950">
                  <Bot className="w-4 h-4 text-indigo-600" />
                  <span>Chroma Agent Modification Blob</span>
                </div>
                <span className="font-mono text-[10px] text-indigo-700">
                  {inspectedItem.blob.agentBlob.timestamp}
                </span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                {inspectedItem.blob.agentBlob.summary}
              </p>
              <div className="text-[11px] font-mono text-indigo-900 bg-indigo-100/70 px-2 py-1 rounded">
                Signature: {inspectedItem.creator.chromaAgentSignature || formatChromaAgentSignature(inspectedItem.blob.agentBlob.timestamp)}
              </div>
              <div className="p-2.5 rounded-lg bg-white border border-indigo-100 font-mono text-[11px] text-slate-700 line-clamp-4 leading-relaxed">
                {inspectedItem.blob.agentBlob.agentCommentDraft}
              </div>
            </div>

            {/* Middle: Brianna Modification Blob */}
            <div className="lg:col-span-4 p-4 rounded-xl bg-emerald-50/40 border border-emerald-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-950">
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                  <span>Brianna&rsquo;s Modification Blob</span>
                </div>
                <span className="font-mono text-[10px] text-emerald-700">
                  {inspectedItem.blob.briannaBlob.hasBriannaEdits
                    ? inspectedItem.blob.briannaBlob.timestamp || 'Modified'
                    : 'No Manual Edits Yet'}
                </span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                {inspectedItem.blob.briannaBlob.briannaActionNote}
              </p>
              <div className="text-[11px] font-mono text-slate-600">
                <strong>Fields Modified by Brianna:</strong>{' '}
                {inspectedItem.blob.briannaBlob.fieldsModifiedByBrianna.length > 0
                  ? inspectedItem.blob.briannaBlob.fieldsModifiedByBrianna.join(' · ')
                  : 'None (Using Chroma Agent Draft)'}
              </div>
              <div className="p-2.5 rounded-lg bg-white border border-emerald-100 font-mono text-[11px] text-slate-700 line-clamp-4 leading-relaxed">
                {inspectedItem.blob.briannaBlob.briannaCommentOverride ||
                  'Brianna has not overridden the comment text for this creator yet — edit any field in Notion Desk to record a Brianna modification blob.'}
              </div>
            </div>

            {/* Right: Raw Structured Attribution Blob Payload synced to Notion */}
            <div className="lg:col-span-4 p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-900">
                <span>Serialized Attribution Blob (Notion Column #28)</span>
                <span className="font-mono text-[10px] text-slate-500">JSON Blob</span>
              </div>
              <pre className="p-2.5 rounded-lg bg-white border border-stone-200 font-mono text-[10px] text-slate-700 overflow-x-auto max-h-44 leading-relaxed">
                {inspectedItem.blob.serializedDiffBlob}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Pre-Live Staging, Version Control & Max's Production Migration Table */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-200 bg-stone-50/70 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h3 className="font-display text-base font-bold text-slate-900">
              Pre-Live Notion Table &middot; Version Control &middot; Migrate to Boss Max&rsquo;s Production Table ({filteredRows.length} Creator Rows)
            </h3>
            <p className="text-xs text-slate-600">
              Includes <strong>Most Recent Time of Change + Notion Version Control Link</strong>, <strong>Latest Agent Run Changes</strong>, and <strong>Version Revert + Migrate Checked Fields (with Brianna&rsquo;s Desk <code className="font-mono">{BRIANNAS_DESK_COLLAB_NOTION_ID}</code> Fetch)</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter by Modification Author"
              value={authorFilter}
              onChange={(e) => setAuthorFilter(e.target.value as any)}
              className="px-2.5 py-1.5 text-xs font-semibold bg-white border border-stone-300 rounded-lg text-slate-800"
            >
              <option value="all">All Modification Sources (40)</option>
              <option value="ai-agent">Chroma Agent Only ({counts.agentOnly})</option>
              <option value="both-agent-and-brianna">
                Chroma Agent + Brianna Modified ({counts.both})
              </option>
              <option value="brianna">Brianna Curated ({counts.briannaOnly})</option>
            </select>

            <select
              aria-label="Filter by Staging Gate Status"
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value as any)}
              className="px-2.5 py-1.5 text-xs font-semibold bg-white border border-stone-300 rounded-lg text-slate-800"
            >
              <option value="all">All Staging States</option>
              <option value="needs-notion-staging">1. Needs Push to Notion Staging Table</option>
              <option value="ready-to-check">2. Staged in Notion (Awaiting Check)</option>
              <option value="checked-ready-live">3. Checked in Notion (Ready to Migrate)</option>
              <option value="live">4. Live in Max&rsquo;s Production Table</option>
            </select>

            <button
              type="button"
              onClick={() =>
                onMarkAllCheckedInNotionStaging(
                  filteredRows.map((r) => r.creator.id),
                  true
                )
              }
              className="px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg cursor-pointer whitespace-nowrap"
            >
              Mark All {filteredRows.length} Checked in Notion
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-100/80 text-[11px] font-semibold text-slate-600 whitespace-nowrap">
                <th className="py-2.5 px-3">Rank</th>
                <th className="py-2.5 px-3">Creator</th>
                <th className="py-2.5 px-3">Attribution Blob &amp; Chroma Signature</th>
                <th className="py-2.5 px-3 min-w-[230px]">
                  Most Recent Time of Change &amp; Notion Version Control
                </th>
                <th className="py-2.5 px-3 min-w-[260px]">
                  Latest Agent Run Changes Description
                </th>
                <th className="py-2.5 px-3 min-w-[270px]">
                  Revert Contact Card Version (Before Migration)
                </th>
                <th className="py-2.5 px-3 min-w-[240px]">Staged @Bree Notion Comment</th>
                <th className="py-2.5 px-3">Checked in Notion?</th>
                <th className="py-2.5 px-3">
                  Fetch Brianna&rsquo;s Desk &amp; Migrate to Max&rsquo;s Production
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 text-xs">
              {filteredRows.map(({ creator, blob, status, isChecked }) => {
                const isInspected = creator.id === inspectedItem?.creator.id;
                const lastChanged =
                  creator.lastChangedAt || blob.lastUpdatedAt || '2026-10-31 20:04';
                const vcUrl =
                  creator.notionVersionControlUrl ||
                  `https://www.notion.so/${BRIANNAS_DESK_COLLAB_NOTION_ID.replace(/-/g, '')}?p=${creator.id}&v=version-history`;
                const versionList = creator.versionHistory || [];
                const currentVersionSelection =
                  selectedRevertVersions[creator.id] ||
                  creator.activeVersionId ||
                  versionList[versionList.length - 1]?.versionId ||
                  'v2.0-latest-agent-run';

                return (
                  <tr
                    key={creator.id}
                    onClick={() => {
                      setInspectedBlobCreatorId(creator.id);
                      onSelectCreator(creator.id);
                    }}
                    className={`align-top transition-colors cursor-pointer ${
                      isInspected ? 'bg-indigo-50/40' : 'hover:bg-stone-50/90'
                    }`}
                  >
                    <td className="py-3 px-3 font-mono text-slate-500 tabular-nums whitespace-nowrap">
                      #{String(creator.rank).padStart(2, '0')}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="font-semibold text-slate-900">{creator.name}</div>
                      <div className="font-mono text-[11px] text-slate-500">{creator.handle}</div>
                      <div className="text-[11px] text-slate-600 mt-0.5">
                        Take: <strong>{creator.teamTake}</strong> · {creator.verdict}
                      </div>
                      {creator.hasExistingNotionData !== false && (
                        <div className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-[10px] font-medium text-amber-900">
                          <AlertTriangle className="w-2.5 h-2.5 text-amber-700" />
                          <span>Existing Notion Data</span>
                        </div>
                      )}
                    </td>

                    {/* Attribution Blob & Chroma Agent Signature Column */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="space-y-1">
                        {blob.authorMode === 'ai-agent' && (
                          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700">
                            <Bot className="w-3.5 h-3.5" />
                            <span>Chroma Agent Blob</span>
                          </div>
                        )}
                        {blob.authorMode === 'both-agent-and-brianna' && (
                          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                            <GitCompare className="w-3.5 h-3.5" />
                            <span>Agent + Brianna Blob</span>
                          </div>
                        )}
                        {blob.authorMode === 'brianna' && (
                          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>Brianna Blob</span>
                          </div>
                        )}
                        <div className="font-mono text-[10px] text-indigo-800 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">
                          {creator.chromaAgentSignature || formatChromaAgentSignature(lastChanged)}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectedBlobCreatorId(creator.id);
                          }}
                          className="text-[11px] text-indigo-700 hover:underline inline-flex items-center gap-0.5 font-medium"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Inspect Field Checkboxes &amp; Blob</span>
                        </button>
                      </div>
                    </td>

                    {/* NEW COLUMN 1: Most Recent Time of Change & Link to Notion Version Control Screen */}
                    <td
                      className="py-3 px-3 whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="space-y-1.5">
                        <div className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-slate-900">
                          <Clock className="w-3.5 h-3.5 text-indigo-600" />
                          <span>{lastChanged}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <a
                            href={vcUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] font-semibold text-indigo-700 hover:underline inline-flex items-center gap-1"
                          >
                            <History className="w-3 h-3" />
                            <span>Notion Version Control Screen</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                          <button
                            type="button"
                            onClick={() => setVersionHistoryModalCreatorId(creator.id)}
                            className="text-left text-[11px] font-medium text-amber-800 hover:underline inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Layers className="w-3 h-3" />
                            <span>
                              List of Updates ({versionList.length} Card Versions)
                            </span>
                          </button>
                        </div>
                      </div>
                    </td>

                    {/* NEW COLUMN 2: Description of Changes Made During Latest Agent Run */}
                    <td className="py-3 px-3 max-w-xs text-slate-700">
                      <div className="font-mono text-[10px] text-indigo-700 font-semibold">
                        Active Version: {creator.activeVersionId || 'v2.0-latest-agent-run'}
                      </div>
                      <p className="line-clamp-3 text-[11px] mt-0.5 leading-relaxed">
                        {creator.latestAgentRunChangesDescription || blob.agentBlob.summary}
                      </p>
                    </td>

                    {/* NEW COLUMN 3 (Next to Time & Description): Revert Contact Card Back to Selected Version Before Migrating */}
                    <td
                      className="py-3 px-3 whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="space-y-1.5 max-w-[250px]">
                        <select
                          aria-label={`Select version to revert ${creator.name}`}
                          value={currentVersionSelection}
                          onChange={(e) =>
                            setSelectedRevertVersions((prev) => ({
                              ...prev,
                              [creator.id]: e.target.value
                            }))
                          }
                          className="w-full px-2 py-1 text-[11px] font-mono bg-white border border-stone-300 rounded-md text-slate-800"
                        >
                          {versionList.map((v) => (
                            <option key={v.versionId} value={v.versionId}>
                              {v.versionLabel}
                            </option>
                          ))}
                        </select>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              if (onRevertCreatorVersion) {
                                onRevertCreatorVersion(creator.id, currentVersionSelection);
                              }
                            }}
                            className="px-2.5 py-1 text-[11px] font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-md inline-flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Revert to Version</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setVersionHistoryModalCreatorId(creator.id)}
                            className="px-2 py-1 text-[11px] text-slate-600 hover:text-slate-900 bg-stone-100 hover:bg-stone-200 rounded-md cursor-pointer"
                          >
                            Diff
                          </button>
                        </div>
                      </div>
                    </td>

                    {/* Staged @Bree Comment */}
                    <td className="py-3 px-3 max-w-xs font-mono text-[11px] text-slate-700">
                      <p className="line-clamp-3">
                        {creator.vettingDossier.formattedNotionComment}
                      </p>
                    </td>

                    {/* Step 2: Checked in Notion Verification Checkbox */}
                    <td
                      className="py-3 px-3 whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) =>
                            onToggleCheckedInNotionStaging(creator.id, e.target.checked)
                          }
                          className="rounded border-stone-300 text-emerald-600 focus:ring-0 cursor-pointer w-4 h-4"
                        />
                        <span
                          className={`text-xs font-medium ${
                            isChecked ? 'text-emerald-700 font-semibold' : 'text-slate-600'
                          }`}
                        >
                          {isChecked ? 'Checked in Notion' : 'Check in Notion first'}
                        </span>
                      </label>
                    </td>

                    {/* Step 3: Migrate Checked Fields + Fetch Brianna's Desk (c4357c4d-75c0-810f-95a6-0003bcac8153) to Max's Production Table */}
                    <td
                      className="py-3 px-3 whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="space-y-1">
                        <button
                          type="button"
                          disabled={isMakingLive || checkedFieldKeysList.length === 0}
                          onClick={() =>
                            onMakeLiveInProductionNotion([creator], {
                              checkedFields: checkedFieldKeysList,
                              fieldWriteStrategies: fieldWriteStrategyMap,
                              fetchFromBriannasDeskCollabFirst: true
                            })
                          }
                          title={`Fetch Brianna's Desk (${BRIANNAS_DESK_COLLAB_NOTION_ID}) & migrate ${checkedFieldKeysList.length} checked fields to Max's Production Table`}
                          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
                            checkedFieldKeysList.length > 0
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-xs'
                              : 'bg-stone-100 text-slate-400 border border-stone-200 cursor-not-allowed'
                          }`}
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>
                            Migrate ({checkedFieldKeysList.length} Fields) to Max&rsquo;s Table
                          </span>
                        </button>
                        <div className="text-[10px] font-mono text-slate-500">
                          {status === 'live'
                            ? `Migrated: ${creator.migratedToMaxProductionAt || creator.madeLiveAt || 'Live'}`
                            : `Fetches Brianna's Desk (${BRIANNAS_DESK_COLLAB_NOTION_ID.slice(0, 8)})`}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* CONTACT CARD VERSION CONTROL & REVERT MODAL */}
      {versionModalCreator && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-stone-200 rounded-2xl max-w-4xl w-full overflow-hidden shadow-xl flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-stone-50 border-b border-stone-200 flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700">
                  <History className="w-4 h-4" />
                  <span>
                    CONTACT CARD VERSION CONTROL &amp; REVERT HISTORY &middot; #{versionModalCreator.rank}{' '}
                    {versionModalCreator.name} ({versionModalCreator.handle})
                  </span>
                </div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  List of Updates &amp; One-Click Revert Before Migrating to Max&rsquo;s Production Table
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={
                    versionModalCreator.notionVersionControlUrl ||
                    `https://www.notion.so/${BRIANNAS_DESK_COLLAB_NOTION_ID.replace(/-/g, '')}?p=${versionModalCreator.id}&v=version-history`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg inline-flex items-center gap-1"
                >
                  <span>Open Notion Version Control Screen</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  type="button"
                  onClick={() => setVersionHistoryModalCreatorId(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              {(versionModalCreator.versionHistory || []).map((ver, idx) => {
                const isCurrent =
                  (versionModalCreator.activeVersionId || 'v2.0-latest-agent-run') ===
                  ver.versionId;
                return (
                  <div
                    key={ver.versionId}
                    className={`p-4 rounded-xl border space-y-2.5 ${
                      isCurrent
                        ? 'border-indigo-600 bg-indigo-50/30'
                        : 'border-stone-200 bg-white'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-900">
                          #{idx + 1} · {ver.versionLabel}
                        </span>
                        {isCurrent && (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-indigo-600 text-white">
                            Active Version on Card
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-slate-500">
                          {ver.timestamp} · {ver.author}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (onRevertCreatorVersion) {
                              onRevertCreatorVersion(versionModalCreator.id, ver.versionId);
                            }
                            setVersionHistoryModalCreatorId(null);
                          }}
                          className="px-3 py-1 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Revert Contact Card to This Version</span>
                        </button>
                      </div>
                    </div>

                    <p className="text-slate-700 leading-relaxed">{ver.changesDescription}</p>

                    <div className="font-mono text-[10px] text-indigo-800">
                      Signature: {ver.chromaSignature}
                    </div>

                    <div className="p-3 rounded-lg bg-stone-50 border border-stone-200 font-mono text-[11px] text-slate-700 whitespace-pre-wrap max-h-36 overflow-y-auto">
                      {ver.snapshotData.vettingDossier.formattedNotionComment}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
