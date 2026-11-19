'use strict';

const crypto = require('node:crypto');

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

function normalizeImageData(value, field) {
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string' || value.length > 700000 || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) {
    throw new HttpError(400, `${field} no es válida.`);
  }
  return value;
}

class Attendee {
  static from(input, index = 0) {
    if (!input || typeof input !== 'object') throw new HttpError(400, 'Hay un asistente no válido.');
    const name = cleanText(input.name, 'El nombre del asistente', 60);
    const statuses = ['Confirmado', 'Confirmada', 'Pendiente', 'Cancelado'];
    if (!statuses.includes(input.status)) throw new HttpError(400, 'El estado de asistencia no es válido.');
    const role = typeof input.role === 'string' ? cleanText(input.role, 'El rol', 40, false) : 'Participante';
    const avatar = input.avatar === undefined || input.avatar === '' ? '' : String(input.avatar);
    if (avatar && !/^([0-9]|1[01])$/.test(avatar)) normalizeImageData(avatar, 'El avatar del asistente');
    return {
      name,
      initial: Array.from(name)[0].toLocaleUpperCase('es-ES'),
      role: role || 'Participante',
      status: input.status,
      adults: Number.isInteger(input.adults) && input.adults >= 1 && input.adults <= 50 ? input.adults : 1,
      children: Number.isInteger(input.children) && input.children >= 0 && input.children <= 50 ? input.children : 0,
      color: /^#[\da-f]{6}$/i.test(input.color || '') ? input.color : '#cfe5f3',
      avatar,
      ...(typeof input.email === 'string' ? { email: input.email.slice(0, 254).trim().toLowerCase() } : {}),
      id: typeof input.id === 'string' ? input.id : `initial-${index}`,
      privateToken: typeof input.privateToken === 'string' ? input.privateToken : crypto.randomBytes(24).toString('base64url'),
      ...(typeof input.accountUserId === 'string' ? { accountUserId: input.accountUserId } : {})
    };
  }
}

class Task {
  static from(input) {
    if (!input || typeof input !== 'object') throw new HttpError(400, 'Hay una tarea no válida.');
    if (typeof input.done !== 'boolean') throw new HttpError(400, 'El estado de una tarea no es válido.');
    return {
      name: cleanText(input.name, 'El nombre de la tarea', 80),
      quantity: cleanText(input.quantity || '', 'La cantidad', 40, false),
      person: cleanText(input.person || '', 'El responsable', 60, false),
      done: input.done,
      purchased: typeof input.purchased === 'boolean' ? input.purchased : input.done,
      id: typeof input.id === 'string' ? input.id : crypto.randomUUID(),
      ...(typeof input.personId === 'string' ? { personId: input.personId } : {}),
      proposalStatus: input.proposalStatus === 'proposed' ? 'proposed' : 'accepted',
      ...(typeof input.proposedBy === 'string' ? { proposedBy: input.proposedBy } : {})
    };
  }
}

class DateOption {
  static from(input) {
    if (!input || !isValidDate(input.date) || !isValidTime(input.time)) throw new HttpError(400, 'Una fecha u hora propuesta no es válida.');
    if (!Number.isInteger(input.votes) || input.votes < 0) throw new HttpError(400, 'El número de votos no es válido.');
    return { date: input.date, time: input.time, votes: input.votes };
  }
}

class Expense {
  static from(input) {
    if (!input || typeof input !== 'object' || !Number.isFinite(Number(input.amount)) || Number(input.amount) <= 0) throw new HttpError(400, 'Hay un gasto no válido.');
    return {
      name: cleanText(input.name, 'El concepto del gasto', 80),
      amount: Math.round(Number(input.amount) * 100) / 100,
      person: cleanText(input.person, 'La persona que pagó', 60),
      date: cleanText(input.date || '', 'La fecha del gasto', 40, false)
    };
  }
}

class ChatMessage {
  static from(input) {
    return {
      id: typeof input.id === 'string' ? input.id : crypto.randomUUID(),
      authorId: cleanText(input.authorId || '', 'El autor del mensaje', 100),
      authorName: cleanText(input.authorName, 'El nombre del autor', 60),
      text: cleanText(input.text, 'El mensaje', 500),
      createdAt: typeof input.createdAt === 'string' ? input.createdAt : new Date().toISOString()
    };
  }
}

