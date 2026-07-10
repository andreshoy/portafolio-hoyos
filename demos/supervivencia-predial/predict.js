// Motor de inferencia del modelo XGBoost real (survival:aft, 500 árboles)
// reimplementado en JS puro. La lógica de recorrido fue validada 1:1 contra
// xgboost.Booster.predict() en model/preparar_modelo.py antes de portarla aquí:
//   - split numérico: valor < split_condition -> izquierda
//   - split categórico (solo "estrato"): valor DENTRO del conjunto -> derecha;
//     fuera del conjunto (o valor faltante) -> izquierda
//   - base_score se guarda en espacio "tiempo crudo": hay que aplicar ln()
//     antes de sumarlo con las hojas para obtener el margen (log-tiempo)
//   - S(t) = 1 - Phi((ln(t) - mu) / scale), con Phi = CDF normal estándar

let MODELO = null;

function langActual() {
  return (window.portafolioI18n && window.portafolioI18n.getLang()) || 'es';
}

var STR = {
  es: {
    error: (msg) => 'Error al cargar el modelo (' + msg + ').',
    anios: ' años',
    riesgoPrefijo: 'Riesgo ',
    badge: { critico: 'Crítico', alto: 'Alto', medio: 'Medio', bajo: 'Bajo' },
    chartLabel: 'Probabilidad de seguir en mora',
    tooltipTitleSuffix: ' años',
    tooltipLabelSuffix: '% de probabilidad de seguir en mora',
    ejeXTitulo: 'Años desde hoy',
    ejeYTitulo: '% que sigue en mora',
  },
  en: {
    error: (msg) => 'Error loading the model (' + msg + ').',
    anios: ' years',
    riesgoPrefijo: 'Risk: ',
    badge: { critico: 'Critical', alto: 'High', medio: 'Medium', bajo: 'Low' },
    chartLabel: 'Probability of still being delinquent',
    tooltipTitleSuffix: ' years',
    tooltipLabelSuffix: '% probability of still being delinquent',
    ejeXTitulo: 'Years from today',
    ejeYTitulo: '% still delinquent',
  },
};

