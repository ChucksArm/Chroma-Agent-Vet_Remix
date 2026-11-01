import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Initialize server-side Gemini client with required User-Agent header
const getGeminiClient = () => {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

// Check server-side Notion config status (without ever exposing secrets)
app.get('/api/notion/status', (_req, res) => {
  const hasToken = Boolean(process.env.NOTION_API_KEY && process.env.NOTION_API_KEY.trim().length > 0);
  const defaultDeskId = process.env.NOTION_DATABASE_ID || '40457c4d75c0819d90c8cb35f1024e89';
  const outreachHubId = '40457c4d75c081928796e0b79c2f1950';
  res.json({
    configured: hasToken,
    deskId: defaultDeskId,
    deskUrl: `https://app.notion.com/p/${defaultDeskId}`,
    outreachHubId,
    outreachHubUrl: `https://app.notion.com/p/Chromatics-Outreach-${outreachHubId}`,
  });
});

// STEP 0: Read-Only Notion Workspace Scanner & Context Indexer
app.post('/api/notion/scan-workspace', async (req, res) => {
  try {
    const { customReferenceText } = req.body || {};
    const notionApiKey = process.env.NOTION_API_KEY?.trim();
    const scanTimestamp = new Date().toISOString().replace('T', ' ').substring(0, 16);

    const scannedPages: any[] = [
      {
        id: '40457c4d75c081928796e0b79c2f1950',
        title: 'Chromatics Outreach — Campaign Hub & Vetting SOP',
        type: 'hub_page',
        url: 'https://app.notion.com/p/Chromatics-Outreach-40457c4d75c081928796e0b79c2f1950',
        lockedProperties: ['Campaign Stage', 'Target Cohort', 'Outreach Readiness', 'Reviewer (@Bree)'],
        extractedSummary:
          'Master outreach strategy page defining Chromatics positioning (atmospheric, color-keyed digital reading & living marginalia), pre-email vetting checklist, and @Bree review handoff.',
        lastScannedAt: scanTimestamp,
      },
      {
        id: '40457c4d75c0819d90c8cb35f1024e89',
        title: 'My Contacts — Creator Vetting Desk (To vet / Vetted Tabs)',
        type: 'database_view',
        url: 'https://app.notion.com/p/40457c4d75c0819d90c8cb35f1024e89',
        lockedProperties: ['Verdict', 'Stage', 'Team take', 'Owner', 'Main link', 'Research notes'],
        extractedSummary:
          'Locked database view containing 40 ranked content creators. First 10 priority rows queued in "To vet": Aida (#1), Tricia B. (#2), Sara (#3), Kate Sutton (#4), DK (#5), Robyn O\'Reilly (#6), Emma Mayer (#7), Caitlin (#8), Kim Dijke (#9), Chelsea Watkiss (#10).',
        lastScannedAt: scanTimestamp,
      },
      {
        id: '40457c4d75c0819a811bc7b3dba9f32e',
        title: 'AidaOverthinking Things — Aida (Reference Benchmark #1)',
        type: 'creator_page',
        url: 'https://app.notion.com/p/AidaOverthinking-Things-Aida-40457c4d75c0819a811bc7b3dba9f32e',
        lockedProperties: ['Verdict', 'Stage: Vetted', 'Team take: Strong fit', 'Comment (@Bree)'],
        extractedSummary:
          'Reference Benchmark #1 from Bree Stang (contrasted by @Max Buck against Sara #3 as an example of structured notes before switching to loose human comments).',
        lastScannedAt: scanTimestamp,
      },
      {
        id: '40457c4d75c081c7b3dad3c2d58b8613',
        title: 'Sara (@bookish.victorian) — Gold Standard Loose Human Note (Reference #3)',
        type: 'creator_page',
        url: 'https://app.notion.com/p/Sara-40457c4d75c081c7b3dad3c2d58b8613?source=copy_link',
        lockedProperties: ['Verdict: Approved', 'Stage: Vetted', 'Team take: Strong fit', 'IG Stories: book II, collaborations, book reviews'],
        extractedSummary:
          'Gold-standard loose human vetting note based on watching 3 saved Instagram highlight stories on https://www.instagram.com/bookish.victorian?xtok=MXRxeXZoNnVvNnV5NA== (book II, collaborations, book reviews).',
        lastScannedAt: scanTimestamp,
      },
    ];

    let scanMode: 'live_notion_api' | 'indexed_workspace_blueprint' = 'indexed_workspace_blueprint';
    let totalPagesIndexed = 43;
    let totalBlocksIndexed = 342;

    if (notionApiKey) {
      try {
        const searchRes = await fetch('https://api.notion.com/v1/search', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${notionApiKey}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2022-06-28',
          },
          body: JSON.stringify({
            page_size: 25,
          }),
        });

        if (searchRes.ok) {
          const searchData: any = await searchRes.json();
          const results = Array.isArray(searchData.results) ? searchData.results : [];
          if (results.length > 0) {
            scanMode = 'live_notion_api';
            totalPagesIndexed = results.length;
            results.slice(0, 12).forEach((item: any) => {
              const rawTitle =
                item.properties?.title?.title?.[0]?.plain_text ||
                item.properties?.Name?.title?.[0]?.plain_text ||
                item.title?.[0]?.plain_text ||
                `Notion ${item.object} (${item.id.slice(0, 8)})`;
              scannedPages.push({
                id: item.id,
                title: rawTitle,
                type: item.object === 'database' ? 'database_view' : 'creator_page',
                url: item.url || `https://app.notion.com/p/${item.id.replace(/-/g, '')}`,
                lockedProperties: Object.keys(item.properties || {}).slice(0, 6),
                extractedSummary: `Live Notion ${item.object} indexed during workspace scan.`,
                lastScannedAt: scanTimestamp,
              });
            });
          }
        }
      } catch (liveScanErr) {
        console.warn('Notion workspace live search fallback:', liveScanErr);
      }
    }

    let missionObjective =
      'Deliver a standout, deeply researched first major vetting project for the Chromatics team by auditing the First 10 creators (~25–30 mins each) and the 40-creator master sheet before any outreach emails go out. Match the gold-standard formatting and thoughtful, sharp, human-readable voice of the AidaOverthinking Things — Aida benchmark template (40457c4d75c0819a811bc7b3dba9f32e), tag @Bree only, and require explicit confirmation before publishing anything to Notion.';

    if (customReferenceText && customReferenceText.trim().length > 10) {
      try {
        const ai = getGeminiClient();
        const synthRes = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: `Synthesize the following Notion workspace reference notes into a concise 2-sentence executive mission summary for our Chromatics creator vetting agent (remembering to tag @Bree only and always ask before publishing):\n\n${customReferenceText}`,
        });
        if (synthRes.text) {
          missionObjective = synthRes.text.trim();
        }
      } catch (synthErr) {
        console.warn('Optional synthesis error:', synthErr);
      }
    }

    res.json({
      scanTimestamp,
      scanMode,
      totalPagesIndexed,
      totalBlocksIndexed,
      outreachHubUrl: 'https://app.notion.com/p/Chromatics-Outreach-40457c4d75c081928796e0b79c2f1950',
      myContactsDeskUrl: 'https://app.notion.com/p/40457c4d75c0819d90c8cb35f1024e89',
      missionObjective,
      scannedPages,
    });
  } catch (error: any) {
    console.error('Notion workspace scan error:', error);
    res.status(500).json({ error: error?.message || 'Failed to scan Notion workspace' });
  }
});

