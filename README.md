# Repertorio — manual de mantenimiento

Página con las canciones que sé tocar (acordes, tono y partes). La gente solo mira; yo soy el único que edita.
Objetivo: repertorio propio, sin cuadernos, que se vea desde cualquier lugar y se pueda compartir con un link.

## Cómo está armado
- **GitHub** (rama `main`) → **Vercel** (plan Hobby, preset "Other"): cada commit se publica solo en ~1 minuto. Sin build.
- Sitio estático + 2 funciones en `api/`. Los datos viven en **Vercel Blob** (`repertorio/canciones.json`).

| Archivo | Para qué |
|---|---|
| `index.html` | Toda la página pública: estilos, lista, buscador, pantalla de canción, números romanos, transposición |
| `editor.js` | Modo editor. Se abre **tocando 5 veces seguidas el título** (o con `?editar` al final del link) |
| `api/canciones.js` | `GET` público (devuelve el repertorio) · `POST` protegido (guarda) |
| `api/entrar.js` | Único lugar donde se prueba la contraseña; devuelve un pase de 30 días |
| `lib/auth.js` | Lógica de contraseña y pases (compartida por las dos funciones) |
| `canciones.js` | Copia de respaldo si el servidor no responde |
| `sw.js` | Desinstala la copia offline antigua. Se puede borrar cuando ya nadie la tenga |
| `vercel.json` | Cabeceras de seguridad básicas |

## Seguridad (cómo funciona)
- Escribir datos exige un **pase firmado**. Se obtiene en `/api/entrar` con la contraseña (`ADMIN_PASSWORD` en Vercel).
- El teléfono guarda solo el pase (vence a los 30 días), **nunca la contraseña**.
- La contraseña debe tener **12 caracteres o más**; si es más corta, el servidor se niega a funcionar y lo dice.
- 5 contraseñas malas desde una misma IP → bloqueo de 15 minutos (ayuda, pero no es infalible en Vercel: la defensa real es una contraseña larga).
- **Cambiar la contraseña** invalida todos los pases a la vez (cierra todas las sesiones).
- Todo lo que se muestra se escribe como texto y los links solo pueden ser `http(s)`.
- Es público a propósito: la lista de canciones (`GET /api/canciones`) y el código del repo.

## Cambios que puedo hacer solo
| Quiero… | Dónde |
|---|---|
| Cambiar nombre o texto de la página | Editor → **Ajustes → Página** |
| Cambiar la contraseña | Vercel → proyecto → Settings → Environment Variables → `ADMIN_PASSWORD` (mín. 12 caracteres) → después **Redeploy** (Deployments → ⋯ → Redeploy) |
| Colores de los temas | `index.html`, bloques `:root[data-tema=papel]` y `:root[data-tema=escenario]` (variables `--bg`, `--ink`, `--muted`…) |
| Color de las pastillas de tono | `index.html`, función `colorear` (`NOTAS[m[1]] * 30` = matiz; `'34%'` = intensidad) |
| Nº de toques para abrir el editor | `index.html`, buscar `toques.length >= 5` (y `3000` = segundos de ventana) |
| Límites del tamaño de letra | `index.html`, buscar `.85` y `1.9` (aparecen en 3 sitios: `zoom`, `topesZoom`, `cambiarZoom`) |
| Tonos que se pueden elegir | `editor.js`, lista `TONOS` |
| Tiempo de vida del pase | `lib/auth.js`, constante `DIAS` |
| Agregar un campo a cada canción (ej. "BPM") | 4 sitios: `editor.js` (`CAMPOS` y el formulario en `abrirForm`) · `api/canciones.js` (`limpiar()`, si no, el servidor lo descarta) · `index.html` (`mostrar()`, donde se dibuja) · este README |
| Deshacer un cambio que rompió algo | GitHub → archivo → History → copiar la versión anterior. O Vercel → Deployments → un despliegue anterior → Promote / Instant Rollback |
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
| Página en blanco | Vercel → Deployments → ver el error; deshacer el último cambio |

## Formato de datos (versión 1)
`{version, nombre, intro, actualizado, canciones:[{titulo, artista, tono, nota, enlace, partes:[{nombre, tono, prog, pista}]}]}`

## Escribir las partes (editor)
Una parte por línea: `Nombre (tono): acordes // pista`
- `(tono)` y `// pista` son opcionales; el tono solo si la parte modula.
- `|` marca el compás: `Verso: G D | Em C`. Acordes separados por espacio o guion pegado (`F#-G-A`).
- La pista es una línea corta (máx. 200 caracteres), nunca la letra completa (derechos de autor).
- El editor avisa en vivo de tonos inválidos, partes sin acordes, compases vacíos y acordes raros.
- Los números romanos salen del tono de la canción (o de la parte); en tonos menores usa la escala menor natural. Transponer es solo visual: no cambia lo guardado.

## Decisiones de diseño (no volver a discutirlas sin motivo)
Móvil primero, sin fotos ni degradados; un solo sistema de color (el tono); dos temas (Papel y Escenario); sin letras completas; sin favoritos ni modo offline (se probaron y se quitaron); el editor es secreto (5 toques al título) y se protege en el servidor, no en la pantalla.

## Si quiero ayuda de una IA
Subir toda esta carpeta y este README, y pedir el cambio indicando el archivo. Cualquier campo nuevo implica tocar también `api/canciones.js`.
