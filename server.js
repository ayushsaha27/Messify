// ═══════════════════════════════════════════════════════════
//  Messify Backend — server.js
//  Auth + MongoDB feedback storage + Analytics Engine + PDF
// ═══════════════════════════════════════════════════════════
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");
const { initDB, User, Feedback } = require("./db");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3000;

// ── OTP STORE (in-memory, expires in 10 minutes) ─────────────
const otpStore = {}; // { email: { otp, expiresAt } }

// ── EMAIL TRANSPORTER ────────────────────────────────────────
// Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in your .env
// Works with Gmail (use an App Password), Outlook, etc.
function getMailTransporter() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST || "smtp.gmail.com",
    port:   parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || "",
    },
  });
}

async function sendOTPEmail(toEmail, otp) {
  const transporter = getMailTransporter();
  await transporter.sendMail({
    from: `"Messify – NIST University" <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject: "Messify Password Reset OTP",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#111827;color:#f0f4ff;border-radius:16px;">
        <h2 style="color:#f97316;margin-bottom:8px;">🍽 Messify</h2>
        <p style="color:#6b7a99;margin-bottom:24px;">NIST University Mess Portal</p>
        <h3 style="margin-bottom:16px;">Your Password Reset OTP</h3>
        <div style="background:#1a2235;border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;">
          <span style="font-size:36px;font-weight:800;letter-spacing:8px;color:#f97316;">${otp}</span>
        </div>
        <p style="color:#6b7a99;font-size:13px;">This OTP is valid for <strong style="color:#f0f4ff;">10 minutes</strong>. Do not share it with anyone.</p>
        <p style="color:#6b7a99;font-size:12px;margin-top:16px;">If you didn't request this, ignore this email.</p>
      </div>
    `,
  });
}

// ── CONFIGURATION & BRANDING ────────────────────────────────
const ALLOWED_DOMAIN = process.env.ALLOWED_DOMAIN || "@nist.edu";
const UNIVERSITY_NAME = process.env.UNIVERSITY_NAME || "NIST University";

// ── RESTORED CORE HELPERS ────────────────────────────────────
const isNistEmail = (e) => e.trim().toLowerCase().endsWith(ALLOWED_DOMAIN);
const genId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2);
const isAdminEmail = (e) => {
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((x) => x.trim().toLowerCase());
  return list.includes(e.toLowerCase());
};

function escHtml(s) {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
}

function getCurrentWeekInfo() {
  const now = new Date();
  const wnum = getWeekNumber(now);
  const key = `${now.getFullYear()}-W${wnum}`;
  const day = now.getDay() || 7;
  const mon = new Date(now);
  mon.setDate(now.getDate() - day + 1);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (d) =>
    d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  const acadYear =
    now.getMonth() >= 7
      ? `${now.getFullYear()}–${String(now.getFullYear() + 1).slice(2)}`
      : `${now.getFullYear() - 1}–${String(now.getFullYear()).slice(2)}`;

  return {
    key,
    label: `Week ${wnum}, ${now.getFullYear()}`,
    range: `${fmt(mon)} – ${fmt(sun)}`,
    weekNum: wnum,
    year: now.getFullYear(),
    acadYear,
  };
}

