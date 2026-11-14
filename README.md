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

## Cuentas y eventos

Con `DATABASE_URL` configurado, OrganizaT crea automáticamente las tablas `organizers`, `organizer_sessions` e `invitation_events`. La pantalla principal requiere una cuenta de organizador: puedes registrarte desde la aplicación, iniciar sesión y recuperar tus eventos desde otro navegador o dispositivo. Las contraseñas se guardan como hashes `scrypt` y la sesión se mantiene mediante una cookie HttpOnly.

Los invitados no necesitan cuenta: siguen accediendo mediante el enlace `/join/...` y pueden confirmar su asistencia. Las invitaciones, tareas, votaciones y gastos del evento se guardan en PostgreSQL.

Para probarlo desde cero:

1. Configura `DATABASE_URL` y `DATABASE_SSL=true` en la misma sesión de PowerShell.
2. Ejecuta `npm start`.
3. Abre `http://localhost:3000`, pulsa «Regístrate» y crea una cuenta.
4. Crea un evento; se guardará automáticamente en Supabase.
5. Cierra el navegador, vuelve a abrir la aplicación o entra desde otro dispositivo y utiliza «Inicia sesión».
