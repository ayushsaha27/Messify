const mongoose = require('mongoose');
const dns = require('dns').promises;

// FORCE PUBLIC DNS FIRST - Fixes 99% of querySrv ECONNREFUSED on college WiFi/hotspots
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);  // Google + Cloudflare

// Your schemas (unchanged)
const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  googleid: { type: String, default: null },
  picture: { type: String, default: null },
  passwordhash: { type: String, default: null },
  role: { type: String, default: 'student' },
  createdat: { type: Date, default: Date.now }
});

const mealRatingSchema = new mongoose.Schema({
  day: { type: String, required: true },
  meal: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 }
});

const feedbackSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  useremail: { type: String, required: true },
  username: { type: String, required: true },
  weekkey: { type: String, required: true },
  weeklabel: { type: String, required: true },
  weekrange: { type: String, required: true },
  liked: { type: String, default: '' },
  issues: { type: String, default: '' },
  mealratings: [mealRatingSchema],
  submittedat: { type: Date, default: Date.now }
});

feedbackSchema.index({ useremail: 1, weekkey: 1 }, { unique: true });
feedbackSchema.index({ weekkey: 1 });

const User = mongoose.model('User', userSchema);
const Feedback = mongoose.model('Feedback', feedbackSchema);

async function initDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('🚨 MONGODB_URI is not set in your .env file');
    console.error('Go to https://mongodb.com/atlas → Connect → Drivers → Copy "Connection string only"');
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
    
    // Quick direct URI fallback (hardcoded for your cluster - replace if needed)
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
      console.error('3. Password has no @/%? → URL-encode (@=%40)');
      throw directErr;
    }
  }
}

module.exports = { initDB, User, Feedback };
