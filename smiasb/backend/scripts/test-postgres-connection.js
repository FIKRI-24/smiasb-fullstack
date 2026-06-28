const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const {
  postgresPool,
  getPostgresConfig,
  hasPostgresEnv,
} = require('../config/postgres');

const importantTables = [
  'sekolah',
  'users',
  'instrumen',
  'soal',
  'bank_soal',
  'hasil_siswa',
  'jawaban_siswa',
  'chat_history',
  'activity_log',
];

async function countRows(tableName) {
  const result = await postgresPool.query(`SELECT COUNT(*)::int AS total FROM ${tableName}`);
  return result.rows[0].total;
}

async function main() {
  if (!hasPostgresEnv()) {
    console.log('PostgreSQL env belum tersedia. Isi PGHOST, PGPORT, PGUSER, PGPASSWORD, dan PGDATABASE terlebih dahulu.');
    console.log('Contoh database target: PGDATABASE=smiasb_postgres');
    return;
  }

  const config = getPostgresConfig();
  console.log('Menguji koneksi PostgreSQL...');
  console.log(`Target: ${config.user}@${config.host}:${config.port}/${config.database}`);

  const versionResult = await postgresPool.query('SELECT version() AS version');
  const tableCountResult = await postgresPool.query(`
    SELECT COUNT(*)::int AS total
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
  `);
  const foreignKeyResult = await postgresPool.query(`
    SELECT COUNT(*)::int AS total
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND constraint_type = 'FOREIGN KEY'
  `);
  const indexResult = await postgresPool.query(`
    SELECT COUNT(*)::int AS total
    FROM pg_indexes
    WHERE schemaname = 'public'
  `);

  const tableCounts = {};
  for (const tableName of importantTables) {
    tableCounts[tableName] = await countRows(tableName);
  }

  console.log('Versi PostgreSQL:', versionResult.rows[0].version);
  console.log('Jumlah tabel public:', tableCountResult.rows[0].total);
  console.log('Jumlah foreign key:', foreignKeyResult.rows[0].total);
  console.log('Jumlah index:', indexResult.rows[0].total);
  console.log('Jumlah data tabel penting:');
  for (const tableName of importantTables) {
    console.log(`- ${tableName}: ${tableCounts[tableName]}`);
  }
}

main()
  .catch((error) => {
    console.error('Gagal test koneksi PostgreSQL:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await postgresPool.end();
  });
