import React, { useState, useMemo, useRef, useEffect, createContext, useContext } from "react";
import * as d3 from "d3";
import {
  ShieldAlert, Network, Users, FileText, BarChart3, Search, Phone, Mail,
  Wallet, Landmark, Globe, AlertTriangle, CheckCircle2, Download, Radio,
  Siren, ChevronRight, X, Fingerprint, Activity, MapPin, Clock, Upload,
  LogIn, LogOut, Lock, WifiOff, Loader2
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie,
  Cell, LineChart, Line, CartesianGrid
} from "recharts";
import { api, getToken, getStoredUser, setSession, clearSession } from "./lib/api.js";
import { connectAndJoin, disconnectSocket, getSocket } from "./lib/socket.js";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

/* ---------------------------------------------------------------
   DESIGN TOKENS — "Signal Room": a night-shift cyber-crime ops desk.
   bg near-black slate, signal-cyan for scanning/active states,
   amber for elevated risk, red for confirmed threat, violet for
   financial-instrument nodes. Display face: condensed uppercase
   tracking on headers (radar-console feel). Mono face for every
   ID, phone number, account number, hash — anything a citizen
   or officer would need to type or verify to render as a proof
   detail, not an aesthetic label.
------------------------------------------------------------------ */
const C = {
  bg: "#0A0E16",
  panel: "#101724",
  panel2: "#151E2E",
  line: "#22304A",
  text: "#E7ECF4",
  sub: "#8996AC",
  cyan: "#33D9E8",
  amber: "#F5A524",
  red: "#EF4553",
  violet: "#8B7CF6",
  green: "#3FCB8E",
};

const FONT_DISPLAY = "'Archivo Narrow', 'Oswald', system-ui, sans-serif";
const FONT_MONO = "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace";

const OFFICER_ROLES = ["police_officer", "cyber_analyst", "admin"];
const ANALYTICS_ROLES = ["police_officer", "cyber_analyst", "bank_officer", "admin"];

