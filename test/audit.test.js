'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { createAppServer } = require('../server');

async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'organizat-audit-'));
  const databaseFile = path.join(directory, 'events.json');
  let server;
  let base;
  const start = async () => {
    server = createAppServer({ databaseFile });
    await server.ready;
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  };
  await start();
  const request = (route, method = 'GET', body, headers = {}) => new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = http.request(new URL(route, base), { method, agent: false, headers: {
      ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}), ...headers
    } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        try { resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }); }
        catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
  const created = await request('/api/events', 'POST', {
    clientEventId: 'audit-event', event: { name: 'Auditoría', type: 'Comida', date: '2026-12-01', time: '14:00', location: 'Prueba', description: '', badge: 'Prueba', capacity: 20, allowGuests: true },
    attendees: [{ name: 'Organizador', role: 'Organizador', status: 'Confirmado' }], tasks: [{ name: 'Hielo', quantity: '2 bolsas', person: '', done: false }], dateOptions: [{ date: '2026-12-01', time: '14:00', votes: 0 }], expenses: []
  });
  assert.equal(created.status, 201);
  const route = `/api/invitations/${created.body.inviteToken}`;
  const joined = await request(`${route}/join`, 'POST', { name: 'Familia', adults: 1, children: 1 });
  const guest = { 'X-Attendee-Token': joined.body.attendeeToken };
  const organizer = { 'X-Organizer-Token': created.body.ownerToken };
  return { request, route, guest, organizer, ownerToken: created.body.ownerToken,
    restart: async () => { await new Promise(resolve => server.close(resolve)); await start(); },
    cleanup: async () => { await new Promise(resolve => server.close(resolve)); await fs.rm(directory, { recursive: true, force: true }); }
  };
}

test('los tickets de participantes persisten y una sincronización antigua no los borra', async () => {
  const f = await fixture();
  try {
    const before = (await f.request(f.route, 'GET', undefined, f.guest)).body;
    const person = before.attendees.find(item => item.name === 'Familia');
    const added = await f.request(`${f.route}/expenses`, 'POST', { name: 'Compra', amount: 10.01, person: person.name, personId: person.id, date: '2026-11-20' }, f.guest);
    assert.equal(added.status, 201);
    assert.ok(added.body.expenses[0].id);
    assert.equal(added.body.expenses[0].personId, person.id);
    const expenseId = added.body.expenses[0].id;
    const synced = await f.request(`${f.route}/state`, 'PATCH', { tasks: before.tasks, dateOptions: before.dateOptions, expenses: before.expenses }, f.organizer);
    assert.equal(synced.status, 200);
    assert.equal(synced.body.expenses.find(item => item.id === expenseId).amount, 10.01);
    await f.restart();
    const loaded = await f.request(f.route, 'GET', undefined, f.guest);
    assert.equal(loaded.body.expenses.find(item => item.id === expenseId).amount, 10.01);
  } finally { await f.cleanup(); }
});

test('se rechazan gastos ajenos y cambios inválidos sin dejar mutaciones parciales', async () => {
  const f = await fixture();
  try {
    const before = (await f.request(f.route, 'GET', undefined, f.guest)).body;
    const owner = before.attendees[0];
    assert.equal((await f.request(`${f.route}/expenses`, 'POST', { name: 'Ajeno', amount: 5, person: owner.name, personId: owner.id }, f.guest)).status, 403);
    assert.equal((await f.request(`${f.route}/expenses`, 'POST', { name: 'Sin permiso', amount: 5, person: owner.name, personId: owner.id })).status, 403);
    const rejected = await f.request(`${f.route}/state`, 'PATCH', { tasks: [{ name: 'No debe guardarse', quantity: '1', person: 'Desconocido', done: false }], dateOptions: before.dateOptions, expenses: [] }, f.organizer);
    assert.equal(rejected.status, 400);
    const after = (await f.request(f.route, 'GET', undefined, f.guest)).body;
    assert.deepEqual(after.tasks, before.tasks);
    assert.deepEqual(after.expenses, before.expenses);
  } finally { await f.cleanup(); }
});

test('un historial lleno mantiene leídas las acciones propias sin filtrar credenciales', async () => {
  const f = await fixture();
  try {
    const state = (await f.request(f.route)).body;
    const task = state.tasks[0];
    for (let index = 0; index < 33; index += 1) {
      const updated = await f.request(`${f.route}/tasks/${task.id}`, 'PATCH', { person: index % 2 ? '' : 'Organizador' }, f.organizer);
      assert.equal(updated.status, 200);
    }
    const own = await f.request(`${f.route}/state`, 'PATCH', { tasks: [...state.tasks, { name: 'Nueva propia', quantity: '1', person: '', done: false }], dateOptions: state.dateOptions, expenses: [] }, f.organizer);
    assert.equal(own.status, 200);
    const latest = own.body.notifications.find(item => item.detail.includes('Nueva propia'));
    assert.ok(latest.readBy.includes(`organizer:${f.ownerToken}`));
    const shared = await f.request(f.route, 'GET', undefined, f.guest);
    assert.ok(!JSON.stringify(shared.body).includes(f.ownerToken));
    const theirs = shared.body.notifications.find(item => item.id === latest.id);
    assert.deepEqual(theirs.readBy, []);
    const message = await f.request(`${f.route}/chat`, 'POST', { text: 'Mensaje propio del organizador' }, f.organizer);
    assert.equal(message.status, 201);
    const chat = await f.request(`${f.route}/chat`, 'GET', undefined, f.guest);
    assert.ok(!JSON.stringify(chat.body).includes(f.ownerToken));
    assert.equal(chat.body.chatMessages.at(-1).text, 'Mensaje propio del organizador');
  } finally { await f.cleanup(); }
});
