'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { createAppServer } = require('../server');

async function closeServer(server) {
  if (!server || !server.listening) return;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

async function startTestServer(options = {}) {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'organizat-'));
  const databaseFile = path.join(temporaryDirectory, 'invitations.json');
  const server = createAppServer({
    databaseFile,
    publicAppUrl: 'https://organiza.example',
    ...options
  });
  await server.ready;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    server,
    databaseFile,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    cleanup: async () => {
      await closeServer(server);
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
  };
}

function requestJson(baseUrl, route, method, body, headers = {}) {
  const url = new URL(route, baseUrl);
  const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const request = http.request(url, {
      method,
      agent: false,
      headers: payload ? {
        'Content-Type': 'application/json',
        'Content-Length': payload.length,
        ...headers
      } : headers
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const content = Buffer.concat(chunks).toString('utf8');
        let body = content;
        try {
          body = JSON.parse(content);
        } catch (error) {
          if (!(error instanceof SyntaxError)) return reject(error);
        }
        resolve({ status: response.statusCode, body });
      });
    });
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

function invitationPayload(capacity = 4) {
  return {
    clientEventId: 'event-test',
    event: {
      name: 'Barbacoa de prueba',
      type: 'Barbacoa',
      date: '2026-12-01',
      time: '14:00',
      location: 'Casa de prueba',
      description: '',
      badge: 'Evento privado',
      capacity,
      allowGuests: true
    },
    attendees: [{
      name: 'Organizadora',
      role: 'Organizador',
      status: 'Confirmado',
      color: '#c4d6c0'
    }],
    tasks: [{ name: 'Hielo', quantity: '2 bolsas', person: '', done: false }],
    dateOptions: [{ date: '2026-12-01', time: '14:00', votes: 1 }],
    expenses: []
  };
}

