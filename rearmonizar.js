// Rearmonizar: eliges una canción y una parte, tocas un acorde y te sugiere cómo adornarlo o prepararlo, con la razón y las notas para el piano.
// Va por niveles (1 adornos → 4 prestados y sustitutos) para subir poco a poco. Solo muestra ideas: NUNCA cambia tus canciones.
// Las reglas vienen de Jangle (https://github.com/sanhuaaan/jangle, licencia MIT, © 2026 Javier San Juan), adaptadas: usan la librería
// Tonal que ya tiene la página (sin dependencias nuevas), los textos hablan de piano y cada regla pertenece a un nivel.
// El motor no usa el DOM y se prueba en test/. La pantalla se abre desde Practicar.
(function (raiz) {
  'use strict';
  const NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];   // cómo se escribe cada sonido en los acordes que se sugieren
  const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];    // nombre de la tonalidad mayor
  const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
  const DEGREE_QUALITY = ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'];
  const DEGREE_SUFFIX = { maj: '', min: 'm', dim: 'dim' };
  const ROMAN = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
  const noteName = chroma => NOTES[((chroma % 12) + 12) % 12];

  // Cada regla pertenece a un nivel; en cada nivel solo salen las suyas, para aprender de a poco.
  const NIVELES = [
    { n: 1, nombre: 'Adornos', texto: 'El mismo acorde con una nota más: add9, sus2, sus4 y sexta.', reglas: ['ninth', 'sus2', 'sus4', 'sixth'] },
    { n: 2, nombre: 'Más color y notas de paso', texto: 'Séptimas, un disminuido entre dos acordes, el relativo y el mediante.', reglas: ['seventh', 'dimPassing', 'diatonicPassing', 'relative', 'mediant'] },
    { n: 3, nombre: 'Dominantes y ii-V', texto: 'Acordes que preparan al siguiente: dominante secundario, ii-V y líneas.', reglas: ['secondaryDominant', 'iiV', 'secondaryIIV', 'dominantColor', 'alteredDominant', 'minorLine', 'majorLine'] },
    { n: 4, nombre: 'Prestados y sustitutos', texto: 'Menor prestado, puerta trasera, tritono y otros sustitutos.', reglas: ['modalInterchange', 'plagalMinor', 'backdoor', 'tritone', 'chromaticApproach', 'rootlessDominant', 'dimDominant'] }
  ];
  const nivelDe = id => (NIVELES.find(x => x.reglas.includes(id)) || {}).n || 0;

  function motor(T) {
    const { Chord, Note } = T;
    const up = (note, semis) => noteName(Note.chroma(note) + semis);
    const isDominant = c => c.intervals.includes('3M') && c.intervals.includes('7m');
    const isMajorish = c => c.intervals.includes('3M') && !c.intervals.includes('7m');
    const isMinorish = c => c.intervals.includes('3m') && !c.intervals.includes('5d');
    const isDim = c => c.intervals.includes('5d');
    const isTriad = c => c.intervals.length === 3;       // las reglas de adorno solo entran donde hay sitio libre
    const isSeventh = c => c.intervals.length === 4;
    const qualityOf = c => (isDominant(c) ? 'dom' : isDim(c) ? 'dim' : c.intervals.includes('3m') ? 'min' : 'maj');
    const degreeIn = (key, tonic) => MAJOR_STEPS.indexOf((Note.chroma(tonic) - key + 12) % 12);
    const diatonicChord = (key, deg) => noteName(key + MAJOR_STEPS[deg]) + DEGREE_SUFFIX[DEGREE_QUALITY[deg]];

    // Tonalidad mayor que mejor encaja con la progresión (croma de la tónica). En empate gana el tono del primer acorde.
    function detectKey(progression) {
      const ps = progression.filter(Boolean);
      let best = 0, bestScore = -1;
      const first = !ps.length ? -1 : (Note.chroma(ps[0].tonic) + (qualityOf(ps[0]) === 'min' ? 3 : 0)) % 12;
      for (let k = 0; k < 12; k++) {
        let score = 0;
        for (const c of ps) {
          const deg = degreeIn(k, c.tonic);
          if (deg === -1) continue;
          const q = qualityOf(c);
          score += q === DEGREE_QUALITY[deg] || (q === 'dom' && deg === 4) ? 2 : 1;
        }
        if (score > bestScore || (score === bestScore && k === first)) { bestScore = score; best = k; }
      }
      return best;
    }
    // Si la canción dice su tono, manda ese (un tono menor se lee en su relativo mayor, como hace la página).
    function llaveDe(tono, progression) {
      const t = tono && Note.get(String(tono).replace(/m.*$/, ''));
      if (t && !t.empty && /^[A-G]/.test(String(tono))) return (t.chroma + (/^[A-G][#b]?m(?!aj)/.test(String(tono)) ? 3 : 0)) % 12;
      return detectKey(progression);
    }

    const RULES = [
      { id: 'tritone', name: 'Sustitución de tritono', apply: c => {
        if (!isDominant(c)) return null;
        const sub = up(c.tonic, 6) + '7';
        return { chords: [sub], why: `${sub} comparte con ${c.symbol} el tritono ${up(c.tonic, 4)}–${up(c.tonic, 10)} (3ª y 7ª), que es lo que pide resolver: ambos dominantes resuelven en el mismo sitio.` };
      } },
      { id: 'relative', name: 'Relativo', apply: c => {
        if (isMajorish(c)) {
          const sub = up(c.tonic, 9) + 'm';
          return { chords: [sub], why: `${sub} es el relativo menor de ${c.symbol}: comparten ${c.tonic} y ${up(c.tonic, 4)}, así que cumple la misma función con color menor.` };
        }
        if (isMinorish(c)) {
          const sub = up(c.tonic, 3);
          return { chords: [sub], why: `${sub} es el relativo mayor de ${c.symbol}: comparten ${up(c.tonic, 3)} y ${up(c.tonic, 7)}, así que cumple la misma función con color mayor.` };
        }
        return null;
      } },
      { id: 'secondaryDominant', name: 'Dominante secundario', apply: c => {
        const v7 = up(c.tonic, 7) + '7';
        return { chords: [v7, c.symbol], why: `${v7} es el V7 de ${c.symbol}: un dominante prestado que crea tensión y resuelve directamente sobre él.` };
      } },
      { id: 'iiV', name: 'Inserción ii-V', apply: c => {
        if (!isDominant(c)) return null;
        const ii = up(c.tonic, 7) + 'm7';
        return { chords: [ii, c.symbol], why: `${ii} es el ii asociado a ${c.symbol}: convierte el dominante suelto en una cadencia ii–V completa, el giro más común del jazz.` };
      } },
      { id: 'dimPassing', name: 'Disminuido de paso', apply: (c, next) => {
        if (!next) return null;
        const gap = (Note.chroma(next.tonic) - Note.chroma(c.tonic) + 12) % 12;
        if (gap !== 2 && gap !== 10) return null;     // solo el tono entero (arriba o abajo)
        const dim = up(c.tonic, gap === 2 ? 1 : 11) + 'dim7';
        return { chords: [c.symbol, dim], why: `${dim} rellena cromáticamente el paso entre ${c.symbol} y ${next.symbol}: el bajo ${gap === 2 ? 'sube' : 'baja'} por semitonos y la sonoridad disminuida empuja hacia ${next.symbol}.` };
      } },
      { id: 'diatonicPassing', name: 'Paso diatónico', apply: (c, next, key) => {
        if (!next) return null;
        const degC = degreeIn(key, c.tonic), degN = degreeIn(key, next.tonic);
        if (degC === -1 || degN === -1) return null;
        const diff = (degN - degC + 7) % 7;
        if (diff !== 2 && diff !== 5) return null;     // solo saltos de tercera
        const mid = (degC + (diff === 2 ? 1 : -1) + 7) % 7;
        const midChord = diatonicChord(key, mid);
        return { chords: [c.symbol, midChord], why: `${midChord} es el ${ROMAN[mid]} de ${KEYS[key]} mayor: une ${c.symbol} y ${next.symbol} ${diff === 2 ? 'subiendo' : 'bajando'} grado a grado por la escala, sin salir de la tonalidad.` };
      } },
      { id: 'modalInterchange', name: 'Intercambio modal', apply: c => {
        if (!isMajorish(c)) return null;
        return { chords: [c.tonic + 'm'], why: `${c.tonic}m está prestado del modo menor paralelo: mismo centro tonal (${c.tonic}) con la tercera menor, que oscurece el color sin romper la progresión.` };
      } },
      { id: 'mediant', name: 'Mediante', apply: c => {
        if (!isMajorish(c) || !isTriad(c)) return null;
        const sub = up(c.tonic, 4) + 'm';
        return { chords: [sub], why: `${sub} comparte dos de las tres notas de ${c.symbol} (${up(c.tonic, 4)} y ${up(c.tonic, 7)}) y deja fuera la fundamental: hace el mismo papel con el suelo quitado, así que suena a lo mismo pero sin cerrar.` };
      } },
      { id: 'rootlessDominant', name: 'Dominante sin fundamental', apply: c => {
        if (!isDominant(c)) return null;
        const sub = up(c.tonic, 4) + 'm7b5';
        return { chords: [sub], why: `${sub} (${up(c.tonic, 4)} ${up(c.tonic, 7)} ${up(c.tonic, 10)} ${up(c.tonic, 2)}) es ${c.tonic}9 quitándole el ${c.tonic}: mismo tritono, misma resolución, pero el bajo queda libre para hacer otra cosa.` };
      } },
      { id: 'dimDominant', name: 'Disminuido dominante', apply: c => {
        if (!isDominant(c)) return null;
        const sub = up(c.tonic, 4) + 'dim7';
        return { chords: [sub], why: `${sub} es ${c.tonic}7b9 sin la fundamental: conserva el tritono ${up(c.tonic, 4)}–${up(c.tonic, 10)} y le añade la novena menor (${up(c.tonic, 8)}), que aprieta la resolución. Tira más que ${c.symbol}, sobre todo hacia un menor.` };
      } },
      { id: 'seventh', name: 'Séptima diatónica', apply: (c, next, key) => {
        if (!isTriad(c)) return null;
        if (isMinorish(c)) return { chords: [c.tonic + 'm7'], why: `${c.tonic}m7 le añade la 7ª menor (${up(c.tonic, 10)}): mismo sitio y misma función, con una nota más que rellena el acorde sin ensuciarlo.` };
        if (!isMajorish(c)) return null;
        const dom = degreeIn(key, c.tonic) === 4;     // el V pide séptima menor, no mayor
        const sub = c.tonic + (dom ? '7' : 'maj7');
        return { chords: [sub], why: dom
          ? `${sub} le añade la 7ª menor (${up(c.tonic, 10)}): como V de ${KEYS[key]} mayor, esa nota forma con la tercera el tritono que pide resolver a la tónica.`
          : `${sub} le añade la 7ª mayor (${up(c.tonic, 11)}): el acorde se queda flotando en vez de cerrar, que es de donde sale el color de balada.` };
      } },
      { id: 'sixth', name: 'Sexta', apply: c => {
        if (!isTriad(c) && !isSeventh(c)) return null;
        if (isMajorish(c)) return { chords: [c.tonic + '6'], why: `${c.tonic}6 pone la 6ª (${up(c.tonic, 9)}) donde iría la séptima: rellena igual que un maj7 pero sin sonar a jazz, y cierra bien porque no deja tensión pendiente.` };
        if (isMinorish(c)) return { chords: [c.tonic + 'm6'], why: `${c.tonic}m6 sube la 6ª mayor (${up(c.tonic, 9)}) sobre el menor: es el color dórico, menor pero sin la caída del m7. Ojo, esa nota puede salirse de la tonalidad.` };
        return null;
      } },
      { id: 'ninth', name: 'Novena', apply: c => {
        const nine = up(c.tonic, 2);
        const add = (suffix, texto) => ({ chords: [c.tonic + suffix], why: texto });
        if (isTriad(c) && isMajorish(c)) return add('add9', `${c.tonic}add9 añade la 9ª (${nine}) sin tocar la séptima: es la nota que hace que un acorde suene a canción de verdad y no a manual de acordes.`);
        if (isTriad(c) && isMinorish(c)) return add('madd9', `${c.tonic}madd9 añade la 9ª (${nine}) al menor sin séptima: queda transparente, con menos peso que un ${c.tonic}m9 pero con el mismo aire.`);
        if (!isSeventh(c)) return null;
        if (isMinorish(c)) return add('m9', `${c.tonic}m9 apila la 9ª (${nine}) sobre ${c.symbol}: el menor con séptima gana altura sin cambiar de función.`);
        if (isMajorish(c) && c.intervals.includes('7M')) return add('maj9', `${c.tonic}maj9 apila la 9ª (${nine}) sobre ${c.symbol}: la extensión más suave que admite un maj7.`);
        return null;
      } },
      { id: 'dominantColor', name: 'Tensión del dominante', apply: c => {
        if (!isDominant(c) || !isSeventh(c)) return null;
        return { chords: [c.tonic + '13'], why: `${c.tonic}13 le pone la 13ª (${up(c.tonic, 9)}) a ${c.symbol}: la tensión más dulce del dominante, la que se usa cuando se quiere color pero no que suene alterado.` };
      } },
      { id: 'alteredDominant', name: 'Dominante alterado', apply: (c, next) => {
        if (!isDominant(c) || !isSeventh(c)) return null;
        if (next && isMinorish(next)) return { chords: [c.tonic + '7b9'], why: `${c.tonic}7b9 añade la 9ª menor (${up(c.tonic, 1)}): pertenece a la escala del menor al que resuelve, así que aprieta la caída hacia ${next.symbol} en vez de suavizarla.` };
        return { chords: [c.tonic + '7#9'], why: `${c.tonic}7#9 hace sonar a la vez la tercera mayor (${up(c.tonic, 4)}) y la menor (${up(c.tonic, 3)}): el acorde de Hendrix, tensión de blues sin salirse del dominante.` };
      } },
      { id: 'sus4', name: 'Retardo sus4', apply: c => {
        const suspended = isDominant(c) && isSeventh(c) ? c.tonic + '7sus4'
          : (isTriad(c) || isSeventh(c)) && (isMajorish(c) || isMinorish(c)) ? c.tonic + 'sus4' : null;
        if (!suspended) return null;
        return { chords: [suspended, c.symbol], why: `${suspended} retrasa la tercera: en su lugar suena la 4ª (${up(c.tonic, 5)}), que cae a ella al llegar ${c.symbol}. El acorde llega dos veces, primero pendiente y luego resuelto.` };
      } },
      { id: 'sus2', name: 'Suspensión sus2', apply: c => {
        if (!isTriad(c) || !(isMajorish(c) || isMinorish(c))) return null;
        return { chords: [c.tonic + 'sus2'], why: `${c.tonic}sus2 quita la tercera y pone la 2ª (${up(c.tonic, 2)}): el acorde se queda sin género, ni mayor ni menor, y deja que sea la melodía la que diga cuál de los dos es.` };
      } },
      { id: 'backdoor', name: 'Dominante de puerta trasera', apply: c => {
        if (!isMajorish(c)) return null;
        const sub = up(c.tonic, 10) + '7';
        return { chords: [sub, c.symbol], why: `${sub} es el bVII7 prestado del modo menor: no es el V de ${c.symbol}, pero resuelve igual porque su ${up(c.tonic, 8)} baja al ${up(c.tonic, 7)} y su ${up(c.tonic, 5)} al ${up(c.tonic, 4)}. Es la puerta de atrás del soul.` };
      } },
      { id: 'chromaticApproach', name: 'Aproximación cromática', apply: c => {
        const sub = up(c.tonic, 1) + '7';
        return { chords: [sub, c.symbol], why: `${sub} es el dominante que está justo un semitono por encima de ${c.symbol}, o sea el sustituto de tritono de su V: entra deslizándose desde arriba en vez de saltar desde la quinta.` };
      } },
      { id: 'plagalMinor', name: 'Subdominante menor', apply: c => {
        if (!isMajorish(c)) return null;
        const sub = up(c.tonic, 5) + 'm';
        return { chords: [sub, c.symbol], why: `${sub} es el IV menor prestado del modo menor: su ${up(c.tonic, 8)} baja medio tono al ${up(c.tonic, 7)} de ${c.symbol}. Ese medio tono es el giro agridulce que cierra media discografía de los sesenta.` };
      } },
      { id: 'secondaryIIV', name: 'ii-V secundario', apply: c => {
        const ii = up(c.tonic, 2) + (isMinorish(c) ? 'm7b5' : 'm7'), v = up(c.tonic, 7) + '7';
        return { chords: [ii, v, c.symbol], why: `${ii} y ${v} son el ii–V propio de ${c.symbol}: en vez de llegar de golpe, el acorde se prepara con su cadencia prestada. Sirve para convertir un compás quieto en tres acordes.` };
      } },
      { id: 'minorLine', name: 'Línea cromática interna', apply: c => {
        if (!isMinorish(c) || !(isTriad(c) || isSeventh(c))) return null;
        return { chords: [c.tonic + 'm', c.tonic + 'mMaj7', c.tonic + 'm7', c.tonic + 'm6'], why: `El acorde no cambia: baja una voz por dentro, ${c.tonic} → ${up(c.tonic, 11)} → ${up(c.tonic, 10)} → ${up(c.tonic, 9)}. El paso raro es ${c.tonic}mMaj7, y es justo el que hace la gracia.` };
      } },
      { id: 'majorLine', name: 'Línea hacia el IV', apply: (c, next) => {
        if (!next || !isMajorish(c) || !isTriad(c)) return null;
        if ((Note.chroma(next.tonic) - Note.chroma(c.tonic) + 12) % 12 !== 5) return null;
        return { chords: [c.symbol, c.tonic + 'maj7', c.tonic + '7'], why: `Camino a ${next.symbol}: mientras el acorde se queda quieto, una voz baja ${c.tonic} → ${up(c.tonic, 11)} → ${up(c.tonic, 10)}, y al llegar a ${c.tonic}7 ya es el V de ${next.symbol}, así que la resolución cae sola.` };
      } }
    ];

    // Para cada acorde (los que no se pueden leer, como N.C., no llevan sugerencias): las opciones de ese nivel, sin repetir y sin lo que no cambie nada.
    function opciones(simbolos, nivel, tono) {
      const cs = simbolos.map(s => { const c = Chord.get(s); return c.empty || !c.tonic ? null : c; });
      const key = llaveDe(tono, cs);
      const delNivel = (NIVELES.find(x => x.n === nivel) || NIVELES[0]).reglas.map(id => RULES.find(r => r.id === id));   // en el orden del nivel: lo más simple primero
      return cs.map((c, i) => {
        if (!c) return [];
        const vistas = new Set([c.symbol]), out = [];
        for (const rule of delNivel) {
          const r = rule.apply(c, cs[i + 1] || null, key);
          if (!r) continue;
          const clave = r.chords.join(' ');
          if (vistas.has(clave)) continue;
          vistas.add(clave);
          out.push({ id: rule.id, nivel: nivelDe(rule.id), regla: rule.name, acordes: r.chords, porque: r.why, notas: r.chords.map(s => Chord.get(s).notes) });
        }
        return out;
      });
    }
    // Notas de un acorde como números MIDI subiendo desde la octava 3 (para oírlo en el piano).
    function midis(simbolo, octava = 3) {
      const notas = Chord.get(simbolo).notes;
      let oct = octava, previo = -1;
      return notas.map(n => { const ch = Note.chroma(n); if (previo >= 0 && ch <= previo) oct++; previo = ch; return Note.midi(n + oct); });
    }
    return { opciones, midis, llaveDe, detectKey, RULES };
  }

  const api = { NIVELES, nivelDe, motor };
  raiz.Rearmonizar = api;
  if (typeof document === 'undefined') return;

  // --- pantalla (dentro de la capa de Practicar) ---
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) k === 'rol' ? n.setAttribute('role', v) : k.includes('-') ? n.setAttribute(k, v) : (n[k] = v);
    n.append(...kids.flat().filter(k => k != null && k !== false));
    return n;
  };
  const NIVEL = 'repertorio-rearm-nivel';
  const leer = () => { try { return Number(localStorage.getItem(NIVEL)); } catch (e) { return 1; } };
  const guardar = n => { try { localStorage.setItem(NIVEL, String(n)); } catch (e) { /* sin espacio: no pasa nada grave */ } };
  let caja = null, volverFn = null, vista = 'menu', nivel = 1, M = null, cargando = false;
  let cancion = null, parteIx = 0, grupos = [], flat = [], sel = -1, cambios = {}, ops = [];
  const barra = (izq, centro) => el('div', { className: 'cbarra' }, izq, el('span', { className: 'ctitulo' }, centro));
  const atrasBtn = (texto, titulo) => el('button', { type: 'button', title: titulo, onclick: () => history.back() }, texto);
  const poner = (...hijos) => { caja.replaceChildren(...hijos); caja.scrollTop = 0; };

  function lista() {
    const app = raiz.RepertorioApp;
    return app && app.data && Array.isArray(app.data.canciones) ? app.data.canciones.filter(c => c && !c.borrada && Array.isArray(c.partes) && c.partes.some(p => p && p.prog)) : [];
  }
  function selectorNivel(alCambiar) {
    return el('div', { className: 'parte' }, el('h3', {}, 'Nivel'),
      el('div', { className: 'tg', rol: 'group', 'aria-label': 'Nivel' }, ...NIVELES.map(x => el('button', {
        type: 'button', 'data-nivel': String(x.n), 'aria-pressed': String(nivel === x.n),
        onclick: () => { nivel = x.n; guardar(nivel); alCambiar(); const b = caja.querySelector(`[data-nivel="${x.n}"]`); if (b) b.focus({ preventScroll: true }); }
      }, String(x.n)))),
      el('p', { className: 'a', id: 'rr-nivel-texto' }, `${NIVELES[nivel - 1].nombre}: ${NIVELES[nivel - 1].texto}`));
  }

  function menu(conservar) {
    vista = 'menu';
    const y = conservar ? caja.scrollTop : 0, canciones = lista();
    poner(
      barra(el('button', { type: 'button', title: 'Volver a Practicar', onclick: () => { vista = 'fuera'; volverFn(); } }, '← Practicar'), 'Rearmonizar'),
      el('div', { className: 'ccuerpo', 'data-rr': '1' },
        el('p', {}, 'Elige una canción y un acorde: te sugiere cómo adornarlo, con las notas y la razón. Solo son ideas, no cambia tus canciones.'),
        !M ? el('p', { id: 'rr-cargando' }, cargando ? 'Cargando la teoría…' : 'No se pudo cargar la teoría. Abre Teoría una vez con internet y vuelve aquí.') : null,
        selectorNivel(() => menu(true)),
        el('div', { className: 'parte' }, el('h3', {}, 'Tus canciones'),
          canciones.length ? el('div', { className: 'chips', id: 'rr-canciones' }, ...canciones.map(c => el('button', { type: 'button', className: 'rr-cancion', disabled: !M, onclick: () => abrirCancion(c) }, c.titulo || 'Sin título')))
            : el('p', { id: 'rr-vacio' }, 'Aún no tienes canciones con acordes. Guarda una (con internet) y vuelve aquí.'))));
    caja.scrollTop = y;
  }

  function abrirCancion(c) { cancion = c; parteIx = Math.max(0, c.partes.findIndex(p => p && p.prog)); cambios = {}; sel = -1; vistaCancion(); }
  function prepararParte() {
    const p = cancion.partes[parteIx], app = raiz.RepertorioApp;
    grupos = app.compases(p.prog); flat = grupos.flat();
    ops = M.opciones(flat, nivel, p.tono || cancion.tono);
  }
  const versionTexto = () => { let i = 0; return grupos.map(g => g.map(a => { const k = i++; return cambios[k] ? cambios[k].acordes.join(' ') : a; }).join(' ')).join(' | '); };

  function vistaCancion(conservar) {
    vista = 'cancion';
    const y = conservar ? caja.scrollTop : 0;
    prepararParte();
    let i = 0;
    const acordes = grupos.map((g, gi) => [gi ? el('span', { className: 'a', 'aria-hidden': 'true' }, '|') : null, ...g.map(a => {
      const k = i++;
      return el('button', { type: 'button', className: 'rr-acorde', 'data-ix': String(k), 'aria-pressed': String(sel === k),
        onclick: () => { sel = sel === k ? -1 : k; vistaCancion(true); const b = caja.querySelector(`[data-ix="${k}"]`); if (b) b.focus({ preventScroll: true }); } }, cambios[k] ? cambios[k].acordes.join(' ') : a);
    })]);
    const sugerencias = sel < 0 ? el('p', { className: 'a', id: 'rr-pista' }, 'Toca un acorde para ver ideas.')
      : (ops[sel].length ? ops[sel].map((o, ix) => tarjeta(o, ix)) : [el('p', { className: 'a', id: 'rr-sinideas' }, 'Este acorde no tiene ideas en este nivel. Prueba otro acorde u otro nivel.')]);
    const hayCambios = Object.keys(cambios).length > 0;
    poner(
      barra(atrasBtn('← Canciones', 'Volver a tus canciones'), cancion.titulo || 'Canción'),
      el('div', { className: 'ccuerpo', 'data-rr': '1' },
        cancion.partes.filter(p => p && p.prog).length > 1 ? el('div', { className: 'tg', rol: 'group', 'aria-label': 'Parte' }, ...cancion.partes.map((p, k) => p && p.prog ? el('button', {
          type: 'button', 'aria-pressed': String(k === parteIx), onclick: () => { parteIx = k; cambios = {}; sel = -1; vistaCancion(); } }, p.nombre || 'Parte ' + (k + 1)) : null)) : null,
        selectorNivel(() => { cambios = {}; vistaCancion(true); }),
        el('div', { className: 'parte' }, el('h3', {}, 'Acordes'), el('div', { className: 'tg', id: 'rr-acordes' }, ...acordes.flat())),
        el('div', { className: 'parte', id: 'rr-ideas' }, el('h3', {}, 'Ideas'), ...[].concat(sugerencias)),
        hayCambios ? el('div', { className: 'parte', id: 'rr-version' }, el('h3', {}, 'Tu versión'), el('p', { className: 'rt-prog', id: 'rr-version-texto' }, versionTexto()),
          el('p', {}, el('button', { type: 'button', id: 'rr-copiar', onclick: copiar }, 'Copiar'), ' ', el('button', { type: 'button', id: 'rr-limpiar', onclick: () => { cambios = {}; vistaCancion(true); } }, 'Quitar cambios'))) : null));
    caja.scrollTop = y;
  }

  function tarjeta(o, ix) {
    const puesto = cambios[sel] && cambios[sel].id === o.id;
    return el('div', { className: 'rr-idea', 'data-regla': o.id },
      el('p', { className: 'rt-prog' }, o.acordes.join(' → ')),
      el('p', { className: 'a' }, o.regla),
      el('p', { className: 'a' }, o.porque),
      el('p', { className: 'a' }, 'Notas: ' + o.acordes.map((s, k) => s + ' (' + o.notas[k].join(' ') + ')').join(' · ')),
      el('p', {}, el('button', { type: 'button', className: 'rr-oir', onclick: () => oir(o) }, 'Oír'), ' ',
        el('button', { type: 'button', className: puesto ? '' : 'primario', onclick: () => { if (puesto) delete cambios[sel]; else cambios[sel] = o; vistaCancion(true); } }, puesto ? 'Quitar' : 'Usar')));
  }
  function oir(o) {
    const audio = raiz.RepertorioAudio;
    if (!audio || !audio.tocar) return;
    try { Promise.resolve(audio.tocar(o.acordes.map((s, i) => ({ midis: M.midis(s), en: i * 1100, dur: 1.4 })))).catch(() => { /* sin sonido: no pasa nada */ }); } catch (e) { /* idem */ }
  }
  function copiar() {
    const t = versionTexto(), b = document.getElementById('rr-copiar');
    const listo = ok => { if (b) b.textContent = ok ? 'Copiado' : 'No se pudo copiar'; };
    try { navigator.clipboard.writeText(t).then(() => listo(true), () => listo(false)); } catch (e) { listo(false); }
  }

  // Practicar llama a abrir() al entrar y a atras() con Atrás: desde una canción vuelve a la lista (devuelve true); desde la lista, false.
  api.abrir = (cajaPracticar, volver) => {
    caja = cajaPracticar; volverFn = volver; cancion = null; cambios = {}; sel = -1;
    const g = leer(); nivel = g >= 1 && g <= NIVELES.length ? g : 1;
    menu(); caja.focus({ preventScroll: true });
    const t = raiz.RepertorioTeoria;
    if (M) return;
    if (!t || !t.cargarTonal) return;
    cargando = true;
    t.cargarTonal().then(T => { M = motor(T); cargando = false; if (vista === 'menu') menu(true); }).catch(() => { cargando = false; if (vista === 'menu') menu(true); });
  };
  api.atras = () => {
    if (vista === 'cancion') { menu(); return true; }
    return false;
  };
})(typeof window !== 'undefined' ? window : globalThis);
