# Acordes y Tonos

Repertorio personal de canciones con acordes, tonos y partes. **Una sola persona (tú) edita**; cualquiera con el enlace puede mirar.
Sin cuentas de usuario, sin comunidad, sin registro. El editor se abre tocando 5 veces el título (o con `/?editar`) y pide tu contraseña.

## Uso en vivo (teléfono, tablet, laptop, PC)
- Abre el enlace, escribe en el buscador (o pulsa **/** en PC) y toca la canción. Sin cuentas ni pasos extra.
- **Atajos en PC/tablet con teclado:** `/` busca · `←` `→` canción anterior/siguiente · `+` `-` tamaño de letra · `Esc` volver. Toca (o `Enter`) una parte para enfocarla.
- **Instalar como app:** en Android/Chrome o en PC (Chrome/Edge) usa *Instalar app*. Se abre sin barra del navegador.
- **Sin señal:** se muestra la última copia guardada **y un aviso arriba**; al volver la señal se actualiza sola. Abre la página con internet al menos una vez en cada dispositivo.
- **Listas del culto** (barra de abajo): crea una lista, agrégale canciones, ordénalas y toca **▶ Empezar**; con ← → o Anterior/Siguiente recorres la lista en ese orden. Se guardan en cada dispositivo. La pantalla no se apaga mientras una canción está abierta. Atrás vuelve a donde estabas.
- **Retos de acordes** (Practicar → Retos de acordes): sale un acorde mayor o menor en los 12 tonos (con inversiones si quieres). Lo tocas en tu piano, pulsas **Ya lo toqué** y ves las notas en el teclado. Guarda cuánto tardas y qué fallas. No usa sonido ni internet.
- **Teoría** (barra de abajo): escalas y modos, diccionario de acordes y **Tonalidades** (armadura, relativa, acordes con su función T/SD/D, dominantes secundarios, cadencia I–IV–V–I para oír). El piano y la librería de teoría se descargan la primera vez que abres Teoría y después quedan guardados.

## Practicar (ejercicios para estudiar sin salir de la página)
- Botón **Practicar** (arriba). Una pregunta por pantalla, sin adornos. Sesiones de 10 o 20 preguntas.
- **Lectura de notas:** pentagrama en clave de sol y de fa (las del piano); 5 niveles (líneas, espacios, completo, líneas adicionales, alteraciones). **Teclado:** nombrar la tecla marcada y tocar la tecla de una nota. Nombres con letras (C D E…).
- **Responder:** toca los botones o escribe la letra (A–G); `#` o `+` sube, `-` baja, `0` natural; `Enter` o `Espacio` para seguir; `Esc` para salir (si ya respondiste 3 o más, la sesión se guarda).
- **Oído (para pianista):** intervalos que suben, que bajan y a la vez (4 niveles, de 3m 3M 5J 8J hasta los 12 intervalos), y acordes (mayor y menor, disminuido y aumentado, séptimas). Suena solo al aparecer la pregunta; `R` o el botón repiten; al fallar vuelve a sonar la respuesta correcta con sus notas. Las teclas `1`–`9` eligen la opción. Usa el mismo piano de Teoría (la primera vez necesita internet para cargarlo).
- **Lo que más fallas sale más.** Al final ves aciertos, tiempo, tus fallos y "Para repasar".
- **Progreso:** se guarda en el dispositivo. Si entras con tu contraseña del editor (dentro de Practicar), se sincroniza con tus otros dispositivos mediante `api/progreso.js` (las últimas 500 sesiones; solo agrega, no hay forma de borrar desde la web). Si no entras, queda solo en ese dispositivo y se sube cuando entres.
- **Fuente del pentagrama:** `vendor/atril-notas.woff2`, un subconjunto de la fuente Bravura (Steinberg, licencia SIL OFL 1.1; ver `vendor/OFL-Bravura.txt`).

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
1. GitHub: crea un repositorio nuevo (privado o público: no hay secretos en el código, viven en Vercel) y sube esta carpeta completa, **incluidas `test/` y `scripts/`** (sin `node_modules`).
2. Vercel: *Add New → Project* → importa ese repo (Framework: *Other*). Crea un almacén **Blob** nuevo (pestaña Storage) y conéctalo a este proyecto. Agrega `ADMIN_PASSWORD` y `SESSION_SECRET`. Deploy.
3. Abre `https://TU-URL/?editar`, entra, *Ajustes → Importar copia* y elige tu `repertorio-copia.json`.
4. Verifica: `node scripts/comparar.mjs repertorio-copia.json https://TU-URL 2` debe decir `0 diferencias`.
5. Opcional: `node scripts/generar-respaldo.mjs repertorio-copia.json` y sube el `canciones.js` resultante.

## Pruebas (no necesitan internet ni Vercel)
- `npm test` → 53 pruebas: servidor (límite de intentos, pases, agregar/editar/papelera, importación, copia del día, guardados simultáneos, sin rutas de borrado), scripts, contraste de colores AA, modo sin conexión (`sw.js`) y la lógica de Practicar (preguntas, claves, niveles, estadísticas, dibujo del pentagrama).
- `npm i --no-save jsdom@30 && npm run test:e2e` → 13 pruebas en un navegador simulado: entrar, agregar una canción "desde el teléfono", verla y abrirla "desde la PC" con teclado, Teoría > Tonalidades, el aviso sin conexión y Practicar (sesiones, teclado, oído con audio simulado, progreso sincronizado entre dos dispositivos) y el audio compartido con un Tone simulado.
- `npm run contraste` → tabla de contraste de todos los pares de colores de `estilos.css`.
- Límites: usan un almacén falso en memoria (no el Blob real de Vercel), y jsdom no dibuja ni suena (el audio se prueba con un Tone simulado: se verifica qué notas se programan, no cómo suenan). Falta probar en navegadores reales y medir con Lighthouse.

## Archivos
`api/canciones.js` (leer y guardar) · `api/entrar.js` (contraseña) · `lib/` (auth, almacén, intentos, limpieza) · `app.js` (página) · `editor.js` (editor) · `teoria.js` + `vendor/` (teoría y piano) · `notacion.js` + `retos.js` (retos de acordes) · `listas.js` (listas del culto) · `practicar.js` (ejercicios) · `api/progreso.js` + `lib/progreso.js` (progreso sincronizado) · `sw.js` (modo sin internet) · `manifest.webmanifest` + `icono-*.png` (instalar como app) · `scripts/` (comparar, generar respaldo, contraste) · `test/`.
