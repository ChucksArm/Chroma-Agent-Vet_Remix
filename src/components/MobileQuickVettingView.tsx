import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  ReferenceLine,
  Cell
} from 'recharts';
import {
  Search,
  Check,
  ExternalLink,
  Copy,
  FileSpreadsheet,
  BookOpen,
  AlertTriangle,
  ChevronRight,
  ShieldCheck,
  Moon,
  Sun,
  Zap,
  User,
  Database,
  Play,
  Lock,
  BarChart3,
  X,
  Download,
  RefreshCw,
  Smartphone
} from 'lucide-react';
import {
  CreatorRecord,
  SocialPlatformType,
  ProjectToneMode,
  NotionWorkspaceScanResult,
  VettingQuestionsConfig,
  TeamTakeType
} from '../types';
import {
  PROJECT_TONE_MODES,
  AGENT_DB_SCHEMA_COLUMNS,
  formatCreatorForDatabaseRow
} from '../data/initialCreators';
import {
  parseFollowersCount,
  parseEngagementRate,
  formatCompactNumber
} from './PerformanceDashboard';

interface MobileQuickVettingViewProps {
  creators: CreatorRecord[];
  selectedCreatorId: string;
  onSelectCreator: (id: string) => void;
  onOpenDossier: (creator: CreatorRecord) => void;
  onCopyComment: (creator: CreatorRecord) => void;
  onRunSingleVet: (creator: CreatorRecord) => void;
  onFastFail: (creator: CreatorRecord) => void;
  onOpenSyncModal: (creators: CreatorRecord[]) => void;
  activeView: string;
  onSwitchView: (view: any) => void;
  isQuickVettingMode: boolean;
  onToggleQuickVetting: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  selectedPlatforms: SocialPlatformType[];
  onTogglePlatform: (p: SocialPlatformType) => void;
  projectToneMode: ProjectToneMode;
  onSwitchProjectTone: (mode: ProjectToneMode) => void;
  onOverrideCreatorTone: (
    creatorId: string,
    mode: ProjectToneMode | 'reference-locked' | 'global'
  ) => void;
  forceMobilePreview?: boolean;
  onToggleMobilePreview?: () => void;
  workspaceScan?: NotionWorkspaceScanResult;
  onScanWorkspace?: () => void;
  isScanningWorkspace?: boolean;
  questions?: VettingQuestionsConfig;
  onUpdateQuestions?: (q: VettingQuestionsConfig) => void;
  onExportCSV?: () => void;
  onProceedConflict?: (creator: CreatorRecord) => void;
  onArchiveConflict?: (creator: CreatorRecord) => void;
  onUpdateCreatorField?: (creatorId: string, updates: Partial<CreatorRecord>) => void;
}

