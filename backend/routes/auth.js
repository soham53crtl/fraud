import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

function signToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

// POST /api/auth/signup
router.post("/signup", async (req, res, next) => {
  try {
    const { name, email, password, role, phone, organisation } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "name, email and password are required" });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: "An account with this email already exists" });

    const passwordHash = await bcrypt.hash(password, 12);
    // Only admins can promote a signup to a non-citizen role; default new signups to "citizen".
    const user = await User.create({
      name, email, passwordHash, phone, organisation,
      role: role === "citizen" ? "citizen" : "citizen",
    });

    res.status(201).json({ token: signToken(user), user: { id: user._id, name: user.name, role: user.role } });
  } catch (err) { next(err); }
});

// POST /api/auth/login
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: (email || "").toLowerCase() });
    if (!user || !(await bcrypt.compare(password || "", user.passwordHash))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    user.lastLoginAt = new Date();
    await user.save();
    res.json({ token: signToken(user), user: { id: user._id, name: user.name, role: user.role } });
  } catch (err) { next(err); }
});

// POST /api/auth/forgot-password
router.post("/forgot-password", async (req, res, next) => {
  try {
    const user = await User.findOne({ email: (req.body.email || "").toLowerCase() });
    // Always return 200 to avoid leaking which emails are registered
    if (!user) return res.json({ ok: true });

    const token = crypto.randomBytes(32).toString("hex");
    user.resetToken = crypto.createHash("sha256").update(token).digest("hex");
    user.resetTokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();

    // TODO: send `token` via email provider (SES/SendGrid) — never return raw token in prod
    res.json({ ok: true, devOnlyToken: process.env.NODE_ENV === "development" ? token : undefined });
  } catch (err) { next(err); }
});

// POST /api/auth/reset-password
router.post("/reset-password", async (req, res, next) => {
  try {
    const { token, password } = req.body;
    const hashed = crypto.createHash("sha256").update(token || "").digest("hex");
    const user = await User.findOne({ resetToken: hashed, resetTokenExpiresAt: { $gt: new Date() } });
    if (!user) return res.status(400).json({ error: "Reset token is invalid or has expired" });

    user.passwordHash = await bcrypt.hash(password, 12);
    user.resetToken = undefined;
    user.resetTokenExpiresAt = undefined;
    await user.save();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/auth/me
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("-passwordHash -resetToken");
    res.json({ user });
  } catch (err) { next(err); }
});

export default router;
