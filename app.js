const eventTemplates = [
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
let dateOptions = [
  { date: '2026-11-21', time: '14:00', votes: 8 },
  { date: '2026-11-22', time: '14:00', votes: 5 },
  { date: '2026-11-28', time: '14:00', votes: 3 }
];
let toastTimer;
let selectedDate = '';
let currentVote = '';
let currentTab = 'overview';
let currentEvent = eventTemplates[0];
let wizardStep = 0;
let wizardInvitees = [];
let wizardDates = [];
let wizardTasks = [];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const euro = value => `${value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2600);
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
    });
  });
}

function renderAttendees() {
  const confirmed = attendees.filter(person => person.status !== 'Pendiente').length;
  const pending = attendees.length - confirmed;
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
  const confirmedPeople = attendees.filter(person => person.status !== 'Pendiente');
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
  $('#attendee-list').innerHTML = attendees.map(person => `
    <div class="attendee-list-row">
      <span class="avatar" style="background:${person.color}">${person.initial}</span>
      <span class="attendee-list-name"><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(person.role)}</small></span>
      <span class="attendance-status ${person.status === 'Pendiente' ? 'pending' : ''}">${person.status === 'Pendiente' ? 'Por confirmar' : person.status}</span>
    </div>`).join('');
  populatePeopleOptions();
}

function renderExpenses() {
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const confirmed = attendees.filter(person => person.status !== 'Pendiente').length;
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
}

function populatePeopleOptions() {
  const options = attendees.map(person => `<option value="${escapeHtml(person.name)}">${escapeHtml(person.name)}</option>`).join('');
  $('#task-person').innerHTML = `<option value="">Sin asignar</option>${options}`;
  $('#expense-person').innerHTML = options;
}

function renderEventGallery() {
  const gallery = $('#event-gallery');
  if (!gallery) return;
  gallery.innerHTML = eventTemplates.map(event => `
    <button class="event-gallery-card ${event.id === currentEvent.id ? 'active' : ''}" data-event-id="${event.id}" type="button">
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
        currentEvent = selected;
        renderCurrentEvent();
        renderEventGallery();
        showToast(`Mostrando ${selected.name}`);
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
    locationMeta.innerHTML = `<span>${escapeHtml(currentEvent.location)}</span> <a href="#" class="map-link">Ver mapa ↗</a>`;
  }
  const heading = document.querySelector('.breadcrumbs strong');
  if (heading) heading.textContent = currentEvent.name;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function setTab(tab) {
  const isDefaultTab = ['overview', 'attendees', 'tasks', 'expenses'].includes(tab);
  currentTab = isDefaultTab ? tab : 'overview';
  $('#plan-panel').classList.toggle('hidden', currentTab !== 'overview');
  $('.date-panel').classList.toggle('hidden', currentTab !== 'overview');
  $('.attendees-panel').classList.toggle('hidden', currentTab !== 'overview');
  $('#attendees-view').classList.toggle('hidden', currentTab !== 'attendees');
  $('#tasks-view').classList.toggle('hidden', currentTab !== 'tasks');
  $('#expenses-view').classList.toggle('hidden', currentTab !== 'expenses');
  $$('.sidebar .nav-link[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === currentTab));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

$$('[data-tab]').forEach(button => button.addEventListener('click', () => setTab(button.dataset.tab)));

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
});

$('#date-options').addEventListener('click', event => {
  const button = event.target.closest('.date-option');
  if (!button) return;
  selectedDate = button.dataset.date;
  $('#add-vote-button').textContent = selectedDate === currentVote ? 'Votado ✓' : 'Votar →';
  renderDateOptions();
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
  showToast(`Tu voto para ${formatDateLong(selectedDate)} se ha guardado.`);
});

function openDialog(id) {
  const dialog = $(id);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

$('#open-task-modal').addEventListener('click', () => openDialog('#task-modal'));
$('#open-task-modal-secondary').addEventListener('click', () => openDialog('#task-modal'));
$('#open-expense-modal').addEventListener('click', () => openDialog('#expense-modal'));
$('#invite-button').addEventListener('click', () => openDialog('#invite-modal'));
$('#share-button').addEventListener('click', () => openDialog('#invite-modal'));
$('#create-event-button').addEventListener('click', startEventWizard);
$$('.modal-close').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));

