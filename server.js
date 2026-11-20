'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const {
  HttpError,
  Invitation,
  ChatMessage,
  Photo,
  cleanText,
  isValidDate,
  isValidTime,
  normalizeImageData
} = require('./models');

const rootDirectory = __dirname;
const envFilePath = path.join(rootDirectory, '.env');
if (fsSync.existsSync(envFilePath)) {
  for (const line of fsSync.readFileSync(envFilePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[1].startsWith('#') || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
const defaultDatabaseFile = path.join(rootDirectory, 'data', 'invitations.json');
const maximumRequestBytes = 6 * 1024 * 1024;
const sessionDurationSeconds = 60 * 60 * 24 * 30;
const allowedStaticFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/eventos.png', ['eventos.png', 'image/png']],
  ['/avatars.png', ['avatars.png', 'image/png']],
  ['/manifest.webmanifest', ['manifest.webmanifest', 'application/manifest+json; charset=utf-8']],
  ['/sw.js', ['sw.js', 'text/javascript; charset=utf-8']],
  ['/icon.svg', ['icon.svg', 'image/svg+xml']]
]);

const normalizeAttendees = Invitation.attendees;
const normalizeTasks = Invitation.tasks;
const normalizeDateOptions = Invitation.dateOptions;
const normalizeExpenses = Invitation.expenses;
const normalizeChatMessages = Invitation.chatMessages;
const normalizePhotos = Invitation.photos;
const attendeeHeadcount = Invitation.headcount;

function publicAttendees(attendees) {
  return attendees.map(({ email, privateToken, accountUserId, ...person }) => person);
}

function notificationViewerKey(record, request, attendeeOverride = null) {
  if (request && request.headers['x-organizer-token'] === record.ownerToken) return `organizer:${record.ownerToken}`;
  const attendee = attendeeOverride || attendeeForRequest(record, request);
  return attendee ? `attendee:${attendee.id}` : '';
}

function attendeeForRequest(record, request) {
  const attendeeToken = request?.headers?.['x-attendee-token'];
  const authenticatedUser = request?.authenticatedUser;
  return record.attendees.find(person => person.privateToken === attendeeToken)
    || (authenticatedUser && record.attendees.find(person =>
      person.accountUserId === authenticatedUser.id || person.email === authenticatedUser.email
    ));
}

function unreadNotifications(notifications, viewerKey) {
  if (!viewerKey) return notifications.length;
  return notifications.filter(notification => !Array.isArray(notification.readBy) || !notification.readBy.includes(viewerKey)).length;
}

function notificationsForViewer(record, viewerKey) {
  const organizer = viewerKey.startsWith('organizer:');
  const attendeeId = viewerKey.startsWith('attendee:') ? viewerKey.slice('attendee:'.length) : '';
  return (record.notifications || []).filter(notification =>
    (notification.audience === 'all' && !notification.recipientId)
    || (organizer && notification.audience === 'organizer')
    || (attendeeId && notification.recipientId === attendeeId)
  );
}

function publicInvitation(record, request) {
  const isOrganizer = request && request.headers['x-organizer-token'] && request.headers['x-organizer-token'] === record.ownerToken;
  const viewer = attendeeForRequest(record, request);
  const viewerKey = notificationViewerKey(record, request, viewer);
  const notifications = (record.notifications || []).filter(notification =>
    (notification.audience === 'all' && !notification.recipientId)
    || (isOrganizer && notification.audience === 'organizer')
    || (viewer && notification.recipientId === viewer.id)
  );
  return {
    event: record.event,
    attendees: publicAttendees(record.attendees),
    tasks: record.tasks,
    dateOptions: record.dateOptions,
    expenses: record.expenses || [],
    notifications,
    unreadNotifications: unreadNotifications(notifications, viewerKey),
    ...(viewer ? { viewerAttendeeId: viewer.id } : {})
  };
}

function normalizeEmail(value) {
  if (typeof value !== 'string') throw new HttpError(400, 'El correo electrónico no es válido.');
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new HttpError(400, 'Introduce un correo electrónico válido.');
  }
  return email;
}

function validatePassword(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 200) {
    throw new HttpError(400, 'La contraseña debe tener entre 8 y 200 caracteres.');
  }
  return value;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) return reject(error);
      resolve(`scrypt:${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

function verifyPassword(password, storedHash) {
  const [algorithm, salt, expectedHex] = String(storedHash || '').split(':');
  if (algorithm !== 'scrypt' || !salt || !/^[a-f\d]{128}$/i.test(expectedHex || '')) return Promise.resolve(false);
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (error, derivedKey) => {
      if (error) return reject(error);
      const expected = Buffer.from(expectedHex, 'hex');
      resolve(expected.length === derivedKey.length && crypto.timingSafeEqual(expected, derivedKey));
    });
  });
}

function parseCookies(request) {
  return String(request.headers.cookie || '').split(';').reduce((cookies, part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return cookies;
    cookies[part.slice(0, separator).trim()] = decodeURIComponent(part.slice(separator + 1).trim());
    return cookies;
  }, {});
}

function hashSessionToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>\"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[character]));
}

function sendResendEmail({ apiKey, from, to, subject, html }) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify({ from, to: [to], subject, html }));
    const emailRequest = https.request({ hostname: 'api.resend.com', path: '/emails', method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Content-Length': body.length } }, response => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { responseBody += chunk; });
      response.on('end', () => response.statusCode >= 200 && response.statusCode < 300 ? resolve() : reject(new Error(`Resend respondió ${response.statusCode}: ${responseBody.slice(0, 300)}`)));
    });
    emailRequest.on('error', reject);
    emailRequest.end(body);
  });
}

function sessionCookie(token, maxAge = sessionDurationSeconds) {
  return `organizat_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}`;
}

async function readJsonBody(request) {
  if (!String(request.headers['content-type'] || '').toLowerCase().includes('application/json')) {
    throw new HttpError(415, 'Se esperaba una solicitud JSON.');
  }
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > maximumRequestBytes) throw new HttpError(413, 'La solicitud es demasiado grande.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) throw new HttpError(400, 'El JSON de la solicitud no es válido.');
    throw error;
  }
}

function sendJson(response, status, value, headers = {}) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  response.end(JSON.stringify(value));
}

function getPublicBaseUrl(request, configuredBaseUrl) {
  if (configuredBaseUrl) return configuredBaseUrl;
  const protocol = String(request.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  const host = request.headers.host;
  if (!['http', 'https'].includes(protocol) || !host || /[\s/\\]/.test(host)) {
    throw new HttpError(400, 'No se pudo determinar la dirección pública de la aplicación.');
  }
  return `${protocol}://${host}`;
}

