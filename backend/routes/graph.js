import { Router } from "express";
import FraudEntity from "../models/FraudEntity.js";
import Connection from "../models/Connection.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

// GET /api/graph/overview — bootstrap data for the Fraud Network tab (bounded, most-recent-first)
router.get("/overview", requireAuth, requireRole("police_officer", "cyber_analyst", "admin"), async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 60, 200);
    const entities = await FraudEntity.find({}).sort({ lastSeenAt: -1 }).limit(limit);
    const ids = entities.map((e) => e._id);
    const connections = await Connection.find({
      source: { $in: ids }, target: { $in: ids },
    });
    res.json({ entities, connections });
  } catch (err) { next(err); }
});

// GET /api/graph/search?q=... — investigators only
router.get("/search", requireAuth, requireRole("police_officer", "cyber_analyst", "admin"), async (req, res, next) => {
  try {
    const q = req.query.q || "";
    const entities = await FraudEntity.find({ value: { $regex: q, $options: "i" } }).limit(25);
    res.json({ entities });
  } catch (err) { next(err); }
});

// GET /api/graph/entity/:id — full neighbourhood (1-hop) for the graph UI
router.get("/entity/:id", requireAuth, requireRole("police_officer", "cyber_analyst", "admin"), async (req, res, next) => {
  try {
    const entity = await FraudEntity.findById(req.params.id).populate("relatedComplaints");
    if (!entity) return res.status(404).json({ error: "Entity not found" });

    const connections = await Connection.find({
      $or: [{ source: entity._id }, { target: entity._id }],
    }).populate("source target");

    res.json({ entity, connections });
  } catch (err) { next(err); }
});

// GET /api/graph/cluster/:id — expand N hops to surface a whole fraud ring
router.get("/cluster/:id", requireAuth, requireRole("police_officer", "cyber_analyst", "admin"), async (req, res, next) => {
  try {
    const depth = Math.min(Number(req.query.depth) || 2, 4);
    const visited = new Set([req.params.id]);
    let frontier = [req.params.id];

    for (let i = 0; i < depth; i++) {
      const conns = await Connection.find({
        $or: [{ source: { $in: frontier } }, { target: { $in: frontier } }],
      });
      const next = new Set();
      conns.forEach((c) => {
        [String(c.source), String(c.target)].forEach((id) => {
          if (!visited.has(id)) { visited.add(id); next.add(id); }
        });
      });
      frontier = [...next];
      if (frontier.length === 0) break;
    }

    const entities = await FraudEntity.find({ _id: { $in: [...visited] } });
    const connections = await Connection.find({
      source: { $in: [...visited] }, target: { $in: [...visited] },
    });

    res.json({ entities, connections });
  } catch (err) { next(err); }
});

export default router;