test('guests can join with an invite token and the roster survives a restart', async () => {
  const context = await startTestServer();
  let restartedServer;
  try {
    const created = await requestJson(context.baseUrl, '/api/events', 'POST', invitationPayload());
    assert.equal(created.status, 201);
    assert.match(created.body.inviteUrl, /^https:\/\/organiza\.example\/join\//);
    assert.match(created.body.ownerToken, /^[A-Za-z0-9_-]{32}$/);

    const token = created.body.inviteToken;
    const joined = await requestJson(context.baseUrl, `/api/invitations/${token}/join`, 'POST', { name: 'María López' });
    assert.equal(joined.status, 200);
    assert.equal(joined.body.attendees.length, 2);
    assert.equal(joined.body.attendees[1].status, 'Confirmado');

    restartedServer = createAppServer({
      databaseFile: context.databaseFile,
      publicAppUrl: 'https://organiza.example'
    });
    await restartedServer.ready;
    await new Promise(resolve => restartedServer.listen(0, '127.0.0.1', resolve));

    const invitation = await requestJson(
      `http://127.0.0.1:${restartedServer.address().port}`,
      `/api/invitations/${token}`,
      'GET'
    );
    assert.equal(invitation.status, 200);
    assert.equal(invitation.body.attendees[1].name, 'María López');
    assert.equal(invitation.body.tasks[0].name, 'Hielo');
  } finally {
    await closeServer(restartedServer);
    await context.cleanup();
  }
});

test('the health endpoint reports the local storage mode without database credentials', async () => {
  const context = await startTestServer();
  try {
    const health = await requestJson(context.baseUrl, '/api/health', 'GET');
    assert.deepEqual(health.body, { ok: true, database: 'json', authentication: false });
  } finally {
    await context.cleanup();
  }
});

test('the invitation prevents duplicate names and enforces the event capacity', async () => {
  const context = await startTestServer();
  try {
    const created = await requestJson(context.baseUrl, '/api/events', 'POST', invitationPayload(2));
    const token = created.body.inviteToken;

    assert.equal((await requestJson(context.baseUrl, `/api/invitations/${token}/join`, 'POST', { name: 'Invitada' })).status, 200);
    const duplicate = await requestJson(context.baseUrl, `/api/invitations/${token}/join`, 'POST', { name: 'Invitada' });
    assert.equal(duplicate.status, 409);

    const full = await requestJson(context.baseUrl, `/api/invitations/${token}/join`, 'POST', { name: 'Otra persona' });
    assert.equal(full.status, 409);
  } finally {
    await context.cleanup();
  }
});

test('an attendee can confirm additional adults and children', async () => {
  const context = await startTestServer();
  try {
    const created = await requestJson(context.baseUrl, '/api/events', 'POST', invitationPayload(10));
    const result = await requestJson(context.baseUrl, `/api/invitations/${created.body.inviteToken}/join`, 'POST', {
      name: 'Pepe',
      adults: 2,
      children: 3
    });
    assert.equal(result.status, 200);
    const pepe = result.body.attendees.find(person => person.name === 'Pepe');
    assert.equal(pepe.adults, 3);
    assert.equal(pepe.children, 3);
  } finally {
    await context.cleanup();
  }
});

test('the organizer can edit an attendee party without changing their name', async () => {
  const context = await startTestServer();
  try {
    const created = await requestJson(context.baseUrl, '/api/events', 'POST', invitationPayload(10));
    const joined = await requestJson(context.baseUrl, `/api/invitations/${created.body.inviteToken}/join`, 'POST', { name: 'Pepe', adults: 1, children: 0 });
    const pepe = joined.body.attendees.find(person => person.name === 'Pepe');
    const updated = await requestJson(context.baseUrl, `/api/invitations/${created.body.inviteToken}/attendees/${pepe.id}`, 'PATCH', {
      status: 'Confirmado', adults: 3, children: 2, name: 'Nombre cambiado'
    }, { 'X-Organizer-Token': created.body.ownerToken });
    const result = updated.body.attendees.find(person => person.id === pepe.id);
    assert.equal(result.name, 'Pepe');
    assert.equal(result.adults, 3);
    assert.equal(result.children, 2);
  } finally {
    await context.cleanup();
  }
});

test('the organizer can confirm another attendee while editing their party', async () => {
  const context = await startTestServer();
  try {
    const payload = invitationPayload(10);
    payload.attendees.push({ name: 'Pendiente', role: 'Participante', status: 'Pendiente', adults: 1, children: 0 });
    const created = await requestJson(context.baseUrl, '/api/events', 'POST', payload);
    const pending = (await requestJson(context.baseUrl, `/api/invitations/${created.body.inviteToken}`)).body.attendees.find(person => person.name === 'Pendiente');
    const updated = await requestJson(context.baseUrl, `/api/invitations/${created.body.inviteToken}/attendees/${pending.id}`, 'PATCH', {
      status: 'Confirmado', adults: 2, children: 1
    }, { 'X-Organizer-Token': created.body.ownerToken });
    const result = updated.body.attendees.find(person => person.id === pending.id);
    assert.equal(result.status, 'Confirmado');
    assert.equal(result.adults, 2);
    assert.equal(result.children, 1);
  } finally {
    await context.cleanup();
  }
});

test('the organizer can restrict additional adults and children', async () => {
  const context = await startTestServer();
  try {
    const payload = invitationPayload(10);
    payload.event.allowGuests = false;
    const created = await requestJson(context.baseUrl, '/api/events', 'POST', payload);
    const result = await requestJson(context.baseUrl, `/api/invitations/${created.body.inviteToken}/join`, 'POST', {
      name: 'Pepe',
      adults: 1,
      children: 1
    });
    assert.equal(result.status, 403);
    assert.match(result.body.error, /no permite añadir/i);
  } finally {
    await context.cleanup();
  }
});

test('an attendee can only edit their attendance and propose tasks', async () => {
  const context = await startTestServer();
  try {
    const created = await requestJson(context.baseUrl, '/api/events', 'POST', invitationPayload(10));
    const token = created.body.inviteToken;
    const joined = await requestJson(context.baseUrl, `/api/invitations/${token}/join`, 'POST', { name: 'Lucía', adults: 1, children: 1 });
    assert.match(joined.body.attendeeToken, /^[A-Za-z0-9_-]{32}$/);
    const lucia = joined.body.attendees.find(person => person.name === 'Lucía');
    const deniedDelete = await requestJson(context.baseUrl, `/api/invitations/${token}/attendees/${lucia.id}`, 'DELETE', undefined, { 'X-Attendee-Token': joined.body.attendeeToken });
    assert.equal(deniedDelete.status, 403);
    const cancelled = await requestJson(context.baseUrl, `/api/invitations/${token}/attendees/${lucia.id}`, 'PATCH', { status: 'Cancelado', adults: 2, children: 1 }, { 'X-Attendee-Token': joined.body.attendeeToken });
    assert.equal(cancelled.status, 200);
    const proposal = await requestJson(context.baseUrl, `/api/invitations/${token}/tasks/proposals`, 'POST', { name: 'Pan', quantity: '2 barras' }, { 'X-Attendee-Token': joined.body.attendeeToken });
    assert.equal(proposal.status, 201);
    const proposedTask = proposal.body.tasks.find(task => task.name === 'Pan');
    assert.equal(proposedTask.proposalStatus, 'proposed');
    const accepted = await requestJson(context.baseUrl, `/api/invitations/${token}/tasks/${proposedTask.id}`, 'PATCH', { action: 'approve' }, { 'X-Organizer-Token': created.body.ownerToken });
    assert.equal(accepted.body.tasks.find(task => task.id === proposedTask.id).proposalStatus, 'accepted');
    const organizerView = await requestJson(context.baseUrl, `/api/invitations/${token}`, 'GET', undefined, { 'X-Organizer-Token': created.body.ownerToken });
    assert.equal(organizerView.body.notifications.some(notification => notification.title.includes('cancelado')), true);
  } finally {
    await context.cleanup();
  }
});

test('group growth notices count confirmed people, not pending invitations', async () => {
  const context = await startTestServer();
  try {
    const payload = invitationPayload(20);
    payload.attendees.push(
      { name: 'Pendiente 1', role: 'Participante', status: 'Pendiente' },
      { name: 'Pendiente 2', role: 'Participante', status: 'Pendiente' },
      { name: 'Pendiente 3', role: 'Participante', status: 'Pendiente' },
      { name: 'Pendiente 4', role: 'Participante', status: 'Pendiente' }
    );
    const created = await requestJson(context.baseUrl, '/api/events', 'POST', payload);
    const token = created.body.inviteToken;
    for (const name of ['Ana', 'Luis', 'Marta']) {
      await requestJson(context.baseUrl, `/api/invitations/${token}/join`, 'POST', { name });
    }
    let invitation = await requestJson(context.baseUrl, `/api/invitations/${token}`, 'GET', undefined, { 'X-Organizer-Token': created.body.ownerToken });
    assert.equal(invitation.body.notifications.some(notification => notification.title === '¡El grupo crece!'), false);
    await requestJson(context.baseUrl, `/api/invitations/${token}/join`, 'POST', { name: 'Pablo' });
    invitation = await requestJson(context.baseUrl, `/api/invitations/${token}`, 'GET', undefined, { 'X-Organizer-Token': created.body.ownerToken });
    assert.equal(invitation.body.notifications.some(notification => notification.title === '¡El grupo crece!'), true);
  } finally {
    await context.cleanup();
  }
});

test('shared tasks, votes and expenses survive an invitation state update', async () => {
  const context = await startTestServer();
  try {
    const created = await requestJson(context.baseUrl, '/api/events', 'POST', invitationPayload());
    const token = created.body.inviteToken;
    const updated = await requestJson(context.baseUrl, `/api/invitations/${token}/state`, 'PATCH', {
      tasks: [{ name: 'Postre', quantity: '1 tarta', person: 'Organizadora', done: true }],
      dateOptions: [{ date: '2026-12-02', time: '15:00', votes: 3 }],
      expenses: [{ name: 'Tarta', amount: 24.5, person: 'Organizadora', date: 'Hoy' }]
    }, { 'X-Organizer-Token': created.body.ownerToken });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.tasks[0].name, 'Postre');
    assert.equal(updated.body.dateOptions[0].votes, 3);
    assert.equal(updated.body.expenses[0].amount, 24.5);

    const fetched = await requestJson(context.baseUrl, `/api/invitations/${token}`, 'GET');
    assert.equal(fetched.body.expenses[0].name, 'Tarta');
  } finally {
    await context.cleanup();
  }
});

