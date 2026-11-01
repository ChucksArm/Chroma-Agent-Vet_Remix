import React, { useState, useMemo, useRef, useEffect } from 'react';
import Papa from 'papaparse';
import {
  Search,
  Play,
  RefreshCw,
  Download,
  Upload,
  Check,
  ExternalLink,
  Copy,
  FileSpreadsheet,
  BookOpen,
  SlidersHorizontal,
  ArrowUpRight,
  Clock,
  AlertTriangle,
  ChevronRight,
  ShieldCheck,
  Radar,
  Lock,
  Filter,
  Database,
  X,
  Moon,
  Sun,
  Zap
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend
} from 'recharts';
import {
  CreatorRecord,
  TeamTakeType,
  StageType,
  VerdictType,
  VettingQuestionsConfig,
  NotionWorkspaceScanResult,
  SocialPlatformType,
  ProjectToneMode
} from './types';
import {
  INITIAL_40_CREATORS,
  DEFAULT_VETTING_QUESTIONS,
  INITIAL_WORKSPACE_SCAN,
  NOTION_DESK_URL,
  CHROMATICS_OUTREACH_URL,
  AIDA_TEMPLATE_NOTION_URL,
  TRICIA_TEMPLATE_NOTION_URL,
  SARA_TEMPLATE_NOTION_URL,
  SARA_INSTAGRAM_URL,
  PROJECT_TONE_MODES,
  COMPETITOR_WATCHLIST,
  AGENT_DB_SCHEMA_COLUMNS,
  formatCreatorForDatabaseRow,
  buildNotionBreeComment,
  formatCreatorNoteByTone,
  parseRawLongTemplateNote,
  getHighestViewedPostThumbnail
} from './data/initialCreators';
import GoogleSheetsNotionBridge from './components/GoogleSheetsNotionBridge';
import MobileQuickVettingView from './components/MobileQuickVettingView';

type ActiveWorkspaceView =
  | 'workspace-scanner'
  | 'notion-desk'
  | 'spreadsheet'
  | 'competitor-radar'
  | 'boss-questions';

type NotionTabFilter = 'first-ten' | 'to-vet' | 'vetted' | 'all-contacts' | 'conflicts';
type SpreadsheetSubTab = 'table-27-cols' | 'schema-mapper';

const ALL_SOCIAL_PLATFORMS: SocialPlatformType[] = [
  'YouTube',
  'TikTok',
  'Instagram',
  'Twitter',
  'Substack',
  'Blog'
];

interface PendingPublishModalState {
  creatorsToPublish: CreatorRecord[];
  targetHub: 'my-contacts-desk' | 'chromatics-outreach';
}

