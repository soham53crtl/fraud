import { Router } from "express";
import Complaint from "../models/Complaint.js";
import Notification from "../models/Notification.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { runRiskEngine } from "./aiAnalysis.js";

const router = Router();

// POST /api/reports — citizen submits a new report (any channel)
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const { channel, rawContent, evidenceRefs, location } = req.body;
    if (!channel || !rawContent) return res.status(400).json({ error: "channel and rawContent are required" });

    const verdict = await runRiskEngine(rawContent);

    const complaint = await Complaint.create({
      reportedBy: req.user.id,
      channel,
      rawContent,
      evidenceRefs,
      location,
      riskScore: verdict.score,
      riskBand: verdict.band,
      category: verdict.category,
      confidence: verdict.confidence,
      signals: verdict.hits,
      recommendedActions: verdict.actions,
    });

    // Push a real-time alert to investigators for high-risk reports
    if (verdict.band === "CRITICAL" || verdict.band === "ELEVATED") {
      const io = req.app.get("io");
      await Notification.create({
        recipientRole: "cyber_analyst",
        title: `${verdict.band} risk report filed`,
        body: `${verdict.category} — score ${verdict.score}`,
        severity: verdict.band === "CRITICAL" ? "critical" : "warning",
        relatedComplaint: complaint._id,
      });
      io.to("cyber_analyst").to("police_officer").emit("fraud-alert", {
        complaintId: complaint._id, band: verdict.band, category: verdict.category, score: verdict.score,
      });
    }

    res.status(201).json({ complaint, verdict });
  } catch (err) { next(err); }
});

// GET /api/reports — citizens see their own; investigators see all (with filters)
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const { status, band, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (["citizen"].includes(req.user.role)) filter.reportedBy = req.user.id;
    if (status) filter.status = status;
    if (band) filter.riskBand = band;

    const reports = await Complaint.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    const total = await Complaint.countDocuments(filter);

    res.json({ reports, total, page: Number(page), limit: Number(limit) });
  } catch (err) { next(err); }
});

// GET /api/reports/:id
router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const report = await Complaint.findById(req.params.id).populate("linkedEntities");
    if (!report) return res.status(404).json({ error: "Report not found" });
    if (req.user.role === "citizen" && String(report.reportedBy) !== req.user.id) {
      return res.status(403).json({ error: "Not authorised to view this report" });
    }
    res.json({ report });
  } catch (err) { next(err); }
});

// PATCH /api/reports/:id/status — investigators update case status
router.patch("/:id/status", requireAuth, requireRole("police_officer", "cyber_analyst", "admin"), async (req, res, next) => {
  try {
    const { status, assignedTo } = req.body;
    const report = await Complaint.findByIdAndUpdate(
      req.params.id,
      { ...(status && { status }), ...(assignedTo && { assignedTo }) },
      { new: true }
    );
    if (!report) return res.status(404).json({ error: "Report not found" });
    res.json({ report });
  } catch (err) { next(err); }
});

export default router;
