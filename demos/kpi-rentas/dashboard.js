// Tablero de seguimiento de cartera (datos dummy). Consume data/tablero.json
// (generado por model/generar_datos.py) y renderiza KPIs + gráficas Chart.js.

var charts = {};
var datosTablero = null; // cache de la última respuesta, para re-renderizar al cambiar de idioma

function langActual() {
  return (window.portafolioI18n && window.portafolioI18n.getLang()) || 'es';
}

// Textos de UI generados por JS (KPIs, secciones, gráficas, mensajes).
var STR = {
  es: {
    error: function (msg) { return 'Error al cargar los datos (' + msg + ').'; },
    kpiCartera: [
      { label: 'Total títulos', sub: 'registros en la base' },
      { label: 'Cartera total', sub: 'valor bruto de cobro' },
      { label: 'Valor pagado', subFn: function (pct) { return pct + ' de recaudo'; } },
      { label: 'Valor pendiente', sub: 'por recaudar' },
      { label: 'Con mandamiento de pago' },
      { label: 'Con embargo', sub: 'medida cautelar activa' },
      { label: 'Con convenio de pago', sub: 'prescripción suspendida' },
    ],
    kpiPrescripcion: [
      { label: 'Prescritos', sub: 'superaron los 5 años' },
      { label: 'Riesgo crítico', sub: 'prescriben en < 6 meses' },
      { label: 'Riesgo alto', sub: 'prescriben en 6-12 meses' },
      { label: 'Sin fecha de interrupción', sub: 'no se puede calcular' },
      { label: 'Sin fecha de ejecutoria', sub: 'impide el cálculo legal' },
    ],
    kpiInconsistencias: [
      { label: 'MP sin ninguna notificación', subFn: function (pct) { return pct + ' de los MP'; } },
      { label: 'Inc. notificación personal', sub: 'marcados sin fecha de gestión' },
      { label: 'Inc. noticorreo', sub: 'marcados sin fecha de gestión' },
      { label: 'Con resolución de cobro (ROC)', subFn: function (pct) { return pct + ' del total'; } },
      { label: 'Con SAE', subFn: function (pct) { return pct + ' del total'; } },
    ],
    tooltipTitulos: ' títulos',
    tooltipConIndicador: 'Con indicador',
    tooltipSinIndicador: 'Sin indicador',
  },
  en: {
    error: function (msg) { return 'Error loading data (' + msg + ').'; },
    kpiCartera: [
      { label: 'Total records', sub: 'records in the database' },
      { label: 'Total receivables', sub: 'gross amount owed' },
      { label: 'Amount collected', subFn: function (pct) { return pct + ' collected'; } },
      { label: 'Amount outstanding', sub: 'still to collect' },
      { label: 'With payment order' },
      { label: 'With garnishment', sub: 'active precautionary measure' },
      { label: 'With payment plan', sub: 'statute of limitations suspended' },
    ],
    kpiPrescripcion: [
      { label: 'Time-barred', sub: 'past the 5-year limit' },
      { label: 'Critical risk', sub: 'time-barred in < 6 months' },
      { label: 'High risk', sub: 'time-barred in 6-12 months' },
      { label: 'No interruption date', sub: 'cannot be calculated' },
      { label: 'No enforceability date', sub: 'blocks the legal calculation' },
    ],
    kpiInconsistencias: [
      { label: 'Payment orders with no notification', subFn: function (pct) { return pct + ' of payment orders'; } },
      { label: 'Inc. personal notification', sub: 'flagged with no action date' },
      { label: 'Inc. mail notification', sub: 'flagged with no action date' },
      { label: 'With collection resolution (ROC)', subFn: function (pct) { return pct + ' of total'; } },
      { label: 'With SAE', subFn: function (pct) { return pct + ' of total'; } },
    ],
    tooltipTitulos: ' records',
    tooltipConIndicador: 'With indicator',
    tooltipSinIndicador: 'Without indicator',
  },
};

