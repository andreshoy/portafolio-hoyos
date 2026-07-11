// Gráficos ilustrativos con datos ficticios para la propuesta de Azzurry.
// No representan datos reales de la empresa — solo muestran el tipo de
// respuesta que este trabajo podría entregar.

function paletaActual() {
  var oscuro = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return oscuro
    ? {
        blue: '#3987e5', aqua: '#199e70', yellow: '#c98500', green: '#008300',
        violet: '#9085e9', red: '#e66767', magenta: '#d55181', orange: '#d95926',
        muted: '#383835', grid: '#2c2c2a', tick: '#c3c2b7',
      }
    : {
        blue: '#2a78d6', aqua: '#1baf7a', yellow: '#eda100', green: '#008300',
        violet: '#4a3aa7', red: '#e34948', magenta: '#e87ba4', orange: '#eb6834',
        muted: '#c3c2b7', grid: '#e1e0d9', tick: '#52514e',
      };
}

function ejeY(p, callback) {
  return { grid: { color: p.grid }, ticks: { color: p.tick, callback: callback } };
}
function ejeX(p) {
  return { grid: { display: false }, ticks: { color: p.tick } };
}
function fmtMiles(n) {
  return n.toLocaleString('es-CO');
}

document.addEventListener('DOMContentLoaded', function () {
  var p = paletaActual();

  // 1. ¿El envío gratis aumenta el tamaño de la compra?
  var rangos = ['$150k-250k', '$250k-350k', '$350k-450k', '$450k-550k', '$550k-650k'];
  var pedidos = [420, 380, 610, 340, 260];
  new Chart(document.getElementById('chart-envio-gratis').getContext('2d'), {
    type: 'bar',
    data: {
      labels: rangos,
      datasets: [{
        data: pedidos,
        backgroundColor: rangos.map(function (_, i) { return i === 2 ? p.blue : p.muted; }),
        borderRadius: { topLeft: 4, topRight: 4 },
        borderSkipped: 'bottom',
        maxBarThickness: 48,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (item) { return fmtMiles(item.parsed.y) + ' pedidos'; },
          },
        },
      },
      scales: { x: ejeX(p), y: ejeY(p, function (v) { return fmtMiles(v); }) },
    },
  });

  // 2. ¿Quiénes son los clientes más valiosos?
  var segmentos = ['Clientes frecuentes', 'Clientes ocasionales', 'Compraron una vez', 'Nuevos'];
  new Chart(document.getElementById('chart-clientes-valiosos').getContext('2d'), {
    type: 'bar',
    data: {
      labels: segmentos,
      datasets: [
        { label: '% de los clientes', data: [15, 35, 30, 20], backgroundColor: p.muted, borderRadius: 4, maxBarThickness: 28 },
        { label: '% de las ventas', data: [45, 30, 15, 10], backgroundColor: p.blue, borderRadius: 4, maxBarThickness: 28 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: p.tick, usePointStyle: true } },
        tooltip: { callbacks: { label: function (item) { return item.dataset.label + ': ' + item.parsed.y + '%'; } } },
      },
      scales: { x: ejeX(p), y: ejeY(p, function (v) { return v + '%'; }) },
    },
  });

  // 3. ¿En qué momento se pierden las ventas?
  var etapas = ['Visitan el sitio', 'Agregan al carrito', 'Inician el pago', 'Compra completada'];
  var visitantes = [10000, 3200, 1800, 1400];
  new Chart(document.getElementById('chart-embudo').getContext('2d'), {
    type: 'bar',
    data: {
      labels: etapas,
      datasets: [{
        data: visitantes,
        backgroundColor: [p.blue, p.aqua, p.yellow, p.green],
        borderRadius: { topRight: 4, bottomRight: 4 },
        borderSkipped: 'left',
        maxBarThickness: 28,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: function (item) { return fmtMiles(item.parsed.x) + ' personas'; } } },
      },
      scales: {
        x: ejeY(p, function (v) { return fmtMiles(v); }),
        y: { grid: { display: false }, ticks: { color: p.tick } },
      },
    },
  });

  // 4. ¿Cuánto se va a vender el próximo trimestre?
  var meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  var historico = [210, 195, 230, 205, 215, 240, 220, 260, 250, null, null, null];
  var pronostico = [null, null, null, null, null, null, null, null, 250, 300, 340, 420];
  var bandaAlta = [null, null, null, null, null, null, null, null, null, 330, 380, 470];
  var bandaBaja = [null, null, null, null, null, null, null, null, null, 270, 300, 370];
  new Chart(document.getElementById('chart-pronostico').getContext('2d'), {
    type: 'line',
    data: {
      labels: meses,
      datasets: [
        {
          label: 'Ventas (millones $)', data: historico, borderColor: p.blue, backgroundColor: p.blue,
          borderWidth: 2, pointRadius: 3, tension: 0.3, spanGaps: false,
        },
        {
          label: 'Proyección', data: pronostico, borderColor: p.blue, backgroundColor: p.blue,
          borderWidth: 2, borderDash: [6, 5], pointRadius: 3, tension: 0.3, spanGaps: true,
        },
        {
          label: 'Rango esperado (alto)', data: bandaAlta, borderColor: 'transparent',
          backgroundColor: p.blue + '26', pointRadius: 0, fill: '+1', tension: 0.3,
        },
        {
          label: 'Rango esperado (bajo)', data: bandaBaja, borderColor: 'transparent',
          backgroundColor: p.blue + '26', pointRadius: 0, fill: false, tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom', labels: { color: p.tick, usePointStyle: true,
            filter: function (item) { return item.text.indexOf('Rango esperado') === -1; } },
        },
        tooltip: {
          callbacks: {
            label: function (item) {
              return item.dataset.label.indexOf('Rango') !== -1 || item.parsed.y == null
                ? null
                : item.dataset.label + ': $' + item.parsed.y + ' M';
            },
          },
        },
      },
      scales: { x: ejeX(p), y: ejeY(p, function (v) { return '$' + v + 'M'; }) },
    },
  });
});
