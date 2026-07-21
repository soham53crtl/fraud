/**
 * One-shot seeder for local/demo use.
 * Creates demo accounts for each role, plus a small fraud-entity graph and a
 * couple of complaints, so the frontend has real backend data to show the
 * moment you log in — no manual DB editing needed.
 *
 * Run with:  npm run seed   (from the backend/ folder, after `npm install`)
 */
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

import User from "./models/User.js";
import FraudEntity from "./models/FraudEntity.js";
import Connection from "./models/Connection.js";
import Complaint from "./models/Complaint.js";

dotenv.config();

const DEMO_USERS = [
  { name: "Demo Citizen", email: "citizen@demo.com", password: "citizen123", role: "citizen", phone: "9800000001" },
  { name: "Demo Police Officer", email: "officer@demo.com", password: "officer123", role: "police_officer", organisation: "Kolkata Cyber Cell" },
  { name: "Demo Cyber Analyst", email: "analyst@demo.com", password: "analyst123", role: "cyber_analyst", organisation: "I4C" },
  { name: "Demo Bank Officer", email: "bank@demo.com", password: "bank123", role: "bank_officer", organisation: "SBI Fraud Risk Mgmt" },
  { name: "Demo Admin", email: "admin@demo.com", password: "admin123", role: "admin" },
];

// Mirrors the illustrative network already shown in the frontend demo, so the
// live "Fraud Network" tab looks the same before/after wiring to the backend.
const ENTITIES = [
  { type: "victim", value: "victim-r-sharma", label: "Victim: R. Sharma", riskLevel: "low", metadata: { note: "Lost ₹1,85,000 · reported 12 Jul" } },
  { type: "victim", value: "victim-a-iyer", label: "Victim: A. Iyer", riskLevel: "low", metadata: { note: "Lost ₹42,000 · reported 09 Jul" } },
  { type: "victim", value: "victim-m-khan", label: "Victim: M. Khan", riskLevel: "low", metadata: { note: "Attempt blocked · reported 14 Jul" } },
  { type: "phone", value: "+9198XXXXXX01", label: "+91 98••••01", riskLevel: "confirmed", metadata: { note: "Used in 6 reports across 3 states" } },
  { type: "phone", value: "+9191XXXXXX45", label: "+91 91••••45", riskLevel: "high", metadata: { note: "SIM issued on forged ID, Bihar circle" } },
  { type: "phone", value: "+9189XXXXXX77", label: "+91 89••••77", riskLevel: "high", metadata: { note: "VoIP spoofed caller ID" } },
  { type: "bank_account", value: "4521XXXXXX09", label: "A/C 4521••••09", riskLevel: "confirmed", metadata: { note: "Mule account, opened 22 days ago" } },
  { type: "bank_account", value: "7788XXXXXX33", label: "A/C 7788••••33", riskLevel: "confirmed", metadata: { note: "Frozen by bank fraud team" } },
  { type: "upi_id", value: "scammer1@oksbi", label: "scammer1@oksbi", riskLevel: "confirmed", metadata: { note: "14 inbound txns" } },
  { type: "upi_id", value: "fraudpay@ybl", label: "fraudpay@ybl", riskLevel: "high", metadata: {} },
  { type: "wallet", value: "wallet-w2291", label: "Wallet #W2291", riskLevel: "high", metadata: { note: "Cash-out point" } },
  { type: "email", value: "cbi.notice@mailx.in", label: "cbi.notice@mailx.in", riskLevel: "confirmed", metadata: { note: "Domain registered 8 days before first report" } },
  { type: "ip_address", value: "103.21.0.0", label: "103.21.x.x", riskLevel: "medium", metadata: { note: "Commercial VPN exit node, Singapore" } },
];

const LINKS = [
  ["victim-r-sharma", "+9198XXXXXX01", "victim_of"],
  ["victim-r-sharma", "cbi.notice@mailx.in", "victim_of"],
  ["victim-a-iyer", "+9198XXXXXX01", "victim_of"],
  ["victim-a-iyer", "+9191XXXXXX45", "victim_of"],
  ["victim-m-khan", "+9189XXXXXX77", "victim_of"],
  ["+9198XXXXXX01", "4521XXXXXX09", "used_by"],
  ["+9198XXXXXX01", "scammer1@oksbi", "used_by"],
  ["+9191XXXXXX45", "4521XXXXXX09", "used_by"],
  ["+9191XXXXXX45", "fraudpay@ybl", "used_by"],
  ["+9189XXXXXX77", "7788XXXXXX33", "used_by"],
  ["scammer1@oksbi", "wallet-w2291", "cash_out_to"],
  ["fraudpay@ybl", "wallet-w2291", "cash_out_to"],
  ["4521XXXXXX09", "103.21.0.0", "same_ring"],
  ["cbi.notice@mailx.in", "103.21.0.0", "same_ring"],
  ["+9189XXXXXX77", "cbi.notice@mailx.in", "same_ring"],
];