test('only the assigned attendee or organizer can toggle a purchase', async () => {
  const context = await startTestServer();
  try {
    const created = await requestJson(context.baseUrl, '/api/events', 'POST', invitationPayload());
    const token = created.body.inviteToken;
    const lucia = await requestJson(context.baseUrl, `/api/invitations/${token}/join`, 'POST', { name: 'Lucía' });
    const ana = await requestJson(context.baseUrl, `/api/invitations/${token}/join`, 'POST', { name: 'Ana' });
    const task = (await requestJson(context.baseUrl, `/api/invitations/${token}`)).body.tasks[0];

    const claimed = await requestJson(context.baseUrl, `/api/invitations/${token}/tasks/${task.id}`, 'PATCH', { action: 'claim' }, { 'X-Attendee-Token': lucia.body.attendeeToken });
    assert.equal(claimed.body.tasks[0].person, 'Lucía');

    const denied = await requestJson(context.baseUrl, `/api/invitations/${token}/tasks/${task.id}`, 'PATCH', { action: 'purchase' }, { 'X-Attendee-Token': ana.body.attendeeToken });
    assert.equal(denied.status, 403);

    const purchased = await requestJson(context.baseUrl, `/api/invitations/${token}/tasks/${task.id}`, 'PATCH', { action: 'purchase' }, { 'X-Attendee-Token': lucia.body.attendeeToken });
    assert.equal(purchased.body.tasks[0].purchased, true);
    assert.equal(purchased.body.tasks[0].done, true);

    const unpurchased = await requestJson(context.baseUrl, `/api/invitations/${token}/tasks/${task.id}`, 'PATCH', { action: 'purchase' }, { 'X-Attendee-Token': lucia.body.attendeeToken });
    assert.equal(unpurchased.body.tasks[0].purchased, false);
    assert.equal(unpurchased.body.tasks[0].done, false);
  } finally {
    await context.cleanup();
  }
});

