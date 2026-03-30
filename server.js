// ═══════════════════════════════════════════════════════════
//  Messify Backend — server.js  (MongoDB version)
//  Auth + MongoDB feedback storage + Analytics + PDF
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

const app = express();
const PORT = process.env.PORT || 3000;

function isNistEmail(e) {
  return e.trim().toLowerCase().endsWith("@nist.edu");
}
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
function isAdminEmail(e) {
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((x) => x.trim().toLowerCase());
  return list.includes(e.toLowerCase());
}
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
  const label = `Week ${wnum}, ${now.getFullYear()}`;
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
  const range = `${fmt(mon)} – ${fmt(sun)}`;
  const acadYear =
    now.getMonth() >= 7
      ? `${now.getFullYear()}–${String(now.getFullYear() + 1).slice(2)}`
      : `${now.getFullYear() - 1}–${String(now.getFullYear()).slice(2)}`;
  return {
    key,
    label,
    range,
    weekNum: wnum,
    year: now.getFullYear(),
    acadYear,
  };
}

const MEAL_KEYS = { breakfast: "b", lunch: "l", snacks: "s", dinner: "d" };
const MEALS = ["breakfast", "lunch", "snacks", "dinner"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

async function computeAnalytics(weekKey) {
  const feedbacks = await Feedback.find({ week_key: weekKey }).lean();
  if (!feedbacks.length) return null;

  const heatSum = {};
  const heatCount = {};

  // Track for veg and non-veg independently
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

  feedbacks.forEach((fb) => {
    (fb.meal_ratings || []).forEach((r) => {
      const day = r.day;
      const meal = r.meal;
      const v = Number(r.rating || 0);
      const ft = r.food_type || "veg";

      if (v > 0 && heatSum[day] && MEAL_KEYS[meal]) {
        const k = MEAL_KEYS[meal];

        // Overall
        heatSum[day][k] += v;
        heatCount[day][k] += 1;
        mealSum[meal] += v;
        mealCount[meal] += 1;

        // Split metrics
        if (ft === "veg") {
          heatVegSum[day][k] += v;
          heatVegCount[day][k] += 1;
        } else if (ft === "non-veg") {
          heatNvSum[day][k] += v;
          heatNvCount[day][k] += 1;
        }
      }
    });
  });

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

    let vSum = 0,
      vCount = 0,
      nvSum = 0,
      nvCount = 0;
    DAYS.forEach((d) => {
      const k = MEAL_KEYS[m];
      vSum += heatVegSum[d][k];
      vCount += heatVegCount[d][k];
      nvSum += heatNvSum[d][k];
      nvCount += heatNvCount[d][k];
    });
    mealVegAvg[m] = vCount > 0 ? Math.round((vSum / vCount) * 10) / 10 : 0;
    mealNvAvg[m] = nvCount > 0 ? Math.round((nvSum / nvCount) * 10) / 10 : 0;
  });

  const valid = MEALS.filter((m) => mealCount[m] > 0);
  const overallAvg =
    valid.length > 0
      ? Math.round(
          (valid.reduce((a, m) => a + mealAvg[m], 0) / valid.length) * 10,
        ) / 10
      : 0;
  const sorted = [...MEALS].sort((a, b) => mealAvg[b] - mealAvg[a]);

  const comments = feedbacks
    .filter((f) => f.liked || f.issues)
    .map((f) => ({
      liked: f.liked || "",
      issue: f.issues || "",
      date: f.submitted_at,
    }));

  return {
    weekKey,
    weekLabel: feedbacks[0].week_label,
    weekRange: feedbacks[0].week_range,
    total: feedbacks.length,
    overallAvg,
    mealAvg,
    mealVegAvg,
    mealNvAvg,
    bestMeal: sorted[0],
    worstMeal: sorted[sorted.length - 1],
    heatmap,
    heatVeg,
    heatNv,
    comments,
  };
}

// ── Middleware ─────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "messify-secret-2025",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 },
  }),
);
app.use(passport.initialize());
app.use(passport.session());