// Los nombres de estado/categoría/dependencia/concepto vienen del dataset dummy
// (data/tablero.json) en español. Este mapa los traduce solo para mostrarlos en
// las gráficas cuando el idioma activo es inglés; la lógica de agregación sigue
// usando el valor original del dato.
var ETIQUETAS_EN = {
  // porEstado
  'EXIGIBLE': 'DUE',
  'EN COBRO': 'IN COLLECTION',
  'TERMINADO': 'CLOSED',
  'EXIGIBLE-NUEVOS': 'DUE - NEW',
  'ARCHIVADO': 'ARCHIVED',
  'SUSPENDIDO': 'SUSPENDED',
  // riesgoPrescripcion (categoria + descripcion)
  'Prescritos': 'Time-barred',
  'Riesgo crítico (<6 meses)': 'Critical risk (<6 months)',
  'Riesgo alto (6-12 meses)': 'High risk (6-12 months)',
  'Sin fecha de interrupción': 'No interruption date',
  'Con pago o convenio': 'Paid or on a payment plan',
  'Superaron los 5 años': 'Past the 5-year limit',
  'Prescriben antes de 6 meses': 'Time-barred in under 6 months',
  'Prescriben entre 6 y 12 meses': 'Time-barred in 6 to 12 months',
  'No se puede calcular la prescripción': 'Statute of limitations cannot be calculated',
  'Prescripción suspendida o extinguida': 'Statute of limitations suspended or extinguished',
  // indicadores
  'Mandamiento de Pago': 'Payment Order',
  'Citación': 'Summons',
  'Resolución de Cobro (ROC)': 'Collection Resolution (ROC)',
  'SAE': 'SAE',
  'Embargo': 'Garnishment',
  // porDependencia
  'Dirección de Espacio Público': 'Public Space Office',
  'Dirección de Impuestos': 'Tax Office',
  'Secretaría de Planeación': 'Planning Department',
  'Dirección de Ejecuciones Fiscales': 'Fiscal Enforcement Office',
  'Dirección de Rentas': 'Revenue Office',
  'Secretaría de Hacienda': 'Finance Department',
  'Secretaría de Movilidad': 'Mobility Department',
  'Secretaría de Infraestructura': 'Infrastructure Department',
  'Secretaría de Gobierno': 'Government Department',
  'Secretaría de Salud': 'Health Department',
  // porConcepto
  'Impuesto de Avisos y Tableros': 'Signage Tax',
  'Otros conceptos': 'Other items',
  'Impuesto de Delineación Urbana': 'Urban Development Tax',
  'Estampillas': 'Stamp Duties',
  'Contribución de Valorización': 'Betterment Levy',
  'Sobretasa a la Gasolina': 'Gasoline Surtax',
  'Multas de Tránsito': 'Traffic Fines',
  'Impuesto de Industria y Comercio': 'Industry & Commerce Tax',
  'Impuesto Predial Unificado': 'Unified Property Tax',
};

function traducir(valor) {
  if (langActual() !== 'en') return valor;
  return ETIQUETAS_EN[valor] || valor;
}

function paletaActual() {
  var oscuro = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return oscuro
    ? {
        blue: '#3987e5', aqua: '#199e70', yellow: '#c98500', green: '#008300',
        violet: '#9085e9', red: '#e66767', magenta: '#d55181', orange: '#d95926',
        muted: '#383835', grid: '#2c2c2a', tick: '#c3c2b7',
        good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#e66767',
      }
    : {
        blue: '#2a78d6', aqua: '#1baf7a', yellow: '#eda100', green: '#008300',
        violet: '#4a3aa7', red: '#e34948', magenta: '#e87ba4', orange: '#eb6834',
        muted: '#c3c2b7', grid: '#e1e0d9', tick: '#52514e',
        good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b',
      };
}

function fmtNum(n) {
  return Math.round(Number(n)).toLocaleString('es-CO');
}

function fmtMillones(n) {
  var m = Number(n) / 1e6;
  return '$ ' + m.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' M';
}

function pctStr(a, total) {
  return total > 0 ? (a / total * 100).toFixed(1) + '%' : '0%';
}

var i18nReady = (window.portafolioI18n && window.portafolioI18n.ready) || Promise.resolve();

i18nReady.then(function () {
  return fetch('data/tablero.json')
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (datos) {
      datosTablero = datos;
      document.getElementById('cargando').classList.add('d-none-js');
      renderTablero(datos);
    })
    .catch(function (err) {
      document.getElementById('cargando').textContent = STR[langActual()].error(err.message);
    });
});

document.addEventListener('i18n:applied', function () {
  if (datosTablero) renderTablero(datosTablero);
});

var mobileAlUltimoRender = null;
var resizeTimer = null;
window.addEventListener('resize', function () {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(function () {
    if (datosTablero && esMobile() !== mobileAlUltimoRender) renderTablero(datosTablero);
  }, 200);
});

function renderTablero(D) {
  mobileAlUltimoRender = esMobile();
  document.getElementById('fecha-actualizacion').textContent = D.actualizacion;
  document.getElementById('total-titulos-sub').textContent = fmtNum(D.total_registros);

  renderKpisCartera(D);
  renderKpisPrescripcion(D);
  renderKpisInconsistencias(D);

  renderChartEstado(D.porEstado);
  renderChartRiesgo(D.riesgoPrescripcion);
  renderChartHorizontal('chart-dependencia', D.porDependencia, 'dependencia', paletaActual().blue);
  renderChartHorizontal('chart-concepto', D.porConcepto, 'concepto', paletaActual().violet);
  renderChartAnnoCantidad(D.porAnno);
  renderChartAnnoValor(D.porAnno);
  renderChartIndicadores(D.indicadores);
}

