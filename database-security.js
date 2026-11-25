'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

async function secureDatabaseTables(pool) {
  const sql = await fs.readFile(path.join(__dirname, 'sql', 'enable-rls.sql'), 'utf8');
  const client = await pool.connect();
  try {
    // El archivo incluye BEGIN/COMMIT y debe ejecutarse en una sola conexión.
    await client.query(sql);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { secureDatabaseTables };