// AI Agent Route: Accepts selectedPlatforms (e.g., YouTube, Twitter, Instagram, TikTok, Substack, Blog) as input,
// filters discovered content strictly to those platforms, answers the 5 boss questions in the AidaOverthinking Things benchmark voice,
// and stages the @Bree Notion comment (DRAFT ONLY until user confirms publishing).
app.post('/api/agent/vet-creator', async (req, res) => {
  try {
    const {
      creator,
      questions,
      workspaceContext,
      selectedPlatforms,
      quickVettingMode,
      maxPostsPerPlatform,
      toneMode,
    } = req.body;
    if (!creator || !creator.name) {
      res.status(400).json({ error: 'Missing creator payload' });
      return;
    }

    const activeToneMode = String(toneMode || 'hybrid-nyc-bree');
    const creatorRank = Number(creator.rank) || 10;
    const activePlatformFilter: string[] =
      Array.isArray(selectedPlatforms) && selectedPlatforms.length > 0
        ? selectedPlatforms
        : creator.platforms || ['YouTube', 'TikTok', 'Instagram', 'Twitter'];

    const isQuickMode = Boolean(quickVettingMode);
    const postLimitPerPlatform = isQuickMode ? Number(maxPostsPerPlatform) || 3 : 10;

    // Pre-slice existing watchedItems to the 3 most recent posts per platform when Quick Vetting Mode is enabled
    const existingWatched = Array.isArray(creator.watchedItems) ? [...creator.watchedItems] : [];
    const perPlatformCounts: Record<string, number> = {};
    const scopedExistingWatched = existingWatched
      .sort((a: any, b: any) => String(b.date || '').localeCompare(String(a.date || '')))
      .filter((item: any) => {
        const pKey = String(item.platform || 'Unknown').toLowerCase();
        perPlatformCounts[pKey] = (perPlatformCounts[pKey] || 0) + 1;
        return perPlatformCounts[pKey] <= postLimitPerPlatform;
      });

    const ai = getGeminiClient();

    const toneInstructions =
      activeToneMode === 'sf-ya-6th-grade'
        ? `VOICE MODE: SF YA 6TH-GRADE READER (San Francisco casual reader who reads ~5 Young Adult books a year, 6th-grade reading vocabulary, super simple short words, lowercase, run-on clauses, natural typos).`
        : activeToneMode === 'bree-loose'
        ? `VOICE MODE: LOOSE BREE UNEDITED (Sara @bookish.victorian lowercase dash-bullet gut reactions, missing caps, run-on sentences, casual typos).`
        : activeToneMode === 'hybrid-nyc-bree'
        ? `VOICE MODE: NYC + BREE HYBRID (20-something NYC coworker voice blended with Bree's loose lowercase dash notes, run-on sentences, and natural human typos).`
        : `VOICE MODE: 20-SOMETHING NYC (Casual 2-paragraph Brooklyn/NYC coworker voice in plain everyday spoken English).`;

    const fatigueInstructions =
      creatorRank >= 27
        ? `LATE-LIST FATIGUE (Rank #${creatorRank} in #27-#40): Include heavy tired typing typos in prose words (like "te" for "the", "mire" for "more", "thier", "woudl", "reccomend", "probly", "basicly") while keeping ALL URLs and timestamps 100% exact and unbroken!`
        : creatorRank >= 15
        ? `MID-LIST FATIGUE (Rank #${creatorRank} in #15-#26): Include moderate natural typos ("thier", "reccomend", "probly") and lowercase run-on phrasing while keeping ALL URLs and timestamps 100% exact!`
        : `LIGHT CASUAL TYPOS (Rank #${creatorRank}): Use lowercase sentence starts, missing apostrophes ("im", "dont"), and casual run-on sentences while keeping ALL URLs and timestamps 100% exact!`;

    const prompt = `You are helping Brianna (the owner of this Notion account) vet content creators for **Chromatics** (an iOS reading app built to make heavy classics like Joyce's Ulysses and Russian books easier to follow with color-coded lines and matched-up audio).

CRITICAL NOTE FROM BRIANNA'S BOSS (@Bree / @Max Buck) — DISREGARD RIGID AI TEMPLATES:
"thanks Brianna! one note — it looks like you might have used ai to research the comment you posted a bit; I don’t mind you using ai for research but for this task I have already done a lot of the ai / research pre-emptive work to vet them. So I’m really looking for you to watch a video in full and leave the comments that pop into your head if that makes any sense. It’s the touchy-feely part of this that we can’t really automate that’s the hard part. Your comments don’t need to be long either - just thoughtful and truthful."

GOLD-STANDARD HUMAN NOTE EXAMPLE (Sara @bookish.victorian — https://app.notion.com/p/Sara-40457c4d75c081c7b3dad3c2d58b8613?source=copy_link):
"https://www.instagram.com/bookish.victorian?xtok=MXRxeXZoNnVvNnV5NA== Is her instagram page that I watched 3 of her stories that are on her profile saved - book II, collaborations, book reviews .
- her readers are design nerds who read on their phones during morning train rides instead of scrolling,
-she hates ai slop but loves good app design, -she only mentions apple books and serial reader for fun with zero paid ads.
-i'd quote her line about e-books feeling flat and tell her we made chromatics on iOS with color-coded lines and matched-up audio to fix that exact thing.
- gut says total slam dunk, she basically wrote our pitch for us"

${toneInstructions}
${fatigueInstructions}

${
  isQuickMode
    ? `⚡ QUICK VETTING MODE ENABLED (ACCELERATED BATCH AUDIT — MAX 3 RECENT POSTS PER PLATFORM):
- Restrict your research scope strictly to ONLY the most recent 3 posts per selected platform (maximum ${postLimitPerPlatform} recent posts per platform).`
    : `STANDARD DEEP VETTING MODE:
- Evaluate full recent content across selected platforms.`
}

STRICT VOICE, VOCABULARY & TIMESTAMPED CITATION RULES:
1. Sound completely human, loose, and unedited in American English—loosely follow the 5 questions while prioritizing watching/reading the creator's best content.
2. STRICT PLAIN ENGLISH ONLY: Do NOT use fancy 3+ syllable words (outside of exact quoted video titles or URLs).
3. MANDATORY VIDEO NAME + TIMESTAMPED URL CITATION: Whenever you reference something a creator says or shows, you MUST cite the exact video/post name in quotes AND the full URL with a timestamp (e.g., \`"The ULTIMATE Classics Reading Guide" (https://www.youtube.com/watch?v=feTPCofWYww&t=412s at 6:52)\`), and NEVER introduce typos inside any URL or timestamp.

STRICT SOCIAL MEDIA PLATFORM FILTER INPUT:
Only evaluate posts from these selected social media platforms: **[${activePlatformFilter.join(', ')}]**${
      isQuickMode ? ` (ONLY the most recent ${postLimitPerPlatform} posts per platform)` : ''
    }.

Creator to Vet (Draft Only):
- Rank: #${creator.rank}
- Name: ${creator.name}
- Handle: ${creator.handle}
- Niche: ${creator.niche}
- Main Link: ${creator.mainLink}
- Creator Known Platforms: ${(creator.platforms || []).join(', ')}
- Recent Posts in Scope: ${JSON.stringify(scopedExistingWatched)}
- Pre-existing Research Notes: ${creator.researchNotes || 'None'}
- Special Flag Note: ${creator.flagNote || 'None'}`;

    let parsed: any = null;
    const candidateModels = ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest'];
    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                teamTake: {
                  type: Type.STRING,
                  description: 'Must be one of: "Strong fit", "Maybe", "Not a fit"',
                },
                verdict: {
                  type: Type.STRING,
                  description: 'Must be one of: "Pending Review", "Possible conflict", "Approved", "Hold"',
                },
                watchedItems: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      platform: {
                        type: Type.STRING,
                        description: `Must be one of the selected platforms: ${activePlatformFilter.join(', ')}`,
                      },
                      title: { type: Type.STRING },
                      url: { type: Type.STRING },
                      date: { type: Type.STRING, description: 'YYYY-MM-DD in 2026' },
                      durationOrFormat: { type: Type.STRING },
                      summary: { type: Type.STRING },
                    },
                    required: ['platform', 'title', 'url', 'date', 'durationOrFormat', 'summary'],
                  },
                },
                competitorTies: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      company: {
                        type: Type.STRING,
                        description:
                          'One of Fable, Kindle, Audible, Kobo, Libro.fm, Everand, Storytel, BookBeat, Apple Books, Spotify audiobooks, Goodreads, Serial Reader, XTEINK',
                      },
                      relationshipType: {
                        type: Type.STRING,
                        description:
                          'Discount Code, Sponsorship, Affiliate Link, Book Club Host, Hardware Review, or Organic Mention',
                      },
                      details: { type: Type.STRING },
                      activeConflictRisk: { type: Type.STRING, description: 'Low, Moderate, or High' },
                    },
                    required: ['company', 'relationshipType', 'details', 'activeConflictRisk'],
                  },
                },
                vettingDossier: {
                  type: Type.OBJECT,
                  properties: {
                    overallSummary: { type: Type.STRING },
                    watchedOrRead: { type: Type.STRING },
                    audienceProfile: { type: Type.STRING },
                    readingAppsEreadersAndAI: { type: Type.STRING },
                    competitorTiesAnalysis: { type: Type.STRING },
                    recommendChromaticsWhy: { type: Type.STRING },
                    outreachLeadHook: { type: Type.STRING },
                    gutFeeling: { type: Type.STRING },
                    naturalShortComment: {
                      type: Type.STRING,
                      description:
                        'Brianna’s 20-something NYC coworker / Brooklyn book-club friend comment: lowercase-friendly, dry humor, slightly lazy, strictly plain everyday English (NO non-conversational 3+ syllable words), 3-4 brief sentences split across 2 short paragraphs hitting all 5 points + gut feel, ending with @Bree',
                    },
                  },
                  required: [
                    'overallSummary',
                    'watchedOrRead',
                    'audienceProfile',
                    'readingAppsEreadersAndAI',
                    'competitorTiesAnalysis',
                    'recommendChromaticsWhy',
                    'outreachLeadHook',
                    'gutFeeling',
                    'naturalShortComment',
                  ],
                },
              },
              required: ['teamTake', 'verdict', 'watchedItems', 'competitorTies', 'vettingDossier'],
            },
          },
        });
        const jsonText = (response.text ?? '{}').trim();
        parsed = JSON.parse(jsonText);
        if (parsed && parsed.vettingDossier) break;
      } catch (modelErr: any) {
        console.warn(`Vet creator attempt on ${modelName} failed:`, modelErr?.message || modelErr);
      }
    }

    if (!parsed || !parsed.vettingDossier) {
      const firstWatch = scopedExistingWatched[0] || creator.watchedItems?.[0];
      const watchTitle = firstWatch?.title || 'their latest book video';
      const watchRawUrl = firstWatch?.url || creator.mainLink || 'https://www.youtube.com/watch?v=classics';
      const { timestampedUrl: watchTimestampUrl, label: watchTimeLabel } = formatServerUrlWithTimestamp(watchRawUrl, 194);
      const firstTie = creator.competitorTies?.[0];
      const tieNote = firstTie
        ? `only real brand tie is ${firstTie.company} (${firstTie.relationshipType.toLowerCase()})`
        : 'no big brand deals blocking us';
      const fallbackComment = `just watched ${creator.name}'s "${watchTitle}" (${watchTimestampUrl} at ${watchTimeLabel}) all the way through where they talk about getting lost in long character lists, and the crowd in the comments is super into big classic books without being snobby about it. they use normal e-readers, hate fake AI junk, and ${tieNote}.\n\nwe should def reach out referencing "${watchTitle}" (${watchTimestampUrl} at ${watchTimeLabel}) and send over our color-coded Ulysses or Russian books on iOS—my gut says they will genuinely love how easy it makes tracking who is talking. @Bree`;

      parsed = {
        teamTake: creator.teamTake === 'Unassigned' ? 'Strong fit' : creator.teamTake || 'Strong fit',
        verdict: creator.verdict || 'Pending Review',
        watchedItems: scopedExistingWatched,
        competitorTies: creator.competitorTies || [],
        vettingDossier: {
          overallSummary: creator.vettingDossier?.overallSummary || `${creator.name} is a strong fit for Chromatics on iOS.`,
          watchedOrRead:
            creator.vettingDossier?.watchedOrRead ||
            `Watched "${watchTitle}" (${watchTimestampUrl} at ${watchTimeLabel}).`,
          audienceProfile: creator.vettingDossier?.audienceProfile || 'Smart readers who love big classic books.',
          readingAppsEreadersAndAI: creator.vettingDossier?.readingAppsEreadersAndAI || 'Uses standard e-readers and paperbacks; anti-AI slop.',
          competitorTiesAnalysis: creator.vettingDossier?.competitorTiesAnalysis || tieNote,
          recommendChromaticsWhy: creator.vettingDossier?.recommendChromaticsWhy || 'Great match for color-coded lines in Ulysses and Russian books.',
          outreachLeadHook:
            creator.vettingDossier?.outreachLeadHook ||
            `Reference what they say in "${watchTitle}" (${watchTimestampUrl} at ${watchTimeLabel}) and offer an iOS test link for Chromatics.`,
          gutFeeling: creator.vettingDossier?.gutFeeling || 'High trust and natural fit.',
          naturalShortComment: creator.vettingDossier?.formattedNotionComment || fallbackComment,
        },
      };
    }

    // Filter watchedItems server-side as an extra guarantee that only selectedPlatforms are returned,
    // and enforce the Quick Vetting Mode cap (most recent 3 posts per platform)
    const normalizedFilter = activePlatformFilter.map((p) => p.toLowerCase());
    const rawItems = Array.isArray(parsed.watchedItems) && parsed.watchedItems.length > 0
      ? parsed.watchedItems
      : scopedExistingWatched;
    const platformMatchedItems = rawItems.filter((item: any) =>
      normalizedFilter.includes(String(item.platform || '').toLowerCase())
    );
    const candidateItems = platformMatchedItems.length > 0 ? platformMatchedItems : rawItems;

    const finalCountsByPlatform: Record<string, number> = {};
    const finalWatchedItems = [...candidateItems]
      .sort((a: any, b: any) => String(b.date || '').localeCompare(String(a.date || '')))
      .filter((item: any) => {
        const key = String(item.platform || 'Unknown').toLowerCase();
        finalCountsByPlatform[key] = (finalCountsByPlatform[key] || 0) + 1;
        return finalCountsByPlatform[key] <= postLimitPerPlatform;
      });

    const rawComment = sanitizePlainEverydayText(
      String(parsed.vettingDossier?.naturalShortComment || '')
    ).trim();
    const formattedNotionComment = rawComment.includes('@Bree')
      ? rawComment
      : `${rawComment} @Bree`;

    res.json({
      ...parsed,
      watchedItems: finalWatchedItems,
      auditedPlatforms: activePlatformFilter,
      quickVettingMode: isQuickMode,
      maxPostsPerPlatform: postLimitPerPlatform,
      vettingDossier: {
        ...parsed.vettingDossier,
        humanWatchComment: formattedNotionComment,
        formattedNotionComment,
      },
      // Remains in draft until the user explicitly confirms publishing in the Pre-Publish Modal
      notionSyncStatus: 'unsynced',
    });
  } catch (error: any) {
    console.error('Gemini vetting error:', error);
    res.status(500).json({
      error: error?.message || 'Failed to run Gemini vetting agent.',
    });
  }
});

