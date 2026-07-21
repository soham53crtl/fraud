# Citizen Fraud Shield AI
**AI-powered Digital Public Safety Intelligence Platform** — detects digital arrest scams,
fraud rings, and financial fraud before citizens lose money.

This repo folder contains a **real, runnable backend scaffold** for the 3 core modules
(scam detection, fraud network graph, citizen multi-channel reporting), plus this doc,
which specifies the rest of the platform (5 role dashboards, real-time layer, deployment)
so a team can build it out during a hackathon without re-deriving the architecture.

> A companion file, `citizen_fraud_shield_demo.jsx`, is a fully interactive frontend demo
> of the 3 core modules — open it to click through the actual product experience.
> It uses a heuristic risk engine in the browser so it works with zero backend; swap in
> calls to this API (`/api/ai/analyze`) to go from demo to production.

---

## 1. Folder structure

```
citizen-fraud-shield/
├── backend/
│   ├── models/          # Mongoose schemas (User, Complaint, Evidence, FraudEntity, Connection, RiskReport, Notification)
│   ├── routes/          # auth, reports, aiAnalysis, graph, analytics
│   ├── middleware/       # auth.js (JWT + role guard)
│   ├── server.js         # Express + Socket.IO entry point
│   ├── package.json
│   └── .env.example
└── frontend/              # Next.js 14 app (see section 5 for pages/dashboards to scaffold)
    ├── app/
    │   ├── (public)/landing, about, features, contact
    │   ├── (auth)/login, signup, forgot-password
    │   ├── citizen/        # Citizen dashboard + portal
    │   ├── police/          # Fraud graph, complaint queue, hotspot map
    │   ├── bank/             # Reported accounts, risk alerts
    │   ├── admin/            # User/report management, system monitoring
    │   └── ai-assistant/     # Chat-style scam checker
    └── components/
```

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind, shadcn/ui, Framer Motion | App Router, dark/light theme via `next-themes` |
| Charts / Graph | Recharts, `react-force-graph` or `reactflow`, Leaflet | Graph and heat map are the two most demo-critical visuals |
| Backend | Node.js, Express, Mongoose | See `server.js` |
| Auth | JWT (access + refresh), bcrypt | Role-based route guards in `middleware/auth.js` |
| Realtime | Socket.IO, room-per-role | Pushes fraud alerts to `police_officer` / `cyber_analyst` rooms |
| Storage | Cloudinary | Screenshots, audio, notice PDFs |
| Cache (optional) | Redis | Session/rate-limit store at scale; not required for a hackathon build |
| AI | Gemini or Claude API (server-side call in `routes/aiAnalysis.js`) | `runRiskEngine()` currently uses a heuristic scorer as a drop-in placeholder — same input/output contract |

## 3. Database schemas (implemented in `models/`)

- **User** — `role` ∈ `citizen, bank_officer, police_officer, cyber_analyst, admin`
- **Complaint** — the core report record: channel, raw content, AI verdict (score/band/category/confidence/signals), status workflow, linked fraud entities, location
- **Evidence** — uploaded files + OCR/speech-to-text extracted text, linked to a Complaint
- **FraudEntity** — a graph node: `phone | bank_account | upi_id | wallet | email | ip_address | victim`
- **Connection** — a graph edge between two FraudEntities with a `relationship` type and corroboration `weight`
- **RiskReport** — audit-trail copy of each AI verdict (model version, reasoning, similar-pattern links)
- **Notification** — real-time alert record, targeted at a user or broadcast to a role room

## 4. REST API map (implemented)

