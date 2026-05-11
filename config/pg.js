const postgres = require('postgres');

if (!process.env.VERCEL) {
  require('dotenv').config();
}

// We accept either DATABASE_URL (existing, recommended) or SUPABASE_DB_URL
// so deployments can use whichever secret name is already configured.
const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!connectionString) {
  console.warn('[pg] DATABASE_URL is not set — direct Postgres client disabled, falling back to Supabase JS.');
}

// Supabase pooler at port 6543 runs in transaction-pooling mode.
// Prepared statements are NOT supported there because each query may land
// on a different backend connection, so we must disable them.
//
// Pool sizing: max open connections *per Node process* (per ECS task replica).
// Rough cap: (PG_POOL_MAX × running tasks) should stay well below your Supabase
// pooler limit (check Dashboard → Database). If you scale tasks up, lower
// PG_POOL_MAX per task or raise Supabase compute.
const sql = connectionString
  ? postgres(connectionString, {
      max: Number(process.env.PG_POOL_MAX || 30),
      idle_timeout: 20,
      max_lifetime: 60 * 30,
      prepare: false,
      ssl: 'require',
      connection: {
        application_name: 'zero-olympiad-api',
      },
    })
  : null;

module.exports = sql;