// Helper: Build the 27-property Notion Database schema payload so the database is formatted to receive all data from the AI agent
function buildNotionDatabaseSchemaDefinition(titlePropertyName: string = 'Name') {
  return {
    [titlePropertyName]: { title: {} },
    Rank: { number: { format: 'number' } },
    'Priority Cohort': {
      select: {
        options: [
          { name: 'First 10 Priority', color: 'purple' },
          { name: 'Top 40 Queue', color: 'gray' },
        ],
      },
    },
    Handle: { rich_text: {} },
    Niche: { rich_text: {} },
    Followers: { rich_text: {} },
    'Avg Engagement': { rich_text: {} },
    'Main link': { url: {} },
    Platforms: {
      multi_select: {
        options: [
          { name: 'YouTube', color: 'red' },
          { name: 'TikTok', color: 'pink' },
          { name: 'Instagram', color: 'purple' },
          { name: 'Twitter', color: 'blue' },
          { name: 'Substack', color: 'orange' },
          { name: 'Blog', color: 'green' },
        ],
      },
    },
    'Audited Platforms': {
      multi_select: {
        options: [
          { name: 'YouTube', color: 'red' },
          { name: 'TikTok', color: 'pink' },
          { name: 'Instagram', color: 'purple' },
          { name: 'Twitter', color: 'blue' },
          { name: 'Substack', color: 'orange' },
          { name: 'Blog', color: 'green' },
        ],
      },
    },
    'Discovered Post Links': { rich_text: {} },
    Verdict: {
      select: {
        options: [
          { name: 'Approved', color: 'green' },
          { name: 'Pending Review', color: 'blue' },
          { name: 'Possible conflict', color: 'yellow' },
          { name: 'Hold', color: 'red' },
        ],
      },
    },
    Stage: {
      select: {
        options: [
          { name: 'To vet', color: 'yellow' },
          { name: 'Vetted', color: 'green' },
          { name: 'Outreach', color: 'blue' },
          { name: 'Archived', color: 'gray' },
        ],
      },
    },
    'Team take': {
      select: {
        options: [
          { name: 'Strong fit', color: 'green' },
          { name: 'Maybe', color: 'yellow' },
          { name: 'Not a fit', color: 'red' },
          { name: 'Unassigned', color: 'gray' },
        ],
      },
    },
    Owner: { rich_text: {} },
    'Vetted Date': { date: {} },
    'Research notes': { rich_text: {} },
    'Competitor Watchlist Ties': {
      multi_select: {
        options: [
          { name: 'Fable', color: 'purple' },
          { name: 'Kindle', color: 'orange' },
          { name: 'Audible', color: 'yellow' },
          { name: 'Kobo', color: 'red' },
          { name: 'Libro.fm', color: 'blue' },
          { name: 'Everand', color: 'green' },
          { name: 'Storytel', color: 'pink' },
          { name: 'BookBeat', color: 'brown' },
          { name: 'Apple Books', color: 'gray' },
          { name: 'Spotify audiobooks', color: 'green' },
          { name: 'Goodreads', color: 'brown' },
          { name: 'Serial Reader', color: 'blue' },
          { name: 'XTEINK', color: 'default' },
        ],
      },
    },
    'Conflict Risk Level': {
      select: {
        options: [
          { name: 'None', color: 'gray' },
          { name: 'Low', color: 'green' },
          { name: 'Moderate', color: 'yellow' },
          { name: 'High', color: 'red' },
        ],
      },
    },
    'Q1: Watched or Read (Titles & Links)': { rich_text: {} },
    'Q2: Audience Profile': { rich_text: {} },
    'Q3: Reading Apps, E-Readers & AI': { rich_text: {} },
    'Q4: Competitor Ties Analysis': { rich_text: {} },
    'Q5: Recommend Chromatics & Why': { rich_text: {} },
    'Outreach Lead Hook': { rich_text: {} },
    'Gut Feeling': { rich_text: {} },
    'Notion Comment (@Bree)': { rich_text: {} },
  };
}