export default function MobileQuickVettingView({
  creators,
  selectedCreatorId,
  onSelectCreator,
  onCopyComment,
  onRunSingleVet,
  onFastFail,
  onOpenSyncModal,
  activeView,
  onSwitchView,
  isQuickVettingMode,
  onToggleQuickVetting,
  isDarkMode,
  onToggleDarkMode,
  projectToneMode,
  onSwitchProjectTone,
  onOverrideCreatorTone,
  forceMobilePreview = false,
  onToggleMobilePreview,
  workspaceScan,
  onScanWorkspace,
  isScanningWorkspace = false,
  questions,
  onUpdateQuestions,
  onExportCSV,
  onProceedConflict,
  onArchiveConflict,
  onUpdateCreatorField
}: MobileQuickVettingViewProps) {
  const [filterQuery, setFilterQuery] = useState('');
  const [mobileQueueFilter, setMobileQueueFilter] = useState<'all' | 'first-10' | 'conflicts'>('all');
  const [mobileDossierCreatorId, setMobileDossierCreatorId] = useState<string | null>(null);
  const [perfSort, setPerfSort] = useState<'impact' | 'engagement' | 'followers'>('impact');
  const [perfTakeFilter, setPerfTakeFilter] = useState<'all' | TeamTakeType>('all');

  const conflicts = useMemo(
    () =>
      creators.filter(
        (c) =>
          c.stage !== 'Archived' &&
          c.verdict !== 'Approved' &&
          (Boolean(c.flagNote) ||
            c.verdict === 'Possible conflict' ||
            c.competitorTies.some((t) => t.activeConflictRisk !== 'Low'))
      ),
    [creators]
  );

  const filteredQueue = useMemo(() => {
    return creators.filter((c) => {
      if (mobileQueueFilter === 'first-10' && !c.isTopTenPriority) return false;
      if (mobileQueueFilter === 'conflicts') {
        const isConf = conflicts.some((conf) => conf.id === c.id);
        if (!isConf) return false;
      }
      if (!filterQuery.trim()) return true;
      const q = filterQuery.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.handle.toLowerCase().includes(q) ||
        c.niche.toLowerCase().includes(q)
      );
    });
  }, [creators, mobileQueueFilter, filterQuery, conflicts]);

  // Mobile Performance Dashboard Data
  const mobilePerfData = useMemo(() => {
    const items = creators.map((c) => {
      const followersNum = parseFollowersCount(c.followersCount);
      const followersK = Number((followersNum / 1000).toFixed(1));
      const engagementRate = parseEngagementRate(c.avgEngagementRate);
      const engagedReaders = Math.round(followersNum * (engagementRate / 100));
      const fitBonus = c.teamTake === 'Strong fit' ? 18 : c.teamTake === 'Maybe' ? 6 : -20;
      const impactScore = Math.max(
        15,
        Math.min(
          99,
          Math.round(engagementRate * 4.5 + Math.min(35, followersK * 0.22) + fitBonus)
        )
      );
      return {
        creator: c,
        id: c.id,
        rank: c.rank,
        name: c.name,
        shortName: `#${c.rank} ${c.name.split(' ')[0]}`,
        handle: c.handle,
        followersNum,
        followersK,
        engagementRate,
        engagedReaders,
        impactScore,
        teamTake: c.teamTake
      };
    });

    return items
      .filter((item) => (perfTakeFilter === 'all' ? true : item.teamTake === perfTakeFilter))
      .sort((a, b) => {
        if (perfSort === 'engagement') return b.engagementRate - a.engagementRate;
        if (perfSort === 'followers') return b.followersNum - a.followersNum;
        return b.impactScore - a.impactScore;
      });
  }, [creators, perfSort, perfTakeFilter]);

  const activeDossierCreator = useMemo(
    () => creators.find((c) => c.id === mobileDossierCreatorId) || null,
    [creators, mobileDossierCreatorId]
  );

  const selectedCreator = useMemo(
    () => creators.find((c) => c.id === selectedCreatorId) || creators[0],
    [creators, selectedCreatorId]
  );

  const getDotColor = (take: TeamTakeType) => {
    if (take === 'Strong fit') return '#059669';
    if (take === 'Maybe') return '#d97706';
    return '#e11d48';
  };

  return (
    <div
      className={`${
        forceMobilePreview
          ? 'block max-w-[430px] mx-auto border-x border-stone-300 min-h-screen bg-[#FAF9F5] shadow-xl'
          : 'md:hidden'
      } pb-24 space-y-3.5 px-3 pt-2`}
    >
      {/* Compact Sticky Mobile App Bar + 7 Numbered Navigation Links */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border border-stone-200 rounded-2xl px-3.5 py-2.5 space-y-2 shadow-xs">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span className="font-display text-sm font-bold text-slate-900 truncate">
                Chromatics Mobile Desk
              </span>
            </div>
            <p className="text-[10px] text-slate-500 truncate">
              {activeView === 'performance-dashboard'
                ? '3. Performance: Engagement vs. Reach (40)'
                : activeView === 'prelive-staging'
                ? '4. Pre-Live Staging & Version Control (Brianna Desk)'
                : activeView === 'spreadsheet'
                ? '5. 30-Col Notion DB & Google Sheets'
                : activeView === 'competitor-radar'
                ? `6. 13-Competitor Watchlist (${conflicts.length} Flags)`
                : activeView === 'boss-questions'
                ? '7. 5 Executive Vetting Questions'
                : activeView === 'workspace-scanner'
                ? '1. Workspace Scan & Brianna Desk'
                : '2. Notion Vetting Queue & @Bree Notes'}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onToggleQuickVetting}
              className={`min-h-[38px] px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold flex items-center gap-1 cursor-pointer ${
                isQuickVettingMode
                  ? 'bg-emerald-600 text-white border-emerald-500'
                  : 'bg-stone-100 text-slate-700 border-stone-300'
              }`}
              title="Quick Vetting Mode: Max 3 recent posts per platform"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>{isQuickVettingMode ? '3 Posts' : 'Quick'}</span>
            </button>

            <button
              type="button"
              onClick={onToggleDarkMode}
              className="min-h-[38px] min-w-[38px] rounded-xl border border-stone-300 bg-stone-100 text-slate-700 flex items-center justify-center cursor-pointer"
              aria-label="Toggle Dark Mode"
            >
              {isDarkMode ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>

            {forceMobilePreview && onToggleMobilePreview && (
              <button
                type="button"
                onClick={onToggleMobilePreview}
                className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-slate-900 text-white text-[11px] font-semibold cursor-pointer"
              >
                Exit Mobile
              </button>
            )}
          </div>
        </div>

        {/* Scrollable 1–7 Numbered Navigation Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          {(
            [
              { id: 'workspace-scanner', num: '1.', label: 'Workspace Scan' },
              { id: 'notion-desk', num: '2.', label: 'Notion Desk' },
              { id: 'performance-dashboard', num: '3.', label: 'Performance Dashboard' },
              { id: 'prelive-staging', num: '4.', label: 'Pre-Live Staging' },
              { id: 'spreadsheet', num: '5.', label: 'Sheets & Notion DB' },
              { id: 'competitor-radar', num: '6.', label: 'Competitor Watchlist' },
              { id: 'boss-questions', num: '7.', label: 'Vetting Questions' },
            ] as const
          ).map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSwitchView(item.id)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1 ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-stone-100 text-slate-700 border border-stone-200'
                }`}
              >
                <span className="font-mono text-[10px] opacity-80">{item.num}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* MOBILE PAGE 4: PRE-LIVE STAGING & VERSION CONTROL */}
      {activeView === 'prelive-staging' && (
        <div className="bg-white border border-stone-200 rounded-2xl p-3.5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-xs font-bold text-slate-900">
                4. Pre-Live Staging, Version Revert &amp; Brianna&apos;s Desk Migration
              </h3>
              <p className="text-[10px] text-slate-500 font-mono">
                Brianna&apos;s Desk NOTION_ID: c4357c4d-75c0-810f-95a6-0003bcac8153
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenSyncModal(creators)}
              className="px-2.5 py-1.5 text-[11px] font-semibold bg-emerald-700 text-white rounded-xl cursor-pointer shrink-0"
            >
              Migrate All (40)
            </button>
          </div>
          <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-0.5">
            {creators.map((c) => (
              <div
                key={c.id}
                className="p-2.5 rounded-xl border border-stone-200 bg-stone-50/70 space-y-1.5 text-[11px]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900">
                    #{c.rank} {c.name} ({c.handle})
                  </span>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200">
                    {c.activeVersionId || 'v2.0'}
                  </span>
                </div>
                <div className="font-mono text-[10px] text-emerald-800">
                  {c.chromaAgentSignature} · Changed: {c.lastChangedAt}
                </div>
                <p className="text-[10px] text-slate-600 line-clamp-2">
                  {c.latestAgentRunChangesDescription}
                </p>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <a
                    href={c.notionVersionControlUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] font-semibold text-indigo-700 underline"
                  >
                    Notion Version Control
                  </a>
                  <button
                    type="button"
                    onClick={() => onOpenSyncModal([c])}
                    className="px-2 py-1 text-[10px] font-semibold bg-slate-900 text-white rounded-lg cursor-pointer"
                  >
                    Fetch Brianna&apos;s Desk &amp; Migrate
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MOBILE PAGE 1: PERFORMANCE DASHBOARD (Engagement vs. Follower Counts across 40 Records) */}
      {activeView === 'performance-dashboard' && (
        <div className="space-y-3.5">
          {/* 2x2 Mobile KPI Grid */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="bg-white border border-stone-200 rounded-2xl p-3">
              <div className="text-[10px] font-semibold text-slate-500">Total 40 Reach</div>
              <div className="font-mono text-lg font-bold text-slate-900 tabular-nums mt-0.5">
                {formatCompactNumber(
                  mobilePerfData.reduce((s, r) => s + r.followersNum, 0)
                )}
              </div>
              <div className="text-[10px] text-emerald-700 font-medium">
                Across 6 platforms
              </div>
            </div>
            <div className="bg-white border border-stone-200 rounded-2xl p-3">
              <div className="text-[10px] font-semibold text-slate-500">Avg Engagement</div>
              <div className="font-mono text-lg font-bold text-emerald-700 tabular-nums mt-0.5">
                {mobilePerfData.length > 0
                  ? (
                      mobilePerfData.reduce((s, r) => s + r.engagementRate, 0) /
                      mobilePerfData.length
                    ).toFixed(2)
                  : '0.0'}
                %
              </div>
              <div className="text-[10px] text-slate-500">
                High-intent book crowd
              </div>
            </div>
          </div>

          {/* Mobile Recharts Scatter Matrix: Engagement vs. Followers */}
          <div className="bg-white border border-stone-200 rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-sm font-bold text-slate-900">
                  Engagement (%) vs. Followers (K)
                </h2>
                <p className="text-[11px] text-slate-500">
                  Tap any bubble to open the creator&rsquo;s outreach dossier
                </p>
              </div>
              <span className="font-mono text-[10px] font-semibold text-indigo-700">
                {mobilePerfData.length}/40 Records
              </span>
            </div>

            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    type="number"
                    dataKey="followersK"
                    name="Followers"
                    unit="K"
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="engagementRate"
                    name="Engagement"
                    unit="%"
                    tick={{ fontSize: 10 }}
                  />
                  <ZAxis type="number" dataKey="impactScore" range={[45, 180]} />
                  <ReferenceLine x={65} stroke="#6366f1" strokeDasharray="3 3" />
                  <ReferenceLine y={6.8} stroke="#059669" strokeDasharray="3 3" />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-slate-900 text-white p-2.5 rounded-xl text-[11px] shadow-lg">
                          <div className="font-bold">
                            #{d.rank} {d.name} ({d.handle})
                          </div>
                          <div className="font-mono text-emerald-300">
                            {d.creator.followersCount} · {d.creator.avgEngagementRate} ER · Score {d.impactScore}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Scatter
                    data={mobilePerfData}
                    onClick={(pt: any) => {
                      if (pt?.id) {
                        onSelectCreator(pt.id);
                        setMobileDossierCreatorId(pt.id);
                      }
                    }}
                  >
                    {mobilePerfData.map((entry) => (
                      <Cell key={entry.id} fill={getDotColor(entry.teamTake)} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            {/* Top 10 Mobile Bar Breakdown */}
            <div className="pt-2 border-t border-stone-200 space-y-1.5">
              <div className="text-xs font-semibold text-slate-800">
                Top 10 Outreach Impact Leaders (ER % vs. Impact)
              </div>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={mobilePerfData.slice(0, 10)}
                    margin={{ top: 6, right: 6, left: -20, bottom: 24 }}
                  >
                    <XAxis
                      dataKey="shortName"
                      tick={{ fontSize: 9 }}
                      angle={-25}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Bar dataKey="impactScore" name="Impact Score" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Mobile Sort & Filter Controls */}
          <div className="bg-white border border-stone-200 rounded-2xl p-3 space-y-2">
            <div className="grid grid-cols-3 gap-1 p-1 bg-stone-100 rounded-xl text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setPerfSort('impact')}
                className={`min-h-[38px] rounded-lg ${
                  perfSort === 'impact' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                By Impact
              </button>
              <button
                type="button"
                onClick={() => setPerfSort('engagement')}
                className={`min-h-[38px] rounded-lg ${
                  perfSort === 'engagement' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                By ER %
              </button>
              <button
                type="button"
                onClick={() => setPerfSort('followers')}
                className={`min-h-[38px] rounded-lg ${
                  perfSort === 'followers' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                By Reach
              </button>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              {(['all', 'Strong fit', 'Maybe', 'Not a fit'] as const).map((take) => (
                <button
                  key={take}
                  type="button"
                  onClick={() => setPerfTakeFilter(take)}
                  className={`min-h-[36px] px-3 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap border ${
                    perfTakeFilter === take
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-stone-50 text-slate-700 border-stone-200'
                  }`}
                >
                  {take === 'all' ? 'All Takes (40)' : take}
                </button>
              ))}
            </div>
          </div>

          {/* Granular 40-Creator Mobile Performance Cards */}
          <div className="space-y-2.5">
            {mobilePerfData.map((item) => (
              <div
                key={item.id}
                onClick={() => {
                  onSelectCreator(item.id);
                  setMobileDossierCreatorId(item.id);
                }}
                className="bg-white border border-stone-200 rounded-2xl p-3.5 space-y-2 active:scale-[0.99] transition-transform"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-bold text-indigo-700 tabular-nums">
                        #{item.rank}
                      </span>
                      <span className="font-display text-sm font-bold text-slate-900">
                        {item.name}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-slate-500">{item.handle}</div>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-xs font-bold text-indigo-700 tabular-nums">
                      Impact {item.impactScore}/100
                    </div>
                    <div className="text-[11px] font-semibold text-emerald-700 tabular-nums">
                      {item.creator.followersCount} · {item.creator.avgEngagementRate} ER
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1.5 border-t border-stone-100 text-[11px]">
                  <span className="font-mono text-slate-600 tabular-nums">
                    ~{formatCompactNumber(item.engagedReaders)} engaged/post · {item.teamTake}
                  </span>
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => onCopyComment(item.creator)}
                      className="min-h-[38px] px-2.5 py-1 font-medium text-slate-700 bg-stone-100 border border-stone-300 rounded-lg"
                    >
                      Copy @Bree
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectCreator(item.id);
                        setMobileDossierCreatorId(item.id);
                      }}
                      className="min-h-[38px] px-2.5 py-1 font-semibold text-white bg-indigo-600 rounded-lg"
                    >
                      Inspect
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MOBILE PAGE 2: NOTION DESK & CREATOR QUEUE */}
      {activeView === 'notion-desk' && (
        <div className="space-y-3.5">
          {/* Mobile 4-Mode Tone Switcher & Search */}
          <div className="bg-white border border-stone-200 rounded-2xl p-3.5 space-y-3 shadow-xs">
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-700">
                4-Mode Project Tone Switcher (#1–#3 Locked · #4–#40 Fatigue)
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {PROJECT_TONE_MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onSwitchProjectTone(m.id)}
                    className={`min-h-[40px] px-2.5 py-1.5 text-[11px] font-semibold rounded-xl border text-left transition-colors ${
                      projectToneMode === m.id
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-stone-50 text-slate-700 border-stone-200'
                    }`}
                  >
                    {m.shortLabel}
                  </button>
                ))}
              </div>
            </div>

            {/* Queue Filter Tabs */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-stone-100 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setMobileQueueFilter('all')}
                className={`min-h-[38px] rounded-lg transition-colors ${
                  mobileQueueFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600'
                }`}
              >
                All ({creators.length})
              </button>
              <button
                type="button"
                onClick={() => setMobileQueueFilter('first-10')}
                className={`min-h-[38px] rounded-lg transition-colors ${
                  mobileQueueFilter === 'first-10'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600'
                }`}
              >
                First 10
              </button>
              <button
                type="button"
                onClick={() => setMobileQueueFilter('conflicts')}
                className={`min-h-[38px] rounded-lg transition-colors flex items-center justify-center gap-1 ${
                  mobileQueueFilter === 'conflicts'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600'
                }`}
              >
                <AlertTriangle className="w-3 h-3 text-amber-600" />
                <span>Flags ({conflicts.length})</span>
              </button>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Search creator name, handle, or niche..."
                className="w-full pl-8 pr-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-xl"
              />
            </div>
          </div>

          {/* Mobile Creator Cards */}
          <div className="space-y-2.5">
            {filteredQueue.map((c) => (
              <div
                key={c.id}
                className={`border rounded-2xl p-3.5 space-y-2.5 transition-all ${
                  selectedCreatorId === c.id
                    ? 'border-indigo-600 bg-indigo-50/20 shadow-xs'
                    : 'border-stone-200 bg-white'
                }`}
              >
                <div
                  className="flex items-start justify-between gap-2 cursor-pointer"
                  onClick={() => {
                    onSelectCreator(c.id);
                    setMobileDossierCreatorId(c.id);
                  }}
                >
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-xs font-semibold text-slate-500 tabular-nums">
                        #{c.rank}
                      </span>
                      <span className="font-display text-sm font-bold text-slate-900">
                        {c.name}
                      </span>
                      <span className="text-xs text-slate-500 font-mono">{c.handle}</span>
                      {c.rank <= 3 && (
                        <span className="text-[10px] font-semibold text-amber-800">
                          · Ref #{c.rank}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-1">
                      {c.followersCount} · {c.avgEngagementRate} ER · {c.niche}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-bold shrink-0 ${
                      c.teamTake === 'Strong fit'
                        ? 'text-emerald-700'
                        : c.teamTake === 'Maybe'
                        ? 'text-amber-700'
                        : 'text-rose-700'
                    }`}
                  >
                    {c.teamTake}
                  </span>
                </div>

                {/* @Bree Comment Preview */}
                <div
                  onClick={() => {
                    onSelectCreator(c.id);
                    setMobileDossierCreatorId(c.id);
                  }}
                  className="p-2.5 rounded-xl bg-stone-50 border border-stone-200 text-xs font-mono text-slate-700 line-clamp-3 leading-relaxed cursor-pointer"
                >
                  {c.vettingDossier.formattedNotionComment}
                </div>

                {/* Touch-Friendly Action Strip */}
                <div className="flex items-center justify-between pt-1 border-t border-stone-100 gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onRunSingleVet(c)}
                      className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-xl flex items-center gap-1"
                    >
                      <Play className="w-3 h-3" />
                      <span>Vet</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onCopyComment(c)}
                      className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-slate-700 bg-stone-100 border border-stone-300 rounded-xl flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy @Bree</span>
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectCreator(c.id);
                      setMobileDossierCreatorId(c.id);
                    }}
                    className="min-h-[40px] px-2.5 py-1.5 text-xs font-semibold text-indigo-700 flex items-center gap-0.5"
                  >
                    <span>Open Dossier</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MOBILE PAGE 3: GOOGLE SHEETS & 27-COLUMN NOTION DB */}
      {activeView === 'spreadsheet' && (
        <div className="space-y-3.5">
          <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
              <FileSpreadsheet className="w-4 h-4" />
              <span>27-COLUMN NOTION DB &amp; SPREADSHEET SYNC</span>
            </div>
            <h2 className="font-display text-base font-bold text-slate-900">
              Mobile 27-Column Database Inspector ({creators.length} Rows)
            </h2>
            <p className="text-xs text-slate-600">
              Syncs all 27 AI agent fields (Identity, Discovered Post Links, 13-Competitor Ties, 5 Evaluation Answers, and @Bree Comment) between Google Sheets and Notion.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => onOpenSyncModal(creators)}
                className="min-h-[44px] px-3 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-xl flex items-center justify-center gap-1.5"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Sync All 40 to DB</span>
              </button>
              {onExportCSV && (
                <button
                  type="button"
                  onClick={onExportCSV}
                  className="min-h-[44px] px-3 py-2 text-xs font-semibold text-slate-800 bg-stone-100 border border-stone-300 rounded-xl flex items-center justify-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  <span>Export 27-Col CSV</span>
                </button>
              )}
            </div>
          </div>

          {/* Mobile Creator Selector for 27-Column Row Inspection */}
          <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3">
            <label className="block text-xs font-semibold text-slate-800">
              Inspect 27 Formatted Columns for Creator:
            </label>
            <select
              value={selectedCreator.id}
              onChange={(e) => onSelectCreator(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 text-xs font-semibold bg-stone-50 border border-stone-300 rounded-xl"
            >
              {creators.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.rank} {c.name} ({c.handle}) — {c.teamTake}
                </option>
              ))}
            </select>

            <div className="divide-y divide-stone-200 border border-stone-200 rounded-xl max-h-96 overflow-y-auto bg-stone-50/50">
              {AGENT_DB_SCHEMA_COLUMNS.map((col, idx) => {
                const row = formatCreatorForDatabaseRow(selectedCreator, ['YouTube', 'TikTok', 'Instagram', 'Substack']);
                return (
                  <div key={col.columnName} className="p-2.5 text-xs space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900">
                        {String(idx + 1).padStart(2, '0')}. {col.columnName}
                      </span>
                      <span className="font-mono text-[10px] text-indigo-700">
                        {col.notionType}
                      </span>
                    </div>
                    <p className="font-mono text-[11px] text-slate-600 line-clamp-3">
                      {row[col.columnName] || '—'}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MOBILE PAGE 4: COMPETITOR WATCHLIST RADAR */}
      {activeView === 'competitor-radar' && (
        <div className="space-y-3.5">
          <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-2">
            <h2 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-600" />
              <span>13-Competitor Conflict Watchlist</span>
            </h2>
            <p className="text-xs text-slate-600">
              Review flagged ties across Fable, Kindle, Audible, Kobo, Libro.fm, Storytel, and BookBeat. Tap Proceed Anyway or Archive to resolve.
            </p>
          </div>

          {conflicts.length === 0 ? (
            <div className="p-8 text-center bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2">
              <Check className="w-6 h-6 text-emerald-600 mx-auto" />
              <h3 className="font-display text-sm font-bold text-slate-900">
                All Conflicts Resolved!
              </h3>
            </div>
          ) : (
            conflicts.map((c) => (
              <div
                key={c.id}
                className="bg-white border border-amber-300 rounded-2xl p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-display text-sm font-bold text-slate-900">
                      #{c.rank} {c.name} ({c.handle})
                    </span>
                    <div className="text-[11px] text-slate-500">{c.niche}</div>
                  </div>
                  <span className="text-[11px] font-semibold text-amber-800">
                    {c.verdict}
                  </span>
                </div>

                <p className="text-xs text-amber-900 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                  {c.flagNote || c.researchNotes}
                </p>

                {c.competitorTies.map((t, idx) => (
                  <div key={idx} className="text-xs text-slate-700">
                    <strong>{t.company}</strong> ({t.relationshipType} · {t.activeConflictRisk} Risk): {t.details}
                  </div>
                ))}

                <div className="grid grid-cols-3 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectCreator(c.id);
                      setMobileDossierCreatorId(c.id);
                    }}
                    className="min-h-[42px] text-xs font-semibold text-slate-800 bg-stone-100 border border-stone-300 rounded-xl"
                  >
                    Dossier
                  </button>
                  {onProceedConflict && (
                    <button
                      type="button"
                      onClick={() => onProceedConflict(c)}
                      className="min-h-[42px] text-xs font-semibold text-white bg-indigo-600 rounded-xl"
                    >
                      Proceed
                    </button>
                  )}
                  {onArchiveConflict && (
                    <button
                      type="button"
                      onClick={() => onArchiveConflict(c)}
                      className="min-h-[42px] text-xs font-semibold text-white bg-slate-800 rounded-xl"
                    >
                      Archive
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* MOBILE PAGE 5: WORKSPACE SCANNER & 5 VETTING QUESTIONS */}
      {(activeView === 'workspace-scanner' || activeView === 'boss-questions') && (
        <div className="space-y-3.5">
          <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-slate-900">
                Step 0: Notion Workspace Index
              </h2>
              {onScanWorkspace && (
                <button
                  type="button"
                  onClick={onScanWorkspace}
                  disabled={isScanningWorkspace}
                  className="min-h-[40px] px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-xl flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isScanningWorkspace ? 'animate-spin' : ''}`} />
                  <span>{isScanningWorkspace ? 'Scanning...' : 'Re-Scan'}</span>
                </button>
              )}
            </div>
            {workspaceScan && (
              <>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {workspaceScan.missionObjective}
                </p>
                <div className="space-y-1.5 pt-1">
                  {workspaceScan.vettingProtocolRules.slice(0, 4).map((rule, i) => (
                    <div key={i} className="p-2.5 rounded-xl bg-stone-50 border border-stone-200 text-xs text-slate-700">
                      <span className="font-mono font-bold text-slate-400 mr-1.5">0{i + 1}.</span>
                      {rule}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {questions && onUpdateQuestions && (
            <div className="bg-white border border-stone-200 rounded-2xl p-4 space-y-3">
              <h3 className="font-display text-sm font-bold text-slate-900">
                5 Executive Vetting Questions
              </h3>
              {(['q1', 'q2', 'q3', 'q4', 'q5'] as const).map((key, idx) => (
                <div key={key} className="space-y-1">
                  <label className="block text-[11px] font-semibold text-slate-600">
                    Question #{idx + 1}
                  </label>
                  <input
                    type="text"
                    value={questions[key]}
                    onChange={(e) => onUpdateQuestions({ ...questions, [key]: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-stone-50 border border-stone-300 rounded-xl"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MOBILE DOSSIER BOTTOM SHEET DRAWER (Opens when any creator is tapped on Mobile) */}
      {activeDossierCreator && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end justify-center">
          <div className="bg-white w-full max-w-[430px] rounded-t-3xl border-t border-stone-200 max-h-[88vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="w-10 h-1.5 bg-stone-300 rounded-full mx-auto my-2.5 shrink-0" />
            <div className="px-4 pb-3 border-b border-stone-200 flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs font-bold text-indigo-700">
                    #{activeDossierCreator.rank}
                  </span>
                  <h3 className="font-display text-base font-bold text-slate-900">
                    {activeDossierCreator.name}
                  </h3>
                  <span className="font-mono text-xs text-slate-500">
                    {activeDossierCreator.handle}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  {activeDossierCreator.followersCount} Followers · {activeDossierCreator.avgEngagementRate} ER · Take: {activeDossierCreator.teamTake}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMobileDossierCreatorId(null)}
                className="min-h-[40px] min-w-[40px] rounded-full bg-stone-100 flex items-center justify-center text-slate-600"
                aria-label="Close mobile dossier"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3.5 text-xs">
              {/* Tone selector & Quick Team Take */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                    Team Take
                  </label>
                  <select
                    value={activeDossierCreator.teamTake}
                    onChange={(e) =>
                      onUpdateCreatorField?.(activeDossierCreator.id, {
                        teamTake: e.target.value as TeamTakeType
                      })
                    }
                    className="w-full min-h-[40px] px-2.5 py-1.5 text-xs font-semibold bg-stone-50 border border-stone-300 rounded-xl"
                  >
                    <option value="Strong fit">Strong fit</option>
                    <option value="Maybe">Maybe</option>
                    <option value="Not a fit">Not a fit</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                    Creator Voice
                  </label>
                  <select
                    value={
                      activeDossierCreator.toneOverride ||
                      (activeDossierCreator.rank <= 3 ? 'reference-locked' : projectToneMode)
                    }
                    onChange={(e) =>
                      onOverrideCreatorTone(
                        activeDossierCreator.id,
                        e.target.value as ProjectToneMode | 'reference-locked'
                      )
                    }
                    className="w-full min-h-[40px] px-2.5 py-1.5 text-xs font-semibold bg-stone-50 border border-stone-300 rounded-xl"
                  >
                    {activeDossierCreator.rank <= 3 && (
                      <option value="reference-locked">Reference Locked</option>
                    )}
                    {PROJECT_TONE_MODES.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.shortLabel}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Staged @Bree Comment */}
              <div className="space-y-1">
                <div className="font-semibold text-slate-800">
                  Staged @Bree Notion Comment
                </div>
                <textarea
                  rows={5}
                  value={activeDossierCreator.vettingDossier.formattedNotionComment}
                  onChange={(e) =>
                    onUpdateCreatorField?.(activeDossierCreator.id, {
                      vettingDossier: {
                        ...activeDossierCreator.vettingDossier,
                        formattedNotionComment: e.target.value
                      }
                    })
                  }
                  className="w-full p-3 font-mono text-[11px] bg-stone-50 border border-stone-300 rounded-xl leading-relaxed"
                />
              </div>

              {/* 5 Answers Summary */}
              <div className="space-y-2">
                <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200">
                  <div className="font-semibold text-slate-900">1. Watched / Read</div>
                  <p className="text-slate-700 mt-0.5">{activeDossierCreator.vettingDossier.watchedOrRead}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200">
                  <div className="font-semibold text-slate-900">2. Audience Profile</div>
                  <p className="text-slate-700 mt-0.5">{activeDossierCreator.vettingDossier.audienceProfile}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200">
                  <div className="font-semibold text-slate-900">3. Apps, E-Readers &amp; AI</div>
                  <p className="text-slate-700 mt-0.5">{activeDossierCreator.vettingDossier.readingAppsEreadersAndAI}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200">
                  <div className="font-semibold text-slate-900">4. Competitor Ties</div>
                  <p className="text-slate-700 mt-0.5">{activeDossierCreator.vettingDossier.competitorTiesAnalysis}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200">
                  <div className="font-semibold text-slate-900">5. Recommend Chromatics &amp; Lead Hook</div>
                  <p className="text-slate-700 mt-0.5">{activeDossierCreator.vettingDossier.outreachLeadHook}</p>
                </div>
              </div>
            </div>

            <div className="p-3.5 bg-stone-50 border-t border-stone-200 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => onCopyComment(activeDossierCreator)}
                className="min-h-[44px] text-xs font-semibold text-slate-800 bg-white border border-stone-300 rounded-xl flex items-center justify-center gap-1"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy @Bree</span>
              </button>
              <button
                type="button"
                onClick={() => onFastFail(activeDossierCreator)}
                className="min-h-[44px] text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl"
              >
                10m Fast-Fail
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileDossierCreatorId(null);
                  onOpenSyncModal([activeDossierCreator]);
                }}
                className="min-h-[44px] text-xs font-semibold text-white bg-indigo-600 rounded-xl flex items-center justify-center gap-1"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Sync DB</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fixed Bottom Thumb-Zone Navigation Bar (5 Primary Views, >= 44px Hitboxes) */}
      <nav
        aria-label="Mobile Navigation"
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200 px-2 py-1.5 grid grid-cols-5 items-center shadow-lg"
      >
        <button
          type="button"
          onClick={() => onSwitchView('notion-desk')}
          className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium rounded-xl transition-colors ${
            activeView === 'notion-desk' ? 'text-indigo-600 font-bold' : 'text-slate-600'
          }`}
        >
          <User className="w-4 h-4" />
          <span>Notion Desk</span>
        </button>

        <button
          type="button"
          onClick={() => onSwitchView('performance-dashboard')}
          className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium rounded-xl transition-colors ${
            activeView === 'performance-dashboard'
              ? 'text-indigo-600 font-bold'
              : 'text-slate-600'
          }`}
        >
          <BarChart3 className="w-4 h-4 text-indigo-600" />
          <span>Performance</span>
        </button>

        <button
          type="button"
          onClick={() => onSwitchView('spreadsheet')}
          className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium rounded-xl transition-colors ${
            activeView === 'spreadsheet' ? 'text-indigo-600 font-bold' : 'text-slate-600'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          <span>27-Col DB</span>
        </button>

        <button
          type="button"
          onClick={() => onSwitchView('competitor-radar')}
          className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium rounded-xl transition-colors ${
            activeView === 'competitor-radar' ? 'text-indigo-600 font-bold' : 'text-slate-600'
          }`}
        >
          <BookOpen className="w-4 h-4 text-amber-600" />
          <span>Radar ({conflicts.length})</span>
        </button>

        <button
          type="button"
          onClick={() => onSwitchView('workspace-scanner')}
          className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium rounded-xl transition-colors ${
            activeView === 'workspace-scanner' || activeView === 'boss-questions'
              ? 'text-indigo-600 font-bold'
              : 'text-slate-600'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Workspace</span>
        </button>
      </nav>
    </div>
  );
}
