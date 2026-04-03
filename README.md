# Realtidstrans

AI-drivet stod for intervjuer, panelsamtal och forelasningar. Realtidstranskribering med talaridentifiering, smarta sammanfattningar, fordjupande fragor och publikinteraktion.

## Funktioner

- **Realtidstranskribering** med talaridentifiering (Azure Speech Services)
- **AI-sammanfattningar** (intervall- eller amnesbaserat)
- **AI-genererade fragor** — djavulens advokat, perspektiv, luckor, kopplingar
- **Citat-extraktion** — quotable moments
- **Publikinteraktion** — fragor, omrostningar, reaktioner via sessionskod
- **Moderator-cockpit** — 3-kolumns kontrollpanel
- **Presentationslage** — fullskarm, stor text, tangentbordsgenvagar
- **Engagemangs-matning** — temperatur, talartid, reaktioner
- **Inspelning** — automatisk backup med nedladdning
- **Export** — markdown, kopiera citat, sammanfattningar

## Kom igang

### 1. Installera

```bash
git clone https://github.com/Pluggentipsar/Realtidstrans.git
cd Realtidstrans
npm install
```

### 2. Konfigurera

```bash
cp .env.example .env.local
```

Fyll i nycklar i `.env.local`:

| Variabel | Beskrivning |
|----------|-------------|
| `AZURE_SPEECH_KEY` | Azure Speech Services nyckel |
| `AZURE_SPEECH_REGION` | Azure-region (t.ex. `swedencentral`) |
| `AZURE_CLAUDE_API_KEY` | Claude API-nyckel via Azure |
| `AZURE_CLAUDE_ENDPOINT` | Azure endpoint URL |
| `AZURE_CLAUDE_DEPLOYMENT_DEEP` | Sonnet deployment-namn |
| `AZURE_CLAUDE_DEPLOYMENT_FAST` | Haiku deployment-namn |

### 3. Starta

```bash
# Utvecklingsserver (utan realtidstranskribering)
npm run dev

# Med Socket.io-server (for realtidsfunktioner)
npm run dev:server
```

Oppna [http://localhost:3000](http://localhost:3000)

### 4. Databas (valfritt)

```bash
# Satt DATABASE_URL i .env.local forst
npx prisma generate
npx prisma db push
```

## Anvandning

### Flodet

1. **Skapa session** (`/session/new`) — Fyll i briefing med amne, talare, dagordning, fragor
2. **Moderator** (`/session/[id]/moderator`) — Forbered, justera installningar
3. **Ljudprov** (`/session/[id]/soundcheck`) — Talare gor 30s rostprov
4. **Starta** — Moderatorn startar fran sin cockpit
5. **Projektor** (`/session/[id]`) — F11 for fullskarm, Ctrl+/- for textstorlek
6. **Publik** (`/session/[id]/audience`) — Anslut via sessionskod
7. **Dashboard** (`/session/[id]/dashboard`) — Sammanfattning, export

### Tangentbordsgenvagar (projektorvy)

| Genvag | Funktion |
|--------|----------|
| `F11` | Fokus-/presentationslage |
| `1-5` | Byt vy (transkript/sammanfattning/fragor/citat/publik) |
| `Ctrl +` | Forstora text |
| `Ctrl -` | Forminska text |
| `Ctrl 0` | Aterstall textstorlek |
| `Esc` | Avsluta fokus |

## Tech Stack

Next.js 16 · TypeScript · Tailwind CSS 4 · Socket.io · Azure Speech · Claude Sonnet/Haiku · Prisma/PostgreSQL
