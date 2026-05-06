const {createClient} = require('@supabase/supabase-js');
// In production on Vercel, env vars are injected automatically.
// Keep dotenv only for local development.
if (!process.env.VERCEL) {
  require('dotenv').config();
}
const SUPABASE_URL=process.env.SUPABASE_URL;
const SUPABASE_KEY=process.env.SUPABASE_SERVICE_KEY;

const supabase=createClient(SUPABASE_URL, SUPABASE_KEY);

module.exports=supabase;