class Photo {
  static from(input) {
    if (!input || typeof input !== 'object' || typeof input.data !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(input.data) || input.data.length > 2_500_000) {
      throw new HttpError(400, 'La foto no es válida o pesa demasiado.');
    }
    return {
      id: typeof input.id === 'string' ? input.id : crypto.randomUUID(),
      authorId: cleanText(input.authorId || '', 'El autor de la foto', 100),
      authorName: cleanText(input.authorName, 'El nombre del autor', 60),
      name: cleanText(input.name || 'Foto del evento', 'El nombre de la foto', 120, false) || 'Foto del evento',
      data: input.data,
      createdAt: typeof input.createdAt === 'string' ? input.createdAt : new Date().toISOString()
    };
  }
}

class Event {
  static from(input) {
    const capacity = input.capacity === undefined ? 200 : Number(input.capacity);
    if (!Number.isInteger(capacity) || capacity < 2 || capacity > 200) throw new HttpError(400, 'El aforo debe estar entre 2 y 200 personas.');
    const time = input.time === undefined ? '14:00' : input.time;
    if (!isValidDate(input.date) || !isValidTime(time)) throw new HttpError(400, 'La fecha y hora del evento no son válidas.');
    return {
      id: input.id,
      name: cleanText(input.name, 'El nombre del evento', 60),
      type: cleanText(input.type, 'El tipo de evento', 40),
      date: input.date,
      time,
      location: cleanText(input.location, 'El lugar', 80),
      description: cleanText(input.description || '', 'La descripción', 160, false),
      badge: cleanText(input.badge || 'Evento privado', 'La etiqueta', 40, false) || 'Evento privado',
      capacity,
      allowGuests: input.allowGuests === true,
      allowGuestSharing: input.allowGuestSharing === true,
      imageIndex: Number.isInteger(input.imageIndex) && input.imageIndex >= 0 && input.imageIndex < 9 ? input.imageIndex : 0,
      imageData: normalizeImageData(input.imageData, 'La imagen del evento')
    };
  }
}

class Invitation {
  static create(body, ownerUserId = null) {
    if (!body || typeof body !== 'object' || !/^[A-Za-z0-9_-]{1,80}$/.test(body.clientEventId || '')) throw new HttpError(400, 'El identificador del evento no es válido.');
    const attendees = Invitation.attendees(body.attendees);
    const event = Event.from({ id: body.clientEventId, ...(body.event || {}) });
    if (!attendees.length || Invitation.headcount(attendees) > event.capacity) throw new HttpError(400, 'El número inicial de asistentes supera el aforo.');
    if (ownerUserId) attendees[0].accountUserId = ownerUserId;
    return {
      id: crypto.randomBytes(16).toString('hex'), clientEventId: body.clientEventId,
      token: crypto.randomBytes(24).toString('base64url'), ownerToken: crypto.randomBytes(24).toString('base64url'),
      ownerUserId, event, attendees, tasks: Invitation.tasks(body.tasks),
      dateOptions: Invitation.dateOptions(body.dateOptions), expenses: Invitation.expenses(body.expenses || []),
      chatMessages: [], photos: [], notifications: [], createdAt: new Date().toISOString()
    };
  }

  static attendees(input) {
    if (!Array.isArray(input) || input.length > 200) throw new HttpError(400, 'La lista de asistentes no es válida.');
    return input.map((item, index) => Attendee.from(item, index));
  }
  static tasks(input) {
    if (!Array.isArray(input) || input.length > 100) throw new HttpError(400, 'La lista de tareas no es válida.');
    return input.map(item => Task.from(item));
  }
  static dateOptions(input) {
    if (!Array.isArray(input) || input.length > 20) throw new HttpError(400, 'Las opciones de fecha no son válidas.');
    return input.map(item => DateOption.from(item));
  }
  static expenses(input) {
    if (!Array.isArray(input) || input.length > 200) throw new HttpError(400, 'La lista de gastos no es válida.');
    return input.map(item => Expense.from(item));
  }
  static chatMessages(input) {
    if (!Array.isArray(input) || input.length > 1000) throw new HttpError(400, 'El chat no es válido.');
    return input.map(item => ChatMessage.from(item));
  }
  static photos(input) {
    if (!Array.isArray(input) || input.length > 200) throw new HttpError(400, 'El álbum no es válido.');
    return input.map(item => Photo.from(item));
  }
  static headcount(attendees) {
    return attendees.reduce((total, person) => total + (['Confirmado', 'Confirmada'].includes(person.status) ? (person.adults || 1) + (person.children || 0) : 0), 0);
  }
}

module.exports = {
  HttpError, Event, Invitation, Attendee, Task, DateOption, Expense, ChatMessage, Photo,
  cleanText, isValidDate, isValidTime, normalizeImageData
};
