// Efectos decorativos de los paneles visuales (hero + tarjetas de servicio):
// contador animado de KPIs y tilt 3D de la tarjeta al pasar el mouse. Cada
// panel decorativo lleva aria-hidden — el texto que lo acompaña ya transmite
// el mensaje principal.
(function () {
  function animateKpis() {
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.querySelectorAll('.viz-kpi-num').forEach(function (numEl) {
      var target = parseFloat(numEl.getAttribute('data-target')) || 0;
      var suffix = numEl.getAttribute('data-suffix') || '';
      if (reduce) { numEl.textContent = target + suffix; return; }
      var start = null;
      var duration = 900;
      function step(ts) {
        if (start === null) start = ts;
        var progress = Math.min((ts - start) / duration, 1);
        var eased = 1 - Math.pow(1 - progress, 3);
        numEl.textContent = Math.round(target * eased) + suffix;
        if (progress < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }

  function initTilt() {
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var hoverCapable = window.matchMedia && window.matchMedia('(hover: hover)').matches;
    if (reduce || !hoverCapable) return;

    var maxDeg = 6;
    document.querySelectorAll('.viz-stage').forEach(function (stage) {
      var card = stage.querySelector('.viz-card');
      if (!card) return;
      stage.addEventListener('pointermove', function (evt) {
        var r = stage.getBoundingClientRect();
        var px = (evt.clientX - r.left) / r.width - 0.5;
        var py = (evt.clientY - r.top) / r.height - 0.5;
        card.style.transform = 'rotateY(' + (px * maxDeg * 2) + 'deg) rotateX(' + (-py * maxDeg * 2) + 'deg)';
      });
      stage.addEventListener('pointerleave', function () {
        card.style.transform = 'rotateY(0deg) rotateX(0deg)';
      });
    });
  }

  var i18nReady = (window.portafolioI18n && window.portafolioI18n.ready) || Promise.resolve();
  i18nReady.then(function () {
    animateKpis();
    initTilt();
  });
})();
