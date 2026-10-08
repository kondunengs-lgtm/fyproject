/**
 * Data tier access.
 *
 * The project is documented on MySQL 8 (Chapter Three, Table 3.6) and MySQL is
 * the default driver. A SQLite driver is included so the system can be started
 * and demonstrated on a machine with no database server installed; both drivers
 * accept the same parameterised SQL with `?` placeholders, so no query in the
 * application changes between them.
 *
 * Every statement in this project goes through query() or execute(). Neither
 * function ever concatenates a user value into SQL, which is the injection
 * protection required by NFR-04.
 */
const DRIVER = (process.env.DB_DRIVER || 'mysql').toLowerCase();

let mysqlPool = null;
let sqliteDb = null;

async function init() {
  if (DRIVER === 'mysql') {
    const mysql = require('mysql2/promise');
    mysqlPool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'online_learning',
      waitForConnections: true,
      connectionLimit: 10,
      charset: 'utf8mb4'
    });
    const conn = await mysqlPool.getConnection();
    conn.release();
  } else {
    const { DatabaseSync } = require('node:sqlite');
    const path = require('path');
    const file = process.env.SQLITE_FILE || path.join(__dirname, '..', 'db', 'online_learning.sqlite');
    sqliteDb = new DatabaseSync(file);
    sqliteDb.exec('PRAGMA foreign_keys = ON');
  }
}

/** Run a SELECT. Returns an array of row objects. */
async function query(sql, params = []) {
  if (DRIVER === 'mysql') {
    const [rows] = await mysqlPool.execute(sql, params);
    return rows;
  }
  return sqliteDb.prepare(sql).all(...params).map((r) => ({ ...r }));
}

/** Run an INSERT, UPDATE or DELETE. Returns { insertId, affectedRows }. */
async function execute(sql, params = []) {
  if (DRIVER === 'mysql') {
    const [result] = await mysqlPool.execute(sql, params);
    return { insertId: result.insertId, affectedRows: result.affectedRows };
  }
  const result = sqliteDb.prepare(sql).run(...params);
  return { insertId: Number(result.lastInsertRowid), affectedRows: result.changes };
}

/** Run a SELECT expected to return one row, or undefined. */
async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0];
}

/** Run raw multi-statement SQL (used only by the setup script). */
async function runScript(sql) {
  if (DRIVER === 'mysql') {
    const mysql = require('mysql2/promise');
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      multipleStatements: true
    });
    await conn.query(sql);
    await conn.end();
    return;
  }
  sqliteDb.exec(sql);
}

module.exports = { DRIVER, init, query, execute, one, runScript };
