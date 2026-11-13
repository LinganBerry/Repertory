# Acordes y Tonos

Repertorio personal de canciones con acordes, tonos y partes, más teoría y práctica de piano. **Solo tú editas**; quien tenga el enlace puede mirar. Sin cuentas ni registro.

## Uso

- **Buscar:** escribe en el buscador (en PC, la tecla `/`) y toca la canción.
- **Teclado (PC/tablet):** `←` `→` canción anterior/siguiente · `+` `-` tamaño de letra · `Esc` volver.
- **Instalar como app:** Chrome/Android o Chrome/Edge en PC → *Instalar app*.
- **Sin señal:** se ve la última copia guardada con un aviso arriba. Abre la página con internet al menos una vez en cada dispositivo.
- **Listas del culto:** arma una lista, ordénala y toca **▶ Empezar**. Se guardan en cada dispositivo.
- **Canción:** pestañas Acordes y Letra, **▶ Presentar** (pantalla completa con desplazamiento automático), y las *canciones con la misma progresión* (cada una se abre con un toque). Los acordes se ven en **Letras**, **Romanos** o **Números** (sistema Nashville: 1, 5, 6m, 4; en tono menor se cuenta desde la tónica); la elección se recuerda.
- **Letra con acordes:** en el editor, acorde entre corchetes antes de la sílaba: `[Am]Cuando salga el [F]sol`. Una línea `[Coro]` es un título. Máximo 12 000 caracteres por canción.

## Teoría (barra de abajo)

Escalas y modos (Jónico, Mixolidio, Eólico), diccionario de acordes y **Círculo de quintas**: toca una tonalidad y ves su armadura, sus 6 acordes juntos en el círculo con su número romano (IV a la izquierda, V a la derecha), su relativa y todo lo de la tonalidad. Cálculo con Tonal, sonido con Tone.js y piano Salamander (se bajan la primera vez que abres Teoría).

## Practicar

- **Lectura de notas** (clave de sol y fa), **teclado**, **armaduras y escalas**, **oído** (intervalos, acordes y **progresiones** con números romanos), **lecciones** cortas y **sesión diaria** de 15 minutos. Lo que más fallas sale más.
- **Retos** (sin sonido ni internet): acordes en los 12 tonos (tocarlos, o **reconocerlos** escritos en el pentagrama con inversiones: dices la raíz y si es mayor o menor), progresiones de tus canciones en números romanos, escalas y modos, y **Canción sorpresa** (una canción tuya al azar: tócala de memoria y luego mira los acordes; no se repite hasta que salgan todas).
- **Herramientas:** *Rearmonizar* (ideas para adornar tus canciones en 5 niveles: del 1 al 4 llegan hasta el jazz con dominantes secundarias, y el 5 trae ciclos de dominantes y bajo caminando; *Sumar niveles anteriores* junta todo hasta el nivel elegido), *Improvisación* (una base que suena en bucle en el piano, con las notas guía 3ª y 7ª de cada acorde, su escala y cómo la 7ª baja a la 3ª siguiente) y *Preparar sin internet*.
- **Progreso:** se guarda en el dispositivo; si entras con tu contraseña (dentro de Practicar) se sincroniza con `api/progreso.js` (últimas 500 sesiones, solo agrega).

## Editor

Se abre tocando 5 veces el título, o con `/?editar`, y pide tu contraseña. Agregar, editar, papelera, restaurar e importar.

- **Copia de seguridad** (Ajustes → *Descargar copia*): baja `repertorio-copia-AAAA-MM-DD.json` y Ajustes te recuerda cuándo fue la última (avisa si pasa un mes). *Importar copia* suma y actualiza; **nunca quita** canciones.
- Cada día, el primer cambio guarda el estado anterior en `repertorio/historial/AAAA-MM-DD.json`.

## Seguridad

- La contraseña vive solo en Vercel (`ADMIN_PASSWORD`, mínimo 12 caracteres) y solo el servidor la comprueba (`api/entrar.js`).
- 5 fallos seguidos desde una IP = bloqueo de 15 minutos; 20 fallos entre todas las IPs bloquean a todos 15 minutos. Si el almacén falla, nadie entra.
- Con la contraseña correcta recibes un pase firmado de 30 días (`SESSION_SECRET`); la contraseña no se guarda en el teléfono.
- **El servidor no puede borrar nada:** solo agrega, edita, manda a la papelera (marca `borrada`, restaurable), restaura, importa y cambia nombre/intro. Aclaración: el token de Vercel Blob tiene permisos completos; la restricción la garantizan el código y las pruebas.

## Variables de entorno (Vercel → Settings → Environment Variables)

| Variable | Qué es |
|---|---|
| `ADMIN_PASSWORD` | Tu contraseña (mínimo 12 caracteres). |
| `SESSION_SECRET` | Texto aleatorio de 32+ caracteres: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `BLOB_READ_WRITE_TOKEN` | La pone Vercel sola al conectar un almacén Blob. |

## Publicar

1. Sube esta carpeta completa a GitHub, **con `test/` y `scripts/`** (sin `node_modules`).
2. Vercel: *Add New → Project* → importa el repo (Framework: *Other*). Crea un almacén **Blob** nuevo, conéctalo y agrega `ADMIN_PASSWORD` y `SESSION_SECRET`. Deploy.
3. Abre `https://TU-URL/?editar`, entra, *Ajustes → Importar copia* y elige tu archivo de copia.
4. Verifica: `node scripts/comparar.mjs TU-COPIA.json https://TU-URL 2` debe decir `0 diferencias`.
5. Opcional: `node scripts/generar-respaldo.mjs TU-COPIA.json` y sube el `canciones.js` resultante.

**Al agregar o quitar archivos de la página**, actualiza la lista `BASE` de `sw.js` y sube el número de `CACHE` (así los teléfonos se actualizan).

## Pruebas

- `npm test`: servidor, scripts, contraste de colores AA, modo sin conexión y lógica de Practicar. No necesita internet ni Vercel.
- `npm i --no-save jsdom@30 && npm run test:e2e`: la página completa en un navegador simulado (no dibuja ni suena).
- `npm run contraste`: tabla de contraste de `estilos.css`.

## Archivos

`api/` + `lib/` (servidor) · `app.js` (página) · `editor.js` · `teoria.js` + `vendor/` · `notacion.js`, `retos.js`, `reconocer.js`, `progresiones.js`, `escalas.js`, `sorpresa.js`, `improvisar.js`, `rearmonizar.js`, `lecciones.js`, `practicar.js` (Practicar) · `romanos.js` + `analisis.js` (romanos y canciones relacionadas) · `hoja.js` (letra con acordes) · `listas.js` · `preparar.js` · `sw.js` (sin internet) · `scripts/` · `test/`.