function createEventRecord(body, ownerUserId = null) {
  return Invitation.create(body, ownerUserId);
/*
  if (!body || typeof body !== 'object' || !/^[A-Za-z0-9_-]{1,80}$/.test(body.clientEventId || '')) {
    throw new HttpError(400, 'El identificador del evento no es válido.');
  }
  const source = body.event;
  if (!source || typeof source !== 'object' || !isValidDate(source.date)) {
    throw new HttpError(400, 'Los datos del evento no son válidos.');
  }
  const capacity = source.capacity === undefined ? 200 : Number(source.capacity);
  if (!Number.isInteger(capacity) || capacity < 2 || capacity > 200) {
    throw new HttpError(400, 'El aforo debe estar entre 2 y 200 personas.');
  }
  const attendees = normalizeAttendees(body.attendees);
  if (!attendees.length || attendeeHeadcount(attendees) > capacity) {
    throw new HttpError(400, 'El número inicial de asistentes supera el aforo.');
  }
  if (ownerUserId) attendees[0].accountUserId = ownerUserId;
  const time = source.time === undefined ? '14:00' : source.time;
  if (!isValidTime(time)) throw new HttpError(400, 'La hora del evento no es válida.');
  const event = {
    id: body.clientEventId,
    name: cleanText(source.name, 'El nombre del evento', 60),
    type: cleanText(source.type, 'El tipo de evento', 40),
    date: source.date,
    time,
    location: cleanText(source.location, 'El lugar', 80),
    description: cleanText(source.description || '', 'La descripción', 160, false),
    badge: cleanText(source.badge || 'Evento privado', 'La etiqueta', 40, false) || 'Evento privado',
    capacity,
    allowGuests: source.allowGuests === true,
    allowGuestSharing: source.allowGuestSharing === true,
    imageIndex: Number.isInteger(source.imageIndex) && source.imageIndex >= 0 && source.imageIndex < 9 ? source.imageIndex : 0,
    imageData: normalizeImageData(source.imageData, 'La imagen del evento')
  };
  return {
    id: crypto.randomBytes(16).toString('hex'),
    clientEventId: body.clientEventId,
    token: crypto.randomBytes(24).toString('base64url'),
    ownerToken: crypto.randomBytes(24).toString('base64url'),
    ownerUserId,
    event,
    attendees,
    tasks: normalizeTasks(body.tasks),
    dateOptions: normalizeDateOptions(body.dateOptions),
    expenses: normalizeExpenses(body.expenses || []),
    chatMessages: [],
    photos: [],
    notifications: [],
    createdAt: new Date().toISOString()
  };
*/
}

