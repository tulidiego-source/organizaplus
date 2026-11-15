let eventTemplates = [
  {
    id: 'barbacoa',
    name: 'Barbacoa en casa de Juan',
    type: 'Barbacoa',
    date: '2026-11-21',
    time: '14:00',
    location: 'Casa de Juan',
    description: 'Un día de brasas, buena comida y mejor compañía.',
    badge: 'Evento privado'
  },
  {
    id: 'cumple',
    name: 'Cumpleaños de Ana',
    type: 'Cumpleaños',
    date: '2026-11-28',
    time: '18:00',
    location: 'Jardín de la Abuela',
    description: 'Tarta, música y una velada muy acogedora.',
    badge: 'Fiesta'
  },
  {
    id: 'empresa',
    name: 'Comida de empresa',
    type: 'Comida de empresa',
    date: '2026-12-05',
    time: '14:00',
    location: 'Restaurante La Vuelta',
    description: 'Plan de equipo y cierre del trimestre.',
    badge: 'Trabajo'
  }
];

let attendees = [
  { name: 'Diego Navarro', initial: 'D', role: 'Organizador', status: 'Confirmado', color: '#e9c3aa' },
  { name: 'María López', initial: 'M', role: 'Viene con 1 invitado', status: 'Confirmada', color: '#e8baa6' },
  { name: 'Juan García', initial: 'J', role: 'Anfitrión', status: 'Confirmado', color: '#d6c6a9' },
  { name: 'Ana Ruiz', initial: 'A', role: 'Participante', status: 'Confirmada', color: '#c4d6c0' },
  { name: 'Luis Martín', initial: 'L', role: 'Participante', status: 'Confirmado', color: '#d9c2cf' },
  { name: 'Carmen Díaz', initial: 'C', role: 'Participante', status: 'Confirmada', color: '#e7d5a9' },
  { name: 'Pablo Torres', initial: 'P', role: 'Participante', status: 'Confirmado', color: '#b8d2d1' },
  { name: 'Sofía Vega', initial: 'S', role: 'Participante', status: 'Confirmada', color: '#e5c4ba' },
  { name: 'David Romero', initial: 'D', role: 'Participante', status: 'Confirmado', color: '#c9d2b5' },
  { name: 'Elena Castro', initial: 'E', role: 'Participante', status: 'Confirmada', color: '#d3c4df' },
  { name: 'Raúl Molina', initial: 'R', role: 'Participante', status: 'Confirmado', color: '#e4c59a' },
  { name: 'Nuria León', initial: 'N', role: 'Participante', status: 'Confirmada', color: '#b9d1c2' },
  { name: 'Marta Gil', initial: 'M', role: 'Participante', status: 'Pendiente', color: '#e3c6b6' },
  { name: 'Álvaro Pérez', initial: 'Á', role: 'Participante', status: 'Pendiente', color: '#c7d3de' },
  { name: 'Irene Soler', initial: 'I', role: 'Participante', status: 'Pendiente', color: '#d8cbb1' }
];

let tasks = [
  { name: 'Carne variada', quantity: '5 kg', person: 'Juan García', done: true },
  { name: 'Pan', quantity: '6 barras', person: 'María López', done: true },
  { name: 'Carbón', quantity: '2 sacos', person: 'Diego Navarro', done: true },
  { name: 'Refrescos', quantity: '12 botellas', person: 'Ana Ruiz', done: true },
  { name: 'Hielo', quantity: '3 bolsas', person: '', done: false },
  { name: 'Ensalada', quantity: 'Para compartir', person: 'Carmen Díaz', done: true },
  { name: 'Postre', quantity: 'Algo fresquito', person: '', done: false },
  { name: 'Servilletas y vasos', quantity: '18 personas', person: '', done: false }
];

let expenses = [
  { name: 'Carne y embutido', amount: 87.5, person: 'Juan García', date: 'Hoy, 11:24' },
  { name: 'Bebidas y picoteo', amount: 37.5, person: 'María López', date: 'Ayer, 18:06' }
];

const colors = ['#d6c6a9', '#c4d6c0', '#d9c2cf', '#e7d5a9', '#b8d2d1', '#e5c4ba'];
const eventImageCount = 9;
const avatarImageCount = 12;
let wizardImageIndex = 0;
let selectedAvatarIndex = 0;
let dateOptions = [
  { date: '2026-11-21', time: '14:00', votes: 8 },
  { date: '2026-11-22', time: '14:00', votes: 5 },
  { date: '2026-11-28', time: '14:00', votes: 3 }
];
let toastTimer;
let selectedDate = '';
let currentVote = '';
let eventNotifications = [];
let currentTab = 'overview';
let currentEvent = eventTemplates[0];
let wizardStep = 0;
let wizardInvitees = [];
let wizardDates = [];
let wizardTasks = [];
let editingEventId = null;
const storageKey = 'organiza-plus.data.v1';
let activeInviteToken = '';
let inviteRefreshInProgress = false;
let remoteStateSyncInProgress = false;
let remoteStateSyncQueued = false;
let authUser = null;
let authMode = 'login';
let attendeeToDeleteIndex = null;
let joinedInvitationNames = {};
let joinAlreadyHandledToken = '';

