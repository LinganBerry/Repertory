# Repertorio

Página con las canciones que sé tocar (acordes, tono y partes). La gente solo mira; el único que edita soy yo.

## Cómo está armado
- **GitHub** (rama `main`) → **Vercel** (plan Hobby, preset "Other"): cada commit se despliega solo. Sin build.
- Sitio estático + una función: `api/canciones.js`.
- Los datos viven en **Vercel Blob** (`repertorio/canciones.json`). `canciones.js` es solo copia de respaldo si el servidor no responde.

| Archivo | Para qué |
|---|---|
| `index.html` | Página pública: lista, buscador, tonos, pantalla de canción, números romanos |
| `editor.js` | Modo editor (se carga solo con `?editar` al final del link) |
| `api/canciones.js` | `GET` público · `POST` protegido con contraseña |
| `canciones.js` | Copia de respaldo (`window.REPERTORIO`) |
| `sw.js` | Desinstalador de la copia offline antigua. Se puede borrar cuando ya no quede nadie con ella |

## Variables de entorno (Vercel → Settings → Environment Variables)
- `ADMIN_PASSWORD`: contraseña del editor. Secreta: nunca va en el repo ni en un chat.
- `BLOB_STORE_ID` y `BLOB_WEBHOOK_PUBLIC_KEY`: las crea el almacén Blob.

## API
- `GET /api/canciones` → devuelve el repertorio (JSON).
- `POST /api/canciones` con `{ "clave": "...", "data": {...} }` → guarda. Responde `401` si la contraseña es incorrecta. El servidor descarta todo campo desconocido (`limpiar()`): un campo nuevo hay que agregarlo ahí.

## Formato de datos (versión 1)
`{version, nombre, intro, actualizado, canciones:[{titulo, artista, tono, nota, enlace, partes:[{nombre, tono, prog, pista}]}]}`

## Escribir las partes (editor)
Una parte por línea: `Nombre (tono): acordes // pista`
- `(tono)` y `// pista` son opcionales; el tono solo si la parte modula.
- `|` marca el compás: `Verso: G D | Em C`.
- La pista es una línea corta (máx. 200 caracteres), nunca la letra completa.
- El editor avisa en vivo de tonos inválidos, partes sin acordes, compases vacíos y acordes raros.

## Publicar un cambio
GitHub → **Add file → Upload files** (o editar el archivo) → commit. Vercel despliega en ~1 minuto.
