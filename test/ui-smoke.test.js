'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const projectRoot = path.join(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(projectRoot, 'app.js'), 'utf8');

test('la interfaz contiene los destinos de mapa y notificaciones', () => {
  assert.match(indexHtml, /class="map-link"/);
  assert.match(indexHtml, /id="inbox-view"/);
  assert.match(indexHtml, /id="notifications-list"/);
  assert.match(indexHtml, /aria-label="Notificaciones"/);
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
});