const MEAL_KEYS = { breakfast: "b", lunch: "l", snacks: "s", dinner: "d" };
const MEALS = ["breakfast", "lunch", "snacks", "dinner"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ── RESTORED ANALYTICS ENGINE (COMPLEX CALCULATIONS) ─────────
async function computeAnalytics(weekKey) {
  const feedbacks = await Feedback.find({ week_key: weekKey }).lean();
  if (!feedbacks.length) return null;

  // Initialize accumulators
  const heatSum = {};
  const heatCount = {};
  const heatVegSum = {};
  const heatVegCount = {};
  const heatNvSum = {};
  const heatNvCount = {};

  DAYS.forEach((d) => {
    heatSum[d] = { b: 0, l: 0, s: 0, d: 0 };
    heatCount[d] = { b: 0, l: 0, s: 0, d: 0 };
    heatVegSum[d] = { b: 0, l: 0, s: 0, d: 0 };
    heatVegCount[d] = { b: 0, l: 0, s: 0, d: 0 };
    heatNvSum[d] = { b: 0, l: 0, s: 0, d: 0 };
    heatNvCount[d] = { b: 0, l: 0, s: 0, d: 0 };
  });

  const mealSum = { breakfast: 0, lunch: 0, snacks: 0, dinner: 0 };
  const mealCount = { breakfast: 0, lunch: 0, snacks: 0, dinner: 0 };
  const ratingDist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  feedbacks.forEach((fb) => {
    (fb.meal_ratings || []).forEach((r) => {
      const day = r.day;
      const meal = r.meal;
      const v = Number(r.rating || 0);
      const ft = r.food_type || "veg";
      if (v > 0 && heatSum[day] && MEAL_KEYS[meal]) {
        const k = MEAL_KEYS[meal];
        heatSum[day][k] += v;
        heatCount[day][k] += 1;
        mealSum[meal] += v;
        mealCount[meal] += 1;
        ratingDist[v] = (ratingDist[v] || 0) + 1;

        if (ft === "veg") {
          heatVegSum[day][k] += v;
          heatVegCount[day][k] += 1;
        } else {
          heatNvSum[day][k] += v;
          heatNvCount[day][k] += 1;
        }
      }
    });
  });

  // Calculate averages
  const heatmap = {};
  const heatVeg = {};
  const heatNv = {};
  DAYS.forEach((d) => {
    heatmap[d] = {};
    heatVeg[d] = {};
    heatNv[d] = {};
    MEALS.forEach((m) => {
      const k = MEAL_KEYS[m];
      heatmap[d][k] =
        heatCount[d][k] > 0
          ? Math.round((heatSum[d][k] / heatCount[d][k]) * 10) / 10
          : 0;
      heatVeg[d][k] =
        heatVegCount[d][k] > 0
          ? Math.round((heatVegSum[d][k] / heatVegCount[d][k]) * 10) / 10
          : 0;
      heatNv[d][k] =
        heatNvCount[d][k] > 0
          ? Math.round((heatNvSum[d][k] / heatNvCount[d][k]) * 10) / 10
          : 0;
    });
  });

  const mealAvg = {};
  const mealVegAvg = {};
  const mealNvAvg = {};
  MEALS.forEach((m) => {
    mealAvg[m] =
      mealCount[m] > 0 ? Math.round((mealSum[m] / mealCount[m]) * 10) / 10 : 0;
    let vS = 0,
      vC = 0,
      nS = 0,
      nC = 0;
    DAYS.forEach((d) => {
      vS += heatVegSum[d][MEAL_KEYS[m]];
      vC += heatVegCount[d][MEAL_KEYS[m]];
      nS += heatNvSum[d][MEAL_KEYS[m]];
      nC += heatNvCount[d][MEAL_KEYS[m]];
    });
    mealVegAvg[m] = vC > 0 ? Math.round((vS / vC) * 10) / 10 : 0;
    mealNvAvg[m] = nC > 0 ? Math.round((nS / nC) * 10) / 10 : 0;
  });

  const sorted = [...MEALS].sort((a, b) => mealAvg[b] - mealAvg[a]);

  return {
    weekKey,
    weekLabel: feedbacks[0].week_label,
    weekRange: feedbacks[0].week_range,
    total: feedbacks.length,
    overallAvg:
      Math.round((MEALS.reduce((a, m) => a + mealAvg[m], 0) / 4) * 10) / 10,
    mealAvg,
    mealVegAvg,
    mealNvAvg,
    bestMeal: sorted[0],
    worstMeal: sorted[3],
    heatmap,
    heatVeg,
    heatNv,
    ratingDist,
    comments: feedbacks
      .filter((f) => f.liked || f.issues)
      .map((f) => ({
        liked: f.liked,
        issue: f.issues,
        name: f.user_name,
        date: f.submitted_at,
      })),
  };
}

// ── MIDDLEWARE ───────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "messify-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 },
  }),
);
app.use(passport.initialize());
app.use(passport.session());

// ── AUTHENTICATION ───────────────────────────────────────────
passport.serializeUser((u, done) => done(null, u.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findOne({ id });
    done(null, user);
  } catch (e) {
    done(e, null);
  }
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (at, rt, profile, done) => {
      try {
        const email = profile.emails[0].value;
        if (!isNistEmail(email)) return done(null, false);
        const role = isAdminEmail(email) ? "admin" : "student";
        let user = await User.findOne({ email });
        if (!user) {
          user = await User.create({
            id: genId(),
            name: profile.displayName,
            email,
            google_id: profile.id,
            picture: profile.photos[0].value,
            role,
          });
        } else {
          await User.updateOne({ email }, { role, google_id: profile.id });
          user.role = role;
        }
        return done(null, user);
      } catch (e) {
        return done(e, null);
      }
    },
  ),
);