function renderKpis(contenedorId, defs) {
  var cont = document.getElementById(contenedorId);
  cont.innerHTML = '';
  defs.forEach(function (k) {
    var tile = document.createElement('div');
    tile.className = 'kpi-tile';
    tile.innerHTML =
      '<div class="kpi-label">' + k.label + '</div>' +
      '<div class="kpi-value">' + k.value + '</div>' +
      '<div class="kpi-delta ' + (k.cls || '') + '">' + (k.sub || '') + '</div>';
    cont.appendChild(tile);
  });
}

function renderKpisCartera(D) {
  var k = D.kpis;
  var s = STR[langActual()].kpiCartera;
  renderKpis('kpi-cartera', [
    { label: s[0].label, value: fmtNum(k.total_titulos), sub: s[0].sub },
    { label: s[1].label, value: fmtMillones(k.valor_total_cartera), sub: s[1].sub },
    { label: s[2].label, value: fmtMillones(k.valor_pagado), sub: s[2].subFn(pctStr(k.valor_pagado, k.valor_total_cartera)), cls: 'good' },
    { label: s[3].label, value: fmtMillones(k.valor_pendiente), sub: s[3].sub },
    { label: s[4].label, value: fmtNum(k.titulos_con_mp), sub: fmtMillones(k.valor_mandamiento) },
    { label: s[5].label, value: fmtNum(k.titulos_con_embargo), sub: s[5].sub },
    { label: s[6].label, value: fmtNum(k.titulos_con_convenio), sub: s[6].sub, cls: 'good' },
  ]);
}

function renderKpisPrescripcion(D) {
  var k = D.kpis;
  var s = STR[langActual()].kpiPrescripcion;
  renderKpis('kpi-prescripcion', [
    { label: s[0].label, value: fmtNum(k.titulos_prescritos), sub: s[0].sub, cls: 'critical' },
    { label: s[1].label, value: fmtNum(k.titulos_riesgo_critico), sub: s[1].sub, cls: 'critical' },
    { label: s[2].label, value: fmtNum(k.titulos_riesgo_alto), sub: s[2].sub, cls: 'warning' },
    { label: s[3].label, value: fmtNum(k.titulos_sin_fecha_interrupcion), sub: s[3].sub, cls: 'warning' },
    { label: s[4].label, value: fmtNum(k.sin_ejecutoria), sub: s[4].sub, cls: 'critical' },
  ]);
}

function renderKpisInconsistencias(D) {
  var k = D.kpis;
  var s = STR[langActual()].kpiInconsistencias;
  renderKpis('kpi-inconsistencias', [
    { label: s[0].label, value: fmtNum(k.mp_sin_notificacion), sub: s[0].subFn(pctStr(k.mp_sin_notificacion, k.titulos_con_mp)), cls: 'critical' },
    { label: s[1].label, value: fmtNum(k.inc_notificacion_personal), sub: s[1].sub, cls: 'warning' },
    { label: s[2].label, value: fmtNum(k.inc_notificacion_correo), sub: s[2].sub, cls: 'warning' },
    { label: s[3].label, value: fmtNum(k.titulos_con_roc), sub: s[3].subFn(pctStr(k.titulos_con_roc, k.total_titulos)) },
    { label: s[4].label, value: fmtNum(k.titulos_con_sae), sub: s[4].subFn(pctStr(k.titulos_con_sae, k.total_titulos)) },
  ]);
}

function esMobile() {
  return window.innerWidth < 640;
}

function destruir(clave) {
  if (charts[clave]) { charts[clave].destroy(); charts[clave] = null; }
}

function ejeY(p, callback) {
  return { grid: { color: p.grid }, ticks: { color: p.tick, callback: callback } };
}
function ejeX(p) {
  return { grid: { display: false }, ticks: { color: p.tick } };
}

function renderChartEstado(porEstado) {
  destruir('estado');
  var p = paletaActual();
  var colores = [p.blue, p.aqua, p.yellow, p.violet, p.orange, p.magenta, p.green, p.red];
  var ctx = document.getElementById('chart-estado').getContext('2d');
  charts.estado = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: porEstado.map(function (r) { return traducir(r.estado); }),
      datasets: [{
        data: porEstado.map(function (r) { return r.cantidad; }),
        backgroundColor: porEstado.map(function (_, i) { return colores[i % colores.length]; }),
        borderColor: 'transparent',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: esMobile() ? 'bottom' : 'right', labels: { color: p.tick, usePointStyle: true } },
        tooltip: {
          callbacks: {
            label: function (item) {
              return item.label + ': ' + fmtNum(item.parsed) + STR[langActual()].tooltipTitulos;
            },
          },
        },
      },
    },
  });
}

