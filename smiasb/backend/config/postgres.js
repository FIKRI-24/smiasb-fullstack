const { Pool } = require('pg');
require('dotenv').config();

const POSTGRES_ENV_KEYS = [
  'PGHOST',
  'PGPORT',
  'PGUSER',
  'PGPASSWORD',
  'PGDATABASE',
  'PGSSL',
  'POSTGRES_HOST',
  'POSTGRES_PORT',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_DB',
  'POSTGRES_SSL',
];

function parseBoolean(value) {
  if (value === undefined || value === null || value === '') return false;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function parsePort(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hasPostgresEnv() {
  return POSTGRES_ENV_KEYS.some((key) => process.env[key] !== undefined && process.env[key] !== '');
}

function getPostgresConfig() {
  const useSsl = parseBoolean(process.env.PGSSL || process.env.POSTGRES_SSL);

  return {
    host: process.env.PGHOST || process.env.POSTGRES_HOST || 'localhost',
    port: parsePort(process.env.PGPORT || process.env.POSTGRES_PORT, 5432),
    user: process.env.PGUSER || process.env.POSTGRES_USER || 'postgres',
    password: process.env.PGPASSWORD ?? process.env.POSTGRES_PASSWORD ?? '',
    database: process.env.PGDATABASE || process.env.POSTGRES_DB || 'smiasb_postgres',
    max: parsePort(process.env.PG_POOL_MAX || process.env.POSTGRES_POOL_MAX, 10),
    connectionTimeoutMillis: parsePort(
      process.env.PG_CONNECTION_TIMEOUT_MS || process.env.POSTGRES_CONNECTION_TIMEOUT_MS,
      5000
    ),
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  };
}

const postgresPool = new Pool(getPostgresConfig());

async function testPostgresConnection() {
  const client = await postgresPool.connect();
  try {
    const result = await client.query('SELECT version() AS version');
    return result.rows[0].version;
  } finally {
    client.release();
  }
}

module.exports = {
  postgresPool,
  getPostgresConfig,
  hasPostgresEnv,
  testPostgresConnection,
};
