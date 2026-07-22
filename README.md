# Citizen Fraud Shield AI

AI for Digital Public Safety — detecting, disrupting, and responding to
digital-arrest scams, fraud networks, and counterfeit currency.

Built for the *"AI for Digital Public Safety: Defeating Counterfeiting, Fraud &
Digital Arrest Scams"* hackathon track. All five suggested modules are
implemented and wired end-to-end (not just frontend mockups):

1. **Digital Arrest Scam Detection & Alerting** — hybrid regex signal library +
   a trained Naive Bayes NLP classifier (`backend/ml/naiveBayes.js`), blended
   65/35 into a single explainable risk score.
2. **Fraud Network Graph Intelligence** — D3 force-directed graph of victims,
   phones, bank accounts, UPI IDs, wallets, and IPs, backed by real
   MongoDB entities/connections.
3. **Citizen Fraud Shield (multi-channel)** — one portal for SMS / WhatsApp /
   email / URL / notice evidence, files a real complaint and returns an AI
   verdict.
4. **Geospatial Crime Pattern Intelligence** — Leaflet map of complaint
   hotspots across India for patrol prioritisation.
5. **Counterfeit Currency Identification** — guided RBI security-feature
   verification checklist for field officers / bank tellers.

```
citizen-fraud-shield/
├── frontend/     # React 19 + Vite SPA — all 7 tabs, live-wired to the API
├── backend/      # Express + MongoDB API — auth, ML model, graph, analytics
├── setup.ps1     # One-command Windows setup (installs, seeds, checks port 5000)
└── .vscode/      # Recommended extensions, tasks, and debug config
```

## Quickest way to run it (Windows)

```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

This installs both apps, copies `.env.example` → `.env` if missing, and seeds
the database with 5 demo accounts, the fraud graph, and 10 sample complaints
spread across India. **You still need to put a real MongoDB Atlas URI in
`backend/.env` first** — see `backend/README.md`.

Then, in two terminals:

```powershell
cd backend
npm run dev
```
```powershell
cd frontend
npm run dev   # open the printed http://localhost:5173 (or 5174) URL
```

### Manual setup (any OS)

```bash
cd backend
npm install
cp .env.example .env      # fill in MONGODB_URI and JWT_SECRET
npm run seed               # demo accounts + fraud graph + sample complaints
npm run test               # 16 automated tests (Node's built-in test runner)
npm run dev

# new terminal
cd frontend
npm install
cp .env.example .env
npm run dev
```

### Demo logins

| Role | Email | Password |
|---|---|---|
| Citizen | citizen@demo.com | citizen123 |
| Police Officer | officer@demo.com | officer123 |
| Cyber Analyst | analyst@demo.com | analyst123 |
| Bank Officer | bank@demo.com | bank123 |
| Admin | admin@demo.com | admin123 |

Use the **"Quick Demo Login"** buttons in the app's login modal instead of
typing these in by hand. Officer/analyst/admin roles unlock the Fraud
Network graph, Geospatial map, and Analytics tabs with live backend data;
without login (or as a citizen) those tabs gracefully fall back to demo data
with a clear on-screen banner.

## What each app does

- **`frontend/`** — React 19 SPA. Talks to the backend via `src/lib/api.js`
  (REST) and `src/lib/socket.js` (Socket.IO for live officer alerts). Falls
  back to an offline heuristic scorer if the backend is unreachable, so the
  demo never goes blank. Wrapped in a per-tab error boundary (one tab
  crashing doesn't blank the app), collapses to a single column below
  720px, and code-splits Leaflet/D3/Recharts into separate chunks so they
  only load when that tab is opened.
- **`backend/`** — Express + MongoDB API. JWT auth with role-based access
  (`citizen`, `police_officer`, `cyber_analyst`, `bank_officer`, `admin`),
  Zod request validation on every mutating route, rate limiting on login and
  AI-analysis endpoints, a real trained NLP model, and routes for reports /
  AI analysis / fraud graph / analytics. Socket.IO optionally attaches a
  Redis adapter (set `REDIS_URL`) for multi-instance horizontal scaling —
  falls back to single-instance mode if Redis isn't configured. See
  `backend/README.md` for the full API map.
- **CI** — every push runs the backend test suite and a frontend production
  build via GitHub Actions (`.github/workflows/ci.yml`).

## Testing

```bash
cd backend
npm run test
```

16 tests covering the Naive Bayes classifier, the blended risk engine, and
the Zod request-validation schemas (category accuracy, score bounds, model
metadata for auditability, malformed-request rejection).

## Hackathon deliverables

- **Working Prototype** — this repo.
- **Architecture Diagram** — `architecture-diagram.jpg`.
- **Presentation Deck** — `citizen-fraud-shield-deck.pptx`.
- **Demo Video** — record a walkthrough of the running app (not included here).

## Debugging in VS Code

Press `F5` (or the Run & Debug panel) and pick **"Backend: Debug server.js"**
to run the API with breakpoints. The frontend is best debugged in the
browser's own DevTools (React DevTools extension recommended).