test('the organizer can remove a confirmed or pending attendee with authorization', async () => {
  const context = await startTestServer();
  try {
    const payload = invitationPayload(4);
    payload.attendees.push({ name: 'Pendiente', role: 'Participante', status: 'Pendiente', color: '#d9c2cf' });
    const created = await requestJson(context.baseUrl, '/api/events', 'POST', payload);
    const token = created.body.inviteToken;
    const joined = await requestJson(context.baseUrl, `/api/invitations/${token}/join`, 'POST', { name: 'Confirmada' });
    assert.equal(joined.status, 200);
    const invitation = await requestJson(context.baseUrl, `/api/invitations/${token}`, 'GET');
    const pendingId = invitation.body.attendees.find(person => person.status === 'Pendiente').id;
    const confirmedId = invitation.body.attendees.find(person => person.name === 'Confirmada').id;

    const deletedPending = await requestJson(context.baseUrl, `/api/invitations/${token}/attendees/${pendingId}`, 'DELETE', undefined, {
      'X-Organizer-Token': created.body.ownerToken
    });
    assert.equal(deletedPending.status, 200);
    assert.equal(deletedPending.body.attendees.some(person => person.id === pendingId), false);

    const deletedConfirmed = await requestJson(context.baseUrl, `/api/invitations/${token}/attendees/${confirmedId}`, 'DELETE', undefined, {
      'X-Organizer-Token': created.body.ownerToken
    });
    assert.equal(deletedConfirmed.status, 200);
    assert.equal(deletedConfirmed.body.attendees.some(person => person.id === confirmedId), false);
  } finally {
    await context.cleanup();
  }
});

test('the organizer can delete an invitation but an unauthorized request cannot', async () => {
  const context = await startTestServer();
  try {
    const created = await requestJson(context.baseUrl, '/api/events', 'POST', invitationPayload());
    const token = created.body.inviteToken;

    const unauthorized = await requestJson(context.baseUrl, `/api/invitations/${token}`, 'DELETE', undefined, {
      'X-Organizer-Token': 'invalid-token'
    });
    assert.equal(unauthorized.status, 403);

    const deleted = await requestJson(context.baseUrl, `/api/invitations/${token}`, 'DELETE', undefined, {
      'X-Organizer-Token': created.body.ownerToken
    });
    assert.equal(deleted.status, 200);

    const missing = await requestJson(context.baseUrl, `/api/invitations/${token}`, 'GET');
    assert.equal(missing.status, 404);
  } finally {
    await context.cleanup();
  }
});

test('only the organizer token can update shared event state', async () => {
  const context = await startTestServer();
  try {
    const created = await requestJson(context.baseUrl, '/api/events', 'POST', invitationPayload());
    const token = created.body.inviteToken;
    const denied = await requestJson(context.baseUrl, `/api/invitations/${token}/state`, 'PATCH', {
      tasks: [],
      dateOptions: [],
      expenses: []
    });
    assert.equal(denied.status, 403);
  } finally {
    await context.cleanup();
  }
});

test('invite routes serve the app and its relative assets', async () => {
  const context = await startTestServer();
  try {
    const token = 'a'.repeat(32);
    const page = await requestJson(context.baseUrl, `/join/${token}`, 'GET');
    assert.equal(page.status, 200);
    assert.match(page.body, /id="join-form"/);
    const script = await requestJson(context.baseUrl, '/join/app.js', 'GET');
    const styles = await requestJson(context.baseUrl, '/join/styles.css', 'GET');
    assert.equal(script.status, 200);
    assert.equal(styles.status, 200);
  } finally {
    await context.cleanup();
  }
});