async function requestApi(route, options = {}) {
  let response;
  try {
    response = await fetch(route, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(options.body ? { 'Content-Type': 'application/json' } : {})
      }
    });
  } catch (error) {
    throw new Error('No se pudo conectar con el servidor de invitaciones. Comprueba que la aplicación esté publicada y vuelve a intentarlo.');
  }

  let result;
  try {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      const error = new Error(response.status === 404
        ? 'Esta publicación solo sirve archivos estáticos. El registro necesita ejecutar el servidor Node de OrganizaT.'
        : 'El servidor de OrganizaT no devolvió una respuesta válida.');
      error.status = response.status;
      throw error;
    }
    result = await response.json();
  } catch (error) {
    if (error.status) throw error;
    throw new Error('El servidor de invitaciones devolvió una respuesta no válida.');
  }
  if (!response.ok) {
    const error = new Error(result.error || 'No se pudo completar la solicitud.');
    error.status = response.status;
    throw error;
  }
  return result;
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function addDaysToDate(dateValue, days) {
  const date = new Date(`${dateValue}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function createEmptyEventState(event) {
  const organizer = { name: 'Diego Navarro', initial: 'D', role: 'Organizador', status: 'Confirmado', color: '#e9c3aa' };
  return {
    attendees: [organizer],
    tasks: [],
    expenses: [],
    dateOptions: [
      { date: event.date, time: event.time || '14:00', votes: 0 },
      { date: addDaysToDate(event.date, 7), time: event.time || '14:00', votes: 0 }
    ],
    selectedDate: '',
    currentVote: ''
  };
}

let eventStates = {};
eventTemplates.forEach((event, index) => {
  eventStates[event.id] = index === 0
    ? {
        attendees: cloneData(attendees),
        tasks: cloneData(tasks),
        expenses: cloneData(expenses),
        dateOptions: cloneData(dateOptions),
        selectedDate,
        currentVote
      }
    : createEmptyEventState(event);
});

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const euro = value => `${value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

function spriteStyle(image, index, columns, rows) {
  const x = columns === 1 ? 0 : (index % columns) * (100 / (columns - 1));
  const y = rows === 1 ? 0 : Math.floor(index / columns) * (100 / (rows - 1));
  return `background-image:url('${image}');background-size:${columns * 100}% ${rows * 100}%;background-position:${x}% ${y}%;`;
}

function renderEventImagePicker() {
  const picker = $('#event-image-picker');
  if (!picker) return;
  picker.innerHTML = Array.from({ length: eventImageCount }, (_, index) => `
    <button type="button" class="image-choice ${index === wizardImageIndex ? 'selected' : ''}" data-event-image="${index}" style="${spriteStyle('/eventos.png', index, 3, 3)}" aria-label="Imagen de evento ${index + 1}"></button>
  `).join('');
}

function renderAvatarPicker() {
  const picker = $('#avatar-picker');
  if (!picker) return;
  picker.innerHTML = Array.from({ length: avatarImageCount }, (_, index) => `
    <button type="button" class="image-choice ${index === selectedAvatarIndex ? 'selected' : ''}" data-avatar-index="${index}" style="${spriteStyle('/avatars.png', index, 4, 3)}" aria-label="Avatar ${index + 1}"></button>
  `).join('');
}

function attendeePeopleCount(person) {
  return (person.adults || 1) + (person.children || 0);
}

function attendeePartyLabel(person) {
  const adults = person.adults || 1;
  const children = person.children || 0;
  const adultLabel = `${adults} ${adults === 1 ? 'adulto' : 'adultos'}`;
  return children ? `${adultLabel} · ${children} ${children === 1 ? 'niño' : 'niños'}` : adultLabel;
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2600);
}

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
}

function isValidEventState(state) {
  return state
    && Array.isArray(state.attendees)
    && state.attendees.every(person => person
      && typeof person.name === 'string'
      && typeof person.initial === 'string'
      && typeof person.role === 'string'
      && ['Confirmado', 'Confirmada', 'Pendiente'].includes(person.status)
      && typeof person.color === 'string'
      && /^#[\da-f]{6}$/i.test(person.color))
    && Array.isArray(state.tasks)
    && state.tasks.every(task => task
      && typeof task.name === 'string'
      && typeof task.quantity === 'string'
      && typeof task.person === 'string'
      && typeof task.done === 'boolean')
    && Array.isArray(state.expenses)
    && state.expenses.every(expense => expense
      && typeof expense.name === 'string'
      && Number.isFinite(expense.amount)
      && expense.amount >= 0
      && typeof expense.person === 'string'
      && typeof expense.date === 'string')
    && Array.isArray(state.dateOptions)
    && state.dateOptions.every(option => option
      && validDate(option.date)
      && typeof option.time === 'string'
      && /^\d{2}:\d{2}$/.test(option.time)
      && Number.isInteger(option.votes)
      && option.votes >= 0)
    && (state.selectedDate === '' || validDate(state.selectedDate))
    && (state.currentVote === '' || validDate(state.currentVote));
}

function isValidStoredData(data) {
  return data
    && data.version === 1
    && Array.isArray(data.events)
    && data.events.length > 0
    && data.events.every(event => event
      && typeof event.id === 'string'
      && /^[a-zA-Z0-9_-]+$/.test(event.id)
      && typeof event.name === 'string'
      && typeof event.type === 'string'
      && validDate(event.date)
      && typeof event.location === 'string'
      && typeof event.description === 'string'
      && typeof event.badge === 'string')
    && new Set(data.events.map(event => event.id)).size === data.events.length
    && data.eventStates
    && typeof data.eventStates === 'object'
    && data.events.every(event => isValidEventState(data.eventStates[event.id]))
    && data.events.some(event => event.id === data.currentEventId);
}

function saveCurrentEventData() {
  eventStates[currentEvent.id] = {
    attendees: cloneData(attendees),
    tasks: cloneData(tasks),
    expenses: cloneData(expenses),
    dateOptions: cloneData(dateOptions),
    selectedDate,
    currentVote,
    notifications: cloneData(eventNotifications)
  };
}

function persistAppState() {
  saveCurrentEventData();
  try {
    localStorage.setItem(storageKey, JSON.stringify({
      version: 1,
      events: eventTemplates,
      eventStates,
      currentEventId: currentEvent.id,
      joinedInvitationNames
    }));
    return true;
  } catch (error) {
    console.error('Unable to persist OrganizaT data in this browser.', error);
    showToast('No se pudo guardar en este navegador. Los cambios solo estarán disponibles mientras no cierres esta página.');
    return false;
  }
}

function restoreEventData(eventId) {
  const state = eventStates[eventId] || createEmptyEventState(currentEvent);
  eventStates[eventId] = cloneData(state);
  attendees = cloneData(state.attendees);
  tasks = cloneData(state.tasks);
  expenses = cloneData(state.expenses);
  dateOptions = cloneData(state.dateOptions);
  selectedDate = state.selectedDate;
  currentVote = state.currentVote;
  eventNotifications = cloneData(state.notifications || []);
}

function loadPersistedData() {
  let serialized;
  try {
    serialized = localStorage.getItem(storageKey);
  } catch (error) {
    console.error('Unable to access OrganizaT browser storage.', error);
    showToast('El navegador no permite acceder al almacenamiento local; los cambios no persistirán al cerrar.');
    return;
  }
  if (!serialized) return;

  let storedData;
  try {
    storedData = JSON.parse(serialized);
  } catch (error) {
    console.error('Unable to parse saved OrganizaT data.', error);
    showToast('Los datos guardados no se pudieron leer; se mantiene la demo inicial.');
    return;
  }
  if (!isValidStoredData(storedData)) {
    showToast('Los datos guardados no tienen un formato válido; se mantiene la demo inicial.');
    return;
  }

  eventTemplates = storedData.events;
  eventStates = storedData.eventStates;
  joinedInvitationNames = storedData.joinedInvitationNames && typeof storedData.joinedInvitationNames === 'object'
    ? storedData.joinedInvitationNames
    : {};
  currentEvent = eventTemplates.find(event => event.id === storedData.currentEventId);
  restoreEventData(currentEvent.id);
}

function activateEvent(event) {
  saveCurrentEventData();
  currentEvent = event;
  restoreEventData(event.id);
  renderAll();
  const saved = persistAppState();
  if (currentEvent.inviteToken) refreshRemoteAttendees();
  return saved;
}

function createEmptyWorkspaceEvent() {
  return {
    id: 'empty-workspace',
    name: 'Aún no tienes eventos',
    type: 'Organización',
    date: '2099-01-01',
    time: '14:00',
    location: 'Crea tu primer evento',
    description: 'Pulsa «Crear evento» para empezar a organizar tu próximo plan.',
    badge: 'TU ESPACIO',
    capacity: 200,
    allowGuests: false
  };
}

function showEmptyWorkspace() {
  const emptyEvent = createEmptyWorkspaceEvent();
  eventTemplates = [emptyEvent];
  eventStates = { [emptyEvent.id]: createEmptyEventState(emptyEvent) };
  currentEvent = emptyEvent;
  restoreEventData(emptyEvent.id);
  renderAll();
  persistAppState();
}

async function loadOwnedEvents() {
  const result = await requestApi('/api/events');
  if (!result.events.length) {
    showEmptyWorkspace();
    return;
  }
  eventTemplates = result.events;
  eventStates = {};
  result.events.forEach(event => {
    eventStates[event.id] = {
      attendees: cloneData(event.attendees || []),
      tasks: cloneData(event.tasks || []),
      expenses: cloneData(event.expenses || []),
      dateOptions: cloneData(event.dateOptions || []),
      selectedDate: event.date,
      currentVote: '',
      notifications: cloneData(event.notifications || [])
    };
  });
  currentEvent = eventTemplates[0];
  restoreEventData(currentEvent.id);
  renderAll();
  persistAppState();
}

function setAuthMode(mode) {
  authMode = mode;
  const registering = mode === 'register';
  $('#auth-title').textContent = registering ? 'Crea tu cuenta' : 'Inicia sesión';
  $('#auth-description').textContent = registering ? 'Guarda tus eventos y accede a ellos desde cualquier dispositivo.' : 'Accede a tus eventos desde cualquier dispositivo.';
  $$('.auth-name-field').forEach(field => field.classList.toggle('hidden', !registering));
  $('#auth-name').required = registering;
  $('#auth-password').autocomplete = registering ? 'new-password' : 'current-password';
  $('#auth-submit').innerHTML = registering ? 'Crear cuenta <span>✓</span>' : 'Entrar <span>→</span>';
  $('#auth-toggle').textContent = registering ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate';
  $('#auth-feedback').textContent = '';
}

function updateProfileUi() {
  if (!authUser) return;
  const profileName = $('.profile-copy strong');
  const profileRole = $('.profile-copy small');
  const profileAvatar = $('.profile-button .avatar');
  if (profileName) profileName.textContent = authUser.name;
  if (profileRole) profileRole.textContent = authUser.email || 'Organizador';
  if (profileAvatar) {
    const avatarIndex = Number.isInteger(Number(authUser.avatar)) ? Number(authUser.avatar) : 0;
    profileAvatar.style = spriteStyle('/avatars.png', avatarIndex, 4, 3);
    profileAvatar.textContent = '';
  }
}

function openProfile() {
  if (!authUser) return;
  $('#profile-name').value = authUser.name;
  $('#profile-password').value = '';
  selectedAvatarIndex = Number.isInteger(Number(authUser.avatar)) ? Number(authUser.avatar) : 0;
  $('#profile-feedback').textContent = '';
  renderAvatarPicker();
  openDialog('#profile-modal');
}

function updateJoinAuthenticationUi() {
  const accountStatus = $('#join-account-status');
  const loginButton = $('#join-login-button');
  const guestButton = $('#join-guest-button');
  const guestFields = $('#join-guest-fields');
  const partyFields = $('#join-party-fields');
  const nameInput = $('#join-name');
  const submitButton = $('#join-submit');
  if (!accountStatus || !loginButton || !guestButton || !guestFields || !partyFields || !nameInput) return;

  if (authUser) {
    accountStatus.textContent = `Entrarás como ${authUser.name}.`;
    accountStatus.classList.remove('hidden');
    loginButton.classList.add('hidden');
    guestButton.classList.add('hidden');
    guestFields.classList.add('hidden');
    partyFields.classList.remove('hidden');
    submitButton.classList.remove('hidden');
    nameInput.value = authUser.name;
    nameInput.readOnly = true;
    nameInput.required = false;
    maybeSkipJoinConfirmation();
    return;
  }

  accountStatus.classList.add('hidden');
  loginButton.classList.remove('hidden');
  guestButton.classList.remove('hidden');
  guestFields.classList.add('hidden');
  partyFields.classList.add('hidden');
  submitButton.classList.add('hidden');
  nameInput.value = '';
  nameInput.readOnly = false;
  nameInput.required = false;
}

function maybeSkipJoinConfirmation() {
  if (!activeInviteToken || currentEvent.inviteToken !== activeInviteToken || joinAlreadyHandledToken === activeInviteToken) return;
  const knownName = authUser?.name || joinedInvitationNames[activeInviteToken];
  if (!knownName) return;
  const normalizedName = knownName.trim().toLocaleLowerCase('es-ES');
  const alreadyConfirmed = attendees.some(person =>
    person.status !== 'Pendiente' && person.name.trim().toLocaleLowerCase('es-ES') === normalizedName
  );
  if (!alreadyConfirmed) return;
  joinAlreadyHandledToken = activeInviteToken;
  $('#join-modal').close();
  setTab('overview');
  showToast(`Ya estás unido a «${currentEvent.name}».`);
}

async function bootstrapAuth() {
  try {
    const result = await requestApi('/api/auth/me');
    authUser = result.user;
    updateProfileUi();
    if (/^\/join\//.test(window.location.pathname)) {
      updateJoinAuthenticationUi();
    } else {
      await loadOwnedEvents();
    }
  } catch (error) {
    if (error.status === 401) {
      if (!/^\/join\//.test(window.location.pathname)) {
        setAuthMode('login');
        openDialog('#auth-modal');
      }
    } else {
      showToast(error.message);
    }
  }
}

async function deleteCurrentEvent() {
  if (currentEvent.id === 'empty-workspace') {
    showToast('Crea primero un evento para poder eliminarlo.');
    return;
  }

  try {
    $('#confirm-delete').disabled = true;
    if (currentEvent.inviteToken) {
      await requestApi(`/api/invitations/${encodeURIComponent(currentEvent.inviteToken)}`, {
        method: 'DELETE',
        headers: { 'X-Organizer-Token': currentEvent.ownerToken || '' }
      });
    }
    const deletedId = currentEvent.id;
    eventTemplates = eventTemplates.filter(event => event.id !== deletedId);
    delete eventStates[deletedId];
    if (!eventTemplates.length) {
      showEmptyWorkspace();
    } else {
      currentEvent = eventTemplates[0];
      restoreEventData(currentEvent.id);
      renderAll();
      persistAppState();
    }
    $('#delete-confirm-modal').close();
    showToast('Evento eliminado.');
  } catch (error) {
    console.error('Unable to delete event.', error);
    showToast(error.message);
  } finally {
    $('#confirm-delete').disabled = false;
  }
}

function openEventActions() {
  $('#event-actions-title').textContent = currentEvent.name;
  openDialog('#event-actions-modal');
}

function openDeleteConfirmation() {
  $('#event-actions-modal').close();
  $('#delete-confirm-copy').textContent = `Se eliminará «${currentEvent.name}» junto con sus invitaciones, tareas y gastos.`;
  openDialog('#delete-confirm-modal');
}

function startEventEdit() {
  if (!currentEvent || currentEvent.id === 'empty-workspace') return;
  editingEventId = currentEvent.id;
  $('#event-actions-modal').close();
  $('#event-form').reset();
  $('#event-name').value = currentEvent.name;
  $('#event-type').value = currentEvent.type;
  $('#event-guests').value = currentEvent.capacity || 20;
  $('#event-description').value = currentEvent.description || '';
  $('#event-location').value = currentEvent.location || '';
  $('#event-allow-guests').checked = currentEvent.allowGuests !== false;
  wizardImageIndex = Number.isInteger(currentEvent.imageIndex) ? currentEvent.imageIndex : 0;
  wizardStep = 0;
  wizardInvitees = [];
  wizardDates = [{ date: currentEvent.date, time: currentEvent.time || '14:00' }];
  wizardTasks = cloneData(tasks.length ? tasks : [{ name: 'Comida para compartir', quantity: 'Para el grupo', person: '' }]);
  renderEventImagePicker();
  renderWizardInvites();
  renderWizardDates();
  renderWizardTasks();
  $('#wizard-finish').innerHTML = 'Guardar cambios <span>✓</span>';
  openDialog('#event-modal');
  updateWizardStep();
}

function getEventStatePayload() {
  saveCurrentEventData();
  return eventStates[currentEvent.id];
}

async function ensureRemoteInvitation() {
  if (currentEvent.id === 'empty-workspace') {
    throw new Error('Crea primero un evento para poder compartirlo.');
  }
  if (currentEvent.inviteToken && currentEvent.inviteUrl && currentEvent.ownerToken) {
    return { inviteToken: currentEvent.inviteToken, inviteUrl: currentEvent.inviteUrl, ownerToken: currentEvent.ownerToken };
  }
  const state = getEventStatePayload();
  const invitation = await requestApi('/api/events', {
    method: 'POST',
    body: JSON.stringify({
      clientEventId: currentEvent.id,
      event: currentEvent,
      attendees: state.attendees,
      tasks: state.tasks,
      dateOptions: state.dateOptions,
      expenses: state.expenses
    })
  });
  currentEvent.inviteToken = invitation.inviteToken;
  currentEvent.inviteUrl = invitation.inviteUrl;
  currentEvent.ownerToken = invitation.ownerToken;
  persistAppState();
  return invitation;
}

function updateInviteSyncStatus(message) {
  const attendeeStatus = $('#attendee-sync-status');
  const modalStatus = $('#invite-sync-status');
  if (attendeeStatus) attendeeStatus.textContent = message;
  if (modalStatus) modalStatus.textContent = message;
}

function createWhatsAppShareUrl(message) {
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
}

async function refreshRemoteAttendees(showError = false) {
  if (!currentEvent.inviteToken || inviteRefreshInProgress) return;
  inviteRefreshInProgress = true;
  updateInviteSyncStatus('Actualizando confirmaciones…');
  try {
    const invitation = await requestApi(`/api/invitations/${encodeURIComponent(currentEvent.inviteToken)}`);
    currentEvent = { ...currentEvent, ...(invitation.event || {}) };
    eventTemplates = eventTemplates.map(event => event.id === currentEvent.id ? currentEvent : event);
    const refreshedAttendees = invitation.attendees;
    tasks = invitation.tasks;
    dateOptions = invitation.dateOptions;
    expenses = invitation.expenses || [];
    eventNotifications = invitation.notifications || [];
    if (JSON.stringify(attendees) !== JSON.stringify(refreshedAttendees)) {
      attendees = refreshedAttendees;
    }
    saveCurrentEventData();
    renderAll();
    persistAppState();
    updateInviteSyncStatus('Confirmaciones sincronizadas.');
  } catch (error) {
    console.error('Unable to refresh remote event attendees.', error);
    updateInviteSyncStatus('No se pudieron actualizar las confirmaciones.');
    if (showError) showToast(error.message);
  } finally {
    inviteRefreshInProgress = false;
  }
}

async function syncRemoteEventState(showError = false) {
  if (!currentEvent.inviteToken) return;
  if (remoteStateSyncInProgress) {
    remoteStateSyncQueued = true;
    return;
  }
  remoteStateSyncInProgress = true;
  try {
    const state = getEventStatePayload();
    const invitation = await requestApi(`/api/invitations/${encodeURIComponent(currentEvent.inviteToken)}/state`, {
      method: 'PATCH',
      headers: { 'X-Organizer-Token': currentEvent.ownerToken },
      body: JSON.stringify({ tasks: state.tasks, dateOptions: state.dateOptions, expenses: state.expenses })
    });
    tasks = invitation.tasks;
    dateOptions = invitation.dateOptions;
    expenses = invitation.expenses || [];
    saveCurrentEventData();
    renderAll();
    persistAppState();
    updateInviteSyncStatus('Cambios compartidos con el grupo.');
  } catch (error) {
    console.error('Unable to synchronize shared event data.', error);
    updateInviteSyncStatus('No se pudieron compartir los últimos cambios.');
    if (showError) showToast(error.message);
  } finally {
    remoteStateSyncInProgress = false;
    if (remoteStateSyncQueued) {
      remoteStateSyncQueued = false;
      syncRemoteEventState(showError);
    }
  }
}

async function openInviteFlow() {
  $('#invite-event-summary').textContent = `Preparando invitación para «${currentEvent.name}»…`;
  $('#invite-link').textContent = 'Generando enlace privado…';
  $('#whatsapp-share-link').removeAttribute('href');
  openDialog('#invite-modal');
  try {
    const invitation = await ensureRemoteInvitation();
    const inviteUrl = invitation.inviteUrl;
    const dateText = formatDateLong(currentEvent.date);
    $('#invite-event-summary').textContent = `Comparte el enlace para que el grupo confirme su asistencia a «${currentEvent.name}».`;
    $('#invite-link').textContent = inviteUrl;
    $('#whatsapp-share-link').href = createWhatsAppShareUrl(`¡Hola! Te invito a «${currentEvent.name}» el ${dateText} a las ${currentEvent.time || '14:00'} en ${currentEvent.location}. Confirma aquí: ${inviteUrl}`);
    updateInviteSyncStatus('Los invitados que confirmen aparecerán en la lista.');
  } catch (error) {
    console.error('Unable to create the event invitation.', error);
    $('#invite-modal').close();
    showToast(error.message);
  }
}

function personColor(name) {
  const person = attendees.find(item => item.name === name);
  return person ? person.color : colors[name.length % colors.length];
}

function initials(name) {
  return name.split(' ').map(part => part[0]).slice(0, 2).join('');
}

function renderTaskRow(task, index, interactive = false) {
  const owner = task.person
    ? `<span class="mini-avatar" style="background:${personColor(task.person)}">${initials(task.person)}</span>${task.person.split(' ')[0]}`
    : '<span class="mini-avatar unassigned">＋</span>Pendiente';
  return `<div class="task-row">
    <button class="task-check ${task.done ? 'done' : ''}" data-task-index="${index}" aria-label="${task.done ? 'Marcar pendiente' : 'Marcar completado'}" ${interactive ? '' : 'tabindex="-1"'}>${task.done ? '✓' : ''}</button>
    <span class="task-main"><strong>${escapeHtml(task.name)}</strong><small>${escapeHtml(task.quantity || 'Cantidad por definir')}</small></span>
    <span class="task-owner">${owner}</span>
  </div>`;
}

function renderTasks() {
  const assignedCount = tasks.filter(task => task.person).length;
  $('#task-preview').innerHTML = tasks.slice(0, 5).map((task, index) => renderTaskRow(task, index)).join('');
  $('#task-board').innerHTML = tasks.map((task, index) => renderTaskRow(task, index, true)).join('');
  $('#task-progress').textContent = `${assignedCount} de ${tasks.length}`;
  $('#status-unassigned-count').textContent = tasks.length - assignedCount;
  $('#nav-task-count').textContent = tasks.length;

  $$('.task-check').forEach(button => {
    button.addEventListener('click', () => {
      const task = tasks[Number(button.dataset.taskIndex)];
      task.done = !task.done;
      renderTasks();
      persistAppState();
      syncRemoteEventState();
    });
  });
}

function renderAttendees() {
  const confirmedPeople = attendees.filter(person => person.status !== 'Pendiente');
  const confirmed = confirmedPeople.reduce((total, person) => total + attendeePeopleCount(person), 0);
  const pending = attendees.filter(person => person.status === 'Pendiente').length;
  $('#hero-attendee-count').textContent = confirmed;
  $('#hero-attendee-label').textContent = confirmed === 1 ? 'confirmado' : 'confirmados';
  $('#status-attendee-count').textContent = confirmed;
  $('#status-attendee-label').textContent = confirmed === 1 ? 'persona' : 'personas';
  $('#attendee-title-count').textContent = confirmed;
  $('#nav-attendee-count').textContent = confirmed;
  $('#pending-count').textContent = pending;
  $('#pending-label').textContent = pending === 1 ? 'pendiente' : 'pendientes';
  $('#status-pending-count').textContent = pending;
  $('#split-count').textContent = confirmed;
  $('#avatar-stack').innerHTML = confirmedPeople.slice(0, 4).map(person =>
    `<span class="avatar" style="background:${person.color}">${escapeHtml(person.initial)}</span>`
  ).join('') + (confirmedPeople.length > 4 ? `<span class="avatar avatar-extra">+${confirmedPeople.length - 4}</span>` : '');
  $('#avatar-stack').setAttribute('aria-label', `${confirmed} ${confirmed === 1 ? 'asistente confirmado' : 'asistentes confirmados'}`);
  const organizerConfirmed = attendees[0]?.status !== 'Pendiente';
  $('#confirm-button').classList.toggle('confirmed', organizerConfirmed);
  $('#confirm-button-text').textContent = organizerConfirmed ? 'Asistencia confirmada' : 'Confirmar asistencia';

  $('#attendee-strip').innerHTML = attendees.slice(0, 6).map(person =>
    `<div class="person-chip"><span class="avatar" style="background:${person.color}">${person.initial}</span><span>${escapeHtml(person.name.split(' ')[0])}</span></div>`
  ).join('');
  $('#attendee-list').innerHTML = attendees.map((person, index) => `
    <div class="attendee-list-row">
      <span class="avatar" style="background:${person.color}">${person.initial}</span>
      <span class="attendee-list-name"><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(person.role)} · ${escapeHtml(attendeePartyLabel(person))}</small></span>
      <span class="attendance-status ${person.status === 'Pendiente' ? 'pending' : ''}">${person.status === 'Pendiente' ? 'Por confirmar' : person.status}</span>
      ${index > 0 ? `<button class="attendee-delete-button" type="button" data-delete-attendee="${index}" aria-label="Eliminar a ${escapeHtml(person.name)}">×</button>` : ''}
    </div>`).join('');
  populatePeopleOptions();
}

function openAttendeeDeleteConfirmation(index) {
  const person = attendees[index];
  if (!person || index === 0) return;
  attendeeToDeleteIndex = index;
  $('#attendee-delete-confirm-copy').textContent = `Se eliminará a «${person.name}» aunque su asistencia esté ${person.status === 'Pendiente' ? 'pendiente' : 'confirmada'}.`;
  openDialog('#attendee-delete-confirm-modal');
}

async function deleteSelectedAttendee() {
  const index = attendeeToDeleteIndex;
  const person = attendees[index];
  if (!person) return;
  const button = $('#confirm-attendee-delete');
  button.disabled = true;
  try {
    let remoteAttendees = null;
    if (currentEvent.inviteToken && currentEvent.ownerToken && person.id) {
      const invitation = await requestApi(`/api/invitations/${encodeURIComponent(currentEvent.inviteToken)}/attendees/${encodeURIComponent(person.id)}`, {
        method: 'DELETE',
        headers: { 'X-Organizer-Token': currentEvent.ownerToken }
      });
      remoteAttendees = invitation.attendees;
    }
    attendees = remoteAttendees || attendees.filter((_, attendeeIndex) => attendeeIndex !== index);
    renderAll();
    persistAppState();
    $('#attendee-delete-confirm-modal').close();
    attendeeToDeleteIndex = null;
    showToast('Asistente eliminado.');
  } catch (error) {
    console.error('Unable to delete attendee.', error);
    showToast(error.message);
  } finally {
    button.disabled = false;
  }
}

function renderExpenses() {
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const confirmed = attendees.filter(person => person.status !== 'Pendiente')
    .reduce((totalPeople, person) => totalPeople + attendeePeopleCount(person), 0);
  const share = confirmed ? total / confirmed : 0;
  $('#total-expenses').textContent = euro(total);
  $('#expense-total-large').textContent = euro(total);
  $('#per-person-total').textContent = euro(share);
  $('#ticket-count').textContent = expenses.length;
  $('#split-count').textContent = confirmed;
  $('#expense-list').innerHTML = expenses.map(expense => `
    <div class="expense-entry">
      <span class="expense-symbol">↗</span>
      <span class="expense-entry-copy"><strong>${escapeHtml(expense.name)}</strong><small>Pagado por ${escapeHtml(expense.person)} · ${escapeHtml(expense.date)}</small></span>
      <span class="expense-entry-amount">${euro(expense.amount)}</span>
    </div>`).join('');

  const totalCents = Math.round(total * 100);
  const baseShareCents = confirmed ? Math.floor(totalCents / confirmed) : 0;
  const extraShareCents = confirmed ? totalCents % confirmed : 0;
  const paidByPerson = new Map();
  expenses.forEach(expense => {
    const paidCents = Math.round(expense.amount * 100);
    paidByPerson.set(expense.person, (paidByPerson.get(expense.person) || 0) + paidCents);
  });
  const balances = attendees.filter(person => person.status !== 'Pendiente')
    .map((person, index) => {
      const personShareCents = baseShareCents + (index < extraShareCents ? 1 : 0);
      return { ...person, balance: ((paidByPerson.get(person.name) || 0) - personShareCents) / 100 };
    })
    .filter(person => Math.abs(person.balance) > 0.005)
    .sort((a, b) => b.balance - a.balance);
  $('#balances-list').innerHTML = balances.map(person => `
    <div class="balance-entry">
      <span class="mini-avatar" style="background:${person.color}">${person.initial}</span>
      <strong>${escapeHtml(person.name)}</strong>
      <span class="owes-note">${person.balance > 0 ? 'Ha adelantado' : 'Le corresponde'}</span>
      <span class="balance-amount ${person.balance < 0 ? 'owes' : ''}">${person.balance > 0 ? '+' : '−'}${euro(Math.abs(person.balance))}</span>
    </div>`).join('') || '<p class="panel-subtitle">Todavía no hay cuentas que repartir.</p>';
}

function renderDateOptions() {
  const container = $('#date-options');
  if (!container) return;
  const maxVotes = Math.max(1, ...dateOptions.map(option => option.votes));
  container.innerHTML = dateOptions.map(option => `
    <button class="date-option ${selectedDate === option.date ? 'selected' : ''}" data-date="${option.date}" type="button">
      <span class="date-label"><strong>${formatDateLong(option.date)}</strong><small>${escapeHtml(option.time)}</small></span>
      <span class="vote-count">${option.votes} ${option.votes === 1 ? 'voto' : 'votos'}</span>
      <span class="vote-bar"><i style="width:${Math.max(14, (option.votes / maxVotes) * 100)}%"></i></span>
    </button>
  `).join('');
  const totalVotes = dateOptions.reduce((sum, option) => sum + option.votes, 0);
  $('#vote-message').textContent = currentVote ? `Tu voto: ${formatDateLong(currentVote)}` : `${totalVotes} votos registrados`;
  $('#add-vote-button').textContent = currentVote && selectedDate === currentVote ? 'Votado ✓' : 'Votar →';
}

function populatePeopleOptions() {
  const options = attendees.map(person => `<option value="${escapeHtml(person.name)}">${escapeHtml(person.name)}</option>`).join('');
  $('#task-person').innerHTML = `<option value="">Sin asignar</option>${options}`;
  $('#expense-person').innerHTML = options;
}

function renderEventGallery() {
  const gallery = $('#event-gallery');
  if (!gallery) return;
  const eventCount = $('.main-nav .nav-count');
  if (eventCount) eventCount.textContent = eventTemplates[0]?.id === 'empty-workspace' ? '0' : String(eventTemplates.length);
  gallery.innerHTML = eventTemplates.map(event => `
    <button class="event-gallery-card ${event.id === currentEvent.id ? 'active' : ''}" data-event-id="${event.id}" type="button">
      <span class="event-card-image" style="${spriteStyle('eventos.png', Number.isInteger(event.imageIndex) ? event.imageIndex : 0, 3, 3)}" aria-hidden="true"></span>
      <span class="tag">${escapeHtml(event.badge)}</span>
      <h3>${escapeHtml(event.name)}</h3>
      <p>${escapeHtml(event.description)}</p>
      <div class="meta">
        <span>${formatDate(event.date)}</span>
        <span>${escapeHtml(event.location)}</span>
      </div>
    </button>
  `).join('');
  $$('.event-gallery-card').forEach(card => {
    card.addEventListener('click', () => {
      const selected = eventTemplates.find(event => event.id === card.dataset.eventId);
      if (selected) {
        if (activateEvent(selected)) showToast(`Mostrando ${selected.name}`);
      }
    });
  });
}

function formatDate(dateValue) {
  const date = new Date(dateValue + 'T12:00:00');
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(date).replace('.', '');
}

function formatDateLong(dateValue) {
  const date = new Date(dateValue + 'T12:00:00');
  return capitalize(new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).format(date).replace('.', ''));
}

function renderCurrentEvent() {
  const title = $('.breadcrumbs strong');
  if (title) title.textContent = currentEvent.name;
  const heroTitle = document.querySelector('.event-hero h1');
  if (heroTitle) heroTitle.innerHTML = `${escapeHtml(currentEvent.name).replace(/ /g, '&nbsp;')}`;
  const heroKicker = document.querySelector('.event-kicker');
  if (heroKicker) heroKicker.innerHTML = `<span class="kicker-dot"></span> ${escapeHtml(currentEvent.badge.toUpperCase())} <span class="kicker-separator">·</span> ${escapeHtml(currentEvent.type.toUpperCase())}`;
  const heroDescription = document.querySelector('.hero-description');
  if (heroDescription) heroDescription.textContent = currentEvent.description;
  const heroImage = document.querySelector('.hero-image');
  if (heroImage) {
    const imageIndex = Number.isInteger(currentEvent.imageIndex) ? currentEvent.imageIndex : 0;
    heroImage.style.backgroundImage = "url('/eventos.png')";
    heroImage.style.backgroundSize = '300% 300%';
    heroImage.style.backgroundPosition = `${(imageIndex % 3) * 50}% ${Math.floor(imageIndex / 3) * 50}%`;
    heroImage.classList.add('event-image-selected');
  }
  const meta = document.querySelectorAll('.meta-item strong');
  if (meta.length > 0) {
    const dateText = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(currentEvent.date + 'T12:00:00'));
    meta[0].textContent = capitalize(dateText);
    meta[1].textContent = currentEvent.location;
  }
  const dateMeta = document.querySelector('.meta-item small');
  if (dateMeta) dateMeta.textContent = `${currentEvent.time || '14:00'} h`;
  const locationMeta = document.querySelector('.meta-item:nth-child(2) small');
  if (locationMeta) {
    const mapQuery = encodeURIComponent(currentEvent.location);
    locationMeta.innerHTML = `<span>${escapeHtml(currentEvent.location)}</span> <a href="https://www.google.com/maps/search/?api=1&query=${mapQuery}" class="map-link" target="_blank" rel="noopener noreferrer">Ver mapa ↗</a>`;
  }
  const heading = document.querySelector('.breadcrumbs strong');
  if (heading) heading.textContent = currentEvent.name;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function setTab(tab) {
  const validTabs = ['events', 'overview', 'attendees', 'tasks', 'expenses', 'inbox'];
  currentTab = validTabs.includes(tab) ? tab : 'overview';
  const showOverview = currentTab === 'overview';
  const showEventGallery = currentTab === 'overview' || currentTab === 'events';
  $('#event-gallery').classList.toggle('hidden', !showEventGallery);
  $('.event-hero').classList.toggle('hidden', !showOverview);
  $('.event-status').classList.toggle('hidden', !showOverview);
  $('.content-grid').classList.toggle('hidden', !showOverview);
  $('#plan-panel').classList.toggle('hidden', !showOverview);
  $('.date-panel').classList.toggle('hidden', !showOverview);
  $('.attendees-panel').classList.toggle('hidden', !showOverview);
  $('#attendees-view').classList.toggle('hidden', currentTab !== 'attendees');
  $('#tasks-view').classList.toggle('hidden', currentTab !== 'tasks');
  $('#expenses-view').classList.toggle('hidden', currentTab !== 'expenses');
  $('#inbox-view').classList.toggle('hidden', currentTab !== 'inbox');
  $$('.sidebar .nav-link[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === currentTab));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

$$('[data-tab]').forEach(button => button.addEventListener('click', () => setTab(button.dataset.tab)));

$('.notification-button').addEventListener('click', () => setTab('inbox'));

function renderNotifications() {
  const pendingAttendees = attendees.filter(person => person.status === 'Pendiente').length;
  const unassignedTasks = tasks.filter(task => !task.person).length;
  const notifications = [];

  eventNotifications.slice().reverse().forEach(notification => {
    notifications.push({
      icon: '!',
      title: notification.title || 'Evento actualizado',
      detail: notification.detail || 'Hay cambios nuevos en este evento.',
      tab: 'overview'
    });
  });

  if (pendingAttendees) {
    notifications.push({ icon: '♙', title: `${pendingAttendees} persona${pendingAttendees === 1 ? '' : 's'} por confirmar`, detail: `Revisa quién falta por responder en «${currentEvent.name}».`, tab: 'attendees' });
  }
  if (unassignedTasks) {
    notifications.push({ icon: '☷', title: `${unassignedTasks} tarea${unassignedTasks === 1 ? '' : 's'} sin responsable`, detail: 'Asigna lo que falta para que el grupo pueda organizarse.', tab: 'tasks' });
  }
  if (currentEvent.inviteToken) {
    notifications.push({ icon: '↗', title: 'Invitación activa', detail: 'Las nuevas confirmaciones se sincronizan automáticamente.', tab: 'attendees' });
  }
  if (!notifications.length) {
    notifications.push({ icon: '✓', title: 'Todo al día', detail: 'No hay avisos pendientes en este momento.', tab: 'overview' });
  }

  $('#notifications-list').innerHTML = notifications.map(notification => `
    <button class="notification-entry" data-notification-tab="${notification.tab}">
      <span class="notification-entry-icon">${notification.icon}</span>
      <span class="notification-entry-copy"><strong>${escapeHtml(notification.title)}</strong><small>${escapeHtml(notification.detail)}</small></span>
      <span class="notification-entry-arrow">→</span>
    </button>
  `).join('');
  $$('#notifications-list [data-notification-tab]').forEach(button => button.addEventListener('click', () => setTab(button.dataset.notificationTab)));
}

$('#confirm-button').addEventListener('click', () => {
  const me = attendees[0];
  if (me.status === 'Pendiente') {
    me.status = 'Confirmado';
    $('#confirm-button').classList.add('confirmed');
    $('#confirm-button-text').textContent = '¡Ya estás apuntado!';
    showToast('¡Genial! Ya has confirmado tu asistencia.');
  } else {
    me.status = 'Pendiente';
    $('#confirm-button').classList.remove('confirmed');
    $('#confirm-button-text').textContent = 'Confirmar asistencia';
    showToast('Has cambiado tu respuesta a pendiente.');
  }
  renderAttendees();
  renderExpenses();
  persistAppState();
});

$('#date-options').addEventListener('click', event => {
  const button = event.target.closest('.date-option');
  if (!button) return;
  selectedDate = button.dataset.date;
  renderDateOptions();
  persistAppState();
});

$('#add-vote-button').addEventListener('click', () => {
  if (!selectedDate) {
    showToast('Elige primero la fecha que prefieres.');
    return;
  }
  if (selectedDate === currentVote) {
    showToast('Ya has votado por esa fecha.');
    return;
  }
  if (currentVote) {
    const previousOption = dateOptions.find(option => option.date === currentVote);
    if (previousOption) previousOption.votes = Math.max(0, previousOption.votes - 1);
  }
  const selectedOption = dateOptions.find(option => option.date === selectedDate);
  if (!selectedOption) return;
  selectedOption.votes += 1;
  currentVote = selectedDate;
  renderDateOptions();
  $('#vote-message').textContent = `¡Voto registrado para ${formatDateLong(selectedDate)}!`;
  $('#add-vote-button').textContent = 'Votado ✓';
  if (persistAppState()) showToast(`Tu voto para ${formatDateLong(selectedDate)} se ha guardado.`);
  syncRemoteEventState();
});

function openDialog(id) {
  const dialog = $(id);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

$('#open-task-modal').addEventListener('click', () => openDialog('#task-modal'));
$('#open-task-modal-secondary').addEventListener('click', () => openDialog('#task-modal'));
$('#open-expense-modal').addEventListener('click', () => openDialog('#expense-modal'));
$('#invite-button').addEventListener('click', openInviteFlow);
$('#share-button').addEventListener('click', openInviteFlow);
$('#create-event-button').addEventListener('click', startEventWizard);
$('#delete-event-button').addEventListener('click', openEventActions);
$('#edit-event-button').addEventListener('click', startEventEdit);
$('#open-delete-confirm').addEventListener('click', openDeleteConfirmation);
$('#cancel-delete').addEventListener('click', () => $('#delete-confirm-modal').close());
$('#confirm-delete').addEventListener('click', deleteCurrentEvent);
$('#attendee-list').addEventListener('click', event => {
  const button = event.target.closest('[data-delete-attendee]');
  if (!button) return;
  openAttendeeDeleteConfirmation(Number(button.dataset.deleteAttendee));
});
$('#cancel-attendee-delete').addEventListener('click', () => {
  attendeeToDeleteIndex = null;
  $('#attendee-delete-confirm-modal').close();
});
$('#confirm-attendee-delete').addEventListener('click', deleteSelectedAttendee);
$$('.modal-close').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));

$('#auth-toggle').addEventListener('click', () => setAuthMode(authMode === 'login' ? 'register' : 'login'));
$('#auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const submitButton = $('#auth-submit');
  submitButton.disabled = true;
  $('#auth-feedback').textContent = authMode === 'register' ? 'Creando tu cuenta…' : 'Comprobando tus datos…';
  try {
    const result = await requestApi(`/api/auth/${authMode}`, {
      method: 'POST',
      body: JSON.stringify({ name: form.get('name'), email: form.get('email'), password: form.get('password') })
    });
    authUser = result.user;
    const profileName = $('.profile-copy strong');
    if (profileName) profileName.textContent = authUser.name;
    $('#auth-modal').close();
    if (activeInviteToken) {
      updateJoinAuthenticationUi();
      openDialog('#join-modal');
      showToast(`Sesión iniciada como ${authUser.name}.`);
    } else {
      await loadOwnedEvents();
      showToast(`Bienvenido, ${authUser.name}.`);
    }
  } catch (error) {
    $('#auth-feedback').textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});

$('#join-login-button').addEventListener('click', () => {
  $('#join-modal').close();
  setAuthMode('login');
  openDialog('#auth-modal');
});

$('#join-guest-button').addEventListener('click', () => {
  $('#join-guest-fields').classList.remove('hidden');
  $('#join-party-fields').classList.remove('hidden');
  $('#join-submit').classList.remove('hidden');
  $('#join-name').required = true;
  $('#join-guest-button').classList.add('hidden');
  $('#join-name').focus();
});

$('#profile-button').addEventListener('click', openProfile);

$('#avatar-picker').addEventListener('click', event => {
  const choice = event.target.closest('[data-avatar-index]');
  if (!choice) return;
  selectedAvatarIndex = Number(choice.dataset.avatarIndex);
  renderAvatarPicker();
});

$('#profile-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const submitButton = $('#profile-submit');
  submitButton.disabled = true;
  $('#profile-feedback').textContent = 'Guardando cambios…';
  try {
    const result = await requestApi('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify({ name: form.get('name'), password: form.get('password'), avatar: String(selectedAvatarIndex) })
    });
    authUser = result.user;
    updateProfileUi();
    $('#profile-modal').close();
    showToast('Perfil actualizado.');
  } catch (error) {
    $('#profile-feedback').textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});

$('#logout-button').addEventListener('click', async () => {
  $('#profile-modal').close();
  try {
    await requestApi('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) });
  } catch (error) {
    console.error('Unable to close the organizer session.', error);
  }
  authUser = null;
  try { localStorage.removeItem(storageKey); } catch (error) { console.error('Unable to clear local organizer data.', error); }
  showEmptyWorkspace();
  setAuthMode('login');
  openDialog('#auth-modal');
});

function localDateAfter(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function startEventWizard() {
  editingEventId = null;
  $('#event-form').reset();
  wizardStep = 0;
  wizardImageIndex = 0;
  renderEventImagePicker();
  wizardInvitees = [];
  wizardDates = [
    { date: localDateAfter(7), time: '14:00' },
    { date: localDateAfter(14), time: '14:00' }
  ];
  wizardTasks = [{ name: 'Comida para compartir', quantity: 'Para el grupo', person: '' }];
  renderWizardInvites();
  renderWizardDates();
  renderWizardTasks();
  $('#wizard-finish').innerHTML = 'Crear evento <span>✓</span>';
  updateWizardStep();
  openDialog('#event-modal');
}

function updateWizardStep() {
  $$('[data-wizard-panel]').forEach((panel, index) => panel.classList.toggle('hidden', index !== wizardStep));
  $$('[data-step-indicator]').forEach((indicator, index) => {
    indicator.classList.toggle('active', index === wizardStep);
    indicator.classList.toggle('complete', index < wizardStep);
  });
  $('#wizard-title').textContent = [
    'Empecemos por el plan',
    '¿A quién invitamos?',
    'Busquemos el mejor día',
    '¿Qué hace falta llevar?'
  ][wizardStep];
  $('#wizard-description').textContent = [
    'Cuéntanos qué vas a organizar.',
    'Añade a las personas con las que quieres compartirlo.',
    'Propón fechas y elige la que mejor te venga.',
    'Deja preparada una lista para organizarse entre todos.'
  ][wizardStep];
  $('#wizard-step-caption').textContent = `Paso ${wizardStep + 1} de 4`;
  $('#wizard-back').classList.toggle('hidden', wizardStep === 0);
  $('#wizard-next').classList.toggle('hidden', wizardStep === 3);
  $('#wizard-finish').classList.toggle('hidden', wizardStep !== 3);
}

function validateWizardStep() {
  if (wizardStep === 0) {
    const name = $('#event-name');
    const location = $('#event-location');
    if (!name.value.trim()) {
      name.focus();
      name.reportValidity();
      return false;
    }
    if (!location.value.trim()) {
      location.focus();
      location.reportValidity();
      return false;
    }
    const capacity = Number($('#event-guests').value);
    if (!Number.isInteger(capacity) || capacity < 2 || capacity > 200) {
      $('#event-guests').focus();
      showToast('El aforo debe estar entre 2 y 200 personas.');
      return false;
    }
  }
  if (wizardStep === 2) {
    if (!wizardDates.length || wizardDates.some(option => !option.date || !option.time)) {
      showToast('Completa la fecha y hora de cada opción.');
      return false;
    }
    if (wizardDates.some(option => option.date < localDateAfter(0))) {
      showToast('Las fechas propuestas deben ser hoy o posteriores.');
      return false;
    }
    const uniqueOptions = new Set(wizardDates.map(option => `${option.date}-${option.time}`));
    if (uniqueOptions.size !== wizardDates.length) {
      showToast('No repitas la misma fecha y hora.');
      return false;
    }
    if (!$('#wizard-vote-choice input:checked')) {
      showToast('Elige la fecha que prefieres para registrar tu voto.');
      return false;
    }
  }
  if (wizardStep === 3 && !wizardTasks.some(task => task.name.trim())) {
    showToast('Añade al menos una cosa a la lista para continuar.');
    $('#wizard-task-list input[name="task-name"]').focus();
    return false;
  }
  return true;
}

$('#wizard-next').addEventListener('click', () => {
  if (!validateWizardStep()) return;
  wizardStep = Math.min(3, wizardStep + 1);
  updateWizardStep();
});
$('#wizard-back').addEventListener('click', () => {
  wizardStep = Math.max(0, wizardStep - 1);
  updateWizardStep();
});

function renderWizardInvites() {
  const list = $('#wizard-invite-list');
  list.innerHTML = wizardInvitees.length
    ? wizardInvitees.map((email, index) => `<span class="invite-chip">${escapeHtml(email)}<button type="button" data-remove-invite="${index}" aria-label="Quitar ${escapeHtml(email)}">×</button></span>`).join('')
    : '<span class="empty-hint">Todavía no has añadido a nadie.</span>';
}

function addWizardInvites() {
  const input = $('#invite-emails');
  const entries = input.value.split(/[,;\s]+/).map(email => email.trim()).filter(Boolean);
  if (!entries.length) {
    showToast('Escribe al menos un correo electrónico.');
    input.focus();
    return;
  }
  const invalid = entries.find(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  if (invalid) {
    showToast(`Revisa este correo: ${invalid}`);
    input.focus();
    return;
  }
  entries.forEach(email => {
    if (!wizardInvitees.some(existing => existing.toLowerCase() === email.toLowerCase())) wizardInvitees.push(email);
  });
  input.value = '';
  renderWizardInvites();
  renderWizardTasks();
}

$('#add-wizard-invite').addEventListener('click', addWizardInvites);
$('#event-image-picker').addEventListener('click', event => {
  const choice = event.target.closest('[data-event-image]');
  if (!choice) return;
  wizardImageIndex = Number(choice.dataset.eventImage);
  renderEventImagePicker();
});
$('#invite-emails').addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    addWizardInvites();
  }
});
$('#wizard-invite-list').addEventListener('click', event => {
  const button = event.target.closest('[data-remove-invite]');
  if (!button) return;
  const [removedEmail] = wizardInvitees.splice(Number(button.dataset.removeInvite), 1);
  wizardTasks.forEach(task => {
    if (task.person === removedEmail) task.person = '';
  });
  renderWizardInvites();
  renderWizardTasks();
});

function renderWizardDates() {
  const list = $('#wizard-date-list');
  list.innerHTML = wizardDates.map((option, index) => `
    <div class="wizard-date-row" data-wizard-date-index="${index}">
      <label>Fecha<input type="date" min="${localDateAfter(0)}" value="${escapeHtml(option.date)}" data-date-index="${index}"></label>
      <label>Hora<input type="time" value="${escapeHtml(option.time)}" data-time-index="${index}"></label>
      <button class="remove-wizard-row" type="button" data-remove-date="${index}" aria-label="Quitar fecha">×</button>
    </div>`).join('');
  renderWizardVoteChoices();
}

function renderWizardVoteChoices() {
  const choices = $('#wizard-vote-choice');
  if (!choices) return;
  const selectedDate = choices.querySelector('input:checked')?.value || (wizardDates[0] ? `${wizardDates[0].date}-${wizardDates[0].time}` : '');
  choices.innerHTML = wizardDates.map(option => {
    const value = `${option.date}-${option.time}`;
    return `<label class="wizard-vote-option"><input type="radio" name="organizer-vote" value="${escapeHtml(value)}" ${value === selectedDate ? 'checked' : ''}><span>${formatDateLong(option.date)} · ${escapeHtml(option.time)}</span></label>`;
  }).join('');
}

$('#wizard-date-list').addEventListener('input', event => {
  const dateIndex = event.target.dataset.dateIndex;
  const timeIndex = event.target.dataset.timeIndex;
  if (dateIndex !== undefined) wizardDates[Number(dateIndex)].date = event.target.value;
  if (timeIndex !== undefined) wizardDates[Number(timeIndex)].time = event.target.value;
  renderWizardVoteChoices();
});
$('#wizard-date-list').addEventListener('click', event => {
  const button = event.target.closest('[data-remove-date]');
  if (!button) return;
  wizardDates.splice(Number(button.dataset.removeDate), 1);
  renderWizardDates();
});
$('#add-wizard-date').addEventListener('click', () => {
  wizardDates.push({ date: localDateAfter(21), time: '14:00' });
  renderWizardDates();
});

function renderWizardTasks() {
  const list = $('#wizard-task-list');
  const inviteOptions = wizardInvitees.map(email => `<option value="${escapeHtml(email)}">${escapeHtml(email)}</option>`).join('');
  const organizerName = authUser?.name || 'Diego Navarro';
  list.innerHTML = wizardTasks.map((task, index) => `
    <div class="wizard-task-row" data-wizard-task-index="${index}">
      <label>Qué hay que llevar<input name="task-name" maxlength="50" value="${escapeHtml(task.name)}" placeholder="Ej. Hielo"></label>
      <label>Cantidad<input name="task-quantity" maxlength="30" value="${escapeHtml(task.quantity)}" placeholder="Ej. 2 bolsas"></label>
      <label>Responsable<select name="task-person"><option value="">Pendiente</option><option value="${escapeHtml(organizerName)}" ${task.person === organizerName ? 'selected' : ''}>${escapeHtml(organizerName)}</option>${inviteOptions.replace(`value="${escapeHtml(task.person)}"`, `value="${escapeHtml(task.person)}" selected`)}</select></label>
      <button class="remove-wizard-row" type="button" data-remove-task="${index}" aria-label="Quitar tarea">×</button>
    </div>`).join('');
}

$('#wizard-task-list').addEventListener('input', event => {
  const row = event.target.closest('[data-wizard-task-index]');
  if (!row) return;
  const task = wizardTasks[Number(row.dataset.wizardTaskIndex)];
  if (event.target.name === 'task-name') task.name = event.target.value;
  if (event.target.name === 'task-quantity') task.quantity = event.target.value;
});
$('#wizard-task-list').addEventListener('change', event => {
  const row = event.target.closest('[data-wizard-task-index]');
  if (row && event.target.name === 'task-person') wizardTasks[Number(row.dataset.wizardTaskIndex)].person = event.target.value;
});
$('#wizard-task-list').addEventListener('click', event => {
  const button = event.target.closest('[data-remove-task]');
  if (!button) return;
  wizardTasks.splice(Number(button.dataset.removeTask), 1);
  renderWizardTasks();
});
$('#add-wizard-task').addEventListener('click', () => {
  wizardTasks.push({ name: '', quantity: '', person: '' });
  renderWizardTasks();
  $('#wizard-task-list .wizard-task-row:last-child input[name="task-name"]').focus();
});

async function completeEventWizard() {
  if (!validateWizardStep()) return;
  const form = new FormData($('#event-form'));
  if (editingEventId) {
    const selectedOption = wizardDates[0];
    if (!selectedOption || !selectedOption.date || !selectedOption.time) {
      showToast('Completa el día y la hora del evento.');
      return;
    }
    const nextEvent = {
      ...currentEvent,
      name: String(form.get('name') || '').trim(),
      type: String(form.get('type') || 'Evento'),
      date: selectedOption.date,
      time: selectedOption.time,
      location: String(form.get('location') || '').trim(),
      description: String(form.get('description') || '').trim(),
      capacity: Number(form.get('guests')) || 20,
      allowGuests: form.get('allowGuests') === 'on',
      imageIndex: wizardImageIndex
    };
    const finishButton = $('#wizard-finish');
    finishButton.disabled = true;
    try {
      if (currentEvent.inviteToken) {
        const invitation = await requestApi(`/api/invitations/${encodeURIComponent(currentEvent.inviteToken)}/event`, {
          method: 'PATCH',
          headers: { 'X-Organizer-Token': currentEvent.ownerToken || '' },
          body: JSON.stringify({ event: nextEvent })
        });
        currentEvent = { ...currentEvent, ...invitation.event };
        eventNotifications = invitation.notifications || eventNotifications;
      } else {
        currentEvent = nextEvent;
      }
      eventTemplates = eventTemplates.map(event => event.id === editingEventId ? currentEvent : event);
      tasks = wizardTasks.filter(task => task.name && task.name.trim()).map(task => ({ ...task, name: task.name.trim(), quantity: (task.quantity || '').trim() }));
      dateOptions = [{ date: currentEvent.date, time: currentEvent.time, votes: 1 }];
      selectedDate = currentEvent.date;
      saveCurrentEventData();
      renderAll();
      persistAppState();
      $('#event-modal').close();
      showToast('Evento actualizado. El grupo verá el aviso al sincronizar.');
    } catch (error) {
      console.error('Unable to update event.', error);
      showToast(error.message);
    } finally {
      finishButton.disabled = false;
      editingEventId = null;
      $('#wizard-finish').innerHTML = 'Crear evento <span>✓</span>';
    }
    return;
  }
  const chosenVote = $('#wizard-vote-choice input:checked').value;
  const selectedOption = wizardDates.find(option => `${option.date}-${option.time}` === chosenVote);
  if (!selectedOption) {
    showToast('Selecciona una de las fechas propuestas.');
    return;
  }
  const capacity = Number(form.get('guests')) || 20;
  if (wizardInvitees.length + 1 > capacity) {
    wizardStep = 0;
    updateWizardStep();
    showToast(`El aforo de ${capacity} personas no alcanza para el grupo invitado.`);
    return;
  }
  const name = String(form.get('name') || '').trim();
  const type = String(form.get('type') || 'Evento');
  const description = String(form.get('description') || '').trim();
  const location = String(form.get('location') || '').trim();
  const organizerName = authUser?.name || 'Diego Navarro';
  const organizer = { name: organizerName, initial: initials(organizerName), role: 'Organizador', status: 'Confirmado', adults: 1, children: 0, color: '#e9c3aa' };
  const invitees = wizardInvitees.map((email, index) => {
    const localName = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
    const inviteeName = localName.replace(/\b\w/g, character => character.toUpperCase()) || email;
    return {
      name: inviteeName,
      email,
      initial: initials(inviteeName),
      role: 'Invitación enviada',
      status: 'Pendiente',
      adults: 1,
      children: 0,
      color: colors[index % colors.length]
    };
  });
  const newEvent = {
    id: `event-${Date.now()}`,
    name,
    type,
    date: selectedOption.date,
    time: selectedOption.time,
    location,
    description: description || `Un plan de ${type.toLowerCase()} para compartir.`,
    badge: 'Nuevo evento',
    capacity,
    allowGuests: form.get('allowGuests') === 'on',
    imageIndex: wizardImageIndex,
    invitees: wizardInvitees.slice()
  };
  saveCurrentEventData();
  if (eventTemplates.some(event => event.id === 'empty-workspace')) {
    eventTemplates = eventTemplates.filter(event => event.id !== 'empty-workspace');
    delete eventStates['empty-workspace'];
  }
  eventTemplates.unshift(newEvent);
  currentEvent = newEvent;
  attendees = [organizer, ...invitees];
  tasks = wizardTasks.filter(task => task.name.trim()).map(task => ({
    name: task.name.trim(),
    quantity: task.quantity.trim(),
    person: task.person && task.person !== organizerName
      ? invitees.find(person => person.email === task.person)?.name || ''
      : task.person,
    done: false
  }));
  expenses = [];
  dateOptions = wizardDates.map(option => ({
    date: option.date,
    time: option.time,
    votes: `${option.date}-${option.time}` === chosenVote ? 1 : 0
  }));
  selectedDate = selectedOption.date;
  currentVote = selectedOption.date;
  $('#add-vote-button').textContent = 'Votado ✓';
  renderAll();
  const saved = persistAppState();
  const finishButton = $('#wizard-finish');
  finishButton.disabled = true;
  let remoteSaved = false;
  try {
    if (authUser) {
      await ensureRemoteInvitation();
      remoteSaved = true;
    }
  } catch (error) {
    console.error('Unable to save the new event remotely.', error);
    showToast(`Guardado en este dispositivo. ${error.message}`);
  } finally {
    finishButton.disabled = false;
  }
  $('#event-modal').close();
  setTab('overview');
  if (saved && remoteSaved) showToast(`¡Listo! ${name} ya está guardado en tu cuenta.`);
  else if (saved && !authUser) showToast(`¡Listo! ${name} está guardado localmente.`);
}

$('#wizard-finish').addEventListener('click', completeEventWizard);
$('#event-form').addEventListener('submit', event => event.preventDefault());

$('#task-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const person = form.get('person');
  tasks.push({ name: form.get('name').trim(), quantity: form.get('quantity').trim(), person, done: false });
  renderTasks();
  const saved = persistAppState();
  event.currentTarget.reset();
  $('#task-modal').close();
  if (saved) showToast(person ? '¡Añadido! Ya tiene responsable.' : 'Añadido a la lista. Queda pendiente de asignar.');
});

