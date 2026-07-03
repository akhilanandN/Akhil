require('dotenv').config();

// Simple shared-secret admin check for a small single-owner shop.
// The admin panel sends this password once at login and stores the token
// in memory; every admin request includes it in the header below.
// (Good enough for one owner. If you later add staff logins, upgrade this
// to Supabase Auth with a "role" column checked via RLS.)
function requireAdmin(req, res, next) {
  const password = req.headers['x-admin-password'];
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Not authorized. Invalid admin password.' });
  }
  next();
}

module.exports = requireAdmin;