// ── Passport ───────────────────────────────────────────────
passport.serializeUser((u, done) => done(null, u.id));
passport.deserializeUser(async (id, done) => {
  try {
    done(null, (await User.findOne({ id })) || false);
  } catch (e) {
    done(e, false);
  }
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ||
        "http://localhost:3000/auth/google/callback",
    },
    async (at, rt, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email || !isNistEmail(email)) return done(null, false);
        const role = isAdminEmail(email) ? "admin" : "student";
        let user = await User.findOne({ email });
        if (!user) {
          user = await User.create({
            id: genId(),
            name: profile.displayName || email.split("@")[0],
            email,
            google_id: profile.id,
            picture: profile.photos?.[0]?.value || null,
            password_hash: null,
            role,
          });
          console.log("✅ Google user:", email, "|", role);
        } else {
          await User.updateOne(
            { id: user.id },
            { role, google_id: profile.id },
          );
          user.role = role;
        }
        return done(null, user);
      } catch (e) {
        return done(e, false);
      }
    },
  ),
);

// ── Google OAuth ───────────────────────────────────────────
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
    const safe = {
      name: u.name,
      email: u.email,
      picture: u.picture || null,
      role: u.role,
    };
    res.send(`<!DOCTYPE html><html><body><script>
      var user = ${JSON.stringify(safe)};
      localStorage.setItem('messify_user', JSON.stringify(user));
      if (user.role === 'admin') {
        window.location.href = '/admin.html';
      } else {
        window.location.href = '/feedback.html';
      }
    </script></body></html>`);
  },
);
app.get("/auth/google/failed", (req, res) => {
  res.send(`<!DOCTYPE html><html><body><script>
    alert('Login failed: Only @nist.edu emails allowed.');window.location.href='index.html';
  </script></body></html>`);
});

// ── Auth routes ────────────────────────────────────────────
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.json({ success: false, message: "All fields required." });
    if (!isNistEmail(email))
      return res.json({
        success: false,
        message: "Only @nist.edu emails allowed.",
      });
    if (password.length < 8)
      return res.json({ success: false, message: "Password min 8 chars." });
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing)
      return res.json({ success: false, message: "Email already registered." });
    const hash = await bcrypt.hash(password, 12);
    const role = isAdminEmail(email.toLowerCase()) ? "admin" : "student";
    const id = genId();
    await User.create({
      id,
      name: name.trim(),
      email: email.toLowerCase(),
      password_hash: hash,
      role,
    });
    return res.json({
      success: true,
      user: {
        name: name.trim(),
        email: email.toLowerCase(),
        picture: null,
        role,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.json({ success: false, message: "All fields required." });
    if (!isNistEmail(email))
      return res.json({
        success: false,
        message: "Only @nist.edu emails allowed.",
      });
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user)
      return res.json({
        success: false,
        message: "No account found. Register first.",
      });
    if (!user.password_hash)
      return res.json({
        success: false,
        message: "This account uses Google Sign-In.",
      });
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match)
      return res.json({ success: false, message: "Incorrect password." });
    const role = isAdminEmail(email) ? "admin" : "student";
    if (role !== user.role) await User.updateOne({ id: user.id }, { role });
    return res.json({
      success: true,
      user: {
        name: user.name,
        email: user.email,
        picture: user.picture || null,
        role,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

app.post("/api/auth/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.json({ success: true });
    });
  });
});

app.get("/api/auth/me", (req, res) => {
  if (req.user)
    return res.json({
      success: true,
      user: { name: req.user.name, email: req.user.email, role: req.user.role },
    });
  res.json({ success: false });
});

// ── Week info ──────────────────────────────────────────────
app.get("/api/week/current", (req, res) => {
  res.json({ success: true, ...getCurrentWeekInfo() });
});

// ── Feedback routes ────────────────────────────────────────
app.get("/api/feedback/status", async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) return res.json({ success: false });
    const { key } = getCurrentWeekInfo();
    const existing = await Feedback.findOne({
      user_email: email.toLowerCase(),
      week_key: key,
    });

    res.json({
      success: true,
      submitted: !!existing,
      weekKey: key,
      savedData: existing
        ? {
            ratings: existing.meal_ratings.map((r) => ({
              day: r.day,
              meal: r.meal,
              rating: r.rating,
              food_type: r.food_type,
            })),
            liked: existing.liked,
            issues: existing.issues,
          }
        : null,
    });
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

