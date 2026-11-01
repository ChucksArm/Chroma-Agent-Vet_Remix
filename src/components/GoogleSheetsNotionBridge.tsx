import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  FileSpreadsheet,
  Database,
  RefreshCw,
  ExternalLink,
  Check,
  Upload,
  Download,
  ShieldCheck,
  AlertTriangle,
  Plus,
  LogOut,
  FolderOpen,
  X,
} from 'lucide-react';
import { CreatorRecord, SocialPlatformType } from '../types';
import {
  initAuth,
  googleSignIn,
  logout,
  listDriveSpreadsheets,
  fetchSpreadsheetMetadata,
  createGoogleSheetForNotionDb,
  writeCreatorsToExistingGoogleSheetTab,
  importCreatorsFromGoogleSheetTab,
  DriveSpreadsheetItem,
  SpreadsheetMetadataInfo,
} from '../services/googleWorkspaceAuth';

interface GoogleSheetsNotionBridgeProps {
  creators: CreatorRecord[];
  selectedPlatforms: SocialPlatformType[];
  onImportCreatorsFromSheet: (
    importedCreators: CreatorRecord[],
    sheetTitle: string,
    tabName: string,
    autoOpenNotionPublishModal: boolean,
    targetHub: 'my-contacts-desk' | 'chromatics-outreach'
  ) => void;
  onFormatNotionDatabase: (targetHub: 'my-contacts-desk' | 'chromatics-outreach') => Promise<void>;
  onTriggerToast: (msg: string) => void;
}