| Method & Path | Access | Purpose |
|---|---|---|
| `POST /api/auth/signup` | public | Create a citizen account |
| `POST /api/auth/login` | public | Returns JWT |
| `POST /api/auth/forgot-password` / `reset-password` | public | Token-based reset |
| `GET /api/auth/me` | authenticated | Current user profile |
| `POST /api/reports` | authenticated | File a report → runs AI risk engine → auto-alerts investigators if high risk |
| `GET /api/reports` | authenticated | List (citizens see own; investigators see all, filterable by `status`/`band`) |
| `GET /api/reports/:id` | authenticated | Single report detail |
| `PATCH /api/reports/:id/status` | police/analyst/admin | Update case status / assignment |
| `POST /api/ai/analyze` | authenticated | Standalone risk-score check (Scam Detector UI) |
| `GET /api/graph/search?q=` | police/analyst/admin | Search fraud entities |
| `GET /api/graph/entity/:id` | police/analyst/admin | Entity detail + 1-hop connections |
| `GET /api/graph/cluster/:id?depth=` | police/analyst/admin | N-hop expansion to surface a full ring |
| `GET /api/analytics/summary` | police/analyst/bank/admin | Dashboard headline stats |
| `GET /api/analytics/by-category` | police/analyst/admin | Trend chart data |
| `GET /api/analytics/hotspots` | police/analyst/admin | Top districts by report count |

**Not yet implemented in this scaffold** (spec'd here for the team to add): `POST /api/evidence/upload` (Multer → Cloudinary, then OCR/Whisper before saving `extractedText`), `GET/PATCH /api/users` (admin user management), `GET /api/notifications` + Socket.IO client wiring per dashboard.

## 5. Frontend pages / dashboards to scaffold

Each role gets its own route group and layout:

- **Citizen** — recent reports, evidence upload, AI analysis result, nearby hotspot list, safety tips
- **Police** — fraud graph (React Flow / `react-force-graph`, wired to `/api/graph/*`), complaint queue with status Kanban, evidence viewer, analytics, hotspot map (Leaflet + `/api/analytics/hotspots`)
- **Bank** — reported fraudulent accounts (query `FraudEntity` where `type=bank_account`), risk alerts, customer-linked reports
- **Admin** — user management (`/api/users` CRUD, to be added), report moderation, system health (`/api/health`), audit logs

Public pages: Landing, About, Features, AI Assistant (chat wrapper around `/api/ai/analyze`), Contact.

## 6. Authentication flow

1. Signup always creates a `citizen` role; staff accounts (`bank_officer`, `police_officer`, `cyber_analyst`) are provisioned by an `admin` via a future `/api/users` endpoint — never self-selected at signup, to prevent privilege escalation.
2. Login returns a JWT (`JWT_EXPIRES_IN`, default 7d). Store it in an httpOnly cookie in production rather than localStorage.
3. `requireAuth` verifies the token; `requireRole(...)` gates investigator/admin-only routes.
4. Forgot-password issues a hashed, time-limited reset token (email delivery is a TODO — wire to SES/SendGrid).

## 7. Real-time alerts

`server.js` attaches Socket.IO to the HTTP server. Clients call `socket.emit("join-room", role)` on login; `POST /api/reports` emits a `fraud-alert` event to the `cyber_analyst`/`police_officer` rooms whenever a report scores `ELEVATED` or `CRITICAL`, so investigator dashboards can show a live toast/badge without polling.

## 8. Deployment guide

- **Database**: MongoDB Atlas free tier — create cluster, whitelist `0.0.0.0/0` for the hackathon (tighten before any real deployment), copy the SRV URI into `MONGODB_URI`.
- **Backend**: Render or Railway — set all vars from `.env.example`, build command `npm install`, start command `npm start`. Both support WebSockets, needed for Socket.IO.
- **Frontend**: Vercel — set `NEXT_PUBLIC_API_URL` to the deployed backend URL; Next.js API routes are not needed since Express serves the API.
- **File storage**: Cloudinary free tier — create an unsigned upload preset for the citizen portal's screenshot/audio/PDF uploads.
- **AI**: keep `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` server-side only (used inside `routes/aiAnalysis.js`); never expose it to the frontend bundle.

## 9. Environment variables

See `.env.example` for the full list (server port, Mongo URI, JWT secrets, Cloudinary keys, AI provider keys, optional Redis URL).

## 10. What's a heuristic vs. what's real AI right now

`runRiskEngine()` in `routes/aiAnalysis.js` is a transparent, regex-based scorer — it exists so the whole pipeline (report filing → risk score → alert → graph linkage) is demoable end-to-end without an API key. For the hackathon pitch, be upfront that swapping in a real Gemini/Claude call (same function signature, same return shape) is the one-line change needed to go from heuristic to model-backed; judges tend to reward that honesty over an unverifiable "it's all AI" claim.