// ── AUTH ROUTES ──────────────────────────────────────────────
app.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account",
  }),
);
app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/auth/google/failed" }),
  (req, res) => {
    const u = req.user;
    res.send(`<html><body><script>
    localStorage.setItem('messify_user', JSON.stringify({ name: "${u.name}", email: "${u.email}", role: "${u.role}" }));
    window.location.href = "${u.role === "admin" ? "/admin.html" : "/feedback.html"}";
  </script></body></html>`);
  },
);

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.json({ success: false, message: "All fields are required." });
    if (!isNistEmail(email))
      return res.json({ success: false, message: `Only ${ALLOWED_DOMAIN} emails are allowed.` });
    if (password.length < 8)
      return res.json({ success: false, message: "Password must be at least 8 characters." });

    const normalizedEmail = email.trim().toLowerCase();
    const role = isAdminEmail(normalizedEmail) ? "admin" : "student";
    const existing = await User.findOne({ email: normalizedEmail });

    if (existing) {
      if (existing.password_hash) {
        // Already has a password — tell them to just log in
        return res.json({ success: false, message: "This email is already registered. Please sign in." });
      } else {
        // Registered via Google but no password yet — add password to their account
        const hash = await bcrypt.hash(password, 12);
        await User.updateOne({ email: normalizedEmail }, { $set: { password_hash: hash, name: existing.name || name } });
        return res.json({ success: true, user: { name: existing.name || name, email: normalizedEmail, role } });
      }
    }

    // Brand new user — create account
    const hash = await bcrypt.hash(password, 12);
    await User.create({ id: genId(), name: name.trim(), email: normalizedEmail, password_hash: hash, role });
    return res.json({ success: true, user: { name: name.trim(), email: normalizedEmail, role } });
  } catch (e) {
    console.error("Register error:", e);
    return res.json({ success: false, message: "Registration failed. Please try again." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.json({ success: false, message: "Please fill in all fields." });

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user)
      return res.json({ success: false, message: "No account found with this email. Please register first." });

    if (!user.password_hash)
      return res.json({ success: false, message: "This account uses Google Sign-In. Please click 'Continue with Google'." });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match)
      return res.json({ success: false, message: "Incorrect password. Please try again or use 'Forgot Password'." });

    req.login(user, () =>
      res.json({ success: true, user: { name: user.name, email: user.email, role: user.role } })
    );
  } catch (e) {
    console.error("Login error:", e);
    return res.json({ success: false, message: "Login failed. Please try again." });
  }
});

// ── FORGOT PASSWORD — send OTP to college email ─────────────
app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.json({ success: false, message: "Email is required." });
    if (!isNistEmail(email)) return res.json({ success: false, message: `Only ${ALLOWED_DOMAIN} emails are allowed.` });

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });

    // Always respond success (don't reveal if email exists — security)
    if (!user) return res.json({ success: true, message: "If this email is registered, an OTP has been sent." });
    if (!user.password_hash) return res.json({ success: false, message: "This account uses Google Sign-In. Password reset is not needed." });

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[normalizedEmail] = { otp, expiresAt: Date.now() + 10 * 60 * 1000 };

    // Send email
    try {
      await sendOTPEmail(normalizedEmail, otp);
    } catch (mailErr) {
      console.error("Mail error:", mailErr.message);
      return res.json({ success: false, message: "Could not send OTP email. Check SMTP settings in .env file." });
    }

    return res.json({ success: true, message: "OTP sent to your college email. Valid for 10 minutes." });
  } catch (e) {
    console.error("Forgot password error:", e);
    return res.json({ success: false, message: "Something went wrong. Please try again." });
  }
});

// ── VERIFY OTP ───────────────────────────────────────────────
app.post("/api/auth/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    const normalizedEmail = (email || "").trim().toLowerCase();
    const record = otpStore[normalizedEmail];

    if (!record) return res.json({ success: false, message: "No OTP found. Please request a new one." });
    if (Date.now() > record.expiresAt) {
      delete otpStore[normalizedEmail];
      return res.json({ success: false, message: "OTP has expired. Please request a new one." });
    }
    if (record.otp !== otp.trim()) return res.json({ success: false, message: "Incorrect OTP. Please try again." });

    // OTP valid — mark as verified (extend to allow password reset for 5 more mins)
    otpStore[normalizedEmail].verified = true;
    otpStore[normalizedEmail].expiresAt = Date.now() + 5 * 60 * 1000;

    return res.json({ success: true, message: "OTP verified. You can now set a new password." });
  } catch (e) {
    return res.json({ success: false, message: "Verification failed. Please try again." });
  }
});

// ── RESET PASSWORD ───────────────────────────────────────────
app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    const normalizedEmail = (email || "").trim().toLowerCase();
    const record = otpStore[normalizedEmail];

    if (!record || !record.verified) return res.json({ success: false, message: "OTP not verified. Please verify OTP first." });
    if (Date.now() > record.expiresAt) {
      delete otpStore[normalizedEmail];
      return res.json({ success: false, message: "Session expired. Please start over." });
    }
    if (record.otp !== otp.trim()) return res.json({ success: false, message: "Invalid OTP." });
    if (!newPassword || newPassword.length < 8) return res.json({ success: false, message: "Password must be at least 8 characters." });

    const hash = await bcrypt.hash(newPassword, 12);
    await User.updateOne({ email: normalizedEmail }, { $set: { password_hash: hash } });

    delete otpStore[normalizedEmail]; // Clean up
    return res.json({ success: true, message: "Password reset successfully. You can now sign in." });
  } catch (e) {
    console.error("Reset password error:", e);
    return res.json({ success: false, message: "Reset failed. Please try again." });
  }
});

app.post("/api/auth/logout", (req, res) => {
  req.logout(() => {
    req.session.destroy(() => res.json({ success: true }));
  });
});

// ── FEEDBACK & HISTORY ───────────────────────────────────────
app.get("/api/week/current", (req, res) =>
  res.json({ success: true, ...getCurrentWeekInfo() }),
);

