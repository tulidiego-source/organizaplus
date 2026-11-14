# OrganizaT — prototipo web

Aplicación web adaptable a móvil para organizar eventos. Incluye una API Node.js sin dependencias externas para crear enlaces de invitación y guardar confirmaciones de asistencia entre dispositivos.

## Requisitos

- Node.js 16 o posterior

## Ejecutar en local

Desde esta carpeta:

```powershell
npm start
```

Abre `http://localhost:3000`. Las invitaciones solo funcionan cuando la aplicación se sirve desde este servidor; abrir `index.html` directamente permite explorar la demo local, pero no crear enlaces que otros dispositivos puedan usar.

## Invitaciones por WhatsApp

1. Crea o selecciona un evento y pulsa «Compartir invitación».
2. OrganizaT crea un enlace privado para ese evento.
3. Pulsa «Enviar por WhatsApp», elige el grupo o los contactos y envía el mensaje preparado.
4. Cada invitado abre el enlace, escribe su nombre y confirma que se une. La lista de asistentes se actualiza en el evento del organizador.

WhatsApp no envía mensajes automáticamente: la persona organizadora siempre elige el chat y confirma el envío. El enlace funciona como invitación; cualquiera que lo reciba puede unirse mientras haya aforo.

## Publicar para invitados

El servidor y la API deben estar disponibles en una URL pública con HTTPS para que funcionen los enlaces desde los móviles de los invitados. En el servidor, configura `PUBLIC_APP_URL` con el origen público y `HOST=0.0.0.0`, y ejecuta `npm start`. Por ejemplo:

```powershell
$env:PUBLIC_APP_URL = "https://eventos.ejemplo.com"
$env:HOST = "0.0.0.0"
npm start
```

Configura el proxy o plataforma de alojamiento para enviar tanto la web como las rutas `/api/` al proceso Node.js. En local, los eventos se almacenan en `data/invitations.json`; esa carpeta está excluida de Git. Para producción, configura `DATABASE_URL` con la cadena de conexión de PostgreSQL y OrganizaT creará la tabla `invitation_events` automáticamente. Puedes desactivar SSL solo en una base local con `DATABASE_SSL=false`.

Ejemplo de configuración de producción:

```powershell
$env:DATABASE_URL = "postgresql://usuario:contraseña@servidor:5432/organizat"
$env:PUBLIC_APP_URL = "https://eventos.ejemplo.com"
$env:HOST = "0.0.0.0"
npm start
```

## Probar

```powershell
npm test
```

Las confirmaciones de asistencia se comparten por la API; las tareas, votaciones y gastos siguen siendo datos locales del navegador. Esta versión no tiene cuentas de usuario: quien tenga el enlace de invitación puede ver el plan y unirse.
