// Página 404: aplica el tema guardado de la app y deja jugar con el teclado de juguete (no hace sonido, no usa internet).
(function () {
  'use strict';
  let tema = null;
  try { tema = localStorage.getItem('repertorio-tema'); } catch (e) { /* sin almacenamiento: se usa el tema del sistema */ }
  if (tema !== 'papel' && tema !== 'escenario') tema = matchMedia('(prefers-color-scheme: dark)').matches ? 'escenario' : 'papel';
  document.documentElement.dataset.tema = tema;

  const FRASES = [
    'Esa página no está en el tono.', 'Aquí falta un compás.', 'Silencio de redonda: no hay nada que tocar.',
    'Nota fuera de la escala.', 'Quizá el enlace tiene un bemol de más.', 'Esa página se fue a ensayar a otro lado.'
  ];
  const NOMBRES = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };
  const nombre = n => NOMBRES[n[0]] + (n[1] === '#' ? ' sostenido' : '');

  document.addEventListener('DOMContentLoaded', () => {
    const nota = document.getElementById('nota'), frase = document.getElementById('frase');
    frase.textContent = FRASES[Math.floor(Math.random() * FRASES.length)];
    document.querySelectorAll('.teclado button').forEach(b => {
      const apagar = () => b.classList.remove('suena');
      b.addEventListener('click', () => {
        b.classList.add('suena'); setTimeout(apagar, 180);
        nota.textContent = b.dataset.n + ' · ' + nombre(b.dataset.n);
      });
    });
  });
})();