app.post("/api/feedback/submit", async (req, res) => {
  try {
    const { email, name, ratings, foodTypes, liked, issues } = req.body;
    const wi = getCurrentWeekInfo();

    // Fetch the user's feedback for the current week
    let fb = await Feedback.findOne({
      user_email: email.toLowerCase(),
      week_key: wi.key,
    });

    if (!fb) {
      // First submission of the week: Create a new document
      const meal_ratings = [];
      DAYS.forEach((day) => {
        MEALS.forEach((meal) => {
          const val = ratings[`${day}_${meal}`];
          if (val)
            meal_ratings.push({
              day,
              meal,
              rating: Number(val),
              food_type: foodTypes[`${day}_${meal}`] || "veg",
            });
        });
      });

      await Feedback.create({
        id: genId(),
        user_email: email.toLowerCase(),
        user_name: name,
        week_key: wi.key,
        week_label: wi.label,
        week_range: wi.range,
        meal_ratings,
        liked,
        issues,
      });
    } else {
      // Continuous Update: Merge securely
      DAYS.forEach((day) => {
        MEALS.forEach((meal) => {
          const val = ratings[`${day}_${meal}`];
          if (val) {
            // Check if this specific meal slot was already rated
            const existing = fb.meal_ratings.find(
              (r) => r.day === day && r.meal === meal,
            );

            // IF it doesn't exist, it's new -> Add it.
            // IF it DOES exist, we ignore it completely -> Permanent DB Lock.
            if (!existing) {
              fb.meal_ratings.push({
                day,
                meal,
                rating: Number(val),
                food_type: foodTypes[`${day}_${meal}`] || "veg",
              });
            }
          }
        });
      });

      // Update written feedback and timestamp
      if (liked) fb.liked = liked;
      if (issues) fb.issues = issues;
      fb.submitted_at = new Date();
      await fb.save();
    }

    res.json({ success: true });
  } catch (e) {
    res.json({
      success: false,
      message: "Error saving feedback: " + e.message,
    });
  }
});

app.get("/api/feedback/history", async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) return res.status(400).json({ success: false });
    const fbs = await Feedback.find({ user_email: email.toLowerCase() })
      .sort({ submitted_at: -1 })
      .lean();

    const history = fbs.map((fb) => {
      const h = {};
      DAYS.forEach((d) => {
        h[d] = {};
        MEALS.forEach((m) => {
          const r = fb.meal_ratings.find((x) => x.day === d && x.meal === m);
          h[d][MEAL_KEYS[m]] = r ? r.rating : 0;
        });
      });

      // Compute per-meal averages and overall avg from this user's ratings
      const mealAvg = {};
      MEALS.forEach((m) => {
        const vals = (fb.meal_ratings || [])
          .filter((r) => r.meal === m && r.rating > 0)
          .map((r) => r.rating);
        mealAvg[m] =
          vals.length > 0
            ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) /
              10
            : null;
      });
      const allVals = (fb.meal_ratings || [])
        .filter((r) => r.rating > 0)
        .map((r) => r.rating);
      const overallAvg =
        allVals.length > 0
          ? Math.round(
              (allVals.reduce((a, b) => a + b, 0) / allVals.length) * 10,
            ) / 10
          : null;
      const total_rated = allVals.length;

      return {
        week_key: fb.week_key,
        week_label: fb.week_label,
        week_range: fb.week_range,
        heatmap: h,
        mealAvg,
        overallAvg,
        total_rated,
        liked: fb.liked,
        issues: fb.issues,
        submitted_at: fb.submitted_at,
      };
    });
    res.json({ success: true, data: history });
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

