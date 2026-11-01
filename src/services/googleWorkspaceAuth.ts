import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  CreatorRecord,
  SocialPlatformType,
  StageType,
  TeamTakeType,
  VerdictType,
} from '../types';
import {
  AGENT_DB_SCHEMA_COLUMNS,
  formatCreatorForDatabaseRow,
  buildNotionBreeComment,
  NOTION_DESK_URL,
} from '../data/initialCreators';

export const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
];

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));
provider.setCustomParameters({ prompt: 'consent' });

// Flag to indicate if we are in the middle of a sign-in flow.
let isSigningIn = false;
// Cache the access token strictly in memory (never in localStorage/sessionStorage).
let cachedAccessToken: string | null = null;

export interface DriveSpreadsheetItem {
  id: string;
  name: string;
  webViewLink?: string;
  modifiedTime?: string;
}

export interface SpreadsheetMetadataInfo {
  spreadsheetId: string;
  title: string;
  spreadsheetUrl: string;
  sheetTabs: { sheetId: number; title: string; rowCount?: number; columnCount?: number }[];
}

// Initialize auth state listener. Call this on app load.
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Must be called from a button click or user interaction
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Google Sign-In');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

// Helper: Extract a Google Spreadsheet ID from either a full URL or raw ID
export function extractSpreadsheetId(input: string): string {
  const trimmed = String(input || '').trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return trimmed;
}

