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
  Lock,
  Sparkles,
  Eye
} from 'lucide-react';
import {
  CreatorRecord,
  ModificationAttributionBlob,
  ModificationAuthorType,
  ProjectToneMode
} from '../types';
import { NOTION_DESK_URL } from '../data/initialCreators';

export const NOTION_PRELIVE_STAGING_TABLE_URL =
  'https://app.notion.com/p/Chromatics-PreLive-Staging-Table-40457c4d75c0819d90c8cb35f1024e89?v=staging-review';

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

  const nowIso = '2026-10-31 18:45';
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

  return {
    authorMode,
    lastUpdatedAt: nowIso,
    agentBlob: {
      timestamp: nowIso,
      toneModeApplied: toneMode,
      fieldsGenerated: agentFields,
      agentCommentDraft: agentDraft,
      agentTeamTake: creator.teamTake,
      agentVerdict: creator.verdict,
      summary: `AI Agent synthesized ${
        creator.watchedItems?.length || 2
      } social posts, 13-competitor watchlist ties, and 5 evaluation answers in ${toneMode} voice.`
    },
    briannaBlob: {
      hasBriannaEdits: hasBriannaOverride,
      timestamp: hasBriannaOverride ? nowIso : undefined,
      fieldsModifiedByBrianna: briannaFields,
      briannaCommentOverride: briannaDraft,
      briannaTeamTakeOverride: hasBriannaOverride ? creator.teamTake : undefined,
      briannaVerdictOverride: hasBriannaOverride ? creator.verdict : undefined,
      briannaActionNote: isBriannaBenchmark
        ? `Locked Gold-Standard Reference Benchmark (#${creator.rank}) authored/curated by Brianna & Bree.`
        : hasBriannaOverride
        ? 'Brianna customized voice/fields on top of AI Agent research.'
        : 'No manual overrides by Brianna yet (100% AI Agent draft).'
    },
    serializedDiffBlob
  };
}

/**
 * Updates a creator's ModificationAttributionBlob when the AI Agent runs or rewrites tone.
 */
