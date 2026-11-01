import React, { useState } from 'react';
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
  SlidersHorizontal,
  Play,
  Lock
} from 'lucide-react';
import { CreatorRecord, SocialPlatformType, ProjectToneMode } from '../types';
import { PROJECT_TONE_MODES } from '../data/initialCreators';

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
  onOverrideCreatorTone: (creatorId: string, mode: ProjectToneMode | 'reference-locked' | 'global') => void;
}

export default function MobileQuickVettingView({
  creators,
  selectedCreatorId,
  onSelectCreator,
  onOpenDossier,
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
  selectedPlatforms,
  onTogglePlatform,
  projectToneMode,
  onSwitchProjectTone,
  onOverrideCreatorTone,
}: MobileQuickVettingViewProps) {
  const [filterQuery, setFilterQuery] = useState('');
  const [mobileTab, setMobileTab] = useState<'queue' | 'conflicts' | 'settings'>('queue');

  const filtered = creators.filter((c) => {
    if (!filterQuery.trim()) return true;
    const q = filterQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.handle.toLowerCase().includes(q) ||
      c.niche.toLowerCase().includes(q)
    );
  });

  const conflicts = creators.filter(
    (c) =>
      c.stage !== 'Archived' &&
      c.verdict !== 'Approved' &&
      (Boolean(c.flagNote) || c.verdict === 'Possible conflict')
  );

  return (
    <div className="md:hidden pb-24 space-y-4 px-3 pt-2">
      {/* Mobile Top Header */}
      <div className="bg-white border border-stone-200 rounded-xl p-3.5 space-y-3 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-base font-bold text-slate-900">
              Chromatics Vetting Desk
            </h1>
            <p className="text-[11px] text-slate-500">
              Account Owner: Brianna · Mobile Quick View
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onToggleQuickVetting}
              className={`p-2 rounded-lg border text-xs font-semibold flex items-center gap-1 ${
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
              onClick={onToggleDarkMode}
              className="p-2 rounded-lg border border-stone-300 bg-stone-100 text-slate-700"
              aria-label="Toggle Dark Mode"
            >
              {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile 4-Mode Project Tone Switcher */}
        <div className="p-2 bg-stone-50 border border-stone-200 rounded-lg space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-semibold text-slate-600">
            <span>4-Mode Tone Switcher (#1–#3 Ref Locked · #4–#40 Fatigue Curve)</span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {PROJECT_TONE_MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => onSwitchProjectTone(m.id)}
                className={`px-2 py-1 text-[11px] font-semibold rounded-md border text-left transition-colors ${
                  projectToneMode === m.id
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-stone-200'
                }`}
              >
                {m.shortLabel}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile Sub-Navigation Tabs */}
        <div className="grid grid-cols-3 gap-1 p-1 bg-stone-100 rounded-lg text-xs font-semibold">
          <button
            onClick={() => setMobileTab('queue')}
            className={`py-1.5 rounded-md transition-colors ${
              mobileTab === 'queue' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Queue ({creators.length})
          </button>
          <button
            onClick={() => setMobileTab('conflicts')}
            className={`py-1.5 rounded-md transition-colors flex items-center justify-center gap-1 ${
              mobileTab === 'conflicts' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            <span>Flags ({conflicts.length})</span>
          </button>
          <button
            onClick={() => setMobileTab('settings')}
            className={`py-1.5 rounded-md transition-colors ${
              mobileTab === 'settings' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Actions
          </button>
        </div>

        {mobileTab === 'queue' && (
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="Search creator name or handle..."
              className="w-full pl-8 pr-3 py-2 text-xs bg-stone-50 border border-stone-200 rounded-lg"
            />
          </div>
        )}
      </div>

      {/* Content based on Mobile Tab */}
      {mobileTab === 'queue' && (
        <div className="space-y-3">
          {filtered.map((c) => (
            <div
              key={c.id}
              className={`border rounded-xl p-3.5 space-y-2.5 transition-all ${
                selectedCreatorId === c.id
                  ? 'border-indigo-600 bg-indigo-50/20 shadow-xs'
                  : 'border-stone-200 bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div onClick={() => { onSelectCreator(c.id); onOpenDossier(c); }}>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-xs font-semibold text-slate-500">
                      #{c.rank}
                    </span>
                    <span className="font-display text-sm font-bold text-slate-900">
                      {c.name}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">{c.handle}</span>
                    {c.rank <= 3 && (
                      <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-900 rounded border border-amber-300 inline-flex items-center gap-0.5">
                        <Lock className="w-2.5 h-2.5" />
                        <span>Ref #{c.rank}</span>
                      </span>
                    )}
                    {c.rank >= 27 && (
                      <span className="px-1.5 py-0.5 text-[10px] font-mono bg-stone-100 text-slate-600 rounded">
                        Late-List Fatigue
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-1">{c.niche}</p>
                </div>
                <span
                  className={`px-2 py-0.5 text-[10px] font-semibold rounded shrink-0 ${
                    c.teamTake === 'Strong fit'
                      ? 'bg-emerald-100 text-emerald-800'
                      : c.teamTake === 'Maybe'
                      ? 'bg-amber-100 text-amber-900'
                      : c.teamTake === 'Not a fit'
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-stone-100 text-slate-600'
                  }`}
                >
                  {c.teamTake}
                </span>
              </div>

              {/* @Bree Comment Preview (2-paragraph casual NYC voice + timestamp) */}
              <div
                onClick={() => { onSelectCreator(c.id); onOpenDossier(c); }}
                className="p-2.5 rounded-lg bg-stone-50 border border-stone-200 text-xs font-mono text-slate-700 line-clamp-3 leading-relaxed"
              >
                {c.vettingDossier.formattedNotionComment ||
                  'Tap to view casual @Bree comment & 5 vetting answers with timestamped video citations.'}
              </div>

              {/* Quick Action Buttons */}
              <div className="flex items-center justify-between pt-1 border-t border-stone-100">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onRunSingleVet(c)}
                    className="px-2.5 py-1 text-[11px] font-semibold text-white bg-indigo-600 rounded-md flex items-center gap-1"
                  >
                    <Play className="w-3 h-3" />
                    <span>Vet</span>
                  </button>
                  <button
                    onClick={() => onCopyComment(c)}
                    className="px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-stone-100 border border-stone-300 rounded-md flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copy @Bree</span>
                  </button>
                  <select
                    aria-label={`Tone override for ${c.name}`}
                    value={c.toneOverride || (c.rank <= 3 ? 'reference-locked' : projectToneMode)}
                    onChange={(e) =>
                      onOverrideCreatorTone(
                        c.id,
                        e.target.value as ProjectToneMode | 'reference-locked'
                      )
                    }
                    className="px-1.5 py-1 text-[10px] font-semibold bg-stone-100 border border-stone-300 rounded-md text-slate-800"
                  >
                    {c.rank <= 3 && <option value="reference-locked">Ref Locked</option>}
                    {PROJECT_TONE_MODES.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.shortLabel}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => { onSelectCreator(c.id); onOpenDossier(c); }}
                  className="text-xs font-semibold text-indigo-700 flex items-center gap-0.5"
                >
                  <span>Dossier</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {mobileTab === 'conflicts' && (
        <div className="space-y-3">
          {conflicts.length === 0 ? (
            <div className="p-8 text-center bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
              <Check className="w-6 h-6 text-emerald-600 mx-auto" />
              <h3 className="font-display text-sm font-bold text-slate-900">
                No Unresolved Conflicts!
              </h3>
              <p className="text-xs text-slate-600">All creator workspace flags have been cleared.</p>
            </div>
          ) : (
            conflicts.map((c) => (
              <div key={c.id} className="border border-amber-300 bg-amber-50/40 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-display text-sm font-bold text-slate-900">
                    #{c.rank} {c.name}
                  </span>
                  <span className="text-[11px] font-semibold px-2 py-0.5 bg-amber-200 text-amber-900 rounded">
                    {c.verdict}
                  </span>
                </div>
                <p className="text-xs text-amber-900">{c.flagNote || c.researchNotes}</p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => onOpenDossier(c)}
                    className="px-3 py-1 text-xs font-semibold bg-white border border-stone-300 rounded-md text-slate-800"
                  >
                    Review Dossier
                  </button>
                  <button
                    onClick={() => onOpenSyncModal([c])}
                    className="px-3 py-1 text-xs font-semibold bg-indigo-600 text-white rounded-md"
                  >
                    Sync to Notion
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {mobileTab === 'settings' && (
        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-4">
          <h3 className="font-display text-sm font-bold text-slate-900">
            Workspace Actions &amp; Sync
          </h3>
          <div className="space-y-2">
            <button
              onClick={() => onOpenSyncModal(creators)}
              className="w-full py-2.5 px-3 text-xs font-semibold text-white bg-slate-900 rounded-lg flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Sync All 40 Creators to Notion DB</span>
            </button>
            <button
              onClick={() => onSwitchView('spreadsheet')}
              className="w-full py-2.5 px-3 text-xs font-semibold text-slate-800 bg-stone-100 border border-stone-300 rounded-lg flex items-center justify-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Google Sheets &amp; Create Notion DB</span>
            </button>
          </div>
        </div>
      )}

      {/* Sticky Bottom Navigation Bar for Mobile */}
      <nav aria-label="Mobile Navigation" className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-stone-200 px-4 py-2 flex items-center justify-around shadow-lg">
        <button
          onClick={() => onSwitchView('workspace-scanner')}
          className={`flex flex-col items-center gap-1 text-[11px] font-medium ${
            activeView === 'workspace-scanner' ? 'text-indigo-600 font-semibold' : 'text-slate-600'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Workspace</span>
        </button>
        <button
          onClick={() => onSwitchView('notion-desk')}
          className={`flex flex-col items-center gap-1 text-[11px] font-medium ${
            activeView === 'notion-desk' ? 'text-indigo-600 font-semibold' : 'text-slate-600'
          }`}
        >
          <User className="w-4 h-4" />
          <span>Notion Desk</span>
        </button>
        <button
          onClick={() => onSwitchView('spreadsheet')}
          className={`flex flex-col items-center gap-1 text-[11px] font-medium ${
            activeView === 'spreadsheet' ? 'text-indigo-600 font-semibold' : 'text-slate-600'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          <span>Sheets &amp; DB</span>
        </button>
        <button
          onClick={() => onSwitchView('competitor-radar')}
          className={`flex flex-col items-center gap-1 text-[11px] font-medium ${
            activeView === 'competitor-radar' ? 'text-indigo-600 font-semibold' : 'text-slate-600'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Radar</span>
        </button>
      </nav>
    </div>
  );
}