app.post("/api/feedback/submit", async (req, res) => {
  try {
    const { email, name, ratings, foodTypes, liked, issues } = req.body;
    if (!email || !ratings)
      return res.json({ success: false, message: "Missing data." });
    if (!isNistEmail(email))
      return res.json({
        success: false,
        message: "Only @nist.edu emails allowed.",
      });
    const wi = getCurrentWeekInfo();
    const existing = await Feedback.findOne({
      user_email: email.toLowerCase(),
      week_key: wi.key,
    });
    if (existing)
      return res.json({
        success: false,
        message: "You have already submitted feedback this week.",
      });
    const rated = Object.values(ratings).filter((v) => Number(v) > 0).length;
    if (rated < 1)
      return res.json({
        success: false,
        message: "Please rate at least one meal before submitting.",
      });

    const meal_ratings = [];
    DAYS.forEach((day) => {
      MEALS.forEach((meal) => {
        const key = `${day}_${meal}`;
        const v = Number(ratings[key] || 0);
        const ft =
          foodTypes && foodTypes[key] === "non-veg" ? "non-veg" : "veg";

        if (v >= 1 && v <= 5) {
          meal_ratings.push({ day, meal, rating: v, food_type: ft });
        }
      });
    });

    await Feedback.create({
      id: genId(),
      user_email: email.toLowerCase(),
      user_name: name || email.split("@")[0],
      week_key: wi.key,
      week_label: wi.label,
      week_range: wi.range,
      liked: (liked || "").trim(),
      issues: (issues || "").trim(),
      meal_ratings,
    });

    console.log(
      "✅ Feedback saved:",
      email,
      "| week:",
      wi.key,
      "| meals:",
      rated,
    );
    return res.json({
      success: true,
      message: "Feedback submitted successfully!",
    });
  } catch (e) {
    console.error("Submit error:", e);
    if (e.code === 11000)
      return res.json({
        success: false,
        message: "Already submitted this week.",
      });
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// ── Feedback History (per user) ────────────────────────────
app.get("/api/feedback/history", async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) return res.json({ success: false, message: "Email required." });

    const feedbacks = await Feedback.find({ user_email: email.toLowerCase() })
      .sort({ submitted_at: -1 })
      .lean();

    const history = feedbacks.map((fb) => {
      // Build per-meal averages
      const mealSum = { breakfast: 0, lunch: 0, snacks: 0, dinner: 0 };
      const mealCount = { breakfast: 0, lunch: 0, snacks: 0, dinner: 0 };
      (fb.meal_ratings || []).forEach((r) => {
        if (r.rating > 0 && mealSum[r.meal] !== undefined) {
          mealSum[r.meal] += r.rating;
          mealCount[r.meal] += 1;
        }
      });
      const mealAvg = {};
      MEALS.forEach((m) => {
        mealAvg[m] =
          mealCount[m] > 0
            ? Math.round((mealSum[m] / mealCount[m]) * 10) / 10
            : null;
      });
      const validMeals = MEALS.filter((m) => mealAvg[m] !== null);
      const overallAvg =
        validMeals.length > 0
          ? Math.round(
              (validMeals.reduce((a, m) => a + mealAvg[m], 0) /
                validMeals.length) *
                10
            ) / 10
          : null;

      // Build heatmap rows
      const heatmap = {};
      DAYS.forEach((d) => {
        heatmap[d] = {};
        MEALS.forEach((m) => {
          const r = (fb.meal_ratings || []).find(
            (x) => x.day === d && x.meal === m
          );
          heatmap[d][MEAL_KEYS[m]] = r ? r.rating : 0;
        });
      });

      return {
        week_key: fb.week_key,
        week_label: fb.week_label,
        week_range: fb.week_range,
        submitted_at: fb.submitted_at,
        overallAvg,
        mealAvg,
        heatmap,
        liked: fb.liked || "",
        issues: fb.issues || "",
        total_rated: (fb.meal_ratings || []).filter((r) => r.rating > 0).length,
      };
    });

    res.json({ success: true, count: history.length, data: history });
  } catch (e) {
    console.error("History error:", e);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// ── Analytics ──────────────────────────────────────────────
app.get("/api/analytics/current", async (req, res) => {
  try {
    const { key } = getCurrentWeekInfo();
    const data = await computeAnalytics(key);
    if (!data) return res.json({ success: true, empty: true });
    res.json({ success: true, empty: false, data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

app.get("/api/analytics/all-weeks", async (req, res) => {
  try {
    const rows = await Feedback.distinct("week_key");
    rows.sort();
    const allData = await Promise.all(rows.map((wk) => computeAnalytics(wk)));
    res.json({ success: true, data: allData.filter(Boolean) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, data: [] });
  }
});

// ── Admin middleware ───────────────────────────────────────
function requireAdmin(req, res, next) {
  // Accept email from header (API calls) OR query param (direct browser navigation like export-pdf)
  const email = req.headers["x-user-email"] || req.query.email || req.query.user || "";
  if (!isAdminEmail(email))
    return res.status(403).json({ success: false, message: "Admin only." });
  next();
}

app.get("/api/admin/submissions", requireAdmin, async (req, res) => {
  try {
    const { key } = getCurrentWeekInfo();
    const week = req.query.week || key;
    const data = await Feedback.find({ week_key: week })
      .sort({ submitted_at: -1 })
      .select("user_name user_email submitted_at liked issues")
      .lean();
    const formatted = data.map((d) => ({
      name: d.user_name,
      email: d.user_email,
      submitted_at: d.submitted_at,
      liked: d.liked,
      issues: d.issues,
    }));
    res.json({ success: true, count: formatted.length, data: formatted });
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

app.get("/api/admin/complaints", requireAdmin, async (req, res) => {
  try {
    const data = await Feedback.find({ issues: { $nin: ["", null] } })
      .sort({ submitted_at: -1 })
      .select("user_name user_email week_label issues submitted_at")
      .lean();

    const formatted = data.map((d) => ({
      name: d.user_name,
      email: d.user_email,
      week: d.week_label,
      text: d.issues,
      submittedAt: d.submitted_at,
    }));
    res.json({ success: true, count: formatted.length, data: formatted });
  } catch (e) {
    res.status(500).json({ success: false, count: 0, data: [] });
  }
});

// ── Export PDF ─────────────────────────────────────────────
app.get("/api/admin/export-pdf", requireAdmin, async (req, res) => {
  try {
    const { key, acadYear } = getCurrentWeekInfo();
    const week = req.query.week || key;
    const an = await computeAnalytics(week);
    const mealIcon = {
      breakfast: "🌅",
      lunch: "🍱",
      snacks: "🫖",
      dinner: "🌙",
    };
    const mealName = {
      breakfast: "Breakfast",
      lunch: "Lunch",
      snacks: "Snacks",
      dinner: "Dinner",
    };

    const NIST_LOGO = "data:image/png;base64,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";

    if (!an) {
      return res.send(`<!DOCTYPE html><html>
      <head><meta charset="UTF-8"/><title>No Data</title>
      <style>body{background:#0b0f1a;color:#f0f4ff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;gap:16px}h2{color:#f97316}button{background:#f97316;color:#fff;border:none;padding:10px 22px;border-radius:8px;cursor:pointer}</style></head>
      <body><h2>No submissions for ${week}</h2><p>No students have submitted feedback yet.</p><button onclick="window.close()">Close</button></body></html>`);
    }

    const allFeedbacks = await Feedback.find({ week_key: week }).lean();
    const dist = {
      breakfast: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      lunch: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      snacks: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      dinner: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    };
    allFeedbacks.forEach((fb) => {
      (fb.meal_ratings || []).forEach((r) => {
        if (dist[r.meal] && r.rating >= 1 && r.rating <= 5)
          dist[r.meal][r.rating]++;
      });
    });

    const heatRows = DAYS.map((d) => {
      const cells = MEALS.map((m) => {
        const v = an.heatmap[d][MEAL_KEYS[m]];
        const bg =
          v >= 4.5
            ? "#22c55e"
            : v >= 3.8
              ? "#4ade80"
              : v >= 3.0
                ? "#eab308"
                : v >= 2.5
                  ? "#f97316"
                  : "#ef4444";
        return `<td style="background:${bg};color:#fff;text-align:center;padding:9px 6px;border-radius:6px;font-weight:700;font-size:14px">${v}</td>`;
      }).join("");
      return `<tr><td style="padding:8px 12px;font-weight:600;color:#8b9ab8;font-size:13px">${d}</td>${cells}</tr>`;
    }).join("");

    const distRows = MEALS.map((m) => {
      const bars = [1, 2, 3, 4, 5]
        .map((star) => {
          const count = dist[m][star];
          const total = Object.values(dist[m]).reduce((a, b) => a + b, 0);
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const bc = star >= 4 ? "#22c55e" : star === 3 ? "#eab308" : "#ef4444";
          return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span style="width:14px;text-align:right;font-size:12px;color:#6b7a99">${star}★</span>
          <div style="flex:1;background:#1a2235;border-radius:3px;height:10px;overflow:hidden">
            <div style="width:${pct}%;height:100%;background:${bc};border-radius:3px"></div></div>
          <span style="width:32px;font-size:11px;color:#6b7a99">${pct}%</span></div>`;
        })
        .join("");
      return `<div style="flex:1;min-width:140px">
        <div style="font-size:12px;color:#f97316;font-weight:700;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">${mealIcon[m]} ${mealName[m]}</div>${bars}</div>`;
    }).join("");

    const likedC = an.comments
      .filter((c) => c.liked)
      .map(
        (c) =>
          `<li style="padding:7px 0;border-bottom:1px solid rgba(255,255,255,.06);color:#d1d5db;font-size:13px;line-height:1.6">💬 ${escHtml(c.liked)}</li>`,
      )
      .join("");
    const issueC = an.comments
      .filter((c) => c.issue)
      .map(
        (c) =>
          `<li style="padding:7px 0;border-bottom:1px solid rgba(255,255,255,.06);color:#d1d5db;font-size:13px;line-height:1.6">⚠️ ${escHtml(c.issue)}</li>`,
      )
      .join("");
    const wmStyle = `background:url('${NIST_LOGO}') center/contain no-repeat;`;

    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<title>Messify Report — ${an.weekLabel}</title>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#0b0f1a;--surface:#111827;--surface2:#1a2235;--border:rgba(255,255,255,0.07);--border2:rgba(255,255,255,0.12);--accent:#f97316;--text:#f0f4ff;--muted:#6b7a99;--success:#22c55e;--danger:#ef4444;--warning:#eab308}
body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;padding:40px;position:relative}
body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(255,255,255,.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.02) 1px,transparent 1px);background-size:48px 48px;pointer-events:none;z-index:0}
.watermark{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:440px;height:440px;${wmStyle}opacity:0.07;pointer-events:none;z-index:0;mix-blend-mode:multiply}
.content{position:relative;z-index:1}
h2{font-family:'Syne',sans-serif;font-size:15px;font-weight:700;margin:32px 0 14px;padding-bottom:8px;border-bottom:1px solid var(--border2)}
.meta{font-size:12px;color:var(--muted);margin:4px 0 0;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.meta-dot{color:var(--accent);opacity:.5}
.kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.kpi{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:18px 20px;text-align:center}
.kpi-val{font-family:'Syne',sans-serif;font-size:30px;font-weight:800;color:var(--accent);margin-bottom:4px}
.kpi-lbl{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.1em}
.meal-row{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.meal-card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px;text-align:center}
.meal-icon{font-size:22px;margin-bottom:6px}.meal-nm{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}.meal-sc{font-family:'Syne',sans-serif;font-size:26px;font-weight:800}
.heat-wrap{background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden}
.heat-table{width:100%;border-collapse:separate;border-spacing:4px;padding:12px}
.heat-table th{font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;padding:4px 8px;text-align:center}
.heat-table th:first-child{text-align:left}
.dist-wrap{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:20px;display:flex;gap:24px;flex-wrap:wrap}
.comm-wrap{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:20px}
.comm-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.comm-sec h3{font-family:'Syne',sans-serif;font-size:13px;font-weight:700;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid var(--border)}
.comm-sec ul{list-style:none;padding:0}
.logo-box{width:42px;height:42px;background:var(--accent);border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
.logo-text{font-family:'Syne',sans-serif;font-size:20px;font-weight:800;letter-spacing:-.02em}.logo-text span{color:var(--accent)}
.header-strip{display:flex;align-items:center;gap:16px;margin-bottom:28px}
.print-btn{position:fixed;top:20px;right:20px;background:var(--accent);color:#fff;border:none;padding:12px 24px;border-radius:10px;cursor:pointer;font-family:'Syne',sans-serif;font-size:14px;font-weight:700;box-shadow:0 4px 20px rgba(249,115,22,.4);z-index:999}
@media print{.print-btn{display:none!important}.watermark{opacity:.09;mix-blend-mode:multiply} @page{margin:15mm;size:A4}}
</style></head><body>
<div class="watermark"></div>
<button class="print-btn" onclick="window.print()">🖨️ Save as PDF</button>
<div class="content">
<div class="header-strip">
  <div class="logo-box">🍽</div>
  <div>
    <div class="logo-text">Messi<span>fy</span> — Weekly Feedback Report</div>
    <div class="meta"><span>${an.weekLabel}</span><span class="meta-dot">·</span><span>${an.weekRange}</span><span class="meta-dot">·</span><span>Academic Year ${acadYear}</span><span class="meta-dot">·</span><span>Generated: ${new Date().toLocaleString("en-IN")}</span><span class="meta-dot">·</span><span>NIST University</span></div>
  </div>
</div>
<h2>📊 Summary</h2>
<div class="kpi-row">
  <div class="kpi"><div class="kpi-val">${an.overallAvg}</div><div class="kpi-lbl">Overall Avg / 5</div></div>
  <div class="kpi"><div class="kpi-val">${an.total}</div><div class="kpi-lbl">Total Submissions</div></div>
  <div class="kpi"><div class="kpi-val" style="color:var(--success)">${an.mealAvg[an.bestMeal]}</div><div class="kpi-lbl">Best · ${mealName[an.bestMeal]}</div></div>
  <div class="kpi"><div class="kpi-val" style="color:var(--danger)">${an.mealAvg[an.worstMeal]}</div><div class="kpi-lbl">Worst · ${mealName[an.worstMeal]}</div></div>
</div>
<h2>⭐ Meal Averages</h2>
<div class="meal-row">${MEALS.map((m) => {
      const v = an.mealAvg[m];
      const c =
        v >= 4 ? "var(--success)" : v >= 3 ? "var(--warning)" : "var(--danger)";
      return `<div class="meal-card"><div class="meal-icon">${mealIcon[m]}</div><div class="meal-nm">${mealName[m]}</div><div class="meal-sc" style="color:${c}">${v}</div></div>`;
    }).join("")}</div>
<h2>🗓️ Daily Heatmap</h2>
<div class="heat-wrap"><table class="heat-table"><thead><tr><th></th>${MEALS.map((m) => `<th>${mealIcon[m]} ${mealName[m]}</th>`).join("")}</tr></thead><tbody>${heatRows}</tbody></table></div>
<h2>📈 Rating Distribution</h2>
<div class="dist-wrap">${distRows}</div>
<h2>💬 Student Feedback (Anonymous)</h2>
<div class="comm-wrap"><div class="comm-grid">
  <div class="comm-sec"><h3 style="color:var(--success)">✅ What students liked (${an.comments.filter((c) => c.liked).length})</h3><ul>${likedC || '<li style="color:var(--muted);padding:8px 0">No positive feedback this week.</li>'}</ul></div>
  <div class="comm-sec"><h3 style="color:var(--danger)">⚠️ Issues raised (${an.comments.filter((c) => c.issue).length})</h3><ul>${issueC || '<li style="color:var(--muted);padding:8px 0">No issues raised this week.</li>'}</ul></div>
</div></div>
</div></body></html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (e) {
    console.error("PDF error:", e);
    res.status(500).send("Error: " + e.message);
  }
});

// ── Start ──────────────────────────────────────────────────
initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log("");
      console.log("  ╔══════════════════════════════════════════╗");
      console.log("  ║   Messify Server — port " + PORT + "             ║");
      console.log("  ║   http://localhost:" + PORT + "                  ║");
      console.log("  ╚══════════════════════════════════════════╝");
      console.log("");
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err.message);
    console.error("   Check your MONGODB_URI in .env file");
    process.exit(1);
  });
