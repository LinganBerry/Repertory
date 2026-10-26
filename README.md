# Acordes y Tonos

Repertorio personal de canciones con acordes, tonos y partes. **Una sola persona (tú) edita**; cualquiera con el enlace puede mirar.
Sin cuentas de usuario, sin comunidad, sin registro. El editor se abre tocando 5 veces el título (o con `/?editar`) y pide tu contraseña.

## Cómo funciona la seguridad
- La contraseña vive solo en Vercel (`ADMIN_PASSWORD`) y **solo el servidor la comprueba** (`api/entrar.js`).
- **5 intentos fallidos seguidos desde una IP = bloqueo de 15 minutos.** Además, 20 fallos entre todas las IPs bloquean a todos 15 minutos (se levanta solo). El contador está en el almacén (no en memoria), así que no se reinicia entre ejecuciones de Vercel. Si el almacén falla, el servidor **no** deja pasar a nadie.
- Con la contraseña correcta recibes un pase firmado de 30 días (`SESSION_SECRET`). La contraseña no se guarda en el teléfono.
- **El servidor no puede borrar nada.** No existe ninguna ruta ni función de borrado. Solo puede: agregar, editar, mandar a la papelera (una marca `borrada`, restaurable), restaurar, importar (suma y actualiza, nunca quita) y cambiar nombre/intro.
  Aclaración honesta: el token de Vercel Blob en sí tiene permisos completos sobre su almacén; la restricción la garantiza el código de este proyecto (y las pruebas), no un permiso de la plataforma.
- Cada día, el primer cambio guarda una copia del estado anterior en `repertorio/historial/AAAA-MM-DD.json`.

## Variables de entorno (Vercel → Settings → Environment Variables)
| Variable | Qué es |
|---|---|
| `ADMIN_PASSWORD` | Tu contraseña. **Mínimo 12 caracteres** (el servidor se niega si es más corta). Una frase de 4 palabras sirve. |
| `SESSION_SECRET` | Texto aleatorio de 32+ caracteres: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `BLOB_READ_WRITE_TOKEN` | La pone Vercel sola al conectar un almacén Blob. |

> **IMPORTANTE:** este proyecto debe usar **su propio almacén Blob nuevo**. El proyecto viejo guarda en la misma ruta (`repertorio/canciones.json`) con otro formato; si compartieran almacén, se pisarían.
> Usa contraseña y `SESSION_SECRET` **nuevos**, distintos a los del proyecto viejo.

## Publicar (proyecto aparte, sin tocar el viejo)
1. GitHub: crea un repositorio **privado** nuevo y sube esta carpeta (sin `node_modules`).
2. Vercel: *Add New → Project* → importa ese repo (Framework: *Other*). Crea un almacén **Blob** nuevo (pestaña Storage) y conéctalo a este proyecto. Agrega `ADMIN_PASSWORD` y `SESSION_SECRET`. Deploy.
3. Abre `https://TU-URL/?editar`, entra, *Ajustes → Importar copia* y elige tu `repertorio-copia.json`.
4. Verifica: `node scripts/comparar.mjs repertorio-copia.json https://TU-URL 2` debe decir `0 diferencias`.
5. Opcional: `node scripts/generar-respaldo.mjs repertorio-copia.json` y sube el `canciones.js` resultante.

## Pruebas (no necesitan internet ni Vercel)
- `npm test` → servidor: límite de intentos, agregar/editar/papelera, importación, sin rutas de borrado.
- `npm i --no-save jsdom && npm run test:e2e` → navegador simulado: entrar, agregar canción "desde el teléfono" y verla desde la "PC".

## Archivos
`api/canciones.js` (leer y guardar) · `api/entrar.js` (contraseña) · `lib/` (auth, almacén, intentos, limpieza) · `app.js` (página) · `editor.js` (editor) · `teoria.js` + `vendor/` (teoría y piano) · `sw.js` (modo sin internet) · `scripts/` · `test/`.
