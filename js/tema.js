// Pone el tema (claro u oscuro) antes de pintar, para que no parpadee.
(function () {
  try {
    var t = localStorage.getItem('mc-tema');
    if (t === 'claro' || t === 'oscuro') document.documentElement.setAttribute('data-tema', t);
  } catch (e) { /* sin almacenamiento: se usa el del sistema */ }
})();