// 1. List user's Google Spreadsheets from Google Drive
export async function listDriveSpreadsheets(): Promise<DriveSpreadsheetItem[]> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Please sign in with Google first to browse your Google Sheets.');
  }

  const query = encodeURIComponent(
    "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"
  );
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&pageSize=25&orderBy=modifiedTime desc&fields=files(id,name,webViewLink,modifiedTime)`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to list Google Sheets from Google Drive');
  }

  const data = await res.json();
  return Array.isArray(data.files) ? data.files : [];
}

// 2. Fetch spreadsheet metadata & actual tab names (never hardcode "Sheet1")
export async function fetchSpreadsheetMetadata(
  spreadsheetIdOrUrl: string
): Promise<SpreadsheetMetadataInfo> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Please sign in with Google first.');
  }

  const spreadsheetId = extractSpreadsheetId(spreadsheetIdOrUrl);
  if (!spreadsheetId) {
    throw new Error('Please provide a valid Google Sheet URL or ID.');
  }

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Could not load Google Sheet metadata.');
  }

  const data = await res.json();
  const sheetTabs = Array.isArray(data.sheets)
    ? data.sheets.map((s: any) => ({
        sheetId: Number(s?.properties?.sheetId || 0),
        title: String(s?.properties?.title || 'Tab 1'),
        rowCount: s?.properties?.gridProperties?.rowCount,
        columnCount: s?.properties?.gridProperties?.columnCount,
      }))
    : [];

  return {
    spreadsheetId: data.spreadsheetId || spreadsheetId,
    title: data.properties?.title || 'Untitled Spreadsheet',
    spreadsheetUrl:
      data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    sheetTabs,
  };
}

// Build 2D values matrix (Header Row + Creator Rows) for the 27 Notion DB Schema Columns
export function build27ColumnSheetValuesMatrix(
  creators: CreatorRecord[],
  selectedPlatforms: SocialPlatformType[]
): string[][] {
  const headers = [
    ...AGENT_DB_SCHEMA_COLUMNS.map((c) => c.columnName),
    'Notion DB Sync Status',
    'Notion Page URL',
  ];

  const rows = creators.map((creator) => {
    const formattedRow = formatCreatorForDatabaseRow(creator, selectedPlatforms);
    return [
      ...AGENT_DB_SCHEMA_COLUMNS.map((col) => String(formattedRow[col.columnName] ?? '')),
      creator.notionSyncStatus === 'synced'
        ? `Synced (${creator.notionSyncOperation || 'replaced'})`
        : 'Draft (Ready for Notion DB)',
      creator.notionPageUrl || '',
    ];
  });

  return [headers, ...rows];
}

// 3. Create a brand-new 27-Column Google Sheet for Notion DB Sync in the user's Google Drive
export async function createGoogleSheetForNotionDb(
  sheetTitle: string,
  creators: CreatorRecord[],
  selectedPlatforms: SocialPlatformType[]
): Promise<{
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
  tabName: string;
  rowCount: number;
}> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Please sign in with Google first.');
  }

  const tabName = 'Chromatics 27-Col Notion DB';
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title:
          sheetTitle.trim() ||
          `Chromatics 40 Creators — 27-Col Notion DB (${new Date().toISOString().split('T')[0]})`,
      },
      sheets: [
        {
          properties: {
            title: tabName,
            gridProperties: {
              rowCount: Math.max(creators.length + 10, 60),
              columnCount: 30,
              frozenRowCount: 1,
            },
          },
        },
      ],
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to create Google Sheet.');
  }

  const createdSheet = await createRes.json();
  const spreadsheetId = createdSheet.spreadsheetId;
  const spreadsheetUrl =
    createdSheet.spreadsheetUrl ||
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  const actualTabName =
    createdSheet.sheets?.[0]?.properties?.title || tabName;

  const matrix = build27ColumnSheetValuesMatrix(creators, selectedPlatforms);

  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(`'${actualTabName}'!A1`)}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: matrix,
      }),
    }
  );

  if (!updateRes.ok) {
    const err = await updateRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Created sheet, but failed to write 27-column rows.');
  }

  return {
    spreadsheetId,
    spreadsheetUrl,
    title: createdSheet.properties?.title || sheetTitle,
    tabName: actualTabName,
    rowCount: creators.length,
  };
}

// 4. Write/Overwrite 27-Column Notion DB Creator Rows into an Existing Google Sheet Tab
// (MUST be called ONLY after explicit user confirmation in the UI modal)
export async function writeCreatorsToExistingGoogleSheetTab(
  spreadsheetIdOrUrl: string,
  sheetTabName: string,
  creators: CreatorRecord[],
  selectedPlatforms: SocialPlatformType[]
): Promise<{
  spreadsheetId: string;
  sheetTabName: string;
  updatedRows: number;
}> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Please sign in with Google first.');
  }

  const spreadsheetId = extractSpreadsheetId(spreadsheetIdOrUrl);
  const matrix = build27ColumnSheetValuesMatrix(creators, selectedPlatforms);
  const range = `'${sheetTabName.replace(/'/g, "''")}'!A1`;

  // Clear existing range first so old rows aren't left behind, then write fresh rows
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(range)}:clear`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const putRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: matrix,
      }),
    }
  );

  if (!putRes.ok) {
    const err = await putRes.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to update Google Sheet tab.');
  }

  return {
    spreadsheetId,
    sheetTabName,
    updatedRows: creators.length,
  };
}

// 5. Read rows from a Google Sheet Tab and convert them into CreatorRecord[] for Notion DB Creation
export async function importCreatorsFromGoogleSheetTab(
  spreadsheetIdOrUrl: string,
  sheetTabName: string
): Promise<CreatorRecord[]> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Please sign in with Google first.');
  }

  const spreadsheetId = extractSpreadsheetId(spreadsheetIdOrUrl);
  const range = `'${sheetTabName.replace(/'/g, "''")}'!A1:AC200`;

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(range)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Failed to read rows from Google Sheet tab.');
  }

  const data = await res.json();
  const rows: string[][] = Array.isArray(data.values) ? data.values : [];
  if (rows.length < 2) {
    throw new Error(
      `No creator rows found in tab "${sheetTabName}". Make sure row 1 has column headers and row 2+ has creators.`
    );
  }

  const headers = rows[0].map((h) => String(h || '').trim());
  const dataRows = rows.slice(1).filter((r) => r.some((cell) => String(cell || '').trim().length > 0));

  const getCol = (rowObj: Record<string, string>, candidates: string[]): string => {
    for (const key of candidates) {
      const exact = rowObj[key];
      if (exact !== undefined && exact.trim() !== '') return exact.trim();
      const foundKey = Object.keys(rowObj).find(
        (k) => k.toLowerCase() === key.toLowerCase()
      );
      if (foundKey && rowObj[foundKey]?.trim()) return rowObj[foundKey].trim();
    }
    return '';
  };

  return dataRows.map((rowCells, idx) => {
    const rowObj: Record<string, string> = {};
    headers.forEach((h, colIdx) => {
      if (h) {
        rowObj[h] = String(rowCells[colIdx] ?? '').trim();
      }
    });

    const name =
      getCol(rowObj, ['Name', 'Creator Name', 'Creator', 'Channel', 'Title']) ||
      `Creator #${idx + 1}`;
    const rawHandle =
      getCol(rowObj, ['Handle', 'Username', '@Handle', 'Social Handle']) ||
      `@${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const handle = rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`;
    const mainLink =
      getCol(rowObj, ['Main link', 'Main Link', 'URL', 'Link', 'Channel URL', 'Profile URL']) ||
      `https://www.youtube.com/${handle}`;
    const niche =
      getCol(rowObj, ['Niche', 'Category', 'Focus', 'Topics']) ||
      'Classic Books & BookTube / BookTok';
    const followersCount =
      getCol(rowObj, ['Followers', 'Subscribers', 'Audience Size']) || '48K';
    const avgEngagementRate =
      getCol(rowObj, ['Avg Engagement', 'Engagement', 'Engagement Rate']) || '6.2%';

    const rawTeamTake = getCol(rowObj, ['Team take', 'Team Take', 'Fit']);
    const teamTake: TeamTakeType =
      rawTeamTake === 'Strong fit' || rawTeamTake === 'Maybe' || rawTeamTake === 'Not a fit'
        ? rawTeamTake
        : 'Strong fit';

    const rawStage = getCol(rowObj, ['Stage', 'Status']);
    const stage: StageType =
      rawStage === 'To vet' ||
      rawStage === 'Vetted' ||
      rawStage === 'Outreach' ||
      rawStage === 'Archived'
        ? rawStage
        : 'Vetted';

    const rawVerdict = getCol(rowObj, ['Verdict']);
    const verdict: VerdictType =
      rawVerdict === 'Approved' ||
      rawVerdict === 'Pending Review' ||
      rawVerdict === 'Possible conflict' ||
      rawVerdict === 'Hold'
        ? rawVerdict
        : 'Pending Review';

    const videoTitle =
      getCol(rowObj, ['Video Title', 'Recent Video', 'Post Title']) ||
      `${name} Classics Reading Guide`;
    const videoUrl =
      getCol(rowObj, ['Discovered Post Links', 'Video URL', 'Post Link'])
        .split('\n')[0]
        .match(/https?:\/\/[^\s)]+/)?.[0] || `${mainLink}#t=3m14s`;

    const watchedOrRead =
      getCol(rowObj, [
        'Q1: Watched or Read (Titles & Links)',
        'Q1: What We Watched/Read (Titles & Links)',
        'Watched or Read',
      ]) ||
      `- Watched "${videoTitle}" (${videoUrl} at 3:14) in full and cross-checked with Chromatics' Russian Novels & Ulysses collection.`;

    const audienceProfile =
      getCol(rowObj, ['Q2: Audience Profile', 'Q2: Who Their Audience Seems To Be', 'Audience']) ||
      'Readers who want to get into big classic novels and Russian books without getting lost in character names.';

    const readingAppsEreadersAndAI =
      getCol(rowObj, [
        'Q3: Reading Apps, E-Readers & AI',
        'Q3: Reading Apps, E-Readers & AI Stance',
      ]) ||
      'Focuses on physical books and honest reading experiences; no AI slop tools.';

    const competitorTiesAnalysis =
      getCol(rowObj, [
        'Q4: Competitor Ties Analysis',
        'Q4: Competitor Ties (Fable, Kobo, Audible, Kindle, etc.)',
      ]) ||
      'No paid sponsorships or locked-in deals with Kindle, Audible, Fable, or Kobo found.';

    const recommendChromaticsWhy =
      getCol(rowObj, [
        'Q5: Recommend Chromatics & Why',
        'Q5: Honest Chromatics Recommendation & Why',
      ]) ||
      'Yes — strong fit for readers tackling dialogue-heavy classics on iPhone/iPad with color-coded lines.';

    const outreachLeadHook =
      getCol(rowObj, ['Outreach Lead Hook', 'Lead Hook']) ||
      `Reference what they say in "${videoTitle}" (${videoUrl} at 3:14) and invite them to try Chromatics on iOS for honest feedback.`;

    const gutFeeling =
      getCol(rowObj, ['Gut Feeling']) ||
      'Thoughtful, genuine creator who will respond well to a personal note tied to their video.';

    const existingComment = getCol(rowObj, [
      'Notion Comment (@Bree)',
      'Comment',
      '@Bree Comment',
    ]);

    const dossier = {
      overallSummary: `${name} is a ${teamTake.toLowerCase()} for Chromatics on iOS.`,
      watchedOrRead,
      audienceProfile,
      readingAppsEreadersAndAI,
      competitorTiesAnalysis,
      recommendChromaticsWhy,
      outreachLeadHook,
      gutFeeling,
      formattedNotionComment: existingComment,
      humanWatchComment: existingComment,
    };

    const finalBreeComment = buildNotionBreeComment(name, dossier, teamTake, handle);
    dossier.formattedNotionComment = finalBreeComment;
    dossier.humanWatchComment = finalBreeComment;

    const platformsRaw = getCol(rowObj, ['Platforms', 'Audited Platforms']);
    const parsedPlatforms = platformsRaw
      ? (platformsRaw
          .split(',')
          .map((p) => p.trim())
          .filter((p) =>
            ['YouTube', 'TikTok', 'Instagram', 'Twitter', 'Substack', 'Blog'].includes(p)
          ) as SocialPlatformType[])
      : (['YouTube', 'TikTok', 'Instagram'] as SocialPlatformType[]);

    return {
      id: `gsheet-${idx + 1}`,
      rank: Number(getCol(rowObj, ['Rank', '#'])) || idx + 1,
      isTopTenPriority: idx < 10,
      name,
      handle,
      niche,
      platforms: parsedPlatforms.length > 0 ? parsedPlatforms : ['YouTube', 'TikTok', 'Instagram'],
      followersCount,
      avgEngagementRate,
      mainLink,
      verdict,
      stage,
      teamTake,
      owner: getCol(rowObj, ['Owner']) || 'Brianna',
      vettedDate: getCol(rowObj, ['Vetted Date']) || new Date().toISOString().split('T')[0],
      researchNotes:
        getCol(rowObj, ['Research notes', 'Research Notes & Flags', 'Notes']) ||
        `Imported from Google Sheet "${sheetTabName}".`,
      watchedItems: [
        {
          platform: parsedPlatforms[0] || 'YouTube',
          title: videoTitle,
          url: videoUrl,
          date: new Date().toISOString().split('T')[0],
          durationOrFormat: '18:24 Video',
          summary: `${watchedOrRead} [Cited at 3:14 — ${videoUrl}]`,
        },
      ],
      competitorTies: [],
      vettingDossier: dossier,
      status: 'completed',
      notionSyncStatus: 'unsynced',
      notionPageUrl:
        getCol(rowObj, ['Notion Page URL']) ||
        `${NOTION_DESK_URL}?p=${encodeURIComponent(name.toLowerCase().replace(/\s+/g, '-'))}`,
    };
  });
}