// ── FEEDBACK STATUS CHECK ────────────────────────────────────
app.get("/api/feedback/status", async (req, res) => {
  try {
    const email = req.query.email;
    if (!email)
      return res.status(400).json({ success: false, submitted: false });
    const wi = getCurrentWeekInfo();
    const fb = await Feedback.findOne({
      user_email: email.toLowerCase(),
      week_key: wi.key,
    }).lean();
    if (!fb) return res.json({ success: true, submitted: false });
    res.json({
      success: true,
      submitted: true,
      savedData: {
        ratings: fb.meal_ratings || [],
        liked: fb.liked || "",
        issues: fb.issues || "",
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, submitted: false });
  }
});

// ── ADMIN & ANALYTICS ROUTES ─────────────────────────────────
const requireAdmin = async (req, res, next) => {
  // Check session-based auth first
  if (req.user && req.user.role === "admin") return next();
  // Fallback: check x-user-email header OR URL query param (used by PDF export)
  const headerEmail = req.headers["x-user-email"] || req.query.email;
  if (headerEmail && isAdminEmail(headerEmail)) {
    const u = await User.findOne({ email: headerEmail.toLowerCase() }).lean();
    if (u && u.role === "admin") return next();
  }
  return res.status(403).json({ success: false });
};

app.get("/api/analytics/current", async (req, res) => {
  const { key } = getCurrentWeekInfo();
  const data = await computeAnalytics(key);
  res.json({ success: true, data });
});

// ── ALL-WEEKS ANALYTICS (admin trend chart + reports trend) ──
app.get("/api/analytics/all-weeks", async (req, res) => {
  try {
    const distinctWeeks = await Feedback.distinct("week_key");
    distinctWeeks.sort();
    const results = [];
    for (const wk of distinctWeeks) {
      const an = await computeAnalytics(wk);
      if (an) results.push(an);
    }
    res.json({ success: true, data: results });
  } catch (e) {
    res.status(500).json({ success: false, data: [] });
  }
});

app.get("/api/admin/complaints", requireAdmin, async (req, res) => {
  const data = await Feedback.find({ issues: { $ne: "" } })
    .sort({ submitted_at: -1 })
    .lean();
  res.json({
    success: true,
    data: data.map((d) => ({
      name: d.user_name,
      email: d.user_email,
      week: d.week_label,
      text: d.issues,
      submittedAt: d.submitted_at,
    })),
  });
});

app.get("/api/admin/submissions", requireAdmin, async (req, res) => {
  const { key } = getCurrentWeekInfo();
  const data = await Feedback.find({ week_key: key })
    .select("user_name user_email submitted_at")
    .sort({ submitted_at: -1 })
    .lean();
  res.json({ success: true, data });
});

// ── PDF EXPORT ROUTE (LARGE TEMPLATE) ───────────────
app.get("/api/admin/export-pdf", requireAdmin, async (req, res) => {
  try {
    const wi = getCurrentWeekInfo();
    const an = await computeAnalytics(req.query.week || wi.key);
    if (!an) return res.status(404).send("No data found for this week.");

    const LOGO_URI =
      "data:image/jpeg;base64,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";

    // Rating distribution rows
    let distRows = "";
    [5, 4, 3, 2, 1].forEach((v) => {
      const count = an.ratingDist[v] || 0;
      const pct =
        an.total > 0
          ? Math.min(100, (count / (an.total * 28)) * 100).toFixed(1)
          : 0;
      const starColor = v >= 4 ? "#22c55e" : v === 3 ? "#eab308" : "#ef4444";
      distRows += `<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
        <span style="width:50px;font-size:12px;color:#f97316;font-weight:700;">★ ${v}</span>
        <div style="flex:1;background:rgba(255,255,255,0.07);height:10px;border-radius:5px;overflow:hidden;">
          <div style="width:${pct}%;background:${starColor};height:100%;border-radius:5px;"></div>
        </div>
        <span style="width:50px;text-align:right;font-size:12px;color:#8b9ab8;">${count}</span>
      </div>`;
    });

    // Heatmap colour helper
    function heatClr(v) {
      if (v >= 4.5) return "rgba(34,197,94,0.55)";
      if (v >= 3.8) return "rgba(34,197,94,0.30)";
      if (v >= 3.0) return "rgba(234,179,8,0.38)";
      if (v >= 2.5) return "rgba(249,115,22,0.42)";
      return v > 0 ? "rgba(239,68,68,0.45)" : "rgba(255,255,255,0.05)";
    }

    const mealNames = {
      breakfast: "Breakfast",
      lunch: "Lunch",
      snacks: "Snacks",
      dinner: "Dinner",
    };

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>${UNIVERSITY_NAME} — Mess Feedback Report</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Syne:wght@700;800&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'DM Sans', 'Helvetica Neue', Helvetica, sans-serif;
      background: #0b0f1a;
      color: #f0f4ff;
      min-height: 100vh;
      padding: 0;
    }

    /* ── PRINT HEADER ── */
    @media print {
      @page { margin: 16mm 14mm 16mm 14mm; size: A4; }
      .no-print { display: none !important; }
      .watermark-wrap { display: none !important; }

      /* White background for print */
      body {
        background: #ffffff !important;
        color: #000000 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .page { padding: 0 !important; max-width: 100% !important; }
      .page-break { page-break-before: always; }

      /* Header */
      .doc-header {
        border-bottom: 2px solid #000 !important;
        padding-bottom: 14px !important;
        margin-bottom: 20px !important;
      }
      .doc-uni { color: #000 !important; }
      .doc-title { color: #000 !important; background: none !important; -webkit-text-fill-color: #000 !important; }
      .doc-sub { color: #444 !important; }
      .doc-badge { background: #eee !important; color: #000 !important; border: 1px solid #999 !important; }

      /* KPI cards */
      .kpi-row { gap: 10px !important; margin-bottom: 18px !important; }
      .kpi {
        background: #f5f5f5 !important;
        border: 1.5px solid #555 !important;
        border-radius: 8px !important;
        padding: 12px !important;
      }
      .kpi-val { color: #000 !important; font-size: 20px !important; }
      .kpi-lbl { color: #444 !important; }

      /* Section titles */
      .sec-title {
        color: #000 !important;
        border-bottom: 1.5px solid #000 !important;
        padding-bottom: 6px !important;
        margin-bottom: 10px !important;
      }

      /* Rating distribution */
      .dist-wrap {
        background: #f5f5f5 !important;
        border: 1.5px solid #555 !important;
        border-radius: 8px !important;
        padding: 14px 18px !important;
        margin-bottom: 18px !important;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .dist-wrap span { color: #000 !important; }
      /* Make bar backgrounds visible in B&W */
      .dist-wrap div[style*="background:rgba(255,255,255,0.07)"] {
        background: #ddd !important;
      }

      /* Meal performance */
      .meal-table-wrap {
        background: #f5f5f5 !important;
        border: 1.5px solid #555 !important;
        border-radius: 8px !important;
        padding: 14px 18px !important;
        margin-bottom: 18px !important;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .meal-name { color: #000 !important; }
      .meal-score { color: #000 !important; }
      .meal-bar-bg { background: #ccc !important; border: 1px solid #999 !important; }
      .meal-bar { background: #555 !important; }
      .meal-row { border-bottom: 1px solid #ccc !important; }
      .meal-row div[style*="color:#6b7a99"] { color: #555 !important; }
      .meal-row div[style*="color:#8b9ab8"] { color: #444 !important; }

      /* Heatmap */
      .heat-wrap {
        background: #f5f5f5 !important;
        border: 1.5px solid #555 !important;
        border-radius: 8px !important;
        padding: 14px 18px !important;
        margin-bottom: 18px !important;
        page-break-before: always;
        break-before: page;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .heat-table th { color: #000 !important; }
      .heat-table td {
        color: #000 !important;
        border: 1px solid #bbb !important;
        border-radius: 4px !important;
      }
      /* Override all coloured heatmap backgrounds with readable grey shades */
      .heat-table td[style*="background"] {
        background: #e0e0e0 !important;
        font-weight: 700 !important;
      }
      .heat-table td:first-child {
        background: transparent !important;
        color: #333 !important;
        border: none !important;
      }

      /* Comments */
      .comments-wrap {
        background: #f5f5f5 !important;
        border: 1.5px solid #555 !important;
        border-radius: 8px !important;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .cmt-text { color: #222 !important; }
      .cmt-tag { border: 1px solid #999 !important; background: #e0e0e0 !important; color: #000 !important; }
      .cmt-avatar { background: #ddd !important; border: 1px solid #999 !important; color: #000 !important; }
      .comment-row { border-bottom: 1px solid #ccc !important; }

      /* Footer */
      .doc-footer { color: #444 !important; border-top: 1px solid #999 !important; }
    }
    @media screen {
      .page-logo-corner { display: none; }
    }

    /* ── CINEMATIC WATERMARK LOGO ── */
    .watermark-wrap {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      z-index: 0;
    }
    .watermark-logo {
      width: 420px;
      max-width: 60vw;
      opacity: 0.045;
      filter: blur(2.5px) saturate(0);
      mask-image: linear-gradient(to top, transparent 0%, rgba(0,0,0,0.6) 35%, rgba(0,0,0,0.9) 70%, rgba(0,0,0,0.5) 100%);
      -webkit-mask-image: linear-gradient(to top, transparent 0%, rgba(0,0,0,0.6) 35%, rgba(0,0,0,0.9) 70%, rgba(0,0,0,0.5) 100%);
      user-select: none;
    }

    /* ── PAGE SHELL ── */
    .page {
      position: relative;
      z-index: 1;
      max-width: 1200px;
      width: 100%;
      margin: 0 auto;
      padding: 48px 60px 64px;
    }

    /* ── TOP HEADER ── */
    .doc-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 24px;
      border-bottom: 2px solid rgba(249,115,22,0.35);
      margin-bottom: 36px;
      gap: 20px;
    }
    .doc-header-logo {
      width: 70px;
      flex-shrink: 0;
      border-radius: 8px;
      filter: drop-shadow(0 0 12px rgba(249,115,22,0.25));
    }
    .doc-header-text { flex: 1; }
    .doc-uni {
      font-family: 'Syne', 'Helvetica Neue', sans-serif;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: #f97316;
      margin-bottom: 4px;
    }
    .doc-title {
      font-family: 'Syne', 'Helvetica Neue', sans-serif;
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #f0f4ff;
      margin-bottom: 4px;
    }
    .doc-sub { font-size: 13px; color: #6b7a99; }
    .doc-badge {
      background: rgba(249,115,22,0.12);
      border: 1px solid rgba(249,115,22,0.3);
      color: #f97316;
      font-size: 11px;
      font-weight: 700;
      padding: 6px 16px;
      border-radius: 100px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      white-space: nowrap;
    }

    /* ── KPI STRIP ── */
    .kpi-row {
      display: grid;
      grid-template-columns: repeat(4,1fr);
      gap: 14px;
      margin-bottom: 32px;
    }
    .kpi {
      background: #111827;
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 16px;
      padding: 18px 16px;
      text-align: center;
    }
    .kpi-icon { font-size: 20px; margin-bottom: 8px; }
    .kpi-val {
      font-family: 'Syne', sans-serif;
      font-size: 24px;
      font-weight: 800;
      color: #f97316;
      margin-bottom: 4px;
    }
    .kpi-lbl { font-size: 10px; color: #6b7a99; text-transform: uppercase; letter-spacing: 0.08em; }

    /* ── SECTION HEADINGS ── */
    .sec-title {
      font-family: 'Syne', sans-serif;
      font-size: 14px;
      font-weight: 700;
      color: #f0f4ff;
      margin-bottom: 14px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255,255,255,0.07);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* ── DIST SECTION ── */
    .dist-wrap {
      background: #111827;
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 16px;
      padding: 20px 22px;
      margin-bottom: 28px;
    }

    /* ── HEATMAP TABLE ── */
    .heat-wrap {
      background: #111827;
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 16px;
      padding: 20px 22px;
      margin-bottom: 28px;
      overflow-x: auto;
    }
    .heat-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 5px;
    }
    .heat-table th {
      font-size: 10px;
      font-weight: 600;
      color: #6b7a99;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 4px 10px;
      text-align: center;
    }
    .heat-table th:first-child { text-align: left; width: 58px; }
    .heat-table td {
      height: 42px;
      border-radius: 10px;
      text-align: center;
      font-family: 'Syne', sans-serif;
      font-size: 13px;
      font-weight: 700;
      color: #f0f4ff;
    }
    .heat-table td:first-child {
      background: transparent !important;
      font-size: 12px;
      font-weight: 600;
      color: #8b9ab8;
      text-align: left;
      padding: 0 10px;
    }

    /* ── MEAL SCORE TABLE ── */
    .meal-table-wrap {
      background: #111827;
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 16px;
      padding: 20px 22px;
      margin-bottom: 28px;
    }
    .meal-row {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 10px 0;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .meal-row:last-child { border-bottom: none; }
    .meal-name { font-size: 13px; font-weight: 600; width: 90px; color: #f0f4ff; }
    .meal-bar-bg { flex: 1; background: rgba(255,255,255,0.06); height: 8px; border-radius: 4px; overflow: hidden; }
    .meal-bar { height: 8px; border-radius: 4px; }
    .meal-score { font-family: 'Syne',sans-serif; font-size: 16px; font-weight: 800; color: #f97316; width: 36px; text-align: right; }
    .meal-sub { font-size: 10px; color: #6b7a99; width: 90px; }

    /* ── COMMENTS ── */
    .comments-wrap {
      background: #111827;
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 16px;
      overflow: hidden;
      margin-bottom: 28px;
    }
    .comment-row {
      display: flex;
      gap: 12px;
      padding: 14px 22px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      align-items: flex-start;
    }
    .comment-row:last-child { border-bottom: none; }
    .cmt-avatar {
      width: 28px; height: 28px; border-radius: 50%;
      background: rgba(249,115,22,0.12);
      border: 1px solid rgba(249,115,22,0.2);
      display: flex; align-items: center; justify-content: center;
      font-size: 10px; font-weight: 700; color: #f97316; flex-shrink: 0;
    }
    .cmt-text { font-size: 12px; color: #8b9ab8; line-height: 1.6; }
    .cmt-tag {
      display: inline-block; font-size: 9px; font-weight: 700;
      padding: 2px 8px; border-radius: 100px; margin-bottom: 4px;
    }
    .cmt-pos { background: rgba(34,197,94,0.1); color: #4ade80; }
    .cmt-neg { background: rgba(239,68,68,0.1); color: #f87171; }

    /* ── FOOTER ── */
    .doc-footer {
      text-align: center;
      font-size: 11px;
      color: #374151;
      margin-top: 48px;
      padding-top: 20px;
      border-top: 1px solid rgba(255,255,255,0.05);
    }

    /* ── PRINT BUTTON ── */
    .print-btn {
      position: fixed;
      bottom: 32px;
      right: 32px;
      background: #f97316;
      color: #fff;
      border: none;
      border-radius: 14px;
      padding: 14px 28px;
      font-family: 'Syne', sans-serif;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 8px 32px rgba(249,115,22,0.45);
      transition: all 0.2s;
      z-index: 999;
    }
    .print-btn:hover { background: #fb923c; transform: translateY(-2px); }
  </style>
</head>
<body>

  <div class="watermark-wrap" aria-hidden="true">
    <img class="watermark-logo" src="${LOGO_URI}" alt="">
  </div>



  <div class="page">

    <div class="doc-header">
      <img class="doc-header-logo" src="${LOGO_URI}" alt="NIST Logo">
      <div class="doc-header-text">
        <div class="doc-uni">${UNIVERSITY_NAME}</div>
        <div class="doc-title">Mess Feedback Report</div>
        <div class="doc-sub">${an.weekLabel} &nbsp;·&nbsp; ${an.weekRange}</div>
      </div>
      <div class="doc-badge">Official Report</div>
    </div>

    <div class="kpi-row">
      <div class="kpi"><div class="kpi-icon">📝</div><div class="kpi-val">${an.total}</div><div class="kpi-lbl">Submissions</div></div>
      <div class="kpi"><div class="kpi-icon">⭐</div><div class="kpi-val">${an.overallAvg}<span style="font-size:13px;color:#6b7a99;font-weight:400"> /5</span></div><div class="kpi-lbl">Overall Avg</div></div>
      <div class="kpi"><div class="kpi-icon">🏆</div><div class="kpi-val" style="font-size:15px;padding-top:4px">${mealNames[an.bestMeal] || "--"}</div><div class="kpi-lbl">Best Meal</div></div>
      <div class="kpi"><div class="kpi-icon">⚠️</div><div class="kpi-val" style="font-size:15px;padding-top:4px">${mealNames[an.worstMeal] || "--"}</div><div class="kpi-lbl">Needs Attention</div></div>
    </div>

    <div class="dist-wrap">
      <div class="sec-title">📊 Rating Distribution</div>
      ${distRows}
    </div>

    <div class="meal-table-wrap">
      <div class="sec-title">🍽️ Meal Performance</div>
      ${["breakfast", "lunch", "snacks", "dinner"]
        .sort((a, b) => an.mealAvg[b] - an.mealAvg[a])
        .map((m) => {
          const sc = an.mealAvg[m] || 0;
          const barClr = sc >= 4 ? "#22c55e" : sc >= 3 ? "#eab308" : "#ef4444";
          const tag =
            sc >= 4
              ? "Performing well"
              : sc >= 3
                ? "Needs improvement"
                : "Critical";
          const vs = an.mealVegAvg[m] > 0 ? `🌿 ${an.mealVegAvg[m]}` : "";
          const nvs = an.mealNvAvg[m] > 0 ? `🍗 ${an.mealNvAvg[m]}` : "";
          return `<div class="meal-row">
          <div class="meal-name">${mealNames[m]}</div>
          <div><div style="font-size:9px;color:#6b7a99;margin-bottom:3px">${tag}</div>
          <div style="font-size:10px;color:#8b9ab8;">${vs}${vs && nvs ? " &nbsp; " : ""}${nvs}</div></div>
          <div class="meal-bar-bg"><div class="meal-bar" style="width:${(sc / 5) * 100}%;background:${barClr}"></div></div>
          <div class="meal-score">${sc}</div>
        </div>`;
        })
        .join("")}
    </div>

    <div class="heat-wrap">
      <div class="sec-title">🗓️ Weekly Heatmap</div>
      <table class="heat-table">
        <thead><tr>
          <th></th>
          <th>🌅 Breakfast</th>
          <th>🍱 Lunch</th>
          <th>🫖 Snacks</th>
          <th>🌙 Dinner</th>
        </tr></thead>
        <tbody>
          ${DAYS.map(
            (d) => `<tr>
            <td>${d}</td>
            <td style="background:${heatClr(an.heatmap[d].b)}">${an.heatmap[d].b || "—"}</td>
            <td style="background:${heatClr(an.heatmap[d].l)}">${an.heatmap[d].l || "—"}</td>
            <td style="background:${heatClr(an.heatmap[d].s)}">${an.heatmap[d].s || "—"}</td>
            <td style="background:${heatClr(an.heatmap[d].d)}">${an.heatmap[d].d || "—"}</td>
          </tr>`,
          ).join("")}
        </tbody>
      </table>
    </div>

    ${
      an.comments && an.comments.length > 0
        ? `
    <div class="comments-wrap">
      <div style="padding:16px 22px;border-bottom:1px solid rgba(255,255,255,0.07);">
        <div class="sec-title" style="margin-bottom:0;border:none;padding:0;">💬 Student Comments</div>
      </div>
      ${an.comments
        .slice(0, 10)
        .map(
          (c, i) => `
        ${c.liked ? `<div class="comment-row"><div class="cmt-avatar">${String.fromCharCode(65 + i)}</div><div><div class="cmt-tag cmt-pos">Positive</div><div class="cmt-text">${(c.liked || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div></div></div>` : ""}
        ${c.issue ? `<div class="comment-row"><div class="cmt-avatar">${String.fromCharCode(65 + i)}</div><div><div class="cmt-tag cmt-neg">Issue</div><div class="cmt-text">${(c.issue || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div></div></div>` : ""}
      `,
        )
        .join("")}
    </div>`
        : ""
    }

    <div class="doc-footer">
      Generated by Messify &nbsp;·&nbsp; ${UNIVERSITY_NAME} &nbsp;·&nbsp; Academic Year ${wi.acadYear} &nbsp;·&nbsp; ${an.weekLabel}
    </div>

  </div>

  <button class="print-btn no-print" onclick="window.print()">🖨️ Print / Save PDF</button>

</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (e) {
    res.status(500).send("PDF generation error: " + e.message);
  }
});

// ── SERVER START ─────────────────────────────────────────────
initDB().then(() => {
  app.listen(PORT, () =>
    console.log(`🚀 ${UNIVERSITY_NAME} Messify Online at Port ${PORT}`),
  );
});
