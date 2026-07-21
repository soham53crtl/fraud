import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

/**
 * SIGNAL_LIBRARY mirrors the frontend demo's heuristic scorer so behaviour
 * is consistent while a real model call is wired in. Replace runRiskEngine's
 * body with a call to Gemini/Claude — keep the same return shape so every
 * caller (reports route, citizen portal, incident PDF) keeps working.
 */
const SIGNAL_LIBRARY = [
  { re: /digital arrest|virtual arrest/i, w: 34, label: "References 'digital arrest' — a procedure that does not exist in Indian law" },
  { re: /cbi|central bureau|enforcement directorate|\bed\b|narcotics control|customs department|trai\b/i, w: 22, label: "Impersonates a central law-enforcement or regulatory agency" },
  { re: /arrest warrant|non.?bailable|fir (has been|is) (filed|registered)|court notice/i, w: 20, label: "Claims a warrant, FIR, or court order exists against you" },
  { re: /video call|skype call|whatsapp video|stay on (the )?call|do not disconnect/i, w: 16, label: "Pressures you to stay on a video/voice call continuously" },
  { re: /aadhaar (card )?(link|misuse|suspend|block)|sim (card )?(block|deactivat)/i, w: 14, label: "Threatens to block your Aadhaar-linked SIM or ID" },
  { re: /parcel|courier|customs.{0,15}(drugs|narcotics|illegal)/i, w: 16, label: "Uses a fake parcel/customs seizure narrative" },
  { re: /pay (immediately|now|within)|processing fee|refundable (security )?deposit|verification fee/i, w: 18, label: "Demands urgent payment framed as refundable or procedural" },
  { re: /otp|one time password|cvv|upi pin/i, w: 20, label: "Requests OTP, CVV, or UPI PIN" },
  { re: /(bit\.ly|tinyurl|cutt\.ly|rebrand\.ly|is\.gd)\/\S+/i, w: 15, label: "Contains a shortened URL that hides the true destination" },
  { re: /https?:\/\/\S+/i, w: 6, label: "Contains an embedded link" },
  { re: /lottery|kbc|lucky draw|prize won/i, w: 18, label: "Uses a prize/lottery hook" },
  { re: /job offer|work from home|part.?time.{0,10}earn/i, w: 14, label: "Uses a task-based job / easy-money hook" },
  { re: /confidential|do not tell (anyone|family)|keep this (secret|private)/i, w: 16, label: "Instructs you to keep the matter secret from family" },
];

const ACTIONS = {
  CRITICAL: [
    "Do not make any payment or share any OTP/PIN.",
    "End the call/chat immediately — real agencies never arrest over video call.",
    "Call the National Cyber Crime Helpline 1930 or file at cybercrime.gov.in now.",
    "Preserve screenshots and the caller's number as evidence before blocking.",
  ],
  ELEVATED: [
    "Do not click any link or share OTP/CVV/UPI PIN.",
    "Verify independently by calling the organisation's official number.",
    "Report the number/URL on the Chakshu portal (sancharsaathi.gov.in).",
  ],
  GUARDED: [
    "Avoid clicking links from unknown senders.",
    "Verify sender identity through an official channel before acting.",
  ],
  LOW: ["No strong scam indicators detected — stay generally cautious with unsolicited messages."],
};

export async function runRiskEngine(text) {
  const input = text || "";
  const hits = SIGNAL_LIBRARY.filter((s) => s.re.test(input));
  const score = Math.max(4, Math.min(98, hits.reduce((a, s) => a + s.w, 0)));
  const band = score >= 70 ? "CRITICAL" : score >= 45 ? "ELEVATED" : score >= 20 ? "GUARDED" : "LOW";

  let category = "Unclassified / Low Signal";
  if (/digital arrest|virtual arrest/i.test(input)) category = "Digital Arrest Scam";
  else if (/cbi|court notice|fir|warrant|customs/i.test(input)) category = "Fake Legal / Government Notice";
  else if (/otp|upi pin|refund|cvv/i.test(input)) category = "Financial / UPI Fraud";
  else if (/job offer|work from home|lottery|prize/i.test(input)) category = "Phishing / Job-Lure Scam";

  return {
    score,
    band,
    category,
    confidence: Math.min(96, 52 + hits.length * 7),
    hits: hits.map((h) => ({ label: h.label, weight: h.w })),
    actions: ACTIONS[band],
    legalGuidance:
      "No Indian law-enforcement agency conducts arrests or investigations over phone/video call, nor demands payment for verification. Report to 1930 or cybercrime.gov.in.",
  };
}

// POST /api/ai/analyze — used by the Scam Detector UI, independent of filing a report
router.post("/analyze", requireAuth, async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: "text is required" });
    const verdict = await runRiskEngine(text);
    res.json({ verdict });
  } catch (err) { next(err); }
});

export default router;