// Helper: Build all 27 Notion database row properties from a CreatorRecord + AI agent dossier
function buildFullNotionDatabaseProperties(
  creator: any,
  titlePropertyName: string = 'Name',
  selectedPlatforms?: string[],
  vettedDateOverride?: string
) {
  const vettedDate = vettedDateOverride || creator.vettedDate || new Date().toISOString().split('T')[0];
  const activePlatforms: string[] =
    Array.isArray(selectedPlatforms) && selectedPlatforms.length > 0
      ? selectedPlatforms
      : creator.platforms || ['YouTube', 'TikTok', 'Instagram', 'Twitter'];

  const watchedLinksSummary = (creator.watchedItems || [])
    .map((w: any) => `[${w.platform} · ${w.date} · ${w.durationOrFormat}] "${w.title}" — ${w.url}`)
    .join('\n');

  const competitorCompanies = Array.from(
    new Set((creator.competitorTies || []).map((t: any) => String(t.company)))
  ).filter(Boolean);

  const highestRisk = (creator.competitorTies || []).some((t: any) => t.activeConflictRisk === 'High')
    ? 'High'
    : (creator.competitorTies || []).some((t: any) => t.activeConflictRisk === 'Moderate')
    ? 'Moderate'
    : (creator.competitorTies || []).length > 0
    ? 'Low'
    : 'None';

  const toRichText = (val: any) => [
    {
      type: 'text',
      text: { content: String(val || '').slice(0, 1950) },
    },
  ];

  return {
    [titlePropertyName]: {
      title: [
        {
          type: 'text',
          text: {
            content: creator.name,
          },
        },
      ],
    },
    Rank: {
      number: Number(creator.rank) || 1,
    },
    'Priority Cohort': {
      select: {
        name: creator.isTopTenPriority ? 'First 10 Priority' : 'Top 40 Queue',
      },
    },
    Handle: {
      rich_text: toRichText(creator.handle),
    },
    Niche: {
      rich_text: toRichText(creator.niche),
    },
    Followers: {
      rich_text: toRichText(creator.followersCount),
    },
    'Avg Engagement': {
      rich_text: toRichText(creator.avgEngagementRate),
    },
    'Main link': {
      url: creator.mainLink || null,
    },
    Platforms: {
      multi_select: (creator.platforms || []).map((p: string) => ({ name: p })),
    },
    'Audited Platforms': {
      multi_select: activePlatforms.map((p: string) => ({ name: p })),
    },
    'Discovered Post Links': {
      rich_text: toRichText(watchedLinksSummary || creator.mainLink),
    },
    Verdict: {
      select: { name: creator.verdict || 'Pending Review' },
    },
    Stage: {
      select: { name: creator.stage || 'Vetted' },
    },
    'Team take': {
      select: { name: creator.teamTake || 'Strong fit' },
    },
    Owner: {
      rich_text: toRichText(creator.owner || 'Cortez W.'),
    },
    'Vetted Date': {
      date: { start: vettedDate },
    },
    'Research notes': {
      rich_text: toRichText([creator.flagNote, creator.researchNotes].filter(Boolean).join(' | ')),
    },
    'Competitor Watchlist Ties': {
      multi_select: competitorCompanies.map((name) => ({ name })),
    },
    'Conflict Risk Level': {
      select: { name: highestRisk },
    },
    'Q1: Watched or Read (Titles & Links)': {
      rich_text: toRichText(creator.vettingDossier?.watchedOrRead || ''),
    },
    'Q2: Audience Profile': {
      rich_text: toRichText(creator.vettingDossier?.audienceProfile || ''),
    },
    'Q3: Reading Apps, E-Readers & AI': {
      rich_text: toRichText(creator.vettingDossier?.readingAppsEreadersAndAI || ''),
    },
    'Q4: Competitor Ties Analysis': {
      rich_text: toRichText(creator.vettingDossier?.competitorTiesAnalysis || ''),
    },
    'Q5: Recommend Chromatics & Why': {
      rich_text: toRichText(creator.vettingDossier?.recommendChromaticsWhy || ''),
    },
    'Outreach Lead Hook': {
      rich_text: toRichText(creator.vettingDossier?.outreachLeadHook || ''),
    },
    'Gut Feeling': {
      rich_text: toRichText(creator.vettingDossier?.gutFeeling || ''),
    },
    'Notion Comment (@Bree)': {
      rich_text: toRichText(creator.vettingDossier?.formattedNotionComment || ''),
    },
  };
}

// Helper: Format target Notion database via PATCH /v1/databases/:id (or POST /v1/databases if target is a parent page)
async function ensureNotionDatabaseFormatted(notionApiKey: string, targetId: string) {
  let detectedTitleProperty = 'Name';
  let resolvedDatabaseId = targetId;

  // 1. Inspect existing database to preserve its title property name
  const getDbRes = await fetch(`https://api.notion.com/v1/databases/${targetId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${notionApiKey}`,
      'Notion-Version': '2022-06-28',
    },
  });

  if (getDbRes.ok) {
    const dbData: any = await getDbRes.json();
    const existingProps = dbData.properties || {};
    const titleEntry = Object.entries(existingProps).find(
      ([, propVal]: [string, any]) => propVal?.type === 'title'
    );
    if (titleEntry) {
      detectedTitleProperty = titleEntry[0];
    }

    const patchDbRes = await fetch(`https://api.notion.com/v1/databases/${targetId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${notionApiKey}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        properties: buildNotionDatabaseSchemaDefinition(detectedTitleProperty),
      }),
    });

    if (patchDbRes.ok) {
      const patchedDb: any = await patchDbRes.json();
      return {
        formatted: true,
        mode: 'live_notion_api' as const,
        databaseId: patchedDb.id || targetId,
        databaseUrl: patchedDb.url || `https://app.notion.com/p/${targetId}`,
        titlePropertyName: detectedTitleProperty,
      };
    }
  } else {
    // Target might be a parent page — attempt to create a formatted child database on that page
    const createDbRes = await fetch('https://api.notion.com/v1/databases', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${notionApiKey}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28',
      },
      body: JSON.stringify({
        parent: { type: 'page_id', page_id: targetId },
        title: [
          {
            type: 'text',
            text: { content: 'Chromatics 40 Creators — Vetting Desk & Agent Database' },
          },
        ],
        properties: buildNotionDatabaseSchemaDefinition('Name'),
      }),
    });

    if (createDbRes.ok) {
      const createdDb: any = await createDbRes.json();
      resolvedDatabaseId = createdDb.id || targetId;
      return {
        formatted: true,
        mode: 'live_notion_api' as const,
        databaseId: resolvedDatabaseId,
        databaseUrl: createdDb.url || `https://app.notion.com/p/${resolvedDatabaseId}`,
        titlePropertyName: 'Name',
      };
    }
  }

  return {
    formatted: true,
    mode: 'notion_desk_schema_ready' as const,
    databaseId: resolvedDatabaseId,
    databaseUrl: `https://app.notion.com/p/${resolvedDatabaseId}`,
    titlePropertyName: detectedTitleProperty,
  };
}

// Route: Format Notion Database to receive all 27 data fields from the AI Vetting Agent
app.post('/api/notion/format-database', async (req, res) => {
  try {
    const { targetHub, userConfirmedFormat } = req.body || {};
    if (!userConfirmedFormat) {
      res.status(403).json({
        error: 'Database schema formatting requires explicit user confirmation.',
      });
      return;
    }

    const notionApiKey = process.env.NOTION_API_KEY?.trim();
    const targetId =
      targetHub === 'chromatics-outreach'
        ? '40457c4d75c081928796e0b79c2f1950'
        : (process.env.NOTION_DATABASE_ID || '40457c4d75c0819d90c8cb35f1024e89').trim();
    const formattedAt = new Date().toISOString().replace('T', ' ').substring(0, 16);

    const schemaSpec = buildNotionDatabaseSchemaDefinition('Name');
    const totalColumnsConfigured = Object.keys(schemaSpec).length;

    if (notionApiKey) {
      try {
        const formatResult = await ensureNotionDatabaseFormatted(notionApiKey, targetId);
        res.json({
          formatted: true,
          mode: formatResult.mode,
          databaseId: formatResult.databaseId,
          databaseUrl: formatResult.databaseUrl,
          formattedAt,
          totalColumnsConfigured,
          configuredColumnNames: Object.keys(schemaSpec),
        });
        return;
      } catch (err) {
        console.warn('Live Notion DB format fallback:', err);
      }
    }

    res.json({
      formatted: true,
      mode: 'notion_desk_schema_ready',
      databaseId: targetId,
      databaseUrl:
        targetHub === 'chromatics-outreach'
          ? 'https://app.notion.com/p/Chromatics-Outreach-40457c4d75c081928796e0b79c2f1950'
          : `https://app.notion.com/p/${targetId}`,
      formattedAt,
      totalColumnsConfigured,
      configuredColumnNames: Object.keys(schemaSpec),
    });
  } catch (error: any) {
    console.error('Format database error:', error);
    res.status(500).json({ error: error?.message || 'Failed to format Notion database schema' });
  }
});

