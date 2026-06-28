const mysql = require('mysql2/promise');
require('dotenv').config();
const { postgresPool, testPostgresConnection } = require('./postgres');

function getDbClient() {
  const client = String(process.env.DB_CLIENT || '').trim().toLowerCase();
  return client === 'postgres' || client === 'postgresql' || client === 'pg'
    ? 'postgres'
    : 'mysql';
}

const dbClient = getDbClient();
const isPostgres = dbClient === 'postgres';

const mysqlPool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'smiasb_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+07:00',
});

function decorateMysqlResult(result) {
  const [rows] = result;

  result.rows = rows;
  result.rowCount = Array.isArray(rows) ? rows.length : rows?.affectedRows ?? 0;
  result.insertId = rows?.insertId;

  return result;
}

const mysqlAdapter = {
  query(sql, params) {
    return mysqlPool.query(sql, params).then(decorateMysqlResult);
  },
  execute(sql, params) {
    return mysqlPool.execute(sql, params).then(decorateMysqlResult);
  },
  getConnection() {
    return mysqlPool.getConnection();
  },
  end() {
    return mysqlPool.end();
  },
  raw: mysqlPool,
};

const postgresAdapter = {
  query(sql, params) {
    return postgresPool.query(sql, params);
  },
  execute(sql, params) {
    return postgresPool.query(sql, params);
  },
  connect(...args) {
    return postgresPool.connect(...args);
  },
  end() {
    return postgresPool.end();
  },
  raw: postgresPool,
};

const pool = isPostgres ? postgresAdapter : mysqlAdapter;

function dbPlaceholder(position) {
  return isPostgres ? `$${position}` : '?';
}

function dbPlaceholders(count, startAt = 1) {
  return Array.from({ length: count }, (_, index) => dbPlaceholder(startAt + index));
}

function addParam(params, value) {
  params.push(value);
  return dbPlaceholder(params.length);
}

async function testConnection() {
  try {
    if (isPostgres) {
      await testPostgresConnection();
      console.log('Database PostgreSQL terhubung');
      return;
    }

    const conn = await mysqlPool.getConnection();
    console.log('Database MySQL terhubung');
    conn.release();
  } catch (err) {
    console.error('Gagal koneksi database:', err.message);
    process.exit(1);
  }
}

module.exports = {
  pool,
  testConnection,
  getDbClient,
  dbClient,
  isPostgres,
  isMysql: !isPostgres,
  dbPlaceholder,
  dbPlaceholders,
  addParam,
};
