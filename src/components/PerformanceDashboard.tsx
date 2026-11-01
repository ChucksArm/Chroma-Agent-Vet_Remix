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
  ComposedChart,
  Bar,
  Line,
  BarChart,
  ReferenceLine,
  Cell,
  Legend
} from 'recharts';
import {
  TrendingUp,
  Users,
  Zap,
  Target,
  Search,
  ExternalLink,
  Copy,
  Check,
  ShieldCheck,
  ArrowUpRight,
  SlidersHorizontal,
  Award,
  Sparkles,
  BarChart3
} from 'lucide-react';
import { CreatorRecord, SocialPlatformType, TeamTakeType } from '../types';

export type OutreachQuadrantType =
  | 'High-Velocity Powerhouse'
  | 'Hyper-Engaged Micro Gem'
  | 'Broad Reach Anchor'
  | 'Monitor / Low Priority';

export interface EnrichedCreatorPerformance {
  creator: CreatorRecord;
  rank: number;
  name: string;
  shortName: string;
  handle: string;
  followersNum: number;
  followersK: number;
  engagementRateNum: number;
  engagedReadersPerPost: number;
  outreachImpactScore: number;
  quadrant: OutreachQuadrantType;
  hasActiveConflict: boolean;
  teamTake: TeamTakeType;
  primaryPlatform: SocialPlatformType;
}

export function parseFollowersCount(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw.trim().toUpperCase().replace(/,/g, '');
  const match = cleaned.match(/^([\d.]+)\s*([KMB])?$/);
  if (!match) {
    const num = parseFloat(cleaned.replace(/[^0-9.]/g, ''));
    return isNaN(num) ? 0 : num;
  }
  const val = parseFloat(match[1]);
  const unit = match[2];
  if (unit === 'M') return Math.round(val * 1_000_000);
  if (unit === 'K') return Math.round(val * 1_000);
  if (unit === 'B') return Math.round(val * 1_000_000_000);
  return Math.round(val);
}

export function parseEngagementRate(raw: string): number {
  if (!raw) return 0;
  const num = parseFloat(raw.replace(/[^0-9.]/g, ''));
  return isNaN(num) ? 0 : Number(num.toFixed(2));
}

export function formatCompactNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}

interface PerformanceDashboardProps {
  creators: CreatorRecord[];
  selectedCreatorId: string;
  onSelectCreator: (creatorId: string) => void;
  onOpenDossierInDesk: (creator: CreatorRecord) => void;
  onCopyNotionComment: (creator: CreatorRecord) => void;
  onRequestPublishConfirmation: (creatorsToSync: CreatorRecord[]) => void;
  copiedId: string | null;
}