$('#expense-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const amount = Number(form.get('amount'));
  if (!Number.isFinite(amount) || amount <= 0) {
    showToast('Introduce un importe mayor que cero.');
    return;
  }
  expenses.unshift({
    name: form.get('name').trim(),
    amount,
    person: form.get('person'),
    date: 'Ahora'
  });
  renderExpenses();
  const saved = persistAppState();
  event.currentTarget.reset();
  $('#expense-modal').close();
  if (saved) showToast('Ticket guardado y gastos actualizados.');
  syncRemoteEventState();
});

$('#copy-invite-button').addEventListener('click', async () => {
  const inviteUrl = $('#invite-link').textContent;
  if (!/^https?:\/\//.test(inviteUrl)) {
    showToast('El enlace de invitación todavía no está disponible.');
    return;
  }
  try {
    await navigator.clipboard.writeText(inviteUrl);
    showToast('Enlace copiado. ¡Compártelo con el grupo!');
  } catch {
    const field = document.createElement('textarea');
    field.value = inviteUrl;
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand('copy');
    field.remove();
    showToast(copied ? 'Enlace copiado. ¡Compártelo con el grupo!' : 'No se pudo copiar el enlace; selecciónalo y cópialo manualmente.');
  }
});

$('#whatsapp-share-link').addEventListener('click', event => {
  const inviteLink = $('#whatsapp-share-link').getAttribute('href');
  if (!inviteLink || inviteLink === '#') {
    event.preventDefault();
    showToast('Espera a que se genere el enlace de invitación.');
  }
});

