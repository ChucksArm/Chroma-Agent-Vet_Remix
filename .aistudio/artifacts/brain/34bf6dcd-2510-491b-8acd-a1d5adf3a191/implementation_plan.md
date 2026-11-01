# Implementation Plan: 4-Mode Project Tone Engine, Progressive Fatigue Curve (#4–#40), & Reference Benchmarks (#1–#3)

## 1. Confirmed Product & UX Decisions
1. **Global + Per-Creator 4-Mode Tone Switcher**:
   - A prominent **4-Mode Project Tone Switcher** in the header and Notion Desk / Mobile Quick Vetting toolbar that immediately rewrites **Ranks #4–#40** across all comments, Notion copy blocks, and boss vetting notes when toggled.
   - An individual **Per-Creator Tone Override** selector inside each creator's detail drawer and card so any single creator can be pinned to a specific voice mode (including optionally testing overrides on Ranks #1–#3 while keeping them locked to `Reference Only` by default).
2. **Progressive Fatigue & Typo Curve (Ranks #4–#40)**:
   - **Early Queue (Ranks #4–#14)**: Authentic casual lowercase, loose punctuation, run-on sentences, and occasional natural keyboard slips (`teh`, `def`, `bc`, `tbh`).
   - **Mid Queue (Ranks #15–#26)**: Noticeably looser run-on thoughts, dropped apostrophes (`dont`, `id`, `youre`, `isnt`), and faster typing shortcuts.
   - **Late Queue Fatigue (Ranks #27–#40)**: Heavy unedited late-night texting style as if the reviewer is getting tired at the bottom of the list—frequent phonetic/adjacent-key misspellings (`mire`, `te`, `reccomend`, `probly`, `thier`, `woudl`, `basicly`, `literaly`), trailing thoughts, and zero capitalization.
   - **Strict URL & Timestamp Protection**: A dedicated tokenizer splits out all URLs (`https://...`) and timestamp citations (`04:18`, `&t=258s`, `#t=04m18s`) before applying lowercase, run-on, or fatigue typo transforms, then re-injects them verbatim so every link and timestamp works 100% intact.
3. **Ranks #1–#3 Locked as Reference Benchmarks**:
   - **Rank #1 (`AidaOverthinking Things / Aida`)**: Preserved with her exact Notion URL (`https://app.notion.com/p/AidaOverthinking-Things-Aida-40457c4d75c0819a811bc7b3dba9f32e?d=65657c4d75c08210a2fa83f207bad9b1&source=copy_link`), YouTube (`https://www.youtube.com/watch?v=feTPCofWYww`), Instagram (`https://www.instagram.com/overthinking__things?obrf=Z25udjVxOGw3eXJs`), Chromatics collection link (`https://chromatics.mobile/collections/russian-novels/`), her structured note, and `@Max Buck`'s critique explaining why structured bullet headers look like AI.
   - **Rank #2 (`Tricia B. / @teebascosaucereads`)**: Preserved with her exact "My Penguin Classics Collection" (53-book physical collection) and "Books I Couldn't Put Down" notes plus `@Max Buck`'s feedback on why her review also read too much like AI.
   - **Rank #3 (`Sara / @bookish.victorian`)**: Updated to her exact Notion page (`https://app.notion.com/p/Sara-40457c4d75c081c7b3dad3c2d58b8613?source=copy_link`), her Instagram (`https://www.instagram.com/bookish.victorian?xtok=MXRxeXZoNnVvNnV5NA==`), the **3 watched profile highlight stories** (`book II`, `collaborations`, `book reviews`), and her exact gold-standard casual human reference note:
     - *"her readers are design nerds who read on their phones during morning train rides instead of scrolling, she hates ai slop but loves good app design, she only mentions apple books and serial reader for fun with zero paid ads. i'd quote her line about e-books feeling flat and tell her we made chromatics on iOS with color-coded lines and matched-up audio to fix that exact thing. gut says total slam dunk, she basically wrote our pitch for us"*

---

## 2. The 4 Voice Modes Specification

| Mode ID | Label | Persona & Writing Mechanics |
| :--- | :--- | :--- |
| `nyc-20s` | **20-Something NYC** | Fast-talking, sharp NYC media/publishing assistant energy. Casual American English, lowercase starts, conversational run-ons (`honestly watched her breakdown at... and wait it's actually so good`), zero stiff headers, direct timestamps & links. |
| `bree-loose` | **Loose Bree Unedited** | Stream-of-consciousness Slack/Notion dump after watching the creator's best video/stories. Loosely hits who watches them, tech/AI vibe, sponsorships, Chromatics angle, and gut reaction in one flowing unedited block with natural typos and fatigue scaling from #4 to #40. |
| `hybrid-nyc-bree` | **NYC + Bree Hybrid** | Combines the punchy 4-bullet casual format from Sara's `@bookish.victorian` benchmark with Bree's loose unedited lowercase run-ons, bad capitalization, and progressive late-queue fatigue (`mire`, `te`, `def`) toward Rank #40. |
| `sf-ya-6th-grade` | **SF YA 6th-Grade Reader** | Written from the perspective of someone who reads ~5 science fiction / YA books a year and uses simple, concrete 6th-grade vocabulary (`super cool`, `hard to keep track of all the people talking`, `the color lines make it way easier to follow along with the voice`). No literary jargon, very casual punctuation, intact links and timestamps. |

---

## 3. Architecture & File Changes

### A. `/src/types.ts`
- Add `ProjectToneMode = 'nyc-20s' | 'bree-loose' | 'hybrid-nyc-bree' | 'sf-ya-6th-grade'`.
- Add optional fields on `Creator`:
  - `isReferenceBenchmark?: boolean` (true for Ranks #1–#3)
  - `savedStoriesWatched?: string[]` (for Sara's `['book II', 'collaborations', 'book reviews']`)
  - `toneOverride?: ProjectToneMode | 'reference-locked'`

### B. `/src/data/initialCreators.ts`
- **Update Rank #3 (`chr-03` — Sara `@bookish.victorian`)**:
  - Set `notionUrl` to `https://app.notion.com/p/Sara-40457c4d75c081c7b3dad3c2d58b8613?source=copy_link`.
  - Set primary platform to Instagram with URL `https://www.instagram.com/bookish.victorian?xtok=MXRxeXZoNnVvNnV5NA==` and `savedStoriesWatched: ['book II', 'collaborations', 'book reviews']`.
  - Store her exact casual human note as the gold-standard reference alongside Aida (#1) and Tricia (#2).
- **Build `formatCreatorNoteByTone(creator, mode, applyFatigue)` Engine**:
  - Implements all 4 tone voices (`nyc-20s`, `bree-loose`, `hybrid-nyc-bree`, `sf-ya-6th-grade`).
  - Loosely weaves the 5 boss questions into natural commentary anchored around the creator's highest-viewed video/post or watched stories, preserving exact URLs and `#t=` / `&t=` timestamps.
  - Applies the **Rank #4–#40 Fatigue Curve** (`applyRankFatigueTypos(text, rankNumber)`) using a safe URL/timestamp tokenizer so links are never corrupted while late-list entries (#27–#40) exhibit realistic tired typing (`te`, `mire`, `probly`, `thier`, `reccomend`, etc.).

### C. `/src/App.tsx` & `/src/components/MobileQuickVettingView.tsx`
- Add the **4-Mode Project Tone Switcher Bar** at the top of the workspace (and in Mobile Quick Vetting) with one-click switching across all 4 modes, a toggle indicator showing the active fatigue curve on Ranks #4–#40, and a "Ranks #1–#3 Locked as Reference" badge.
- Add a **Per-Creator Tone Override** pill selector in the creator detail view and Notion Desk row so any creator (#4–#40, or optionally #1–#3 if unlocked) can be previewed in any of the 4 voices and copied with 1 click.

### D. `/server.ts`
- Update `/api/agent/vet-creator` and `/api/agent/contact-chat` prompts to accept `toneMode` (`nyc-20s`, `bree-loose`, `hybrid-nyc-bree`, `sf-ya-6th-grade`) and `rankNumber` so live AI re-vetting also honors the selected tone, fatigue level, and strict URL/timestamp preservation.