function renderChartRiesgo(riesgo) {
  destruir('riesgo');
  var p = paletaActual();
  var colorPorCategoria = {
    'Prescritos': p.critical,
    'Riesgo crítico (<6 meses)': p.critical,
    'Riesgo alto (6-12 meses)': p.warning,
    'Sin fecha de interrupción': p.muted,
    'Con pago o convenio': p.good,
  };
  var ctx = document.getElementById('chart-riesgo').getContext('2d');
  charts.riesgo = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: riesgo.map(function (r) { return traducir(r.categoria); }),
      datasets: [{
        data: riesgo.map(function (r) { return r.cantidad; }),
        backgroundColor: riesgo.map(function (r) { return colorPorCategoria[r.categoria] || p.blue; }),
        borderRadius: { topLeft: 4, topRight: 4 },
        borderSkipped: 'bottom',
        maxBarThickness: 56,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (item) {
              var d = riesgo[item.dataIndex];
              return fmtNum(d.cantidad) + STR[langActual()].tooltipTitulos + ' — ' + traducir(d.descripcion);
            },
          },
        },
      },
      scales: { x: ejeX(p), y: ejeY(p, function (v) { return fmtNum(v); }) },
    },
  });
}

function renderChartHorizontal(canvasId, filas, campoNombre, color) {
  var clave = canvasId;
  destruir(clave);
  var p = paletaActual();
  var ctx = document.getElementById(canvasId).getContext('2d');
  charts[clave] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: filas.map(function (r) { return traducir(r[campoNombre]); }),
      datasets: [{
        data: filas.map(function (r) { return r.cantidad; }),
        backgroundColor: color,
        borderRadius: { topRight: 4, bottomRight: 4 },
        borderSkipped: 'left',
        maxBarThickness: 22,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (item) { return fmtNum(item.parsed.x) + STR[langActual()].tooltipTitulos; },
          },
        },
      },
      scales: {
        x: ejeY(p, function (v) { return fmtNum(v); }),
        y: { grid: { display: false }, ticks: { color: p.tick, font: { size: esMobile() ? 10 : 11 } } },
      },
    },
  });
}

function renderChartAnnoCantidad(porAnno) {
  destruir('annoCantidad');
  var p = paletaActual();
  var ctx = document.getElementById('chart-anno-cantidad').getContext('2d');
  charts.annoCantidad = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: porAnno.map(function (r) { return String(r.anno); }),
      datasets: [{
        data: porAnno.map(function (r) { return r.cantidad; }),
        backgroundColor: p.blue,
        borderRadius: { topLeft: 4, topRight: 4 },
        borderSkipped: 'bottom',
        maxBarThickness: 32,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: function (item) { return fmtNum(item.parsed.y) + STR[langActual()].tooltipTitulos; } } },
      },
      scales: { x: ejeX(p), y: ejeY(p, function (v) { return fmtNum(v); }) },
    },
  });
}

function renderChartAnnoValor(porAnno) {
  destruir('annoValor');
  var p = paletaActual();
  var ctx = document.getElementById('chart-anno-valor').getContext('2d');
  charts.annoValor = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: porAnno.map(function (r) { return String(r.anno); }),
      datasets: [{
        data: porAnno.map(function (r) { return r.valor_total; }),
        backgroundColor: p.aqua,
        borderRadius: { topLeft: 4, topRight: 4 },
        borderSkipped: 'bottom',
        maxBarThickness: 32,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: function (item) { return fmtMillones(item.parsed.y); } } },
      },
      scales: { x: ejeX(p), y: ejeY(p, function (v) { return fmtMillones(v); }) },
    },
  });
}

function renderChartIndicadores(indicadores) {
  destruir('indicadores');
  var p = paletaActual();
  var ctx = document.getElementById('chart-indicadores').getContext('2d');
  charts.indicadores = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: indicadores.map(function (r) { return traducir(r.indicador); }),
      datasets: [
        { label: STR[langActual()].tooltipConIndicador, data: indicadores.map(function (r) { return r.con_indicador; }), backgroundColor: p.blue, maxBarThickness: 28 },
        { label: STR[langActual()].tooltipSinIndicador, data: indicadores.map(function (r) { return r.sin_indicador; }), backgroundColor: p.muted, maxBarThickness: 28 },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, grid: { color: p.grid }, ticks: { color: p.tick, callback: function (v) { return fmtNum(v); } } },
        y: { stacked: true, grid: { display: false }, ticks: { color: p.tick } },
      },
      plugins: {
        legend: { position: 'bottom', labels: { color: p.tick, usePointStyle: true } },
        tooltip: { callbacks: { label: function (item) { return item.dataset.label + ': ' + fmtNum(item.parsed.x); } } },
      },
    },
  });
}
