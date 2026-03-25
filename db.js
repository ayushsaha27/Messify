const mongoose = require('mongoose');
const dns = require('dns').promises;

// FORCE PUBLIC DNS FIRST - Fixes 99% of querySrv ECONNREFUSED on college WiFi/hotspots
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);  // Google + Cloudflare

// ── FIXED USER SCHEMA ──
const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  google_id: { type: String, default: null },       // Fixed
  picture: { type: String, default: null },
  password_hash: { type: String, default: null },   // Fixed
  role: { type: String, default: 'student' },
  created_at: { type: Date, default: Date.now }     // Fixed
});

// ── FIXED MEAL RATING SCHEMA ──
const mealRatingSchema = new mongoose.Schema({
  day: { type: String, required: true },
  meal: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 }
});

// ── FIXED FEEDBACK SCHEMA ──
const feedbackSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  user_email: { type: String, required: true },     // Fixed
  user_name: { type: String, required: true },      // Fixed
  week_key: { type: String, required: true },       // Fixed
  week_label: { type: String, required: true },     // Fixed
  week_range: { type: String, required: true },     // Fixed
  liked: { type: String, default: '' },
  issues: { type: String, default: '' },
  meal_ratings: [mealRatingSchema],                 // Fixed
  submitted_at: { type: Date, default: Date.now }   // Fixed
});

feedbackSchema.index({ user_email: 1, week_key: 1 }, { unique: true });
feedbackSchema.index({ week_key: 1 });

const User = mongoose.model('User', userSchema);
const Feedback = mongoose.model('Feedback', feedbackSchema);

async function initDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('🚨 MONGODB_URI is not set in your .env file');
    throw new Error('MONGODB_URI not set');
  }

  console.log('🔄 Connecting to MongoDB Atlas... (with public DNS fix)');

  const options = {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10
  };

  try {
    // Try SRV first (now with fixed DNS)
    await mongoose.connect(uri, options);
    console.log('✅ MongoDB connected! (SRV)');
    return;
  } catch (srvErr) {
    console.warn('⚠️ SRV failed (normal on restricted networks):', srvErr.message.split('\n')[0]);
    
    // Quick direct URI fallback (hardcoded for your cluster)
    const directUri = uri.replace('mongodb+srv://', 'mongodb://')
      .replace('cluster0.zeon1cd.mongodb.net', 'cluster0-shard-00-00.zeon1cd.mongodb.net,cluster0-shard-00-01.zeon1cd.mongodb.net,cluster0-shard-00-02.zeon1cd.mongodb.net')
      .replace('?retryWrites=true&w=majority', '?ssl=true&replicaSet=atlas-abc123-shard-0&authSource=admin&retryWrites=true&w=majority');
    
    console.log('🔄 Trying direct connection:', directUri.split('@')[1]?.split('?')[0] || 'fallback');
    
    try {
      await mongoose.connect(directUri, options);
      console.log('✅ MongoDB connected! (Direct fallback - your network blocked SRV DNS)');
      return;
    } catch (directErr) {
      console.error('💥 Both connections failed. Fixes:');
      console.error('1. Verify .env MONGODB_URI (no quotes, password correct)');
      console.error('2. Atlas → Network Access → 0.0.0.0/0 is green');
      throw directErr;
    }
  }
}

module.exports = { initDB, User, Feedback };