export function recordAgentModificationOnCreator(
  creator: CreatorRecord,
  toneMode: ProjectToneMode,
  actionSummary?: string
): CreatorRecord {
  const now = new Date().toISOString().replace('T', ' ').substring(0, 16);
  const existingBlob = buildCreatorAttributionBlob(creator, toneMode);
  const keepBrianna = existingBlob.briannaBlob.hasBriannaEdits;
  const nextAuthor: ModificationAuthorType = keepBrianna ? 'both-agent-and-brianna' : 'ai-agent';

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
    summary:
      actionSummary ||
      `AI Agent audited ${creator.name} across ${creator.platforms.join(', ')} (${toneMode} mode).`
  };

  const serializedDiffBlob = JSON.stringify(
    {
      attributionAuthor:
        nextAuthor === 'both-agent-and-brianna'
          ? 'AI Agent + Brianna Modified'
          : 'AI Vetting Agent Only',
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

  return {
    ...creator,
    notionSyncStatus: 'unsynced',
    preLiveStagingStatus: 'in-staging-table',
    notionStagingCheckedByBrianna: false,
    modificationBlob: {
      authorMode: nextAuthor,
      lastUpdatedAt: now,
      agentBlob: nextAgentBlob,
      briannaBlob: existingBlob.briannaBlob,
      serializedDiffBlob
    }
  };
}

/**
 * Updates a creator's ModificationAttributionBlob when Brianna manually edits any field,
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

  return {
    ...updatedCreator,
    notionSyncStatus: 'unsynced',
    preLiveStagingStatus: 'in-staging-table',
    notionStagingCheckedByBrianna: false,
    modificationBlob: {
      authorMode: nextAuthor,
      lastUpdatedAt: now,
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
  onMakeLiveInProductionNotion: (creatorsToMakeLive: CreatorRecord[]) => Promise<void>;
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

    return {
      agentOnly,
      briannaOnly,
      both,
      pushedToStaging,
      checkedInNotion,
      madeLive
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

  const handleCopyBlobJson = (blob: ModificationAttributionBlob, name: string) => {
    navigator.clipboard.writeText(blob.serializedDiffBlob);
    onTriggerToast(`Copied Agent vs. Brianna Modification Attribution Blob for ${name}!`);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Mandatory 2-Step Notion Pre-Live Staging Table & Attribution Blob */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 sm:p-6 space-y-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-stone-200 pb-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-indigo-700">
              <GitCompare className="w-4 h-4" />
              <span>
                PRE-LIVE NOTION STAGING TABLE &amp; AGENT vs. BRIANNA MODIFICATION BLOB
              </span>
            </div>
            <h2 className="font-display text-xl font-bold text-slate-900">
              Stage Changes to Notion Review Table First &rarr; Check in Notion &rarr; Click &ldquo;Make Live&rdquo;
            </h2>
            <p className="text-xs text-slate-600 max-w-3xl">
              Every record carries an explicit <strong>Modification Attribution Blob</strong> differentiating between <strong>AI Agent Modifications</strong> and <strong>Brianna&rsquo;s Modifications</strong>. Before anything is made live in the main Notion Desk, changes are placed in this dedicated <strong>Pre-Live Staging Table</strong> so you can check them in Notion first before clicking <strong>Make Live</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() =>
                onPushToNotionStagingTable(filteredRows.map((r) => r.creator))
              }
              disabled={isPushingStaging}
              className="px-3.5 py-2.5 text-xs font-semibold text-indigo-950 bg-indigo-50 hover:bg-indigo-100 border border-indigo-300 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Database className={`w-3.5 h-3.5 text-indigo-700 ${isPushingStaging ? 'animate-spin' : ''}`} />
              <span>
                {isPushingStaging
                  ? 'Staging to Notion Review Table...'
                  : `1. Push ${filteredRows.length} Rows to Notion Staging Table`}
              </span>
            </button>

            <a
              href={stagingTableUrl || NOTION_PRELIVE_STAGING_TABLE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2.5 text-xs font-semibold text-slate-800 bg-stone-100 hover:bg-stone-200 border border-stone-300 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
            >
              <span>2. Check Staging Table in Notion</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <button
              type="button"
              onClick={() =>
                onMakeLiveInProductionNotion(checkedCreatorsReadyToMakeLive)
              }
              disabled={isMakingLive || checkedCreatorsReadyToMakeLive.length === 0}
              title={
                checkedCreatorsReadyToMakeLive.length === 0
                  ? 'Check at least 1 staged row in Notion first to unlock Make Live'
                  : `Promote ${checkedCreatorsReadyToMakeLive.length} checked rows to Live Notion DB`
              }
              className={`px-4 py-2.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                checkedCreatorsReadyToMakeLive.length > 0
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-xs'
                  : 'bg-stone-200 text-slate-500 cursor-not-allowed'
              }`}
            >
              {isMakingLive ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Making Live in Notion...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>
                    3. Make Live ({checkedCreatorsReadyToMakeLive.length} Checked in Notion)
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

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
              <span>AI Agent Modifications Only</span>
              <Bot className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1">
              {counts.agentOnly} Rows
            </div>
            <p className="text-[11px] text-slate-600 mt-1">
              100% AI Vetting Agent output (`agentBlob`) with zero manual edits by Brianna yet
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
              <span>AI Agent + Brianna Modified</span>
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
              <span>Pre-Live Notion Gate Status</span>
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
                {counts.checkedInNotion} / 40 Checked
              </span>
              <span className="font-mono text-xs font-semibold text-emerald-700 tabular-nums">
                ({counts.madeLive} Live)
              </span>
            </div>
            <p className="text-[11px] text-slate-600 mt-1">
              {counts.pushedToStaging} rows pushed to Notion Staging Table · Check in Notion to unlock Make Live
            </p>
          </div>
        </div>
      </div>

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
                AI Agent Modification Blob vs. Brianna&rsquo;s Modification Blob
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-2">
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
                  <span>AI Agent Modification Blob</span>
                </div>
                <span className="font-mono text-[10px] text-indigo-700">
                  {inspectedItem.blob.agentBlob.timestamp}
                </span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                {inspectedItem.blob.agentBlob.summary}
              </p>
              <div className="text-[11px] font-mono text-slate-600">
                <strong>Fields Generated:</strong>{' '}
                {inspectedItem.blob.agentBlob.fieldsGenerated.join(' · ')}
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
                  : 'None (Using AI Agent Draft)'}
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

      {/* Pre-Live Staging Table (Check in Notion First Before Clicking Make Live) */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-200 bg-stone-50/70 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h3 className="font-display text-base font-bold text-slate-900">
              Pre-Live Notion Staging Table ({filteredRows.length} Creator Rows)
            </h3>
            <p className="text-xs text-slate-600">
              Step 1: Push rows to the Notion Pre-Live Staging Table &middot; Step 2: Check the staged rows in Notion and tick <strong>&ldquo;Checked in Notion&rdquo;</strong> &middot; Step 3: Click <strong>&ldquo;Make Live&rdquo;</strong> to publish to your main Notion database.
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
              <option value="ai-agent">AI Agent Only ({counts.agentOnly})</option>
              <option value="both-agent-and-brianna">
                AI Agent + Brianna Modified ({counts.both})
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
              <option value="checked-ready-live">3. Checked in Notion (Ready to Make Live)</option>
              <option value="live">4. Made Live in Production Notion DB</option>
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
                <th className="py-2.5 px-3">Attribution Blob (Agent vs. Brianna)</th>
                <th className="py-2.5 px-3 min-w-[230px]">AI Agent Modification Summary</th>
                <th className="py-2.5 px-3 min-w-[230px]">Brianna&rsquo;s Modification Summary</th>
                <th className="py-2.5 px-3 min-w-[250px]">Staged @Bree Notion Comment</th>
                <th className="py-2.5 px-3">1. Notion Staging Table</th>
                <th className="py-2.5 px-3">2. Checked in Notion First?</th>
                <th className="py-2.5 px-3">3. Make Live Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 text-xs">
              {filteredRows.map(({ creator, blob, status, isChecked }) => {
                const isInspected = creator.id === inspectedItem?.creator.id;
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
                    </td>

                    {/* Attribution Blob Column */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="space-y-1">
                        {blob.authorMode === 'ai-agent' && (
                          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700">
                            <Bot className="w-3.5 h-3.5" />
                            <span>AI Agent Blob</span>
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
                        <div className="text-[10px] font-mono text-slate-500">
                          Updated: {blob.lastUpdatedAt}
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
                          <span>Inspect Diff Blob</span>
                        </button>
                      </div>
                    </td>

                    {/* AI Agent Modification Summary */}
                    <td className="py-3 px-3 max-w-xs text-slate-600">
                      <div className="font-mono text-[10px] text-indigo-700 font-semibold">
                        Tone: {blob.agentBlob.toneModeApplied} ({blob.agentBlob.fieldsGenerated.length} fields)
                      </div>
                      <p className="line-clamp-2 text-[11px] mt-0.5">
                        {blob.agentBlob.summary}
                      </p>
                    </td>

                    {/* Brianna's Modification Summary */}
                    <td className="py-3 px-3 max-w-xs text-slate-600">
                      {blob.briannaBlob.hasBriannaEdits ? (
                        <div>
                          <div className="font-mono text-[10px] text-emerald-700 font-semibold">
                            Edited: {blob.briannaBlob.fieldsModifiedByBrianna.join(', ')}
                          </div>
                          <p className="line-clamp-2 text-[11px] text-slate-700 mt-0.5">
                            {blob.briannaBlob.briannaActionNote}
                          </p>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400">
                          Unmodified by Brianna (100% AI Agent output)
                        </span>
                      )}
                    </td>

                    {/* Staged @Bree Comment */}
                    <td className="py-3 px-3 max-w-xs font-mono text-[11px] text-slate-700">
                      <p className="line-clamp-3">
                        {creator.vettingDossier.formattedNotionComment}
                      </p>
                    </td>

                    {/* Step 1: Notion Staging Table Status */}
                    <td
                      className="py-3 px-3 whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {status === 'pushed-to-notion-staging' ||
                      status === 'checked-in-notion' ||
                      status === 'live' ? (
                        <div className="space-y-1">
                          <div className="text-[11px] font-semibold text-indigo-700 flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" />
                            <span>In Notion Staging Table</span>
                          </div>
                          <a
                            href={creator.notionStagingTableUrl || stagingTableUrl || NOTION_PRELIVE_STAGING_TABLE_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] font-mono text-slate-500 hover:text-indigo-700 hover:underline inline-flex items-center gap-0.5"
                          >
                            <span>Open Staging Row</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onPushToNotionStagingTable([creator])}
                          disabled={isPushingStaging}
                          className="px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg cursor-pointer"
                        >
                          1. Stage to Notion Table
                        </button>
                      )}
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

                    {/* Step 3: Make Live Button (Strictly Gated until Checked in Notion) */}
                    <td
                      className="py-3 px-3 whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {status === 'live' ? (
                        <div className="space-y-0.5">
                          <div className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Live in Notion DB</span>
                          </div>
                          <div className="text-[10px] font-mono text-slate-500">
                            {creator.madeLiveAt || creator.notionLastSyncedAt || 'Published'}
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={!isChecked || isMakingLive}
                          onClick={() => onMakeLiveInProductionNotion([creator])}
                          title={
                            !isChecked
                              ? 'Must be placed & checked in the Notion Staging Table first before clicking Make Live'
                              : 'Promote this checked staging row to the Live Notion Database'
                          }
                          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                            isChecked
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-xs'
                              : 'bg-stone-100 text-slate-400 border border-stone-200 cursor-not-allowed'
                          }`}
                        >
                          Make Live
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
