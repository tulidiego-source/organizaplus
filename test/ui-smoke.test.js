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
  assert.match(indexHtml, /id="event-organizer"/);
  assert.doesNotMatch(indexHtml, /id="inbox-view"|id="notifications-list"|data-tab="inbox"/);
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

test('el menú usa iconos intuitivos para asistentes, compras y chat', () => {
  assert.match(indexHtml, /data-tab="attendees"[^>]*>[\s\S]*👥/);
  assert.match(indexHtml, /data-tab="tasks"[^>]*>[\s\S]*🛒/);
  assert.match(indexHtml, /data-tab="chat"[^>]*>[\s\S]*💬/);
});

test('los componentes principales no recuperan fondos verdes', () => {
  assert.match(stylesCss, /\.confirm-button\.confirmed \{ border: 1px solid #bfd5e5; background: #e6f1f9; color: #155b8a; \}/);
  assert.match(stylesCss, /\.add-inline-button, \.compact-action-button \{ border-color: #b8d5e8; background: #edf7fd; color: #155b8a; \}/);
  assert.match(stylesCss, /\.date-option:hover, \.date-option\.selected, \.single-date-confirmed \{ border-color: #a9cde5; background: #eff8fd; \}/);
  assert.match(stylesCss, /\.attendance-status \{ background: #e4f1fa; color: #155b8a; \}/);
  assert.match(stylesCss, /\.task-filter, \.task-assignee \{ border-color: #b9d4e7; background: #f5faff; color: #155b8a; \}/);
  assert.match(stylesCss, /\.chat-message \{ border-color: #c8ddeb; background: #eaf4fb; \}/);
});

test('compartir fotos usa el mismo botón compacto que las acciones del evento', () => {
  assert.match(indexHtml, /class="compact-action-button upload-photo-button"/);
  assert.match(indexHtml, /class="action-icon" aria-hidden="true">▧<\/span><span>Compartir foto/);
});

test('el enlace de mapa se genera con una búsqueda segura', () => {
  assert.match(appJs, /https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
  assert.match(appJs, /encodeURIComponent\(currentEvent\.location\)/);
  assert.match(appJs, /target="_blank" rel="noopener noreferrer"/);
});

test('las novedades se actualizan en los puntos del menú', () => {
  assert.match(appJs, /function renderNotifications\(\)/);
  assert.match(appJs, /data-section-dot/);
  assert.match(appJs, /renderNotifications\(\);/);
  assert.match(appJs, /touchstart/);
  assert.match(appJs, /touchend/);
});

test('los asistentes muestran el avatar elegido en su perfil', () => {
  assert.match(appJs, /function attendeeAvatarStyle\(person\)/);
  assert.match(appJs, /customImageStyle\(value\)/);
  assert.match(appJs, /spriteStyle\('\/avatars\.png', avatarIndex, 4, 3\)/);
  assert.match(appJs, /function attendeeAvatarMarkup\(person\)/);
  assert.match(appJs, /attendeeAvatarMarkup\(person\)/);
});

test('el menú inferior ocupa todo el ancho disponible', () => {
  assert.match(stylesCss, /\.event-nav \{ left: 5px; right: 5px; width: auto; overflow-x: auto;/);
  assert.doesNotMatch(stylesCss, /\.main-nav \{ left: 5px; width: 27%; \}/);
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