/* ---------------------------------------------------------------
   AUTH CONTEXT — talks to /api/auth/*. Token + user persist in
   localStorage (this is a real standalone app, not a chat artifact,
   so browser storage is the right place for it).
------------------------------------------------------------------ */
const AuthContext = createContext(null);
function useAuth() {
  return useContext(AuthContext);
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    (async () => {
      const token = getToken();
      if (!token) { setBooting(false); return; }
      try {
        const { user: fresh } = await api.me();
        setUser(fresh);
        setSession(token, fresh);
      } catch {
        clearSession();
        setUser(null);
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const login = async (email, password) => {
    const { token, user: u } = await api.login({ email, password });
    setSession(token, u);
    setUser(u);
    return u;
  };
  const signup = async (payload) => {
    const { token, user: u } = await api.signup(payload);
    setSession(token, u);
    setUser(u);
    return u;
  };
  const logout = () => {
    clearSession();
    setUser(null);
    disconnectSocket();
  };

  return (
    <AuthContext.Provider value={{ user, booting, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

/* ---------------------------------------------------------------
   RISK ENGINE (offline heuristic fallback — used only when the
   backend is unreachable or the request fails, so the demo never
   goes fully blank. The real verdict comes from POST /api/ai/analyze,
   which runs the same-shaped engine server-side.)
------------------------------------------------------------------ */
const SIGNAL_LIBRARY = [
  { re: /digital arrest|virtual arrest|house arrest.{0,20}(video|call)/i, w: 34, label: "References 'digital arrest' — a procedure that does not exist in Indian law" },
  { re: /cbi|central bureau|enforcement directorate|\bed\b|narcotics control|customs department|trai\b/i, w: 22, label: "Impersonates a central law-enforcement or regulatory agency" },
  { re: /arrest warrant|non.?bailable|fir (has been|is) (filed|registered)|court notice/i, w: 20, label: "Claims a warrant, FIR, or court order exists against you" },
  { re: /video call|skype call|whatsapp video|stay on (the )?call|do not disconnect/i, w: 16, label: "Pressures you to stay on a video/voice call continuously" },
  { re: /aadhaar (card )?(link|misuse|suspend|block)|sim (card )?(block|deactivat)/i, w: 14, label: "Threatens to block your Aadhaar-linked SIM or ID" },
  { re: /parcel|courier|customs.{0,15}(drugs|narcotics|illegal)/i, w: 16, label: "Uses a fake parcel/customs seizure narrative" },
  { re: /pay (immediately|now|within)|processing fee|refundable (security )?deposit|verification fee/i, w: 18, label: "Demands urgent payment framed as refundable or procedural" },
  { re: /otp|one time password|cvv|upi pin/i, w: 20, label: "Requests OTP, CVV, or UPI PIN — no legitimate agency ever asks for this" },
  { re: /(bit\.ly|tinyurl|cutt\.ly|rebrand\.ly|is\.gd)\/\S+/i, w: 15, label: "Contains a shortened URL that hides the true destination" },
  { re: /https?:\/\/\S+/i, w: 6, label: "Contains an embedded link" },
  { re: /lottery|kbc|lucky draw|prize won|congratulations you have won/i, w: 18, label: "Uses a prize/lottery hook" },
  { re: /job offer|work from home|part.?time.{0,10}earn|task.{0,10}(commission|payout)/i, w: 14, label: "Uses a task-based job / easy-money hook" },
  { re: /\b(?:\+?91[\s-]?)?[6-9]\d{9}\b/, w: 8, label: "Contains a mobile number to call back on" },
  { re: /confidential|do not tell (anyone|family)|keep this (secret|private)/i, w: 16, label: "Instructs you to keep the matter secret from family" },
];

function analyzeTextOffline(raw) {
  const text = raw || "";
  const hits = SIGNAL_LIBRARY.filter((s) => s.re.test(text));
  let score = hits.reduce((a, s) => a + s.w, 0);
  score = Math.max(4, Math.min(98, score + (text.length > 40 ? 4 : 0)));

  let category = "Unclassified / Low Signal";
  if (/digital arrest|virtual arrest/i.test(text) || (/cbi|enforcement directorate|\bed\b/i.test(text) && /arrest|warrant|video call/i.test(text))) {
    category = "Digital Arrest Scam";
  } else if (/cbi|court notice|fir|warrant|customs/i.test(text)) {
    category = "Fake Legal / Government Notice";
  } else if (/otp|upi pin|refund|cvv|account.{0,10}(block|suspend)/i.test(text)) {
    category = "Financial / UPI Fraud";
  } else if (/job offer|work from home|lottery|prize/i.test(text)) {
    category = "Phishing / Job-Lure Scam";
  }

  const confidence = Math.min(96, 52 + hits.length * 7);
  const band = score >= 70 ? "CRITICAL" : score >= 45 ? "ELEVATED" : score >= 20 ? "GUARDED" : "LOW";

  const actions = {
    CRITICAL: [
      "Do not make any payment or share any OTP/PIN.",
      "End the call/chat immediately — real agencies never arrest over video call.",
      "Call the National Cyber Crime Helpline 1930 or file at cybercrime.gov.in now.",
      "Save screenshots and the caller's number as evidence before blocking.",
    ],
    ELEVATED: [
      "Do not click any link or share OTP/CVV/UPI PIN.",
      "Independently verify by calling the organisation's official number, not one given in the message.",
      "Report the number/URL on the Chakshu portal (sancharsaathi.gov.in).",
    ],
    GUARDED: [
      "Avoid clicking links from unknown senders.",
      "Verify sender identity through an official channel before acting.",
    ],
    LOW: ["No strong scam indicators detected — stay generally cautious with unsolicited messages."],
  }[band];

  return { score, hits, category, confidence, band, actions, source: "offline" };
}

// Normalises whichever shape the verdict came from (backend /api/ai/analyze
// vs the offline fallback) into what ResultCard expects.
function normalizeVerdict(v, source) {
  return {
    score: v.score,
    band: v.band,
    category: v.category,
    confidence: v.confidence,
    hits: (v.hits || v.signals || []).map((h) => (typeof h === "string" ? { label: h } : h)),
    actions: v.actions || v.recommendedActions || [],
    source,
  };
}

const BAND_COLOR = { CRITICAL: C.red, ELEVATED: C.amber, GUARDED: C.cyan, LOW: C.green };

const SAMPLES = [
  {
    label: "Digital Arrest Call",
    text: "This is Officer Sharma from CBI. A parcel with your Aadhaar linked to narcotics has been seized at customs. There is a non-bailable arrest warrant against you. Stay on this video call and do not disconnect. Pay a refundable verification fee of Rs 45,000 immediately or you will be arrested within the hour. Do not tell anyone about this call.",
  },
  {
    label: "UPI Refund Scam",
    text: "Your electricity bill payment failed. To get your refund of Rs 2,340 processed, share the OTP sent to your phone and your UPI PIN at http://bit.ly/elec-refund within 30 minutes.",
  },
  {
    label: "Fake Job Offer",
    text: "Congratulations! You have won a work from home task job with daily payout. Click https://tinyurl.com/task-job2 to register and pay a Rs 500 verification fee to start earning Rs 3000/day.",
  },
];

/* ---------------------------------------------------------------
   FRAUD NETWORK GRAPH — demo/offline dataset. When an officer/
   analyst/admin is logged in, GraphTab replaces this with live
   data from GET /api/graph/overview (backend/routes/graph.js).
------------------------------------------------------------------ */
const GRAPH_NODES = [
  { id: "V1", type: "victim", label: "Victim: R. Sharma", detail: "Lost ₹1,85,000 · Reported 12 Jul" },
  { id: "V2", type: "victim", label: "Victim: A. Iyer", detail: "Lost ₹42,000 · Reported 09 Jul" },
  { id: "V3", type: "victim", label: "Victim: M. Khan", detail: "Attempt blocked · Reported 14 Jul" },
  { id: "P1", type: "phone", label: "+91 98••••01", detail: "Used in 6 reports across 3 states" },
  { id: "P2", type: "phone", label: "+91 91••••45", detail: "SIM issued on forged ID, Bihar circle" },
  { id: "P3", type: "phone", label: "+91 89••••77", detail: "VoIP spoofed caller ID" },
  { id: "B1", type: "bank", label: "A/C 4521••••09", detail: "Mule account, opened 22 days ago" },
  { id: "B2", type: "bank", label: "A/C 7788••••33", detail: "Frozen by bank fraud team" },
  { id: "U1", type: "upi", label: "scammer1@oksbi", detail: "Linked to B1 · 14 inbound txns" },
  { id: "U2", type: "upi", label: "fraudpay@ybl", detail: "Linked to B2" },
  { id: "W1", type: "wallet", label: "Wallet #W2291", detail: "Cash-out point for U1, U2" },
  { id: "E1", type: "email", label: "cbi.notice@mailx.in", detail: "Domain registered 8 days before first report" },
  { id: "IP1", type: "ip", label: "103.21.x.x", detail: "Commercial VPN exit node, Singapore" },
];
const GRAPH_LINKS = [
  ["V1", "P1"], ["V1", "E1"], ["V2", "P1"], ["V2", "P2"], ["V3", "P3"],
  ["P1", "B1"], ["P1", "U1"], ["P2", "B1"], ["P2", "U2"], ["P3", "B2"],
  ["U1", "W1"], ["U2", "W1"], ["B1", "IP1"], ["E1", "IP1"], ["P3", "E1"],
];
const TYPE_META = {
  victim: { color: C.text, icon: Users },
  phone: { color: C.amber, icon: Phone },
  bank: { color: C.red, icon: Landmark },
  upi: { color: C.violet, icon: Wallet },
  wallet: { color: C.violet, icon: Wallet },
  email: { color: C.cyan, icon: Mail },
  ip: { color: C.green, icon: Globe },
};
// Backend FraudEntity.type enum -> the shorter display keys above.
function normalizeType(t) {
  if (t === "bank_account") return "bank";
  if (t === "upi_id") return "upi";
  if (t === "ip_address") return "ip";
  return t;
}
function transformBackendGraph(entities, connections) {
  const nodes = entities.map((e) => ({
    id: e._id,
    type: normalizeType(e.type),
    label: e.label || e.value,
    detail: `${(e.metadata && e.metadata.note) || ""}${e.metadata && e.metadata.note ? " · " : ""}${e.riskLevel} risk`,
  }));
  const links = connections.map((c) => [String(c.source), String(c.target)]);
  return { nodes, links };
}

function ForceGraph({ nodes, links, onSelect, selected, highlight }) {
  const [positions, setPositions] = useState(null);
  const dims = { w: 720, h: 420 };

  useEffect(() => {
    const nds = nodes.map((n) => ({ ...n }));
    const lks = links.map(([s, t]) => ({ source: s, target: t }));
    const sim = d3
      .forceSimulation(nds)
      .force("link", d3.forceLink(lks).id((d) => d.id).distance(95).strength(0.7))
      .force("charge", d3.forceManyBody().strength(-260))
      .force("center", d3.forceCenter(dims.w / 2, dims.h / 2))
      .force("collide", d3.forceCollide(34))
      .stop();
    for (let i = 0; i < 300; i++) sim.tick();
    setPositions({ nodes: nds, links: lks });
  }, [nodes, links]);

  if (!positions) return <div style={{ color: C.sub, padding: 40 }}>Laying out network…</div>;

  const dim = (id) => highlight && !highlight.has(id);

  return (
    <svg viewBox={`0 0 ${dims.w} ${dims.h}`} style={{ width: "100%", height: 420 }}>
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={C.line} />
        </marker>
      </defs>
      {positions.links.map((l, i) => (
        <line
          key={i}
          x1={l.source.x} y1={l.source.y} x2={l.target.x} y2={l.target.y}
          stroke={C.line} strokeWidth={1.4}
          opacity={dim(l.source.id) || dim(l.target.id) ? 0.15 : 0.8}
        />
      ))}
      {positions.nodes.map((n) => {
        const meta = TYPE_META[n.type] || TYPE_META.victim;
        const isSel = selected === n.id;
        const faded = dim(n.id);
        return (
          <g
            key={n.id}
            transform={`translate(${n.x},${n.y})`}
            style={{ cursor: "pointer", opacity: faded ? 0.25 : 1 }}
            onClick={() => onSelect(n.id)}
          >
            <circle r={isSel ? 15 : 11} fill={C.panel2} stroke={meta.color} strokeWidth={isSel ? 3 : 1.6} />
            <circle r={2} fill={meta.color} />
            <text
              y={24} textAnchor="middle" fontSize="9.5"
              fontFamily={FONT_MONO} fill={isSel ? C.text : C.sub}
            >
              {n.label.length > 16 ? n.label.slice(0, 15) + "…" : n.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------------------------------------------------------------
   SHARED UI ATOMS
------------------------------------------------------------------ */
function Pill({ color, children }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px",
      borderRadius: 999, fontSize: 11, fontFamily: FONT_MONO, letterSpacing: 0.5,
      color, border: `1px solid ${color}55`, background: `${color}14`,
    }}>{children}</span>
  );
}

function Panel({ children, style }) {
  return (
    <div style={{
      background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10,
      padding: 20, ...style,
    }}>{children}</div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontFamily: FONT_DISPLAY, textTransform: "uppercase", letterSpacing: 1.6,
      fontSize: 12, color: C.sub, marginBottom: 10, fontWeight: 600,
    }}>{children}</div>
  );
}

// Small inline banner used across tabs to show whether data is live from the
// backend, offline/demo, still loading, or errored — never blocks the UI.
function DataStatusBanner({ status, liveLabel, demoLabel }) {
  if (status === "loading") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.sub, marginBottom: 12 }}>
        <Loader2 size={13} className="spin" /> Connecting to backend…
      </div>
    );
  }
  if (status === "live") {
    return (
      <div style={{ marginBottom: 12 }}>
        <Pill color={C.green}><span style={{ width: 6, height: 6, borderRadius: 6, background: C.green, display: "inline-block" }} /> {liveLabel || "LIVE BACKEND DATA"}</Pill>
      </div>
    );
  }
  if (status === "auth") {
    return (
      <div style={{ marginBottom: 12 }}>
        <Pill color={C.amber}><Lock size={11} /> Log in as police officer / cyber analyst to see live data — showing demo data below</Pill>
      </div>
    );
  }
  if (status === "offline") {
    return (
      <div style={{ marginBottom: 12 }}>
        <Pill color={C.sub}><WifiOff size={11} /> {demoLabel || "Backend not reachable — showing demo data"}</Pill>
      </div>
    );
  }
  return null;
}

function RiskGauge({ score, band }) {
  const angle = (score / 100) * 180;
  const color = BAND_COLOR[band];
  const r = 70, cx = 90, cy = 90;
  const toXY = (deg) => {
    const rad = (Math.PI * (180 - deg)) / 180;
    return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)];
  };
  const [ex, ey] = toXY(angle);
  const largeArc = angle > 180 ? 1 : 0;
  return (
    <svg viewBox="0 0 180 110" width="200" height="122">
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke={C.line} strokeWidth="14" strokeLinecap="round" />
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 ${largeArc} 1 ${ex} ${ey}`} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" />
      <text x={cx} y={cy - 8} textAnchor="middle" fontSize="30" fontFamily={FONT_MONO} fill={C.text} fontWeight="700">{score}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="10" fontFamily={FONT_DISPLAY} letterSpacing="1.5" fill={color}>{band} RISK</text>
    </svg>
  );
}

function downloadReport(name, result, sourceText) {
  const body = `CITIZEN FRAUD SHIELD AI — INCIDENT REPORT
Generated: ${new Date().toLocaleString("en-IN")}
Source    : ${result.source === "backend" ? "Live backend AI engine" : "Offline heuristic fallback"}
------------------------------------------------------------
THREAT CATEGORY : ${result.category}
RISK SCORE       : ${result.score} / 100 (${result.band})
CONFIDENCE       : ${result.confidence}%

EVIDENCE SUMMARY
${sourceText.slice(0, 800)}

DETECTED SIGNALS
${result.hits.map((h) => "- " + h.label).join("\n") || "- No strong signals matched"}

RECOMMENDED ACTIONS
${result.actions.map((a) => "- " + a).join("\n")}

LEGAL GUIDANCE
No Indian law-enforcement agency (Police, CBI, ED, Customs, Income Tax) conducts
arrests, verifications, or investigations over a phone/video call, nor demands
payment for "verification" or "release". Report to the National Cyber Crime
Helpline: 1930, or file at cybercrime.gov.in.
------------------------------------------------------------
This report was generated by an AI heuristic model and is intended to support,
not replace, a formal police complaint.
`;
  const blob = new Blob([body], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

/* ---------------------------------------------------------------
   ANALYSIS RESULT CARD (shared by Detector + Citizen Portal)
------------------------------------------------------------------ */
function ResultCard({ result, sourceText, onDownload }) {
  return (
    <Panel style={{ marginTop: 18 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center" }}>
        <RiskGauge score={result.score} band={result.band} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <SectionLabel>Threat Category</SectionLabel>
          <div style={{ fontSize: 19, fontFamily: FONT_DISPLAY, fontWeight: 700, marginBottom: 10 }}>{result.category}</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Pill color={BAND_COLOR[result.band]}><Activity size={12} /> {result.band}</Pill>
            <Pill color={C.cyan}><Fingerprint size={12} /> {result.confidence}% confidence</Pill>
            <Pill color={result.source === "backend" ? C.green : C.sub}>
              {result.source === "backend" ? <><Radio size={12} /> LIVE AI</> : <><WifiOff size={12} /> OFFLINE HEURISTIC</>}
            </Pill>
          </div>
        </div>
        <button
          onClick={() => onDownload(result)}
          style={{
            display: "flex", alignItems: "center", gap: 8, background: C.cyan, color: "#03181C",
            border: "none", borderRadius: 8, padding: "10px 16px", fontWeight: 700, cursor: "pointer",
            fontFamily: FONT_DISPLAY, letterSpacing: 0.5,
          }}
        >
          <Download size={16} /> INCIDENT REPORT
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 22 }}>
        <div>
          <SectionLabel>AI Reasoning — Detected Signals</SectionLabel>
          {result.hits.length === 0 && <div style={{ color: C.sub, fontSize: 13 }}>No strong scam signals matched this text.</div>}
          {result.hits.map((h, i) => (
            <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, color: C.text, marginBottom: 8, alignItems: "flex-start" }}>
              <AlertTriangle size={14} color={C.amber} style={{ marginTop: 2, flexShrink: 0 }} />
              <span>{h.label}</span>
            </div>
          ))}
        </div>
        <div>
          <SectionLabel>Recommended Action</SectionLabel>
          {result.actions.map((a, i) => (
            <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, color: C.text, marginBottom: 8, alignItems: "flex-start" }}>
              <CheckCircle2 size={14} color={C.green} style={{ marginTop: 2, flexShrink: 0 }} />
              <span>{a}</span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

/* ---------------------------------------------------------------
   LOGIN / SIGNUP MODAL
------------------------------------------------------------------ */
const DEMO_LOGINS = [
  { role: "Citizen", email: "citizen@demo.com", password: "citizen123" },
  { role: "Police Officer", email: "officer@demo.com", password: "officer123" },
  { role: "Cyber Analyst", email: "analyst@demo.com", password: "analyst123" },
  { role: "Bank Officer", email: "bank@demo.com", password: "bank123" },
];

function LoginModal({ onClose }) {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      if (mode === "login") await login(form.email, form.password);
      else await signup(form);
      onClose();
    } catch (ex) {
      setErr(ex.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const runDemo = async (d) => {
    setErr(""); setBusy(true);
    try {
      await login(d.email, d.password);
      onClose();
    } catch (ex) {
      setErr(`${ex.message} — run "npm run seed" in backend/ first to create demo accounts.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#000A", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16,
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 420 }}>
        <Panel>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>
              {mode === "login" ? "Log In" : "Sign Up"}
            </div>
            <X size={18} style={{ cursor: "pointer", color: C.sub }} onClick={onClose} />
          </div>

          <form onSubmit={submit}>
            {mode === "signup" && (
              <input required placeholder="Full name" value={form.name} onChange={set("name")} style={inputStyle} />
            )}
            <input required type="email" placeholder="Email" value={form.email} onChange={set("email")} style={inputStyle} />
            <input required type="password" placeholder="Password" value={form.password} onChange={set("password")} style={inputStyle} />
            {mode === "signup" && (
              <input placeholder="Phone (optional)" value={form.phone} onChange={set("phone")} style={inputStyle} />
            )}
            {err && <div style={{ color: C.red, fontSize: 12.5, marginBottom: 10 }}>{err}</div>}
            <button type="submit" disabled={busy} style={{
              width: "100%", background: C.cyan, color: "#03181C", border: "none", borderRadius: 8,
              padding: "10px 16px", fontWeight: 700, cursor: "pointer", fontFamily: FONT_DISPLAY, letterSpacing: 0.5,
            }}>
              {busy ? "PLEASE WAIT…" : mode === "login" ? "LOG IN" : "CREATE ACCOUNT"}
            </button>
          </form>

          <div style={{ textAlign: "center", fontSize: 12.5, color: C.sub, marginTop: 10, cursor: "pointer" }}
               onClick={() => { setMode(mode === "login" ? "signup" : "login"); setErr(""); }}>
            {mode === "login" ? "New citizen? Sign up" : "Already have an account? Log in"}
          </div>

          <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 16, paddingTop: 14 }}>
            <SectionLabel>Quick Demo Login</SectionLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {DEMO_LOGINS.map((d) => (
                <button key={d.email} onClick={() => runDemo(d)} disabled={busy} style={{
                  background: "transparent", border: `1px solid ${C.line}`, color: C.sub,
                  borderRadius: 6, padding: "6px 10px", fontSize: 11.5, cursor: "pointer",
                }}>{d.role}</button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: C.sub, marginTop: 8 }}>
              Requires <code style={{ fontFamily: FONT_MONO }}>npm run seed</code> to have been run once in <code style={{ fontFamily: FONT_MONO }}>backend/</code>.
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
const inputStyle = {
  width: "100%", background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 8,
  padding: "10px 12px", color: C.text, fontSize: 13.5, marginBottom: 10, boxSizing: "border-box",
};

/* ---------------------------------------------------------------
   TABS
------------------------------------------------------------------ */
function OverviewTab() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [summaryStatus, setSummaryStatus] = useState(user ? "loading" : "auth");
  const [alerts, setAlerts] = useState([
    "Digital arrest attempt flagged — Pune circle — risk 91 — auto-forwarded to Cyber Cell",
    "New mule account linked to 3 existing complaints — Bank Dashboard notified",
    "Fake ED notice PDF submitted via Citizen Portal — OCR + AI verdict: CRITICAL",
  ]);

  useEffect(() => {
    let live = true;
    if (!user) { setSummaryStatus("auth"); return; }
    if (!ANALYTICS_ROLES.includes(user.role)) { setSummaryStatus("auth"); return; }
    setSummaryStatus("loading");
    api.analyticsSummary()
      .then((d) => { if (live) { setSummary(d); setSummaryStatus("live"); } })
      .catch(() => { if (live) setSummaryStatus("offline"); });
    return () => { live = false; };
  }, [user]);

  useEffect(() => {
    if (!user || !OFFICER_ROLES.includes(user.role)) return;
    const s = connectAndJoin(user.role);
    const onAlert = (a) => {
      setAlerts((prev) => [`${a.band} — ${a.category} — score ${a.score} — case ${String(a.complaintId).slice(-6)}`, ...prev].slice(0, 8));
    };
    s.on("fraud-alert", onAlert);
    return () => s.off("fraud-alert", onAlert);
  }, [user]);

  const fallbackStats = [
    { label: "Reports Filed (30d)", value: "4,812", color: C.cyan },
    { label: "Active Investigations", value: "236", color: C.amber },
    { label: "Fraud Prevented", value: "₹3.4 Cr", color: C.green },
    { label: "Avg. AI Response", value: "1.8s", color: C.violet },
  ];
  const stats = summary ? [
    { label: "Total Reports Filed", value: summary.totalReports.toLocaleString("en-IN"), color: C.cyan },
    { label: "Critical Reports", value: summary.criticalReports.toLocaleString("en-IN"), color: C.red },
    { label: "Resolved Cases", value: summary.resolvedReports.toLocaleString("en-IN"), color: C.green },
    { label: "Financial Loss Tracked", value: `₹${(summary.totalFinancialLoss / 100000).toFixed(1)} L`, color: C.violet },
  ] : fallbackStats;

  const modules = [
    { icon: ShieldAlert, title: "Digital Arrest Scam Detection", body: "Real-time AI screening of messages and calls, with risk scoring and instant guidance." },
    { icon: Network, title: "Fraud Network Graph Intelligence", body: "Links phone numbers, accounts, UPI IDs and victims into investigable fraud rings." },
    { icon: Users, title: "Citizen Fraud Shield", body: "One portal to submit any evidence type and get an AI verdict plus a filed report." },
    { icon: MapPin, title: "Geospatial Crime Pattern Intelligence", body: "Maps complaint locations and hotspots for patrol prioritisation and resource deployment." },
    { icon: Landmark, title: "Counterfeit Currency Identification", body: "Guided RBI security-feature verification for field officers and bank tellers." },
  ];
  return (
    <div>
      <DataStatusBanner status={summaryStatus} liveLabel="LIVE HEADLINE STATS FROM BACKEND" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {stats.map((s) => (
          <Panel key={s.label}>
            <div style={{ fontFamily: FONT_MONO, fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>{s.label}</div>
          </Panel>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginTop: 14 }}>
        {modules.map((m) => (
          <Panel key={m.title}>
            <m.icon size={22} color={C.cyan} />
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15, margin: "10px 0 6px" }}>{m.title}</div>
            <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.5 }}>{m.body}</div>
          </Panel>
        ))}
      </div>
      <Panel style={{ marginTop: 14 }}>
        <SectionLabel>
          Live Alert Feed {user && OFFICER_ROLES.includes(user.role) ? "(connected via WebSocket)" : "(log in as officer/analyst for real-time push)"}
        </SectionLabel>
        {alerts.map((t, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 0", borderTop: i ? `1px solid ${C.line}` : "none", fontSize: 13 }}>
            <Radio size={13} color={C.red} />
            <span style={{ color: C.text }}>{t}</span>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function DetectorTab() {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);

  const run = async () => {
    setLoading(true); setNeedsLogin(false);
    try {
      if (!user) throw { status: 401 };
      const { verdict } = await api.analyze(text);
      setResult(normalizeVerdict(verdict, "backend"));
    } catch (ex) {
      if (ex.status === 401) setNeedsLogin(true);
      setResult(normalizeVerdict(analyzeTextOffline(text), "offline"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Panel>
        <SectionLabel>Paste a suspicious message, call transcript, or notice text</SectionLabel>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste SMS / WhatsApp / call transcript / notice text here…"
          style={{
            width: "100%", minHeight: 130, background: C.panel2, border: `1px solid ${C.line}`,
            borderRadius: 8, padding: 12, color: C.text, fontSize: 13.5, fontFamily: FONT_MONO, resize: "vertical",
          }}
        />
        {needsLogin && (
          <div style={{ fontSize: 12, color: C.amber, marginTop: 8 }}>
            Log in to run this through the live backend AI engine — showing the offline heuristic result below instead.
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {SAMPLES.map((s) => (
            <button key={s.label} onClick={() => setText(s.text)} style={{
              background: "transparent", border: `1px solid ${C.line}`, color: C.sub,
              borderRadius: 6, padding: "6px 10px", fontSize: 12, cursor: "pointer",
            }}>{s.label}</button>
          ))}
          <div style={{ flex: 1 }} />
          <button
            onClick={run}
            disabled={!text.trim() || loading}
            style={{
              background: text.trim() ? C.cyan : C.line, color: text.trim() ? "#03181C" : C.sub, border: "none",
              borderRadius: 8, padding: "9px 18px", fontWeight: 700, cursor: text.trim() ? "pointer" : "default",
              fontFamily: FONT_DISPLAY, letterSpacing: 0.5,
            }}
          >
            <ShieldAlert size={15} style={{ marginRight: 6, verticalAlign: -3 }} /> {loading ? "ANALYSING…" : "ANALYZE MESSAGE"}
          </button>
        </div>
      </Panel>
      {result && <ResultCard result={result} sourceText={text} onDownload={() => downloadReport("incident-report.txt", result, text)} />}
    </div>
  );
}

function GraphTab() {
  const { user } = useAuth();
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [graphData, setGraphData] = useState({ nodes: GRAPH_NODES, links: GRAPH_LINKS });
  const [status, setStatus] = useState(user && OFFICER_ROLES.includes(user.role) ? "loading" : "auth");
  const [entityDetail, setEntityDetail] = useState(null);

  useEffect(() => {
    let live = true;
    if (!user || !OFFICER_ROLES.includes(user.role)) { setStatus("auth"); return; }
    setStatus("loading");
    api.graphOverview()
      .then(({ entities, connections }) => {
        if (!live) return;
        if (entities.length === 0) { setStatus("live"); return; } // stays on demo data if DB not seeded yet
        setGraphData(transformBackendGraph(entities, connections));
        setStatus("live");
      })
      .catch(() => { if (live) setStatus("offline"); });
    return () => { live = false; };
  }, [user]);

  const node = graphData.nodes.find((n) => n.id === selected);

  useEffect(() => {
    setEntityDetail(null);
    if (!selected || status !== "live" || !user || !OFFICER_ROLES.includes(user.role)) return;
    api.graphEntity(selected).then(setEntityDetail).catch(() => {});
  }, [selected, status, user]);

  const highlight = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.toLowerCase();
    const matchIds = new Set(graphData.nodes.filter((n) => n.label.toLowerCase().includes(q)).map((n) => n.id));
    if (matchIds.size === 0) return null;
    graphData.links.forEach(([s, t]) => {
      if (matchIds.has(s)) matchIds.add(t);
      if (matchIds.has(t)) matchIds.add(s);
    });
    return matchIds;
  }, [query, graphData]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 14 }}>
      <Panel>
        <DataStatusBanner status={status} liveLabel="LIVE FRAUD NETWORK FROM BACKEND" />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Search size={15} color={C.sub} />
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search phone, account, UPI ID, victim…"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: C.text, fontFamily: FONT_MONO, fontSize: 13 }}
          />
        </div>
        <ForceGraph nodes={graphData.nodes} links={graphData.links} onSelect={setSelected} selected={selected} highlight={highlight} />
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 6 }}>
          {Object.entries(TYPE_META).map(([k, v]) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.sub }}>
              <span style={{ width: 8, height: 8, borderRadius: 8, background: v.color, display: "inline-block" }} />
              {k}
            </div>
          ))}
        </div>
      </Panel>
      <Panel>
        <SectionLabel>Entity Detail</SectionLabel>
        {!node && <div style={{ color: C.sub, fontSize: 13 }}>Click a node to inspect it — linked scams, timeline, and evidence appear here.</div>}
        {node && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              {React.createElement((TYPE_META[node.type] || TYPE_META.victim).icon, { size: 16, color: (TYPE_META[node.type] || TYPE_META.victim).color })}
              <span style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700 }}>{node.label}</span>
            </div>
            <div style={{ fontSize: 12.5, color: C.sub, marginBottom: 14 }}>{node.detail}</div>
            {entityDetail && (
              <div style={{ fontSize: 11.5, color: C.sub, marginBottom: 10 }}>
                First seen {new Date(entityDetail.entity.firstSeenAt).toLocaleDateString("en-IN")} · Last seen {new Date(entityDetail.entity.lastSeenAt).toLocaleDateString("en-IN")}
              </div>
            )}
            <SectionLabel>Connected Entities</SectionLabel>
            {graphData.links.filter(([s, t]) => s === node.id || t === node.id).map(([s, t], i) => {
              const otherId = s === node.id ? t : s;
              const other = graphData.nodes.find((n) => n.id === otherId);
              if (!other) return null;
              return (
                <div key={i} onClick={() => setSelected(otherId)} style={{
                  display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.text, cursor: "pointer",
                  padding: "6px 0", borderTop: i ? `1px solid ${C.line}` : "none",
                }}>
                  <ChevronRight size={12} color={C.sub} /> {other.label}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

const CHANNELS = [
  { id: "sms", label: "SMS", icon: FileText },
  { id: "whatsapp", label: "WhatsApp", icon: FileText },
  { id: "email", label: "Email", icon: Mail },
  { id: "url", label: "URL", icon: Globe },
  { id: "notice_pdf", label: "Notice / PDF", icon: Upload },
];

function CitizenPortalTab() {
  const { user } = useAuth();
  const [channel, setChannel] = useState("sms");
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [filed, setFiled] = useState(false);

  const run = async () => {
    setLoading(true); setNeedsLogin(false); setFiled(false);
    try {
      if (!user) throw { status: 401 };
      const { verdict } = await api.createReport({ channel, rawContent: text });
      setResult(normalizeVerdict(verdict, "backend"));
      setFiled(true);
    } catch (ex) {
      if (ex.status === 401) setNeedsLogin(true);
      setResult(normalizeVerdict(analyzeTextOffline(text), "offline"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <Panel>
        <SectionLabel>1. Choose evidence channel</SectionLabel>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {CHANNELS.map((c) => (
            <button key={c.id} onClick={() => setChannel(c.id)} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 8,
              border: `1px solid ${channel === c.id ? C.cyan : C.line}`,
              background: channel === c.id ? `${C.cyan}14` : "transparent",
              color: channel === c.id ? C.cyan : C.sub, fontSize: 12.5, cursor: "pointer",
            }}>
              <c.icon size={13} /> {c.label}
            </button>
          ))}
        </div>
        <SectionLabel>
          {channel === "url" ? "2. Paste the suspicious URL" : channel === "notice_pdf" ? "2. Paste the notice text (or describe the uploaded file)" : "2. Paste the message content"}
        </SectionLabel>
        <textarea
          value={text} onChange={(e) => setText(e.target.value)}
          placeholder={channel === "url" ? "https://…" : "Paste content here…"}
          style={{
            width: "100%", minHeight: 160, background: C.panel2, border: `1px solid ${C.line}`,
            borderRadius: 8, padding: 12, color: C.text, fontSize: 13.5, fontFamily: FONT_MONO, resize: "vertical",
          }}
        />
        <div style={{ fontSize: 11.5, color: C.sub, marginTop: 8, display: "flex", gap: 6, alignItems: "center" }}>
          <Upload size={12} /> Screenshot / audio / PDF upload runs through OCR + speech-to-text server-side before hitting this same analysis pipeline.
        </div>
        {needsLogin && (
          <div style={{ fontSize: 12, color: C.amber, marginTop: 8 }}>
            Log in to actually file this report against the backend (POST /api/reports) — showing an offline preview verdict below instead.
          </div>
        )}
        <button
          onClick={run}
          disabled={!text.trim() || loading}
          style={{
            marginTop: 14, background: text.trim() ? C.cyan : C.line, color: text.trim() ? "#03181C" : C.sub,
            border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 700, cursor: text.trim() ? "pointer" : "default",
            fontFamily: FONT_DISPLAY, letterSpacing: 0.5, width: "100%",
          }}
        >
          <Siren size={15} style={{ marginRight: 6, verticalAlign: -3 }} /> {loading ? "SUBMITTING…" : filed ? "REPORT FILED ✓ — RUN ANOTHER" : "RUN AI FRAUD CHECK"}
        </button>
      </Panel>
      <Panel>
        <SectionLabel>Emergency Actions</SectionLabel>
        {[
          "National Cyber Crime Helpline: 1930",
          "File a complaint: cybercrime.gov.in",
          "Block/report a number: Chakshu portal — sancharsaathi.gov.in",
          "Never share OTP, CVV, or UPI PIN with anyone claiming to be an official.",
        ].map((t, i) => (
          <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, marginBottom: 10, alignItems: "flex-start" }}>
            <ShieldAlert size={14} color={C.amber} style={{ marginTop: 2, flexShrink: 0 }} />
            <span>{t}</span>
          </div>
        ))}
        {!result && (
          <div style={{ marginTop: 20, fontSize: 12.5, color: C.sub, borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
            Your AI verdict, confidence score, and a downloadable incident report will appear here after you run a check.
          </div>
        )}
      </Panel>
      {result && (
        <div style={{ gridColumn: "1 / -1" }}>
          <ResultCard result={result} sourceText={text} onDownload={() => downloadReport("citizen-report.txt", result, text)} />
        </div>
      )}
    </div>
  );
}

const MONTHLY = [
  { m: "Feb", digitalArrest: 210, upi: 340, phishing: 180 },
  { m: "Mar", digitalArrest: 260, upi: 360, phishing: 200 },
  { m: "Apr", digitalArrest: 340, upi: 410, phishing: 230 },
  { m: "May", digitalArrest: 410, upi: 470, phishing: 260 },
  { m: "Jun", digitalArrest: 520, upi: 500, phishing: 300 },
  { m: "Jul", digitalArrest: 610, upi: 540, phishing: 330 },
];
const CHANNEL_SPLIT = [
  { name: "Phone Call", value: 38 },
  { name: "WhatsApp", value: 27 },
  { name: "SMS", value: 18 },
  { name: "Email", value: 11 },
  { name: "Other", value: 6 },
];
const PIE_COLORS = [C.cyan, C.violet, C.amber, C.red, C.sub];
const HOTSPOTS_FALLBACK = [
  { city: "Jamtara", n: 412 }, { city: "Mewat", n: 356 }, { city: "Bharatpur", n: 298 },
  { city: "Ahmedabad", n: 210 }, { city: "Bengaluru", n: 188 }, { city: "Delhi NCR", n: 176 },
];
const MONTH_NAMES = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function categoryKey(cat) {
  if (cat === "Digital Arrest Scam") return "digitalArrest";
  if (cat === "Financial / UPI Fraud") return "upi";
  if (cat === "Phishing / Job-Lure Scam") return "phishing";
  return "other";
}
function transformByCategory(rows) {
  const byMonth = {};
  rows.forEach((r) => {
    const key = `${r._id.year}-${r._id.month}`;
    if (!byMonth[key]) byMonth[key] = { m: MONTH_NAMES[r._id.month], digitalArrest: 0, upi: 0, phishing: 0, other: 0 };
    byMonth[key][categoryKey(r._id.category)] += r.count;
  });
  return Object.values(byMonth);
}

function AnalyticsTab() {
  const { user } = useAuth();
  const [monthly, setMonthly] = useState(MONTHLY);
  const [hotspots, setHotspots] = useState(HOTSPOTS_FALLBACK);
  const [status, setStatus] = useState(user && OFFICER_ROLES.includes(user.role) ? "loading" : "auth");

  useEffect(() => {
    let live = true;
    if (!user || !OFFICER_ROLES.includes(user.role)) { setStatus("auth"); return; }
    setStatus("loading");
    Promise.all([api.analyticsByCategory(6), api.analyticsHotspots()])
      .then(([byCat, hs]) => {
        if (!live) return;
        if (byCat.rows.length) setMonthly(transformByCategory(byCat.rows));
        if (hs.hotspots.length) setHotspots(hs.hotspots.map((h) => ({ city: h._id, n: h.count })));
        setStatus("live");
      })
      .catch(() => { if (live) setStatus("offline"); });
    return () => { live = false; };
  }, [user]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
      <div style={{ gridColumn: "1 / -1" }}>
        <DataStatusBanner status={status} liveLabel="LIVE ANALYTICS FROM BACKEND" />
      </div>
      <Panel>
        <SectionLabel>Reports by Category (last 6 months)</SectionLabel>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={monthly}>
            <CartesianGrid stroke={C.line} strokeDasharray="3 3" />
            <XAxis dataKey="m" stroke={C.sub} fontSize={12} />
            <YAxis stroke={C.sub} fontSize={12} />
            <Tooltip contentStyle={{ background: C.panel2, border: `1px solid ${C.line}`, color: C.text }} />
            <Line type="monotone" dataKey="digitalArrest" stroke={C.red} strokeWidth={2} name="Digital Arrest" dot={false} />
            <Line type="monotone" dataKey="upi" stroke={C.amber} strokeWidth={2} name="UPI Fraud" dot={false} />
            <Line type="monotone" dataKey="phishing" stroke={C.cyan} strokeWidth={2} name="Phishing" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Panel>
      <Panel>
        <SectionLabel>Reports by Channel</SectionLabel>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={CHANNEL_SPLIT} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={3}>
              {CHANNEL_SPLIT.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={{ background: C.panel2, border: `1px solid ${C.line}`, color: C.text }} />
          </PieChart>
        </ResponsiveContainer>
      </Panel>
      <Panel style={{ gridColumn: "1 / -1" }}>
        <SectionLabel>Top Reported Hotspots</SectionLabel>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={hotspots}>
            <CartesianGrid stroke={C.line} strokeDasharray="3 3" />
            <XAxis dataKey="city" stroke={C.sub} fontSize={12} />
            <YAxis stroke={C.sub} fontSize={12} />
            <Tooltip contentStyle={{ background: C.panel2, border: `1px solid ${C.line}`, color: C.text }} />
            <Bar dataKey="n" fill={C.violet} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  );
}

/* ---------------------------------------------------------------
   GEOSPATIAL CRIME PATTERN INTELLIGENCE — India map of fraud
   complaint locations. Live data from GET /api/analytics/geopoints
   (officer/analyst/admin only); falls back to a static demo spread
   matching the hotspot cities shown in Analytics.
------------------------------------------------------------------ */
const GEO_FALLBACK = [
  { lat: 23.9600, lng: 86.8100, district: "Jamtara", state: "Jharkhand", riskBand: "CRITICAL", category: "Digital Arrest Scam" },
  { lat: 27.9800, lng: 77.0100, district: "Mewat", state: "Haryana", riskBand: "ELEVATED", category: "Financial / UPI Fraud" },
  { lat: 27.2150, lng: 77.4900, district: "Bharatpur", state: "Rajasthan", riskBand: "ELEVATED", category: "Fake Legal / Government Notice" },
  { lat: 23.0225, lng: 72.5714, district: "Ahmedabad", state: "Gujarat", riskBand: "GUARDED", category: "Phishing / Job-Lure Scam" },
  { lat: 12.9716, lng: 77.5946, district: "Bengaluru", state: "Karnataka", riskBand: "CRITICAL", category: "Financial / UPI Fraud" },
  { lat: 28.6139, lng: 77.2090, district: "Delhi NCR", state: "Delhi", riskBand: "ELEVATED", category: "Digital Arrest Scam" },
  { lat: 22.5726, lng: 88.3639, district: "Kolkata", state: "West Bengal", riskBand: "CRITICAL", category: "Digital Arrest Scam" },
  { lat: 19.0760, lng: 72.8777, district: "Mumbai", state: "Maharashtra", riskBand: "GUARDED", category: "Phishing / Job-Lure Scam" },
  { lat: 18.5204, lng: 73.8567, district: "Pune", state: "Maharashtra", riskBand: "CRITICAL", category: "Digital Arrest Scam" },
  { lat: 17.3850, lng: 78.4867, district: "Hyderabad", state: "Telangana", riskBand: "LOW", category: "Unclassified / Low Signal" },
];

function GeoTab() {
  const { user } = useAuth();
  const [points, setPoints] = useState(GEO_FALLBACK);
  const [status, setStatus] = useState(user && OFFICER_ROLES.includes(user.role) ? "loading" : "auth");

  useEffect(() => {
    let live = true;
    if (!user || !OFFICER_ROLES.includes(user.role)) { setStatus("auth"); return; }
    setStatus("loading");
    api.analyticsGeopoints()
      .then(({ points: p }) => {
        if (!live) return;
        if (p.length) setPoints(p);
        setStatus("live");
      })
      .catch(() => { if (live) setStatus("offline"); });
    return () => { live = false; };
  }, [user]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
      <Panel style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: 20, paddingBottom: 0 }}>
          <DataStatusBanner status={status} liveLabel="LIVE COMPLAINT LOCATIONS FROM BACKEND" />
        </div>
        <MapContainer center={[22.5, 79]} zoom={4.4} style={{ height: 460, width: "100%" }} scrollWheelZoom={true}>
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {points.map((p, i) => (
            <CircleMarker
              key={i}
              center={[p.lat, p.lng]}
              radius={9}
              pathOptions={{ color: BAND_COLOR[p.riskBand] || C.sub, fillColor: BAND_COLOR[p.riskBand] || C.sub, fillOpacity: 0.55, weight: 2 }}
            >
              <Popup>
                <div style={{ fontFamily: FONT_MONO, fontSize: 12 }}>
                  <b>{p.district}, {p.state}</b><br />
                  {p.category}<br />
                  Risk: {p.riskBand}
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </Panel>
      <Panel>
        <SectionLabel>Patrol Prioritisation</SectionLabel>
        <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.6, marginBottom: 14 }}>
          Complaint density by district feeds directly into resource deployment —
          districts showing repeated CRITICAL clusters are surfaced first for
          inter-district intelligence sharing.
        </div>
        <SectionLabel>Legend</SectionLabel>
        {Object.entries(BAND_COLOR).map(([band, color]) => (
          <div key={band} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, marginBottom: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: 10, background: color, display: "inline-block" }} />
            {band}
          </div>
        ))}
        <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 14, paddingTop: 14, fontSize: 12, color: C.sub }}>
          {points.length} reported locations shown{status !== "live" ? " (demo spread)" : ""}.
        </div>
      </Panel>
    </div>
  );
}

/* ---------------------------------------------------------------
   COUNTERFEIT CURRENCY IDENTIFICATION — guided verification tool.
   This is a checklist-based expert system, not a trained computer-
   vision classifier: it is deliberately framed that way rather than
   claiming image-based detection it doesn't do.
------------------------------------------------------------------ */
const CURRENCY_DENOMINATIONS = ["₹2000", "₹500", "₹200", "₹100", "₹50", "₹20", "₹10"];
const SECURITY_CHECKS = [
  { id: "watermark", label: "Mahatma Gandhi watermark visible when held to light", weight: 18 },
  { id: "thread", label: "Security thread present and readable (changes colour when tilted, on ₹500/₹2000)", weight: 20 },
  { id: "microprint", label: "Microprint text is sharp and legible under magnification", weight: 16 },
  { id: "latent", label: "Latent image of denomination visible only at an angle", weight: 16 },
  { id: "uv", label: "Note fluoresces correctly under UV light (numerals/strip glow)", weight: 14 },
  { id: "serial", label: "Serial number font size increases left-to-right and aligns evenly", weight: 10 },
  { id: "texture", label: "Paper has the expected cotton-rag feel (not smooth/plasticky)", weight: 6 },
];

function CounterfeitTab() {
  const [denom, setDenom] = useState("₹500");
  const [answers, setAnswers] = useState({});
  const [imgPreview, setImgPreview] = useState(null);
  const [result, setResult] = useState(null);

  const setAnswer = (id, val) => setAnswers((a) => ({ ...a, [id]: val }));

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImgPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const run = () => {
    let riskScore = 0;
    const failed = [];
    SECURITY_CHECKS.forEach((c) => {
      const a = answers[c.id];
      if (a === "no") { riskScore += c.weight; failed.push(`${c.label} — FAILED`); }
      else if (a === "unsure") { riskScore += c.weight * 0.5; failed.push(`${c.label} — could not verify`); }
    });
    riskScore = Math.min(96, Math.round(riskScore));
    const band = riskScore >= 55 ? "CRITICAL" : riskScore >= 32 ? "ELEVATED" : riskScore >= 12 ? "GUARDED" : "LOW";
    const answeredCount = Object.keys(answers).length;
    setResult({
      score: riskScore,
      band,
      category: `Suspected Counterfeit — ${denom}`,
      confidence: Math.min(94, 40 + answeredCount * 8),
      hits: failed.map((f) => ({ label: f })),
      actions: band === "CRITICAL" || band === "ELEVATED"
        ? [
            "Do not accept or circulate this note — set it aside.",
            "Report to your bank's currency verification desk or nearest police station.",
            "File a report under the Currency Notes Press / RBI counterfeit reporting process.",
          ]
        : ["No strong counterfeit indicators found across the checked features — verify remaining items if unsure."],
      source: "checklist",
    });
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <Panel>
        <SectionLabel>1. Denomination</SectionLabel>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {CURRENCY_DENOMINATIONS.map((d) => (
            <button key={d} onClick={() => setDenom(d)} style={{
              padding: "6px 12px", borderRadius: 8, border: `1px solid ${denom === d ? C.cyan : C.line}`,
              background: denom === d ? `${C.cyan}14` : "transparent", color: denom === d ? C.cyan : C.sub,
              fontFamily: FONT_MONO, fontSize: 13, cursor: "pointer",
            }}>{d}</button>
          ))}
        </div>

        <SectionLabel>2. Photo (optional, for your own record)</SectionLabel>
        <label style={{
          display: "flex", alignItems: "center", gap: 8, border: `1px dashed ${C.line}`, borderRadius: 8,
          padding: "12px 14px", cursor: "pointer", color: C.sub, fontSize: 13, marginBottom: 16,
        }}>
          <Upload size={15} /> {imgPreview ? "Photo attached — click to replace" : "Upload a photo of the note"}
          <input type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
        </label>
        {imgPreview && (
          <img src={imgPreview} alt="Currency note" style={{ width: "100%", borderRadius: 8, marginBottom: 16, border: `1px solid ${C.line}` }} />
        )}

        <SectionLabel>3. Verify each security feature</SectionLabel>
        {SECURITY_CHECKS.map((c) => (
          <div key={c.id} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12.5, color: C.text, marginBottom: 6 }}>{c.label}</div>
            <div style={{ display: "flex", gap: 6 }}>
              {["yes", "unsure", "no"].map((v) => (
                <button key={v} onClick={() => setAnswer(c.id, v)} style={{
                  flex: 1, padding: "6px 0", borderRadius: 6, fontSize: 11.5, cursor: "pointer",
                  border: `1px solid ${answers[c.id] === v ? (v === "no" ? C.red : v === "unsure" ? C.amber : C.green) : C.line}`,
                  background: answers[c.id] === v ? `${v === "no" ? C.red : v === "unsure" ? C.amber : C.green}18` : "transparent",
                  color: answers[c.id] === v ? (v === "no" ? C.red : v === "unsure" ? C.amber : C.green) : C.sub,
                  textTransform: "uppercase", fontFamily: FONT_DISPLAY, letterSpacing: 0.5,
                }}>{v}</button>
              ))}
            </div>
          </div>
        ))}
        <button
          onClick={run}
          disabled={Object.keys(answers).length === 0}
          style={{
            width: "100%", marginTop: 6, background: Object.keys(answers).length ? C.cyan : C.line,
            color: Object.keys(answers).length ? "#03181C" : C.sub, border: "none", borderRadius: 8,
            padding: "10px 18px", fontWeight: 700, cursor: Object.keys(answers).length ? "pointer" : "default",
            fontFamily: FONT_DISPLAY, letterSpacing: 0.5,
          }}
        >
          <Landmark size={15} style={{ marginRight: 6, verticalAlign: -3 }} /> GET VERDICT
        </button>
        <div style={{ fontSize: 11, color: C.sub, marginTop: 10, lineHeight: 1.5 }}>
          This is a guided verification checklist based on RBI-published security
          features — not an automated image classifier. A production deployment
          (per the brief) would run microprint/UV/serial-pattern computer vision
          on bank counting machines and POS terminals.
        </div>
      </Panel>
      <Panel>
        {!result && (
          <div style={{ color: C.sub, fontSize: 13 }}>
            Answer the checklist on the left and press "Get Verdict" — your risk
            score and recommended action will appear here.
          </div>
        )}
        {result && (
          <div>
            <RiskGauge score={result.score} band={result.band} />
            <div style={{ fontSize: 17, fontFamily: FONT_DISPLAY, fontWeight: 700, margin: "10px 0" }}>{result.category}</div>
            <SectionLabel>Findings</SectionLabel>
            {result.hits.length === 0 && <div style={{ color: C.sub, fontSize: 13, marginBottom: 14 }}>All checked features passed.</div>}
            {result.hits.map((h, i) => (
              <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, marginBottom: 8 }}>
                <AlertTriangle size={14} color={C.amber} style={{ marginTop: 2, flexShrink: 0 }} />
                <span>{h.label}</span>
              </div>
            ))}
            <SectionLabel>Recommended Action</SectionLabel>
            {result.actions.map((a, i) => (
              <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, marginBottom: 8 }}>
                <CheckCircle2 size={14} color={C.green} style={{ marginTop: 2, flexShrink: 0 }} />
                <span>{a}</span>
              </div>
            ))}
            <button
              onClick={() => downloadReport("counterfeit-check.txt", result, `${denom} note — feature checklist`)}
              style={{
                display: "flex", alignItems: "center", gap: 8, background: C.cyan, color: "#03181C", border: "none",
                borderRadius: 8, padding: "10px 16px", fontWeight: 700, cursor: "pointer", fontFamily: FONT_DISPLAY,
                letterSpacing: 0.5, marginTop: 10,
              }}
            >
              <Download size={16} /> DOWNLOAD REPORT
            </button>
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ---------------------------------------------------------------
   APP SHELL
