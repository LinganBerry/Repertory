// Puente con TimerPiano (tu otra app de práctica: bloques aleatorios con micro-pausas, https://zaenlly1.vercel.app/).
// Sin cuentas ni servidores nuevos: las dos apps se pasan los datos por el enlace.
//   TimerPiano -> Acordes y Tonos: al terminar una sesión, TimerPiano ofrece un botón que abre esta página con
//     "#timer=ID.FECHA.s-h-o-t" (segundos por área). Aquí se valida, se guarda en este dispositivo (sin repetir) y se avisa.
//   Acordes y Tonos -> TimerPiano: la fila "TimerPiano" de Practicar abre la otra app con "#plan=solfeo-5,oido-5"
//     (minutos sugeridos por área; ella los pone y tú le das a empezar).
// La lógica (leer el enlace, sumar, racha) no usa el DOM y se prueba en test/. Lo guardado vive en localStorage.
(function (raiz) {
  'use strict';
  const URL_TIMER = 'https://zaenlly1.vercel.app/';
  const AREAS = ['solfeo', 'hanon', 'oido', 'thompson'];                     // el mismo orden que usa TimerPiano
  const NOMBRES = { solfeo: 'Solfeo', hanon: 'Hanon', oido: 'Canción a oído', thompson: 'John Thompson' };
  const PLAN = { solfeo: 5, oido: 5 };                                         // lo que esta app entrena: leer (solfeo) y oído
  const MAX_REG = 400, MIN_RACHA = 60, MAX_AREA = 14400, MAX_TOTAL = 43200;

  const fecha = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const sumarDias = (f, n) => { const d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() + n); return fecha(d); };
  const fechaValida = f => /^\d{4}-\d{2}-\d{2}$/.test(f) && fecha(new Date(f + 'T12:00:00')) === f;
  const total = d => d.reduce((a, b) => a + b, 0);
  const minutos = s => Math.max(0, Math.round(s / 60));

  // "#timer=ID.FECHA.s-h-o-t" -> { id, f, d: [s, h, o, t] } o null si no es de fiar (formato, fecha futura, cifras absurdas).
  function leerHash(hash, hoy = fecha()) {
    const m = /^#timer=([a-z0-9]{8,24})\.(\d{4}-\d{2}-\d{2})\.(\d{1,5})-(\d{1,5})-(\d{1,5})-(\d{1,5})$/.exec(String(hash || ''));
    if (!m || !fechaValida(m[2]) || m[2] > sumarDias(hoy, 1)) return null;
    const d = m.slice(3).map(Number), suma = total(d);
    return suma < 1 || suma > MAX_TOTAL || d.some(x => x > MAX_AREA) ? null : { id: m[1], f: m[2], d };
  }
  // Lo guardado se lee con cuidado: lo que no cuadra se descarta.
  function limpiar(x) {
    const ses = [];
    for (const s of x && Array.isArray(x.ses) ? x.ses : []) {
      if (s && typeof s.id === 'string' && /^[a-z0-9]{8,24}$/.test(s.id) && typeof s.f === 'string' && fechaValida(s.f)
        && Array.isArray(s.d) && s.d.length === 4 && s.d.every(n => Number.isInteger(n) && n >= 0 && n <= MAX_AREA)) ses.push({ id: s.id, f: s.f, d: s.d.slice() });
    }
    return { v: 1, ses: ses.slice(-MAX_REG) };
  }
  // Suma una sesión sin repetirla (el mismo id no entra dos veces, aunque abras el enlace otra vez).
  function agregar(est, reg) {
    const ses = limpiar(est).ses;
    if (ses.some(s => s.id === reg.id)) return { est: { v: 1, ses }, nuevo: false };
    const todas = [...ses, { id: reg.id, f: reg.f, d: reg.d.slice() }].sort((a, b) => a.f === b.f ? a.id.localeCompare(b.id) : a.f.localeCompare(b.f));
    return { est: { v: 1, ses: todas.slice(-MAX_REG) }, nuevo: true };
  }
  // Hoy, últimos 7 días (con hoy), racha (días seguidos con al menos 1 minuto; si hoy aún no llegas, cuenta desde ayer) y por área.
  function resumen(est, hoy = fecha()) {
    const ses = limpiar(est).ses, porDia = {}, areas = [0, 0, 0, 0], desde = sumarDias(hoy, -6);
    let hoyS = 0, semS = 0;
    for (const s of ses) {
      const t = total(s.d); porDia[s.f] = (porDia[s.f] || 0) + t;
      if (s.f === hoy) hoyS += t;
      if (s.f >= desde && s.f <= hoy) { semS += t; s.d.forEach((x, i) => { areas[i] += x; }); }
    }
    let racha = 0, f = (porDia[hoy] || 0) >= MIN_RACHA ? hoy : sumarDias(hoy, -1);
    while ((porDia[f] || 0) >= MIN_RACHA) { racha++; f = sumarDias(f, -1); }
    return { hoy: hoyS, semana: semS, racha, areas: Object.fromEntries(AREAS.map((a, i) => [a, areas[i]])), registros: ses.length };
  }
  const enlace = (plan = PLAN) => URL_TIMER + '#plan=' + Object.entries(plan).map(([a, m]) => a + '-' + m).join(',');

  const api = { URL_TIMER, AREAS, NOMBRES, PLAN, fecha, leerHash, limpiar, agregar, resumen, enlace, minutos };
  raiz.RepertorioTimer = api;
  if (typeof document === 'undefined') return;

  // --- en la página: guardar lo que llega, avisar y abrir TimerPiano ---
  const CLAVE = 'repertorio-timer-v1', { leer, guardar } = window.RepertorioLocal;
  api.estado = () => limpiar(leer(CLAVE));
  api.abrir = plan => location.assign(enlace(plan));
  function aviso(texto) {
    const previo = document.getElementById('aviso-timer'); if (previo) previo.remove();
    const p = document.createElement('p');
    p.id = 'aviso-timer'; p.className = 'aviso-timer'; p.setAttribute('role', 'status'); p.textContent = texto;
    p.addEventListener('click', () => p.remove());
    document.body.append(p); setTimeout(() => p.remove(), 8000);
  }
  function importarSiHay() {
    const h = location.hash;
    if (!h.startsWith('#timer=')) return;
    history.replaceState(history.state, '', location.pathname + location.search);          // así recargar no lo repite
    const reg = leerHash(h);
    if (!reg) return aviso('No pude leer lo que mandó TimerPiano. Ábrelo otra vez desde allí.');
    const r = agregar(leer(CLAVE), reg);
    if (r.nuevo) guardar(CLAVE, r.est);
    aviso(r.nuevo ? `TimerPiano: se sumaron ${Math.max(1, minutos(total(reg.d)))} min a tu práctica.` : 'Esa práctica de TimerPiano ya estaba guardada.');
  }
  importarSiHay();
  addEventListener('hashchange', importarSiHay);                // por si el enlace llega con la página ya abierta
})(typeof window !== 'undefined' ? window : globalThis);