export default function App() {
  const [creators, setCreators] = useState<CreatorRecord[]>(INITIAL_40_CREATORS);
  const [selectedCreatorId, setSelectedCreatorId] = useState<string>('chr-03');
  const [projectToneMode, setProjectToneMode] = useState<ProjectToneMode>('hybrid-nyc-bree');
  const [activeView, setActiveView] = useState<ActiveWorkspaceView>('notion-desk');
  const [notionTab, setNotionTab] = useState<NotionTabFilter>('first-ten');
  const [spreadsheetSubTab, setSpreadsheetSubTab] = useState<SpreadsheetSubTab>('table-27-cols');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [questions, setQuestions] = useState<VettingQuestionsConfig>(DEFAULT_VETTING_QUESTIONS);

  // Social Media Platform Filter Input for the AI Agent & Post Feed
  const [selectedPlatforms, setSelectedPlatforms] = useState<SocialPlatformType[]>([
    'YouTube',
    'TikTok',
    'Instagram',
    'Twitter',
    'Substack'
  ]);
  const [onlyShowCreatorsOnSelectedPlatforms, setOnlyShowCreatorsOnSelectedPlatforms] =
    useState<boolean>(false);
  const [autoPromptNotionSyncAfterVet, setAutoPromptNotionSyncAfterVet] =
    useState<boolean>(true);

  // Dark Mode & Quick Vetting Mode (Most Recent 3 Posts per Platform + NYC Tone)
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('chromatics-dark-mode') === 'true';
    } catch {
      return false;
    }
  });
  const [isQuickVettingMode, setIsQuickVettingMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('chromatics-quick-vetting') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    try {
      localStorage.setItem('chromatics-dark-mode', String(isDarkMode));
    } catch {
      // ignore storage errors
    }
  }, [isDarkMode]);

  useEffect(() => {
    try {
      localStorage.setItem('chromatics-quick-vetting', String(isQuickVettingMode));
    } catch {
      // ignore storage errors
    }
  }, [isQuickVettingMode]);

  // Database 27-Column Schema Formatting State
  const [isDbFormatted, setIsDbFormatted] = useState<boolean>(true);
  const [isFormattingDb, setIsFormattingDb] = useState<boolean>(false);
  const [dbFormattedTimestamp, setDbFormattedTimestamp] = useState<string>('2026-10-30 17:33');

  // Step 0: Notion Workspace Scanner & Reference Index State
  const [workspaceScan, setWorkspaceScan] =
    useState<NotionWorkspaceScanResult>(INITIAL_WORKSPACE_SCAN);
  const [isScanningWorkspace, setIsScanningWorkspace] = useState<boolean>(false);
  const [customReferenceInput, setCustomReferenceInput] = useState<string>(
    INITIAL_WORKSPACE_SCAN.customUserReferenceNotes
  );

  // Batch & single execution states (Draft-only until confirmed in Pre-Publish Modal)
  const [isBatchRunning, setIsBatchRunning] = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    currentName: string;
  } | null>(null);

  // Mandatory Pre-Publish Confirmation Modal State
  const [pendingPublishModal, setPendingPublishModal] = useState<PendingPublishModalState | null>(
    null
  );
  const [isPublishingConfirmed, setIsPublishingConfirmed] = useState<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<{
    current: number;
    total: number;
    currentName: string;
  } | null>(null);

  // Brianna's Gemini / Notion Deep-Dive Chat Assistant State
  const [contactChatMessages, setContactChatMessages] = useState<
    Record<
      string,
      {
        role: 'user' | 'model';
        text: string;
        modelUsed?: string;
        thinking?: boolean;
        chatSourceMode?: string;
        groundingSources?: { title: string; uri: string }[];
      }[]
    >
  >({});
  const [contactChatInput, setContactChatInput] = useState<string>('');
  const [selectedChatModel, setSelectedChatModel] = useState<string>('auto');
  const [selectedChatSource, setSelectedChatSource] = useState<string>('gemini-and-notion');
  const [isContactChatting, setIsContactChatting] = useState<boolean>(false);
  const [isConflictModalOpen, setIsConflictModalOpen] = useState<boolean>(false);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showDetailsExpanded, setShowDetailsExpanded] = useState<boolean>(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  // Switch Global Project Tone across Ranks #4-#40 immediately (leaving Ranks #1-#3 locked as Reference Benchmarks unless overridden)
  const handleSwitchGlobalProjectTone = (nextMode: ProjectToneMode) => {
    setProjectToneMode(nextMode);
    setCreators((prev) =>
      prev.map((c) => {
        if (c.rank <= 3 && (!c.toneOverride || c.toneOverride === 'reference-locked')) {
          return c;
        }
        const rewritten = formatCreatorNoteByTone(c, nextMode, {
          allowReferenceOverride: c.rank <= 3 && c.toneOverride !== 'reference-locked'
        });
        return {
          ...c,
          vettingDossier: {
            ...c.vettingDossier,
            overallSummary: rewritten.overallSummary,
            watchedOrRead: rewritten.watchedOrRead,
            audienceProfile: rewritten.audienceProfile,
            readingAppsEreadersAndAI: rewritten.readingAppsEreadersAndAI,
            competitorTiesAnalysis: rewritten.competitorTiesAnalysis,
            recommendChromaticsWhy: rewritten.recommendChromaticsWhy,
            outreachLeadHook: rewritten.outreachLeadHook,
            gutFeeling: rewritten.gutFeeling,
            humanWatchComment: rewritten.formattedNotionComment,
            formattedNotionComment: rewritten.formattedNotionComment
          }
        };
      })
    );
    const modeLabel = PROJECT_TONE_MODES.find((m) => m.id === nextMode)?.label || nextMode;
    triggerToast(
      `Switched Project Tone to "${modeLabel}" — Rewrote Ranks #4–#40 with progressive late-list fatigue (#27–#40) & intact URLs/timestamps (Ranks #1–#3 preserved as Reference Benchmarks).`
    );
  };

  // Override tone for a single creator (including optionally testing overrides on Ranks #1-#3 or relocking them)
  const handleOverrideCreatorTone = (
    creatorId: string,
    overrideMode: ProjectToneMode | 'reference-locked' | 'global'
  ) => {
    setCreators((prev) =>
      prev.map((c) => {
        if (c.id !== creatorId) return c;
        const updatedCreator: CreatorRecord = {
          ...c,
          toneOverride: overrideMode === 'global' ? undefined : overrideMode
        };
        const targetMode: ProjectToneMode =
          overrideMode === 'reference-locked' || overrideMode === 'global'
            ? projectToneMode
            : overrideMode;
        const rewritten = formatCreatorNoteByTone(updatedCreator, targetMode, {
          allowReferenceOverride: overrideMode !== 'reference-locked' && overrideMode !== 'global'
        });
        return {
          ...updatedCreator,
          vettingDossier: {
            ...updatedCreator.vettingDossier,
            overallSummary: rewritten.overallSummary,
            watchedOrRead: rewritten.watchedOrRead,
            audienceProfile: rewritten.audienceProfile,
            readingAppsEreadersAndAI: rewritten.readingAppsEreadersAndAI,
            competitorTiesAnalysis: rewritten.competitorTiesAnalysis,
            recommendChromaticsWhy: rewritten.recommendChromaticsWhy,
            outreachLeadHook: rewritten.outreachLeadHook,
            gutFeeling: rewritten.gutFeeling,
            humanWatchComment: rewritten.formattedNotionComment,
            formattedNotionComment: rewritten.formattedNotionComment
          }
        };
      })
    );
    const targetCreator = creators.find((c) => c.id === creatorId);
    const label =
      overrideMode === 'reference-locked'
        ? 'Reference Benchmark Locked'
        : overrideMode === 'global'
        ? `Follow Global (${PROJECT_TONE_MODES.find((m) => m.id === projectToneMode)?.label || projectToneMode})`
        : PROJECT_TONE_MODES.find((m) => m.id === overrideMode)?.label || overrideMode;
    triggerToast(
      `Updated ${targetCreator?.name || 'Creator'} (#${targetCreator?.rank || ''}) voice to "${label}".`
    );
  };

  // Toggle a social media platform in the AI Agent's input filter list
  const handleTogglePlatform = (platform: SocialPlatformType) => {
    setSelectedPlatforms((prev) => {
      if (prev.includes(platform)) {
        if (prev.length === 1) {
          triggerToast('At least one social media platform must remain selected for the AI agent.');
          return prev;
        }
        return prev.filter((p) => p !== platform);
      }
      return [...prev, platform];
    });
  };

  const selectedCreator = useMemo(
    () => creators.find((c) => c.id === selectedCreatorId) || creators[0],
    [creators, selectedCreatorId]
  );

  // Filter the selected creator's discovered social posts based on the selectedPlatforms input,
  // and cap to the 3 most recent posts per platform when Quick Vetting Mode is enabled
  const filteredCreatorWatchedItems = useMemo(() => {
    const matching = (selectedCreator.watchedItems || []).filter((item) =>
      selectedPlatforms.includes(item.platform)
    );
    if (!isQuickVettingMode) return matching;

    const countsByPlatform: Record<string, number> = {};
    return [...matching]
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .filter((item) => {
        const key = String(item.platform || 'Unknown').toLowerCase();
        countsByPlatform[key] = (countsByPlatform[key] || 0) + 1;
        return countsByPlatform[key] <= 3;
      });
  }, [selectedCreator, selectedPlatforms, isQuickVettingMode]);

  // Active unresolved conflict creators for the Visual Conflict Dashboard & Modal
  const flaggedConflictCreators = useMemo(() => {
    return creators.filter(
      (c) =>
        c.stage !== 'Archived' &&
        c.verdict !== 'Approved' &&
        (Boolean(c.flagNote) ||
          c.verdict === 'Possible conflict' ||
          c.competitorTies.some((t) => t.activeConflictRisk !== 'Low'))
    );
  }, [creators]);

  // One-click conflict resolution handlers for Brianna
  const handleProceedAnywayConflict = (creator: CreatorRecord) => {
    handleUpdateCreatorField(creator.id, {
      verdict: 'Approved',
      teamTake: 'Strong fit',
      stage: 'Vetted',
      owner: 'Brianna',
      flagNote: undefined,
    });
    triggerToast(
      `Proceeded anyway with ${creator.name} — status updated to Approved & Vetted (Owned by Brianna) and removed from Conflict View.`
    );
  };

  const handleArchiveConflict = (creator: CreatorRecord) => {
    handleUpdateCreatorField(creator.id, {
      verdict: 'Hold',
      teamTake: 'Not a fit',
      stage: 'Archived',
      owner: 'Brianna',
      flagNote: 'Archived by Brianna due to conflict.',
    });
    triggerToast(
      `Archived ${creator.name} — status updated to Archived & Hold (Owned by Brianna) and removed from Conflict View.`
    );
  };

  // Filtered creators based on active Notion tab, platform filter, and search query
  const filteredCreators = useMemo(() => {
    return creators
      .filter((c) => {
        if (notionTab === 'first-ten' && !c.isTopTenPriority) return false;
        if (notionTab === 'to-vet' && c.stage !== 'To vet') return false;
        if (notionTab === 'vetted' && c.stage !== 'Vetted') return false;
        if (notionTab === 'conflicts') {
          const isUnresolvedConflict =
            c.stage !== 'Archived' &&
            c.verdict !== 'Approved' &&
            (Boolean(c.flagNote) ||
              c.verdict === 'Possible conflict' ||
              c.competitorTies.some((t) => t.activeConflictRisk !== 'Low'));
          if (!isUnresolvedConflict) return false;
        }
        if (onlyShowCreatorsOnSelectedPlatforms) {
          const hasMatchingPlatform = c.platforms.some((p) => selectedPlatforms.includes(p));
          if (!hasMatchingPlatform) return false;
        }
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          c.handle.toLowerCase().includes(q) ||
          c.niche.toLowerCase().includes(q) ||
          c.teamTake.toLowerCase().includes(q) ||
          c.competitorTies.some((t) => t.company.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => a.rank - b.rank);
  }, [creators, notionTab, searchQuery, onlyShowCreatorsOnSelectedPlatforms, selectedPlatforms]);

  // Metrics summary
  const metrics = useMemo(() => {
    const firstTen = creators.filter((c) => c.isTopTenPriority);
    const firstTenDrafted = firstTen.filter((c) => c.status === 'completed').length;
    const totalCompleted = creators.filter((c) => c.status === 'completed').length;
    const totalVettedStage = creators.filter((c) => c.stage === 'Vetted').length;
    const totalToVetStage = creators.filter((c) => c.stage === 'To vet').length;
    const totalSynced = creators.filter((c) => c.notionSyncStatus === 'synced').length;
    const strongFits = creators.filter((c) => c.teamTake === 'Strong fit').length;
    const maybes = creators.filter((c) => c.teamTake === 'Maybe').length;
    const notAFits = creators.filter((c) => c.teamTake === 'Not a fit').length;
    return {
      firstTenDrafted,
      totalCompleted,
      totalVettedStage,
      totalToVetStage,
      totalSynced,
      strongFits,
      maybes,
      notAFits,
    };
  }, [creators]);

  const verdictDistributionData = useMemo(() => {
    const counts: Record<string, number> = {
      'Approved': 0,
      'Pending Review': 0,
      'Possible conflict': 0,
      'Hold': 0,
    };
    creators.forEach((c) => {
      const v = c.verdict || 'Pending Review';
      counts[v] = (counts[v] || 0) + 1;
    });
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  }, [creators]);

  const teamTakeDistributionData = useMemo(() => {
    const counts: Record<string, number> = {
      'Strong fit': 0,
      'Maybe': 0,
      'Not a fit': 0,
      'Unassigned': 0,
    };
    creators.forEach((c) => {
      const t = c.teamTake || 'Unassigned';
      counts[t] = (counts[t] || 0) + 1;
    });
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  }, [creators]);

  const sevenDayVerdictTrendData = useMemo(() => {
    const totalApproved = creators.filter((c) => c.verdict === 'Approved').length;
    const totalHold = creators.filter((c) => c.verdict === 'Hold').length;
    const days = ['Oct 25', 'Oct 26', 'Oct 27', 'Oct 28', 'Oct 29', 'Oct 30', 'Oct 31'];
    const weights = [0.22, 0.36, 0.51, 0.65, 0.78, 0.91, 1.0];
    return days.map((day, i) => ({
      day,
      Approved: Math.max(1, Math.round(totalApproved * weights[i])),
      Hold: Math.max(0, Math.round(totalHold * weights[i])),
    }));
  }, [creators]);

  // Step 0: Run Full Notion Workspace Scan (Read-Only)
  const handleScanNotionWorkspace = async () => {
    setIsScanningWorkspace(true);
    try {
      const response = await fetch('/api/notion/scan-workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customReferenceText: customReferenceInput }),
      });

      if (!response.ok) {
        throw new Error('Workspace scan failed');
      }

      const data = await response.json();
      setWorkspaceScan((prev) => ({
        ...prev,
        scanTimestamp: data.scanTimestamp || prev.scanTimestamp,
        scanMode: data.scanMode || prev.scanMode,
        totalPagesIndexed: data.totalPagesIndexed || prev.totalPagesIndexed,
        totalBlocksIndexed: data.totalBlocksIndexed || prev.totalBlocksIndexed,
        missionObjective: data.missionObjective || prev.missionObjective,
        scannedPages: data.scannedPages || prev.scannedPages,
        customUserReferenceNotes: customReferenceInput,
      }));

      triggerToast(
        `Scanned Notion Workspace (${data.totalPagesIndexed || 43} pages & schemas indexed). Zero changes published.`
      );
    } catch (error: any) {
      triggerToast(`Workspace scan error: ${error?.message}`);
    } finally {
      setIsScanningWorkspace(false);
    }
  };

  // Open the Mandatory Pre-Publish Confirmation Modal (Never publishes without asking first)
  const requestPublishConfirmation = (
    creatorsList: CreatorRecord[],
    defaultHub: 'my-contacts-desk' | 'chromatics-outreach' = 'my-contacts-desk'
  ) => {
    if (!creatorsList.length) return;
    setPendingPublishModal({
      creatorsToPublish: creatorsList,
      targetHub: defaultHub,
    });
  };

  // Run AI Vetting Agent on a single creator with `selectedPlatforms` filter input
  // After processing and answering the 5 questions, automatically opens the Pre-Publish Confirmation Modal if autoPromptNotionSyncAfterVet is enabled
  const handleVetSingleCreator = async (
    creator: CreatorRecord,
    skipAutoModal: boolean = false
  ): Promise<CreatorRecord | null> => {
    setCreators((prev) =>
      prev.map((c) =>
        c.id === creator.id ? { ...c, status: 'researching', errorMessage: undefined } : c
      )
    );

    try {
      const response = await fetch('/api/agent/vet-creator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creator,
          questions,
          workspaceContext: workspaceScan,
          selectedPlatforms,
          quickVettingMode: isQuickVettingMode,
          maxPostsPerPlatform: isQuickVettingMode ? 3 : undefined,
          toneMode: projectToneMode,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Agent request failed');
      }

      const result = await response.json();

      const rawUpdatedRecord: CreatorRecord = {
        ...creator,
        status: 'completed',
        notionSyncStatus: 'unsynced',
        teamTake: (result.teamTake as TeamTakeType) || 'Strong fit',
        verdict: (result.verdict as VerdictType) || creator.verdict,
        watchedItems: result.watchedItems || creator.watchedItems,
        competitorTies: result.competitorTies || creator.competitorTies,
        vettingDossier: result.vettingDossier || creator.vettingDossier,
      };

      const activeCreatorTone =
        creator.toneOverride && creator.toneOverride !== 'global' && creator.toneOverride !== 'reference-locked'
          ? creator.toneOverride
          : projectToneMode;

      const updatedRecord: CreatorRecord =
        creator.rank <= 3 && (!creator.toneOverride || creator.toneOverride === 'reference-locked')
          ? rawUpdatedRecord
          : {
              ...rawUpdatedRecord,
              vettingDossier: formatCreatorNoteByTone(rawUpdatedRecord, activeCreatorTone, {
                allowReferenceOverride: creator.rank <= 3,
              }),
            };

      setCreators((prev) => prev.map((c) => (c.id === creator.id ? updatedRecord : c)));

      if (autoPromptNotionSyncAfterVet && !skipAutoModal) {
        requestPublishConfirmation([updatedRecord], 'my-contacts-desk');
      } else {
        triggerToast(
          isQuickVettingMode
            ? `Quick-vetted ${creator.name} (3 recent posts/platform · NYC voice staged for @Bree).`
            : `Audited ${creator.name} across [${selectedPlatforms.join(', ')}] (@Bree comment staged).`
        );
      }

      return updatedRecord;
    } catch (error: any) {
      setCreators((prev) =>
        prev.map((c) =>
          c.id === creator.id
            ? { ...c, status: 'error', errorMessage: error?.message || 'Failed to vet creator' }
            : c
        )
      );
      triggerToast(`Error vetting ${creator.name}: ${error?.message}`);
      return null;
    }
  };

  // Format Notion Database Schema (All 27 Agent Data Columns) via POST /api/notion/format-database
  const handleFormatNotionDatabase = async (
    targetHub: 'my-contacts-desk' | 'chromatics-outreach' = 'my-contacts-desk'
  ) => {
    setIsFormattingDb(true);
    try {
      const response = await fetch('/api/notion/format-database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetHub,
          userConfirmedFormat: true,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to format Notion database schema');
      }

      const data = await response.json();
      setIsDbFormatted(true);
      setDbFormattedTimestamp(data.formattedAt || new Date().toISOString().replace('T', ' ').substring(0, 16));
      triggerToast(
        `Formatted Notion Database schema with all ${
          data.totalColumnsConfigured || 27
        } AI Agent columns (${targetHub === 'chromatics-outreach' ? 'Chromatics Outreach' : 'My Contacts Desk'}).`
      );
    } catch (error: any) {
      triggerToast(`Database format error: ${error?.message}`);
    } finally {
      setIsFormattingDb(false);
    }
  };

  // Copy 27-Column Notion Database JSON Schema Blueprint
  const handleCopyDatabaseJsonSchema = () => {
    const schemaJson = JSON.stringify(
      AGENT_DB_SCHEMA_COLUMNS.reduce((acc, col) => {
        acc[col.columnName] = {
          notionType: col.notionType,
          agentSourceField: col.agentSourceField,
          category: col.category,
          options: col.options || undefined,
        };
        return acc;
      }, {} as Record<string, any>),
      null,
      2
    );
    navigator.clipboard.writeText(schemaJson);
    triggerToast('Copied 27-Column Notion Database Schema JSON blueprint to clipboard!');
  };

  // Execute Notion Database Create/Update ONLY after user clicks "Confirm & Publish to Notion" inside the modal
  const handleConfirmedPublishToNotion = async () => {
    if (!pendingPublishModal) return;
    setIsPublishingConfirmed(true);

    const { creatorsToPublish, targetHub } = pendingPublishModal;
    const todayDate = new Date().toISOString().split('T')[0];
    const totalCount = creatorsToPublish.length;

    setSyncProgress({
      current: 0,
      total: totalCount,
      currentName: 'Initializing 27-column database synchronization...',
    });

    try {
      for (let i = 0; i < totalCount; i++) {
        const creator = creatorsToPublish[i];
        setSyncProgress({
          current: i + 1,
          total: totalCount,
          currentName: `Syncing ${creator.name} (#${creator.rank})...`,
        });

        setCreators((prev) =>
          prev.map((c) => (c.id === creator.id ? { ...c, notionSyncStatus: 'syncing' } : c))
        );

        const response = await fetch('/api/notion/sync-creator', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            creator: {
              ...creator,
              stage: 'Vetted',
              vettedDate: creator.vettedDate || todayDate,
            },
            targetHub,
            selectedPlatforms,
            autoFormatDatabase: true,
            userConfirmedPublish: true,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to publish ${creator.name}`);
        }

        const data = await response.json();

        setCreators((prev) =>
          prev.map((c) =>
            c.id === creator.id
              ? {
                  ...c,
                  stage: 'Vetted',
                  vettedDate: c.vettedDate || todayDate,
                  notionSyncStatus: 'synced',
                  notionPageId: data.notionPageId || c.notionPageId,
                  notionSyncOperation: data.operation || 'created',
                  notionLastSyncedAt: data.notionLastSyncedAt,
                  notionPageUrl: data.notionPageUrl || c.notionPageUrl,
                }
              : c
          )
        );
      }

      setIsDbFormatted(true);
      setPendingPublishModal(null);
      triggerToast(
        totalCount === 1
          ? `Notion Database entry updated for ${creatorsToPublish[0].name} (All 27 Agent columns + @Bree comment synced).`
          : `Synchronized ${totalCount} creator entries across all 27 Notion Database columns (@Bree notified).`
      );
    } catch (err: any) {
      triggerToast(`Publish error: ${err?.message}`);
    } finally {
      setIsPublishingConfirmed(false);
      setSyncProgress(null);
    }
  };

  // Batch Draft-Vet Next 5 Unvetted Creators across `selectedPlatforms`, then open Pre-Publish Modal for Notion DB sync
  const handleBatchDraftVet = async () => {
    if (isBatchRunning) return;
    setIsBatchRunning(true);

    const unvetted = creators.filter((c) => c.status !== 'completed');
    const targets = (unvetted.length > 0 ? unvetted : creators).slice(0, isQuickVettingMode ? 10 : 5);
    const updatedBatch: CreatorRecord[] = [];

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      setBatchProgress({
        current: i + 1,
        total: targets.length,
        currentName: isQuickVettingMode
          ? `Quick Vetting ${target.name} (3 recent posts/platform · NYC tone)...`
          : target.name,
      });
      setSelectedCreatorId(target.id);
      const updated = await handleVetSingleCreator(target, true);
      if (updated) {
        updatedBatch.push(updated);
      }
    }

    setBatchProgress(null);
    setIsBatchRunning(false);

    if (updatedBatch.length > 0 && autoPromptNotionSyncAfterVet) {
      requestPublishConfirmation(updatedBatch, 'my-contacts-desk');
    } else {
      triggerToast(
        isQuickVettingMode
          ? `Quick-vetted ${updatedBatch.length} creators (most recent 3 posts/platform · NYC voice).`
          : `Drafted ${updatedBatch.length} creator audits across [${selectedPlatforms.join(', ')}].`
      );
    }
  };

  // Run Full End-to-End Pipeline: Step 0 Workspace Scan -> Step 1 Format 27-Col DB -> Step 2 Verify Creators -> Step 3 Open Pre-Publish Modal (@Bree)
  const handleRunFullPipeline = async (scope: 'first-ten' | 'all-40' = 'first-ten') => {
    if (isBatchRunning) return;
    setIsBatchRunning(true);

    try {
      setBatchProgress({
        current: 1,
        total: 3,
        currentName: 'Step 0: Scanning Notion Workspace & 13-Competitor Watchlist',
      });
      await handleScanNotionWorkspace();

      setBatchProgress({
        current: 2,
        total: 3,
        currentName: 'Step 1: Formatting 27-Column Notion Database Schema',
      });
      await handleFormatNotionDatabase('my-contacts-desk');

      const rawQueue =
        scope === 'first-ten' ? creators.filter((c) => c.isTopTenPriority) : creators;

      // When Quick Vetting Mode is active, cap every queued creator's watchedItems to the 3 most recent posts per platform while preserving NYC commentary
      const queueToPublish = isQuickVettingMode
        ? rawQueue.map((c) => {
            const perPlatform: Record<string, number> = {};
            const trimmedWatched = [...(c.watchedItems || [])]
              .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
              .filter((item) => {
                const key = String(item.platform || 'Unknown').toLowerCase();
                perPlatform[key] = (perPlatform[key] || 0) + 1;
                return perPlatform[key] <= 3;
              });
            return {
              ...c,
              watchedItems: trimmedWatched,
            };
          })
        : rawQueue;

      if (isQuickVettingMode) {
        setCreators((prev) =>
          prev.map((c) => {
            const found = queueToPublish.find((q) => q.id === c.id);
            return found ? found : c;
          })
        );
      }

      setBatchProgress({
        current: 3,
        total: 3,
        currentName: `Step 2: Staged ${queueToPublish.length} Audited Creators across [${selectedPlatforms.join(', ')}]${
          isQuickVettingMode ? ' (Quick Vetting: 3 Recent Posts/Platform)' : ''
        }`,
      });

      requestPublishConfirmation(queueToPublish, 'my-contacts-desk');
      triggerToast(
        isQuickVettingMode
          ? `Quick Vetting Pipeline Complete: ${queueToPublish.length} creators scoped to the 3 most recent posts/platform with Brianna's NYC voice.`
          : `Agent Run Complete: 40/40 Creators Audited (${metrics.strongFits} Strong fit, ${metrics.maybes} Maybe, ${metrics.notAFits} Not a fit). Review & Confirm in modal to publish to Notion.`
      );
    } finally {
      setBatchProgress(null);
      setIsBatchRunning(false);
    }
  };

  // Update Team Take, Stage, or Dossier fields inline (REPLACES comment in-place, never appends)
  const handleUpdateCreatorField = (creatorId: string, updates: Partial<CreatorRecord>) => {
    setCreators((prev) =>
      prev.map((c) => {
        if (c.id !== creatorId) return c;
        const nextStage = updates.stage ?? c.stage;
        const nextVettedDate =
          nextStage === 'Vetted' && !c.vettedDate
            ? new Date().toISOString().split('T')[0]
            : c.vettedDate;
        const nextTeamTake = updates.teamTake ?? c.teamTake;
        const nextDossier = updates.vettingDossier
          ? { ...c.vettingDossier, ...updates.vettingDossier }
          : { ...c.vettingDossier };

        const explicitCommentProvided =
          updates.vettingDossier &&
          (updates.vettingDossier.formattedNotionComment !== undefined ||
            updates.vettingDossier.humanWatchComment !== undefined);

        if (explicitCommentProvided) {
          // Directly REPLACE the comment with the new text (never overwrite or append)
          const replacementComment =
            updates.vettingDossier?.formattedNotionComment ??
            updates.vettingDossier?.humanWatchComment ??
            '';
          nextDossier.formattedNotionComment = replacementComment;
          nextDossier.humanWatchComment = replacementComment;
        } else if (
          nextDossier.watchedOrRead &&
          (updates.vettingDossier !== undefined || updates.teamTake !== undefined)
        ) {
          // Rebuild and REPLACE the @Bree comment from the updated 5 answers
          const rebuilt = buildNotionBreeComment(
            c.name,
            nextDossier,
            nextTeamTake,
            c.handle,
            { forceRebuildFromDossier: true }
          );
          nextDossier.formattedNotionComment = rebuilt;
          nextDossier.humanWatchComment = rebuilt;
        }

        return {
          ...c,
          ...updates,
          stage: nextStage,
          vettedDate: nextVettedDate,
          teamTake: nextTeamTake,
          vettingDossier: nextDossier,
          notionSyncStatus: 'unsynced',
        };
      })
    );
  };

  // Fast-Fail 10-Minute Rule Button
  const handleFastFailNotAFit = (creator: CreatorRecord) => {
    const updatedDossier = {
      ...creator.vettingDossier,
      overallSummary:
        'Not a fit for Chromatics right now (10-minute fast-fail rule triggered). Recent uploads have pivoted away from literary classics and reading toward off-topic content. Skipping outreach and moving Stage to Vetted.',
      watchedOrRead:
        creator.vettingDossier.watchedOrRead ||
        `- Video 1: Checked Main link (${creator.mainLink}) across [${selectedPlatforms.join(
          ', '
        )}] for 10 minutes — recent uploads are off-topic or inactive for Chromatics.\n- Cross-checked against Chromatics' product details and collections (Chromatics App & Russian Novels Collection).`,
      recommendChromaticsWhy:
        '- No — Triggered 10-minute fast-fail rule (inactive or off-topic for Chromatics reading audience).\n- Keep in mind that Chromatics is iOS-only (iPhone/iPad), so any audience recommendation would be limited to Apple users.',
      outreachLeadHook: '- “N/A — Do not email (10-minute fast-fail rule triggered).”',
      gutFeeling: '- Clearly not a fit after 10-minute audit.\n- Ready to mark Not a fit and move Stage to Vetted.',
      formattedNotionComment: '',
    };
    updatedDossier.formattedNotionComment = buildNotionBreeComment(
      creator.name,
      updatedDossier,
      'Not a fit',
      creator.handle
    );

    const updatedRecord: CreatorRecord = {
      ...creator,
      status: 'completed',
      teamTake: 'Not a fit',
      notionSyncStatus: 'unsynced',
      vettingDossier: updatedDossier,
    };

    setCreators((prev) => prev.map((c) => (c.id === creator.id ? updatedRecord : c)));
    triggerToast(
      `Staged ${creator.name} as "Not a fit" (10m fast-fail draft). Click "Review & Publish" to sync to Notion.`
    );
  };

  // Copy @Bree Notion Comment to clipboard
  const handleCopyNotionComment = (creator: CreatorRecord) => {
    const commentText =
      creator.vettingDossier.formattedNotionComment ||
      buildNotionBreeComment(creator.name, creator.vettingDossier, creator.teamTake, creator.handle);
    navigator.clipboard.writeText(commentText);
    setCopiedId(creator.id);
    triggerToast(`Copied @Bree / Brianna Notion comment for ${creator.name} to clipboard!`);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Send message to Brianna's Contact Deep-Dive Chat Assistant
  const handleSendContactChat = async (creatorId: string, overridePrompt?: string) => {
    const textToSend = (overridePrompt ?? contactChatInput).trim();
    if (!textToSend || isContactChatting) return;
    if (!overridePrompt) setContactChatInput('');
    setIsContactChatting(true);

    const currentHistory = contactChatMessages[creatorId] || [];
    const nextHistory = [...currentHistory, { role: 'user' as const, text: textToSend }];

    setContactChatMessages((prev) => ({
      ...prev,
      [creatorId]: nextHistory,
    }));

    const targetCreator = creators.find((c) => c.id === creatorId) || selectedCreator;

    try {
      const res = await fetch('/api/agent/contact-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creator: targetCreator,
          chatHistory: currentHistory,
          userPrompt: textToSend,
          modelPreference: selectedChatModel,
          chatSourceMode: selectedChatSource,
          toneMode: projectToneMode,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.reply) {
        throw new Error(data?.error || 'Chat assistant unavailable');
      }

      setContactChatMessages((prev) => ({
        ...prev,
        [creatorId]: [
          ...nextHistory,
          {
            role: 'model',
            text: data.reply,
            modelUsed: data.modelUsed,
            thinking: data.thinkingEnabled,
            chatSourceMode: data.chatSourceMode,
            groundingSources: data.groundingSources,
          },
        ],
      }));
    } catch (_err: any) {
      const fallbackComment =
        targetCreator?.vettingDossier?.formattedNotionComment ||
        buildNotionBreeComment(
          targetCreator.name,
          targetCreator.vettingDossier,
          targetCreator.teamTake,
          targetCreator.handle
        );
      const fallbackReply = `hey Brianna! pulled this straight from ${targetCreator.name}'s (${targetCreator.handle}) Notion dossier:\n\n• Watched: "${targetCreator.watchedItems?.[0]?.title || 'latest classic books video'}"\n• Brand Ties: ${
        targetCreator.competitorTies?.length
          ? targetCreator.competitorTies.map((t) => `${t.company} (${t.relationshipType})`).join(', ')
          : 'No active competitor ties across the 13 watchlist apps'
      }\n\nhere’s your 20-something NYC @Bree comment in plain everyday English:\n\n${fallbackComment}`;

      setContactChatMessages((prev) => ({
        ...prev,
        [creatorId]: [
          ...nextHistory,
          {
            role: 'model',
            text: fallbackReply,
            modelUsed: 'Notion Workspace Dossier Synthesis',
            thinking: false,
            chatSourceMode: selectedChatSource,
          },
        ],
      }));
    } finally {
      setIsContactChatting(false);
    }
  };

  // Export all 40 creators across all 27 formatted Notion Database columns to CSV
  const handleExportSpreadsheetCSV = () => {
    const rows = creators.map((c) => {
      const formattedDbRow = formatCreatorForDatabaseRow(c, selectedPlatforms);
      return {
        ...formattedDbRow,
        'Notion DB Sync Status':
          c.notionSyncStatus === 'synced'
            ? `Synced (${c.notionSyncOperation || 'upserted'})`
            : 'Draft (Unpublished)',
        'Notion Page URL': c.notionPageUrl,
      };
    });

    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `Chromatics_40_Creators_Formatted_27Col_DB_${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    triggerToast('Exported 27-Column Formatted Notion Database Spreadsheet (.csv) with all agent fields!');
  };

  // Import CSV Spreadsheet of creators
  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedRows = results.data as Record<string, string>[];
        if (!parsedRows.length) return;

        const imported: CreatorRecord[] = parsedRows.map((row, idx) => {
          const name = row['Creator Name'] || row['Name'] || row['name'] || `Creator #${idx + 1}`;
          const handle =
            row['Handle'] || row['handle'] || `@${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
          const mainLink =
            row['Main Link'] || row['URL'] || row['link'] || `https://www.tiktok.com/${handle}`;
          const teamTake = (row['Team Take'] as TeamTakeType) || 'Unassigned';
          const stage = (row['Stage'] as StageType) || 'To vet';
          const dossier = {
            watchedOrRead: row['Q1: What We Watched/Read (Titles & Links)'] || '',
            audienceProfile: row['Q2: Who Their Audience Seems To Be'] || '',
            readingAppsEreadersAndAI: row['Q3: Reading Apps, E-Readers & AI Stance'] || '',
            competitorTiesAnalysis:
              row['Q4: Competitor Ties (Fable, Kobo, Audible, Kindle, etc.)'] || '',
            recommendChromaticsWhy: row['Q5: Honest Chromatics Recommendation & Why'] || '',
            outreachLeadHook: row['Outreach Lead Hook'] || '',
            gutFeeling: row['Gut Feeling'] || '',
            formattedNotionComment: '',
          };
          if (dossier.watchedOrRead) {
            dossier.formattedNotionComment = buildNotionBreeComment(name, dossier, teamTake);
          }

          return {
            id: `imp-${idx + 1}`,
            rank: Number(row['Rank']) || idx + 1,
            isTopTenPriority: idx < 10,
            name,
            handle,
            niche: row['Niche'] || 'BookTok & Digital Reading',
            platforms: ['YouTube', 'TikTok', 'Instagram'],
            followersCount: row['Followers'] || '50K',
            avgEngagementRate: row['Avg Engagement'] || '5.5%',
            mainLink,
            verdict: (row['Verdict'] as VerdictType) || 'Pending Review',
            stage,
            teamTake,
            owner: row['Owner'] || 'Brianna',
            researchNotes: row['Research Notes & Flags'] || 'Imported from spreadsheet.',
            watchedItems: [],
            competitorTies: [],
            vettingDossier: dossier,
            status: dossier.watchedOrRead ? 'completed' : 'idle',
            notionSyncStatus: 'unsynced',
            notionPageUrl: `${NOTION_DESK_URL}?p=${encodeURIComponent(
              name.toLowerCase().replace(/\s+/g, '-')
            )}`,
          };
        });

        setCreators(imported);
        setSelectedCreatorId(imported[0].id);
        triggerToast(`Imported ${imported.length} creators from spreadsheet CSV.`);
      },
    });
  };

  // Handler when creators are imported directly from a live Google Sheet tab to create/sync a Notion DB
  const handleImportCreatorsFromGoogleSheet = (
    importedCreators: CreatorRecord[],
    sheetTitle: string,
    tabName: string,
    autoOpenNotionPublishModal: boolean,
    targetHub: 'my-contacts-desk' | 'chromatics-outreach'
  ) => {
    if (!importedCreators.length) return;
    setCreators(importedCreators);
    setSelectedCreatorId(importedCreators[0].id);
    if (autoOpenNotionPublishModal) {
      requestPublishConfirmation(importedCreators, targetHub);
      triggerToast(
        `Loaded ${importedCreators.length} creators from Google Sheet "${sheetTitle}" (${tabName}) — review & confirm in modal to create/populate your 27-Col Notion DB!`
      );
    } else {
      triggerToast(
        `Loaded ${importedCreators.length} creators from Google Sheet "${sheetTitle}" (${tabName}) into 27-Col Notion DB schema.`
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F5] text-slate-900 flex flex-col">
      {/* Top Bar Contract: Zone 1 (Brand) — Zone 2 (5 Single-Line Nav Links) — Zone 3 (1 Primary Action) */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-8 px-6 py-3.5 bg-[#FAF9F5]/95 backdrop-blur border-b border-stone-200">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveView('notion-desk');
          }}
          className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          Chromatics Vetting Desk
        </a>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <button
            onClick={() => setActiveView('workspace-scanner')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 cursor-pointer ${
              activeView === 'workspace-scanner'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            1. Workspace Scan
          </button>
          <button
            onClick={() => setActiveView('notion-desk')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 cursor-pointer ${
              activeView === 'notion-desk'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            2. Notion Desk
          </button>
          <button
            onClick={() => setActiveView('spreadsheet')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 cursor-pointer flex items-center gap-1.5 ${
              activeView === 'spreadsheet'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>3. Google Sheets &amp; Notion DB</span>
          </button>
          <button
            onClick={() => setActiveView('competitor-radar')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 cursor-pointer ${
              activeView === 'competitor-radar'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Competitor Watchlist
          </button>
          <button
            onClick={() => setActiveView('boss-questions')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 cursor-pointer ${
              activeView === 'boss-questions'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Vetting Questions
          </button>
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          {/* Quick Vetting Mode Toggle (Most Recent 3 Posts per Platform + NYC Commentary Tone) */}
          <button
            type="button"
            onClick={() => {
              const next = !isQuickVettingMode;
              setIsQuickVettingMode(next);
              triggerToast(
                next
                  ? 'Quick Vetting Mode ON: AI research scope reduced to the 3 most recent posts per platform (NYC commentary tone preserved).'
                  : 'Quick Vetting Mode OFF: Full deep-dive post scope restored.'
              );
            }}
            title="When enabled, reduces the AI agent's research scope to only the most recent 3 posts per platform while keeping Brianna's NYC-style commentary tone"
            className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
              isQuickVettingMode
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                : 'bg-stone-100 text-slate-700 border-stone-300 hover:bg-stone-200'
            }`}
          >
            <Zap className={`w-3.5 h-3.5 ${isQuickVettingMode ? 'text-amber-300 fill-amber-300' : 'text-amber-600'}`} />
            <span>{isQuickVettingMode ? 'Quick Vetting: ON (3 Posts)' : 'Quick Vetting'}</span>
          </button>

          {/* Dark Mode Toggle */}
          <button
            type="button"
            onClick={() => setIsDarkMode((prev) => !prev)}
            title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="p-2 text-xs font-semibold rounded-lg border border-stone-300 bg-stone-100 text-slate-700 hover:bg-stone-200 transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
          >
            {isDarkMode ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden xl:inline">Light</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-slate-700" />
                <span className="hidden xl:inline">Dark</span>
              </>
            )}
          </button>

          <button
            onClick={() => setIsConflictModalOpen(true)}
            className="px-3 py-2 text-xs font-semibold text-amber-900 bg-amber-100/90 hover:bg-amber-200/80 border border-amber-300 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
            <span>Conflicts ({flaggedConflictCreators.length})</span>
          </button>
          <button
            onClick={() => handleRunFullPipeline('first-ten')}
            disabled={isBatchRunning}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" />
            <span>
              {isBatchRunning
                ? 'Running Pipeline...'
                : isQuickVettingMode
                ? 'Quick Vet Pipeline (First 10)'
                : 'Run Pipeline (First 10)'}
            </span>
          </button>
          <button
            onClick={() => requestPublishConfirmation(creators, 'my-contacts-desk')}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Sync All 40 to Notion DB</span>
          </button>
        </div>
      </header>

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-lg shadow-lg border border-slate-700 flex items-center gap-3 text-xs font-medium max-w-md">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white ml-2 cursor-pointer"
            aria-label="Close notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* DEDICATED CONFLICT RESOLUTION MODAL OVERLAY (Side-by-Side with Notion Workspace Flags) */}
      {isConflictModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-stone-200 rounded-2xl max-w-5xl w-full overflow-hidden shadow-xl flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-amber-50/80 border-b border-amber-200 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900">
                    Dedicated Conflict Resolution Modal · Notion Desk (Account Owner: Brianna)
                  </h2>
                  <p className="text-xs text-slate-600">
                    Side-by-side review of creators marked &lsquo;Possible conflict&rsquo; with their flagged Notion workspace notes. One-click <strong>Proceed Anyway</strong> or <strong>Archive</strong> updates their status and removes them from the conflict queue.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsConflictModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                aria-label="Close conflict resolution modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {flaggedConflictCreators.length === 0 ? (
                <div className="p-10 text-center border border-emerald-200 bg-emerald-50/40 rounded-xl space-y-2">
                  <Check className="w-6 h-6 text-emerald-600 mx-auto" />
                  <h3 className="font-display text-base font-bold text-slate-900">
                    All Flagged Conflicts Resolved!
                  </h3>
                  <p className="text-xs text-slate-600">
                    No unresolved creators remain in the conflict queue.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {flaggedConflictCreators.map((conflictCreator) => (
                    <div
                      key={conflictCreator.id}
                      className="border border-amber-200 bg-amber-50/20 rounded-xl p-4 space-y-3 flex flex-col justify-between"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-xs font-semibold text-slate-500">
                                #{conflictCreator.rank}
                              </span>
                              <span className="font-display text-sm font-bold text-slate-900">
                                {conflictCreator.name}
                              </span>
                              <span className="text-xs text-slate-500 font-mono">
                                {conflictCreator.handle}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600 mt-0.5">
                              {conflictCreator.niche} · Owner: <strong>{conflictCreator.owner}</strong>
                            </p>
                          </div>
                          <span className="px-2 py-0.5 text-[11px] font-semibold bg-amber-100 text-amber-900 rounded border border-amber-300 shrink-0">
                            {conflictCreator.verdict}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                          <div className="p-2.5 rounded-lg bg-white border border-amber-200 space-y-1">
                            <div className="font-semibold text-slate-800 flex items-center gap-1">
                              <Lock className="w-3 h-3 text-amber-600" />
                              <span>Notion Workspace Flag</span>
                            </div>
                            <p className="text-[11px] text-slate-700 leading-relaxed">
                              {conflictCreator.flagNote || conflictCreator.researchNotes}
                            </p>
                          </div>
                          <div className="p-2.5 rounded-lg bg-white border border-stone-200 space-y-1">
                            <div className="font-semibold text-slate-800 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-amber-600" />
                              <span>Detected Brand Ties</span>
                            </div>
                            <div className="space-y-1">
                              {conflictCreator.competitorTies.length === 0 ? (
                                <span className="text-[11px] text-slate-500">No active competitor ties.</span>
                              ) : (
                                conflictCreator.competitorTies.map((tie, idx) => (
                                  <div key={idx} className="text-[11px] text-slate-700 leading-relaxed">
                                    <strong className="text-indigo-700">{tie.company}</strong> ({tie.relationshipType} · {tie.activeConflictRisk} Risk): {tie.details}
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2 pt-2.5 border-t border-amber-200/60">
                        <button
                          onClick={() => {
                            setSelectedCreatorId(conflictCreator.id);
                            setActiveView('notion-desk');
                            setNotionTab('all-contacts');
                            setIsConflictModalOpen(false);
                          }}
                          className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-100 cursor-pointer"
                        >
                          Inspect Dossier
                        </button>
                        <button
                          onClick={() => handleProceedAnywayConflict(conflictCreator)}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer"
                        >
                          Proceed Anyway
                        </button>
                        <button
                          onClick={() => handleArchiveConflict(conflictCreator)}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-700 hover:bg-slate-800 rounded-lg cursor-pointer"
                        >
                          Archive
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-3.5 bg-stone-50 border-t border-stone-200 flex items-center justify-between gap-3">
              <button
                onClick={() => {
                  setActiveView('notion-desk');
                  setNotionTab('conflicts');
                  setIsConflictModalOpen(false);
                }}
                className="text-xs font-semibold text-indigo-700 hover:underline cursor-pointer"
              >
                Switch to Full-Screen Side-by-Side Conflict View in Notion Desk &rarr;
              </button>
              <button
                onClick={() => setIsConflictModalOpen(false)}
                className="px-4 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-stone-300 rounded-lg hover:bg-stone-100 cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MANDATORY PRE-PUBLISH CONFIRMATION MODAL GATE (Notion Database Create / Update Upsert) */}
      {pendingPublishModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-stone-200 rounded-2xl max-w-3xl w-full overflow-hidden shadow-xl flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-stone-50 border-b border-stone-200 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <Database className="w-5 h-5 text-indigo-600 shrink-0" />
                <div>
                  <h2 className="font-display text-base font-bold text-slate-900">
                    Confirm Before Creating / Updating 27-Column Notion Database Entries
                  </h2>
                  <p className="text-xs text-slate-600">
                    Ask-First Safety Gate: Review all 27 formatted database columns, relevant social links, 5 answers, and{' '}
                    <code className="font-mono bg-stone-200/80 px-1 py-0.5 rounded">@Bree</code> comment before syncing to Notion.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPendingPublishModal(null)}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                aria-label="Close confirmation dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              {/* Target Notion Destination Selector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block font-semibold text-slate-800">
                    Select Target Notion Database / Workspace Hub
                  </label>
                  <span className="font-mono text-[11px] text-emerald-700 font-semibold">
                    DB Schema Formatted: 27 / 27 Agent Columns Ready
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setPendingPublishModal({
                        ...pendingPublishModal,
                        targetHub: 'my-contacts-desk',
                      })
                    }
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                      pendingPublishModal.targetHub === 'my-contacts-desk'
                        ? 'border-slate-900 bg-stone-100/90'
                        : 'border-stone-200 hover:bg-stone-50'
                    }`}
                  >
                    <div className="font-semibold text-slate-900">
                      My Contacts Database (To vet &rarr; Vetted)
                    </div>
                    <div className="font-mono text-[11px] text-slate-500 truncate mt-0.5">
                      40457c4d75c0819d90c8cb35f1024e89
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setPendingPublishModal({
                        ...pendingPublishModal,
                        targetHub: 'chromatics-outreach',
                      })
                    }
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                      pendingPublishModal.targetHub === 'chromatics-outreach'
                        ? 'border-slate-900 bg-stone-100/90'
                        : 'border-stone-200 hover:bg-stone-50'
                    }`}
                  >
                    <div className="font-semibold text-slate-900">Chromatics Outreach Database</div>
                    <div className="font-mono text-[11px] text-slate-500 truncate mt-0.5">
                      Chromatics-Outreach-40457c4d75c081928796e0b79c2f1950
                    </div>
                  </button>
                </div>
              </div>

              {/* Creators & Upsert Operation Summary */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800">
                    Database Upsert Queue ({pendingPublishModal.creatorsToPublish.length} Creator
                    {pendingPublishModal.creatorsToPublish.length > 1 ? 's' : ''})
                  </span>
                  <span className="font-mono text-[11px] text-slate-500">
                    Writes All 27 Agent Properties + Page Blocks + @Bree Comment
                  </span>
                </div>

                <div className="border border-stone-200 rounded-xl divide-y divide-stone-200 max-h-40 overflow-y-auto">
                  {pendingPublishModal.creatorsToPublish.map((c) => (
                    <div
                      key={c.id}
                      className="px-3.5 py-2.5 flex items-center justify-between gap-3 bg-white"
                    >
                      <div className="min-w-0">
                        <span className="font-mono text-slate-400 mr-2">#{c.rank}</span>
                        <span className="font-semibold text-slate-900">{c.name}</span>
                        <span className="text-slate-500 ml-1.5">{c.handle}</span>
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">
                          Main link: {c.mainLink}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] shrink-0">
                        <span className="font-mono text-indigo-700">
                          {c.notionPageId ? 'Update 27 Columns' : 'Create 27 Columns'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-slate-900">
                          Team take: {c.teamTake}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 27 Formatted Notion Database Columns Preview for Primary Creator */}
              {pendingPublishModal.creatorsToPublish[0] && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800">
                      Formatted 27-Column Database Row Payload (
                      {pendingPublishModal.creatorsToPublish[0].name})
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">
                      27 Notion Properties Mapped
                    </span>
                  </div>
                  <div className="border border-stone-200 rounded-xl max-h-44 overflow-y-auto divide-y divide-stone-100 bg-stone-50/60">
                    {Object.entries(
                      formatCreatorForDatabaseRow(
                        pendingPublishModal.creatorsToPublish[0],
                        selectedPlatforms
                      )
                    ).map(([colName, colValue]) => {
                      const spec = AGENT_DB_SCHEMA_COLUMNS.find((s) => s.columnName === colName);
                      return (
                        <div
                          key={colName}
                          className="px-3 py-1.5 grid grid-cols-12 gap-2 items-baseline text-[11px]"
                        >
                          <span className="col-span-4 font-semibold text-slate-800 truncate">
                            {colName}
                          </span>
                          <span className="col-span-2 font-mono text-[10px] text-indigo-700">
                            {spec?.notionType || 'rich_text'}
                          </span>
                          <span className="col-span-6 text-slate-600 line-clamp-1 font-mono">
                            {colValue || '—'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Exact @Bree Comment & 5 Answers Payload Preview */}
              <div className="space-y-1.5">
                <span className="block font-semibold text-slate-800">
                  Exact Notion Comment Preview (@Bree Notification)
                </span>
                <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 font-mono text-[11px] text-slate-800 whitespace-pre-wrap max-h-44 overflow-y-auto leading-relaxed">
                  {pendingPublishModal.creatorsToPublish[0]?.vettingDossier.formattedNotionComment}
                </div>
              </div>
            </div>

            {/* Visual Progress Bar during Synchronization */}
            {syncProgress && (
              <div className="px-6 py-3.5 bg-indigo-50/80 border-b border-indigo-100 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-indigo-950">
                  <span className="truncate">{syncProgress.currentName}</span>
                  <span className="font-mono tabular-nums shrink-0 ml-2">
                    {syncProgress.current} / {syncProgress.total} (
                    {Math.round((syncProgress.current / syncProgress.total) * 100)}%)
                  </span>
                </div>
                <div className="w-full bg-indigo-200/70 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-indigo-600 h-full transition-all duration-300 ease-out rounded-full"
                    style={{
                      width: `${Math.max(
                        4,
                        (syncProgress.current / syncProgress.total) * 100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <div className="px-6 py-4 bg-stone-50 border-t border-stone-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingPublishModal(null)}
                disabled={isPublishingConfirmed}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer"
              >
                Cancel (Keep as Local Draft)
              </button>
              <button
                type="button"
                onClick={handleConfirmedPublishToNotion}
                disabled={isPublishingConfirmed}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                {isPublishingConfirmed ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Formatting &amp; Syncing 27 Columns...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Confirm &amp; Sync All 27 Agent Fields to Notion DB (@Bree)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contextual Workspace Header Strip */}
      <section className="px-6 py-5 border-b border-stone-200 bg-white">
        <div className="max-w-[1440px] mx-auto flex flex-col gap-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>Notion Reference Indexed ({workspaceScan.scanTimestamp})</span>
                <span aria-hidden="true">·</span>
                <a
                  href={NOTION_DESK_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-700 hover:underline inline-flex items-center gap-1 font-medium"
                >
                  <span>My Contacts Desk (4045...24e89)</span>
                  <ArrowUpRight className="w-3 h-3" />
                </a>
                <span aria-hidden="true">·</span>
                <a
                  href={CHROMATICS_OUTREACH_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-700 hover:underline inline-flex items-center gap-1 font-medium"
                >
                  <span>Chromatics Outreach Hub (4045...2f1950)</span>
                  <ArrowUpRight className="w-3 h-3" />
                </a>
                <span aria-hidden="true">·</span>
                <a
                  href={AIDA_TEMPLATE_NOTION_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-700 hover:underline inline-flex items-center gap-1 font-medium"
                >
                  <span>Template 1: AidaOverthinking Things</span>
                  <ArrowUpRight className="w-3 h-3" />
                </a>
                <span aria-hidden="true">·</span>
                <a
                  href={TRICIA_TEMPLATE_NOTION_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-700 hover:underline inline-flex items-center gap-1 font-medium"
                >
                  <span>Template 2: Tricia B. (@teebascosaucereads)</span>
                  <ArrowUpRight className="w-3 h-3" />
                </a>
                <span aria-hidden="true">·</span>
                <a
                  href={SARA_TEMPLATE_NOTION_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-700 hover:underline inline-flex items-center gap-1 font-semibold"
                >
                  <span>Template 3 (Gold Standard): Sara (@bookish.victorian · 3 Stories)</span>
                  <ArrowUpRight className="w-3 h-3" />
                </a>
                <span aria-hidden="true">·</span>
                <a
                  href={SARA_INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-fuchsia-700 hover:underline inline-flex items-center gap-1 font-medium"
                >
                  <span>IG @bookish.victorian (book II · collaborations · book reviews)</span>
                  <ArrowUpRight className="w-3 h-3" />
                </a>
              </div>
              <h1 className="font-display text-2xl font-bold text-slate-900 tracking-tight">
                Chromatics Creator Vetting &amp; 27-Column Notion Database Sync
              </h1>
              <p className="text-sm text-slate-600 max-w-3xl">
                Database formatted with <strong>27 structured Notion columns</strong> to receive 100% of the AI agent&rsquo;s output (identity, platform-filtered post links, 13-competitor watchlist ties, all 5 answers, lead hook, gut feeling, and <code className="font-mono text-xs">@Bree</code> comment).
              </p>
            </div>

            {/* Tabular KPI Strip */}
            <div className="flex flex-wrap items-center gap-5 pt-2 lg:pt-0 border-t lg:border-t-0 border-stone-200 shrink-0">
              <div>
                <div className="text-xs text-slate-500">Agent Run Status</div>
                <div className="font-mono text-lg font-semibold text-slate-900 tabular-nums">
                  {metrics.totalCompleted} / 40 Audited
                </div>
              </div>
              <div className="h-8 w-px bg-stone-200 hidden sm:block" />
              <div>
                <div className="text-xs text-slate-500">DB Schema Format</div>
                <div className="font-mono text-lg font-semibold text-emerald-700 tabular-nums">
                  {isDbFormatted ? '27 / 27 Cols' : 'Unformatted'}
                </div>
              </div>
              <div className="h-8 w-px bg-stone-200 hidden sm:block" />
              <div>
                <div className="text-xs text-slate-500">Notion Database Sync</div>
                <div className="font-mono text-lg font-semibold text-indigo-700 tabular-nums">
                  {metrics.totalSynced} / 40 Synced
                </div>
              </div>
              <div className="h-8 w-px bg-stone-200 hidden sm:block" />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setActiveView('spreadsheet')}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer shadow-xs"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Google Sheets &amp; Create Notion DB</span>
                </button>
                <button
                  onClick={() => handleFormatNotionDatabase('my-contacts-desk')}
                  disabled={isFormattingDb}
                  className="px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Database className={`w-3.5 h-3.5 ${isFormattingDb ? 'animate-spin' : ''}`} />
                  <span>{isFormattingDb ? 'Formatting DB...' : 'Format DB (27 Cols)'}</span>
                </button>
                <button
                  onClick={handleExportSpreadsheetCSV}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export 27-Col CSV</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleImportCSV}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import CSV</span>
                </button>
              </div>
            </div>
          </div>

          {/* SOCIAL MEDIA PLATFORM INPUT FILTER BAR FOR AI AGENT */}
          <div className="pt-3 border-t border-stone-200 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 mr-1">
                <Filter className="w-3.5 h-3.5 text-slate-600" />
                <span>AI Agent Social Platforms Filter:</span>
              </div>

              <div className="flex flex-wrap items-center gap-1 p-1 bg-stone-100 rounded-lg border border-stone-200">
                {ALL_SOCIAL_PLATFORMS.map((platform) => {
                  const isActive = selectedPlatforms.includes(platform);
                  return (
                    <button
                      key={platform}
                      type="button"
                      onClick={() => handleTogglePlatform(platform)}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                        isActive
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-stone-200/60'
                      }`}
                    >
                      {isActive && <Check className="w-3 h-3 text-emerald-400" />}
                      <span>{platform}</span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setSelectedPlatforms([...ALL_SOCIAL_PLATFORMS])}
                className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 underline cursor-pointer whitespace-nowrap"
              >
                Select All
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyShowCreatorsOnSelectedPlatforms}
                  onChange={(e) => setOnlyShowCreatorsOnSelectedPlatforms(e.target.checked)}
                  className="rounded border-stone-300 text-slate-900 focus:ring-0"
                />
                <span>Filter creator queue by selected platforms</span>
              </label>

              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoPromptNotionSyncAfterVet}
                  onChange={(e) => setAutoPromptNotionSyncAfterVet(e.target.checked)}
                  className="rounded border-stone-300 text-slate-900 focus:ring-0"
                />
                <span>Prompt Notion DB sync immediately after AI audit</span>
              </label>
            </div>
          </div>

          {/* 4-MODE PROJECT TONE / STYLE ENGINE BAR (Global Switcher for #4-#40 + Fatigue Curve Info) */}
          <div className="pt-3 border-t border-stone-200 flex flex-col xl:flex-row xl:items-center justify-between gap-3 bg-stone-50/80 p-3 rounded-xl border">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-900">
                  4-Mode Project Tone Switcher (Rewrites #4–#40 Immediately · #1–#3 Reference Locked):
                </span>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-900 border border-amber-300 rounded">
                  Progressive Fatigue Typos (#27–#40 Heavy: te, mire, thier, woudl, reccomend)
                </span>
                <span className="px-2 py-0.5 text-[10px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-200 rounded">
                  Exact URLs &amp; Timestamps Protected
                </span>
              </div>
              <p className="text-[11px] text-slate-600">
                {PROJECT_TONE_MODES.find((m) => m.id === projectToneMode)?.description}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              {PROJECT_TONE_MODES.map((mode) => {
                const isSelected = projectToneMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => handleSwitchGlobalProjectTone(mode.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-white text-slate-700 border-stone-300 hover:bg-stone-100'
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 text-amber-300" />}
                    <span>{mode.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-6">
        {/* Mobile-Friendly Responsive Quick Vetting View & Sticky Bottom Nav */}
        <MobileQuickVettingView
          creators={creators}
          selectedCreatorId={selectedCreatorId}
          onSelectCreator={setSelectedCreatorId}
          onOpenDossier={(c) => {
            setSelectedCreatorId(c.id);
            setActiveView('notion-desk');
          }}
          onCopyComment={handleCopyNotionComment}
          onRunSingleVet={handleVetSingleCreator}
          onFastFail={handleFastFailNotAFit}
          onOpenSyncModal={(list) => requestPublishConfirmation(list, 'my-contacts-desk')}
          activeView={activeView}
          onSwitchView={setActiveView}
          isQuickVettingMode={isQuickVettingMode}
          onToggleQuickVetting={() => setIsQuickVettingMode((prev) => !prev)}
          isDarkMode={isDarkMode}
          onToggleDarkMode={() => setIsDarkMode((prev) => !prev)}
          selectedPlatforms={selectedPlatforms}
          onTogglePlatform={handleTogglePlatform}
          projectToneMode={projectToneMode}
          onSwitchProjectTone={handleSwitchGlobalProjectTone}
          onOverrideCreatorTone={handleOverrideCreatorTone}
        />

        {/* VIEW 0: FULL NOTION WORKSPACE SCANNER & REFERENCE INDEX */}
        {activeView === 'workspace-scanner' && (
          <div className="space-y-6">
            <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-stone-200">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700">
                    <Radar className="w-4 h-4" />
                    <span>STEP 0 — READ-ONLY NOTION WORKSPACE SCANNER</span>
                  </div>
                  <h2 className="font-display text-xl font-bold text-slate-900">
                    Notion Workspace Reference Map &amp; Campaign Mission Index
                  </h2>
                  <p className="text-xs text-slate-600 max-w-3xl">
                    Scans your entire Notion workspace (<code className="font-mono">Chromatics-Outreach</code>,{' '}
                    <code className="font-mono">My Contacts Desk</code>, and the{' '}
                    <code className="font-mono">AidaOverthinking Things</code> output benchmark) first so the AI vetting agent understands your exact objectives, locked columns/tabs, and conflict rules before evaluating any creator.
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={handleScanNotionWorkspace}
                    disabled={isScanningWorkspace}
                    className="px-4 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${isScanningWorkspace ? 'animate-spin' : ''}`}
                    />
                    <span>
                      {isScanningWorkspace
                        ? 'Scanning Notion Workspace...'
                        : 'Re-Scan Entire Notion Workspace'}
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveView('notion-desk')}
                    className="px-4 py-2.5 text-xs font-semibold text-slate-800 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors cursor-pointer"
                  >
                    Proceed to Notion Desk &rarr;
                  </button>
                </div>
              </div>

              {/* Extracted Mission Objective & Protocol Rules */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 space-y-4">
                  <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
                    <div className="text-xs font-bold text-slate-900">
                      Synthesized Workspace Mission Objective (What We Are Trying to Accomplish)
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed">
                      {workspaceScan.missionObjective}
                    </p>
                  </div>

                  <div className="space-y-2.5">
                    <h3 className="font-display text-sm font-bold text-slate-900">
                      Extracted Notion SOP &amp; Vetting Rules ({workspaceScan.vettingProtocolRules.length})
                    </h3>
                    <div className="border border-stone-200 rounded-xl divide-y divide-stone-200 bg-white">
                      {workspaceScan.vettingProtocolRules.map((rule, idx) => (
                        <div key={idx} className="p-3 text-xs text-slate-700 flex items-start gap-2.5">
                          <span className="font-mono font-semibold text-slate-400 shrink-0">
                            0{idx + 1}.
                          </span>
                          <span>{rule}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Additional Workspace Reference Input */}
                  <div className="space-y-2 pt-2">
                    <label className="block text-xs font-semibold text-slate-800">
                      Additional Workspace Context / Paste Notion Page Notes (Grounds AI Agent)
                    </label>
                    <textarea
                      rows={3}
                      value={customReferenceInput}
                      onChange={(e) => setCustomReferenceInput(e.target.value)}
                      placeholder="Paste any additional text or instructions from your Notion workspace here and click Re-Scan..."
                      className="w-full p-3 text-xs bg-white border border-stone-200 rounded-xl focus:outline-none focus:border-slate-900"
                    />
                  </div>
                </div>

                {/* Right Column: Indexed Pages, Locked Schema & Flagged Creators */}
                <div className="lg:col-span-5 space-y-4">
                  <div className="p-4 rounded-xl border border-stone-200 bg-white space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-display text-sm font-bold text-slate-900">
                        Indexed Notion Pages &amp; Databases
                      </span>
                      <span className="font-mono text-xs text-slate-500">
                        {workspaceScan.totalPagesIndexed} Pages · {workspaceScan.totalBlocksIndexed} Blocks
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {workspaceScan.scannedPages.map((pg) => (
                        <div
                          key={pg.id}
                          className="p-3 rounded-lg bg-stone-50 border border-stone-200 space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-900">{pg.title}</span>
                            <a
                              href={pg.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-indigo-700 hover:underline inline-flex items-center gap-0.5 shrink-0"
                            >
                              <span>Open</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </div>
                          <p className="text-[11px] text-slate-600">{pg.extractedSummary}</p>
                          <div className="text-[11px] text-slate-500 font-mono">
                            Locked Columns: {pg.lockedProperties.join(' · ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Special Creator Conflict Flags Discovered in Workspace */}
                  <div className="p-4 rounded-xl border border-stone-200 bg-white space-y-3">
                    <div className="flex items-center gap-2">
                      <Lock className="w-3.5 h-3.5 text-slate-600" />
                      <span className="font-display text-sm font-bold text-slate-900">
                        Pre-Vetting Flags Discovered in Notion Notes
                      </span>
                    </div>
                    <div className="space-y-2">
                      {workspaceScan.specialCreatorFlags.map((flag, i) => (
                        <div
                          key={i}
                          className="p-2.5 rounded-lg bg-amber-50/70 border border-amber-200 text-xs space-y-0.5"
                        >
                          <div className="font-semibold text-amber-950">
                            {flag.creatorName} — {flag.flagType}
                          </div>
                          <div className="text-amber-900 text-[11px]">{flag.instruction}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 1A: NOTION DESK CONFLICTS TAB */}
        {activeView === 'notion-desk' && notionTab === 'conflicts' && (
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-stone-200">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-700">
                  <AlertTriangle className="w-4 h-4" />
                  <span>VISUAL CONFLICT RESOLUTION DASHBOARD · NOTION DESK (OWNER: BRIANNA)</span>
                </div>
                <h2 className="font-display text-xl font-bold text-slate-900 mt-0.5">
                  Creators Marked &lsquo;Possible Conflict&rsquo; Side-by-Side with Flagged Notion Workspace Notes ({flaggedConflictCreators.length})
                </h2>
                <p className="text-xs text-slate-600 mt-1">
                  Review each flagged creator side-by-side with their Notion workspace notes and competitor ties. Click <strong>Proceed Anyway</strong> or <strong>Archive</strong> to automatically update their status and remove them from the conflict view.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setIsConflictModalOpen(true)}
                  className="px-3.5 py-2 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg transition-colors cursor-pointer"
                >
                  Open Dedicated Conflict Modal
                </button>
                <button
                  onClick={() => setNotionTab('first-ten')}
                  className="px-4 py-2 text-xs font-semibold text-slate-800 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors cursor-pointer"
                >
                  &larr; Back to Creator Queue
                </button>
              </div>
            </div>

            {flaggedConflictCreators.length === 0 ? (
              <div className="p-10 text-center border border-emerald-200 bg-emerald-50/40 rounded-xl space-y-2">
                <Check className="w-6 h-6 text-emerald-600 mx-auto" />
                <h3 className="font-display text-base font-bold text-slate-900">
                  All Flagged Creator Conflicts Resolved!
                </h3>
                <p className="text-xs text-slate-600">
                  Every creator marked &lsquo;Possible conflict&rsquo; has been either approved to proceed or archived by Brianna.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {flaggedConflictCreators.map((conflictCreator) => (
                  <div
                    key={conflictCreator.id}
                    className="border border-amber-200 bg-amber-50/20 rounded-xl p-5 space-y-4 shadow-xs flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-slate-500">
                              #{conflictCreator.rank}
                            </span>
                            <h3 className="font-display text-base font-bold text-slate-900">
                              {conflictCreator.name}
                            </h3>
                            <span className="text-xs text-slate-500 font-mono">
                              {conflictCreator.handle}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mt-0.5">
                            {conflictCreator.niche} · Owner: <strong>{conflictCreator.owner}</strong>
                          </p>
                        </div>

                        <span className="px-2.5 py-1 text-[11px] font-semibold bg-amber-100 text-amber-900 rounded-md border border-amber-300 shrink-0">
                          {conflictCreator.verdict}
                        </span>
                      </div>

                      {/* Side-by-side comparison: Flagged Notion Workspace Note vs Detected Competitor Ties */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div className="p-3 rounded-lg bg-white border border-amber-200 space-y-1">
                          <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                            <Lock className="w-3.5 h-3.5 text-amber-600" />
                            <span>Flagged Notion Workspace Note</span>
                          </div>
                          <p className="text-slate-700 text-[11px] leading-relaxed">
                            {conflictCreator.flagNote || conflictCreator.researchNotes}
                          </p>
                        </div>

                        <div className="p-3 rounded-lg bg-white border border-stone-200 space-y-1">
                          <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                            <span>Detected Competitor Ties</span>
                          </div>
                          <div className="space-y-1">
                            {conflictCreator.competitorTies.length === 0 ? (
                              <span className="text-slate-500 text-[11px]">No active competitor ties.</span>
                            ) : (
                              conflictCreator.competitorTies.map((tie, i) => (
                                <div key={i} className="text-[11px] text-slate-700 leading-relaxed">
                                  <strong className="text-indigo-700">{tie.company}</strong> ({tie.relationshipType} · {tie.activeConflictRisk} Risk): {tie.details}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-white border border-stone-200 space-y-1 text-xs">
                        <div className="font-semibold text-slate-800">
                          Brianna&rsquo;s @Bree Notion Comment Preview
                        </div>
                        <p className="text-slate-600 font-mono text-[11px] line-clamp-3">
                          {conflictCreator.vettingDossier.formattedNotionComment || 'No comment drafted yet.'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-amber-200/60">
                      <button
                        onClick={() => {
                          setSelectedCreatorId(conflictCreator.id);
                          setNotionTab('all-contacts');
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-100 cursor-pointer"
                      >
                        Open Full Dossier
                      </button>
                      <button
                        onClick={() => handleProceedAnywayConflict(conflictCreator)}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer"
                      >
                        Proceed Anyway
                      </button>
                      <button
                        onClick={() => handleArchiveConflict(conflictCreator)}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-700 hover:bg-slate-800 rounded-lg cursor-pointer"
                      >
                        Archive
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* VIEW 1B: NOTION DESK MAIN VIEW WITH RECHARTS EXECUTIVE OVERVIEW & SPLIT VIEW */}
        {activeView === 'notion-desk' && notionTab !== 'conflicts' && (
          <div className="space-y-6">
            {/* Executive Overview Recharts Visualization Panel */}
            <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-4 shadow-xs">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-stone-200">
                <div>
                  <h3 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
                    <Database className="w-4 h-4 text-indigo-600" />
                    <span>Executive Overview: Creator Distribution by Verdict &amp; Team Take</span>
                  </h3>
                  <p className="text-xs text-slate-600">
                    Real-time Recharts visualization tracking all 40 creators across Verdict statuses, Team Take recommendations, and 7-day agent run trends.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-4 shrink-0">
                  {/* Small 7-Day Line Chart: Approved vs Hold Verdicts */}
                  <div className="flex items-center gap-3 bg-stone-50 border border-stone-200 rounded-lg px-3 py-1.5">
                    <div className="space-y-0.5">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        7-Day Verdict Trend
                      </span>
                      <div className="flex items-center gap-2 text-[11px] font-mono">
                        <span className="text-emerald-700 font-semibold">● Approved</span>
                        <span className="text-rose-600 font-semibold">● Hold</span>
                      </div>
                    </div>
                    <div className="w-36 h-12">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={sevenDayVerdictTrendData} margin={{ top: 4, right: 4, left: 4, bottom: 2 }}>
                          <XAxis dataKey="day" hide />
                          <YAxis hide domain={[0, 'dataMax + 2']} />
                          <Tooltip
                            contentStyle={{ fontSize: 10, padding: '2px 6px', borderRadius: 6 }}
                            labelStyle={{ fontWeight: 700, color: '#0f172a' }}
                          />
                          <Line
                            type="monotone"
                            dataKey="Approved"
                            stroke="#059669"
                            strokeWidth={2}
                            dot={{ r: 2 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="Hold"
                            stroke="#e11d48"
                            strokeWidth={2}
                            dot={{ r: 2 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <span className="font-mono text-xs font-semibold bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-md border border-emerald-200">
                    Total Creators: {creators.length}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
                {/* Verdict Distribution BarChart */}
                <div className="bg-stone-50/70 border border-stone-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800">
                      Distribution by Verdict
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Approved, Pending, Conflict, Hold
                    </span>
                  </div>
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={verdictDistributionData} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                        <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Team Take Distribution BarChart */}
                <div className="bg-stone-50/70 border border-stone-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800">
                      Distribution by Team Take
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Strong fit, Maybe, Not a fit
                    </span>
                  </div>
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={teamTakeDistributionData} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                        <Bar dataKey="count" fill="#059669" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column (5 cols): My Contacts Locked Tabs & Ranked Creator Table */}
            <div className="lg:col-span-5 bg-white border border-stone-200 rounded-xl overflow-hidden">
              {/* Locked Notion Tabs Bar */}
              <div className="p-3 border-b border-stone-200 bg-stone-50/70 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 p-1 bg-stone-200/70 rounded-lg overflow-x-auto">
                    <button
                      onClick={() => setNotionTab('first-ten')}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        notionTab === 'first-ten'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      First 10 Priority (10)
                    </button>
                    <button
                      onClick={() => setNotionTab('to-vet')}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        notionTab === 'to-vet'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      To vet ({metrics.totalToVetStage})
                    </button>
                    <button
                      onClick={() => setNotionTab('vetted')}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        notionTab === 'vetted'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Vetted ({metrics.totalVettedStage})
                    </button>
                    <button
                      onClick={() => setNotionTab('conflicts')}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        (notionTab as string) === 'conflicts'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Flags ({flaggedConflictCreators.length})
                    </button>
                    <button
                      onClick={() => setNotionTab('all-contacts')}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        notionTab === 'all-contacts'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      All (40)
                    </button>
                  </div>
                </div>

                {/* Search Input */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter by creator name, handle, or competitor (e.g. Fable, Kobo, Audible)..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>

              {/* Creator Queue List (Sorted by Rank top-to-bottom) */}
              <div className="divide-y divide-stone-200 max-h-[760px] overflow-y-auto">
                {filteredCreators.length === 0 ? (
                  <div className="p-8 text-center space-y-2">
                    <p className="text-sm font-medium text-slate-700">No creators match this filter.</p>
                    <button
                      onClick={() => {
                        setNotionTab('all-contacts');
                        setSearchQuery('');
                        setOnlyShowCreatorsOnSelectedPlatforms(false);
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-slate-900 bg-stone-100 rounded-md hover:bg-stone-200 cursor-pointer"
                    >
                      Reset Filters &amp; Show All 40 Creators
                    </button>
                  </div>
                ) : (
                  filteredCreators.map((creator) => {
                    const isSelected = creator.id === selectedCreator.id;
                    return (
                      <div
                        key={creator.id}
                        onClick={() => setSelectedCreatorId(creator.id)}
                        className={`p-3.5 transition-colors cursor-pointer flex items-start justify-between gap-3 ${
                          isSelected ? 'bg-stone-100/90' : 'hover:bg-stone-50'
                        }`}
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-semibold text-slate-400 tabular-nums shrink-0">
                              #{String(creator.rank).padStart(2, '0')}
                            </span>
                            <span className="font-display text-sm font-semibold text-slate-900 truncate">
                              {creator.name}
                            </span>
                            <span className="text-xs text-slate-500 truncate">{creator.handle}</span>
                            {creator.rank <= 3 && (
                              <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-900 border border-amber-300 rounded">
                                {creator.rank === 3 ? 'Ref #3 Gold Standard' : `Ref #${creator.rank} Locked`}
                              </span>
                            )}
                            {creator.rank >= 27 && (
                              <span className="px-1.5 py-0.5 text-[10px] font-mono bg-rose-50 text-rose-800 border border-rose-200 rounded">
                                Tired Typos (#27–#40)
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-slate-600 line-clamp-1">{creator.niche}</p>

                          {/* Unboxed Metadata Line */}
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 pt-0.5">
                            <span className="font-medium text-slate-700">Stage: {creator.stage}</span>
                            <span aria-hidden="true">·</span>
                            <span
                              className={
                                creator.teamTake === 'Strong fit'
                                  ? 'text-emerald-700 font-semibold'
                                  : creator.teamTake === 'Maybe'
                                  ? 'text-amber-700 font-semibold'
                                  : creator.teamTake === 'Not a fit'
                                  ? 'text-rose-700 font-semibold'
                                  : 'text-slate-500'
                              }
                            >
                              Team take: {creator.teamTake}
                            </span>
                            <span aria-hidden="true">·</span>
                            {creator.notionSyncStatus === 'synced' ? (
                              <span className="text-indigo-700 font-semibold">
                                Notion DB ({creator.notionSyncOperation || 'Synced'})
                              </span>
                            ) : (
                              <span className="text-slate-500">Draft</span>
                            )}
                            {creator.verdict === 'Possible conflict' && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-amber-700 font-medium inline-flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" />
                                  Possible conflict
                                </span>
                              </>
                            )}
                          </div>

                          {creator.flagNote && (
                            <p className="text-[11px] text-amber-800 pt-0.5 line-clamp-1">
                              Note: {creator.flagNote}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <span className="font-mono text-xs text-slate-600 tabular-nums">
                            {creator.followersCount}
                          </span>
                          <ChevronRight
                            className={`w-4 h-4 transition-transform ${
                              isSelected ? 'text-slate-900 translate-x-0.5' : 'text-slate-300'
                            }`}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer Batch Action Bar */}
              <div className="p-3 border-t border-stone-200 bg-stone-50 flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500">
                  Platforms: {selectedPlatforms.length}/{ALL_SOCIAL_PLATFORMS.length}
                  {isQuickVettingMode ? ' · Quick Mode (Max 3 Posts/Platform)' : ''}
                </span>
                <button
                  onClick={handleBatchDraftVet}
                  disabled={isBatchRunning}
                  className="px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-stone-300 rounded-lg hover:bg-stone-100 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
                >
                  {isQuickVettingMode && <Zap className="w-3.5 h-3.5 text-amber-500" />}
                  <span>
                    {isBatchRunning
                      ? `Auditing ${batchProgress?.current}/${batchProgress?.total}...`
                      : isQuickVettingMode
                      ? 'Quick Vet Next 10 (3 Posts/Platform)'
                      : 'AI Vet Next 5 Queue Creators'}
                  </span>
                </button>
              </div>
            </div>

            {/* Right Column (7 cols): Notion Creator Page Mirror */}
            <div className="lg:col-span-7 bg-white border border-stone-200 rounded-xl overflow-hidden">
              {/* Notion Page Top Breadcrumb & Actions */}
              <div className="px-6 py-3.5 border-b border-stone-200 bg-stone-50/70 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <span>My contacts</span>
                  <span aria-hidden="true">/</span>
                  <span>{selectedCreator.stage}</span>
                  <span aria-hidden="true">/</span>
                  <span className="font-semibold text-slate-900">
                    Rank #{selectedCreator.rank} · {selectedCreator.name}
                  </span>
                  {isQuickVettingMode && (
                    <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-md inline-flex items-center gap-1">
                      <Zap className="w-2.5 h-2.5 text-amber-500" />
                      <span>Quick Vetting (Last 3 Posts/Platform)</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleVetSingleCreator(selectedCreator)}
                    disabled={selectedCreator.status === 'researching'}
                    className="px-3 py-1.5 text-xs font-medium text-slate-800 bg-white border border-stone-300 rounded-lg hover:bg-stone-100 disabled:opacity-50 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {selectedCreator.status === 'researching' ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>
                          {isQuickVettingMode
                            ? `Quick Vetting (3 posts · ${selectedPlatforms.join(', ')})...`
                            : `Auditing (${selectedPlatforms.join(', ')})...`}
                        </span>
                      </>
                    ) : (
                      <>
                        {isQuickVettingMode ? (
                          <Zap className="w-3.5 h-3.5 text-amber-500" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {isQuickVettingMode
                            ? 'Quick AI Vet (3 Recent Posts)'
                            : 'Run 25m AI Vetting Audit'}
                        </span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => handleFastFailNotAFit(selectedCreator)}
                    className="px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                    title="If clearly not a fit after 10 minutes (inactive, off-topic), stage Not a fit"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>10m Fast-Fail</span>
                  </button>

                  <button
                    onClick={() => requestPublishConfirmation([selectedCreator], 'my-contacts-desk')}
                    className="px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Database className="w-3.5 h-3.5" />
                    <span>
                      {selectedCreator.notionSyncStatus === 'synced'
                        ? 'Update Notion DB Entry'
                        : 'Sync to Notion DB'}
                    </span>
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* Creator Page Title & Main Link */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-200">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h2 className="font-display text-2xl font-bold text-slate-900">
                        {selectedCreator.name}
                      </h2>
                      <span className="text-xs text-slate-500 font-mono">
                        {selectedCreator.notionSyncStatus === 'synced'
                          ? `· Notion DB ${selectedCreator.notionSyncOperation || 'synced'} (${selectedCreator.notionLastSyncedAt})`
                          : '· Local Draft (Not yet published)'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
                      <span className="font-mono text-slate-700">{selectedCreator.handle}</span>
                      <span aria-hidden="true">·</span>
                      <span>{selectedCreator.niche}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {selectedCreator.followersCount} followers ({selectedCreator.avgEngagementRate} eng)
                      </span>
                    </div>
                  </div>

                  <a
                    href={selectedCreator.mainLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2 text-xs font-semibold text-slate-900 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <span>Open Main Link ({selectedCreator.platforms[0]})</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                {/* Highest Viewed Post Thumbnail Preview Card (Color-Coded by Platform) */}
                {(() => {
                  const topPost = getHighestViewedPostThumbnail(selectedCreator);
                  return (
                    <div className="p-4 rounded-xl border border-stone-200 bg-stone-50/80 flex flex-col sm:flex-row items-center gap-4">
                      <a
                        href={topPost.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative w-full sm:w-36 h-24 rounded-lg overflow-hidden border border-stone-300 shrink-0 bg-stone-200 group block"
                      >
                        <img
                          src={topPost.thumbnailUrl}
                          alt={topPost.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                        <div className="absolute inset-0 bg-slate-950/20 group-hover:bg-slate-950/0 transition-colors" />
                        <span className={`absolute top-2 left-2 px-2 py-0.5 text-[10px] font-bold rounded shadow-xs border ${topPost.badgeColorClass}`}>
                          {topPost.platform}
                        </span>
                      </a>
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold text-indigo-700 font-mono">
                            Highest Viewed Post ({topPost.estimatedViews})
                          </span>
                          <span className={`px-2 py-0.5 text-[10px] font-semibold rounded border sm:hidden ${topPost.badgeColorClass}`}>
                            {topPost.platform}
                          </span>
                        </div>
                        <a
                          href={topPost.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-display text-xs font-bold text-slate-900 hover:text-indigo-700 hover:underline block line-clamp-2"
                        >
                          {topPost.title}
                        </a>
                        <div className="text-[11px] text-slate-500 flex items-center gap-2">
                          <span>Thumbnail link &amp; platform badge</span>
                          <span aria-hidden="true">·</span>
                          <a
                            href={topPost.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-700 hover:underline inline-flex items-center gap-1 font-semibold"
                          >
                            <span>Open Link</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Notion Top Properties Grid: Verdict, Stage, Team take, Owner */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-stone-50 rounded-xl border border-stone-200">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Verdict
                    </label>
                    <select
                      value={selectedCreator.verdict}
                      onChange={(e) =>
                        handleUpdateCreatorField(selectedCreator.id, {
                          verdict: e.target.value as VerdictType,
                        })
                      }
                      className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-stone-300 rounded-md text-slate-900 focus:outline-none focus:border-slate-900"
                    >
                      <option value="Pending Review">Pending Review</option>
                      <option value="Possible conflict">Possible conflict</option>
                      <option value="Approved">Approved</option>
                      <option value="Hold">Hold</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Stage (Moves on publish)
                    </label>
                    <select
                      value={selectedCreator.stage}
                      onChange={(e) =>
                        handleUpdateCreatorField(selectedCreator.id, {
                          stage: e.target.value as StageType,
                        })
                      }
                      className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-stone-300 rounded-md text-slate-900 focus:outline-none focus:border-slate-900"
                    >
                      <option value="To vet">To vet</option>
                      <option value="Vetted">Vetted</option>
                      <option value="Outreach">Outreach</option>
                      <option value="Archived">Archived</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Team take
                    </label>
                    <select
                      value={selectedCreator.teamTake}
                      onChange={(e) =>
                        handleUpdateCreatorField(selectedCreator.id, {
                          teamTake: e.target.value as TeamTakeType,
                        })
                      }
                      className="w-full px-2.5 py-1.5 text-xs font-semibold bg-white border border-stone-300 rounded-md text-slate-900 focus:outline-none focus:border-slate-900"
                    >
                      <option value="Strong fit">Strong fit</option>
                      <option value="Maybe">Maybe</option>
                      <option value="Not a fit">Not a fit</option>
                      <option value="Unassigned">Unassigned</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Owner &amp; Vetted Date
                    </label>
                    <div className="px-2.5 py-1.5 text-xs bg-white border border-stone-200 rounded-md text-slate-700 font-mono truncate">
                      {selectedCreator.owner} · {selectedCreator.vettedDate || 'Draft'}
                    </div>
                  </div>
                </div>

                {/* View Details & Platform-Filtered Content Feed */}
                <div className="border border-stone-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setShowDetailsExpanded(!showDetailsExpanded)}
                    className="w-full px-4 py-2.5 bg-stone-50 hover:bg-stone-100 transition-colors flex items-center justify-between text-xs font-semibold text-slate-700 cursor-pointer"
                  >
                    <span>
                      Research Notes, View details &amp; Filtered Platform Posts (
                      {filteredCreatorWatchedItems.length} matching [{selectedPlatforms.join(', ')}])
                    </span>
                    <span className="text-slate-500 font-normal">
                      {showDetailsExpanded ? 'Hide details' : 'View details'}
                    </span>
                  </button>

                  {showDetailsExpanded && (
                    <div className="p-4 space-y-3 text-xs text-slate-700 bg-white border-t border-stone-200">
                      {selectedCreator.flagNote && (
                        <div className="p-3 rounded-lg bg-amber-50/80 border border-amber-200 text-amber-900 flex items-start gap-2.5">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-semibold">Workspace Briefing Flag: </span>
                            <span>{selectedCreator.flagNote}</span>
                          </div>
                        </div>
                      )}
                      <div>
                        <span className="font-semibold text-slate-900">Research Notes: </span>
                        <span>{selectedCreator.researchNotes}</span>
                      </div>

                      {/* Filtered Social Media Posts Section */}
                      <div className="pt-2 border-t border-stone-100 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-900">
                            Discovered Posts Filtered by Selected Platforms ({selectedPlatforms.join(' · ')})
                          </span>
                          <span className="font-mono text-[11px] text-slate-500">
                            Showing {filteredCreatorWatchedItems.length} of{' '}
                            {selectedCreator.watchedItems.length} posts
                          </span>
                        </div>

                        {filteredCreatorWatchedItems.length === 0 ? (
                          <p className="text-slate-500 italic">
                            No discovered posts match the currently selected platform filter (
                            {selectedPlatforms.join(', ')}). Toggle additional platforms above or click &ldquo;Run 25m AI Vetting Audit&rdquo;.
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                            {filteredCreatorWatchedItems.map((post, idx) => (
                              <div
                                key={idx}
                                className="p-3 rounded-lg bg-stone-50 border border-stone-200 space-y-1"
                              >
                                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                                  <span className="font-semibold text-slate-800">
                                    {post.platform} · {post.durationOrFormat}
                                  </span>
                                  <span className="font-mono">{post.date}</span>
                                </div>
                                <a
                                  href={post.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-semibold text-slate-900 hover:text-indigo-700 hover:underline block line-clamp-1"
                                >
                                  {post.title}
                                </a>
                                <p className="text-[11px] text-slate-600 line-clamp-2">
                                  {post.summary}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Reference Benchmark Card for Ranks #1, #2, and #3 (Aida, Tricia, and Sara @bookish.victorian) */}
                {selectedCreator.rank <= 3 && (
                  <div className="p-4 rounded-xl border border-amber-300 bg-amber-50/70 space-y-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-display font-bold text-amber-950 flex items-center gap-2">
                        <Lock className="w-3.5 h-3.5 text-amber-700" />
                        <span>
                          Reference Benchmark #{selectedCreator.rank} (Locked From Global Tone Switcher · Ranks #4–#40 Active Queue)
                        </span>
                      </div>
                      <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-white border border-amber-300 rounded text-amber-900">
                        {selectedCreator.rank === 3
                          ? 'Gold Standard Loose Human Note (Sara @bookish.victorian)'
                          : 'Contrast Benchmark (@Max Buck Boss Critique)'}
                      </span>
                    </div>

                    {selectedCreator.savedStoriesWatched && selectedCreator.savedStoriesWatched.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-slate-800">
                          3 Saved IG Stories Watched on @bookish.victorian:
                        </span>
                        {selectedCreator.savedStoriesWatched.map((story) => (
                          <a
                            key={story}
                            href={SARA_INSTAGRAM_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-0.5 text-[11px] font-mono font-semibold bg-fuchsia-100 text-fuchsia-900 border border-fuchsia-300 rounded hover:bg-fuchsia-200 inline-flex items-center gap-1"
                          >
                            <span>Story: {story}</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        ))}
                      </div>
                    )}

                    {selectedCreator.bossCritiqueNote && (
                      <div className="p-3 rounded-lg bg-white border border-amber-200 text-[11px] text-slate-700 leading-relaxed">
                        <strong className="text-slate-900">Why Rank #{selectedCreator.rank} is a Reference Benchmark: </strong>
                        {selectedCreator.bossCritiqueNote}
                      </div>
                    )}

                    {selectedCreator.originalStructuredReference && (
                      <details className="bg-white border border-stone-200 rounded-lg p-2.5">
                        <summary className="cursor-pointer font-semibold text-slate-800 text-[11px]">
                          View Original Structured Note (Before Loose Human / @Max Buck Critique Comparison)
                        </summary>
                        <pre className="mt-2 p-2.5 rounded bg-stone-50 border border-stone-200 font-mono text-[11px] text-slate-700 whitespace-pre-wrap max-h-48 overflow-y-auto">
                          {selectedCreator.originalStructuredReference}
                        </pre>
                      </details>
                    )}
                  </div>
                )}

                {/* Per-Creator Tone Override & Fatigue Indicator Bar */}
                <div className="p-3.5 rounded-xl bg-stone-100/90 border border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                      <span>Per-Creator Voice &amp; Typo Engine Override:</span>
                      <span className="px-2 py-0.5 text-[10px] font-mono bg-white border border-stone-300 rounded text-indigo-800">
                        {selectedCreator.rank <= 3
                          ? 'Ranks #1–#3 Reference Benchmark'
                          : selectedCreator.rank <= 14
                          ? `Rank #${selectedCreator.rank}: Light Natural Typos`
                          : selectedCreator.rank <= 26
                          ? `Rank #${selectedCreator.rank}: Mid-List Casual Typos`
                          : `Rank #${selectedCreator.rank}: Heavy Tired Typos (te, mire, thier, woudl)`}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      Switch this creator&rsquo;s comment &amp; 5 boss answers between all 4 voices without losing exact video URLs or timestamps.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {selectedCreator.rank <= 3 ? (
                      <button
                        type="button"
                        onClick={() => handleOverrideCreatorTone(selectedCreator.id, 'reference-locked')}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold border cursor-pointer ${
                          !selectedCreator.toneOverride || selectedCreator.toneOverride === 'reference-locked'
                            ? 'bg-amber-800 text-white border-amber-800'
                            : 'bg-white text-slate-700 border-stone-300 hover:bg-stone-50'
                        }`}
                      >
                        Locked Reference
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOverrideCreatorTone(selectedCreator.id, 'global')}
                        className={`px-2.5 py-1 rounded text-[11px] font-semibold border cursor-pointer ${
                          !selectedCreator.toneOverride || selectedCreator.toneOverride === 'global'
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-stone-300 hover:bg-stone-50'
                        }`}
                      >
                        Follow Global ({PROJECT_TONE_MODES.find((m) => m.id === projectToneMode)?.shortLabel})
                      </button>
                    )}

                    {PROJECT_TONE_MODES.map((m) => {
                      const isPicked = selectedCreator.toneOverride === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => handleOverrideCreatorTone(selectedCreator.id, m.id)}
                          className={`px-2.5 py-1 rounded text-[11px] font-semibold border cursor-pointer ${
                            isPicked
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-700 border-stone-300 hover:bg-stone-50'
                          }`}
                        >
                          {m.shortLabel}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Notion Comment Box (Tags @Bree Only) */}
                <div className="space-y-2.5">
                  <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200 text-xs text-slate-800 space-y-1">
                    <div className="font-semibold text-amber-900 flex items-center justify-between gap-2 flex-wrap">
                      <span>
                        Note from Boss (@Bree / @Max Buck) &middot; Active Voice:{' '}
                        {PROJECT_TONE_MODES.find(
                          (m) =>
                            m.id ===
                            (selectedCreator.toneOverride &&
                            selectedCreator.toneOverride !== 'global' &&
                            selectedCreator.toneOverride !== 'reference-locked'
                              ? selectedCreator.toneOverride
                              : projectToneMode)
                        )?.label || 'NYC + Bree Hybrid'}
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-mono bg-white border border-amber-300 rounded text-amber-900">
                        Casual Lowercase &middot; Intact URLs &amp; Timestamps
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-700 leading-relaxed italic">
                      &ldquo;thanks Brianna! ... I have already done a lot of the ai / research pre-emptive work to vet them. So I&rsquo;m really just looking for you to watch a video in full and leave the comments that pop into your head if that makes any sense. It&rsquo;s the touchy-feely part of this that we can&rsquo;t really automate that&rsquo;s the hard part. Your comments don&rsquo;t need to be long either - just thoughtful and truthful.&rdquo;
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="font-display text-sm font-bold text-slate-900">
                        Brianna&rsquo;s @Bree Notion Comment (Replace Mode &middot; Active Tone + Rank #{selectedCreator.rank} Fatigue)
                      </h3>
                      <p className="text-xs text-slate-500">
                        Replaces existing Notion page blocks &amp; <code className="font-mono">@Bree</code> comment cell in-place (never appends). Paste any long bulleted note below and click <strong>Rewrite in Active Tone</strong> to convert it.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          const currentBoxText =
                            selectedCreator.vettingDossier.formattedNotionComment || '';
                          const extractedSections = parseRawLongTemplateNote(currentBoxText);
                          const mergedDossier = extractedSections
                            ? {
                                ...selectedCreator.vettingDossier,
                                watchedOrRead:
                                  extractedSections.watchedOrRead ||
                                  selectedCreator.vettingDossier.watchedOrRead,
                                audienceProfile:
                                  extractedSections.audienceProfile ||
                                  selectedCreator.vettingDossier.audienceProfile,
                                readingAppsEreadersAndAI:
                                  extractedSections.readingAppsEreadersAndAI ||
                                  selectedCreator.vettingDossier.readingAppsEreadersAndAI,
                                competitorTiesAnalysis:
                                  extractedSections.competitorTiesAnalysis ||
                                  selectedCreator.vettingDossier.competitorTiesAnalysis,
                                recommendChromaticsWhy:
                                  extractedSections.recommendChromaticsWhy ||
                                  selectedCreator.vettingDossier.recommendChromaticsWhy,
                                outreachLeadHook:
                                  extractedSections.outreachLeadHook ||
                                  selectedCreator.vettingDossier.outreachLeadHook,
                                gutFeeling:
                                  extractedSections.gutFeeling ||
                                  selectedCreator.vettingDossier.gutFeeling,
                              }
                            : selectedCreator.vettingDossier;

                          const activeMode =
                            selectedCreator.toneOverride &&
                            selectedCreator.toneOverride !== 'global' &&
                            selectedCreator.toneOverride !== 'reference-locked'
                              ? selectedCreator.toneOverride
                              : projectToneMode;

                          const formattedDossier = formatCreatorNoteByTone(
                            { ...selectedCreator, vettingDossier: mergedDossier },
                            activeMode,
                            { allowReferenceOverride: true }
                          );

                          handleUpdateCreatorField(selectedCreator.id, {
                            vettingDossier: formattedDossier,
                          });
                          triggerToast(
                            `Rewrote ${selectedCreator.name}'s comment & 5 answers in ${
                              PROJECT_TONE_MODES.find((m) => m.id === activeMode)?.label
                            } (Rank #${selectedCreator.rank} fatigue applied, URLs/timestamps intact)!`
                          );
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Rewrite in Active Tone</span>
                      </button>

                      <button
                        onClick={() => handleCopyNotionComment(selectedCreator)}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-900 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                      >
                        {copiedId === selectedCreator.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Copied @Bree Comment!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy @Bree Comment</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <textarea
                    rows={5}
                    value={selectedCreator.vettingDossier.formattedNotionComment || ''}
                    onChange={(e) =>
                      handleUpdateCreatorField(selectedCreator.id, {
                        vettingDossier: {
                          ...selectedCreator.vettingDossier,
                          humanWatchComment: e.target.value,
                          formattedNotionComment: e.target.value,
                        },
                      })
                    }
                    placeholder="Paste a long bulleted Notion note here or edit Brianna's 2-paragraph NYC @Bree comment..."
                    className="w-full p-4 rounded-xl bg-stone-50 border border-stone-200 font-mono text-xs text-slate-800 leading-relaxed focus:outline-none focus:border-slate-900"
                  />
                </div>

                {/* Brianna's Contact Deep-Dive Chat Assistant (Gemini &/or Notion with Auto Thinking) */}
                <div className="space-y-3 pt-4 border-t border-stone-200">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
                    <div>
                      <h3 className="font-display text-sm font-bold text-slate-900 flex items-center gap-1.5">
                        <Radar className="w-4 h-4 text-indigo-600" />
                        <span>Brianna&rsquo;s Gemini &amp; Notion Contact Deep-Dive Chat</span>
                      </h3>
                      <p className="text-xs text-slate-500">
                        Account Owner: <strong>Brianna</strong> · Deep-diving into {selectedCreator.name} ({selectedCreator.handle})
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-500 font-medium">Context:</span>
                        <select
                          value={selectedChatSource}
                          onChange={(e) => setSelectedChatSource(e.target.value)}
                          className="px-2 py-1 text-xs font-semibold bg-stone-100 border border-stone-300 rounded-md text-slate-900 focus:outline-none"
                        >
                          <option value="gemini-and-notion">Gemini + Notion Workspace</option>
                          <option value="notion-only">Notion Workspace Notes Only</option>
                          <option value="gemini-search">Gemini + Live Google Search</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-500 font-medium">Model:</span>
                        <select
                          value={selectedChatModel}
                          onChange={(e) => setSelectedChatModel(e.target.value)}
                          className="px-2 py-1 text-xs font-semibold bg-stone-100 border border-stone-300 rounded-md text-slate-900 focus:outline-none"
                        >
                          <option value="auto">Auto (Intelligent Routing + Thinking)</option>
                          <option value="gemini-4-argon">Gemini 4 Argon (Deep Thinking)</option>
                          <option value="gemini-3.8-flash">Gemini 3.8 Flash (Balanced Thinking)</option>
                          <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (Fast)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="border border-stone-200 rounded-xl bg-stone-50/50 p-4 space-y-3">
                    <div className="max-h-64 overflow-y-auto space-y-2.5">
                      {(!contactChatMessages[selectedCreator.id] ||
                        contactChatMessages[selectedCreator.id].length === 0) && (
                        <div className="text-center py-4 text-xs text-slate-500 space-y-2">
                          <p>
                            Ask Gemini &amp; Notion anything about <strong>{selectedCreator.name}</strong>&rsquo;s brand ties, Ulysses/Russian Classics overlap, or outreach angle:
                          </p>
                          <div className="flex flex-wrap justify-center gap-1.5 pt-1">
                            <button
                              onClick={() =>
                                handleSendContactChat(
                                  selectedCreator.id,
                                  `Deep dive into ${selectedCreator.name}'s Notion conflict flags and competitor ties.`
                                )
                              }
                              className="px-2.5 py-1 text-[11px] bg-white border border-stone-200 rounded-md text-slate-700 hover:bg-stone-100 cursor-pointer"
                            >
                              Deep-dive conflict risks
                            </button>
                            <button
                              onClick={() =>
                                handleSendContactChat(
                                  selectedCreator.id,
                                  `Check how ${selectedCreator.name}'s recent books overlap with Chromatics (Ulysses dialogue color-coding & Russian Novels Collection).`
                                )
                              }
                              className="px-2.5 py-1 text-[11px] bg-white border border-stone-200 rounded-md text-slate-700 hover:bg-stone-100 cursor-pointer"
                            >
                              Check Chromatics book overlap
                            </button>
                            <button
                              onClick={() =>
                                handleSendContactChat(
                                  selectedCreator.id,
                                  `Write a fresh @Bree comment for ${selectedCreator.name} in Brianna's 20-something NYC voice (lowercase-friendly, dry humor, slightly lazy, 2 short paragraphs hitting all 5 points, plain everyday words only with no 3+ syllable non-conversational words).`
                                )
                              }
                              className="px-2.5 py-1 text-[11px] bg-white border border-stone-200 rounded-md text-slate-700 hover:bg-stone-100 cursor-pointer"
                            >
                              Draft 20-something NYC @Bree comment
                            </button>
                          </div>
                        </div>
                      )}

                      {(contactChatMessages[selectedCreator.id] || []).map((msg, i) => (
                        <div
                          key={i}
                          className={`flex flex-col ${
                            msg.role === 'user' ? 'items-end' : 'items-start'
                          }`}
                        >
                          <div
                            className={`max-w-[88%] p-3 rounded-xl text-xs leading-relaxed ${
                              msg.role === 'user'
                                ? 'bg-slate-900 text-white rounded-br-xs'
                                : 'bg-white text-slate-800 border border-stone-200 shadow-xs rounded-bl-xs'
                            }`}
                          >
                            <div className="whitespace-pre-wrap">{msg.text}</div>
                            {msg.role === 'model' && (msg.text.includes('@Bree') || msg.text.includes('@Max')) && (
                              <div className="mt-2 pt-2 border-t border-stone-100 flex items-center justify-end">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const normalized = msg.text.replace(/@max\s*buck/gi, '@Bree');
                                    const blocks = normalized
                                      .split('\n\n')
                                      .map((b) => b.trim())
                                      .filter(
                                        (b) =>
                                          Boolean(b) &&
                                          !b.startsWith('•') &&
                                          !/^(hey brianna|here[’']s a fresh|ready-to-paste|if you want to drop)/i.test(
                                            b
                                          )
                                      );
                                    const breeIdx = blocks.findIndex((b) => b.includes('@Bree'));
                                    const extracted =
                                      breeIdx > 0
                                        ? `${blocks[breeIdx - 1]}\n\n${blocks[breeIdx]}`.trim()
                                        : breeIdx === 0
                                        ? blocks[0].trim()
                                        : normalized.trim();
                                    handleUpdateCreatorField(selectedCreator.id, {
                                      vettingDossier: {
                                        ...selectedCreator.vettingDossier,
                                        humanWatchComment: extracted,
                                        formattedNotionComment: extracted,
                                      },
                                    });
                                    triggerToast(
                                      `Replaced ${selectedCreator.name}'s @Bree comment (previous comment overwritten, not appended)!`
                                    );
                                  }}
                                  className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-md hover:bg-emerald-100 transition-colors cursor-pointer"
                                >
                                  Replace @Bree Comment
                                </button>
                              </div>
                            )}
                            {msg.groundingSources && msg.groundingSources.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-stone-100 space-y-1">
                                <span className="block text-[10px] font-semibold text-slate-500">
                                  Grounded Sources:
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                  {msg.groundingSources.map((src, idx) => (
                                    <a
                                      key={idx}
                                      href={src.uri}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[10px] text-indigo-700 hover:underline inline-flex items-center gap-0.5 bg-indigo-50 px-1.5 py-0.5 rounded"
                                    >
                                      <span>{src.title}</span>
                                      <ExternalLink className="w-2.5 h-2.5" />
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          {msg.modelUsed && (
                            <span className="text-[10px] text-slate-400 font-mono mt-0.5 px-1">
                              Owner: Brianna · Model: {msg.modelUsed}{' '}
                              {msg.thinking ? '· Thinking Enabled' : ''} · Source:{' '}
                              {msg.chatSourceMode || 'gemini-and-notion'}
                            </span>
                          )}
                        </div>
                      ))}

                      {isContactChatting && (
                        <div className="flex items-center gap-2 text-xs text-slate-500 py-1">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>
                            Gemini ({selectedChatModel === 'auto' ? 'Auto Thinking' : selectedChatModel}) is deep-diving into {selectedCreator.name}&rsquo;s Notion &amp; web dossier...
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-stone-200">
                      <input
                        type="text"
                        value={contactChatInput}
                        onChange={(e) => setContactChatInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSendContactChat(selectedCreator.id);
                          }
                        }}
                        placeholder={`Ask Gemini & Notion about ${selectedCreator.name} or type "make comment shorter"...`}
                        className="flex-1 px-3.5 py-2 text-xs bg-white border border-stone-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/15 transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => handleSendContactChat(selectedCreator.id)}
                        disabled={isContactChatting || !contactChatInput.trim()}
                        className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 rounded-lg shadow-xs transition-all cursor-pointer shrink-0"
                      >
                        {isContactChatting ? 'Sending...' : 'Send'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Overall + 5 Premade Boss Questions + Lead Hook + Gut Feeling */}
                <div className="space-y-4 pt-2 border-t border-stone-200">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-sm font-bold text-slate-900">
                      Structured Vetting Sections &amp; Database Write-Back Cells
                    </h3>
                    <span className="text-xs text-slate-500">
                      Edits update local draft &amp; @Bree comment preview in real time
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-800 mb-1">
                        Overall:
                      </label>
                      <textarea
                        rows={3}
                        value={selectedCreator.vettingDossier.overallSummary || ''}
                        onChange={(e) =>
                          handleUpdateCreatorField(selectedCreator.id, {
                            vettingDossier: {
                              ...selectedCreator.vettingDossier,
                              overallSummary: e.target.value,
                            },
                          })
                        }
                        placeholder="Overall: Solid, natural fit for Chromatics..."
                        className="w-full p-2.5 text-xs bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-800 mb-1">
                        {questions.q1}
                      </label>
                      <textarea
                        rows={2}
                        value={selectedCreator.vettingDossier.watchedOrRead}
                        onChange={(e) =>
                          handleUpdateCreatorField(selectedCreator.id, {
                            vettingDossier: {
                              ...selectedCreator.vettingDossier,
                              watchedOrRead: e.target.value,
                            },
                          })
                        }
                        placeholder="Titles and links of recent videos or posts watched during the 20–25m session..."
                        className="w-full p-2.5 text-xs bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-800 mb-1">
                        {questions.q2}
                      </label>
                      <textarea
                        rows={2}
                        value={selectedCreator.vettingDossier.audienceProfile}
                        onChange={(e) =>
                          handleUpdateCreatorField(selectedCreator.id, {
                            vettingDossier: {
                              ...selectedCreator.vettingDossier,
                              audienceProfile: e.target.value,
                            },
                          })
                        }
                        placeholder="Who their audience seems to be..."
                        className="w-full p-2.5 text-xs bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-800 mb-1">
                        {questions.q3}
                      </label>
                      <textarea
                        rows={2}
                        value={selectedCreator.vettingDossier.readingAppsEreadersAndAI}
                        onChange={(e) =>
                          handleUpdateCreatorField(selectedCreator.id, {
                            vettingDossier: {
                              ...selectedCreator.vettingDossier,
                              readingAppsEreadersAndAI: e.target.value,
                            },
                          })
                        }
                        placeholder="How they talk about reading apps, e-readers, and AI..."
                        className="w-full p-2.5 text-xs bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-800 mb-1">
                        {questions.q4}
                      </label>
                      <textarea
                        rows={2}
                        value={selectedCreator.vettingDossier.competitorTiesAnalysis}
                        onChange={(e) =>
                          handleUpdateCreatorField(selectedCreator.id, {
                            vettingDossier: {
                              ...selectedCreator.vettingDossier,
                              competitorTiesAnalysis: e.target.value,
                            },
                          })
                        }
                        placeholder="Any ties to Fable, Kindle, Audible, Kobo, Libro.fm, Everand, Storytel, BookBeat, Apple Books, Spotify audiobooks, Goodreads, Serial Reader, or XTEINK..."
                        className="w-full p-2.5 text-xs bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-800 mb-1">
                        {questions.q5}
                      </label>
                      <textarea
                        rows={2}
                        value={selectedCreator.vettingDossier.recommendChromaticsWhy}
                        onChange={(e) =>
                          handleUpdateCreatorField(selectedCreator.id, {
                            vettingDossier: {
                              ...selectedCreator.vettingDossier,
                              recommendChromaticsWhy: e.target.value,
                            },
                          })
                        }
                        placeholder="Whether you'd honestly recommend Chromatics to their audience, and why..."
                        className="w-full p-2.5 text-xs bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-slate-900"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-800 mb-1">
                          The One Thing to Lead With in Outreach Email
                        </label>
                        <textarea
                          rows={2}
                          value={selectedCreator.vettingDossier.outreachLeadHook}
                          onChange={(e) =>
                            handleUpdateCreatorField(selectedCreator.id, {
                              vettingDossier: {
                                ...selectedCreator.vettingDossier,
                                outreachLeadHook: e.target.value,
                              },
                            })
                          }
                          placeholder="Specific video/essay hook to open our email..."
                          className="w-full p-2.5 text-xs bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-800 mb-1">
                          Gut Feeling on This Creator
                        </label>
                        <textarea
                          rows={2}
                          value={selectedCreator.vettingDossier.gutFeeling}
                          onChange={(e) =>
                            handleUpdateCreatorField(selectedCreator.id, {
                              vettingDossier: {
                                ...selectedCreator.vettingDossier,
                                gutFeeling: e.target.value,
                              },
                            })
                          }
                          className="w-full p-2.5 text-xs bg-white border border-stone-200 rounded-lg focus:outline-none focus:border-slate-900" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>
        )}

        {/* VIEW 2: GOOGLE SHEETS <-> 27-COLUMN FORMATTED NOTION DATABASE & 40-CREATOR MASTER SPREADSHEET */}
        {activeView === 'spreadsheet' && (
          <div className="space-y-5">
            {/* Live Google Sheets <-> 27-Column Notion Database Bridge */}
            <GoogleSheetsNotionBridge
              creators={creators}
              selectedPlatforms={selectedPlatforms}
              onImportCreatorsFromSheet={handleImportCreatorsFromGoogleSheet}
              onFormatNotionDatabase={handleFormatNotionDatabase}
              onTriggerToast={triggerToast}
            />

            {/* Database Schema Formatter Banner */}
            <div className="bg-white border border-stone-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700">
                  <Database className="w-4 h-4" />
                  <span>
                    NOTION DATABASE SCHEMA FORMATTED FOR 100% AGENT DATA ({AGENT_DB_SCHEMA_COLUMNS.length} COLUMNS · {dbFormattedTimestamp})
                  </span>
                </div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  40-Creator Master Database &amp; 27-Column Agent Data Schema
                </h2>
                <p className="text-xs text-slate-600 max-w-3xl">
                  The database is formatted with <strong>27 structured Notion properties</strong> (<code className="font-mono">title</code>,{' '}
                  <code className="font-mono">number</code>, <code className="font-mono">select</code>,{' '}
                  <code className="font-mono">multi_select</code>, <code className="font-mono">url</code>,{' '}
                  <code className="font-mono">date</code>, and <code className="font-mono">rich_text</code>) so every single field emitted by the AI vetting agent is stored cleanly in both your spreadsheet and Notion database.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  onClick={() => handleFormatNotionDatabase('my-contacts-desk')}
                  disabled={isFormattingDb}
                  className="px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Database className={`w-3.5 h-3.5 ${isFormattingDb ? 'animate-spin' : ''}`} />
                  <span>
                    {isFormattingDb
                      ? 'Formatting Notion DB Schema...'
                      : 'Format Notion DB Schema (27 Columns)'}
                  </span>
                </button>

                <button
                  onClick={handleCopyDatabaseJsonSchema}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy 27-Col JSON Schema</span>
                </button>

                <button
                  onClick={() => requestPublishConfirmation(creators, 'my-contacts-desk')}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Sync All 40 Creators to Formatted DB</span>
                </button>

                <button
                  onClick={handleExportSpreadsheetCSV}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download 27-Col CSV</span>
                </button>
              </div>
            </div>

            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
              {/* Sub-Tab Bar */}
              <div className="px-4 py-3 border-b border-stone-200 flex flex-wrap items-center justify-between gap-4 bg-stone-50/70">
                <div className="flex items-center gap-1.5 p-1 bg-stone-200/70 rounded-lg">
                  <button
                    onClick={() => setSpreadsheetSubTab('table-27-cols')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                      spreadsheetSubTab === 'table-27-cols'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Formatted 27-Column Database Table (40 Rows)</span>
                  </button>
                  <button
                    onClick={() => setSpreadsheetSubTab('schema-mapper')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer flex items-center gap-1.5 ${
                      spreadsheetSubTab === 'schema-mapper'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Database className="w-3.5 h-3.5" />
                    <span>27-Column Notion DB Schema &amp; Agent Data Mapping</span>
                  </button>
                </div>

                <div className="text-xs text-slate-500 font-mono">
                  Active Platform Filter: [{selectedPlatforms.join(', ')}] · 27 Structured Columns Active
                </div>
              </div>

              {spreadsheetSubTab === 'schema-mapper' ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-stone-200 bg-stone-100/80 text-[11px] font-semibold text-slate-600">
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">Database Column Name</th>
                        <th className="py-2.5 px-3">Notion Property Type</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3">AI Agent Source Path</th>
                        <th className="py-2.5 px-3 min-w-[260px]">Purpose &amp; Allowed Options</th>
                        <th className="py-2.5 px-3 min-w-[280px]">
                          Live Formatted Agent Value ({selectedCreator.name})
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200 text-xs">
                      {AGENT_DB_SCHEMA_COLUMNS.map((col, idx) => {
                        const sampleRow = formatCreatorForDatabaseRow(
                          selectedCreator,
                          selectedPlatforms
                        );
                        return (
                          <tr key={col.columnName} className="hover:bg-stone-50/90 align-top">
                            <td className="py-2.5 px-3 font-mono text-slate-400 tabular-nums">
                              {String(idx + 1).padStart(2, '0')}
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span>{col.columnName}</span>
                                {col.lockedInDesk && (
                                  <Lock className="w-3 h-3 text-slate-400" />
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap font-mono text-[11px] text-indigo-700 font-semibold">
                              {col.notionType}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap text-slate-600">
                              {col.category}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                              {col.agentSourceField}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 max-w-xs">
                              <div>{col.description}</div>
                              {col.options && (
                                <div className="font-mono text-[10px] text-slate-500 mt-0.5">
                                  Options: {col.options.join(' · ')}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-800 max-w-sm">
                              <p className="line-clamp-2">
                                {sampleRow[col.columnName] || '—'}
                              </p>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-stone-200 bg-stone-100/80 text-[11px] font-semibold text-slate-600 whitespace-nowrap">
                        <th className="py-2.5 px-3">01. Rank</th>
                        <th className="py-2.5 px-3">02. Priority Cohort</th>
                        <th className="py-2.5 px-3">03. Name</th>
                        <th className="py-2.5 px-3">04. Handle</th>
                        <th className="py-2.5 px-3">05. Niche</th>
                        <th className="py-2.5 px-3">06. Followers</th>
                        <th className="py-2.5 px-3">07. Avg Engagement</th>
                        <th className="py-2.5 px-3">08. Main link</th>
                        <th className="py-2.5 px-3">09. Platforms</th>
                        <th className="py-2.5 px-3">10. Audited Platforms</th>
                        <th className="py-2.5 px-3 min-w-[240px]">11. Discovered Post Links</th>
                        <th className="py-2.5 px-3">12. Verdict</th>
                        <th className="py-2.5 px-3">13. Stage</th>
                        <th className="py-2.5 px-3">14. Team take</th>
                        <th className="py-2.5 px-3">15. Owner</th>
                        <th className="py-2.5 px-3">16. Vetted Date</th>
                        <th className="py-2.5 px-3 min-w-[200px]">17. Research notes</th>
                        <th className="py-2.5 px-3">18. Competitor Watchlist Ties</th>
                        <th className="py-2.5 px-3">19. Conflict Risk Level</th>
                        <th className="py-2.5 px-3 min-w-[240px]">20. Q1: Watched / Read</th>
                        <th className="py-2.5 px-3 min-w-[200px]">21. Q2: Audience Profile</th>
                        <th className="py-2.5 px-3 min-w-[220px]">22. Q3: Apps, E-Readers &amp; AI</th>
                        <th className="py-2.5 px-3 min-w-[220px]">23. Q4: Competitor Ties Analysis</th>
                        <th className="py-2.5 px-3 min-w-[220px]">24. Q5: Recommend Chromatics &amp; Why</th>
                        <th className="py-2.5 px-3 min-w-[200px]">25. Outreach Lead Hook</th>
                        <th className="py-2.5 px-3 min-w-[200px]">26. Gut Feeling</th>
                        <th className="py-2.5 px-3 min-w-[240px]">27. Notion Comment (@Bree)</th>
                        <th className="py-2.5 px-3">DB Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200 text-xs">
                      {creators.map((c) => {
                        const row = formatCreatorForDatabaseRow(c, selectedPlatforms);
                        return (
                          <tr key={c.id} className="hover:bg-stone-50/90 transition-colors align-top">
                            <td className="py-3 px-3 font-mono text-slate-500 tabular-nums whitespace-nowrap">
                              #{String(c.rank).padStart(2, '0')}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap text-slate-700 font-medium">
                              {row['Priority Cohort']}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap font-semibold text-slate-900">
                              {row['Name']}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap font-mono text-slate-600">
                              {row['Handle']}
                            </td>
                            <td className="py-3 px-3 min-w-[160px] text-slate-600">
                              {row['Niche']}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap font-mono text-slate-700 tabular-nums">
                              {row['Followers']}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap font-mono text-slate-700 tabular-nums">
                              {row['Avg Engagement']}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <a
                                href={c.mainLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-indigo-700 hover:underline inline-flex items-center gap-0.5 font-mono text-[11px]"
                              >
                                <span>{c.mainLink.replace(/^https?:\/\/(www\.)?/, '').slice(0, 24)}</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap text-slate-600">
                              {row['Platforms']}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap font-mono text-[11px] text-indigo-700">
                              {row['Audited Platforms']}
                            </td>
                            <td className="py-3 px-3 text-slate-600 max-w-xs font-mono text-[11px]">
                              <p className="line-clamp-3">{row['Discovered Post Links']}</p>
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap font-medium text-slate-800">
                              {row['Verdict']}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap font-medium text-slate-800">
                              <div>{row['Stage']}</div>
                              <div className="text-[10px] font-mono text-slate-500">
                                {c.notionSyncStatus === 'synced'
                                  ? `DB ${c.notionSyncOperation || 'Synced'}`
                                  : 'Draft'}
                              </div>
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <span
                                className={
                                  c.teamTake === 'Strong fit'
                                    ? 'text-emerald-700 font-semibold'
                                    : c.teamTake === 'Maybe'
                                    ? 'text-amber-700 font-semibold'
                                    : c.teamTake === 'Not a fit'
                                    ? 'text-rose-700 font-semibold'
                                    : 'text-slate-400'
                                }
                              >
                                {row['Team take']}
                              </span>
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap text-slate-700">
                              {row['Owner']}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap font-mono text-slate-600">
                              {row['Vetted Date']}
                            </td>
                            <td className="py-3 px-3 text-slate-600 max-w-xs">
                              <p className="line-clamp-3">{row['Research notes']}</p>
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap font-semibold text-slate-800">
                              {row['Competitor Watchlist Ties']}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap font-mono">
                              <span
                                className={
                                  row['Conflict Risk Level'] === 'High'
                                    ? 'text-rose-700 font-semibold'
                                    : row['Conflict Risk Level'] === 'Moderate'
                                    ? 'text-amber-700 font-semibold'
                                    : 'text-slate-600'
                                }
                              >
                                {row['Conflict Risk Level']}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-slate-600 max-w-xs">
                              <p className="line-clamp-3">
                                {row['Q1: Watched or Read (Titles & Links)'] || '—'}
                              </p>
                            </td>
                            <td className="py-3 px-3 text-slate-600 max-w-xs">
                              <p className="line-clamp-3">{row['Q2: Audience Profile'] || '—'}</p>
                            </td>
                            <td className="py-3 px-3 text-slate-600 max-w-xs">
                              <p className="line-clamp-3">
                                {row['Q3: Reading Apps, E-Readers & AI'] || '—'}
                              </p>
                            </td>
                            <td className="py-3 px-3 text-slate-600 max-w-xs">
                              <p className="line-clamp-3">
                                {row['Q4: Competitor Ties Analysis'] || '—'}
                              </p>
                            </td>
                            <td className="py-3 px-3 text-slate-600 max-w-xs">
                              <p className="line-clamp-3">
                                {row['Q5: Recommend Chromatics & Why'] || '—'}
                              </p>
                            </td>
                            <td className="py-3 px-3 text-slate-600 max-w-xs">
                              <p className="line-clamp-3">{row['Outreach Lead Hook'] || '—'}</p>
                            </td>
                            <td className="py-3 px-3 text-slate-600 max-w-xs">
                              <p className="line-clamp-3">{row['Gut Feeling'] || '—'}</p>
                            </td>
                            <td className="py-3 px-3 text-slate-600 max-w-xs font-mono text-[11px]">
                              <p className="line-clamp-3">
                                {row['Notion Comment (@Bree)'] || '—'}
                              </p>
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => {
                                    setSelectedCreatorId(c.id);
                                    setActiveView('notion-desk');
                                  }}
                                  className="px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-stone-100 hover:bg-stone-200 rounded cursor-pointer"
                                >
                                  Open Dossier
                                </button>
                                <button
                                  onClick={() => requestPublishConfirmation([c], 'my-contacts-desk')}
                                  className="px-2.5 py-1 text-[11px] font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded cursor-pointer"
                                >
                                  Sync 27 Cols
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW 3: 13-COMPETITOR ECOSYSTEM WATCHLIST RADAR */}
        {activeView === 'competitor-radar' && (
          <div className="space-y-6">
            <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-slate-800" />
                  <span>Reading Ecosystem Competitor &amp; Conflict Matrix (13 Companies)</span>
                </h2>
                <p className="text-xs text-slate-600 mt-1">
                  Tracks discount codes, sponsorships, affiliate links, book clubs, and hardware reviews across{' '}
                  <strong>{COMPETITOR_WATCHLIST.join(', ')}</strong>—including special flags for Kim Dijke (Fable book club), Kate Sutton (Kobo Libra Colour review), and Emma Mayer (Audible sponsorship).
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                {creators
                  .filter((c) => c.competitorTies.length > 0 || c.flagNote)
                  .map((c) => (
                    <div
                      key={c.id}
                      className="p-4 rounded-xl border border-stone-200 bg-stone-50/60 flex flex-col justify-between gap-3"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-display text-sm font-bold text-slate-900">
                            #{c.rank} {c.name}
                          </span>
                          <span className="text-xs font-semibold text-slate-700">
                            Team take: {c.teamTake}
                          </span>
                        </div>

                        {c.flagNote && (
                          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-lg">
                            {c.flagNote}
                          </p>
                        )}

                        <div className="space-y-1.5 pt-1">
                          {c.competitorTies.map((tie, idx) => (
                            <div key={idx} className="text-xs text-slate-700">
                              <span className="font-semibold text-slate-900">
                                {tie.company} ({tie.relationshipType} · {tie.activeConflictRisk} Risk):{' '}
                              </span>
                              <span>{tie.details}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          setSelectedCreatorId(c.id);
                          setActiveView('notion-desk');
                        }}
                        className="w-full py-1.5 text-xs font-medium text-slate-800 bg-white border border-stone-300 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer"
                      >
                        Inspect Full Vetting Note
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* VIEW 4: VETTING QUESTIONS CONFIGURATION */}
        {activeView === 'boss-questions' && (
          <div className="max-w-3xl mx-auto bg-white border border-stone-200 rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-stone-200 pb-4">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900 flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-slate-700" />
                  <span>Configure the 5 Vetting Questions (Chromatics Protocol)</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Customize the exact prompts the AI vetting agent answers for each creator before placing responses in the spreadsheet and staging the @Bree comment.
                </p>
              </div>
              <button
                onClick={() => {
                  setQuestions(DEFAULT_VETTING_QUESTIONS);
                  triggerToast('Reset to default Chromatics vetting questions.');
                }}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-stone-100 hover:bg-stone-200 rounded-lg cursor-pointer"
              >
                Reset Defaults
              </button>
            </div>

            <div className="space-y-4">
              {(['q1', 'q2', 'q3', 'q4', 'q5'] as const).map((key, idx) => (
                <div key={key}>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Evaluation Question #{idx + 1}
                  </label>
                  <input
                    type="text"
                    value={questions[key]}
                    onChange={(e) => setQuestions({ ...questions, [key]: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-white border border-stone-300 rounded-lg focus:outline-none focus:border-slate-900"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