------------------------------------------------------------------ */
const TABS = [
  { id: "overview", label: "Command Center", icon: Radio },
  { id: "detector", label: "Scam Detector", icon: ShieldAlert },
  { id: "graph", label: "Fraud Network", icon: Network },
  { id: "geo", label: "Geospatial Map", icon: MapPin },
  { id: "counterfeit", label: "Currency Check", icon: Landmark },
  { id: "portal", label: "Citizen Portal", icon: Users },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
];

function TopBarAuth({ onLoginClick }) {
  const { user, logout } = useAuth();
  if (!user) {
    return (
      <button onClick={onLoginClick} style={{
        display: "flex", alignItems: "center", gap: 6, background: C.cyan, color: "#03181C",
        border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, cursor: "pointer",
        fontFamily: FONT_DISPLAY, letterSpacing: 0.5, fontSize: 12.5,
      }}>
        <LogIn size={14} /> LOG IN
      </button>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Pill color={C.cyan}>{user.name} · {user.role.replace("_", " ").toUpperCase()}</Pill>
      <button onClick={logout} style={{
        display: "flex", alignItems: "center", gap: 6, background: "transparent", color: C.sub,
        border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 12,
      }}>
        <LogOut size={13} /> LOG OUT
      </button>
    </div>
  );
}

function AppShell() {
  const [tab, setTab] = useState("overview");
  const [showLogin, setShowLogin] = useState(false);
  const { booting } = useAuth();

  if (booting) {
    return <div style={{ background: C.bg, color: C.sub, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>Loading…</div>;
  }

  return (
    <div style={{
      background: C.bg, color: C.text, minHeight: "100vh", fontFamily: "'Inter', system-ui, sans-serif",
      padding: "20px 22px 40px",
    }}>
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8, background: `${C.cyan}18`, border: `1px solid ${C.cyan}55`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <ShieldAlert size={18} color={C.cyan} />
          </div>
          <div>
            <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, letterSpacing: 0.5, textTransform: "uppercase" }}>
              Citizen Fraud Shield <span style={{ color: C.cyan }}>AI</span>
            </div>
            <div style={{ fontSize: 10.5, color: C.sub, letterSpacing: 0.5 }}>DIGITAL PUBLIC SAFETY INTELLIGENCE PLATFORM</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Pill color={C.green}><span style={{ width: 6, height: 6, borderRadius: 6, background: C.green, display: "inline-block" }} /> LIVE THREAT MONITORING</Pill>
          <TopBarAuth onLoginClick={() => setShowLogin(true)} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 18, borderBottom: `1px solid ${C.line}`, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none",
            borderBottom: `2px solid ${tab === t.id ? C.cyan : "transparent"}`, color: tab === t.id ? C.text : C.sub,
            padding: "10px 14px", fontSize: 13, cursor: "pointer", fontFamily: FONT_DISPLAY, letterSpacing: 0.5,
          }}>
            <t.icon size={14} /> {t.label.toUpperCase()}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab />}
      {tab === "detector" && <DetectorTab />}
      {tab === "graph" && <GraphTab />}
      {tab === "geo" && <GeoTab />}
      {tab === "counterfeit" && <CounterfeitTab />}
      {tab === "portal" && <CitizenPortalTab />}
      {tab === "analytics" && <AnalyticsTab />}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
