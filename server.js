'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');

const rootDirectory = __dirname;
const defaultDatabaseFile = path.join(rootDirectory, 'data', 'invitations.json');
const maximumRequestBytes = 32 * 1024;
const sessionDurationSeconds = 60 * 60 * 24 * 30;
const allowedStaticFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']]
]);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isValidTime(value) {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return false;
  const [hours, minutes] = value.split(':').map(Number);
  return hours <= 23 && minutes <= 59;
}

function cleanText(value, field, maximumLength, required = true) {
  if (typeof value !== 'string') {
    if (!required && value == null) return '';
    throw new HttpError(400, `${field} no es válido.`);
  }
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if ((required && !cleaned) || cleaned.length > maximumLength) {
    throw new HttpError(400, `${field} debe tener entre 1 y ${maximumLength} caracteres.`);
  }
  return cleaned;
}

function normalizeAttendees(input) {
  if (!Array.isArray(input) || input.length > 200) {
    throw new HttpError(400, 'La lista de asistentes no es válida.');
  }
  return input.map((person, index) => {
    if (!person || typeof person !== 'object') {
      throw new HttpError(400, 'Hay un asistente no válido.');
    }
    const name = cleanText(person.name, 'El nombre del asistente', 60);
    const allowedStatuses = ['Confirmado', 'Confirmada', 'Pendiente'];
    if (!allowedStatuses.includes(person.status)) throw new HttpError(400, 'El estado de asistencia no es válido.');
    const status = person.status;
    const role = typeof person.role === 'string' ? cleanText(person.role, 'El rol', 40, false) : 'Participante';
    const initial = Array.from(name)[0].toLocaleUpperCase('es-ES');
    const color = /^#[\da-f]{6}$/i.test(person.color || '') ? person.color : '#c4d6c0';
    return {
      name,
      initial,
      role: role || 'Participante',
      status,
      color,
      ...(typeof person.email === 'string' ? { email: person.email.slice(0, 254).trim().toLowerCase() } : {}),
      id: typeof person.id === 'string' ? person.id : `initial-${index}`
    };
  });
}

function normalizeTasks(input) {
  if (!Array.isArray(input) || input.length > 100) {
    throw new HttpError(400, 'La lista de tareas no es válida.');
  }
  return input.map(task => {
    if (!task || typeof task !== 'object') throw new HttpError(400, 'Hay una tarea no válida.');
    if (typeof task.done !== 'boolean') throw new HttpError(400, 'El estado de una tarea no es válido.');
    return {
      name: cleanText(task.name, 'El nombre de la tarea', 80),
      quantity: cleanText(task.quantity || '', 'La cantidad', 40, false),
      person: cleanText(task.person || '', 'El responsable', 60, false),
      done: task.done
    };
  });
}

function normalizeDateOptions(input) {
  if (!Array.isArray(input) || input.length > 20) {
    throw new HttpError(400, 'Las opciones de fecha no son válidas.');
  }
  return input.map(option => {
    if (!option || !isValidDate(option.date) || !isValidTime(option.time)) {
      throw new HttpError(400, 'Una fecha u hora propuesta no es válida.');
    }
    if (!Number.isInteger(option.votes) || option.votes < 0) {
      throw new HttpError(400, 'El número de votos no es válido.');
    }
    return {
      date: option.date,
      time: option.time,
      votes: option.votes
    };
  });
}

function normalizeExpenses(input) {
  if (!Array.isArray(input) || input.length > 200) {
    throw new HttpError(400, 'La lista de gastos no es válida.');
  }
  return input.map(expense => {
    if (!expense || typeof expense !== 'object' || !Number.isFinite(Number(expense.amount)) || Number(expense.amount) <= 0) {
      throw new HttpError(400, 'Hay un gasto no válido.');
    }
    return {
      name: cleanText(expense.name, 'El concepto del gasto', 80),
      amount: Math.round(Number(expense.amount) * 100) / 100,
      person: cleanText(expense.person, 'La persona que pagó', 60),
      date: cleanText(expense.date || '', 'La fecha del gasto', 40, false)
    };
  });
}

function publicAttendees(attendees) {
  return attendees.map(({ email, ...person }) => person);
}

function publicInvitation(record) {
  return {
    event: record.event,
    attendees: publicAttendees(record.attendees),
    tasks: record.tasks,
    dateOptions: record.dateOptions,
    expenses: record.expenses || []
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
  if (!attendees.length || attendees.length > capacity) {
    throw new HttpError(400, 'El número inicial de asistentes supera el aforo.');
  }
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
    allowGuests: source.allowGuests === true
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
    createdAt: new Date().toISOString()
  };
}

