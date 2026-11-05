// Ayudas comunes del navegador, en un solo lugar (antes cada archivo tenía su copia):
//  - leer / guardar: datos de este dispositivo en localStorage (si no hay espacio o está bloqueado, no pasa nada grave)
//  - leerPase / guardarPase / olvidarPase: el pase de sesión del editor (30 días; la contraseña NO se guarda)
//  - enviar: POST con tiempo límite, para que con mala señal no se quede colgado
// Se carga primero en index.html. Los demás archivos la usan como window.RepertorioLocal.
(function (raiz) {
  'use strict';
  const leer = (k, def = null) => { try { const v = JSON.parse(localStorage.getItem(k)); return v === null || v === undefined ? def : v; } catch (e) { return def; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin espacio: no pasa nada grave */ } };

  const SESION = 'repertorio-sesion-v3';
  const leerPase = () => { try { return sessionStorage.getItem(SESION) || localStorage.getItem(SESION) || ''; } catch (e) { return ''; } };
  const olvidarPase = () => { try { sessionStorage.removeItem(SESION); localStorage.removeItem(SESION); } catch (e) { /* nada */ } };
  // fija = true: se queda en este dispositivo (localStorage); si no, solo mientras la pestaña esté abierta (sessionStorage)
  const guardarPase = (v, fija) => { olvidarPase(); try { (fija ? localStorage : sessionStorage).setItem(SESION, v); } catch (e) { /* nada */ } };

  // POST con tiempo límite. Devuelve { r, j } (la respuesta y su JSON). Si vence, lanza un error con e.tiempo = true.
  async function enviar(url, cuerpo, ms = 20000) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo), signal: ctl.signal });
      const j = await r.json().catch(() => ({}));
      if (ctl.signal.aborted) throw new Error('tiempo');
      return { r, j };
    } catch (e) { if (ctl.signal.aborted) { e.tiempo = true; } throw e; }
    finally { clearTimeout(t); }
  }

  raiz.RepertorioLocal = { leer, guardar, leerPase, guardarPase, olvidarPase, enviar };
})(typeof window !== 'undefined' ? window : globalThis);
