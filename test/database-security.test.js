'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { secureDatabaseTables } = require('../database-security');

test('la configuración RLS se ejecuta en una conexión y la libera', async () => {
  const calls = [];
  const client = {
    query: async sql => { calls.push(sql); },
    release: () => { calls.push('RELEASE'); }
  };
  await secureDatabaseTables({ connect: async () => client });
  assert.equal(calls.length, 2);
  const sql = calls[0];
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /COMMIT;/);
  for (const table of ['organizers', 'organizer_sessions', 'password_reset_codes', 'invitation_events', 'push_subscriptions']) {
    assert.ok(sql.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`));
  }
  assert.match(sql, /FROM PUBLIC/);
  assert.match(sql, /ARRAY\['anon', 'authenticated'\]/);
  assert.doesNotMatch(sql, /CREATE POLICY|DISABLE ROW LEVEL SECURITY|FORCE ROW LEVEL SECURITY/);
  assert.equal(calls[1], 'RELEASE');
});

test('un fallo al aplicar la seguridad revierte la transacción sin ocultar el error', async () => {
  const denied = new Error('permission denied');
  const calls = [];
  const client = {
    query: async sql => { calls.push(sql); if (sql !== 'ROLLBACK') throw denied; },
    release: () => { calls.push('RELEASE'); }
  };
  await assert.rejects(secureDatabaseTables({ connect: async () => client }), error => error === denied);
  assert.deepEqual(calls.slice(1), ['ROLLBACK', 'RELEASE']);
});

test('un fallo adicional del rollback no sustituye el error de configuración original', async () => {
  const denied = new Error('original');
  let released = false;
  const client = {
    query: async sql => { throw sql === 'ROLLBACK' ? new Error('connection lost') : denied; },
    release: () => { released = true; }
  };
  await assert.rejects(secureDatabaseTables({ connect: async () => client }), error => error === denied);
  assert.equal(released, true);
});