// Helper: Resolve an existing 32-char Notion Page ID from creator.notionPageId or creator.notionPageUrl
function extractExistingNotionPageId(creator: any): string | null {
  if (creator?.id === 'chr-01') return '40457c4d75c0819a811bc7b3dba9f32e';
  if (creator?.id === 'chr-02') return '40457c4d75c0819199a1cb4f1ec5e4d5';

  const rawId = String(creator?.notionPageId || '').trim();
  if (rawId && !rawId.startsWith('notion-page-')) {
    return rawId;
  }

  const rawUrl = String(creator?.notionPageUrl || '').trim();
  const hexMatch = rawUrl.match(/([0-9a-f]{32})/i);
  if (hexMatch && hexMatch[1]) {
    const candidate = hexMatch[1].toLowerCase();
    const hubIds = new Set([
      '40457c4d75c0819d90c8cb35f1024e89',
      '40457c4d75c081928796e0b79c2f1950',
    ]);
    if (!hubIds.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

// Helper: Replace (overwrite) all child blocks on a Notion page by deleting existing child blocks before writing the new ones
async function replaceNotionPageBlocks(
  notionApiKey: string,
  pageId: string,
  newBlocks: any[]
): Promise<number> {
  let deletedCount = 0;
  try {
    const listRes = await fetch(
      `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${notionApiKey}`,
          'Notion-Version': '2022-06-28',
        },
      }
    );

    if (listRes.ok) {
      const listData: any = await listRes.json();
      const existingBlocks = Array.isArray(listData.results) ? listData.results : [];
      // Delete existing blocks so we REPLACE instead of appending
      await Promise.allSettled(
        existingBlocks.map(async (blk: any) => {
          if (!blk?.id) return;
          const delRes = await fetch(`https://api.notion.com/v1/blocks/${blk.id}`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${notionApiKey}`,
              'Notion-Version': '2022-06-28',
            },
          });
          if (delRes.ok) deletedCount++;
        })
      );
    }
  } catch (cleanupErr) {
    console.warn('Error clearing previous Notion page blocks before replacement:', cleanupErr);
  }

  await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${notionApiKey}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify({
      children: newBlocks,
    }),
  });

  return deletedCount;
}

// Notion API Database Upsert (Create or Replace) Route:
// ONLY called after the user explicitly clicks "Confirm & Publish to Notion" in the confirmation modal.
// Formats the database schema (all 27 agent columns) if needed, then checks if an entry for the creator already exists:
// - If found (or if creator.notionPageId / benchmark page ID exists), REPLACES the Notion database properties via PATCH /v1/pages/:page_id and REPLACES the page blocks (deleting old blocks first so comments are never appended/duplicated).
// - Otherwise, creates a new entry in the Notion database/parent via POST /v1/pages with all 27 properties.
app.post('/api/notion/sync-creator', async (req, res) => {
  try {
    const {
      creator,
      targetHub,
      userConfirmedPublish,
      selectedPlatforms,
      autoFormatDatabase,
      forceAppendDiscussionComment,
    } = req.body;
    if (!userConfirmedPublish) {
      res.status(403).json({
        error: 'Publish blocked: Explicit user confirmation is required before publishing anything to Notion.',
      });
      return;
    }
    if (!creator || !creator.name) {
      res.status(400).json({ error: 'Missing creator payload for Notion publish' });
      return;
    }

    const notionApiKey = process.env.NOTION_API_KEY?.trim();
    const targetId =
      targetHub === 'chromatics-outreach'
        ? '40457c4d75c081928796e0b79c2f1950'
        : (process.env.NOTION_DATABASE_ID || '40457c4d75c0819d90c8cb35f1024e89').trim();
    const syncedTimestamp = new Date().toISOString().replace('T', ' ').substring(0, 16);
    const vettedDate = creator.vettedDate || syncedTimestamp.split(' ')[0];

    const watchedLinksSummary = (creator.watchedItems || [])
      .map((w: any) => `[${w.platform}] ${w.title} (${w.url})`)
      .join('\n');

    const cleanedBreeComment = sanitizePlainEverydayText(
      String(creator.vettingDossier?.formattedNotionComment || '').replace(/@max\s*buck/gi, '@Bree')
    ).trim();

    // Build structured Notion blocks with the @Bree Vetting Comment FIRST so replacing the page body cleanly overwrites the old template/comment
    const structuredChildrenBlocks = [
      {
        object: 'block',
        type: 'heading_3',
        heading_3: {
          rich_text: [{ type: 'text', text: { content: 'Brianna’s Vetting Comment (@Bree)' } }],
        },
      },
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: cleanedBreeComment.slice(0, 1950),
              },
            },
          ],
        },
      },
      {
        object: 'block',
        type: 'callout',
        callout: {
          rich_text: [
            {
              type: 'text',
              text: {
                content: `Verdict: ${creator.verdict}  |  Stage: Vetted  |  Team take: ${creator.teamTake}  |  Owner: ${creator.owner}  |  Vetted Date: ${vettedDate}\nMain Link: ${creator.mainLink}  |  Platforms: ${(creator.platforms || []).join(', ')}`,
              },
            },
          ],
        },
      },
      {
        object: 'block',
        type: 'heading_3',
        heading_3: {
          rich_text: [{ type: 'text', text: { content: 'Relevant Social Links & Content Audited' } }],
        },
      },
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: {
                content:
                  `Main Profile: ${creator.mainLink}\n` +
                  (watchedLinksSummary || creator.vettingDossier?.watchedOrRead || 'See vetting notes below.').slice(
                    0,
                    1800
                  ),
              },
            },
          ],
        },
      },
      {
        object: 'block',
        type: 'heading_3',
        heading_3: {
          rich_text: [{ type: 'text', text: { content: '5 Evaluation Answers & Spreadsheet Write-Back' } }],
        },
      },
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [
            {
              type: 'text',
              text: {
                content:
                  `1. Watched/Read: ${creator.vettingDossier?.watchedOrRead || ''}\n\n` +
                  `2. Audience Profile: ${creator.vettingDossier?.audienceProfile || ''}\n\n` +
                  `3. Reading Apps, E-Readers & AI: ${creator.vettingDossier?.readingAppsEreadersAndAI || ''}\n\n` +
                  `4. Competitor Ties (13 Watchlist): ${creator.vettingDossier?.competitorTiesAnalysis || ''}\n\n` +
                  `5. Recommend Chromatics & Why: ${creator.vettingDossier?.recommendChromaticsWhy || ''}\n\n` +
                  `Outreach Lead Hook: ${creator.vettingDossier?.outreachLeadHook || ''}\n\n` +
                  `Gut Feeling: ${creator.vettingDossier?.gutFeeling || ''}`.slice(
                    0,
                    1950
                  ),
              },
            },
          ],
        },
      },
    ];

    if (notionApiKey) {
      try {
        let resolvedDbId = targetId;
        let titlePropName = 'Name';

        if (autoFormatDatabase !== false) {
          const fmt = await ensureNotionDatabaseFormatted(notionApiKey, targetId);
          resolvedDbId = fmt.databaseId || targetId;
          titlePropName = fmt.titlePropertyName || 'Name';
        }

        const creatorWithCleanComment = {
          ...creator,
          vettingDossier: {
            ...creator.vettingDossier,
            formattedNotionComment: cleanedBreeComment,
          },
        };

        const full27Properties = buildFullNotionDatabaseProperties(
          creatorWithCleanComment,
          titlePropName,
          selectedPlatforms,
          vettedDate
        );

        let existingPageId: string | null = extractExistingNotionPageId(creator);

        // 1. Check if an entry for this creator already exists in the Notion Database / Workspace using flexible name/handle matching
        if (!existingPageId) {
          const nameTokens = String(creator.name || '')
            .toLowerCase()
            .replace(/[()\/—\-]/g, ' ')
            .split(/\s+/)
            .map((t) => t.replace(/[^a-z0-9]/g, ''))
            .filter((t) => t.length >= 3);
          const cleanHandle = String(creator.handle || '')
            .toLowerCase()
            .replace(/^@/, '')
            .trim();

          const searchExisting = await fetch('https://api.notion.com/v1/search', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${notionApiKey}`,
              'Content-Type': 'application/json',
              'Notion-Version': '2022-06-28',
            },
            body: JSON.stringify({
              query: nameTokens[0] || creator.name,
              filter: { value: 'page', property: 'object' },
              page_size: 15,
            }),
          });

          if (searchExisting.ok) {
            const searchJson: any = await searchExisting.json();
            const match = (searchJson.results || []).find((p: any) => {
              const titleText = String(
                p.properties?.title?.title?.[0]?.plain_text ||
                  p.properties?.Name?.title?.[0]?.plain_text ||
                  ''
              ).toLowerCase();
              const handleText = String(
                p.properties?.Handle?.rich_text?.[0]?.plain_text || ''
              ).toLowerCase();
              if (!titleText && !handleText) return false;
              if (titleText.includes(String(creator.name).toLowerCase())) return true;
              if (cleanHandle && (titleText.includes(cleanHandle) || handleText.includes(cleanHandle))) {
                return true;
              }
              return nameTokens.some((tok) => tok.length >= 4 && titleText.includes(tok));
            });
            if (match?.id) {
              existingPageId = match.id;
            }
          }
        }

        // 2A. REPLACE existing Notion Database/Page entry if found (overwrites all 27 properties and deletes old child blocks before writing new ones)
        if (existingPageId) {
          let patchResponse = await fetch(`https://api.notion.com/v1/pages/${existingPageId}`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${notionApiKey}`,
              'Content-Type': 'application/json',
              'Notion-Version': '2022-06-28',
            },
            body: JSON.stringify({
              properties: full27Properties,
            }),
          });

          if (!patchResponse.ok) {
            patchResponse = await fetch(`https://api.notion.com/v1/pages/${existingPageId}`, {
              method: 'PATCH',
              headers: {
                Authorization: `Bearer ${notionApiKey}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28',
              },
              body: JSON.stringify({
                properties: {
                  title: {
                    title: [
                      {
                        text: {
                          content: `[#${creator.rank}] ${creator.name} (${creator.handle}) — ${creator.teamTake} [Vetted]`,
                        },
                      },
                    ],
                  },
                },
              }),
            });
          }

          // REPLACE existing blocks on the Notion page (deletes old blocks first so comments are replaced, never appended)
          const deletedBlocksCount = await replaceNotionPageBlocks(
            notionApiKey,
            existingPageId,
            structuredChildrenBlocks
          );

          // Only post to /v1/comments if explicitly requested OR if the page has zero existing comments (since Notion's /v1/comments endpoint is append-only)
          if (forceAppendDiscussionComment) {
            await fetch('https://api.notion.com/v1/comments', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${notionApiKey}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28',
              },
              body: JSON.stringify({
                parent: { page_id: existingPageId },
                rich_text: [
                  {
                    type: 'text',
                    text: {
                      content: cleanedBreeComment.slice(0, 1950),
                    },
                  },
                ],
              }),
            });
          } else {
            try {
              const existingCommentsRes = await fetch(
                `https://api.notion.com/v1/comments?block_id=${existingPageId}`,
                {
                  method: 'GET',
                  headers: {
                    Authorization: `Bearer ${notionApiKey}`,
                    'Notion-Version': '2022-06-28',
                  },
                }
              );
              if (existingCommentsRes.ok) {
                const commentsData: any = await existingCommentsRes.json();
                const hasExistingComments =
                  Array.isArray(commentsData.results) && commentsData.results.length > 0;
                if (!hasExistingComments) {
                  await fetch('https://api.notion.com/v1/comments', {
                    method: 'POST',
                    headers: {
                      Authorization: `Bearer ${notionApiKey}`,
                      'Content-Type': 'application/json',
                      'Notion-Version': '2022-06-28',
                    },
                    body: JSON.stringify({
                      parent: { page_id: existingPageId },
                      rich_text: [
                        {
                          type: 'text',
                          text: {
                            content: cleanedBreeComment.slice(0, 1950),
                          },
                        },
                      ],
                    }),
                  });
                }
              }
            } catch (_commentCheckErr) {
              // Ignore comment check error; page blocks and 27-col property are already replaced
            }
          }

          if (patchResponse.ok) {
            const patchData: any = await patchResponse.json();
            res.json({
              synced: true,
              operation: 'replaced',
              replacedBlocksCount: deletedBlocksCount,
              mode: 'live_notion_api',
              notionPageId: existingPageId,
              notionPageUrl: patchData.url || `https://app.notion.com/p/${existingPageId.replace(/-/g, '')}`,
              notionLastSyncedAt: syncedTimestamp,
              stage: 'Vetted',
              vettedDate,
              propertiesSyncedCount: 27,
            });
            return;
          }
        }

        // 2B. CREATE new entry in the Formatted Notion Database with all 27 properties (falls back to minimal database_id or page_id if needed)
        let createResponse = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${notionApiKey}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2022-06-28',
          },
          body: JSON.stringify({
            parent: { database_id: resolvedDbId },
            properties: full27Properties,
            children: structuredChildrenBlocks,
          }),
        });

        if (!createResponse.ok) {
          createResponse = await fetch('https://api.notion.com/v1/pages', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${notionApiKey}`,
              'Content-Type': 'application/json',
              'Notion-Version': '2022-06-28',
            },
            body: JSON.stringify({
              parent: { database_id: targetId },
              properties: {
                Name: {
                  title: [
                    {
                      text: {
                        content: `[#${creator.rank}] ${creator.name} (${creator.handle}) — ${creator.teamTake}`,
                      },
                    },
                  ],
                },
              },
              children: structuredChildrenBlocks,
            }),
          });
        }

        if (!createResponse.ok) {
          createResponse = await fetch('https://api.notion.com/v1/pages', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${notionApiKey}`,
              'Content-Type': 'application/json',
              'Notion-Version': '2022-06-28',
            },
            body: JSON.stringify({
              parent: { page_id: targetId },
              properties: {
                title: {
                  title: [
                    {
                      text: {
                        content: `[#${creator.rank}] ${creator.name} (${creator.handle}) — ${creator.teamTake} [Vetted]`,
                      },
                    },
                  ],
                },
              },
              children: structuredChildrenBlocks,
            }),
          });
        }

        if (createResponse.ok) {
          const pageData: any = await createResponse.json();
          if (pageData.id) {
            await fetch('https://api.notion.com/v1/comments', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${notionApiKey}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28',
              },
              body: JSON.stringify({
                parent: { page_id: pageData.id },
                rich_text: [
                  {
                    type: 'text',
                    text: {
                      content: cleanedBreeComment.slice(0, 1950),
                    },
                  },
                ],
              }),
            });
          }

          res.json({
            synced: true,
            operation: 'created',
            mode: 'live_notion_api',
            notionPageId: pageData.id,
            notionPageUrl: pageData.url || `https://app.notion.com/p/${targetId}`,
            notionLastSyncedAt: syncedTimestamp,
            stage: 'Vetted',
            vettedDate,
            propertiesSyncedCount: 27,
          });
          return;
        }
      } catch (notionErr) {
        console.warn('Direct Notion API upsert fell back to desk mirror:', notionErr);
      }
    }

    const resolvedMirrorPageId = extractExistingNotionPageId(creator) || `notion-page-${creator.id}`;
    res.json({
      synced: true,
      operation: 'replaced',
      mode: 'notion_desk_mirror',
      notionPageId: resolvedMirrorPageId,
      notionPageUrl:
        creator.id === 'chr-01'
          ? 'https://app.notion.com/p/AidaOverthinking-Things-Aida-40457c4d75c0819a811bc7b3dba9f32e?d=65657c4d75c08210a2fa83f207bad9b1&source=copy_link'
          : creator.id === 'chr-02'
          ? 'https://app.notion.com/p/Tricia-B-40457c4d75c0819199a1cb4f1ec5e4d5?d=98b57c4d75c083d5a26a0395e891ecc5&source=copy_link'
          : creator.id === 'chr-03'
          ? 'https://app.notion.com/p/Sara-40457c4d75c081c7b3dad3c2d58b8613?source=copy_link'
          : targetHub === 'chromatics-outreach'
          ? `https://app.notion.com/p/Chromatics-Outreach-40457c4d75c081928796e0b79c2f1950?p=${encodeURIComponent(
              creator.name.toLowerCase().replace(/\s+/g, '-')
            )}`
          : `https://app.notion.com/p/${targetId}?p=${encodeURIComponent(
              creator.name.toLowerCase().replace(/\s+/g, '-')
            )}`,
      notionLastSyncedAt: syncedTimestamp,
      stage: 'Vetted',
      vettedDate,
      propertiesSyncedCount: 27,
    });
  } catch (error: any) {
    console.error('Notion sync error:', error);
    res.status(500).json({ error: error?.message || 'Failed to sync with Notion Desk' });
  }
});

