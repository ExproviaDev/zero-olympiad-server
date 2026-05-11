const sql = require('../config/pg');

async function main() {
  if (!sql) {
    console.error('SQL client not initialized. DATABASE_URL missing.');
    process.exit(1);
  }

  try {
    const start = Date.now();
    const rows = await sql`SELECT NOW() AS server_time, current_database() AS db`;
    const elapsed = Date.now() - start;

    console.log('Connected!');
    console.log('  db          :', rows[0].db);
    console.log('  server_time :', rows[0].server_time);
    console.log('  query_ms    :', elapsed);

    const t2 = Date.now();
    const lb = await sql`
      SELECT COUNT(*) AS n FROM round_performances WHERE round_number = 1
    `;
    console.log('  round_1 rows:', lb[0].n, `(${Date.now() - t2}ms)`);

    process.exit(0);
  } catch (err) {
    console.error('Connection failed:', err.message);
    console.error(err);
    process.exit(1);
  }
}

main();