export default function PerformanceDashboard({
  creators,
  selectedCreatorId,
  onSelectCreator,
  onOpenDossierInDesk,
  onCopyNotionComment,
  onRequestPublishConfirmation,
  copiedId
}: PerformanceDashboardProps) {
  const [quadrantFilter, setQuadrantFilter] = useState<string>('all');
  const [teamTakeFilter, setTeamTakeFilter] = useState<string>('all');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [cohortScope, setCohortScope] = useState<'all-40' | 'first-10' | 'zero-conflict'>('all-40');
  const [sortBy, setSortBy] = useState<
    'impact-score' | 'engagement-desc' | 'followers-desc' | 'engaged-readers' | 'rank-asc'
  >('impact-score');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [breakdownViewMode, setBreakdownViewMode] = useState<'all-40' | 'top-20-impact' | 'first-10'>('all-40');
  const [selectedForOutreachIds, setSelectedForOutreachIds] = useState<string[]>([]);

  // Compute medians and enrich all 40 records
  const { enrichedRecords, medianFollowersK, medianEngagement, avgEngagement, totalReach, totalEngagedPerPost } =
    useMemo(() => {
      const parsed = creators.map((c) => {
        const followersNum = parseFollowersCount(c.followersCount);
        const followersK = Number((followersNum / 1000).toFixed(1));
        const engagementRateNum = parseEngagementRate(c.avgEngagementRate);
        const engagedReadersPerPost = Math.round(followersNum * (engagementRateNum / 100));
        return {
          creator: c,
          followersNum,
          followersK,
          engagementRateNum,
          engagedReadersPerPost
        };
      });

      const sortedFollowers = [...parsed].map((p) => p.followersK).sort((a, b) => a - b);
      const sortedEng = [...parsed].map((p) => p.engagementRateNum).sort((a, b) => a - b);
      const mid = Math.floor(parsed.length / 2);

      const medFollowersK =
        parsed.length > 0
          ? Number(((sortedFollowers[mid - 1] + sortedFollowers[mid]) / 2).toFixed(1))
          : 65;
      const medEng =
        parsed.length > 0
          ? Number(((sortedEng[mid - 1] + sortedEng[mid]) / 2).toFixed(2))
          : 6.8;

      const maxEngaged = Math.max(...parsed.map((p) => p.engagedReadersPerPost), 1);
      const maxEngRate = Math.max(...parsed.map((p) => p.engagementRateNum), 1);

      const enriched: EnrichedCreatorPerformance[] = parsed.map((item) => {
        const { creator, followersNum, followersK, engagementRateNum, engagedReadersPerPost } = item;
        const hasActiveConflict =
          creator.verdict === 'Possible conflict' ||
          Boolean(creator.flagNote && /conflict|audible|fable|kobo/i.test(creator.flagNote)) ||
          creator.competitorTies.some((t) => t.activeConflictRisk !== 'Low');

        let quadrant: OutreachQuadrantType = 'Monitor / Low Priority';
        if (creator.teamTake === 'Not a fit') {
          quadrant = 'Monitor / Low Priority';
        } else if (followersK >= medFollowersK && engagementRateNum >= medEng) {
          quadrant = 'High-Velocity Powerhouse';
        } else if (followersK < medFollowersK && engagementRateNum >= medEng) {
          quadrant = 'Hyper-Engaged Micro Gem';
        } else if (followersK >= medFollowersK && engagementRateNum < medEng) {
          quadrant = 'Broad Reach Anchor';
        }

        // Composite Outreach Impact Score (0 - 100)
        const engComponent = (engagementRateNum / maxEngRate) * 42;
        const volumeComponent = (engagedReadersPerPost / maxEngaged) * 33;
        const fitBonus =
          creator.teamTake === 'Strong fit' ? 18 : creator.teamTake === 'Maybe' ? 7 : -25;
        const conflictAdjustment = hasActiveConflict ? -8 : 7;
        const rawScore = Math.round(
          Math.max(12, Math.min(99, engComponent + volumeComponent + fitBonus + conflictAdjustment))
        );

        const shortName = creator.name.replace(/\s*\(.*?\)\s*/g, '').trim();

        return {
          creator,
          rank: creator.rank,
          name: creator.name,
          shortName: shortName.length > 14 ? `${shortName.slice(0, 12)}…` : shortName,
          handle: creator.handle,
          followersNum,
          followersK,
          engagementRateNum,
          engagedReadersPerPost,
          outreachImpactScore: rawScore,
          quadrant,
          hasActiveConflict,
          teamTake: creator.teamTake,
          primaryPlatform: creator.platforms[0] || 'TikTok'
        };
      });

      const totReach = enriched.reduce((acc, r) => acc + r.followersNum, 0);
      const totEngaged = enriched.reduce((acc, r) => acc + r.engagedReadersPerPost, 0);
      const avgEng =
        enriched.length > 0
          ? Number(
              (
                enriched.reduce((acc, r) => acc + r.engagementRateNum, 0) / enriched.length
              ).toFixed(2)
            )
          : 0;

      return {
        enrichedRecords: enriched,
        medianFollowersK: medFollowersK,
        medianEngagement: medEng,
        avgEngagement: avgEng,
        totalReach: totReach,
        totalEngagedPerPost: totEngaged
      };
    }, [creators]);

  // Filtered and sorted records
  const filteredRecords = useMemo(() => {
    return enrichedRecords
      .filter((r) => {
        if (quadrantFilter !== 'all' && r.quadrant !== quadrantFilter) return false;
        if (teamTakeFilter !== 'all' && r.teamTake !== teamTakeFilter) return false;
        if (
          platformFilter !== 'all' &&
          !r.creator.platforms.includes(platformFilter as SocialPlatformType)
        ) {
          return false;
        }
        if (cohortScope === 'first-10' && !r.creator.isTopTenPriority) return false;
        if (cohortScope === 'zero-conflict' && r.hasActiveConflict) return false;
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          r.name.toLowerCase().includes(q) ||
          r.handle.toLowerCase().includes(q) ||
          r.creator.niche.toLowerCase().includes(q) ||
          r.quadrant.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'impact-score') return b.outreachImpactScore - a.outreachImpactScore;
        if (sortBy === 'engagement-desc') return b.engagementRateNum - a.engagementRateNum;
        if (sortBy === 'followers-desc') return b.followersNum - a.followersNum;
        if (sortBy === 'engaged-readers') return b.engagedReadersPerPost - a.engagedReadersPerPost;
        return a.rank - b.rank;
      });
  }, [
    enrichedRecords,
    quadrantFilter,
    teamTakeFilter,
    platformFilter,
    cohortScope,
    searchQuery,
    sortBy
  ]);

  // Granular bar/line chart dataset
  const granularChartData = useMemo(() => {
    let base = [...filteredRecords];
    if (breakdownViewMode === 'top-20-impact') {
      base = [...enrichedRecords]
        .sort((a, b) => b.outreachImpactScore - a.outreachImpactScore)
        .slice(0, 20);
    } else if (breakdownViewMode === 'first-10') {
      base = enrichedRecords.filter((r) => r.creator.isTopTenPriority).sort((a, b) => a.rank - b.rank);
    }
    return base.map((r) => ({
      id: r.creator.id,
      rankLabel: `#${r.rank} ${r.shortName}`,
      fullName: r.name,
      handle: r.handle,
      followersK: r.followersK,
      engagementRate: r.engagementRateNum,
      engagedReaders: r.engagedReadersPerPost,
      impactScore: r.outreachImpactScore,
      teamTake: r.teamTake,
      quadrant: r.quadrant
    }));
  }, [filteredRecords, enrichedRecords, breakdownViewMode]);

  // Follower Tier Aggregation Data
  const followerTierData = useMemo(() => {
    const tiers = [
      { tier: 'Micro (<50K)', min: 0, max: 50000 },
      { tier: 'Mid-Tier (50K–85K)', min: 50000, max: 85000 },
      { tier: 'Growth (85K–120K)', min: 85000, max: 120000 },
      { tier: 'Macro (120K+)', min: 120000, max: Infinity }
    ];
    return tiers.map((t) => {
      const matching = enrichedRecords.filter(
        (r) => r.followersNum >= t.min && r.followersNum < t.max
      );
      const avgER =
        matching.length > 0
          ? Number(
              (
                matching.reduce((sum, r) => sum + r.engagementRateNum, 0) / matching.length
              ).toFixed(2)
            )
          : 0;
      const avgImpact =
        matching.length > 0
          ? Math.round(
              matching.reduce((sum, r) => sum + r.outreachImpactScore, 0) / matching.length
            )
          : 0;
      const strongFitCount = matching.filter((r) => r.teamTake === 'Strong fit').length;
      return {
        tier: t.tier,
        creatorsCount: matching.length,
        avgEngagementRate: avgER,
        avgImpactScore: avgImpact,
        strongFitCount
      };
    });
  }, [enrichedRecords]);

  // Platform Efficiency Data
  const platformPerformanceData = useMemo(() => {
    const platforms: SocialPlatformType[] = [
      'YouTube',
      'TikTok',
      'Instagram',
      'Substack',
      'Twitter',
      'Blog'
    ];
    return platforms.map((plat) => {
      const matching = enrichedRecords.filter((r) => r.creator.platforms.includes(plat));
      const avgER =
        matching.length > 0
          ? Number(
              (
                matching.reduce((s, r) => s + r.engagementRateNum, 0) / matching.length
              ).toFixed(2)
            )
          : 0;
      const avgFollowersK =
        matching.length > 0
          ? Math.round(matching.reduce((s, r) => s + r.followersK, 0) / matching.length)
          : 0;
      const highImpactCount = matching.filter((r) => r.outreachImpactScore >= 75).length;
      return {
        platform: plat,
        creatorCount: matching.length,
        avgEngagementRate: avgER,
        avgFollowersK,
        highImpactCount
      };
    });
  }, [enrichedRecords]);

  // Quadrant counts
  const quadrantCounts = useMemo(() => {
    return {
      powerhouse: enrichedRecords.filter((r) => r.quadrant === 'High-Velocity Powerhouse').length,
      microGem: enrichedRecords.filter((r) => r.quadrant === 'Hyper-Engaged Micro Gem').length,
      broadAnchor: enrichedRecords.filter((r) => r.quadrant === 'Broad Reach Anchor').length,
      monitor: enrichedRecords.filter((r) => r.quadrant === 'Monitor / Low Priority').length
    };
  }, [enrichedRecords]);

  const selectedEnriched = useMemo(() => {
    return (
      enrichedRecords.find((r) => r.creator.id === selectedCreatorId) ||
      filteredRecords[0] ||
      enrichedRecords[0]
    );
  }, [enrichedRecords, filteredRecords, selectedCreatorId]);

  const handleToggleSelectCreatorForOutreach = (id: string) => {
    setSelectedForOutreachIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectTopHighImpactFits = () => {
    const topIds = filteredRecords
      .filter((r) => r.teamTake === 'Strong fit' && !r.hasActiveConflict)
      .slice(0, 10)
      .map((r) => r.creator.id);
    setSelectedForOutreachIds(topIds);
  };

  const handleSyncSelectedCohort = () => {
    const targetCreators =
      selectedForOutreachIds.length > 0
        ? creators.filter((c) => selectedForOutreachIds.includes(c.id))
        : filteredRecords.slice(0, 10).map((r) => r.creator);
    onRequestPublishConfirmation(targetCreators);
  };

  const getDotColor = (teamTake: TeamTakeType) => {
    if (teamTake === 'Strong fit') return '#059669'; // emerald-600
    if (teamTake === 'Maybe') return '#d97706'; // amber-600
    return '#e11d48'; // rose-600
  };

  return (
    <div className="space-y-6">
      {/* Top Executive Header & Outreach Prioritization Summary */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 sm:p-6 space-y-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-stone-200 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700">
              <BarChart3 className="w-4 h-4" />
              <span>GRANULAR 40-CREATOR PERFORMANCE &amp; OUTREACH PRIORITIZATION ENGINE</span>
            </div>
            <h2 className="font-display text-xl font-bold text-slate-900">
              Creator Engagement Rate vs. Follower Reach Matrix (All 40 Records)
            </h2>
            <p className="text-xs text-slate-600 max-w-3xl">
              Cross-analyzes follower scale, average post engagement rate, estimated engaged readers per upload, and competitor conflict risk across all 40 creators to isolate high-conversion outreach targets for Chromatics iOS.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleSelectTopHighImpactFits}
              className="px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Select Top 10 High-Impact Fits</span>
            </button>
            <button
              type="button"
              onClick={handleSyncSelectedCohort}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                {selectedForOutreachIds.length > 0
                  ? `Sync ${selectedForOutreachIds.length} Prioritized to Notion DB`
                  : 'Sync Top 10 Impact Cohort to Notion'}
              </span>
            </button>
          </div>
        </div>

        {/* 4 Quadrant KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <button
            type="button"
            onClick={() =>
              setQuadrantFilter(
                quadrantFilter === 'High-Velocity Powerhouse' ? 'all' : 'High-Velocity Powerhouse'
              )
            }
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
              quadrantFilter === 'High-Velocity Powerhouse'
                ? 'border-emerald-600 bg-emerald-50/50 shadow-xs'
                : 'border-stone-200 bg-stone-50/60 hover:bg-stone-100/70'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-semibold text-emerald-800">
              <span>01. High-Velocity Powerhouses</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1.5">
              {quadrantCounts.powerhouse} Creators
            </div>
            <p className="text-[11px] text-slate-600 mt-1">
              Followers &ge; {medianFollowersK}K &middot; Engagement &ge; {medianEngagement}% (Immediate Tier-1 Outreach)
            </p>
          </button>

          <button
            type="button"
            onClick={() =>
              setQuadrantFilter(
                quadrantFilter === 'Hyper-Engaged Micro Gem' ? 'all' : 'Hyper-Engaged Micro Gem'
              )
            }
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
              quadrantFilter === 'Hyper-Engaged Micro Gem'
                ? 'border-indigo-600 bg-indigo-50/50 shadow-xs'
                : 'border-stone-200 bg-stone-50/60 hover:bg-stone-100/70'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-semibold text-indigo-800">
              <span>02. Hyper-Engaged Micro Gems</span>
              <Zap className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1.5">
              {quadrantCounts.microGem} Creators
            </div>
            <p className="text-[11px] text-slate-600 mt-1">
              Followers &lt; {medianFollowersK}K &middot; Engagement &ge; {medianEngagement}% (Highest Reply &amp; Trial Conversion)
            </p>
          </button>

          <button
            type="button"
            onClick={() =>
              setQuadrantFilter(
                quadrantFilter === 'Broad Reach Anchor' ? 'all' : 'Broad Reach Anchor'
              )
            }
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
              quadrantFilter === 'Broad Reach Anchor'
                ? 'border-amber-600 bg-amber-50/50 shadow-xs'
                : 'border-stone-200 bg-stone-50/60 hover:bg-stone-100/70'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-semibold text-amber-800">
              <span>03. Broad Reach Anchors</span>
              <Users className="w-4 h-4 text-amber-600" />
            </div>
            <div className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1.5">
              {quadrantCounts.broadAnchor} Creators
            </div>
            <p className="text-[11px] text-slate-600 mt-1">
              Followers &ge; {medianFollowersK}K &middot; Engagement &lt; {medianEngagement}% (High Top-of-Funnel Awareness)
            </p>
          </button>

          <div className="p-4 rounded-xl border border-stone-200 bg-stone-50/60 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>04. Cohort Reach &amp; Engagement</span>
              <Target className="w-4 h-4 text-slate-600" />
            </div>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
                {formatCompactNumber(totalReach)}
              </span>
              <span className="font-mono text-xs text-emerald-700 font-semibold tabular-nums">
                {avgEngagement}% Avg ER
              </span>
            </div>
            <p className="text-[11px] text-slate-600 mt-1">
              ~{formatCompactNumber(totalEngagedPerPost)} active engaged book readers per upload cycle across 40 creators
            </p>
          </div>
        </div>

        {/* Interactive Filter & Sort Control Bar */}
        <div className="pt-2 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mr-1">
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
              <span>Filter:</span>
            </div>

            <select
              aria-label="Filter by Strategic Quadrant"
              value={quadrantFilter}
              onChange={(e) => setQuadrantFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-medium bg-stone-50 border border-stone-300 rounded-lg text-slate-800"
            >
              <option value="all">All 4 Strategic Quadrants (40)</option>
              <option value="High-Velocity Powerhouse">
                High-Velocity Powerhouses ({quadrantCounts.powerhouse})
              </option>
              <option value="Hyper-Engaged Micro Gem">
                Hyper-Engaged Micro Gems ({quadrantCounts.microGem})
              </option>
              <option value="Broad Reach Anchor">
                Broad Reach Anchors ({quadrantCounts.broadAnchor})
              </option>
              <option value="Monitor / Low Priority">
                Monitor / Low Priority ({quadrantCounts.monitor})
              </option>
            </select>

            <select
              aria-label="Filter by Team Take"
              value={teamTakeFilter}
              onChange={(e) => setTeamTakeFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-medium bg-stone-50 border border-stone-300 rounded-lg text-slate-800"
            >
              <option value="all">All Team Takes</option>
              <option value="Strong fit">Strong fit Only</option>
              <option value="Maybe">Maybe Only</option>
              <option value="Not a fit">Not a fit Only</option>
            </select>

            <select
              aria-label="Filter by Platform"
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs font-medium bg-stone-50 border border-stone-300 rounded-lg text-slate-800"
            >
              <option value="all">All Platforms</option>
              <option value="YouTube">YouTube</option>
              <option value="TikTok">TikTok</option>
              <option value="Instagram">Instagram</option>
              <option value="Substack">Substack</option>
              <option value="Twitter">Twitter</option>
              <option value="Blog">Blog</option>
            </select>

            <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-lg border border-stone-200 text-xs">
              <button
                type="button"
                onClick={() => setCohortScope('all-40')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  cohortScope === 'all-40'
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All 40
              </button>
              <button
                type="button"
                onClick={() => setCohortScope('first-10')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  cohortScope === 'first-10'
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                First 10 Priority
              </button>
              <button
                type="button"
                onClick={() => setCohortScope('zero-conflict')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  cohortScope === 'zero-conflict'
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Zero Brand Conflicts
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search creator, handle, niche..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:border-slate-900"
              />
            </div>

            <select
              aria-label="Sort creators by"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-2.5 py-1.5 text-xs font-semibold bg-stone-50 border border-stone-300 rounded-lg text-slate-800"
            >
              <option value="impact-score">Sort: Outreach Impact Score (High &rarr; Low)</option>
              <option value="engagement-desc">Sort: Engagement Rate % (High &rarr; Low)</option>
              <option value="followers-desc">Sort: Follower Count (High &rarr; Low)</option>
              <option value="engaged-readers">Sort: Est. Engaged Readers / Post</option>
              <option value="rank-asc">Sort: Queue Rank (#1 &rarr; #40)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Primary Row: Scatter Quadrant Chart (7 cols) + Active Selected Creator Outreach Spotlight (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Scatter Plot: Engagement Rate vs. Followers across 40 records */}
        <div className="lg:col-span-7 bg-white border border-stone-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-200 pb-3">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900">
                01. Engagement Rate (%) vs. Follower Count (K) Quadrant Matrix
              </h3>
              <p className="text-xs text-slate-600">
                Click any creator bubble to inspect their outreach dossier. Dashed lines mark the 40-creator median ({medianFollowersK}K followers &middot; {medianEngagement}% engagement).
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-medium shrink-0">
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" />
                Strong fit
              </span>
              <span className="inline-flex items-center gap-1 text-amber-700">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-600 inline-block" />
                Maybe
              </span>
              <span className="inline-flex items-center gap-1 text-rose-700">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block" />
                Not a fit
              </span>
            </div>
          </div>

          <div className="h-80 sm:h-96 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 16, right: 20, bottom: 24, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  type="number"
                  dataKey="followersK"
                  name="Followers"
                  unit="K"
                  tick={{ fontSize: 11 }}
                  label={{
                    value: 'Follower Count (Thousands)',
                    position: 'insideBottom',
                    offset: -12,
                    fontSize: 11,
                    fill: '#64748b'
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="engagementRateNum"
                  name="Avg Engagement"
                  unit="%"
                  tick={{ fontSize: 11 }}
                  domain={[0, 'dataMax + 1.2']}
                  label={{
                    value: 'Avg Engagement Rate (%)',
                    angle: -90,
                    position: 'insideLeft',
                    fontSize: 11,
                    fill: '#64748b'
                  }}
                />
                <ZAxis
                  type="number"
                  dataKey="outreachImpactScore"
                  range={[65, 320]}
                  name="Impact Score"
                />
                <ReferenceLine
                  x={medianFollowersK}
                  stroke="#6366f1"
                  strokeDasharray="4 4"
                  label={{
                    value: `Median ${medianFollowersK}K`,
                    position: 'top',
                    fontSize: 10,
                    fill: '#4f46e5'
                  }}
                />
                <ReferenceLine
                  y={medianEngagement}
                  stroke="#059669"
                  strokeDasharray="4 4"
                  label={{
                    value: `Median ${medianEngagement}% ER`,
                    position: 'right',
                    fontSize: 10,
                    fill: '#059669'
                  }}
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const data = payload[0].payload as EnrichedCreatorPerformance;
                    return (
                      <div className="bg-slate-900 text-white p-3 rounded-xl shadow-lg border border-slate-700 text-xs space-y-1.5 max-w-xs">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-display font-bold text-sm">
                            #{data.rank} {data.name}
                          </span>
                          <span className="font-mono text-amber-300 font-semibold">
                            Impact: {data.outreachImpactScore}/100
                          </span>
                        </div>
                        <div className="text-slate-300 font-mono text-[11px]">{data.handle}</div>
                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-700 font-mono text-[11px]">
                          <div>Followers: {data.creator.followersCount}</div>
                          <div>Engagement: {data.creator.avgEngagementRate}</div>
                          <div>Est. Engaged: ~{formatCompactNumber(data.engagedReadersPerPost)}</div>
                          <div>Take: {data.teamTake}</div>
                        </div>
                        <div className="text-[10px] text-indigo-300 pt-0.5">
                          Quadrant: {data.quadrant} (Click dot to inspect)
                        </div>
                      </div>
                    );
                  }}
                />
                <Scatter
                  name="Creators"
                  data={filteredRecords}
                  onClick={(point: any) => {
                    if (point?.creator?.id) {
                      onSelectCreator(point.creator.id);
                    }
                  }}
                  className="cursor-pointer"
                >
                  {filteredRecords.map((entry) => {
                    const isSelected = entry.creator.id === selectedEnriched?.creator.id;
                    return (
                      <Cell
                        key={entry.creator.id}
                        fill={getDotColor(entry.teamTake)}
                        stroke={isSelected ? '#0f172a' : '#ffffff'}
                        strokeWidth={isSelected ? 3 : 1.5}
                        fillOpacity={isSelected ? 1 : 0.85}
                      />
                    );
                  })}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 pt-2 border-t border-stone-200">
            <span>
              Showing <strong>{filteredRecords.length}</strong> of 40 creators &middot; Bubble size = Outreach Impact Score
            </span>
            <span className="font-mono">
              Top Quadrant: High-Velocity Powerhouses &amp; Hyper-Engaged Micro Gems
            </span>
          </div>
        </div>

        {/* Selected Creator Outreach Priority Spotlight Card */}
        {selectedEnriched && (
          <div className="lg:col-span-5 bg-white border border-stone-200 rounded-xl p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3 border-b border-stone-200 pb-3.5">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-indigo-700">
                      RANK #{selectedEnriched.rank}
                    </span>
                    <span className="text-xs text-slate-400" aria-hidden="true">
                      &middot;
                    </span>
                    <span className="text-xs font-semibold text-slate-700">
                      {selectedEnriched.quadrant}
                    </span>
                  </div>
                  <h3 className="font-display text-lg font-bold text-slate-900 mt-0.5">
                    {selectedEnriched.name}{' '}
                    <span className="font-mono text-xs font-normal text-slate-500">
                      ({selectedEnriched.handle})
                    </span>
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">{selectedEnriched.creator.niche}</p>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-[10px] font-semibold text-slate-500">Impact Score</div>
                  <div className="font-mono text-2xl font-bold text-indigo-700 tabular-nums">
                    {selectedEnriched.outreachImpactScore}
                    <span className="text-xs text-slate-400">/100</span>
                  </div>
                </div>
              </div>

              {/* 4 Tabular Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-200">
                  <div className="text-[10px] text-slate-500">Followers</div>
                  <div className="font-mono text-sm font-bold text-slate-900 tabular-nums mt-0.5">
                    {selectedEnriched.creator.followersCount}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-200">
                  <div className="text-[10px] text-slate-500">Avg Engagement</div>
                  <div className="font-mono text-sm font-bold text-emerald-700 tabular-nums mt-0.5">
                    {selectedEnriched.creator.avgEngagementRate}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-200">
                  <div className="text-[10px] text-slate-500">Engaged / Post</div>
                  <div className="font-mono text-sm font-bold text-slate-900 tabular-nums mt-0.5">
                    ~{formatCompactNumber(selectedEnriched.engagedReadersPerPost)}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-200">
                  <div className="text-[10px] text-slate-500">Team Take</div>
                  <div
                    className={`text-xs font-bold mt-0.5 ${
                      selectedEnriched.teamTake === 'Strong fit'
                        ? 'text-emerald-700'
                        : selectedEnriched.teamTake === 'Maybe'
                        ? 'text-amber-700'
                        : 'text-rose-700'
                    }`}
                  >
                    {selectedEnriched.teamTake}
                  </div>
                </div>
              </div>

              {/* Outreach Lead Hook & Why Recommend */}
              <div className="space-y-2.5 text-xs">
                <div className="p-3 rounded-lg bg-indigo-50/50 border border-indigo-100 space-y-1">
                  <div className="font-semibold text-indigo-950 flex items-center justify-between">
                    <span>Outreach Lead Hook (High-Impact Angle)</span>
                    <a
                      href={selectedEnriched.creator.mainLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-mono text-indigo-700 hover:underline inline-flex items-center gap-0.5"
                    >
                      <span>Channel</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                  <p className="text-slate-700 leading-relaxed line-clamp-3">
                    {selectedEnriched.creator.vettingDossier.outreachLeadHook}
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-stone-50 border border-stone-200 space-y-1">
                  <div className="font-semibold text-slate-800">
                    Staged @Bree Notion Comment Preview
                  </div>
                  <p className="font-mono text-[11px] text-slate-700 line-clamp-4 leading-relaxed">
                    {selectedEnriched.creator.vettingDossier.formattedNotionComment}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-stone-200">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onCopyNotionComment(selectedEnriched.creator)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedId === selectedEnriched.creator.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Copied @Bree</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy @Bree Note</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onRequestPublishConfirmation([selectedEnriched.creator])
                  }
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors cursor-pointer"
                >
                  Sync to Notion DB
                </button>
              </div>

              <button
                type="button"
                onClick={() => onOpenDossierInDesk(selectedEnriched.creator)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-900 bg-white border border-stone-300 hover:bg-stone-50 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span>Full Dossier in Desk</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Granular 40-Record Dual-Axis Composed Chart (Followers K Bars + Engagement Rate % Line) */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200 pb-3.5">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900">
              02. Granular Record-by-Record Breakdown: Follower Scale (K) vs. Engagement Rate (%)
            </h3>
            <p className="text-xs text-slate-600">
              Direct side-by-side comparison across individual creator records. Bars represent Follower Count (K) colored by Team Take; the indigo line tracks Average Engagement Rate (%).
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-lg border border-stone-200 text-xs shrink-0">
            <button
              type="button"
              onClick={() => setBreakdownViewMode('all-40')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer whitespace-nowrap ${
                breakdownViewMode === 'all-40'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Filtered ({filteredRecords.length})
            </button>
            <button
              type="button"
              onClick={() => setBreakdownViewMode('top-20-impact')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer whitespace-nowrap ${
                breakdownViewMode === 'top-20-impact'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Top 20 by Impact
            </button>
            <button
              type="button"
              onClick={() => setBreakdownViewMode('first-10')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer whitespace-nowrap ${
                breakdownViewMode === 'first-10'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              First 10 Priority
            </button>
          </div>
        </div>

        <div className="h-80 sm:h-96 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={granularChartData}
              margin={{ top: 12, right: 16, left: 0, bottom: 65 }}
              onClick={(state: any) => {
                if (state?.activePayload?.[0]?.payload?.id) {
                  onSelectCreator(state.activePayload[0].payload.id);
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis
                dataKey="rankLabel"
                tick={{ fontSize: 10 }}
                angle={-45}
                textAnchor="end"
                interval={0}
                height={70}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11 }}
                unit="K"
                label={{
                  value: 'Followers (K)',
                  angle: -90,
                  position: 'insideLeft',
                  fontSize: 11,
                  fill: '#64748b'
                }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11 }}
                unit="%"
                domain={[0, 'dataMax + 2']}
                label={{
                  value: 'Engagement Rate (%)',
                  angle: 90,
                  position: 'insideRight',
                  fontSize: 11,
                  fill: '#4f46e5'
                }}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 10 }}
                formatter={(value: any, name: string) => {
                  if (name === 'Followers (K)') return [`${value}K`, name];
                  if (name === 'Avg Engagement (%)') return [`${value}%`, name];
                  return [value, name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              <Bar
                yAxisId="left"
                dataKey="followersK"
                name="Followers (K)"
                radius={[4, 4, 0, 0]}
                className="cursor-pointer"
              >
                {granularChartData.map((entry) => (
                  <Cell
                    key={entry.id}
                    fill={getDotColor(entry.teamTake)}
                    fillOpacity={entry.id === selectedEnriched?.creator.id ? 1 : 0.78}
                  />
                ))}
              </Bar>
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="engagementRate"
                name="Avg Engagement (%)"
                stroke="#4f46e5"
                strokeWidth={2.5}
                dot={{ r: 3.5, fill: '#4f46e5' }}
                activeDot={{ r: 6 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Secondary Analytics Row: Follower Cohort Tiers (6 cols) + Platform Efficiency Breakdown (6 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-white border border-stone-200 rounded-xl p-5 space-y-4">
          <div className="border-b border-stone-200 pb-3">
            <h3 className="font-display text-base font-bold text-slate-900">
              03. Engagement Rate &amp; Impact Score by Follower Size Tier
            </h3>
            <p className="text-xs text-slate-600">
              Reveals how Micro (&lt;50K) and Mid-Tier (50K–85K) literary creators deliver higher average engagement rates than Macro accounts.
            </p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={followerTierData} margin={{ top: 10, right: 16, left: -10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="tier" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} unit="%" />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  yAxisId="left"
                  dataKey="avgEngagementRate"
                  name="Avg Engagement Rate (%)"
                  fill="#059669"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  yAxisId="right"
                  dataKey="strongFitCount"
                  name="Strong Fit Creators"
                  fill="#4f46e5"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-6 bg-white border border-stone-200 rounded-xl p-5 space-y-4">
          <div className="border-b border-stone-200 pb-3">
            <h3 className="font-display text-base font-bold text-slate-900">
              04. Cross-Platform Engagement Efficiency &amp; High-Impact Density
            </h3>
            <p className="text-xs text-slate-600">
              Compares average engagement rate (%) and count of high-impact creators (Score &ge; 75) across all 6 social platforms.
            </p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={platformPerformanceData}
                margin={{ top: 10, right: 16, left: -10, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="platform" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} unit="%" />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  yAxisId="left"
                  dataKey="highImpactCount"
                  name="High-Impact Creators (Score ≥ 75)"
                  fill="#4f46e5"
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="avgEngagementRate"
                  name="Avg Platform Engagement (%)"
                  stroke="#059669"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Prioritized Outreach Ranking Table (Desktop Table + Mobile Responsive Cards) */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-200 bg-stone-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
              <Award className="w-4 h-4 text-indigo-600" />
              <span>
                Outreach Prioritization Leaderboard ({filteredRecords.length} of 40 Creators)
              </span>
            </h3>
            <p className="text-xs text-slate-600">
              Ranked by composite Outreach Impact Score (engagement rate, active engaged readers per upload, Chromatics catalog fit, and clean competitor slate).
            </p>
          </div>

          {selectedForOutreachIds.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold text-indigo-700">
                {selectedForOutreachIds.length} Selected
              </span>
              <button
                type="button"
                onClick={() => setSelectedForOutreachIds([])}
                className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 underline cursor-pointer"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleSyncSelectedCohort}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer"
              >
                Sync Selected ({selectedForOutreachIds.length}) to Notion DB
              </button>
            </div>
          )}
        </div>

        {/* Desktop High-Density Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-100/80 text-[11px] font-semibold text-slate-600 whitespace-nowrap">
                <th className="py-2.5 px-3">Pick</th>
                <th className="py-2.5 px-3">Rank</th>
                <th className="py-2.5 px-3">Creator &amp; Handle</th>
                <th className="py-2.5 px-3">Strategic Quadrant</th>
                <th className="py-2.5 px-3 text-right">Followers</th>
                <th className="py-2.5 px-3 text-right">Avg Engagement</th>
                <th className="py-2.5 px-3 text-right">Est. Engaged / Post</th>
                <th className="py-2.5 px-3 text-right">Impact Score</th>
                <th className="py-2.5 px-3">Team Take</th>
                <th className="py-2.5 px-3">Brand Conflict</th>
                <th className="py-2.5 px-3">Outreach Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 text-xs">
              {filteredRecords.map((item) => {
                const isSelectedRow = item.creator.id === selectedEnriched?.creator.id;
                const isChecked = selectedForOutreachIds.includes(item.creator.id);
                return (
                  <tr
                    key={item.creator.id}
                    onClick={() => onSelectCreator(item.creator.id)}
                    className={`transition-colors cursor-pointer ${
                      isSelectedRow ? 'bg-indigo-50/40' : 'hover:bg-stone-50/90'
                    }`}
                  >
                    <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleSelectCreatorForOutreach(item.creator.id)}
                        aria-label={`Select ${item.name} for outreach`}
                        className="rounded border-stone-300 text-indigo-600 focus:ring-0 cursor-pointer"
                      />
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-500 tabular-nums whitespace-nowrap">
                      #{String(item.rank).padStart(2, '0')}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900">{item.name}</div>
                      <div className="font-mono text-[11px] text-slate-500">{item.handle}</div>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-slate-700 font-medium">
                      {item.quadrant}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-800 tabular-nums whitespace-nowrap">
                      {item.creator.followersCount}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-700 tabular-nums whitespace-nowrap">
                      {item.creator.avgEngagementRate}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700 tabular-nums whitespace-nowrap">
                      ~{formatCompactNumber(item.engagedReadersPerPost)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-indigo-700 tabular-nums whitespace-nowrap">
                      {item.outreachImpactScore} / 100
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span
                        className={
                          item.teamTake === 'Strong fit'
                            ? 'text-emerald-700 font-semibold'
                            : item.teamTake === 'Maybe'
                            ? 'text-amber-700 font-semibold'
                            : 'text-rose-700 font-semibold'
                        }
                      >
                        {item.teamTake}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-[11px]">
                      {item.hasActiveConflict ? (
                        <span className="text-amber-800 font-medium">
                          {item.creator.competitorTies.map((t) => t.company).join(', ') ||
                            'Flagged'}
                        </span>
                      ) : (
                        <span className="text-slate-500">Clean</span>
                      )}
                    </td>
                    <td
                      className="py-2.5 px-3 whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onCopyNotionComment(item.creator)}
                          className="px-2 py-1 text-[11px] font-medium text-slate-700 bg-stone-100 hover:bg-stone-200 rounded cursor-pointer"
                        >
                          {copiedId === item.creator.id ? 'Copied' : 'Copy @Bree'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenDossierInDesk(item.creator)}
                          className="px-2 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded cursor-pointer"
                        >
                          Dossier
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Touch-First Card List inside Performance Dashboard */}
        <div className="md:hidden divide-y divide-stone-200">
          {filteredRecords.map((item) => (
            <div
              key={item.creator.id}
              onClick={() => onSelectCreator(item.creator.id)}
              className="p-4 space-y-2.5 active:bg-stone-50"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-semibold text-slate-500 tabular-nums">
                      #{item.rank}
                    </span>
                    <span className="font-display text-sm font-bold text-slate-900">
                      {item.name}
                    </span>
                    <span className="font-mono text-xs text-slate-500">{item.handle}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{item.quadrant}</div>
                </div>
                <div className="text-right font-mono">
                  <div className="text-xs font-bold text-indigo-700 tabular-nums">
                    Impact {item.outreachImpactScore}/100
                  </div>
                  <div className="text-[11px] text-emerald-700 font-semibold tabular-nums">
                    {item.creator.followersCount} &middot; {item.creator.avgEngagementRate} ER
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-[11px] font-mono text-slate-600 tabular-nums">
                  ~{formatCompactNumber(item.engagedReadersPerPost)} engaged readers/post &middot;{' '}
                  {item.teamTake}
                </span>
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => onCopyNotionComment(item.creator)}
                    className="min-h-[38px] px-2.5 py-1 text-xs font-medium text-slate-700 bg-stone-100 border border-stone-300 rounded-lg"
                  >
                    Copy @Bree
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenDossierInDesk(item.creator)}
                    className="min-h-[38px] px-2.5 py-1 text-xs font-semibold text-white bg-indigo-600 rounded-lg"
                  >
                    Dossier
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
