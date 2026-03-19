// ═══════════════════════════════════════════════════════════
//  Messify Backend — server.js
//  Stack: Express + Passport (Google OAuth 2.0) + bcryptjs
//  Auth flow: Google OAuth OR email/password
//  Restriction: only @nist.edu emails allowed
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

// ─── In-memory user store (replace with a real DB later) ───
// Format: { id, name, email, passwordHash, googleId, role, createdAt }
const users = [];

// ─── Helper: find user by email ────────────────────────────
function findByEmail(email) {
  return users.find(u => u.email.toLowerCase() === email.toLowerCase());
}

// ─── Helper: find user by id ───────────────────────────────
function findById(id) {
  return users.find(u => u.id === id);
}

// ─── Helper: check NIST email ──────────────────────────────
function isNistEmail(email) {
  return email.trim().toLowerCase().endsWith('@nist.edu');
}

// ─── Helper: generate simple unique id ─────────────────────
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ═══════════════════════════════════════════════════════════
//  MIDDLEWARE
// ═══════════════════════════════════════════════════════════
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve your HTML files as static files from the same folder
app.use(express.static(path.join(__dirname)));

// Session (needed for Passport + Google OAuth)
app.use(session({
  secret: process.env.SESSION_SECRET || 'messify-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,        // set to true in production with HTTPS
    maxAge: 7 * 24 * 60 * 60 * 1000  // 7 days
  }
}));

// Passport init
app.use(passport.initialize());
app.use(passport.session());

// ═══════════════════════════════════════════════════════════
//  PASSPORT SERIALISE / DESERIALISE
// ═══════════════════════════════════════════════════════════
passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  const user = findById(id);
  done(null, user || false);
});

// ═══════════════════════════════════════════════════════════
//  GOOGLE OAUTH 2.0 STRATEGY
// ═══════════════════════════════════════════════════════════
passport.use(new GoogleStrategy(
  {
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback'
  },
  function(accessToken, refreshToken, profile, done) {
    const email = profile.emails && profile.emails[0] && profile.emails[0].value;

    // ── Block non-NIST emails ──────────────────────────────
    if (!email || !isNistEmail(email)) {
      return done(null, false, { message: 'Only @nist.edu emails are allowed.' });
    }

    // ── Find or create user ────────────────────────────────
    let user = findByEmail(email);
    if (!user) {
      user = {
        id:           genId(),
        name:         profile.displayName || email.split('@')[0],
        email:        email,
        googleId:     profile.id,
        picture:      profile.photos && profile.photos[0] && profile.photos[0].value,
        passwordHash: null,
        role:         'student',   // default role
        createdAt:    new Date().toISOString()
      };
      users.push(user);
      console.log('New user registered via Google:', email);
    } else {
      // Update Google ID if logging in via Google for the first time
      if (!user.googleId) user.googleId = profile.id;
    }

    return done(null, user);
  }
));

// ═══════════════════════════════════════════════════════════
//  GOOGLE OAUTH ROUTES
// ═══════════════════════════════════════════════════════════

// Step 1: Redirect user to Google
app.get('/auth/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account'    // always show account picker
  })
);

// Step 2: Google redirects back here after consent
app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/auth/google/failed' }),
  function(req, res) {
    // Success — send user data back to frontend via a tiny script
    // The frontend will save it to localStorage and redirect
    const user = req.user;
    const safeUser = {
      name:    user.name,
      email:   user.email,
      picture: user.picture || null,
      role:    user.role
    };
    // Inject user data into a small HTML page that saves to localStorage
    res.send(`<!DOCTYPE html><html><head><title>Redirecting...</title></head><body>
      <script>
        localStorage.setItem('messify_user', JSON.stringify(${JSON.stringify(safeUser)}));
        window.location.href = '/feedback.html';
      </script>
      <p>Redirecting...</p>
    </body></html>`);
  }
);

// Failed Google auth (wrong domain etc.)
app.get('/auth/google/failed', function(req, res) {
  res.send(`<!DOCTYPE html><html><head><title>Login Failed</title></head><body>
    <script>
      alert('Login failed: Only @nist.edu email addresses are allowed.');
      window.location.href = 'index.html';
    </script>
  </body></html>`);
});

// ═══════════════════════════════════════════════════════════
//  EMAIL / PASSWORD ROUTES
// ═══════════════════════════════════════════════════════════

// ── REGISTER ───────────────────────────────────────────────
app.post('/api/auth/register', async function(req, res) {
  try {
    const { name, email, password } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.json({ success: false, message: 'All fields are required.' });
    }
    if (!isNistEmail(email)) {
      return res.json({ success: false, message: 'Only @nist.edu emails are allowed.' });
    }
    if (password.length < 8) {
      return res.json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    // Check if email already registered
    if (findByEmail(email)) {
      return res.json({ success: false, message: 'This email is already registered. Please sign in.' });
    }

    // Hash password and save user
    const passwordHash = await bcrypt.hash(password, 12);
    const user = {
      id:           genId(),
      name:         name.trim(),
      email:        email.trim().toLowerCase(),
      googleId:     null,
      picture:      null,
      passwordHash: passwordHash,
      role:         'student',
      createdAt:    new Date().toISOString()
    };
    users.push(user);
    console.log('New user registered via email:', user.email);

    // Return safe user object (no password hash)
    return res.json({
      success: true,
      user: { name: user.name, email: user.email, picture: null, role: user.role }
    });

  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ── LOGIN ──────────────────────────────────────────────────
app.post('/api/auth/login', async function(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.json({ success: false, message: 'All fields are required.' });
    }
    if (!isNistEmail(email)) {
      return res.json({ success: false, message: 'Only @nist.edu emails are allowed.' });
    }

    const user = findByEmail(email);
    if (!user) {
      return res.json({ success: false, message: 'No account found with this email. Please register first.' });
    }
    if (!user.passwordHash) {
      return res.json({ success: false, message: 'This account uses Google Sign-In. Please use the Google button.' });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.json({ success: false, message: 'Incorrect password. Please try again.' });
    }

    console.log('User logged in:', user.email);
    return res.json({
      success: true,
      user: { name: user.name, email: user.email, picture: user.picture || null, role: user.role }
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ── LOGOUT ─────────────────────────────────────────────────
app.post('/api/auth/logout', function(req, res, next) {
  req.logout(function(err) {
    if (err) return next(err);
    req.session.destroy(function(err) {
      res.clearCookie('connect.sid'); 
      res.json({ success: true });
    });
  });
});

// ── GET CURRENT SESSION USER ────────────────────────────────
app.get('/api/auth/me', function(req, res) {
  if (req.user) {
    return res.json({
      success: true,
      user: { name: req.user.name, email: req.user.email, picture: req.user.picture || null, role: req.user.role }
    });
  }
  res.json({ success: false, message: 'Not authenticated.' });
});

// ═══════════════════════════════════════════════════════════
//  START SERVER
// ═══════════════════════════════════════════════════════════
app.listen(PORT, function() {
  console.log('');
  console.log('  ╔══════════════════════════════════════════╗');
  console.log('  ║   Messify Server running on port ' + PORT + '    ║');
  console.log('  ║   Open: http://localhost:' + PORT + '            ║');
  console.log('  ╚══════════════════════════════════════════╝');
  console.log('');
});