$('#native-share-button').addEventListener('click', async event => {
  const inviteUrl = $('#invite-link').textContent;
  const shareData = {
    title: currentEvent.name,
    text: `¡Te apuntas a ${currentEvent.name}?`,
    url: inviteUrl
  };
  if (navigator.share) {
    try {
      await navigator.share(shareData);
    } catch (error) {
      if (error.name !== 'AbortError') showToast('No se pudo abrir el menú para compartir.');
    }
  } else {
    $('#invite-modal').close();
    $('#copy-invite-button').click();
  }
});

async function loadInvitationFromLink() {
  const routeMatch = window.location.pathname.match(/^\/join\/([A-Za-z0-9_-]{32})\/?$/);
  if (!routeMatch) return;

  activeInviteToken = routeMatch[1];
  joinAlreadyHandledToken = '';
  $('#join-feedback').textContent = 'Cargando los detalles del evento…';
  openDialog('#join-modal');
  try {
    const invitation = await requestApi(`/api/invitations/${encodeURIComponent(activeInviteToken)}`);
    const remoteEvent = {
      ...invitation.event,
      inviteToken: activeInviteToken,
      inviteUrl: `${window.location.origin}/join/${activeInviteToken}`
    };
    const existingState = eventStates[remoteEvent.id];
    eventTemplates = [remoteEvent, ...eventTemplates.filter(event => event.id !== remoteEvent.id)];
    eventStates[remoteEvent.id] = {
      attendees: cloneData(invitation.attendees),
      tasks: existingState ? cloneData(existingState.tasks) : cloneData(invitation.tasks),
      expenses: existingState ? cloneData(existingState.expenses) : [],
      dateOptions: existingState ? cloneData(existingState.dateOptions) : cloneData(invitation.dateOptions),
      selectedDate: existingState ? existingState.selectedDate : remoteEvent.date,
      currentVote: existingState ? existingState.currentVote : '',
      notifications: cloneData(invitation.notifications || [])
    };
    currentEvent = remoteEvent;
    restoreEventData(remoteEvent.id);
    renderAll();
    persistAppState();
    $('#join-event-name').textContent = remoteEvent.name;
    $('#join-event-details').textContent = `${formatDateLong(remoteEvent.date)} · ${remoteEvent.time || '14:00'} · ${remoteEvent.location}`;
    updateJoinAuthenticationUi();
    maybeSkipJoinConfirmation();
    $('#join-feedback').textContent = '';
  } catch (error) {
    console.error('Unable to load the event invitation.', error);
    $('#join-event-name').textContent = 'Invitación no disponible';
    $('#join-event-details').textContent = 'El enlace puede haber caducado o no estar publicado correctamente.';
    $('#join-feedback').textContent = error.message;
    $('#join-submit').disabled = true;
  }
}

