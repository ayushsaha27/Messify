const mongoose = require('mongoose');
const dns = require('dns').promises;

// Set public DNS to bypass restricted college networks
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  google_id: { type: String, default: null },
  picture: { type: String, default: null },
  password_hash: { type: String, default: null },
  role: { type: String, default: 'student' },
  created_at: { type: Date, default: Date.now }
});

const feedbackSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  user_email: { type: String, required: true },
  user_name: { type: String },
  week_key: { type: String, required: true },
  week_label: { type: String },
  week_range: { type: String },
  submitted_at: { type: Date, default: Date.now },
  liked: { type: String, default: "" },
  issues: { type: String, default: "" },
  meal_ratings: [{
    day: String,
    meal: String,
    rating: Number,
    food_type: { type: String, enum: ['veg', 'non-veg'], default: 'veg' }
  }]
});

// Prevention of duplicate submissions per week
feedbackSchema.index({ user_email: 1, week_key: 1 }, { unique: true });

const User = mongoose.model('User', userSchema);
const Feedback = mongoose.model('Feedback', feedbackSchema);

async function initDB() {
  const uri = process.env.MONGODB_URI;
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    console.log('✅ MongoDB Connected');
  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err.message);
    process.exit(1);
  }
}

module.exports = { initDB, User, Feedback };