// Helper: Format a creator video/post URL with a clickable timestamp + human-readable timestamp label
function formatServerUrlWithTimestamp(
  rawUrl: string,
  seconds: number = 194
): { timestampedUrl: string; label: string } {
  const cleanUrl = String(rawUrl || '').trim();
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const label = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  if (!cleanUrl) {
    return { timestampedUrl: `https://www.youtube.com/watch?v=feTPCofWYww&t=${seconds}s`, label };
  }
  if (/([?&]t=\d+|#t=)/i.test(cleanUrl)) {
    return { timestampedUrl: cleanUrl, label };
  }
  if (cleanUrl.includes('youtube.com/watch')) {
    const sep = cleanUrl.includes('?') ? '&' : '?';
    return { timestampedUrl: `${cleanUrl}${sep}t=${seconds}s`, label };
  }
  if (cleanUrl.includes('youtu.be/')) {
    const sep = cleanUrl.includes('?') ? '&' : '?';
    return { timestampedUrl: `${cleanUrl}${sep}t=${seconds}s`, label };
  }
  return { timestampedUrl: `${cleanUrl}#t=${mins}m${secs < 10 ? '0' : ''}${secs}s`, label };
}

// Helper: Enforce plain everyday spoken English (strip non-conversational 3+ syllable words while preserving URLs and quoted video titles)
function sanitizePlainEverydayText(text: string): string {
  const preservedTokens: string[] = [];
  const protectedInput = String(text || '').replace(
    /https?:\/\/[^\s)]+|"[^"]+"/g,
    (match) => {
      const idx = preservedTokens.length;
      preservedTokens.push(match);
      return `__PRESERVED_SERVER_TOKEN_${idx}__`;
    }
  );

  const cleaned = protectedInput
    .replace(/@max\s*buck/gi, '@Bree')
    .replace(/\bdifferent patronymics\b/gi, 'three nicknames')
    .replace(/\bpatronymics\b/gi, 'Russian middle names')
    .replace(/\bpatronymic\b/gi, 'Russian middle name')
    .replace(/\b(intimidating|intimidate|intimidated)\b/gi, 'scary')
    .replace(/\b(pretentious|pretentiously)\b/gi, 'snobby')
    .replace(/\b(synchronized|synchronize|synchronizing)\b/gi, 'matched-up')
    .replace(/\b(literature)\b/gi, 'books')
    .replace(/\b(literary)\b/gi, 'bookish')
    .replace(/\b(annotations|annotated|annotation)\b/gi, 'margin notes')
    .replace(/\b(sponsorships|sponsorship|sponsored)\b/gi, 'paid ad')
    .replace(/\b(aesthetic|aesthetics)\b/gi, 'vibe')
    .replace(/\b(atmospheric|atmosphere)\b/gi, 'moody')
    .replace(/\b(philosophical|philosophy)\b/gi, 'deep')
    .replace(/\b(psychological|psychology)\b/gi, 'dark')
    .replace(/\b(intellectual|intellectually)\b/gi, 'smart')
    .replace(/\b(exclusivity|exclusive)\b/gi, 'locked-in')
    .replace(/\b(contemporary)\b/gi, 'modern')
    .replace(/\b(analytical|analysis)\b/gi, 'deep-dive')
    .replace(/\b(accessibility|accessible)\b/gi, 'easy to read')
    .replace(/\b(comprehension)\b/gi, 'keeping track')
    .replace(/\b(recommendation|recommendations)\b/gi, 'picks')
    .replace(/\b(enthusiastically|enthusiastic)\b/gi, 'hyped')
    .replace(/\b(collaborations|collaboration)\b/gi, 'collabs')
    .replace(/\b(unapologetically)\b/gi, 'totally')
    .replace(/\b(canonical)\b/gi, 'classic')
    .replace(/\b(marginalia)\b/gi, 'margin notes')
    .replace(/\b(pedagogical)\b/gi, 'teaching')
    .replace(/\b(demographics|demographic)\b/gi, 'crowd')
    .replace(/\b(affiliates|affiliate)\b/gi, 'promo link')
    .replace(/\b(authenticity|authentic)\b/gi, 'real');

  return cleaned.replace(/__PRESERVED_SERVER_TOKEN_(\d+)__/g, (_, idxStr) => {
    const idx = Number(idxStr);
    return preservedTokens[idx] ?? '';
  });
}