$('#join-form').addEventListener('submit', async event => {
  event.preventDefault();
  const name = $('#join-name').value.trim();
  if (!name || !activeInviteToken) {
    $('#join-feedback').textContent = 'Escribe tu nombre para confirmar que te unes.';
    return;
  }
  const submitButton = $('#join-submit');
  const additionalAdults = Math.max(0, Number($('#join-adults').value) || 0);
  const children = Math.max(0, Number($('#join-children').value) || 0);
  submitButton.disabled = true;
  $('#join-feedback').textContent = 'Guardando tu confirmación…';
  try {
    const result = await requestApi(`/api/invitations/${encodeURIComponent(activeInviteToken)}/join`, {
      method: 'POST',
      body: JSON.stringify({ name, adults: additionalAdults, children })
    });
    attendees = result.attendees;
    joinedInvitationNames[activeInviteToken] = name;
    saveCurrentEventData();
    renderAll();
    persistAppState();
    $('#join-modal').close();
    setTab('overview');
    showToast(`¡Listo, ${name}! Ya apareces en la lista de asistentes.`);
  } catch (error) {
    console.error('Unable to add the invited guest.', error);
    $('#join-feedback').textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});

function renderAll() {
  renderEventGallery();
  renderCurrentEvent();
  renderDateOptions();
  renderAttendees();
  renderTasks();
  renderExpenses();
  renderNotifications();
}

loadPersistedData();
renderAll();
bootstrapAuth();
loadInvitationFromLink();
window.setInterval(() => {
  if (currentEvent.inviteToken) refreshRemoteAttendees();
}, 15000);