function localDateAfter(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function startEventWizard() {
  $('#event-form').reset();
  wizardStep = 0;
  wizardInvitees = [];
  wizardDates = [
    { date: localDateAfter(7), time: '14:00' },
    { date: localDateAfter(14), time: '14:00' }
  ];
  wizardTasks = [{ name: 'Comida para compartir', quantity: 'Para el grupo', person: '' }];
  renderWizardInvites();
  renderWizardDates();
  renderWizardTasks();
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
  list.innerHTML = wizardTasks.map((task, index) => `
    <div class="wizard-task-row" data-wizard-task-index="${index}">
      <label>Qué hay que llevar<input name="task-name" maxlength="50" value="${escapeHtml(task.name)}" placeholder="Ej. Hielo"></label>
      <label>Cantidad<input name="task-quantity" maxlength="30" value="${escapeHtml(task.quantity)}" placeholder="Ej. 2 bolsas"></label>
      <label>Responsable<select name="task-person"><option value="">Pendiente</option><option value="Diego Navarro" ${task.person === 'Diego Navarro' ? 'selected' : ''}>Diego Navarro</option>${inviteOptions.replace(`value="${escapeHtml(task.person)}"`, `value="${escapeHtml(task.person)}" selected`)}</select></label>
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

function completeEventWizard() {
  if (!validateWizardStep()) return;
  const form = new FormData($('#event-form'));
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
  const organizer = { name: 'Diego Navarro', initial: 'D', role: 'Organizador', status: 'Confirmado', color: '#e9c3aa' };
  const invitees = wizardInvitees.map((email, index) => {
    const localName = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
    const inviteeName = localName.replace(/\b\w/g, character => character.toUpperCase()) || email;
    return {
      name: inviteeName,
      email,
      initial: initials(inviteeName),
      role: 'Invitación enviada',
      status: 'Pendiente',
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
    invitees: wizardInvitees.slice()
  };
  eventTemplates.unshift(newEvent);
  currentEvent = newEvent;
  attendees = [organizer, ...invitees];
  tasks = wizardTasks.filter(task => task.name.trim()).map(task => ({
    name: task.name.trim(),
    quantity: task.quantity.trim(),
    person: task.person && task.person !== 'Diego Navarro'
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
  $('#event-modal').close();
  setTab('overview');
  showToast(`¡Listo! ${name} ya tiene invitaciones, fechas y lista de cosas.`);
}

$('#wizard-finish').addEventListener('click', completeEventWizard);
$('#event-form').addEventListener('submit', event => event.preventDefault());

$('#task-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const person = form.get('person');
  tasks.push({ name: form.get('name').trim(), quantity: form.get('quantity').trim(), person, done: false });
  renderTasks();
  event.currentTarget.reset();
  $('#task-modal').close();
  showToast(person ? '¡Añadido! Ya tiene responsable.' : 'Añadido a la lista. Queda pendiente de asignar.');
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
  event.currentTarget.reset();
  $('#expense-modal').close();
  showToast('Ticket guardado y gastos actualizados.');
});

$('#copy-invite-button').addEventListener('click', async () => {
  const inviteUrl = 'https://organiza.app/e/barbacoa-juan';
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
    document.execCommand('copy');
    field.remove();
    showToast('Enlace copiado. ¡Compártelo con el grupo!');
  }
});

$('#native-share-button').addEventListener('click', async event => {
  const shareData = { title: 'Barbacoa en casa de Juan', text: '¡Te apuntas al plan?', url: 'https://organiza.app/e/barbacoa-juan' };
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

function renderAll() {
  renderEventGallery();
  renderCurrentEvent();
  renderDateOptions();
  renderAttendees();
  renderTasks();
  renderExpenses();
}

renderAll();
