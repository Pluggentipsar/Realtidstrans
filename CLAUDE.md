@AGENTS.md

# Realtidstrans

AI-drivet stod for intervjuer, panelsamtal och forelasningar med realtidstranskribering, smarta sammanfattningar och publikinteraktion.

## Tech Stack

- **Framework**: Next.js 16 (App Router) + TypeScript
- **Styling**: Tailwind CSS 4 + CSS custom properties designsystem
- **Real-time**: Socket.io (WebSocket)
- **Transcription**: Azure Speech Services (Conversation Transcription + Speaker Recognition)
- **AI**: Claude Sonnet (deep analysis) + Claude Haiku (fast tasks) via Azure API
- **Database**: PostgreSQL via Prisma (schema ready, in-memory store for dev)
- **Audio**: Web Audio API + MediaRecorder

## Architecture

```
/session/new          → Session setup (5-tab briefing)
/session/[id]/moderator → Moderator cockpit (3-column: transcript | AI questions | audience)
/session/[id]/soundcheck → Speaker voice enrollment
/session/[id]          → Projector view (F11 fullscreen, Ctrl+/- text size)
/session/[id]/audience  → Audience mobile view (reactions, questions, polls)
/session/[id]/dashboard → Post-session analytics + export
/sessions              → Session history list
/join                  → Join by 6-digit code
```

## Project Structure

```
src/
├── app/                          # Next.js App Router
│   ├── api/sessions/             # REST API (CRUD, briefing, summary, questions, polls, etc.)
│   ├── session/[id]/             # All session views (moderator, audience, soundcheck, dashboard)
│   ├── sessions/                 # Session history
│   ├── join/                     # Join by code
│   └── layout.tsx                # Root layout with navbar
├── components/ui/                # Reusable UI components
│   ├── presentation-view.tsx     # F11 focus mode with keyboard shortcuts
│   ├── text-size-provider.tsx    # Ctrl+/- text scaling (60%-300%)
│   ├── audio-visualizer.tsx      # Canvas-based waveform/bars/pulse
│   ├── ai-status.tsx             # AI processing indicators + notifications
│   ├── recording-manager.tsx     # Session recording with download
│   ├── live-speaker-bar.tsx      # Speaker time tracking + targeting
│   ├── question-focus-selector.tsx # Question type selection
│   └── export-panel.tsx          # Copy/download results
├── lib/
│   ├── claude-ai.ts              # Dual-model AI (Sonnet/Haiku) with rate limiting
│   ├── azure-speech.ts           # Transcription + voice enrollment
│   ├── token-manager.ts          # Token budgets, truncation, cost tracking
│   ├── prompts/system.ts         # All AI prompts + buildSessionContext()
│   ├── audio-capture.ts          # Browser audio capture with offline buffering
│   ├── socket.ts                 # Socket.io client
│   └── utils.ts                  # Helpers
├── server/
│   ├── session-store.ts          # In-memory data store (all CRUD)
│   ├── socket-handler.ts         # Socket.io event handlers
│   ├── ai-processor.ts           # Interval/topic-shift processing loop
│   └── engagement-tracker.ts     # Temperature + reaction tracking
├── types/index.ts                # All TypeScript types
└── generated/prisma/             # Prisma client (after npx prisma generate)
```

## Key AI Features

- **Dual model**: Sonnet for summaries/questions, Haiku for topic detection/quotes
- **6 question focus modes**: balanced, challenging, perspectives, gaps, connections, clarifying
- **Speaker targeting**: direct questions to least/most active speaker
- **Token management**: budgets per function, chunked processing for long sessions
- **Rate limiting**: configurable per-minute/per-hour limits
- **Session briefing**: agenda, speaker bios, prepared questions feed into AI context

## Development Commands

```bash
npm run dev              # Next.js dev server
npm run dev:server       # Socket.io custom server (for real-time features)
npm run build            # Production build
npm run lint             # ESLint
npm run type-check       # TypeScript
npx prisma generate      # Generate Prisma client (after setting DATABASE_URL)
```

## Environment Variables

See `.env.example` for all required variables. Key ones:
- `AZURE_SPEECH_KEY` / `AZURE_SPEECH_REGION` — transcription
- `AZURE_CLAUDE_API_KEY` / `AZURE_CLAUDE_ENDPOINT` — AI
- `AZURE_CLAUDE_DEPLOYMENT_DEEP` / `_FAST` — dual model routing

## Code Conventions

- TypeScript strict mode, all code in English, UI text in Swedish
- CSS custom properties for theming (see globals.css)
- Socket.io events typed in `types/index.ts` (ServerToClientEvents / ClientToServerEvents)
- AI prompts in `lib/prompts/system.ts` — always use `buildSessionContext()`
- Token budgets in `lib/token-manager.ts` — all AI calls go through `callClaude()`
