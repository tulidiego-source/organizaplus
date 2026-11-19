'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const projectRoot = path.join(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(projectRoot, 'app.js'), 'utf8');
const stylesCss = fs.readFileSync(path.join(projectRoot, 'styles.css'), 'utf8');

test('la interfaz contiene los destinos de mapa y notificaciones', () => {
  assert.match(indexHtml, /class="map-link"/);
  assert.match(indexHtml, /id="inbox-view"/);
  assert.match(indexHtml, /id="notifications-list"/);
  assert.match(indexHtml, /id="event-organizer"/);
  assert.doesNotMatch(indexHtml, /<button[^>]*data-tab="inbox"[^>]*aria-label="Notificaciones"/);
});

test('las novedades se indican con puntos azules en cada apartado', () => {
  assert.match(indexHtml, /data-section-dot="attendees"/);
  assert.match(indexHtml, /data-section-dot="tasks"/);
  assert.match(indexHtml, /data-section-dot="expenses"/);
  assert.match(indexHtml, /data-section-dot="chat"/);
  assert.match(indexHtml, /data-section-dot="photos"/);
  assert.match(stylesCss, /\.section-notification-dot \{ background: #2f8ac1; \}/);
});

test('el menú no deja una sección vacía y conserva la paleta azul y amarilla', () => {
  assert.doesNotMatch(indexHtml, /<div class="workspace-label">TU ESPACIO<\/div>/);
  assert.match(stylesCss, /\.sidebar-create-button \{ border-color: #bfd5e5; background: #edf7fd; color: #155b8a; \}/);
  assert.match(stylesCss, /\.notification-pending \{ border-color: #e3c46d; background: #fff8e5; color: #76530f; \}/);
  assert.match(stylesCss, /\.help-spark \{ background: #fff3d9; color: #a96b10; \}/);
});

test('el enlace de mapa se genera con una búsqueda segura', () => {
  assert.match(appJs, /https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
  assert.match(appJs, /encodeURIComponent\(currentEvent\.location\)/);
  assert.match(appJs, /target="_blank" rel="noopener noreferrer"/);
});

test('las notificaciones tienen navegación y se actualizan al renderizar', () => {
  assert.match(appJs, /setTab\('inbox'\)/);
  assert.match(appJs, /function renderNotifications\(\)/);
  assert.match(appJs, /data-notification-tab/);
  assert.match(appJs, /renderNotifications\(\);/);
  assert.match(appJs, /touchstart/);
  assert.match(appJs, /touchend/);
});

test('el mensaje de edición identifica al asistente seleccionado', () => {
  assert.match(appJs, /attendees\.find\(person => person\.id === editingAttendeeId\)/);
  assert.match(appJs, /const editingName = editingPerson\?\.name \|\| authUser\?\.name/);
});

test('el organizador puede cambiar el estado de asistencia al editar', () => {
  assert.match(indexHtml, /id="join-status-fields"/);
  assert.match(indexHtml, /id="join-status"/);
  assert.match(appJs, /const editedStatus = currentEvent\.ownerToken/);
  assert.match(appJs, /status: editedStatus/);
});

test('crear evento solo se muestra desde la vista de eventos', () => {
  assert.match(indexHtml, /class="sidebar-create-button hidden" id="create-event-button"/);
  assert.match(appJs, /create-event-button.*currentTab !== 'events'/s);
  assert.doesNotMatch(indexHtml, /data-tab="events"[^>]*>.*Mis eventos/s);
  assert.doesNotMatch(indexHtml, /empty-create-event-button/);
});

test('el selector superior de eventos abre el inicio del evento', () => {
  assert.match(indexHtml, /id="event-gallery" aria-label="Selecciona un evento"/);
  assert.match(indexHtml, /data-tab="overview" aria-label="Inicio" title="Inicio"/);
  assert.match(appJs, /currentEvent = event;\s+currentTab = 'overview';/);
});

test('las opciones del evento solo aparecen para el organizador', () => {
  assert.match(indexHtml, /class="more-button event-only organizer-only" id="delete-event-button"/);
  assert.match(appJs, /\.organizer-only.*classList\.toggle\('hidden', !isOrganizer\)/s);
});

test('el check de compra permite desmarcar una compra ya hecha', () => {
  assert.match(appJs, /if \(!\(task\.purchased === true \|\| task\.done === true\)\)/);
  assert.match(appJs, /body: JSON\.stringify\(\{ action: 'purchase' \}\)/);
  assert.match(appJs, /Marcar compra pendiente/);
  assert.match(appJs, /const purchaseMark = purchased \? '✓' : '□'/);
  assert.doesNotMatch(appJs, /task-purchased[^\n]*>€</);
});

test('la lista de compras identifica y filtra las cosas del usuario', () => {
  assert.match(indexHtml, /id="task-filter" class="task-filter"/);
  assert.match(indexHtml, /value="mine">Mis cosas/);
  assert.match(indexHtml, /value="unassigned">Sin asignar/);
  assert.match(appJs, /taskFilter === 'unassigned'/);
  assert.match(appJs, /escapeHtml\(isMine \? 'Tú' : task\.person\)/);
  assert.match(appJs, /classList.*task-row-mine|task-row\$\{isMine \? ' task-row-mine'/s);
});

test('la lista de compras tiene un formato móvil de dos niveles', () => {
  assert.match(stylesCss, /\.task-board \.task-row \{ display: grid; grid-template-columns: minmax\(0, 1fr\) auto;/);
  assert.match(stylesCss, /\.task-board \.task-owner \{ grid-column: 1 \/ -1; grid-row: 2;/);
});