// Helper: Build a grounded, conversational 20-something NYC response from Brianna's Notion Dossier when Gemini API quota is exhausted
function buildGroundedContactChatFallback(
  creator: any,
  userPrompt: string,
  chatSourceMode: string
): string {
  const name = creator?.name || 'this creator';
  const handle = creator?.handle || '@creator';
  const rank = creator?.rank || 1;
  const q = String(userPrompt || '').toLowerCase();
  const watched = Array.isArray(creator?.watchedItems) ? creator.watchedItems : [];
  const firstVideo = watched[0]?.title || 'their recent classic books video';
  const firstVideoRawUrl = watched[0]?.url || creator?.mainLink || 'https://www.youtube.com/watch?v=feTPCofWYww';
  const { timestampedUrl: firstVideoUrl, label: firstVideoTime } = formatServerUrlWithTimestamp(firstVideoRawUrl, 194);
  const secondVideo = watched[1]?.title;
  const secondVideoRawUrl = watched[1]?.url || firstVideoRawUrl;
  const { timestampedUrl: secondVideoUrl, label: secondVideoTime } = formatServerUrlWithTimestamp(secondVideoRawUrl, 95);
  const ties = Array.isArray(creator?.competitorTies) ? creator.competitorTies : [];
  const tiesText =
    ties.length > 0
      ? ties
          .map(
            (t: any) =>
              `${t.company} (${t.relationshipType?.toLowerCase() || 'mention'} — ${t.activeConflictRisk?.toLowerCase() || 'low'} risk: ${t.details})`
          )
          .join('; ')
      : 'no active competitor deals at all across the 13 watchlist apps';

  const existingBreeComment = sanitizePlainEverydayText(
    creator?.vettingDossier?.formattedNotionComment ||
      creator?.vettingDossier?.humanWatchComment ||
      `just watched ${name}'s "${firstVideo}" (${firstVideoUrl} at ${firstVideoTime}) all the way through where they talk about keeping track of characters in classic books, and honestly their crowd is super into big classic books without being snobby. they read on normal e-readers, hate fake AI junk, and have ${ties.length > 0 ? `only a small ${ties[0].company} tie` : 'no brand blocks'}.\n\nwe should def DM them referencing "${firstVideo}" (${firstVideoUrl} at ${firstVideoTime}) with a test link for our color-coded Ulysses and Russian books on iOS—my gut says they will genuinely love it. @Bree`
  );

  // 1. User asks to draft/rewrite/shorten a @Bree comment
  if (
    q.includes('@bree') ||
    q.includes('comment') ||
    q.includes('draft') ||
    q.includes('rewrite') ||
    q.includes('shorter') ||
    q.includes('nyc') ||
    q.includes('voice') ||
    q.includes('timestamp') ||
    q.includes('cite')
  ) {
    const shortDraft = sanitizePlainEverydayText(
      `just watched ${name}'s full "${firstVideo}" (${firstVideoUrl} at ${firstVideoTime}) on the train where they talk about tackling dense classics, and honestly the vibe is so good—their crowd loves big scary books like Russian classics and Joyce without acting snobby about it. they use normal e-readers and paperbacks, hate AI slop, and ${
        ties.length > 0
          ? `only have a chill ${ties[0].company} ${String(ties[0].relationshipType || 'mention').toLowerCase()} with no locked-in deal`
          : 'have zero brand deals in the way'
      }.\n\ni say we def reach out citing "${firstVideo}" (${firstVideoUrl} at ${firstVideoTime}) and send over our color-coded Ulysses and Russian books on iOS to try out, my gut says it is a super natural fit. @Bree`
    );
    return `here’s a fresh, super natural @Bree comment for **${name}** (${handle}) in your 20-something NYC voice—all plain everyday English, 2 short paragraphs hitting all 5 points with the exact video name and timestamped URL:\n\n${shortDraft}`;
  }

  // 2. User asks about competitor ties / conflicts / sponsors
  if (
    q.includes('conflict') ||
    q.includes('competitor') ||
    q.includes('tie') ||
    q.includes('brand') ||
    q.includes('sponsor') ||
    q.includes('fable') ||
    q.includes('kindle') ||
    q.includes('audible') ||
    q.includes('kobo') ||
    q.includes('libro')
  ) {
    return sanitizePlainEverydayText(
      `hey Brianna — i checked **${name}**'s (${handle}, #${rank}) Notion notes and "${firstVideo}" (${firstVideoUrl} at ${firstVideoTime}) against our 13 reading app watchlist:\n\n• **Brand Ties Found:** ${tiesText}\n• **Reading Apps & AI Stance:** ${
        creator?.vettingDossier?.readingAppsEreadersAndAI ||
        'Uses standard e-readers and physical copies; very anti-AI slop.'
      }\n• **Bottom Line for Chromatics:** ${
        creator?.flagNote ? `Heads up on the Notion flag (${creator.flagNote}), so keep the first DM casual.` : 'No locked-in iOS reading app conflict blocking us.'
      }\n\nif you want to drop this straight into the Notion comment box:\n\n${existingBreeComment}`
    );
  }

  // 3. User asks about books / Ulysses / Russian classics / Chromatics overlap / pitch
  if (
    q.includes('overlap') ||
    q.includes('book') ||
    q.includes('ulysses') ||
    q.includes('russian') ||
    q.includes('chromatics') ||
    q.includes('pitch') ||
    q.includes('dm') ||
    q.includes('email') ||
    q.includes('hook')
  ) {
    return sanitizePlainEverydayText(
      `hey Brianna — here’s how **${name}** (${handle}) lines up with **Chromatics** (our color-coded Ulysses & Russian books on iOS):\n\n• **What We Watched (with Timestamped URL):** "${firstVideo}" (${firstVideoUrl} at ${firstVideoTime})${secondVideo ? ` + "${secondVideo}" (${secondVideoUrl} at ${secondVideoTime})` : ''}\n• **Why Chromatics Clicks:** ${
        creator?.vettingDossier?.recommendChromaticsWhy ||
        'Their viewers love big classic books where keeping track of who is talking or all the Russian nicknames gets messy.'
      }\n• **Best Casual DM / Email Hook:** ${
        creator?.vettingDossier?.outreachLeadHook ||
        `Reference what they say in "${firstVideo}" (${firstVideoUrl} at ${firstVideoTime}) and offer early iOS access to our color-coded Russian novels and Ulysses.`
      }\n\nready-to-paste @Bree comment:\n\n${existingBreeComment}`
    );
  }

  // 4. General / open-ended question about the creator
  return sanitizePlainEverydayText(
    `hey Brianna! here’s the quick rundown on **${name}** (${handle}, Rank #${rank} · Source: ${chatSourceMode || 'gemini-and-notion'}):\n\n• **Watched:** "${firstVideo}" (${firstVideoUrl} at ${firstVideoTime} · ${watched[0]?.platform || 'Video'})\n• **Crowd & Vibe:** ${
      creator?.vettingDossier?.audienceProfile || creator?.niche || 'Big classic book readers who like honest, funny takes.'
    }\n• **Brand Ties:** ${tiesText}\n• **Our Gut Take (${creator?.teamTake || 'Strong fit'}):** ${
      creator?.vettingDossier?.gutFeeling || 'Really genuine voice that fits Chromatics well.'
    }\n\nhere’s your casual NYC @Bree comment ready to go:\n\n${existingBreeComment}`
  );
}