async function run() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set — copy .env.example to .env and fill it in first.");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB for seeding…");

  // --- Users ---
  for (const u of DEMO_USERS) {
    const passwordHash = await bcrypt.hash(u.password, 12);
    await User.findOneAndUpdate(
      { email: u.email },
      { name: u.name, email: u.email, passwordHash, role: u.role, phone: u.phone, organisation: u.organisation, isActive: true },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  console.log(`Seeded ${DEMO_USERS.length} demo users.`);

  // --- Fraud entities ---
  const idByValue = {};
  for (const e of ENTITIES) {
    const doc = await FraudEntity.findOneAndUpdate(
      { type: e.type, value: e.value },
      { ...e, lastSeenAt: new Date() },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    idByValue[e.value] = doc._id;
  }
  console.log(`Seeded ${ENTITIES.length} fraud entities.`);

  // --- Connections ---
  let linkCount = 0;
  for (const [sVal, tVal, relationship] of LINKS) {
    const source = idByValue[sVal];
    const target = idByValue[tVal];
    if (!source || !target) continue;
    await Connection.findOneAndUpdate(
      { source, target, relationship },
      { source, target, relationship, weight: 1 },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    linkCount++;
  }
  console.log(`Seeded ${linkCount} connections.`);

  // --- Sample complaints across India, so /api/analytics/geopoints and
  // hotspots have real spread to show on the map ---
  const citizen = await User.findOne({ email: "citizen@demo.com" });
  const SAMPLE_COMPLAINTS = [
    { channel: "whatsapp", category: "Digital Arrest Scam", riskBand: "CRITICAL", riskScore: 88, financialLoss: 45000, state: "West Bengal", district: "Kolkata", lat: 22.5726, lng: 88.3639,
      rawContent: "This is Officer Sharma from CBI. A parcel with your Aadhaar linked to narcotics has been seized. Stay on this video call and pay a refundable verification fee of Rs 45,000 immediately." },
    { channel: "audio", category: "Digital Arrest Scam", riskBand: "CRITICAL", riskScore: 91, financialLoss: 180000, state: "Jharkhand", district: "Jamtara", lat: 23.9600, lng: 86.8100,
      rawContent: "Customs department calling, your courier has illegal items, non-bailable warrant issued, stay on video call, pay verification deposit now." },
    { channel: "sms", category: "Financial / UPI Fraud", riskBand: "ELEVATED", riskScore: 58, financialLoss: 2340, state: "Haryana", district: "Mewat", lat: 27.9800, lng: 77.0100,
      rawContent: "Your electricity bill payment failed. Share the OTP and UPI PIN to get refund processed within 30 minutes." },
    { channel: "email", category: "Fake Legal / Government Notice", riskBand: "ELEVATED", riskScore: 62, financialLoss: 0, state: "Rajasthan", district: "Bharatpur", lat: 27.2150, lng: 77.4900,
      rawContent: "Court notice attached — Enforcement Directorate case pending, respond within 48 hours or a warrant will be issued." },
    { channel: "sms", category: "Phishing / Job-Lure Scam", riskBand: "GUARDED", riskScore: 41, financialLoss: 500, state: "Gujarat", district: "Ahmedabad", lat: 23.0225, lng: 72.5714,
      rawContent: "Congratulations, you got a work from home task job with daily payout, click link and pay Rs 500 registration fee." },
    { channel: "whatsapp", category: "Financial / UPI Fraud", riskBand: "CRITICAL", riskScore: 79, financialLoss: 95000, state: "Karnataka", district: "Bengaluru", lat: 12.9716, lng: 77.5946,
      rawContent: "Your bank account will be suspended, share OTP and CVV immediately to keep account active." },
    { channel: "audio", category: "Digital Arrest Scam", riskBand: "ELEVATED", riskScore: 66, financialLoss: 0, state: "Delhi", district: "Delhi NCR", lat: 28.6139, lng: 77.2090,
      rawContent: "TRAI calling, your mobile number will be blocked in 2 hours due to complaints, press 9 to connect to cyber cell." },
    { channel: "url", category: "Phishing / Job-Lure Scam", riskBand: "GUARDED", riskScore: 37, financialLoss: 0, state: "Maharashtra", district: "Mumbai", lat: 19.0760, lng: 72.8777,
      rawContent: "https://bit.ly/lucky-prize-claim-now — claim your lottery prize of Rs 25 lakh, limited time offer." },
    { channel: "sms", category: "Unclassified / Low Signal", riskBand: "LOW", riskScore: 18, financialLoss: 0, state: "Telangana", district: "Hyderabad", lat: 17.3850, lng: 78.4867,
      rawContent: "Reminder: your subscription renews tomorrow." },
    { channel: "whatsapp", category: "Digital Arrest Scam", riskBand: "CRITICAL", riskScore: 84, financialLoss: 320000, state: "Maharashtra", district: "Pune", lat: 18.5204, lng: 73.8567,
      rawContent: "Income Tax department — you are under investigation for money laundering, stay on this call, do not disconnect, pay to avoid arrest." },
  ];
  for (const c of SAMPLE_COMPLAINTS) {
    await Complaint.findOneAndUpdate(
      { reportedBy: citizen._id, channel: c.channel, category: c.category, "location.district": c.district },
      {
        reportedBy: citizen._id,
        channel: c.channel,
        rawContent: c.rawContent,
        riskScore: c.riskScore,
        riskBand: c.riskBand,
        category: c.category,
        confidence: 85,
        signals: [],
        recommendedActions: ["Call the National Cyber Crime Helpline 1930."],
        status: c.riskBand === "CRITICAL" ? "escalated" : "under_review",
        financialLoss: c.financialLoss,
        location: { state: c.state, district: c.district, lat: c.lat, lng: c.lng },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  console.log(`Seeded ${SAMPLE_COMPLAINTS.length} sample complaints across India.`);

  console.log("\nDemo logins (email / password):");
  DEMO_USERS.forEach((u) => console.log(`  ${u.role.padEnd(15)} ${u.email} / ${u.password}`));

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
