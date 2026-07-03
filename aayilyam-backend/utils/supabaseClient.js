const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Uses the SERVICE ROLE key — this file must only ever run on the server,
// never be bundled into frontend code. It bypasses Row Level Security,
// which is what lets the admin panel write data.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = supabase;
