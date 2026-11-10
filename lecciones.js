// Lecciones cortas de Practicar: texto y dibujos de ejemplo, uno por tema. Solo datos (sin DOM); practicar.js las muestra.
// visual: { tipo: 'pentagrama', clave, nota: [letra, alteración, octava] } | { tipo: 'armadura', clave, f } | { tipo: 'teclado', marcar: [midi] }
(function (raiz) {
  'use strict';
  const LECCIONES = [
    {
      id: 'sol', titulo: 'Clave de sol', temas: ['sol'],
      puntos: [
        'El pentagrama tiene 5 líneas y 4 espacios. Se cuentan de abajo hacia arriba.',
        'La clave de sol se enrolla en la 2ª línea: esa línea es G (sol).',
        'Líneas, de abajo hacia arriba: E G B D F. Espacios: F A C E.',
        'El C central (C4) se escribe en una línea adicional debajo del pentagrama.'
      ],
      visuales: [{ tipo: 'pentagrama', clave: 'sol', nota: ['G', 0, 4] }, { tipo: 'pentagrama', clave: 'sol', nota: ['C', 0, 4] }]
    },
    {
      id: 'fa', titulo: 'Clave de fa', temas: ['fa'],
      puntos: [
        'Los dos puntos de la clave de fa rodean la 4ª línea: esa línea es F (fa).',
        'Líneas, de abajo hacia arriba: G B D F A. Espacios: A C E G.',
        'El C central (C4) se escribe en una línea adicional encima del pentagrama.',
        'En el piano, la clave de fa suele leerla la mano izquierda y la de sol la derecha.'
      ],
      visuales: [{ tipo: 'pentagrama', clave: 'fa', nota: ['F', 0, 3] }, { tipo: 'pentagrama', clave: 'fa', nota: ['C', 0, 4] }]
    },
    {
      id: 'teclado', titulo: 'El teclado', temas: ['teclado', 'tecla'],
      puntos: [
        'Las teclas negras van en grupos de 2 y de 3.',
        'C es la blanca justo a la izquierda del grupo de 2 negras. F es la blanca a la izquierda del grupo de 3.',
        'Una tecla negra se llama ♯ de la blanca de su izquierda y ♭ de la blanca de su derecha.',
        'Entre E y F, y entre B y C, no hay tecla negra: la distancia ya es de un semitono.'
      ],
      visuales: [{ tipo: 'teclado', marcar: [60, 65] }]
    },
    {
      id: 'intervalos', titulo: 'Intervalos', temas: ['int-asc', 'int-desc', 'int-arm'],
      puntos: [
        'Un intervalo es la distancia entre dos notas. Se mide en semitonos (una tecla a la siguiente, negras incluidas).',
        '2ª menor 1 · 2ª mayor 2 · 3ª menor 3 · 3ª mayor 4 · 4ª justa 5 · tritono 6 · 5ª justa 7 · 6ª menor 8 · 6ª mayor 9 · 7ª menor 10 · 7ª mayor 11 · octava 12.',
        'Las terceras te dicen el carácter: la mayor suena brillante y la menor, más oscura.',
        'Referencias de canciones al subir: 4ª justa = “Aquí viene la novia”; 5ª justa = las dos primeras notas distintas de “Estrellita, ¿dónde estás?”; octava = el salto de “Somewhere over the rainbow”.',
        'Cuando las dos notas suenan a la vez, el tritono y las segundas son las más tensas; la 5ª justa y la octava, las más estables.'
      ],
      visuales: [{ tipo: 'teclado', marcar: [60, 67] }]
    },
    {
      id: 'acordes', titulo: 'Acordes', temas: ['acordes'],
      puntos: [
        'Una tríada se arma con una nota, su 3ª y su 5ª. Lo que cambia es el tamaño de esas terceras.',
        'Mayor 0-4-7 (alegre) · menor 0-3-7 (triste) · disminuido 0-3-6 (tenso) · aumentado 0-4-8 (flotante). Los números son semitonos desde la nota más grave.',
        'Las séptimas añaden una 4ª nota: mayor 7ª 0-4-7-11 · dominante 7ª 0-4-7-10 · menor 7ª 0-3-7-10 · semidisminuido 0-3-6-10.',
        'El dominante 7ª pide resolver: suena a “falta algo” y busca el acorde que lo sigue.'
      ],
      visuales: [{ tipo: 'teclado', marcar: [60, 64, 67] }]
    },
    {
      id: 'progresiones-oido', titulo: 'Progresiones de acordes', temas: ['prog-oido'],
      puntos: [
        'En una progresión no se oyen notas sueltas: se oye cómo se mueve el bajo y qué tan “en casa” o “lejos” suena cada acorde. Los números romanos dicen el grado: I es la tónica, IV la subdominante y V la dominante.',
        'I–IV–V–I sale de casa (I), se aleja (IV), crea tensión (V) y regresa (I). Es la base de muchísimas canciones.',
        'I–V–vi–IV, I–vi–IV–V y vi–IV–I–V usan los mismos cuatro acordes en otro orden. Fíjate con cuál empieza y en cuál “descansa” al final.',
        'Truco: tararea la nota más grave de cada acorde y compárala con la del primero. IV queda 5 semitonos arriba de I, V queda 7 arriba y vi queda 9 arriba.',
        'Los acordes con ♭ (♭VII, ♭VI, ♭III) o el iv menor suenan “prestados” del tono menor: dan un color más oscuro que los del tono mayor.'
      ],
      visuales: [{ tipo: 'teclado', marcar: [60, 65, 67] }]
    },
    {
      id: 'armaduras', titulo: 'Armaduras', temas: ['arm-sol', 'arm-fa', 'arm-num'],
      puntos: [
        'La armadura son las alteraciones que se escriben al inicio: valen para todas las notas de esa letra, en toda la pieza.',
        'Orden de los sostenidos: F C G D A E B. Los bemoles van al revés: B E A D G C F.',
        'Tonalidad mayor con sostenidos: la tónica está un semitono por encima del último sostenido. Ej.: F♯ C♯ → el último es C♯ → D mayor.',
        'Tonalidad mayor con bemoles: la tónica es el penúltimo bemol. Ej.: B♭ E♭ A♭ → el penúltimo es E♭ → E♭ mayor. Con un solo bemol es F mayor (de memoria).',
        'Cada armadura sirve también a una tonalidad menor, 3 semitonos por debajo de la mayor. Ej.: C mayor y A menor no tienen alteraciones.'
      ],
      visuales: [{ tipo: 'armadura', clave: 'sol', f: 2 }, { tipo: 'armadura', clave: 'fa', f: -3 }]
    },
    {
      id: 'escalas', titulo: 'Escalas escritas', temas: ['escala'],
      puntos: [
        'Una escala usa las 7 letras una sola vez cada una, empezando por la tónica. La armadura te dice qué letras llevan ♯ o ♭.',
        'Escala mayor: tono, tono, semitono, tono, tono, tono, semitono.',
        'Escala menor natural: tono, semitono, tono, tono, semitono, tono, tono.',
        'Ejemplo, D mayor (armadura F♯ C♯): D E F♯ G A B C♯.',
        'El grado es el lugar de la nota en la escala: 1º es la tónica, 2º la siguiente, y así hasta el 7º.'
      ],
      visuales: [{ tipo: 'armadura', clave: 'sol', f: 2 }],
      ejemplo: { f: 2, modo: 'M', texto: 'D E F♯ G A B C♯' }
    }
  ];
  const dePorTema = tema => LECCIONES.find(l => l.temas.includes(tema)) || null;
  raiz.Lecciones = { LECCIONES, dePorTema };
})(typeof window !== 'undefined' ? window : globalThis);
