# Citizen Fraud Shield AI — Workspace

Open this whole folder in VS Code (`File → Open Folder…` → `citizen-fraud-shield`).
It's a two-app workspace:

```
citizen-fraud-shield/
├── frontend/     # Vite + React demo — the clickable product UI
├── backend/      # Express + MongoDB API — real routes, models, JWT auth
└── .vscode/      # Recommended extensions, tasks, and debug config
```

## Quickest way to see it running

VS Code will prompt you to install the recommended extensions on open — accept that,
then use **Terminal → Run Task…** and pick:

- **Install: Frontend deps** (first time only)
- **Install: Backend deps** (first time only)
- **Run: Frontend (Vite dev server)** → opens on `http://localhost:5173`
- **Run: Backend (Express API)** → needs a Mongo URI set up first, see below

Or just use two terminals (`` Ctrl+` ``, then split):

```bash
# Terminal 1
cd frontend
npm install
npm run dev
```

```bash
# Terminal 2
cd backend
npm install
cp .env.example .env      # then edit .env — see backend/README.md
npm run dev
```

## What each app is

- **`frontend/`** is a self-contained demo: the scam detector, fraud network graph,
  citizen portal, and analytics run entirely in the browser using a heuristic risk
  scorer, so it works with zero backend and zero API keys. Good for a hackathon demo
  right away.
- **`backend/`** is the real API this would run against in production — MongoDB
  schemas, JWT auth with role-based access, and routes for reports/AI-analysis/graph/
  analytics. See `backend/README.md` for the full architecture, API map, and
  deployment guide.

The two aren't wired together yet — the frontend has its own copy of the risk logic.
To connect them, point the frontend's "Analyze" button at `POST http://localhost:5000/api/ai/analyze`
instead of the local function.

## Debugging in VS Code

Press `F5` (or the Run & Debug panel) and pick **"Backend: Debug server.js"** to run
the API with breakpoints. The frontend is best debugged in the browser's own DevTools
(React DevTools extension recommended) since it's a Vite dev server, not a Node process.
