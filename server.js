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
    if (rated < 14)
      return res.json({
        success: false,
        message: "Please rate at least 14 meals.",
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
  const email = req.headers["x-user-email"] || "";
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

    let NIST_LOGO = "";
    try {
      const logoPath = path.join(__dirname, "nist.png");
      if (fs.existsSync(logoPath)) {
        NIST_LOGO =
          "data:image/png;base64," +
          fs.readFileSync(logoPath).toString("base64");
      }
    } catch (e) {}

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
    const wmStyle = NIST_LOGO
      ? `background:url('${NIST_LOGO}') center/contain no-repeat;`
      : "background:radial-gradient(circle,rgba(249,115,22,.08) 0%,transparent 70%);";

    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/>
<title>Messify Report — ${an.weekLabel}</title>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#0b0f1a;--surface:#111827;--surface2:#1a2235;--border:rgba(255,255,255,0.07);--border2:rgba(255,255,255,0.12);--accent:#f97316;--text:#f0f4ff;--muted:#6b7a99;--success:#22c55e;--danger:#ef4444;--warning:#eab308}
body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;padding:40px;position:relative}
body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(255,255,255,.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.02) 1px,transparent 1px);background-size:48px 48px;pointer-events:none;z-index:0}
.watermark{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:340px;height:340px;${wmStyle}opacity:0.045;pointer-events:none;z-index:0;mix-blend-mode:luminosity}
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
@media print{.print-btn{display:none!important}.watermark{opacity:.065} @page{margin:15mm;size:A4}}
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