function createAppServer(options = {}) {
  const databaseFile = options.databaseFile || defaultDatabaseFile;
  const databaseUrl = options.databaseUrl || process.env.DATABASE_URL || '';
  const separateDatabaseConfig = process.env.PGHOST && process.env.PGPASSWORD ? {
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE || 'postgres',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD
  } : null;
  const databaseConfig = separateDatabaseConfig || (databaseUrl ? { connectionString: databaseUrl } : null);
  let pool = null;
  if (databaseConfig) {
    const { Pool } = require('pg');
    pool = new Pool({
      ...databaseConfig,
      connectionTimeoutMillis: 10000,
      query_timeout: 10000,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
    });
  }
  let webpush = null;
  try { webpush = require('web-push'); } catch (error) { console.warn('web-push no está instalado; las notificaciones push quedan desactivadas.'); }
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:organizat@example.com';
  if (webpush && vapidPublicKey && vapidPrivateKey) webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const resendApiKey = process.env.RESEND_API_KEY || '';
  const emailFrom = process.env.EMAIL_FROM || '';

  async function getAuthenticatedUser(request) {
    if (!pool) return null;
    const rawToken = parseCookies(request).organizat_session;
    if (!rawToken) return null;
    const result = await pool.query(`
      SELECT o.id, o.email, o.name, o.avatar
      FROM organizer_sessions s
      JOIN organizers o ON o.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > NOW()
    `, [hashSessionToken(rawToken)]);
    return result.rows[0] || null;
  }

  async function createSession(userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    await pool.query(
      'INSERT INTO organizer_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'30 days\')',
      [hashSessionToken(token), userId]
    );
    return token;
  }

  function organizerEvent(record, request, viewerKey = '') {
    const visibleNotifications = notificationsForViewer(record, viewerKey);
    const baseUrl = getPublicBaseUrl(request, configuredBaseUrl);
    return {
      ...record.event,
      id: record.event.id || record.clientEventId,
      inviteToken: record.token,
      inviteUrl: `${baseUrl}/join/${record.token}`,
      ownerToken: record.ownerToken,
      attendees: publicAttendees(record.attendees),
      tasks: record.tasks,
      dateOptions: record.dateOptions,
      expenses: record.expenses || [],
      notifications: visibleNotifications,
      unreadNotifications: unreadNotifications(visibleNotifications, viewerKey)
    };
  }

function eventForAuthenticatedUser(record, request, user) {
  if (record.ownerUserId === user.id) return organizerEvent(record, request, `organizer:${record.ownerToken}`);
  const attendee = record.attendees.find(person => person.accountUserId === user.id);
  if (!attendee) return null;
  const event = organizerEvent(record, request, `attendee:${attendee.id}`);
  const { ownerToken, ...attendeeEvent } = event;
  return {
    ...attendeeEvent,
    viewerAttendeeId: attendee.id,
    viewerAttendeeToken: attendee.privateToken
  };
}
  const configuredUrl = options.publicAppUrl || process.env.PUBLIC_APP_URL || '';
  let configuredBaseUrl = null;
  if (configuredUrl) {
    const parsedUrl = new URL(configuredUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('PUBLIC_APP_URL debe usar HTTP o HTTPS.');
    }
    configuredBaseUrl = parsedUrl.origin;
  }

  let records = [];
  let startupDatabaseError = null;
  let mutationQueue = Promise.resolve();

  async function loadStore() {
    if (pool) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS organizers (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          avatar TEXT NOT NULL DEFAULT '0',
          created_at TIMESTAMPTZ NOT NULL
        )
      `);
      await pool.query("ALTER TABLE organizers ADD COLUMN IF NOT EXISTS avatar TEXT NOT NULL DEFAULT '0'");
      await pool.query(`
        CREATE TABLE IF NOT EXISTS organizer_sessions (
          token_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
          expires_at TIMESTAMPTZ NOT NULL
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS password_reset_codes (
          id BIGSERIAL PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
          code_hash TEXT NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          used_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS invitation_events (
          id TEXT PRIMARY KEY,
          client_event_id TEXT NOT NULL UNIQUE,
          owner_user_id TEXT REFERENCES organizers(id) ON DELETE SET NULL,
          token TEXT NOT NULL UNIQUE,
          owner_token TEXT,
          event JSONB NOT NULL,
          attendees JSONB NOT NULL,
          tasks JSONB NOT NULL,
          date_options JSONB NOT NULL,
          expenses JSONB NOT NULL DEFAULT '[]'::jsonb,
          chat_messages JSONB NOT NULL DEFAULT '[]'::jsonb,
          photos JSONB NOT NULL DEFAULT '[]'::jsonb,
          notifications JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL
        )
      `);
      await pool.query('ALTER TABLE invitation_events ADD COLUMN IF NOT EXISTS owner_user_id TEXT REFERENCES organizers(id) ON DELETE SET NULL');
      await pool.query("ALTER TABLE invitation_events ADD COLUMN IF NOT EXISTS notifications JSONB NOT NULL DEFAULT '[]'::jsonb");
      await pool.query("ALTER TABLE invitation_events ADD COLUMN IF NOT EXISTS chat_messages JSONB NOT NULL DEFAULT '[]'::jsonb");
      await pool.query("ALTER TABLE invitation_events ADD COLUMN IF NOT EXISTS photos JSONB NOT NULL DEFAULT '[]'::jsonb");
      await pool.query(`
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          id TEXT PRIMARY KEY,
          event_token TEXT NOT NULL REFERENCES invitation_events(token) ON DELETE CASCADE,
          viewer_key TEXT NOT NULL,
          endpoint TEXT NOT NULL,
          p256dh TEXT NOT NULL,
          auth TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL,
          UNIQUE(event_token, viewer_key, endpoint)
        )
      `);
      const result = await pool.query('SELECT id, client_event_id, owner_user_id, token, owner_token, event, attendees, tasks, date_options, expenses, chat_messages, photos, notifications, created_at FROM invitation_events ORDER BY created_at');
      records = result.rows.map(row => ({
        id: row.id,
        clientEventId: row.client_event_id,
        ownerUserId: row.owner_user_id,
        token: row.token,
        ownerToken: row.owner_token,
        event: row.event,
        attendees: normalizeAttendees(row.attendees),
        tasks: normalizeTasks(row.tasks),
        dateOptions: row.date_options,
        expenses: row.expenses || [],
        chatMessages: normalizeChatMessages(row.chat_messages || []),
        photos: normalizePhotos(row.photos || []),
        notifications: row.notifications || [],
        createdAt: new Date(row.created_at).toISOString()
      }));
      if (!records.length) {
        try {
          const contents = await fs.readFile(databaseFile, 'utf8');
          const parsed = JSON.parse(contents);
          if (Array.isArray(parsed.events) && parsed.events.length) {
            records = parsed.events.map(record => ({ ...record, attendees: normalizeAttendees(record.attendees), tasks: normalizeTasks(record.tasks) }));
            await saveStore();
          }
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      }
      return;
    }
    try {
      const contents = await fs.readFile(databaseFile, 'utf8');
      const parsed = JSON.parse(contents);
      if (!Array.isArray(parsed.events)) throw new Error('El archivo de eventos no tiene un formato válido.');
      records = parsed.events.map(record => ({ ...record, attendees: normalizeAttendees(record.attendees), tasks: normalizeTasks(record.tasks) }));
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
  }

  async function saveStore() {
    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const record of records) {
          await client.query(`
            INSERT INTO invitation_events
              (id, client_event_id, owner_user_id, token, owner_token, event, attendees, tasks, date_options, expenses, chat_messages, photos, notifications, created_at)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14)
            ON CONFLICT (id) DO UPDATE SET
              client_event_id = EXCLUDED.client_event_id,
              owner_user_id = EXCLUDED.owner_user_id,
              token = EXCLUDED.token,
              owner_token = EXCLUDED.owner_token,
              event = EXCLUDED.event,
              attendees = EXCLUDED.attendees,
              tasks = EXCLUDED.tasks,
              date_options = EXCLUDED.date_options,
              expenses = EXCLUDED.expenses,
              chat_messages = EXCLUDED.chat_messages,
              photos = EXCLUDED.photos,
              notifications = EXCLUDED.notifications
          `, [
            record.id,
            record.clientEventId,
            record.ownerUserId || null,
            record.token,
            record.ownerToken || null,
            JSON.stringify(record.event),
            JSON.stringify(record.attendees),
            JSON.stringify(record.tasks),
            JSON.stringify(record.dateOptions),
            JSON.stringify(record.expenses || []),
            JSON.stringify(record.chatMessages || []),
            JSON.stringify(record.photos || []),
            JSON.stringify(record.notifications || []),
            record.createdAt
          ]);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      return;
    }
    await fs.mkdir(path.dirname(databaseFile), { recursive: true });
    const temporaryFile = `${databaseFile}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    await fs.writeFile(temporaryFile, JSON.stringify({ version: 1, events: records }, null, 2), 'utf8');
    await fs.rename(temporaryFile, databaseFile);
  }

  function mutateStore(mutator) {
    const operation = mutationQueue.then(async () => {
      const previousNotificationIds = new Map(records.map(record => [record.token, new Set((record.notifications || []).map(notification => notification.id))]));
      const result = await mutator();
      await saveStore();
      for (const record of records) {
        const previousIds = previousNotificationIds.get(record.token) || new Set();
        for (const notification of record.notifications || []) {
          if (!previousIds.has(notification.id)) void sendPushForEvent(record.token, notification);
        }
      }
      return result;
    });
    mutationQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  function getCommunityViewer(record, request) {
    const organizer = request.headers['x-organizer-token'] && request.headers['x-organizer-token'] === record.ownerToken;
    const attendee = attendeeForRequest(record, request);
    if (!organizer && (!attendee || !['Confirmado', 'Confirmada'].includes(attendee.status))) {
      throw new HttpError(403, 'Solo las personas confirmadas pueden acceder a esta sección.');
    }
    return { organizer, attendee };
  }

  async function sendPushForEvent(eventToken, notification) {
    if (!pool || !webpush || !vapidPublicKey || !vapidPrivateKey || !notification) return;
    const subscriptions = await pool.query('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE event_token = $1', [eventToken]);
    const payload = JSON.stringify({
      title: notification.title || 'Novedad en OrganizaT',
      body: notification.detail || 'Tienes una novedad en tu evento.',
      url: `/join/${eventToken}?tab=${encodeURIComponent(notification.targetType === 'attendee' ? 'attendees' : notification.targetType === 'task' ? 'tasks' : notification.targetType === 'chat' ? 'chat' : notification.targetType === 'photo' ? 'photos' : notification.targetType === 'expense' ? 'expenses' : 'overview')}`
    });
    await Promise.all(subscriptions.rows.map(async subscription => {
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload);
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [subscription.id]);
        } else {
          console.error('No se pudo enviar una notificación push.', error.message);
        }
      }
    }));
  }

  async function handleApi(request, response, url) {
    request.authenticatedUser = await getAuthenticatedUser(request);
    if (request.method === 'GET' && url.pathname === '/api/push/public-key') {
      sendJson(response, 200, { enabled: Boolean(webpush && vapidPublicKey && vapidPrivateKey), publicKey: vapidPublicKey || null });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/health') {
      if (!pool) {
        sendJson(response, 200, { ok: true, database: 'json', authentication: false });
        return;
      }
      if (startupDatabaseError) {
        sendJson(response, 503, {
          ok: false,
          database: 'postgresql',
          authentication: true,
          error: 'No se pudo conectar con la base de datos configurada.'
        });
        return;
      }
      await pool.query('SELECT 1');
      sendJson(response, 200, { ok: true, database: 'postgresql', authentication: true });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/register') {
      if (!pool) throw new HttpError(503, 'La autenticación necesita DATABASE_URL configurado.');
      const body = await readJsonBody(request);
      const email = normalizeEmail(body && body.email);
      const name = cleanText(body && body.name, 'El nombre', 60);
      const password = validatePassword(body && body.password);
      const passwordHash = await hashPassword(password);
      const userId = crypto.randomUUID();
      try {
        await pool.query(
          'INSERT INTO organizers (id, email, name, password_hash, avatar, created_at) VALUES ($1, $2, $3, $4, $5, NOW())',
          [userId, email, name, passwordHash, '0']
        );
      } catch (error) {
        if (error.code === '23505') throw new HttpError(409, 'Ya existe una cuenta con ese correo.');
        throw error;
      }
      const token = await createSession(userId);
      sendJson(response, 201, { user: { id: userId, email, name, avatar: '0' } }, { 'Set-Cookie': sessionCookie(token) });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/login') {
      if (!pool) throw new HttpError(503, 'La autenticación necesita DATABASE_URL configurado.');
      const body = await readJsonBody(request);
      const email = normalizeEmail(body && body.email);
      const password = validatePassword(body && body.password);
      const result = await pool.query('SELECT id, email, name, avatar, password_hash FROM organizers WHERE email = $1', [email]);
      const user = result.rows[0];
      if (!user || !(await verifyPassword(password, user.password_hash))) {
        throw new HttpError(401, 'El correo o la contraseña no son correctos.');
      }
      const token = await createSession(user.id);
      sendJson(response, 200, { user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar || '0' } }, { 'Set-Cookie': sessionCookie(token) });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/forgot-password') {
      if (!pool) throw new HttpError(503, 'La recuperación de contraseña necesita DATABASE_URL configurado.');
      if (!resendApiKey || !emailFrom) throw new HttpError(503, 'El envío de correos todavía no está configurado.');
      const body = await readJsonBody(request);
      const email = normalizeEmail(body && body.email);
      const result = await pool.query('SELECT id, name FROM organizers WHERE email = $1', [email]);
      if (result.rows[0]) {
        await pool.query('UPDATE password_reset_codes SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [result.rows[0].id]);
        const code = String(crypto.randomInt(100000, 1000000));
        await pool.query(
          'INSERT INTO password_reset_codes (user_id, code_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'10 minutes\')',
          [result.rows[0].id, hashSessionToken(code)]
        );
        try {
          await sendResendEmail({
            apiKey: resendApiKey,
            from: emailFrom,
            to: email,
            subject: 'Tu código para recuperar la contraseña de OrganizaT',
            html: `<p>Hola ${escapeHtml(result.rows[0].name)},</p><p>Tu código para cambiar la contraseña es:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>Caduca en 10 minutos. Si no lo has solicitado, puedes ignorar este correo.</p>`
          });
        } catch (error) {
          console.error('No se pudo enviar el código de recuperación.', error.message);
          throw new HttpError(502, 'No se pudo enviar el correo de recuperación.');
        }
      }
      sendJson(response, 200, { message: 'Si existe una cuenta con ese correo, recibirás un código en unos minutos.' });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/reset-password') {
      if (!pool) throw new HttpError(503, 'La recuperación de contraseña necesita DATABASE_URL configurado.');
      const body = await readJsonBody(request);
      const email = normalizeEmail(body && body.email);
      const code = typeof body?.code === 'string' ? body.code.trim() : '';
      if (!/^\d{6}$/.test(code)) throw new HttpError(400, 'El código debe tener 6 cifras.');
      const password = validatePassword(body && body.password);
      const result = await pool.query(`
        SELECT r.id, r.user_id, r.attempts
        FROM password_reset_codes r JOIN organizers o ON o.id = r.user_id
        WHERE o.email = $1 AND r.used_at IS NULL AND r.expires_at > NOW()
        ORDER BY r.created_at DESC LIMIT 1
      `, [email]);
      const reset = result.rows[0];
      const validCode = reset && reset.attempts < 5 && crypto.timingSafeEqual(Buffer.from(hashSessionToken(code)), Buffer.from(reset.code_hash));
      if (!validCode) {
        if (reset) await pool.query('UPDATE password_reset_codes SET attempts = attempts + 1 WHERE id = $1', [reset.id]);
        throw new HttpError(400, 'El código no es válido o ha caducado.');
      }
      const passwordHash = await hashPassword(password);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('UPDATE organizers SET password_hash = $1 WHERE id = $2', [passwordHash, reset.user_id]);
        await client.query('UPDATE password_reset_codes SET used_at = NOW() WHERE id = $1', [reset.id]);
        await client.query('DELETE FROM organizer_sessions WHERE user_id = $1', [reset.user_id]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      sendJson(response, 200, { message: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
      return;
    }

    if (request.method === 'PATCH' && url.pathname === '/api/auth/profile') {
      if (!pool) throw new HttpError(503, 'La edición del perfil necesita DATABASE_URL configurado.');
      const user = await getAuthenticatedUser(request);
      if (!user) throw new HttpError(401, 'No hay una sesión iniciada.');
      const body = await readJsonBody(request);
      const name = body && body.name !== undefined ? cleanText(body.name, 'El nombre', 60) : user.name;
      const avatar = body && body.avatar !== undefined ? String(body.avatar) : (user.avatar || '0');
      if (!/^([0-9]|1[01])$/.test(avatar)) normalizeImageData(avatar, 'El avatar seleccionado');
      const password = body && body.password ? validatePassword(body.password) : null;
      const passwordHash = password ? await hashPassword(password) : null;
      const result = await pool.query(
        'UPDATE organizers SET name = $1, avatar = $2, password_hash = COALESCE($3, password_hash) WHERE id = $4 RETURNING id, email, name, avatar',
        [name, avatar, passwordHash, user.id]
      );
      records.forEach(record => {
        record.attendees.forEach(person => {
          if (person.accountUserId === user.id) person.avatar = avatar;
        });
      });
      await saveStore();
      sendJson(response, 200, { user: result.rows[0] });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/auth/me') {
      const user = await getAuthenticatedUser(request);
      if (!user) throw new HttpError(401, 'No hay una sesión iniciada.');
      sendJson(response, 200, { user });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
      if (pool) {
        const rawToken = parseCookies(request).organizat_session;
        if (rawToken) await pool.query('DELETE FROM organizer_sessions WHERE token_hash = $1', [hashSessionToken(rawToken)]);
      }
      sendJson(response, 200, { loggedOut: true }, { 'Set-Cookie': sessionCookie('', 0) });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/events') {
      const user = await getAuthenticatedUser(request);
      if (!user) throw new HttpError(401, 'Inicia sesión para ver tus eventos.');
      const events = records
        .map(record => eventForAuthenticatedUser(record, request, user))
        .filter(Boolean);
      sendJson(response, 200, { events });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/events') {
      const body = await readJsonBody(request);
      const user = await getAuthenticatedUser(request);
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new HttpError(400, 'Los datos del evento no son válidos.');
      }
      const result = await mutateStore(() => {
        let record = records.find(item => item.clientEventId === body.clientEventId);
        if (!record) {
          record = createEventRecord(body, user ? user.id : null);
          if (user && record.attendees[0]) record.attendees[0].avatar = user.avatar || '0';
          records.push(record);
        } else if (user && record.ownerUserId && record.ownerUserId !== user.id) {
          throw new HttpError(403, 'No tienes permiso para usar este identificador de evento.');
        } else if (user && !record.ownerUserId) {
          record.ownerUserId = user.id;
        } else if (!record.ownerToken) {
          record.ownerToken = crypto.randomBytes(24).toString('base64url');
        }
        const baseUrl = getPublicBaseUrl(request, configuredBaseUrl);
        return {
          inviteToken: record.token,
          inviteUrl: `${baseUrl}/join/${record.token}`,
          ownerToken: record.ownerToken
        };
      });
      sendJson(response, 201, result);
      return;
    }

    const eventUpdateMatch = url.pathname.match(/^\/api\/invitations\/([A-Za-z0-9_-]{32})\/event$/);
    if (request.method === 'PATCH' && eventUpdateMatch) {
      const body = await readJsonBody(request);
      const result = await mutateStore(() => {
        const record = records.find(item => item.token === eventUpdateMatch[1]);
        if (!record) throw new HttpError(404, 'La invitación no existe o ha caducado.');
        if (!record.ownerToken || request.headers['x-organizer-token'] !== record.ownerToken) {
          throw new HttpError(403, 'No tienes permiso para editar este evento.');
        }
        const source = body && body.event;
        if (!source || !isValidDate(source.date) || !isValidTime(source.time || '14:00')) {
          throw new HttpError(400, 'La fecha y hora del evento no son válidas.');
        }
        const nextEvent = {
          ...record.event,
          name: cleanText(source.name, 'El nombre del evento', 60),
          type: cleanText(source.type, 'El tipo de evento', 40),
          date: source.date,
          time: source.time || '14:00',
          location: cleanText(source.location, 'El lugar', 80),
          description: cleanText(source.description || '', 'La descripción', 160, false),
          capacity: Number(source.capacity),
          allowGuests: source.allowGuests === true,
          allowGuestSharing: source.allowGuestSharing === true,
          imageIndex: Number.isInteger(source.imageIndex) && source.imageIndex >= 0 && source.imageIndex < 9 ? source.imageIndex : 0,
          imageData: normalizeImageData(source.imageData, 'La imagen del evento')
        };
        if (!Number.isInteger(nextEvent.capacity) || nextEvent.capacity < attendeeHeadcount(record.attendees) || nextEvent.capacity > 200) {
          throw new HttpError(400, 'El aforo no puede ser menor que los asistentes actuales y debe estar entre 2 y 200.');
        }
        const oldEvent = record.event;
        const changes = [];
        if (oldEvent.location !== nextEvent.location) changes.push(`Lugar: ${nextEvent.location}`);
        if (oldEvent.date !== nextEvent.date) changes.push(`Día: ${nextEvent.date}`);
        if (oldEvent.time !== nextEvent.time) changes.push(`Hora: ${nextEvent.time}`);
        record.event = nextEvent;
        if (changes.length) {
          record.notifications = [...(record.notifications || []), {
            id: crypto.randomUUID(),
            title: 'Evento actualizado',
            detail: `El organizador ha cambiado ${changes.join(' · ')}.`,
            createdAt: new Date().toISOString()
          }].slice(-20);
        }
         return publicInvitation(record, request);
      });
      sendJson(response, 200, result);
      return;
    }

    const deleteMatch = url.pathname.match(/^\/api\/invitations\/([A-Za-z0-9_-]{32})$/);
    if (request.method === 'DELETE' && deleteMatch) {
      const result = await mutateStore(async () => {
        const index = records.findIndex(item => item.token === deleteMatch[1]);
        if (index < 0) throw new HttpError(404, 'La invitación no existe o ha caducado.');
        const record = records[index];
        if (!record.ownerToken || request.headers['x-organizer-token'] !== record.ownerToken) {
          throw new HttpError(403, 'No tienes permiso para eliminar este evento.');
        }
        records.splice(index, 1);
        if (pool) await pool.query('DELETE FROM invitation_events WHERE id = $1', [record.id]);
        return { deleted: true };
      });
      sendJson(response, 200, result);
      return;
    }

    const inviteMatch = url.pathname.match(/^\/api\/invitations\/([A-Za-z0-9_-]{32})$/);
    if (request.method === 'GET' && inviteMatch) {
      const record = records.find(item => item.token === inviteMatch[1]);
      if (!record) throw new HttpError(404, 'La invitación no existe o ha caducado.');
       sendJson(response, 200, publicInvitation(record, request));
      return;
    }

    const notificationReadMatch = url.pathname.match(/^\/api\/invitations\/([A-Za-z0-9_-]{32})\/notifications\/read$/);
    if (request.method === 'PATCH' && notificationReadMatch) {
      const body = String(request.headers['content-type'] || '').toLowerCase().includes('application/json')
        ? await readJsonBody(request)
        : {};
      const requestedIds = Array.isArray(body && body.notificationIds)
        ? new Set(body.notificationIds.filter(id => typeof id === 'string').slice(0, 100))
        : null;
      const result = await mutateStore(() => {
        const record = records.find(item => item.token === notificationReadMatch[1]);
        if (!record) throw new HttpError(404, 'La invitación no existe o ha caducado.');
        const viewer = getCommunityViewer(record, request);
        const viewerKey = notificationViewerKey(record, request, viewer.attendee);
        record.notifications = (record.notifications || []).map(notification => {
          const visible = (notification.audience === 'all' && !notification.recipientId)
            || (viewer.organizer && notification.audience === 'organizer')
            || (viewer.attendee && notification.recipientId === viewer.attendee.id);
          if (!visible || (requestedIds && requestedIds.size > 0 && !requestedIds.has(notification.id))) return notification;
          return { ...notification, readBy: Array.from(new Set([...(notification.readBy || []), viewerKey])) };
        });
        return publicInvitation(record, request);
      });
      sendJson(response, 200, result);
      return;
    }

    const communityMatch = url.pathname.match(/^\/api\/invitations\/([A-Za-z0-9_-]{32})\/(chat|photos)$/);
    if (communityMatch) {
      const body = request.method === 'POST' ? await readJsonBody(request) : null;
      const communityOperation = () => {
        const record = records.find(item => item.token === communityMatch[1]);
        if (!record) throw new HttpError(404, 'La invitación no existe o ha caducado.');
        const viewer = getCommunityViewer(record, request);
        const visibleNotifications = publicInvitation(record, request);
        if (request.method === 'GET') {
          return {
            chatMessages: record.chatMessages || [],
            photos: record.photos || [],
            notifications: visibleNotifications.notifications,
            unreadNotifications: visibleNotifications.unreadNotifications
          };
        }
        let pushNotification = null;
        if (communityMatch[2] === 'chat') {
          const text = cleanText(body && body.text, 'El mensaje', 500);
          const authorId = viewer.organizer ? `organizer:${record.ownerToken}` : viewer.attendee.id;
          const authorName = viewer.organizer ? (record.attendees[0]?.name || 'Organizador') : viewer.attendee.name;
          const message = ChatMessage.from({ authorId, authorName, text });
          record.chatMessages = normalizeChatMessages([...(record.chatMessages || []), message]).slice(-1000);
          pushNotification = {
            id: crypto.randomUUID(), audience: 'all', targetId: message.id, targetType: 'chat', title: 'Nuevo mensaje en el chat',
            detail: `${authorName} ha escrito en el chat del evento.`, createdAt: new Date().toISOString(), readBy: []
          };
          record.notifications = [...(record.notifications || []), pushNotification].slice(-50);
        } else {
          if (!body || typeof body.data !== 'string') throw new HttpError(400, 'Selecciona una imagen.');
          const authorId = viewer.organizer ? `organizer:${record.ownerToken}` : viewer.attendee.id;
          const authorName = viewer.organizer ? (record.attendees[0]?.name || 'Organizador') : viewer.attendee.name;
          const photo = Photo.from({ authorId, authorName, name: body.name || 'Foto del evento', data: body.data });
          record.photos = normalizePhotos([...(record.photos || []), photo]).slice(-200);
          pushNotification = {
            id: crypto.randomUUID(), audience: 'all', targetId: photo.id, targetType: 'photo', title: 'Nueva foto del evento',
            detail: `${authorName} ha compartido una foto con el grupo.`, createdAt: new Date().toISOString(), readBy: []
          };
          record.notifications = [...(record.notifications || []), pushNotification].slice(-50);
        }
        const updatedNotifications = publicInvitation(record, request);
        return {
          chatMessages: record.chatMessages || [],
          photos: record.photos || [],
          notifications: updatedNotifications.notifications,
          unreadNotifications: updatedNotifications.unreadNotifications,
          pushNotification
        };
      };
      const result = request.method === 'POST'
        ? await mutateStore(communityOperation)
        : communityOperation();
      const { pushNotification, ...publicResult } = result;
      sendJson(response, request.method === 'POST' ? 201 : 200, publicResult);
      return;
    }

    const pushSubscriptionMatch = url.pathname.match(/^\/api\/invitations\/([A-Za-z0-9_-]{32})\/push-subscriptions$/);
    if (pushSubscriptionMatch && ['POST', 'DELETE'].includes(request.method)) {
      if (!pool || !webpush || !vapidPublicKey || !vapidPrivateKey) throw new HttpError(503, 'Las notificaciones push aún no están configuradas en el servidor.');
      const record = records.find(item => item.token === pushSubscriptionMatch[1]);
      if (!record) throw new HttpError(404, 'La invitación no existe o ha caducado.');
      const viewer = getCommunityViewer(record, request);
      const viewerKey = notificationViewerKey(record, request, viewer.attendee);
      if (request.method === 'DELETE') {
        await pool.query('DELETE FROM push_subscriptions WHERE event_token = $1 AND viewer_key = $2', [record.token, viewerKey]);
        sendJson(response, 200, { enabled: false });
        return;
      }
      const body = await readJsonBody(request);
      const endpoint = cleanText(body && body.endpoint, 'El endpoint de notificaciones', 2000);
      const keys = body && body.keys;
      if (!endpoint.startsWith('https://') || !keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') {
        throw new HttpError(400, 'La suscripción de notificaciones no es válida.');
      }
      await pool.query(`
        INSERT INTO push_subscriptions (id, event_token, viewer_key, endpoint, p256dh, auth, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (event_token, viewer_key, endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth
      `, [crypto.randomUUID(), record.token, viewerKey, endpoint, keys.p256dh, keys.auth]);
      sendJson(response, 201, { enabled: true });
      return;
    }

    const attendeeDeleteMatch = url.pathname.match(/^\/api\/invitations\/([A-Za-z0-9_-]{32})\/attendees\/([A-Za-z0-9_-]+)$/);
    if (request.method === 'PATCH' && attendeeDeleteMatch) {
      const body = await readJsonBody(request);
      const authenticatedUser = await getAuthenticatedUser(request);
      const result = await mutateStore(() => {
        const record = records.find(item => item.token === attendeeDeleteMatch[1]);
        if (!record) throw new HttpError(404, 'La invitación no existe o ha caducado.');
        const attendee = record.attendees.find(person => person.id === attendeeDeleteMatch[2]);
        const isOrganizer = request.headers['x-organizer-token'] === record.ownerToken;
        const isLinkedAccount = authenticatedUser && attendee
          && (attendee.accountUserId === authenticatedUser.id
            || (record.ownerUserId === authenticatedUser.id && attendee.id === record.attendees[0]?.id));
        if (!attendee || (!isOrganizer && attendee.privateToken !== request.headers['x-attendee-token'] && !isLinkedAccount)) {
          throw new HttpError(403, 'Solo puedes modificar tu propia asistencia.');
        }
        const status = body && body.status === 'Cancelado'
          ? 'Cancelado'
          : (isOrganizer && body && body.status === 'Pendiente' ? 'Pendiente' : 'Confirmado');
        const adults = Number(body && body.adults);
        const children = Number(body && body.children);
        if (!Number.isInteger(adults) || adults < 1 || adults > 50 || !Number.isInteger(children) || children < 0 || children > 50) {
          throw new HttpError(400, 'El número de asistentes no es válido.');
        }
        const currentAdults = Math.max(1, Number(attendee.adults) || 1);
        const currentChildren = Math.max(0, Number(attendee.children) || 0);
        if (!isOrganizer && status !== 'Cancelado' && record.event.allowGuests !== true && (adults > currentAdults || children > currentChildren)) {
          throw new HttpError(403, 'El organizador no permite añadir adultos o niños a este evento.');
        }
        const previousStatus = attendee.status;
        attendee.status = status;
        attendee.adults = adults;
        attendee.children = children;
        record.notifications = [...(record.notifications || []), {
          id: crypto.randomUUID(),
          audience: 'organizer',
          targetId: attendee.id,
          targetType: 'attendee',
          title: status === 'Cancelado' ? `${attendee.name} ha cancelado su asistencia` : `${attendee.name} ha actualizado su asistencia`,
          detail: status === 'Cancelado' ? 'Ya no contará para el aforo.' : `${attendee.adults} adulto${attendee.adults === 1 ? '' : 's'} y ${attendee.children} niño${attendee.children === 1 ? '' : 's'}.`,
          createdAt: new Date().toISOString()
        }];
        if (previousStatus !== status) {
          record.notifications.push({
            id: crypto.randomUUID(), recipientId: attendee.id, audience: 'all', targetId: attendee.id, targetType: 'attendee',
            title: status === 'Cancelado' ? 'Asistencia cancelada' : 'Asistencia confirmada',
            detail: status === 'Cancelado' ? `${attendee.name} ya no asistirá al evento.` : `${attendee.name} vuelve a estar en el plan.`,
            createdAt: new Date().toISOString()
          });
        }
        return publicInvitation(record, request);
      });
      sendJson(response, 200, result);
      return;
    }
    if (request.method === 'DELETE' && attendeeDeleteMatch) {
      const result = await mutateStore(() => {
        const record = records.find(item => item.token === attendeeDeleteMatch[1]);
        if (!record) throw new HttpError(404, 'La invitación no existe o ha caducado.');
        if (!record.ownerToken || request.headers['x-organizer-token'] !== record.ownerToken) {
          throw new HttpError(403, 'No tienes permiso para modificar este evento.');
        }
        const index = record.attendees.findIndex(person => person.id === attendeeDeleteMatch[2]);
        if (index < 0) throw new HttpError(404, 'El asistente ya no está en este evento.');
        if (index === 0) throw new HttpError(400, 'El organizador no se puede eliminar del evento.');
        record.attendees.splice(index, 1);
         return publicInvitation(record, request);
      });
      sendJson(response, 200, result);
      return;
    }

    const stateMatch = url.pathname.match(/^\/api\/invitations\/([A-Za-z0-9_-]{32})\/state$/);
    if (request.method === 'PATCH' && stateMatch) {
      const body = await readJsonBody(request);
      const result = await mutateStore(() => {
        const record = records.find(item => item.token === stateMatch[1]);
        if (!record) throw new HttpError(404, 'La invitación no existe o ha caducado.');
        if (!record.ownerToken || request.headers['x-organizer-token'] !== record.ownerToken) {
          throw new HttpError(403, 'No tienes permiso para modificar este evento.');
        }
        const previousTasks = JSON.stringify(record.tasks);
        const previousTaskById = new Map(record.tasks.map(task => [task.id, task]));
        record.tasks = normalizeTasks(body && body.tasks);
        if (record.tasks.some(task => task.person && !record.attendees.some(person => ['Confirmado', 'Confirmada'].includes(person.status) && (person.id === task.personId || person.name === task.person)))) {
          throw new HttpError(400, 'Una tarea está asignada a una persona que no pertenece al evento.');
        }
        record.dateOptions = normalizeDateOptions(body && body.dateOptions);
        record.expenses = normalizeExpenses(body && body.expenses);
        if (previousTasks !== JSON.stringify(record.tasks)) {
          const taskNotifications = [];
          for (const task of record.tasks) {
            const previous = previousTaskById.get(task.id);
            if (!previous) {
              taskNotifications.push({
                id: crypto.randomUUID(), audience: 'all',
                targetId: task.id, targetType: 'task',
                title: 'Nueva cosa para llevar',
                detail: task.person ? `Se ha añadido «${task.name}» y la llevará ${task.person}.` : `Se ha añadido «${task.name}»; queda pendiente de asignar.`,
                createdAt: new Date().toISOString()
              });
            } else if (previous.person !== task.person) {
              taskNotifications.push({
                id: crypto.randomUUID(), audience: 'all',
                targetId: task.id, targetType: 'task',
                title: task.person ? 'Tarea asignada' : 'Tarea liberada',
                detail: task.person ? `«${task.name}» la llevará ${task.person}.` : `«${task.name}» vuelve a estar pendiente de asignar.`,
                createdAt: new Date().toISOString()
              });
            } else if (previous.purchased !== task.purchased) {
              taskNotifications.push({
                id: crypto.randomUUID(), audience: 'all',
                targetId: task.id, targetType: 'task',
                title: task.purchased ? 'Cosa comprada' : 'Compra pendiente',
                detail: task.purchased ? `«${task.name}» ya está comprada.` : `«${task.name}» vuelve a estar pendiente de compra.`,
                createdAt: new Date().toISOString()
              });
            }
          }
          record.notifications = [...(record.notifications || []), ...taskNotifications].slice(-30);
        }
         return publicInvitation(record, request);
      });
      sendJson(response, 200, result);
      return;
    }

    const taskProposalMatch = url.pathname.match(/^\/api\/invitations\/([A-Za-z0-9_-]{32})\/tasks\/proposals$/);
    if (request.method === 'POST' && taskProposalMatch) {
      const body = await readJsonBody(request);
      const result = await mutateStore(() => {
        const record = records.find(item => item.token === taskProposalMatch[1]);
        const attendee = record && attendeeForRequest(record, request);
        if (!record) throw new HttpError(404, 'La invitación no existe o ha caducado.');
        if (!attendee) throw new HttpError(403, 'Solo un asistente puede proponer algo.');
        const task = normalizeTasks([{ name: body && body.name, quantity: body && body.quantity || '', person: '', done: false, proposalStatus: 'proposed', proposedBy: attendee.id }])[0];
        record.tasks.push(task);
        record.notifications = [...(record.notifications || []), {
          id: crypto.randomUUID(), audience: 'organizer', targetId: task.id, targetType: 'task', title: `${attendee.name} propone añadir algo`,
          detail: `${task.name}${task.quantity ? ` · ${task.quantity}` : ''}. Revisa la propuesta en la lista.`, createdAt: new Date().toISOString()
        }];
        return publicInvitation(record, request);
      });
      sendJson(response, 201, result);
      return;
    }

    const taskUpdateMatch = url.pathname.match(/^\/api\/invitations\/([A-Za-z0-9_-]{32})\/tasks\/([A-Za-z0-9_-]+)$/);
    if (request.method === 'PATCH' && taskUpdateMatch) {
      const body = await readJsonBody(request);
      const result = await mutateStore(() => {
        const record = records.find(item => item.token === taskUpdateMatch[1]);
        const task = record && record.tasks.find(item => item.id === taskUpdateMatch[2]);
        if (!record || !task) throw new HttpError(404, 'La tarea no existe.');
        const isOrganizer = request.headers['x-organizer-token'] === record.ownerToken;
        const attendee = attendeeForRequest(record, request);
        if (body && body.action === 'approve') {
          if (!isOrganizer) throw new HttpError(403, 'Solo el organizador puede aceptar propuestas.');
          task.proposalStatus = 'accepted';
          record.notifications = [...(record.notifications || []), { id: crypto.randomUUID(), audience: 'all', targetId: task.id, targetType: 'task', title: 'Propuesta aceptada', detail: `«${task.name}» ya forma parte de la lista.`, createdAt: new Date().toISOString() }, { id: crypto.randomUUID(), recipientId: task.proposedBy, targetId: task.id, targetType: 'task', title: 'Tu propuesta ha sido aceptada', detail: `«${task.name}» ya está en la lista del evento.`, createdAt: new Date().toISOString() }];
        } else if (body && body.action === 'claim') {
          if (!attendee || !['Confirmado', 'Confirmada'].includes(attendee.status)) throw new HttpError(403, 'Solo los asistentes confirmados pueden asignarse tareas.');
          task.person = attendee.name;
          task.personId = attendee.id;
          record.notifications = [...(record.notifications || []), { id: crypto.randomUUID(), audience: 'all', targetId: task.id, targetType: 'task', title: 'Tarea asignada', detail: `${attendee.name} se encarga de «${task.name}».`, createdAt: new Date().toISOString() }];
        } else if (body && body.action === 'purchase') {
          if (!isOrganizer && (!attendee || !['Confirmado', 'Confirmada'].includes(attendee.status) || (task.personId ? task.personId !== attendee.id : task.person !== attendee.name))) throw new HttpError(403, 'Solo la persona encargada o el organizador pueden marcar una compra.');
          const wasPurchased = task.purchased === true || task.done === true;
          task.purchased = !wasPurchased;
          task.done = task.purchased;
          record.notifications = [...(record.notifications || []), { id: crypto.randomUUID(), audience: 'all', targetId: task.id, targetType: 'task', title: task.purchased ? 'Cosa comprada' : 'Compra pendiente', detail: task.purchased ? `«${task.name}» ya está comprada.` : `«${task.name}» vuelve a estar pendiente de compra.`, createdAt: new Date().toISOString() }];
        } else if (isOrganizer) {
          const requestedPerson = typeof body.person === 'string' ? body.person : task.person;
          const assignedAttendee = requestedPerson && record.attendees.find(person => ['Confirmado', 'Confirmada'].includes(person.status) && person.name === requestedPerson);
          if (requestedPerson && !assignedAttendee) {
            throw new HttpError(400, 'La persona asignada no pertenece al evento.');
          }
          task.person = requestedPerson;
          if (assignedAttendee) task.personId = assignedAttendee.id;
          else delete task.personId;
          task.done = typeof body.done === 'boolean' ? body.done : task.done;
          record.notifications = [...(record.notifications || []), { id: crypto.randomUUID(), audience: 'all', targetId: task.id, targetType: 'task', title: task.person ? 'Tarea asignada' : 'Tarea liberada', detail: task.person ? `«${task.name}» la hará ${task.person}.` : `«${task.name}» vuelve a estar pendiente de asignar.`, createdAt: new Date().toISOString() }];
        } else {
          throw new HttpError(403, 'No tienes permiso para modificar esta tarea.');
        }
        return publicInvitation(record, request);
      });
      sendJson(response, 200, result);
      return;
    }

    const joinMatch = url.pathname.match(/^\/api\/invitations\/([A-Za-z0-9_-]{32})\/join$/);
    if (request.method === 'POST' && joinMatch) {
      const body = await readJsonBody(request);
      const user = await getAuthenticatedUser(request);
      const name = cleanText(user ? user.name : body && body.name, 'Tu nombre', 60);
      const result = await mutateStore(() => {
        const record = records.find(item => item.token === joinMatch[1]);
        if (!record) throw new HttpError(404, 'La invitación no existe o ha caducado.');

        const normalizedName = name.toLocaleLowerCase('es-ES');
        const existing = record.attendees.find(person =>
          person.name.toLocaleLowerCase('es-ES') === normalizedName
        );
        const linkedExistingAccount = user && existing && (existing.accountUserId === user.id || existing.email === user.email);
        if (existing && ['Confirmado', 'Confirmada'].includes(existing.status) && !linkedExistingAccount) {
          throw new HttpError(409, 'Ya hay una persona confirmada con ese nombre. Añade tu apellido para distinguirte.');
        }
        const additionalAdults = body && body.adults === undefined ? 0 : Number(body && body.adults);
        const children = body && body.children === undefined ? 0 : Number(body && body.children);
        if (!Number.isInteger(additionalAdults) || additionalAdults < 0 || additionalAdults > 50 || !Number.isInteger(children) || children < 0 || children > 50) {
          throw new HttpError(400, 'El número de acompañantes no es válido.');
        }
        if (record.event.allowGuests !== true && (additionalAdults > 0 || children > 0)) {
          throw new HttpError(403, 'El organizador no permite añadir adultos o niños a este evento.');
        }
        const partyAdults = 1 + additionalAdults;
        const partySize = partyAdults + children;
        const currentHeadcount = attendeeHeadcount(record.attendees);
        const existingHeadcount = existing && existing.status !== 'Cancelado' ? (existing.adults || 1) + (existing.children || 0) : 0;
        if (currentHeadcount - existingHeadcount + partySize > record.event.capacity) {
          throw new HttpError(409, 'El evento ha alcanzado el aforo máximo.');
        }
        const previousHeadcount = currentHeadcount;
        if (existing) {
          existing.status = 'Confirmado';
          existing.role = 'Participante';
          existing.adults = partyAdults;
          existing.children = children;
          if (user) {
            existing.accountUserId = user.id;
            existing.avatar = user.avatar || '0';
          }
        } else {
          record.attendees.push({
            id: crypto.randomUUID(),
            name,
            initial: Array.from(name)[0].toLocaleUpperCase('es-ES'),
            role: 'Participante',
            status: 'Confirmado',
            adults: partyAdults,
            children,
            color: '#cfe5f3',
            privateToken: crypto.randomBytes(24).toString('base64url'),
            ...(user ? { accountUserId: user.id, avatar: user.avatar || '0' } : {})
          });
        }
        const nextHeadcount = attendeeHeadcount(record.attendees);
        record.notifications = [...(record.notifications || []), {
          id: crypto.randomUUID(),
          audience: 'organizer',
          targetId: existing ? existing.id : record.attendees.at(-1).id,
          targetType: 'attendee',
          title: `${name} se ha unido al evento`,
          detail: `${name} ha confirmado ${partyAdults} adulto${partyAdults === 1 ? '' : 's'} y ${children} niño${children === 1 ? '' : 's'}.`,
          createdAt: new Date().toISOString()
        }];
        if (Math.floor(nextHeadcount / 5) > Math.floor(previousHeadcount / 5)) {
          const messages = nextHeadcount > 20
            ? ['A ver dónde nos metemos tanta gente, ¡no vamos a caber todos en la foto grupal!', 'Esto ya no es un plan, ¡es un festival!', 'Habrá que ampliar la mesa: ya somos un montón.']
            : ['Esto se anima, ya somos X.', 'La gente se está animando, se va a liar.', '¡Cinco más al plan! Esto promete.'];
          const message = messages[Math.floor(Math.random() * messages.length)].replace('X', String(nextHeadcount));
          record.notifications.push({ id: crypto.randomUUID(), audience: 'all', title: '¡El grupo crece!', detail: message, createdAt: new Date().toISOString() });
        }
        return { attendees: publicAttendees(record.attendees), attendeeToken: existing ? existing.privateToken : record.attendees.at(-1).privateToken };
      });
      sendJson(response, 200, result);
      return;
    }

    throw new HttpError(404, 'La ruta de la API no existe.');
  }

  async function handleRequest(request, response) {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      await handleApi(request, response, url);
      return;
    }

    if (request.method === 'GET') {
      const nestedAssetMatch = url.pathname.match(/^\/join\/(?:[A-Za-z0-9_-]{32}\/)?(app\.js|styles\.css)$/);
      const staticEntry = allowedStaticFiles.get(url.pathname)
        || (nestedAssetMatch && allowedStaticFiles.get(`/${nestedAssetMatch[1]}`));
      if (staticEntry) {
        const [fileName, contentType] = staticEntry;
        const contents = await fs.readFile(path.join(rootDirectory, fileName));
        response.writeHead(200, {
          'Content-Type': contentType,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-cache'
        });
        response.end(contents);
        return;
      }
      if (/^\/join\/[A-Za-z0-9_-]{32}\/?$/.test(url.pathname)) {
        const contents = await fs.readFile(path.join(rootDirectory, 'index.html'));
        response.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-cache'
        });
        response.end(contents);
        return;
      }
    }

    throw new HttpError(404, 'No se encontró la página solicitada.');
  }

  const server = http.createServer((request, response) => {
    handleRequest(request, response).catch(error => {
      if (error instanceof HttpError) {
        sendJson(response, error.status, { error: error.message });
        return;
      }
      console.error('Error procesando la solicitud.', error);
      if (!response.headersSent) sendJson(response, 500, { error: 'Error interno del servidor.' });
      else response.destroy(error);
    });
  });

  server.ready = loadStore().catch(error => {
    startupDatabaseError = error;
    records = [];
    console.error('No se pudo cargar el almacenamiento de invitaciones.', error);
  });
  return server;
}

if (require.main === module) {
  const server = createAppServer();
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT) || 3000;
  server.listen(port, host, () => {
    console.log(`OrganizaT disponible en http://${host}:${port}`);
  });
  server.ready.catch(error => {
    console.error('No se pudo cargar el almacenamiento de invitaciones.', error);
  });
}

module.exports = { createAppServer };