export default function GoogleSheetsNotionBridge({
  creators,
  selectedPlatforms,
  onImportCreatorsFromSheet,
  onFormatNotionDatabase,
  onTriggerToast,
}: GoogleSheetsNotionBridgeProps) {
  const [user, setUser] = useState<User | null>(null);
  const [needsAuth, setNeedsAuth] = useState<boolean>(true);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);

  // Google Drive Spreadsheets list & selected spreadsheet metadata
  const [driveSheets, setDriveSheets] = useState<DriveSpreadsheetItem[]>([]);
  const [isLoadingDriveSheets, setIsLoadingDriveSheets] = useState<boolean>(false);
  const [sheetUrlOrIdInput, setSheetUrlOrIdInput] = useState<string>('');
  const [activeSheetMeta, setActiveSheetMeta] = useState<SpreadsheetMetadataInfo | null>(null);
  const [selectedTabName, setSelectedTabName] = useState<string>('');
  const [isLoadingMeta, setIsLoadingMeta] = useState<boolean>(false);

  // New Sheet + Notion DB creation state
  const [newSheetTitle, setNewSheetTitle] = useState<string>(
    `Chromatics 40 Creators — 27-Col Notion DB (${new Date().toISOString().split('T')[0]})`
  );
  const [targetNotionHub, setTargetNotionHub] = useState<
    'my-contacts-desk' | 'chromatics-outreach'
  >('my-contacts-desk');
  const [isCreatingSheetAndDb, setIsCreatingSheetAndDb] = useState<boolean>(false);
  const [isImportingFromSheet, setIsImportingFromSheet] = useState<boolean>(false);
  const [isWritingToSheet, setIsWritingToSheet] = useState<boolean>(false);

  // Mandatory Confirmation Modal before overwriting/updating an existing Google Sheet tab
  const [pendingSheetWriteConfirm, setPendingSheetWriteConfirm] = useState<{
    spreadsheetId: string;
    spreadsheetTitle: string;
    spreadsheetUrl: string;
    tabName: string;
    rowCount: number;
  } | null>(null);

  useEffect(() => {
    const unsubscribe = initAuth(
      (authedUser) => {
        setUser(authedUser);
        setNeedsAuth(false);
      },
      () => {
        setUser(null);
        setNeedsAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleLoadDriveSheets = async () => {
    setIsLoadingDriveSheets(true);
    try {
      const files = await listDriveSpreadsheets();
      setDriveSheets(files);
      if (files.length > 0 && !sheetUrlOrIdInput) {
        setSheetUrlOrIdInput(files[0].id);
        await handleInspectSpreadsheet(files[0].id);
      }
    } catch (err: any) {
      if (String(err?.message || '').toLowerCase().includes('sign in')) {
        setNeedsAuth(true);
      }
      onTriggerToast(err?.message || 'Could not load Google Sheets from Drive.');
    } finally {
      setIsLoadingDriveSheets(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsSigningIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setNeedsAuth(false);
        onTriggerToast(
          `Signed in with Google (${result.user.email || result.user.displayName}) — Google Sheets & Notion DB sync ready!`
        );
        const files = await listDriveSpreadsheets().catch(() => []);
        setDriveSheets(files);
        if (files.length > 0) {
          setSheetUrlOrIdInput(files[0].id);
          await handleInspectSpreadsheet(files[0].id);
        }
      }
    } catch (err: any) {
      onTriggerToast(`Google Sign-In error: ${err?.message || 'Cancelled or blocked popup'}`);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleGoogleLogout = async () => {
    await logout();
    setUser(null);
    setNeedsAuth(true);
    setDriveSheets([]);
    setActiveSheetMeta(null);
    setSelectedTabName('');
    onTriggerToast('Signed out of Google Workspace.');
  };

  const handleInspectSpreadsheet = async (idOrUrl?: string) => {
    const target = (idOrUrl ?? sheetUrlOrIdInput).trim();
    if (!target) {
      onTriggerToast('Paste a Google Sheet URL/ID or pick one from your Drive list first.');
      return;
    }
    setIsLoadingMeta(true);
    try {
      const meta = await fetchSpreadsheetMetadata(target);
      setActiveSheetMeta(meta);
      if (meta.sheetTabs.length > 0) {
        setSelectedTabName(meta.sheetTabs[0].title);
      }
    } catch (err: any) {
      if (String(err?.message || '').toLowerCase().includes('sign in')) {
        setNeedsAuth(true);
      }
      onTriggerToast(err?.message || 'Could not inspect that Google Sheet.');
    } finally {
      setIsLoadingMeta(false);
    }
  };

  // Create a brand-new 27-Column Google Sheet AND format/prepare the 27-Column Notion DB
  const handleCreateNewSheetAndFormatNotionDb = async () => {
    if (needsAuth) {
      onTriggerToast('Please sign in with Google first to create a Google Sheet.');
      return;
    }
    setIsCreatingSheetAndDb(true);
    try {
      const created = await createGoogleSheetForNotionDb(
        newSheetTitle,
        creators,
        selectedPlatforms
      );
      await onFormatNotionDatabase(targetNotionHub);

      const meta = await fetchSpreadsheetMetadata(created.spreadsheetId);
      setActiveSheetMeta(meta);
      setSheetUrlOrIdInput(created.spreadsheetId);
      setSelectedTabName(created.tabName);
      setDriveSheets((prev) => [
        {
          id: created.spreadsheetId,
          name: created.title,
          webViewLink: created.spreadsheetUrl,
          modifiedTime: new Date().toISOString(),
        },
        ...prev.filter((p) => p.id !== created.spreadsheetId),
      ]);

      onTriggerToast(
        `Created Google Sheet "${created.title}" (${created.rowCount} rows × 27 Notion DB cols) & formatted Notion DB schema!`
      );
    } catch (err: any) {
      if (String(err?.message || '').toLowerCase().includes('sign in')) {
        setNeedsAuth(true);
      }
      onTriggerToast(err?.message || 'Failed to create Google Sheet.');
    } finally {
      setIsCreatingSheetAndDb(false);
    }
  };

  // Import rows from the selected Google Sheet tab and open the Notion DB Creation / Publish modal
  const handleImportSheetToCreateNotionDb = async (openPublishModal: boolean) => {
    if (!activeSheetMeta || !selectedTabName) {
      onTriggerToast('Please load a Google Sheet and select a tab first.');
      return;
    }
    setIsImportingFromSheet(true);
    try {
      await onFormatNotionDatabase(targetNotionHub);
      const importedCreators = await importCreatorsFromGoogleSheetTab(
        activeSheetMeta.spreadsheetId,
        selectedTabName
      );
      onImportCreatorsFromSheet(
        importedCreators,
        activeSheetMeta.title,
        selectedTabName,
        openPublishModal,
        targetNotionHub
      );
    } catch (err: any) {
      if (String(err?.message || '').toLowerCase().includes('sign in')) {
        setNeedsAuth(true);
      }
      onTriggerToast(err?.message || 'Failed to import rows from Google Sheet.');
    } finally {
      setIsImportingFromSheet(false);
    }
  };

  // Request confirmation before mutating/overwriting an existing Google Sheet tab
  const handleRequestOverwriteExistingSheet = () => {
    if (!activeSheetMeta || !selectedTabName) {
      onTriggerToast('Please select a Google Sheet and tab first.');
      return;
    }
    setPendingSheetWriteConfirm({
      spreadsheetId: activeSheetMeta.spreadsheetId,
      spreadsheetTitle: activeSheetMeta.title,
      spreadsheetUrl: activeSheetMeta.spreadsheetUrl,
      tabName: selectedTabName,
      rowCount: creators.length,
    });
  };

  // Execute Google Sheet tab update ONLY after user confirms in the modal
  const handleConfirmedWriteToSheet = async () => {
    if (!pendingSheetWriteConfirm) return;
    setIsWritingToSheet(true);
    try {
      const res = await writeCreatorsToExistingGoogleSheetTab(
        pendingSheetWriteConfirm.spreadsheetId,
        pendingSheetWriteConfirm.tabName,
        creators,
        selectedPlatforms
      );
      setPendingSheetWriteConfirm(null);
      onTriggerToast(
        `Synced ${res.updatedRows} creators (all 27 Notion DB columns + timestamped citations) to "${pendingSheetWriteConfirm.spreadsheetTitle}" (${res.sheetTabName})!`
      );
    } catch (err: any) {
      if (String(err?.message || '').toLowerCase().includes('sign in')) {
        setNeedsAuth(true);
      }
      onTriggerToast(err?.message || 'Failed to write to Google Sheet.');
    } finally {
      setIsWritingToSheet(false);
    }
  };

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-5">
      {/* Header Row with Google Sign-In Status */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-stone-200 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
            <FileSpreadsheet className="w-4 h-4" />
            <span>GOOGLE SHEETS &harr; 27-COLUMN NOTION DATABASE BRIDGE</span>
          </div>
          <h3 className="font-display text-base font-bold text-slate-900">
            Connect Google Sheets to Create &amp; Sync Your 27-Column Notion Database
          </h3>
          <p className="text-xs text-slate-600 max-w-3xl">
            Create a brand-new 27-column Google Sheet in your Google Drive, push all 40 vetted creators (including exact video names, timestamped URLs, and Brianna&rsquo;s NYC <code className="font-mono">@Bree</code> comments), or import any Google Sheet tab to automatically format and populate your Notion Database.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {needsAuth ? (
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isSigningIn}
              className="gsi-material-button"
            >
              <div className="gsi-material-button-state"></div>
              <div className="gsi-material-button-content-wrapper">
                <div className="gsi-material-button-icon">
                  <svg
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 48 48"
                    style={{ display: 'block' }}
                  >
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    ></path>
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    ></path>
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    ></path>
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    ></path>
                    <path fill="none" d="M0 0h48v48H0z"></path>
                  </svg>
                </div>
                <span className="gsi-material-button-contents">
                  {isSigningIn ? 'Signing in...' : 'Sign in with Google'}
                </span>
              </div>
            </button>
          ) : (
            <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
              <Check className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <div className="text-xs">
                <span className="font-semibold text-slate-900">
                  {user?.email || user?.displayName || 'Google Connected'}
                </span>
                <span className="text-slate-500 ml-1.5">· Drive &amp; Sheets Active</span>
              </div>
              <button
                type="button"
                onClick={handleGoogleLogout}
                title="Sign out of Google"
                className="ml-1 text-slate-500 hover:text-slate-800 p-1 rounded cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Two-Column Action Grid: Left = Create New 27-Col Google Sheet + Notion DB | Right = Link Existing Sheet <-> Create Notion DB */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Card 1: Create New 27-Column Google Sheet & Format Notion DB */}
        <div className="p-4 rounded-xl border border-stone-200 bg-stone-50/70 space-y-3.5 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                <span>Step A · Create New 27-Col Google Sheet + Notion DB</span>
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                {creators.length} Creators Queued
              </span>
            </div>

            <div className="space-y-2">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  New Google Sheet Name
                </label>
                <input
                  type="text"
                  value={newSheetTitle}
                  onChange={(e) => setNewSheetTitle(e.target.value)}
                  placeholder="Chromatics 40 Creators — 27-Col Notion DB"
                  className="w-full px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Target Notion Database Hub to Create / Format (27 Agent Columns)
                </label>
                <select
                  value={targetNotionHub}
                  onChange={(e) =>
                    setTargetNotionHub(
                      e.target.value as 'my-contacts-desk' | 'chromatics-outreach'
                    )
                  }
                  className="w-full px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600"
                >
                  <option value="my-contacts-desk">
                    My Contacts — Creator Vetting Desk (40457c4d75c0819d90c8cb35f1024e89)
                  </option>
                  <option value="chromatics-outreach">
                    Chromatics Outreach — Campaign Hub (40457c4d75c081928796e0b79c2f1950)
                  </option>
                </select>
              </div>
            </div>
          </div>

          <div className="pt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCreateNewSheetAndFormatNotionDb}
              disabled={isCreatingSheetAndDb || needsAuth}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {isCreatingSheetAndDb ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-3.5 h-3.5" />
              )}
              <span>
                {isCreatingSheetAndDb
                  ? 'Creating Sheet & Formatting Notion DB...'
                  : 'Create 27-Col Google Sheet & Format Notion DB'}
              </span>
            </button>

            {activeSheetMeta && (
              <a
                href={activeSheetMeta.spreadsheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg inline-flex items-center gap-1.5"
              >
                <span>Open "{activeSheetMeta.title.slice(0, 26)}" in Google Sheets</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>

        {/* Card 2: Connect Existing Google Sheet from Drive -> Create / Sync Notion DB */}
        <div className="p-4 rounded-xl border border-stone-200 bg-stone-50/70 space-y-3.5 flex flex-col justify-between">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" />
                <span>Step B · Use Existing Google Sheet to Create / Sync Notion DB</span>
              </span>
              <button
                type="button"
                onClick={handleLoadDriveSheets}
                disabled={needsAuth || isLoadingDriveSheets}
                className="text-[11px] font-semibold text-indigo-700 hover:underline disabled:opacity-50 inline-flex items-center gap-1 cursor-pointer"
              >
                <FolderOpen className="w-3 h-3" />
                <span>{isLoadingDriveSheets ? 'Loading Drive...' : 'Browse Drive Sheets'}</span>
              </button>
            </div>

            {driveSheets.length > 0 && (
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Pick a Google Sheet from Your Google Drive ({driveSheets.length} recent)
                </label>
                <select
                  value={activeSheetMeta?.spreadsheetId || sheetUrlOrIdInput}
                  onChange={(e) => {
                    setSheetUrlOrIdInput(e.target.value);
                    handleInspectSpreadsheet(e.target.value);
                  }}
                  className="w-full px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600"
                >
                  {driveSheets.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={sheetUrlOrIdInput}
                onChange={(e) => setSheetUrlOrIdInput(e.target.value)}
                placeholder="Or paste any Google Sheet URL or Spreadsheet ID..."
                className="flex-1 px-3 py-1.5 text-xs bg-white border border-stone-300 rounded-lg text-slate-900 focus:outline-none focus:border-indigo-600"
              />
              <button
                type="button"
                onClick={() => handleInspectSpreadsheet()}
                disabled={needsAuth || isLoadingMeta || !sheetUrlOrIdInput.trim()}
                className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-stone-300 hover:bg-stone-100 disabled:opacity-50 rounded-lg cursor-pointer shrink-0"
              >
                {isLoadingMeta ? 'Loading Tabs...' : 'Load Sheet Tabs'}
              </button>
            </div>

            {activeSheetMeta && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  <label className="text-[11px] font-semibold text-slate-700 whitespace-nowrap">
                    Sheet Tab:
                  </label>
                  <select
                    value={selectedTabName}
                    onChange={(e) => setSelectedTabName(e.target.value)}
                    className="flex-1 px-2.5 py-1 text-xs bg-white border border-stone-300 rounded-md text-slate-900"
                  >
                    {activeSheetMeta.sheetTabs.map((t) => (
                      <option key={t.sheetId} value={t.title}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </div>
                <a
                  href={activeSheetMeta.spreadsheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-mono text-indigo-700 hover:underline inline-flex items-center gap-1"
                >
                  <span>Open Sheet</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>

          <div className="pt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleImportSheetToCreateNotionDb(true)}
              disabled={needsAuth || !activeSheetMeta || isImportingFromSheet}
              className="px-3 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>
                {isImportingFromSheet
                  ? 'Reading Sheet & Formatting DB...'
                  : 'Import Sheet & Create Notion DB'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleRequestOverwriteExistingSheet}
              disabled={needsAuth || !activeSheetMeta || isWritingToSheet}
              className="px-3 py-2 text-xs font-semibold text-slate-800 bg-white border border-stone-300 hover:bg-stone-100 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Write 40 Creators to Selected Tab</span>
            </button>
          </div>
        </div>
      </div>

      {/* MANDATORY CONFIRMATION MODAL BEFORE UPDATING/OVERWRITING AN EXISTING GOOGLE SHEET TAB */}
      {pendingSheetWriteConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-stone-200 rounded-2xl max-w-lg w-full overflow-hidden shadow-xl">
            <div className="px-6 py-4 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
                <h3 className="font-display text-sm font-bold text-slate-900">
                  Confirm Updating Google Sheet Data
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPendingSheetWriteConfirm(null)}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-3 text-xs text-slate-700">
              <p>
                You are about to overwrite the contents of your Google Sheet tab with the current{' '}
                <strong>{pendingSheetWriteConfirm.rowCount} vetted creator records</strong> (all 27 Notion Database columns + timestamped video citations + <code className="font-mono">@Bree</code> comments):
              </p>
              <div className="p-3 rounded-lg bg-stone-50 border border-stone-200 space-y-1 font-mono text-[11px]">
                <div>
                  <strong>Spreadsheet:</strong> {pendingSheetWriteConfirm.spreadsheetTitle}
                </div>
                <div>
                  <strong>Target Sheet Tab:</strong> {pendingSheetWriteConfirm.tabName}
                </div>
                <div>
                  <strong>Rows to Write:</strong> 1 Header Row + {pendingSheetWriteConfirm.rowCount} Creator Rows (29 Columns)
                </div>
              </div>
              <p className="text-slate-500">
                Existing cells in tab <strong>&ldquo;{pendingSheetWriteConfirm.tabName}&rdquo;</strong> will be replaced. Do you want to proceed?
              </p>
            </div>

            <div className="px-6 py-3.5 bg-stone-50 border-t border-stone-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setPendingSheetWriteConfirm(null)}
                disabled={isWritingToSheet}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-stone-300 hover:bg-stone-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmedWriteToSheet}
                disabled={isWritingToSheet}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>
                  {isWritingToSheet ? 'Updating Google Sheet...' : 'Confirm & Update Google Sheet'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