function erf(x) {
  // Aproximación de Abramowitz-Stegun (máx. error ~1.5e-7)
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741,
        a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

function recorrerArbol(t, x) {
  let node = 0;
  while (t.left[node] !== -1) {
    const fname = MODELO.feature_names[t.feat[node]];
    const val = x[fname];
    let vaIzq;
    if (val === null || val === undefined || Number.isNaN(val)) {
      vaIzq = !!t.defL[node];
    } else if (t.type[node] === 1) {
      const idx = t.cat_nodes.indexOf(node);
      let conjunto = [];
      if (idx !== -1) {
        const seg = t.cat_seg[idx], size = t.cat_size[idx];
        conjunto = t.cats.slice(seg, seg + size);
      }
      vaIzq = !conjunto.includes(val);
    } else {
      vaIzq = val < t.cond[node];
    }
    node = vaIzq ? t.left[node] : t.right[node];
  }
  return t.cond[node]; // en una hoja, cond === valor de la hoja
}

function predecirMu(x) {
  let total = Math.log(MODELO.base_score);
  for (const t of MODELO.trees) {
    total += recorrerArbol(t, x);
  }
  return total;
}

function supervivencia(mu, tAnios) {
  if (tAnios <= 0) return 1;
  const z = (Math.log(tAnios) - mu) / MODELO.aft_scale;
  return 1 - normalCdf(z);
}

async function cargarModelo() {
  const res = await fetch('data/modelo.json');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

// comuna ya no se pide en el formulario (es específica de Medellín, no
// generaliza a otras ciudades); se deja como valor faltante para que el
// árbol use su dirección por defecto (soporte nativo de XGBoost para
// missing values), en vez de inventar un valor.
// pago_inicial y pct_pagado tampoco se piden: se fijan en 0 (sin pago
// inicial ni abono parcial) en lugar de dejarse como faltantes.
function leerFormulario() {
  const form = document.getElementById('form-simulador');
  const fd = new FormData(form);
  return {
    vigencia: Number(fd.get('vigencia')),
    uso: Number(fd.get('uso')),
    estrato: Number(fd.get('estrato')),
    avaluo: Number(fd.get('avaluo')),
    monto: Number(fd.get('monto')),
    pago_inicial: 0,
    pct_pagado: 0,
    vigencias_adeudadas: Number(fd.get('vigencias_adeudadas')),
  };
}

// El formulario pide valores crudos (COP, % 0-100); el modelo se entrenó con
// avaluo/monto/pago_inicial transformados y pct_pagado como fracción 0-1
// (confirmado con el autor del modelo, no viene en el JSON exportado).
function aplicarTransformaciones(xCrudo) {
  const x = { ...xCrudo };
  for (const [fname, tipo] of Object.entries(MODELO.transformaciones || {})) {
    if (x[fname] === undefined || x[fname] === null) continue;
    const v = x[fname];
    if (tipo === 'ln') x[fname] = Math.log(Math.max(v, 1e-6));
    else if (tipo === 'ln1p') x[fname] = Math.log(Math.max(v, 0) + 1);
    else if (tipo === 'fraccion') x[fname] = v / 100;
  }
  return x;
}

function paletaActual() {
  const oscuro = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return oscuro
    ? { blue: '#3987e5', grid: '#2c2c2a', tick: '#c3c2b7', good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#e66767' }
    : { blue: '#2a78d6', grid: '#e1e0d9', tick: '#52514e', good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' };
}

let chartCurva = null;

// Umbrales calibrados sobre la probabilidad de seguir en mora A 10 AÑOS
// (a 1-2 años casi todo el portafolio da >90%: el modelo predice tiempos de
// pago largos, así que la señal útil para clasificar riesgo está más adelante
// en la curva — ver distribución de percentiles en model/preparar_modelo.py).
function badgeRiesgo(probA10Anios) {
  const b = STR[langActual()].badge;
  if (probA10Anios >= 0.80) return { texto: b.critico, clase: 'critical' };
  if (probA10Anios >= 0.55) return { texto: b.alto, clase: 'serious' };
  if (probA10Anios >= 0.30) return { texto: b.medio, clase: 'warning' };
  return { texto: b.bajo, clase: 'good' };
}

function renderResultado(xCrudo) {
  const x = aplicarTransformaciones(xCrudo);
  const mu = predecirMu(x);
  const medianaAnios = Math.exp(mu);

  const horizontes = [2, 10, 20];
  const probs = horizontes.map((h) => supervivencia(mu, h));

  document.getElementById('kpi-mediana').textContent = medianaAnios.toFixed(1) + STR[langActual()].anios;
  document.getElementById('kpi-prob-2a').textContent = (probs[0] * 100).toFixed(0) + '%';
  document.getElementById('kpi-prob-10a').textContent = (probs[1] * 100).toFixed(0) + '%';
  document.getElementById('kpi-prob-20a').textContent = (probs[2] * 100).toFixed(0) + '%';

  const badge = badgeRiesgo(probs[1]);
  const badgeEl = document.getElementById('badge-riesgo');
  badgeEl.textContent = STR[langActual()].riesgoPrefijo + badge.texto;
  badgeEl.className = 'badge ' + badge.clase;

  const p = paletaActual();
  const maxAnios = Math.min(80, Math.max(25, medianaAnios * 2.5));
  const pasos = 100;
  const labels = [];
  const datos = [];
  for (let i = 0; i <= pasos; i++) {
    const t = (maxAnios * i) / pasos;
    labels.push(t.toFixed(1));
    datos.push(supervivencia(mu, t) * 100);
  }

  if (chartCurva) chartCurva.destroy();
  const ctx = document.getElementById('chart-supervivencia').getContext('2d');
  chartCurva = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: STR[langActual()].chartLabel,
        data: datos,
        borderColor: p.blue,
        backgroundColor: p.blue,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.15,
        fill: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => items[0].label + STR[langActual()].tooltipTitleSuffix,
            label: (item) => item.parsed.y.toFixed(1) + STR[langActual()].tooltipLabelSuffix,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: p.tick, maxTicksLimit: 10, callback: (v, i) => labels[i] },
          title: { display: true, text: STR[langActual()].ejeXTitulo, color: p.tick },
        },
        y: {
          min: 0, max: 100,
          grid: { color: p.grid },
          ticks: { color: p.tick, callback: (v) => v + '%' },
          title: { display: true, text: STR[langActual()].ejeYTitulo, color: p.tick },
        },
      },
    },
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const cargando = document.getElementById('cargando-modelo');
  const i18nReady = (window.portafolioI18n && window.portafolioI18n.ready) || Promise.resolve();
  await i18nReady;
  try {
    MODELO = await cargarModelo();
    cargando.classList.add('d-none-js');
    document.getElementById('form-simulador').classList.remove('d-none-js');
    renderResultado(leerFormulario());
  } catch (err) {
    cargando.textContent = STR[langActual()].error(err.message);
    return;
  }

  document.getElementById('form-simulador').addEventListener('submit', (ev) => {
    ev.preventDefault();
    renderResultado(leerFormulario());
  });

  document.addEventListener('i18n:applied', () => {
    if (MODELO) renderResultado(leerFormulario());
  });
});
