// Improvisación: una base de acordes que suena en bucle en el piano y, en pantalla, las notas guía (3ª y 7ª) de cada acorde,
// la escala que le queda y cómo la 7ª de un acorde baja a la 3ª del siguiente. Teoría estándar: nada copiado de ningún método.
// La lógica (motor) no usa el DOM, recibe Tonal ya cargado y se prueba en test/. La pantalla se abre desde Practicar → Herramientas.
(function (raiz) {
  'use strict';
  // Cada compás: [intervalo desde la tónica, calidad, número romano que se muestra]
  const PLANTILLAS = [
    { id: 'ii-V-I', nombre: 'ii – V – I', texto: 'La cadencia del jazz: tres acordes que se resuelven uno en otro.',
      compases: [['2M', 'm7', 'ii7'], ['5P', '7', 'V7'], ['1P', 'maj7', 'Imaj7'], ['1P', 'maj7', 'Imaj7']] },
    { id: 'vuelta', nombre: 'I – vi – ii – V', texto: 'La vuelta clásica: sale de la tónica y regresa a ella.',
      compases: [['1P', 'maj7', 'Imaj7'], ['6M', 'm7', 'vi7'], ['2M', 'm7', 'ii7'], ['5P', '7', 'V7']] },
    { id: 'pop', nombre: 'I – V – vi – IV', texto: 'La progresión de pop de siempre, con séptimas.',
      compases: [['1P', 'maj7', 'Imaj7'], ['5P', '7', 'V7'], ['6M', 'm7', 'vi7'], ['4P', 'maj7', 'IVmaj7']] },
    { id: 'blues', nombre: 'Blues de 12 compases', texto: 'Todos los acordes son dominantes: aquí suena bien el Mixolidio.',
      compases: [['1P', '7', 'I7'], ['1P', '7', 'I7'], ['1P', '7', 'I7'], ['1P', '7', 'I7'], ['4P', '7', 'IV7'], ['4P', '7', 'IV7'],
        ['1P', '7', 'I7'], ['1P', '7', 'I7'], ['5P', '7', 'V7'], ['4P', '7', 'IV7'], ['1P', '7', 'I7'], ['5P', '7', 'V7']] },
    { id: 'menor', nombre: 'Menor: i – ♭VII – ♭VI – V', texto: 'Una vuelta en tono menor (el tono que elijas es la tónica menor).', menor: true,
      compases: [['1P', 'm7', 'i7'], ['7m', '7', '♭VII7'], ['6m', 'maj7', '♭VImaj7'], ['5P', '7', 'V7']] }
  ];
  const TONOS = [['C', 'C'], ['Db', 'D♭'], ['D', 'D'], ['Eb', 'E♭'], ['E', 'E'], ['F', 'F'], ['F#', 'F♯'], ['G', 'G'], ['Ab', 'A♭'], ['A', 'A'], ['Bb', 'B♭'], ['B', 'B']];
  const TEMPOS = [60, 80, 100];   // pulsos por minuto; cada acorde dura un compás de 4 pulsos
  const MODOS = { maj7: ['major', 'Jónico'], 7: ['mixolydian', 'Mixolidio'], m7: ['aeolian', 'Eólico'] };   // el ii7 es la excepción: ver construir()
  const bonito = t => String(t).replace(/#/g, '♯').replace(/([A-G])b/g, '$1♭');

  function motor(T) {
    const { Note, Chord, Scale } = T;
    const midisDe = (simbolo, octava = 3) => {
      let oct = octava, previo = -1;
      return Chord.get(simbolo).notes.map(n => { const ch = Note.chroma(n); if (previo >= 0 && ch <= previo) oct++; previo = ch; return Note.midi(n + oct); });
    };
    // Cómo se mueve la 7ª de un acorde hasta la 3ª del siguiente (el hilo que une una armonía): lo más corto, subiendo o bajando.
    function resolucion(sep, ter) {
      const d0 = (Note.chroma(ter) - Note.chroma(sep) + 12) % 12, d = d0 > 6 ? d0 - 12 : d0;
      if (d === 0) return 'se queda en la misma nota';
      const dir = d < 0 ? 'baja' : 'sube', n = Math.abs(d);
      return n === 1 ? dir + ' medio tono' : n === 2 ? dir + ' un tono' : dir + ' ' + n + ' semitonos';
    }
    // Devuelve null si el tono o la base no existen; si no, la lista de acordes (uno por compás) con todo lo que se muestra y se toca.
    function construir(tonica, id) {
      const pl = PLANTILLAS.find(p => p.id === id);
      if (!pl || !tonica || Note.get(tonica).empty) return null;
      const acordes = pl.compases.map(([iv, q, romano]) => {
        const rz = Note.simplify(Note.transpose(tonica, iv)), simbolo = rz + q, notas = Chord.get(simbolo).notes;   // simplify: nada de B♭♭ ni C♭ (en D♭ menor, ♭VI es A)
        let escala;
        if (romano === 'ii7') {   // el ii de un tono mayor usa las notas de ese tono, contadas desde el ii
          const mayor = Scale.get(tonica + ' major').notes, k = mayor.findIndex(n => Note.chroma(n) === Note.chroma(rz));
          escala = { nombre: tonica + ' mayor desde ' + rz, notas: [...mayor.slice(k), ...mayor.slice(0, k)] };
        } else { const modo = MODOS[q]; escala = { nombre: rz + ' ' + modo[1], notas: Scale.get(rz + ' ' + modo[0]).notes }; }
        return { simbolo, raiz: rz, romano, notas, tercera: notas[1], septima: notas[3], midis: midisDe(simbolo), bajo: Note.midi(rz + '2'), escala };
      });
      acordes.forEach((a, i) => {
        const s = acordes[(i + 1) % acordes.length];
        a.siguiente = s.simbolo; a.resuelve = resolucion(a.septima, s.tercera); a.destino = s.tercera;
      });
      return acordes;
    }
    // Pasos para el piano: un acorde por compás, con el bajo una octava y media abajo; `vueltas` veces seguidas.
    function pasos(acordes, bpm, vueltas) {
      const ms = 240000 / bpm, out = [];
      let k = 0;
      for (let v = 0; v < vueltas; v++) for (const a of acordes) { out.push({ midis: [a.bajo, ...a.midis], en: Math.round(k * ms), dur: Math.round(ms * 0.95) / 1000 }); k++; }
      return out;
    }
    // Cuántas vueltas caben en cerca de 32 compases (así el bucle se reprograma pocas veces).
    const vueltasPara = n => Math.max(1, Math.ceil(32 / n));
    return { construir, pasos, vueltasPara, resolucion };
  }

  const api = { PLANTILLAS, TONOS, TEMPOS, motor };
  raiz.Improvisar = api;
  if (typeof document === 'undefined') return;

  // --- pantalla (dentro de la capa de Practicar) ---
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) k === 'rol' ? n.setAttribute('role', v) : k.includes('-') ? n.setAttribute(k, v) : (n[k] = v);
    n.append(...kids.flat().filter(k => k != null && k !== false));
    return n;
  };
  let caja = null, volverFn = null, M = null, cargando = false;
  let tono = 'C', base = 'ii-V-I', bpm = 80, acordes = null, tocando = false, pos = 0, cuenta = 0, bloque = 0, reloj = null, foco = null;
  const barra = (izq, centro) => el('div', { className: 'cbarra' }, izq, el('span', { className: 'ctitulo' }, centro));
  const poner = (...hijos) => { caja.replaceChildren(...hijos); caja.scrollTop = 0; };
  const audio = () => raiz.RepertorioAudio;

  function parar() {
    clearInterval(reloj); reloj = null; tocando = false;
    try { const a = audio(); if (a && a.detener) a.detener(); } catch (e) { /* sin sonido: nada que detener */ }
  }
  function lanzar() {   // programa el bloque de compases en el piano y arranca el contador de pantalla junto con él
    clearInterval(reloj); reloj = null;
    acordes = M.construir(tono, base);
    if (!acordes) return;
    tocando = true; pos = 0; cuenta = 0; bloque = acordes.length * M.vueltasPara(acordes.length);
    const a = audio(), ms = 240000 / bpm;
    const arrancar = () => { if (!tocando) return; clearInterval(reloj); reloj = setInterval(avanzar, ms); };
    try {
      if (a && a.tocar) Promise.resolve(a.tocar(M.pasos(acordes, bpm, M.vueltasPara(acordes.length)))).then(arrancar, arrancar);   // sin sonido igual corre la pantalla
      else arrancar();
    } catch (e) { arrancar(); }
    pintarActual();
  }
  function avanzar() {
    if (!document.getElementById('im-acorde')) return parar();   // saliste de la pantalla: se apaga todo
    cuenta++;
    if (cuenta >= bloque) return lanzar();                        // se acabó el bloque programado: otra tanda, sin que se note
    pos = cuenta % acordes.length;
    pintarActual();
  }

  function pintarActual() {
    const caja_ = document.getElementById('im-acorde');
    if (!caja_ || !acordes) return;
    const a = acordes[pos];
    caja_.textContent = bonito(a.simbolo);
    document.getElementById('im-romano').textContent = a.romano + (acordes.length > 4 ? ' · compás ' + (pos + 1) + ' de ' + acordes.length : '');
    document.getElementById('im-guia').textContent = '3ª: ' + bonito(a.tercera) + '   ·   7ª: ' + bonito(a.septima);
    document.getElementById('im-sig').textContent = 'Siguiente: ' + bonito(a.siguiente) + '. La 7ª (' + bonito(a.septima) + ') ' + a.resuelve + (a.resuelve.startsWith('se queda') ? '' : ' hasta la 3ª (' + bonito(a.destino) + ')') + '.';
    document.getElementById('im-escala').textContent = 'Escala: ' + bonito(a.escala.nombre) + ' — ' + a.escala.notas.map(bonito).join(' ');
    document.querySelectorAll('#im-fila .chip').forEach((c, i) => c.classList.toggle('oye', i === pos));
  }

  function pantalla(arriba) {
    const pl = PLANTILLAS.find(p => p.id === base);
    const grupo = (rotulo, lista, activo, alElegir, attr) => el('div', { className: 'pastillas', rol: 'group', 'aria-label': rotulo },
      ...lista.map(([id, texto]) => el('button', { type: 'button', [attr]: String(id), 'aria-pressed': String(id === activo), onclick: () => { foco = '[' + attr + '="' + id + '"]'; alElegir(id); } }, texto)));
    const cambiar = () => { if (tocando) lanzar(); pantalla(); };
    const previo = acordes && acordes.length ? acordes : (M ? M.construir(tono, base) : null);
    const y = arriba ? 0 : caja.scrollTop;   // al elegir un tono o una base la pantalla no salta arriba; al abrir, sí empieza arriba
    const encabezado = barra(el('button', { type: 'button', title: 'Volver a Practicar', onclick: () => { parar(); volverFn(); } }, '← Practicar'), 'Improvisación');
    // Fijo arriba: el acorde que suena, sus notas guía y Tocar / Parar (así se ven sin bajar la pantalla).
    const panel = previo ? el('div', { className: 'im-panel', 'aria-live': 'polite' },
      el('p', { className: 'rt-acorde', id: 'im-acorde' }, bonito(previo[tocando ? pos : 0].simbolo)),
      el('p', { className: 'rt-pos', id: 'im-romano' }, ''),
      el('p', { className: 'pr-pedido', id: 'im-guia' }, ''),
      el('div', { className: 'im-botones' },
        el('button', { type: 'button', className: 'primario', id: 'im-tocar', disabled: !M, onclick: () => { lanzar(); pantalla(); } }, tocando ? '↻ Reiniciar' : '▶ Tocar base'),
        el('button', { type: 'button', id: 'im-parar', disabled: !tocando, onclick: () => { parar(); pos = 0; pantalla(); } }, '■ Parar'))) : null;
    poner(
      encabezado,
      panel,
      el('div', { className: 'ccuerpo', 'data-improvisar': '1' },
        !M ? el('p', { id: 'im-cargando' }, cargando ? 'Cargando la teoría…' : 'No se pudo cargar la teoría. Abre Teoría una vez con internet y vuelve aquí.') : null,
        previo ? el('p', { className: 'a', id: 'im-sig' }, '') : null,
        previo ? el('p', { className: 'a', id: 'im-escala' }, '') : null,
        previo ? el('div', { className: 'compas', id: 'im-fila' }, ...previo.map(a => el('span', { className: 'chip' }, el('b', {}, bonito(a.simbolo)), el('i', { className: 'rom' }, a.romano)))) : null,
        el('p', {}, 'Elige un tono y una base: suena en bucle y tú improvisas encima. Primero toca solo las notas guía (3ª y 7ª); luego únelas con las notas de la escala.'),
        el('h3', {}, 'Tono'), grupo('Tono', TONOS.map(t => [t[0], t[1]]), tono, id => { tono = id; acordes = null; cambiar(); }, 'data-tono'),
        el('h3', {}, 'Base'), grupo('Base', PLANTILLAS.map(p => [p.id, p.nombre]), base, id => { base = id; acordes = null; cambiar(); }, 'data-base'),
        el('p', { className: 'a', id: 'im-base-texto' }, pl.texto),
        el('h3', {}, 'Velocidad'), grupo('Velocidad', TEMPOS.map(t => [t, t + ' pulsos']), bpm, id => { bpm = Number(id); cambiar(); }, 'data-bpm')));
    if (panel) panel.style.top = encabezado.offsetHeight + 'px';
    caja.scrollTop = y;
    if (previo) { if (!acordes) acordes = previo; pintarActual(); }
    const f = foco && caja.querySelector(foco); foco = null;
    if (f) f.focus({ preventScroll: true });
    else { const b = caja.querySelector('#im-tocar'); if (b && !b.disabled && !tocando) b.focus({ preventScroll: true }); }
  }

  // Practicar llama a abrir() al entrar y a atras() con Atrás. Aquí Atrás siempre devuelve false (Practicar vuelve a su menú) pero antes apaga el sonido.
  api.abrir = (cajaPracticar, volver) => {
    caja = cajaPracticar; volverFn = volver; acordes = null; tocando = false;
    pantalla(true); caja.focus({ preventScroll: true });
    const t = raiz.RepertorioTeoria;
    if (M || !t || !t.cargarTonal) return;
    cargando = true;
    const sigueAbierta = () => caja && caja.isConnected && caja.querySelector('[data-improvisar]');   // por si saliste antes de que cargara
    t.cargarTonal().then(T => { M = motor(T); cargando = false; if (sigueAbierta()) pantalla(); }).catch(() => { cargando = false; if (sigueAbierta()) pantalla(); });
  };
  api.atras = () => { parar(); return false; };
  api.parar = parar;
  api.avanzar = avanzar;   // para las pruebas: da un paso del contador sin esperar el reloj
})(typeof window !== 'undefined' ? window : globalThis);
