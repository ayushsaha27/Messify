// ═══════════════════════════════════════════════════════════
//  db.js — PostgreSQL connection (Neon.tech — port 6543)
//  Port 6543 is the Neon connection pooler port
//  It bypasses college/campus firewalls that block port 5432
// ═══════════════════════════════════════════════════════════
const { Pool } = require('pg');

function buildPool() {
  let url = (process.env.DATABASE_URL || '')
    .replace(/&?channel_binding=require/g, '')
    .replace(/\?&/, '?')
    .trim();

  // ── Force port 6543 (Neon pooler port — not blocked by firewalls) ──
  // Default port 5432 is often blocked on college/office networks
  // Port 6543 is Neon's special pooler port that works everywhere
  if (url.includes('neon.tech') && !url.includes(':6543')) {
    url = url.replace(
      /(@[^/]+)(\/neondb)/,
      '$1:6543$2'
    );
  }

  console.log('🔌 Connecting to:', url.replace(/:([^:@]+)@/, ':****@')); // hide password in log

  return new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
    idleTimeoutMillis: 30000,
    max: 5
  });
}

const pool = buildPool();

pool.on('error', (err) => {
  console.error('Unexpected DB pool error:', err.message);
});

async function initDB() {
  let client;
  try {
    console.log('🔄 Connecting to Neon database...');
    client = await pool.connect();
    console.log('✅ Database connected successfully!');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        email         TEXT UNIQUE NOT NULL,
        google_id     TEXT,
        picture       TEXT,
        password_hash TEXT,
        role          TEXT NOT NULL DEFAULT 'student',
        created_at    TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS feedbacks (
        id           TEXT PRIMARY KEY,
        user_email   TEXT NOT NULL,
        user_name    TEXT NOT NULL,
        week_key     TEXT NOT NULL,
        week_label   TEXT NOT NULL,
        week_range   TEXT NOT NULL,
        liked        TEXT DEFAULT '',
        issues       TEXT DEFAULT '',
        submitted_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_email, week_key)
      );

      CREATE TABLE IF NOT EXISTS meal_ratings (
        id          SERIAL PRIMARY KEY,
        feedback_id TEXT NOT NULL REFERENCES feedbacks(id) ON DELETE CASCADE,
        day         TEXT NOT NULL,
        meal        TEXT NOT NULL,
        rating      INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5)
      );

      CREATE INDEX IF NOT EXISTS idx_feedbacks_week   ON feedbacks(week_key);
      CREATE INDEX IF NOT EXISTS idx_feedbacks_email  ON feedbacks(user_email);
      CREATE INDEX IF NOT EXISTS idx_ratings_feedback ON meal_ratings(feedback_id);
    `);
    console.log('✅ Database tables ready');
  } catch (err) {
    console.error('');
    console.error('❌ Database connection failed:', err.message);
    console.error('');
    console.error('  ┌─── TROUBLESHOOTING ──────────────────────────────┐');
    console.error('  │  1. Switch to MOBILE HOTSPOT and try again        │');
    console.error('  │     (College WiFi blocks port 5432 and 6543)      │');
    console.error('  │                                                    │');
    console.error('  │  2. Check DATABASE_URL in your .env file          │');
    console.error('  │     Must have -pooler in the hostname              │');
    console.error('  │                                                    │');
    console.error('  │  3. Make sure you ran: npm install                 │');
    console.error('  └────────────────────────────────────────────────────┘');
    console.error('');
    throw err;
  } finally {
    if (client) client.release();
  }
}

async function query(text, params) {
  return pool.query(text, params);
}

async function getOne(text, params) {
  const r = await pool.query(text, params);
  return r.rows[0] || null;
}

async function getMany(text, params) {
  const r = await pool.query(text, params);
  return r.rows;
}

module.exports = { pool, initDB, query, getOne, getMany };