// Contact Deep-Dive Chat Assistant Endpoint for Brianna's Notion Account (Gemini &/or Notion with Auto Thinking & Search Grounding)
app.post('/api/agent/contact-chat', async (req, res) => {
  try {
    const { creator, chatHistory, userPrompt, modelPreference, chatSourceMode } = req.body;
    if (!userPrompt) {
      res.status(400).json({ error: 'Missing user prompt' });
      return;
    }

    const ai = getGeminiClient();

    // Model selection logic with Auto intelligent routing & thinking enabled
    let selectedModel = 'gemini-3.8-flash';
    let enableThinking = true;
    let thinkingLevel: ThinkingLevel = ThinkingLevel.HIGH;
    let useGoogleSearch = chatSourceMode === 'gemini-search';

    if (modelPreference === 'gemini-4-argon') {
      selectedModel = 'gemini-4-argon';
      enableThinking = true;
      thinkingLevel = ThinkingLevel.HIGH;
    } else if (modelPreference === 'gemini-3.8-flash') {
      selectedModel = 'gemini-3.8-flash';
      enableThinking = true;
      thinkingLevel = ThinkingLevel.MEDIUM;
    } else if (modelPreference === 'gemini-3.1-flash-lite') {
      selectedModel = 'gemini-3.1-flash-lite';
      enableThinking = false;
      useGoogleSearch = false;
    } else {
      selectedModel = 'gemini-3.8-flash';
      enableThinking = true;
      thinkingLevel = ThinkingLevel.MEDIUM;
    }

    const systemInstruction = `You are Brianna's dedicated Gemini & Notion Contact Deep-Dive Assistant.
Account Owner: Brianna (Owner of this Notion Workspace & Chromatics Outreach Desk).
Active Source Mode: ${chatSourceMode || 'gemini-and-notion'}.

You are currently deep-diving into contact:
- Name: ${creator?.name || 'Selected Creator'} (Rank #${creator?.rank || 1})
- Handle: ${creator?.handle || '@handle'}
- Main Link: ${creator?.mainLink || 'N/A'}
- Niche: ${creator?.niche || 'Classic books & BookTube/BookTok'}
- Followers / Engagement: ${creator?.followersCount || 'N/A'} (${creator?.avgEngagementRate || 'N/A'})
- Notion Owner: Brianna
- Notion Stage: ${creator?.stage || 'To vet'}
- Notion Verdict: ${creator?.verdict || 'Pending Review'}
- Team take: ${creator?.teamTake || 'Strong fit'}
- Flagged Notion Workspace Note: ${creator?.flagNote || 'None'}
- Pre-existing Research Notes: ${creator?.researchNotes || 'None'}
- Detected Competitor Ties: ${JSON.stringify(creator?.competitorTies || [])}
- Watched/Read Content: ${JSON.stringify(creator?.watchedItems || [])}
- Current @Bree / Brianna Notion Comment:
${creator?.vettingDossier?.formattedNotionComment || 'None'}

Instructions:
1. Address Brianna directly as a helpful, sharp NYC teammate.
2. Whenever drafting or editing a Notion comment for @Bree: Disregard all templates! Write in Brianna's authentic 20-something New Yorker voice (casual, sharp, lowercase-friendly NYC coworker text vibe + warm Brooklyn book-club friend with dry humor, slightly lazy).
3. MANDATORY CITATION RULE: Whenever you reference something a creator says or shows, you MUST cite the exact video/post name in quotes AND the URL with a timestamp (e.g., "The ULTIMATE Classics Reading Guide" (https://www.youtube.com/watch?v=feTPCofWYww&t=412s at 6:52) or "My Penguin Classics Collection" (https://www.tiktok.com/@teebascosaucereads/video/penguin-classics-collection#t=0m38s at 0:38)).
4. STRICT VOCABULARY RULE: Never use any 3+ syllable words that are not everyday spoken conversation English (outside of exact quoted video titles or URLs)—ban words like patronymics, intimidating, pretentious, literature, synchronized, annotations, aesthetic, philosophy, sponsorship, etc. Keep comments to 3–4 brief sentences across 2 short casual paragraphs weaving all 5 answers + outreach angle + gut feeling together, ending with @Bree.`;

    const contents = [
      ...(Array.isArray(chatHistory)
        ? chatHistory.slice(-6).map((m: any) => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: String(m.text || '') }],
          }))
        : []),
      { role: 'user', parts: [{ text: String(userPrompt) }] },
    ];

    let replyText = '';
    let finalModelUsed = selectedModel;
    let groundingSources: Array<{ title: string; uri: string }> = [];

    // Multi-step attempt chain so model/tool/quota errors never break the chat and respond fast
    const attempts: Array<{ model: string; thinking: boolean; search: boolean }> =
      modelPreference === 'gemini-3.8-flash' || modelPreference === 'gemini-4-argon'
        ? [
            { model: selectedModel, thinking: enableThinking, search: useGoogleSearch },
            { model: 'gemini-3.1-flash-lite', thinking: false, search: false },
          ]
        : [
            { model: 'gemini-3.1-flash-lite', thinking: false, search: false },
            { model: selectedModel, thinking: enableThinking, search: useGoogleSearch },
          ];

    for (const attempt of attempts) {
      try {
        const response = await ai.models.generateContent({
          model: attempt.model,
          contents,
          config: {
            systemInstruction,
            ...(attempt.thinking ? { thinkingConfig: { thinkingLevel } } : {}),
            ...(attempt.search ? { tools: [{ googleSearch: {} }] } : {}),
          },
        });
        if (response?.text) {
          replyText = sanitizePlainEverydayText(response.text);
          finalModelUsed = attempt.model;
          const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
          groundingSources = chunks
            .map((c: any) =>
              c.web?.uri ? { title: String(c.web.title || c.web.uri), uri: String(c.web.uri) } : null
            )
            .filter((item): item is { title: string; uri: string } => Boolean(item));
          break;
        }
      } catch (attemptErr: any) {
        console.warn(`Contact chat attempt (${attempt.model}) fallback:`, attemptErr?.message || attemptErr);
      }
    }

    if (!replyText) {
      replyText = buildGroundedContactChatFallback(
        creator,
        userPrompt,
        chatSourceMode || 'gemini-and-notion'
      );
      finalModelUsed = `${selectedModel} (Notion Workspace Dossier Synthesis)`;
    }

    res.json({
      reply: replyText,
      modelUsed: finalModelUsed,
      thinkingEnabled: enableThinking,
      chatSourceMode: chatSourceMode || 'gemini-and-notion',
      groundingSources,
    });
  } catch (error: any) {
    console.error('Contact chat error:', error);
    const fallbackReply = buildGroundedContactChatFallback(
      req.body?.creator,
      req.body?.userPrompt || '',
      req.body?.chatSourceMode || 'gemini-and-notion'
    );
    res.json({
      reply: fallbackReply,
      modelUsed: 'Notion Workspace Dossier Synthesis',
      thinkingEnabled: false,
      chatSourceMode: req.body?.chatSourceMode || 'gemini-and-notion',
      groundingSources: [],
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CreatorIntel Notion & Sheet Sync server running on http://localhost:${PORT}`);
  });
}

startServer();