function createAppServer(options = {}) {
  const databaseFile = options.databaseFile || defaultDatabaseFile;
  const databaseUrl = options.databaseUrl || process.env.DATABASE_URL || '';
  let pool = null;
  if (databaseUrl) {
    const { Pool } = require('pg');
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
    });
  }

  async function getAuthenticatedUser(request) {
    if (!pool) return null;
    const rawToken = parseCookies(request).organizat_session;
    if (!rawToken) return null;
    const result = await pool.query(`
      SELECT o.id, o.email, o.name
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

  function organizerEvent(record, request) {
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
      expenses: record.expenses || []
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
  let mutationQueue = Promise.resolve();

  async function loadStore() {
    if (pool) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS organizers (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS organizer_sessions (
          token_hash TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
          expires_at TIMESTAMPTZ NOT NULL
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
          created_at TIMESTAMPTZ NOT NULL
        )
      `);
      await pool.query('ALTER TABLE invitation_events ADD COLUMN IF NOT EXISTS owner_user_id TEXT REFERENCES organizers(id) ON DELETE SET NULL');
      const result = await pool.query('SELECT id, client_event_id, owner_user_id, token, owner_token, event, attendees, tasks, date_options, expenses, created_at FROM invitation_events ORDER BY created_at');
      records = result.rows.map(row => ({
        id: row.id,
        clientEventId: row.client_event_id,
        ownerUserId: row.owner_user_id,
        token: row.token,
        ownerToken: row.owner_token,
        event: row.event,
        attendees: row.attendees,
        tasks: row.tasks,
        dateOptions: row.date_options,
        expenses: row.expenses || [],
        createdAt: new Date(row.created_at).toISOString()
      }));
      if (!records.length) {
        try {
          const contents = await fs.readFile(databaseFile, 'utf8');
          const parsed = JSON.parse(contents);
          if (Array.isArray(parsed.events) && parsed.events.length) {
            records = parsed.events;
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
      records = parsed.events;
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
              (id, client_event_id, owner_user_id, token, owner_token, event, attendees, tasks, date_options, expenses, created_at)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11)
            ON CONFLICT (id) DO UPDATE SET
              client_event_id = EXCLUDED.client_event_id,
              owner_user_id = EXCLUDED.owner_user_id,
              token = EXCLUDED.token,
              owner_token = EXCLUDED.owner_token,
              event = EXCLUDED.event,
              attendees = EXCLUDED.attendees,
              tasks = EXCLUDED.tasks,
              date_options = EXCLUDED.date_options,
              expenses = EXCLUDED.expenses
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
      const result = await mutator();
      await saveStore();
      return result;
    });
    mutationQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async function handleApi(request, response, url) {
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
          'INSERT INTO organizers (id, email, name, password_hash, created_at) VALUES ($1, $2, $3, $4, NOW())',
          [userId, email, name, passwordHash]
        );
      } catch (error) {
        if (error.code === '23505') throw new HttpError(409, 'Ya existe una cuenta con ese correo.');
        throw error;
      }
      const token = await createSession(userId);
      sendJson(response, 201, { user: { id: userId, email, name } }, { 'Set-Cookie': sessionCookie(token) });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/login') {
      if (!pool) throw new HttpError(503, 'La autenticación necesita DATABASE_URL configurado.');
      const body = await readJsonBody(request);
      const email = normalizeEmail(body && body.email);
      const password = validatePassword(body && body.password);
      const result = await pool.query('SELECT id, email, name, password_hash FROM organizers WHERE email = $1', [email]);
      const user = result.rows[0];
      if (!user || !(await verifyPassword(password, user.password_hash))) {
        throw new HttpError(401, 'El correo o la contraseña no son correctos.');
      }
      const token = await createSession(user.id);
      sendJson(response, 200, { user: { id: user.id, email: user.email, name: user.name } }, { 'Set-Cookie': sessionCookie(token) });
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
      sendJson(response, 200, { events: records.filter(record => record.ownerUserId === user.id).map(record => organizerEvent(record, request)) });
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
      sendJson(response, 200, publicInvitation(record));
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
        record.tasks = normalizeTasks(body && body.tasks);
        record.dateOptions = normalizeDateOptions(body && body.dateOptions);
        record.expenses = normalizeExpenses(body && body.expenses);
        return publicInvitation(record);
      });
      sendJson(response, 200, result);
      return;
    }

    const joinMatch = url.pathname.match(/^\/api\/invitations\/([A-Za-z0-9_-]{32})\/join$/);
    if (request.method === 'POST' && joinMatch) {
      const body = await readJsonBody(request);
      const name = cleanText(body && body.name, 'Tu nombre', 60);
      const result = await mutateStore(() => {
        const record = records.find(item => item.token === joinMatch[1]);
        if (!record) throw new HttpError(404, 'La invitación no existe o ha caducado.');

        const normalizedName = name.toLocaleLowerCase('es-ES');
        const existing = record.attendees.find(person =>
          person.name.toLocaleLowerCase('es-ES') === normalizedName
        );
        if (existing && existing.status !== 'Pendiente') {
          throw new HttpError(409, 'Ya hay una persona confirmada con ese nombre. Añade tu apellido para distinguirte.');
        }
        if (!existing && record.attendees.length >= record.event.capacity) {
          throw new HttpError(409, 'El evento ha alcanzado el aforo máximo.');
        }
        if (existing) {
          existing.status = 'Confirmado';
          existing.role = 'Participante';
        } else {
          record.attendees.push({
            id: crypto.randomUUID(),
            name,
            initial: Array.from(name)[0].toLocaleUpperCase('es-ES'),
            role: 'Participante',
            status: 'Confirmado',
            color: '#c4d6c0'
          });
        }
        return publicAttendees(record.attendees);
      });
      sendJson(response, 200, { attendees: result });
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

  server.ready = loadStore();
  return server;
}

if (require.main === module) {
  const server = createAppServer();
  server.ready.then(() => {
    const host = process.env.HOST || '127.0.0.1';
    const port = Number(process.env.PORT) || 3000;
    server.listen(port, host, () => {
      console.log(`OrganizaT disponible en http://${host}:${port}`);
    });
  }).catch(error => {
    console.error('No se pudo cargar el almacenamiento de invitaciones.', error);
    process.exitCode = 1;
  });
}

module.exports = { createAppServer };
