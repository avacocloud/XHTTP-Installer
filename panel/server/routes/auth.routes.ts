import { Router } from "express";
import bcrypt from "bcrypt";
import { getDb } from "../db/init.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/helpers.js";

const router = Router();

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: "Username and password are required" });
      return;
    }

    const db = getDb();
    const admin = db.prepare("SELECT * FROM admin WHERE username = ?").get(username) as
      | { id: number; username: string; password: string }
      | undefined;

    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    db.prepare("INSERT INTO activity_log (action, detail) VALUES (?, ?)").run(
      "login",
      `Admin login: ${username}`
    );

    const payload = { userId: admin.id, username: admin.username };
    res.json({
      accessToken: signAccessToken(payload),
      refreshToken: signRefreshToken(payload),
    });
  })
);

router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ error: "Refresh token is required" });
      return;
    }

    try {
      const payload = verifyRefreshToken(refreshToken);
      const newPayload = { userId: payload.userId, username: payload.username };
      res.json({
        accessToken: signAccessToken(newPayload),
        refreshToken: signRefreshToken(newPayload),
      });
    } catch {
      res.status(401).json({ error: "Invalid or expired refresh token" });
    }
  })
);

router.get("/me", requireAuth, (req, res) => {
  res.json({ userId: req.user!.userId, username: req.user!.username });
});

router.post(
  "/change-password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: "Current and new passwords are required" });
      return;
    }
    if (newPassword.length < 6) {
      res.status(400).json({ error: "New password must be at least 6 characters" });
      return;
    }

    const db = getDb();
    const admin = db.prepare("SELECT * FROM admin WHERE id = ?").get(req.user!.userId) as
      | { id: number; password: string }
      | undefined;

    if (!admin || !(await bcrypt.compare(currentPassword, admin.password))) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    db.prepare("UPDATE admin SET password = ? WHERE id = ?").run(hashed, admin.id);

    db.prepare("INSERT INTO activity_log (action, detail) VALUES (?, ?)").run(
      "change_password",
      "Admin password changed"
    );

    res.json({ message: "Password changed successfully" });
  })
);

export default router;
