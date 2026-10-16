# Repertorio — manual de mantenimiento

Página con las canciones que sé tocar (acordes, tono y partes). La gente solo mira; yo soy el único que edita.
Objetivo: repertorio propio, sin cuadernos, que se vea desde cualquier lugar y se pueda compartir con un link.

## Cómo está armado
- **GitHub** (rama `main`) → **Vercel** (plan Hobby, preset "Other"): cada commit se publica solo en ~1 minuto. Sin build.
- Sitio estático + 2 funciones en `api/`. Los datos viven en **Vercel Blob** (`repertorio/canciones.json`).

| Archivo | Para qué |
|---|---|
| `index.html` | Solo la estructura de la página |
| `app.js` | Toda la lógica pública: lista, buscador, pantalla de canción, números romanos |
| `estilos.css` | Todo el diseño (colores, temas, tamaños) |
| `editor.js` | Modo editor. Se abre **tocando 5 veces seguidas el título** (o con `?editar` al final del link) |
| `api/canciones.js` | `GET` público (devuelve el repertorio) · `POST` protegido (guarda) |
| `api/entrar.js` | Único lugar donde se prueba la contraseña; devuelve un pase de 30 días |
| `lib/auth.js` | Lógica de contraseña y pases (compartida por las dos funciones) |
| `canciones.js` | Copia de respaldo si el servidor no responde |
| `sw.js` | Modo offline: guarda la página y las canciones en el dispositivo. Con internet siempre carga lo más nuevo; sin internet usa la copia guardada |
| `teoria.js` | Pantalla \"Teoría\" (botón arriba): escalas, modos y diccionario de acordes con teclado. Solo dibuja; calcula la librería Tonal |
| `vendor/tonal.min.js` | Librería [Tonal](https://github.com/tonaljs/tonal) 6.5.1 (MIT) copiada tal cual, con su licencia. Para actualizar: `npm pack tonal` y copiar `browser/tonal.min.js` |
| `vendor/Tone.js` | Librería [Tone.js](https://github.com/Tonejs/Tone.js) 15.1.22 (MIT) copiada tal cual, con su licencia, para el sonido de la pantalla Teoría. Para actualizar: `npm pack tone` y copiar `build/Tone.js`. Se le fuerza el reloj `timeout` porque la política de seguridad bloquea su worker interno |
| `vendor/piano/` | 30 muestras .mp3 (~2 MB) del piano de cola **Salamander Grand Piano** de Alexander Holm, licencia **CC BY 3.0** (hay que dar crédito; está en la pantalla Teoría y en `vendor/piano/LICENSE.txt`). Fuente: https://github.com/Tonejs/audio, carpeta `salamander`. Una sola capa de velocidad. Se guardan para uso offline la primera vez que se abre Teoría con internet |
| `vercel.json` | Cabeceras de seguridad básicas |

## Seguridad (cómo funciona)
- Escribir datos exige un **pase firmado**. Se obtiene en `/api/entrar` con la contraseña (`ADMIN_PASSWORD` en Vercel).
- El teléfono guarda solo el pase (vence a los 30 días), **nunca la contraseña**. "Recordar" viene desmarcado.
- El pase se firma con `SESSION_SECRET` (texto aleatorio de 32+ caracteres en Vercel), separado de la contraseña: robar un pase no ayuda a adivinarla.
- La contraseña debe tener **12 caracteres o más**; si es más corta, el servidor se niega a funcionar y lo dice.
- 5 contraseñas malas desde una misma IP → bloqueo de 15 minutos (ayuda, pero no es infalible en Vercel: la defensa real es una contraseña larga y aleatoria).
- **Matar todas las sesiones:** cambiar `ADMIN_PASSWORD` o `SESSION_SECRET` en Vercel (y Redeploy).
- Cada guardado conserva el estado anterior (`previo.json`): **Ajustes → Deshacer último guardado**. El servidor no guarda listas vacías.
- La página no ejecuta nada que venga de los datos: todo se escribe como texto, los links solo pueden ser `http(s)`, y la política de seguridad (CSP en `vercel.json`) solo permite scripts y estilos de la propia página.
- Es público a propósito: la lista de canciones (`GET /api/canciones`) y el código del repo.

## Lista de seguridad (acciones mías, no de código)
- [ ] **Verificación en dos pasos (2FA) en GitHub y en Vercel**, con códigos de recuperación guardados. Quien controle esas cuentas controla el sitio entero.
- [ ] `ADMIN_PASSWORD` larga (16+ caracteres o 5 palabras sin relación), única, en un gestor de contraseñas.
- [ ] `SESSION_SECRET` creada en Vercel (aleatoria, 32+ caracteres, generada por el gestor de contraseñas).
- [ ] Nunca subir contraseñas ni archivos `.env` al repo (el repo es público).
- [ ] Fijar la versión de `@vercel/blob` (ver el número instalado en el log de un despliegue de Vercel y quitar el `^` en `package.json`).
- [ ] Si el plan lo permite: regla de límite de peticiones para `/api/entrar` en el Firewall de Vercel.
- [ ] Descargar una copia de seguridad cada cierto tiempo (Ajustes → Descargar copia).

## Cambios que puedo hacer solo
| Quiero… | Dónde |
|---|---|
| Cambiar nombre o texto de la página | Editor → **Ajustes → Página** |
| Cambiar la contraseña | Vercel → proyecto → Settings → Environment Variables → `ADMIN_PASSWORD` (mín. 12 caracteres) → después **Redeploy** (Deployments → ⋯ → Redeploy) |
| Colores de los temas | `estilos.css`, bloques `:root[data-tema=papel]` y `:root[data-tema=escenario]` (variables `--bg`, `--ink`, `--muted`…) |
| Color de las pastillas de tono | `app.js`, función `colorear` (`NOTAS[m[1]] * 30` = matiz; `'34%'` = intensidad) |
| Logo (ficha con letra) e icono de la pestaña | Salen solos de la primera letra del nombre: Editor → Ajustes → Página. La franja de colores está en `app.js` (buscar `Franja de 12 tonos`) y su estilo en `estilos.css` (`#franja`) |
| Nº de toques para abrir el editor | `app.js`, buscar `toques.length >= 5` (y `3000` = segundos de ventana) |
| Límites del tamaño de letra | `app.js`, buscar `.85` y `1.9` (aparecen en 3 sitios: `zoom`, `topesZoom`, `cambiarZoom`) |
| Tonos que se pueden elegir | `editor.js`, lista `TONOS` |
| Tiempo de vida del pase | `lib/auth.js`, constante `DIAS` |
| Agregar un campo a cada canción (ej. "BPM") | 4 sitios: `editor.js` (`CAMPOS` y el formulario en `abrirForm`) · `api/canciones.js` (`limpiar()`, si no, el servidor lo descarta) · `app.js` (`mostrar()`, donde se dibuja) · este README |
| Deshacer un cambio que rompió algo | GitHub → archivo → History → copiar la versión anterior. O Vercel → Deployments → un despliegue anterior → Promote / Instant Rollback |
| Deshacer mi último guardado | Editor → Ajustes → **Deshacer último guardado** |
| Restaurar mis canciones | Editor → Ajustes → **Importar copia** (con el `.json` de "Descargar copia") |
| Dominio propio | Vercel → proyecto → Settings → Domains |

**Copia de seguridad:** descárgala desde Ajustes cada cierto tiempo (por ejemplo, después de cargar muchas canciones). Todo vive en un solo lugar.

## Si algo falla
| Síntoma | Qué mirar |
|---|---|
| Barra roja "No se guardó…" | Lee el mensaje: contraseña corta/ausente en Vercel, sesión vencida (entra de nuevo) o sin conexión (botón Reintentar) |
| "El servidor NO guardó los links" | `api/canciones.js` en GitHub es una versión vieja: reemplázalo |
| No entra con la contraseña correcta | ¿Tiene 12+ caracteres? ¿Hubo 5 fallos seguidos (espera 15 min)? ¿Falta `api/entrar.js` o `lib/auth.js` en GitHub? |
| Cambié algo y la página no cambia | Espera ~1 minuto, revisa en Vercel que el último despliegue diga **Ready**, y recarga |
| La página se ve rota o sin estilos tras un cambio en `vercel.json` | Borra la línea `Content-Security-Policy` de `vercel.json` y vuelve a desplegar; luego avisa |
| Página en blanco | Vercel → Deployments → ver el error; deshacer el último cambio |

## Formato de datos (versión 1)
`{version, nombre, intro, actualizado, canciones:[{titulo, artista, tono, nota, enlace, partes:[{nombre, tono, prog, pista}]}]}`

## Escribir las partes (editor)
Una parte por línea: `Nombre (tono): acordes // pista`
- `(tono)` y `// pista` son opcionales; el tono solo si la parte modula.
- `|` marca el compás: `Verso: G D | Em C`. Acordes separados por espacio o guion pegado (`F#-G-A`).
- La pista es una línea corta (máx. 200 caracteres), nunca la letra completa (derechos de autor).
- El editor avisa en vivo de tonos inválidos, partes sin acordes, compases vacíos y acordes raros.
- Los números romanos salen del tono de la canción (o de la parte); en tonos menores usa la escala menor natural.

## Decisiones de diseño (no volver a discutirlas sin motivo)
Móvil primero, sin fotos ni degradados; un solo sistema de color (el tono); dos temas (Papel y Escenario); sin letras completas; sin favoritos ni transposición (a propósito: el oído se entrena sacando los tonos); modo offline con service worker (red primero, copia guardada como respaldo); el editor es secreto (5 toques al título) y se protege en el servidor, no en la pantalla.

## Si quiero ayuda de una IA
Subir toda esta carpeta y este README, y pedir el cambio indicando el archivo. Cualquier campo nuevo implica tocar también `api/canciones.js`.
