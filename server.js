// ═══════════════════════════════════════════════════════════
//  Messify Backend — server.js  (complete)
//  Auth + Feedback Storage + Analytics + PDF Export
// ═══════════════════════════════════════════════════════════
require('dotenv').config();

const express        = require('express');
const session        = require('express-session');
const passport       = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt         = require('bcryptjs');
const path           = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Stores ─────────────────────────────────────────────────
const users     = [];
const feedbacks = [];

// ─── Helpers ────────────────────────────────────────────────
function findByEmail(e)  { return users.find(u => u.email.toLowerCase() === e.toLowerCase()); }
function findById(id)    { return users.find(u => u.id === id); }
function isNistEmail(e)  { return e.trim().toLowerCase().endsWith('@nist.edu'); }
function genId()         { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
function isAdminEmail(e) {
  const list = (process.env.ADMIN_EMAILS || '').split(',').map(x => x.trim().toLowerCase());
  return list.includes(e.toLowerCase());
}
function escHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Real week helpers ────────────────────────────────────────
function getWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

function getCurrentWeekInfo() {
  const now  = new Date();
  const wnum = getWeekNumber(now);
  const key  = `${now.getFullYear()}-W${wnum}`;
  const label = `Week ${wnum}, ${now.getFullYear()}`;
  // Monday of this week
  const day  = now.getDay() || 7;
  const mon  = new Date(now); mon.setDate(now.getDate() - day + 1);
  const sun  = new Date(mon); sun.setDate(mon.getDate() + 6);
  const fmt  = d => d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
  const range = `${fmt(mon)} – ${fmt(sun)}`;
  return { key, label, range, weekNum: wnum, year: now.getFullYear() };
}

// ─── Analytics engine ────────────────────────────────────────
const MEAL_KEYS = { breakfast:'b', lunch:'l', snacks:'s', dinner:'d' };
const MEALS     = ['breakfast','lunch','snacks','dinner'];
const DAYS      = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function computeAnalytics(weekKey) {
  const week  = feedbacks.filter(f => f.weekKey === weekKey);
  const total = week.length;
  if (total === 0) return null;

  const heatSum   = {};
  const heatCount = {};
  DAYS.forEach(d => {
    heatSum[d]   = { b:0, l:0, s:0, d:0 };
    heatCount[d] = { b:0, l:0, s:0, d:0 };
  });
  const mealSum   = { breakfast:0, lunch:0, snacks:0, dinner:0 };
  const mealCount = { breakfast:0, lunch:0, snacks:0, dinner:0 };

  week.forEach(fb => {
    DAYS.forEach(day => {
      MEALS.forEach(meal => {
        const v = Number(fb.ratings[`${day}_${meal}`] || 0);
        if (v > 0) {
          const k = MEAL_KEYS[meal];
          heatSum[day][k]   += v; heatCount[day][k] += 1;
          mealSum[meal]   += v;   mealCount[meal]   += 1;
        }
      });
    });
  });

  const heatmap = {};
  DAYS.forEach(d => {
    heatmap[d] = {};
    MEALS.forEach(m => {
      const k = MEAL_KEYS[m];
      heatmap[d][k] = heatCount[d][k] > 0 ? Math.round((heatSum[d][k]/heatCount[d][k])*10)/10 : 0;
    });
  });

  const mealAvg = {};
  MEALS.forEach(m => {
    mealAvg[m] = mealCount[m] > 0 ? Math.round((mealSum[m]/mealCount[m])*10)/10 : 0;
  });

  const valid = MEALS.filter(m => mealCount[m] > 0);
  const overallAvg = valid.length > 0
    ? Math.round((valid.reduce((a,m)=>a+mealAvg[m],0)/valid.length)*10)/10 : 0;

  const sorted   = [...MEALS].sort((a,b) => mealAvg[b]-mealAvg[a]);
  const bestMeal  = sorted[0];
  const worstMeal = sorted[sorted.length-1];

  // Per-day per-meal averages for line chart
  const dailyAvg = {};
  MEALS.forEach(m => {
    dailyAvg[m] = DAYS.map(d => heatmap[d][MEAL_KEYS[m]]);
  });

  const comments = week
    .filter(f => f.liked || f.issues)
    .map(f => ({ name:f.userName, email:f.userEmail, liked:f.liked||'', issue:f.issues||'', date:f.submittedAt }));

  return {
    weekKey, weekLabel:week[0].weekLabel, weekRange:week[0].weekRange,
    total, overallAvg, mealAvg, bestMeal, worstMeal,
    heatmap, dailyAvg, comments
  };
}

// ═══════════════════════════════════════════════════════════
//  MIDDLEWARE
// ═══════════════════════════════════════════════════════════
app.use(express.json());
app.use(express.urlencoded({ extended:true }));
app.use(express.static(path.join(__dirname)));
app.use(session({
  secret: process.env.SESSION_SECRET || 'messify-secret-2025',
  resave:false, saveUninitialized:false,
  cookie:{ secure:false, maxAge:7*24*60*60*1000 }
}));
app.use(passport.initialize());
app.use(passport.session());

// ═══════════════════════════════════════════════════════════
//  PASSPORT
// ═══════════════════════════════════════════════════════════
passport.serializeUser((u,done) => done(null,u.id));
passport.deserializeUser((id,done) => done(null,findById(id)||false));

passport.use(new GoogleStrategy({
  clientID:     process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL:  process.env.GOOGLE_CALLBACK_URL||'http://localhost:3000/auth/google/callback'
}, (at, rt, profile, done) => {
  const email = profile.emails?.[0]?.value;
  if (!email || !isNistEmail(email)) return done(null,false);
  let user = findByEmail(email);
  if (!user) {
    user = {
      id:genId(), name:profile.displayName||email.split('@')[0], email,
      googleId:profile.id, picture:profile.photos?.[0]?.value||null,
      passwordHash:null, role:isAdminEmail(email)?'admin':'student',
      createdAt:new Date().toISOString()
    };
    users.push(user);
    console.log('✅ Google user:', email, '|', user.role);
  } else {
    user.role = isAdminEmail(email)?'admin':'student';
    if(!user.googleId) user.googleId=profile.id;
  }
  return done(null,user);
}));

// ═══════════════════════════════════════════════════════════
//  GOOGLE AUTH ROUTES
// ═══════════════════════════════════════════════════════════
app.get('/auth/google', passport.authenticate('google',{scope:['profile','email'],prompt:'select_account'}));
app.get('/auth/google/callback',
  passport.authenticate('google',{failureRedirect:'/auth/google/failed'}),
  (req,res) => {
    const u=req.user;
    const safe={name:u.name,email:u.email,picture:u.picture||null,role:u.role};
    res.send(`<!DOCTYPE html><html><body><script>
      localStorage.setItem('messify_user',JSON.stringify(${JSON.stringify(safe)}));
      window.location.href='/feedback.html';
    </script></body></html>`);
  }
);
app.get('/auth/google/failed', (req,res) => {
  res.send(`<!DOCTYPE html><html><body><script>
    alert('Login failed: Only @nist.edu emails allowed.');
    window.location.href='index.html';
  </script></body></html>`);
});

// ═══════════════════════════════════════════════════════════
//  AUTH ROUTES
// ═══════════════════════════════════════════════════════════
app.post('/api/auth/register', async(req,res) => {
  try {
    const{name,email,password}=req.body;
    if(!name||!email||!password) return res.json({success:false,message:'All fields required.'});
    if(!isNistEmail(email)) return res.json({success:false,message:'Only @nist.edu emails allowed.'});
    if(password.length<8) return res.json({success:false,message:'Password min 8 chars.'});
    if(findByEmail(email)) return res.json({success:false,message:'Email already registered.'});
    const passwordHash=await bcrypt.hash(password,12);
    const user={id:genId(),name:name.trim(),email:email.trim().toLowerCase(),
      googleId:null,picture:null,passwordHash,
      role:isAdminEmail(email.trim().toLowerCase())?'admin':'student',
      createdAt:new Date().toISOString()};
    users.push(user);
    return res.json({success:true,user:{name:user.name,email:user.email,picture:null,role:user.role}});
  } catch(e){res.status(500).json({success:false,message:'Server error.'});}
});

app.post('/api/auth/login', async(req,res) => {
  try {
    const{email,password}=req.body;
    if(!email||!password) return res.json({success:false,message:'All fields required.'});
    if(!isNistEmail(email)) return res.json({success:false,message:'Only @nist.edu emails allowed.'});
    const user=findByEmail(email);
    if(!user) return res.json({success:false,message:'No account found. Register first.'});
    if(!user.passwordHash) return res.json({success:false,message:'Use Google Sign-In for this account.'});
    const match=await bcrypt.compare(password,user.passwordHash);
    if(!match) return res.json({success:false,message:'Incorrect password.'});
    user.role=isAdminEmail(email)?'admin':'student';
    return res.json({success:true,user:{name:user.name,email:user.email,picture:null,role:user.role}});
  } catch(e){res.status(500).json({success:false,message:'Server error.'});}
});

app.post('/api/auth/logout',(req,res,next)=>{
  req.logout(err=>{
    if(err) return next(err);
    req.session.destroy(()=>{res.clearCookie('connect.sid');res.json({success:true});});
  });
});

app.get('/api/auth/me',(req,res)=>{
  if(req.user) return res.json({success:true,user:{name:req.user.name,email:req.user.email,role:req.user.role}});
  res.json({success:false});
});

// ═══════════════════════════════════════════════════════════
//  WEEK INFO  — used by feedback page for real current date
// ═══════════════════════════════════════════════════════════
app.get('/api/week/current',(req,res)=>{
  res.json({success:true, ...getCurrentWeekInfo()});
});

// ═══════════════════════════════════════════════════════════
//  FEEDBACK ROUTES
// ═══════════════════════════════════════════════════════════
app.get('/api/feedback/status',(req,res)=>{
  const email=req.query.email;
  if(!email) return res.json({success:false});
  const{key}=getCurrentWeekInfo();
  const existing=feedbacks.find(f=>f.userEmail.toLowerCase()===email.toLowerCase()&&f.weekKey===key);
  res.json({success:true,submitted:!!existing,weekKey:key});
});

app.post('/api/feedback/submit',(req,res)=>{
  try {
    const{email,name,ratings,liked,issues}=req.body;
    if(!email||!ratings) return res.json({success:false,message:'Missing data.'});
    if(!isNistEmail(email)) return res.json({success:false,message:'Only @nist.edu emails allowed.'});
    const wi=getCurrentWeekInfo();
    if(feedbacks.find(f=>f.userEmail.toLowerCase()===email.toLowerCase()&&f.weekKey===wi.key))
      return res.json({success:false,message:'You have already submitted feedback this week.'});
    const rated=Object.values(ratings).filter(v=>Number(v)>0).length;
    if(rated<14) return res.json({success:false,message:'Please rate at least 14 meals.'});
    feedbacks.push({
      id:genId(), userEmail:email.toLowerCase(), userName:name||email.split('@')[0],
      weekKey:wi.key, weekLabel:wi.label, weekRange:wi.range,
      ratings, liked:(liked||'').trim(), issues:(issues||'').trim(),
      submittedAt:new Date().toISOString()
    });
    console.log('✅ Feedback:', email, '| week:', wi.key, '| meals rated:', rated);
    return res.json({success:true,message:'Feedback submitted successfully!'});
  } catch(e){console.error(e);res.status(500).json({success:false,message:'Server error.'});}
});

// ═══════════════════════════════════════════════════════════
//  ANALYTICS ROUTES
// ═══════════════════════════════════════════════════════════
app.get('/api/analytics/current',(req,res)=>{
  const{key}=getCurrentWeekInfo();
  const data=computeAnalytics(key);
  if(!data) return res.json({success:true,empty:true});
  res.json({success:true,empty:false,data});
});

app.get('/api/analytics/all-weeks',(req,res)=>{
  const keys=[...new Set(feedbacks.map(f=>f.weekKey))].sort();
  const data=keys.map(k=>computeAnalytics(k)).filter(Boolean);
  res.json({success:true,data});
});

// ═══════════════════════════════════════════════════════════
//  ADMIN ROUTES
// ═══════════════════════════════════════════════════════════
function requireAdmin(req,res,next){
  const email=req.headers['x-user-email']||'';
  if(!isAdminEmail(email)) return res.status(403).json({success:false,message:'Admin only.'});
  next();
}

app.get('/api/admin/submissions',requireAdmin,(req,res)=>{
  const{key}=getCurrentWeekInfo();
  const week=req.query.week||key;
  const data=feedbacks.filter(f=>f.weekKey===week)
    .map(f=>({id:f.id,name:f.userName,email:f.userEmail,submittedAt:f.submittedAt,liked:f.liked,issues:f.issues,ratings:f.ratings}));
  res.json({success:true,count:data.length,data});
});

app.get('/api/admin/complaints',requireAdmin,(req,res)=>{
  const complaints=feedbacks
    .filter(f=>f.issues&&f.issues.length>0)
    .map(f=>({name:f.userName,email:f.userEmail,week:f.weekLabel,text:f.issues,submittedAt:f.submittedAt}))
    .sort((a,b)=>new Date(b.submittedAt)-new Date(a.submittedAt));
  res.json({success:true,count:complaints.length,data:complaints});
});

// ═══════════════════════════════════════════════════════════
//  EXPORT PDF — full HTML report, browser prints as PDF
// ═══════════════════════════════════════════════════════════
app.get('/api/admin/export-pdf',requireAdmin,(req,res)=>{
  const{key}=getCurrentWeekInfo();
  const week=req.query.week||key;
  const an=computeAnalytics(week);
  const mealIcon={breakfast:'🌅',lunch:'🍱',snacks:'🫖',dinner:'🌙'};
  const mealName={breakfast:'Breakfast',lunch:'Lunch',snacks:'Snacks',dinner:'Dinner'};
  const NIST_LOGO='data:image/png;base64,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';

  if(!an){
    return res.send(`<!DOCTYPE html><html>
    <head><meta charset="UTF-8"/><title>No Data</title>
    <style>body{background:#0b0f1a;color:#f0f4ff;font-family:'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;gap:16px}
    h2{color:#f97316}button{background:#f97316;color:#fff;border:none;padding:10px 22px;border-radius:8px;cursor:pointer;font-size:14px}</style></head>
    <body><h2>No data for ${week}</h2><p>No submissions yet this week.</p>
    <button onclick="window.close()">Close</button></body></html>`);
  }

  // ── Rating distribution per meal ──────────────────────
  const dist={breakfast:{1:0,2:0,3:0,4:0,5:0},lunch:{1:0,2:0,3:0,4:0,5:0},snacks:{1:0,2:0,3:0,4:0,5:0},dinner:{1:0,2:0,3:0,4:0,5:0}};
  const allSubs=feedbacks.filter(f=>f.weekKey===week);
  allSubs.forEach(fb=>{
    DAYS.forEach(day=>{
      MEALS.forEach(meal=>{
        const v=Number(fb.ratings[`${day}_${meal}`]||0);
        if(v>=1&&v<=5) dist[meal][v]++;
      });
    });
  });

  // ── Heatmap rows ──────────────────────────────────────
  const heatRows=DAYS.map(d=>{
    const cells=MEALS.map(m=>{
      const v=an.heatmap[d][MEAL_KEYS[m]];
      const bg=v>=4.5?'#22c55e':v>=3.8?'#4ade80':v>=3.0?'#eab308':v>=2.5?'#f97316':'#ef4444';
      return `<td style="background:${bg};color:#fff;text-align:center;padding:9px 6px;border-radius:6px;font-weight:700;font-size:14px">${v}</td>`;
    }).join('');
    return `<tr><td style="padding:8px 12px;font-weight:600;color:#8b9ab8;font-size:13px">${d}</td>${cells}</tr>`;
  }).join('');

  // ── Distribution bars ──────────────────────────────────
  const distRows=MEALS.map(m=>{
    const bars=[1,2,3,4,5].map(star=>{
      const count=dist[m][star];
      const total=Object.values(dist[m]).reduce((a,b)=>a+b,0);
      const pct=total>0?Math.round(count/total*100):0;
      const bc=star>=4?'#22c55e':star===3?'#eab308':'#ef4444';
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="width:14px;text-align:right;font-size:12px;color:#6b7a99">${star}★</span>
        <div style="flex:1;background:#1a2235;border-radius:3px;height:10px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:${bc};border-radius:3px"></div>
        </div>
        <span style="width:32px;font-size:11px;color:#6b7a99">${pct}%</span>
      </div>`;
    }).join('');
    return `<div style="flex:1;min-width:140px">
      <div style="font-size:12px;color:#f97316;font-weight:700;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">${mealIcon[m]} ${mealName[m]}</div>
      ${bars}
    </div>`;
  }).join('');

  // ── Anonymous comments ────────────────────────────────
  const likedComments=an.comments.filter(c=>c.liked).map(c=>`<li style="padding:7px 0;border-bottom:1px solid rgba(255,255,255,.06);color:#d1d5db;font-size:13px;line-height:1.6">💬 ${escHtml(c.liked)}</li>`).join('');
  const issueComments=an.comments.filter(c=>c.issue).map(c=>`<li style="padding:7px 0;border-bottom:1px solid rgba(255,255,255,.06);color:#d1d5db;font-size:13px;line-height:1.6">⚠️ ${escHtml(c.issue)}</li>`).join('');

  const html=`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Messify Report — ${an.weekLabel}</title>
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  :root{--bg:#0b0f1a;--surface:#111827;--surface2:#1a2235;--border:rgba(255,255,255,0.07);--border2:rgba(255,255,255,0.12);--accent:#f97316;--accent2:#fb923c;--text:#f0f4ff;--muted:#6b7a99;--muted2:#8b9ab8;--success:#22c55e;--danger:#ef4444;--warning:#eab308}
  body{background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;padding:40px;min-height:100vh;position:relative}
  /* Watermark logo */
  .watermark{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:320px;height:320px;background:url('${NIST_LOGO}') center/contain no-repeat;opacity:0.04;pointer-events:none;z-index:0;mix-blend-mode:luminosity}
  .content{position:relative;z-index:1}
  /* Grid lines */
  body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(255,255,255,.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.02) 1px,transparent 1px);background-size:48px 48px;pointer-events:none;z-index:0}
  h1{font-family:'Syne',sans-serif;font-size:28px;font-weight:800;letter-spacing:-.03em;color:var(--text);margin-bottom:6px}
  h1 span{color:var(--accent)}
  h2{font-family:'Syne',sans-serif;font-size:15px;font-weight:700;color:var(--text);margin:32px 0 14px;padding-bottom:8px;border-bottom:1px solid var(--border2);display:flex;align-items:center;gap:8px}
  .meta{font-size:12px;color:var(--muted);margin-bottom:32px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  .meta-dot{width:4px;height:4px;border-radius:50%;background:var(--accent);opacity:.5}
  /* KPI cards */
  .kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:8px}
  .kpi{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:18px 20px;text-align:center}
  .kpi-val{font-family:'Syne',sans-serif;font-size:30px;font-weight:800;color:var(--accent);letter-spacing:-.02em;margin-bottom:4px}
  .kpi-lbl{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.1em}
  /* Meal avg row */
  .meal-row{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:8px}
  .meal-card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px;text-align:center}
  .meal-icon{font-size:22px;margin-bottom:6px}
  .meal-name{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}
  .meal-score{font-family:'Syne',sans-serif;font-size:26px;font-weight:800;letter-spacing:-.02em}
  /* Heatmap */
  .heat-wrap{background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden}
  .heat-table{width:100%;border-collapse:separate;border-spacing:4px;padding:12px}
  .heat-table th{font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;padding:4px 8px;text-align:center}
  .heat-table th:first-child{text-align:left}
  /* Distribution */
  .dist-wrap{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:20px;display:flex;gap:24px;flex-wrap:wrap}
  /* Comments */
  .comments-wrap{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:20px}
  .comments-col{display:grid;grid-template-columns:1fr 1fr;gap:24px}
  .comm-section h3{font-family:'Syne',sans-serif;font-size:13px;font-weight:700;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid var(--border)}
  .comm-section ul{list-style:none;padding:0}
  /* Print button */
  .print-btn{position:fixed;top:20px;right:20px;background:var(--accent);color:#fff;border:none;padding:12px 24px;border-radius:10px;cursor:pointer;font-family:'Syne',sans-serif;font-size:14px;font-weight:700;box-shadow:0 4px 20px rgba(249,115,22,.4);z-index:999;transition:transform .18s}
  .print-btn:hover{transform:translateY(-1px)}
  /* Header strip */
  .header-strip{display:flex;align-items:center;gap:16px;margin-bottom:28px}
  .logo-box{width:42px;height:42px;background:var(--accent);border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0}
  .logo-text{font-family:'Syne',sans-serif;font-size:20px;font-weight:800;letter-spacing:-.02em}
  .logo-text span{color:var(--accent)}
  @media print{
    .print-btn{display:none!important}
    body{padding:20px}
    .watermark{opacity:0.06}
    @page{margin:15mm;size:A4}
  }
</style>
</head>
<body>
<div class="watermark"></div>
<button class="print-btn" onclick="window.print()">🖨️ Save as PDF</button>
<div class="content">

  <div class="header-strip">
    <div class="logo-box">🍽</div>
    <div>
      <div class="logo-text">Messi<span>fy</span> — Weekly Feedback Report</div>
      <div class="meta" style="margin:4px 0 0">
        <span>${an.weekLabel}</span><span class="meta-dot"></span>
        <span>${an.weekRange}</span><span class="meta-dot"></span>
        <span>Generated: ${new Date().toLocaleString('en-IN')}</span><span class="meta-dot"></span>
        <span>NIST University</span>
      </div>
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
  <div class="meal-row">
    ${MEALS.map(m=>{
      const v=an.mealAvg[m];
      const c=v>=4?'var(--success)':v>=3?'var(--warning)':'var(--danger)';
      return `<div class="meal-card">
        <div class="meal-icon">${mealIcon[m]}</div>
        <div class="meal-name">${mealName[m]}</div>
        <div class="meal-score" style="color:${c}">${v}</div>
      </div>`;
    }).join('')}
  </div>

  <h2>🗓️ Daily Heatmap</h2>
  <div class="heat-wrap">
    <table class="heat-table">
      <thead><tr><th></th>${MEALS.map(m=>`<th>${mealIcon[m]} ${mealName[m]}</th>`).join('')}</tr></thead>
      <tbody>${heatRows}</tbody>
    </table>
  </div>

  <h2>📈 Rating Distribution</h2>
  <div class="dist-wrap">${distRows}</div>

  <h2>💬 Student Feedback</h2>
  <div class="comments-wrap">
    <div class="comments-col">
      <div class="comm-section">
        <h3 style="color:var(--success)">✅ What students liked (${an.comments.filter(c=>c.liked).length} responses)</h3>
        <ul>${likedComments||'<li style="color:var(--muted);padding:8px 0">No positive feedback this week.</li>'}</ul>
      </div>
      <div class="comm-section">
        <h3 style="color:var(--danger)">⚠️ Issues raised (${an.comments.filter(c=>c.issue).length} responses)</h3>
        <ul>${issueComments||'<li style="color:var(--muted);padding:8px 0">No issues raised this week.</li>'}</ul>
      </div>
    </div>
  </div>

</div>
</body></html>`;
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.send(html);
});

// ═══════════════════════════════════════════════════════════
//  START
// ═══════════════════════════════════════════════════════════
app.listen(PORT,()=>{
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║   Messify Server — port '+PORT+'             ║');
  console.log('  ║   http://localhost:'+PORT+'                  ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
});
