// Tablero de seguimiento de cartera (datos dummy). Consume data/tablero.json
// (generado por model/generar_datos.py) y renderiza KPIs + gráficas Chart.js.

var charts = {};

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

fetch('data/tablero.json')
  .then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  })
  .then(function (datos) {
    document.getElementById('cargando').classList.add('d-none-js');
    renderTablero(datos);
  })
  .catch(function (err) {
    document.getElementById('cargando').textContent = 'Error al cargar los datos (' + err.message + ').';
  });

function renderTablero(D) {
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
  renderKpis('kpi-cartera', [
    { label: 'Total títulos', value: fmtNum(k.total_titulos), sub: 'registros en la base' },
    { label: 'Cartera total', value: fmtMillones(k.valor_total_cartera), sub: 'valor bruto de cobro' },
    { label: 'Valor pagado', value: fmtMillones(k.valor_pagado), sub: pctStr(k.valor_pagado, k.valor_total_cartera) + ' de recaudo', cls: 'good' },
    { label: 'Valor pendiente', value: fmtMillones(k.valor_pendiente), sub: 'por recaudar' },
    { label: 'Con mandamiento de pago', value: fmtNum(k.titulos_con_mp), sub: fmtMillones(k.valor_mandamiento) },
    { label: 'Con embargo', value: fmtNum(k.titulos_con_embargo), sub: 'medida cautelar activa' },
    { label: 'Con convenio de pago', value: fmtNum(k.titulos_con_convenio), sub: 'prescripción suspendida', cls: 'good' },
  ]);
}

function renderKpisPrescripcion(D) {
  var k = D.kpis;
  renderKpis('kpi-prescripcion', [
    { label: 'Prescritos', value: fmtNum(k.titulos_prescritos), sub: 'superaron los 5 años', cls: 'critical' },
    { label: 'Riesgo crítico', value: fmtNum(k.titulos_riesgo_critico), sub: 'prescriben en < 6 meses', cls: 'critical' },
    { label: 'Riesgo alto', value: fmtNum(k.titulos_riesgo_alto), sub: 'prescriben en 6-12 meses', cls: 'warning' },
    { label: 'Sin fecha de interrupción', value: fmtNum(k.titulos_sin_fecha_interrupcion), sub: 'no se puede calcular', cls: 'warning' },
    { label: 'Sin fecha de ejecutoria', value: fmtNum(k.sin_ejecutoria), sub: 'impide el cálculo legal', cls: 'critical' },
  ]);
}

function renderKpisInconsistencias(D) {
  var k = D.kpis;
  renderKpis('kpi-inconsistencias', [
    { label: 'MP sin ninguna notificación', value: fmtNum(k.mp_sin_notificacion), sub: pctStr(k.mp_sin_notificacion, k.titulos_con_mp) + ' de los MP', cls: 'critical' },
    { label: 'Inc. notificación personal', value: fmtNum(k.inc_notificacion_personal), sub: 'marcados sin fecha de gestión', cls: 'warning' },
    { label: 'Inc. noticorreo', value: fmtNum(k.inc_notificacion_correo), sub: 'marcados sin fecha de gestión', cls: 'warning' },
    { label: 'Con resolución de cobro (ROC)', value: fmtNum(k.titulos_con_roc), sub: pctStr(k.titulos_con_roc, k.total_titulos) + ' del total' },
    { label: 'Con SAE', value: fmtNum(k.titulos_con_sae), sub: pctStr(k.titulos_con_sae, k.total_titulos) + ' del total' },
  ]);
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
      labels: porEstado.map(function (r) { return r.estado; }),
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
        legend: { position: 'right', labels: { color: p.tick, usePointStyle: true } },
        tooltip: {
          callbacks: {
            label: function (item) {
              return item.label + ': ' + fmtNum(item.parsed) + ' títulos';
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
      labels: riesgo.map(function (r) { return r.categoria; }),
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
              return fmtNum(d.cantidad) + ' títulos — ' + d.descripcion;
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
      labels: filas.map(function (r) { return r[campoNombre]; }),
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
            label: function (item) { return fmtNum(item.parsed.x) + ' títulos'; },
          },
        },
      },
      scales: {
        x: ejeY(p, function (v) { return fmtNum(v); }),
        y: { grid: { display: false }, ticks: { color: p.tick, font: { size: 11 } } },
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
        tooltip: { callbacks: { label: function (item) { return fmtNum(item.parsed.y) + ' títulos'; } } },
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
      labels: indicadores.map(function (r) { return r.indicador; }),
      datasets: [
        { label: 'Con indicador', data: indicadores.map(function (r) { return r.con_indicador; }), backgroundColor: p.blue, maxBarThickness: 28 },
        { label: 'Sin indicador', data: indicadores.map(function (r) { return r.sin_indicador; }), backgroundColor: p.muted, maxBarThickness: 28 },
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
