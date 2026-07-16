// Comparativo de precios estandarizados entre marcas/presentaciones de un mismo
// principio activo. Cruce de data/Archivo para prueba contenido.xlsx (catálogo de
// homologados) con data/consolidado.parquet (histórico SISPRO), preprocesado por
// build_data.py en data/catalogo.json + data/series/{no_expediente}.json.

var STR = {
    es: {
        placeholderPrincipio: 'Seleccione un principio activo',
        placeholderMarcas: 'Seleccione marcas/presentaciones primero',
        placeholderMarcasVacio: 'Sin presentaciones con histórico para este principio activo',
        sinHistorico: ' (sin histórico)',
        limiteMarcas: 'Máximo 8 presentaciones por comparación',
        filtroTodos: 'Todos',
        sinDatosSeleccion: 'No se encontraron datos para la selección.',
        errorCatalogo: function (msg) { return 'Error al cargar el catálogo (' + msg + '). Recarga la página.'; },
        errorHistorico: function (msg) { return 'Error al cargar el histórico (' + msg + ').'; }
    },
    en: {
        placeholderPrincipio: 'Select an active ingredient',
        placeholderMarcas: 'Select brands/presentations first',
        placeholderMarcasVacio: 'No presentations with price history for this active ingredient',
        sinHistorico: ' (no history)',
        limiteMarcas: 'Maximum 8 presentations per comparison',
        filtroTodos: 'All',
        sinDatosSeleccion: 'No data found for this selection.',
        errorCatalogo: function (msg) { return 'Error loading the catalog (' + msg + '). Reload the page.'; },
        errorHistorico: function (msg) { return 'Error loading the history (' + msg + ').'; }
    }
};

// Mapeo código -> texto de los 3 filtros, en ambos idiomas (mismos códigos y
// textos que demos/buscador-medicamentos/app.js; la unidad de factura no se
// expone como filtro aquí porque el precio estandarizado solo tiene sentido
// con CodUnidadFactura='A', ya fijado en build_data.py).
var CODIGOS_POR_IDIOMA = {
    es: {
        rol: {
            '1': '1. Elabora o importa el medicamento',
            '2': '2. Actor que no elabora ni importa el medicamento'
        },
        operacion: {
            'CM': 'Operacion de compra',
            'VN': 'Operacion de venta',
            'RC': 'Operacion de recobro'
        },
        transaccion: {
            '1': 'Transaccion primaria institucional',
            '2': 'Transaccion primaria comercial',
            '3': 'Transaccion secundaria institucional',
            '4': 'Transaccion secundaria comercial',
            '5': 'Transaccion final institucional'
        }
    },
    en: {
        rol: {
            '1': '1. Manufactures or imports the medication',
            '2': '2. Actor that neither manufactures nor imports the medication'
        },
        operacion: {
            'CM': 'Purchase operation',
            'VN': 'Sale operation',
            'RC': 'Reimbursement operation'
        },
        transaccion: {
            '1': 'Primary institutional transaction',
            '2': 'Primary commercial transaction',
            '3': 'Secondary institutional transaction',
            '4': 'Secondary commercial transaction',
            '5': 'Final institutional transaction'
        }
    }
};

function langActual() {
    return (window.portafolioI18n && window.portafolioI18n.getLang()) || 'es';
}

function t(key) {
    return STR[langActual()][key];
}

function codigosActuales() {
    return CODIGOS_POR_IDIOMA[langActual()];
}

// Índices posicionales de cada fila en data/series/{no_expediente}.json
var COL = { consecutivo: 0, anio: 1, mes: 2, rol: 3, operacion: 4, transaccion: 5, unidades: 6, valor: 7 };

// Paleta categórica fija (dataviz skill / references/palette.md) — se asigna en
// orden fijo por posición de selección, nunca por valor de los datos.
var PALETA_CATEGORICA = [
    { light: '#2a78d6', dark: '#3987e5' }, // blue
    { light: '#008300', dark: '#008300' }, // green
    { light: '#e87ba4', dark: '#d55181' }, // magenta
    { light: '#eda100', dark: '#c98500' }, // yellow
    { light: '#1baf7a', dark: '#199e70' }, // aqua
    { light: '#eb6834', dark: '#d95926' }, // orange
    { light: '#4a3aa7', dark: '#9085e9' }, // violet
    { light: '#e34948', dark: '#e66767' }  // red
];

function modoOscuro() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function colorSerie(indice) {
    var slot = PALETA_CATEGORICA[indice % PALETA_CATEGORICA.length];
    return modoOscuro() ? slot.dark : slot.light;
}

function paletaChrome() {
    return modoOscuro()
        ? { grid: '#2c2c2a', tick: '#c3c2b7' }
        : { grid: '#e1e0d9', tick: '#52514e' };
}

var catalogo = [];
var porPrincipio = new Map();   // principio_activo -> [entradas de catálogo]
var porClave = new Map();       // "no_expediente|consecutivo" -> entrada de catálogo
var principiosOrdenados = [];
var cacheSeries = new Map();    // no_expediente -> filas crudas del archivo (COL)
var filasPorEntrada = new Map(); // "no_expediente|consecutivo" -> filas crudas de esa presentación (sin filtrar)
var seleccionActual = [];       // entradas de catálogo actualmente elegidas en #marcas
var chart = null;

$(document).ready(function () {
    var i18nReady = (window.portafolioI18n && window.portafolioI18n.ready) || Promise.resolve();
    i18nReady.then(function () {
        fetch('data/catalogo.json')
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (datos) {
                catalogo = datos;
                catalogo.forEach(function (e) {
                    if (!porPrincipio.has(e.principio_activo)) porPrincipio.set(e.principio_activo, []);
                    porPrincipio.get(e.principio_activo).push(e);
                    porClave.set(e.no_expediente + '|' + e.consecutivo, e);
                });
                principiosOrdenados = Array.from(porPrincipio.keys()).sort();

                $('#panel-carga').addClass('d-none');
                $('#panel-selector').removeClass('d-none');
                inicializarSelectores();
            })
            .catch(function (err) {
                $('#panel-carga').text(t('errorCatalogo')(err.message));
            });
    });

    document.addEventListener('i18n:applied', function () {
        if (!principiosOrdenados.length) return;
        reinicializarSelect2Base();
        // Si ya había una selección, poblarMarcas() dispara 'change' en #marcas,
        // que en cascada vuelve a poblar filtros y renderizar todo en el idioma nuevo.
        if ($('#principio-activo').val()) poblarMarcas($('#principio-activo').val());
    });
});

function reinicializarSelect2Base() {
    var $principio = $('#principio-activo');
    if ($principio.hasClass('select2-hidden-accessible')) $principio.select2('destroy');
    $principio.select2({ placeholder: t('placeholderPrincipio'), allowClear: true, width: '100%' });

    var $marcas = $('#marcas');
    if ($marcas.hasClass('select2-hidden-accessible')) $marcas.select2('destroy');
    $marcas.select2({
        placeholder: t('placeholderMarcas'),
        allowClear: true,
        width: '100%',
        closeOnSelect: false,
        maximumSelectionLength: 8
    });

    ['filtro-rol', 'filtro-operacion', 'filtro-transaccion'].forEach(function (id) {
        var $sel = $('#' + id);
        if ($sel.hasClass('select2-hidden-accessible')) $sel.select2('destroy');
        $sel.select2({ placeholder: t('filtroTodos'), allowClear: true, width: '100%', closeOnSelect: false });
    });
}

// Marcas/presentaciones distintas suelen compartir nombre + categoría (ej. las
// presentaciones de 100/500/1000 UI de un mismo Flexpen) — el contenido total
// entre paréntesis es lo único que las distingue, así que va siempre en la
// etiqueta (selector, leyenda de la gráfica y tabla), no solo en el selector.
function descripcionEntrada(e) {
    var partes = [e.nombre, e.categoria_presentacion].filter(Boolean).join(' — ');
    if (e.cantidad_total_presentacion && e.unidad_dosis) {
        partes += ' (' + formatoNumero(e.cantidad_total_presentacion) + ' ' + e.unidad_dosis + ')';
    }
    // Distintas presentaciones de una misma marca pueden compartir categoría y
    // contenido total (ej. rediseños de empaque a través de los años) — el
    // consecutivo del expediente es lo único que garantiza una etiqueta única.
    partes += ' · #' + e.consecutivo;
    return partes;
}

function etiquetaEntrada(e) {
    var partes = descripcionEntrada(e);
    if (!e.tiene_historico) partes += t('sinHistorico');
    return partes;
}

function poblarMarcas(principio) {
    var entradas = (porPrincipio.get(principio) || []).slice().sort(function (a, b) {
        return a.nombre.localeCompare(b.nombre) || a.consecutivo.localeCompare(b.consecutivo);
    });

    var $select = $('#marcas');
    $select.empty();

    if (!entradas.length) {
        $select.append(nuevaOpcion('', t('placeholderMarcasVacio')));
        $select.prop('disabled', true).trigger('change');
        ocultarResultados();
        return;
    }

    entradas.forEach(function (e) {
        var valor = e.no_expediente + '|' + e.consecutivo;
        var opt = nuevaOpcion(valor, etiquetaEntrada(e));
        if (!e.tiene_historico) opt.disabled = true;
        $select.append(opt);
    });
    $select.prop('disabled', false);

    // Preselección por defecto: hasta 5 presentaciones con histórico disponible,
    // priorizando una marca distinta por slot (evita que, en principios con muchas
    // marcas, el default caiga en 5 presentaciones de las mismas 1-2 marcas).
    var conHistorico = entradas.filter(function (e) { return e.tiene_historico; });
    var marcasVistas = new Set();
    var primeraPorMarca = [];
    conHistorico.forEach(function (e) {
        if (!marcasVistas.has(e.nombre)) {
            marcasVistas.add(e.nombre);
            primeraPorMarca.push(e);
        }
    });
    var seleccionados = primeraPorMarca.slice(0, 5);
    if (seleccionados.length < 5) {
        var clavesYaElegidas = new Set(seleccionados.map(function (e) { return e.no_expediente + '|' + e.consecutivo; }));
        for (var i = 0; i < conHistorico.length && seleccionados.length < 5; i++) {
            var clave = conHistorico[i].no_expediente + '|' + conHistorico[i].consecutivo;
            if (!clavesYaElegidas.has(clave)) {
                seleccionados.push(conHistorico[i]);
                clavesYaElegidas.add(clave);
            }
        }
    }
    var preseleccion = seleccionados.map(function (e) { return e.no_expediente + '|' + e.consecutivo; });
    $select.val(preseleccion).trigger('change');
}

function inicializarSelectores() {
    var $principio = $('#principio-activo');
    principiosOrdenados.forEach(function (p) {
        $principio.append(nuevaOpcion(p, p));
    });
    reinicializarSelect2Base();

    $principio.on('change', function () {
        var principio = $(this).val();
        ocultarResultados();
        if (!principio) {
            $('#marcas').empty().prop('disabled', true).trigger('change');
            return;
        }
        poblarMarcas(principio);
    });

    $('#marcas').on('change', function () {
        var valores = $(this).val() || [];
        if (!valores.length) {
            ocultarResultados();
            return;
        }
        cargarSeleccion(valores);
    });

    $('#filtro-rol, #filtro-operacion, #filtro-transaccion').on('change', function () {
        recalcularYRenderizar();
    });
}

function nuevaOpcion(valor, texto) {
    var opt = document.createElement('option');
    opt.value = valor;
    opt.textContent = texto;
    return opt;
}

function ocultarResultados() {
    $('#panel-filtros').addClass('d-none');
    $('#panel-resultados').addClass('d-none');
    $('#panel-mensaje').addClass('d-none');
}

// --- Carga de series (una por expediente, cacheada) -----------------------------

function obtenerSerie(noExpediente) {
    if (cacheSeries.has(noExpediente)) return Promise.resolve(cacheSeries.get(noExpediente));
    return fetch('data/series/' + noExpediente + '.json')
        .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(function (filas) {
            cacheSeries.set(noExpediente, filas);
            return filas;
        });
}

// --- Filtros (Rol / Operación / Transacción) ------------------------------------

function opcionesDisponibles(indice) {
    var vistos = new Set();
    filasPorEntrada.forEach(function (filas) {
        filas.forEach(function (r) { if (r[indice]) vistos.add(r[indice]); });
    });
    return Array.from(vistos).sort();
}

function poblarFiltro(id, indice, mapaTexto) {
    var $sel = $('#' + id);
    if ($sel.hasClass('select2-hidden-accessible')) $sel.select2('destroy');
    $sel.empty();
    opcionesDisponibles(indice).forEach(function (cod) {
        var opt = document.createElement('option');
        opt.value = cod;
        opt.textContent = mapaTexto[cod] || cod;
        $sel.append(opt);
    });
    $sel.select2({ placeholder: t('filtroTodos'), allowClear: true, width: '100%', closeOnSelect: false });
}

function poblarFiltros() {
    var codigos = codigosActuales();
    poblarFiltro('filtro-rol', COL.rol, codigos.rol);
    poblarFiltro('filtro-operacion', COL.operacion, codigos.operacion);
    poblarFiltro('filtro-transaccion', COL.transaccion, codigos.transaccion);
    $('#panel-filtros').removeClass('d-none');
}

function aplicarFiltros(filas) {
    var rol = $('#filtro-rol').val() || [];
    var operacion = $('#filtro-operacion').val() || [];
    var transaccion = $('#filtro-transaccion').val() || [];

    if (!rol.length && !operacion.length && !transaccion.length) return filas;

    return filas.filter(function (r) {
        if (rol.length && rol.indexOf(r[COL.rol]) === -1) return false;
        if (operacion.length && operacion.indexOf(r[COL.operacion]) === -1) return false;
        if (transaccion.length && transaccion.indexOf(r[COL.transaccion]) === -1) return false;
        return true;
    });
}

// --- Cálculo del precio estandarizado por período -------------------------------

function periodoLabel(anio, mes) {
    return anio + '-' + String(mes).padStart(2, '0');
}

// Agrega filas crudas (ya filtradas) por período sumando unidades/valor, y
// solo entonces deriva el precio estandarizado — nunca se promedian precios
// ya divididos.
function serieEstandarizada(entrada, filasFiltradas) {
    var grupos = new Map(); // clave de período -> { anio, mes, unidades, valor }
    filasFiltradas.forEach(function (fila) {
        var anio = fila[COL.anio], mes = fila[COL.mes];
        var clave = anio * 12 + (mes - 1); // mes en base 0 para invertir sin ambigüedad
        if (!grupos.has(clave)) grupos.set(clave, { anio: anio, mes: mes, unidades: 0, valor: 0 });
        var g = grupos.get(clave);
        g.unidades += fila[COL.unidades];
        g.valor += fila[COL.valor];
    });

    var puntos = [];
    grupos.forEach(function (g, clave) {
        if (g.unidades <= 0) return;
        var precioPromedio = g.valor / g.unidades;
        var precioEstandarizado = precioPromedio / entrada.cantidad_total_presentacion;
        puntos.push({ anio: g.anio, mes: g.mes, clave: clave, precio: precioEstandarizado });
    });
    return puntos.sort(function (a, b) { return a.clave - b.clave; });
}

function cargarSeleccion(valores) {
    seleccionActual = valores.map(function (v) { return porClave.get(v); }).filter(Boolean);
    var expedientes = Array.from(new Set(seleccionActual.map(function (e) { return e.no_expediente; })));

    Promise.all(expedientes.map(obtenerSerie))
        .then(function (listasFilas) {
            var filasPorExpediente = {};
            expedientes.forEach(function (exp, i) { filasPorExpediente[exp] = listasFilas[i]; });

            filasPorEntrada.clear();
            seleccionActual.forEach(function (entrada) {
                var clave = entrada.no_expediente + '|' + entrada.consecutivo;
                var filas = (filasPorExpediente[entrada.no_expediente] || [])
                    .filter(function (fila) { return fila[COL.consecutivo] === entrada.consecutivo; });
                filasPorEntrada.set(clave, filas);
            });

            poblarFiltros();
            recalcularYRenderizar();
        })
        .catch(function (err) {
            $('#panel-filtros').addClass('d-none');
            $('#panel-resultados').addClass('d-none');
            $('#panel-mensaje').removeClass('d-none').text(t('errorHistorico')(err.message));
        });
}

function recalcularYRenderizar() {
    var series = seleccionActual.map(function (entrada) {
        var clave = entrada.no_expediente + '|' + entrada.consecutivo;
        var filas = aplicarFiltros(filasPorEntrada.get(clave) || []);
        return { entrada: entrada, puntos: serieEstandarizada(entrada, filas) };
    }).filter(function (s) { return s.puntos.length > 0; });

    if (!series.length) {
        $('#panel-resultados').addClass('d-none');
        $('#panel-mensaje').removeClass('d-none').text(t('sinDatosSeleccion'));
        return;
    }
    $('#panel-mensaje').addClass('d-none');
    $('#panel-resultados').removeClass('d-none');

    renderChart(series);
    renderTabla(series);
}

// --- Gráfica ---------------------------------------------------------------------

function renderChart(series) {
    if (chart) { chart.destroy(); chart = null; }

    var clavesUnicas = new Set();
    series.forEach(function (s) { s.puntos.forEach(function (p) { clavesUnicas.add(p.clave); }); });
    var claves = Array.from(clavesUnicas).sort(function (a, b) { return a - b; });
    var labels = claves.map(function (clave) {
        var anio = Math.floor(clave / 12);
        var mes = clave - anio * 12 + 1;
        return periodoLabel(anio, mes);
    });

    var chrome = paletaChrome();
    var ctx = document.getElementById('chart-comparativo').getContext('2d');

    var datasets = series.map(function (s, i) {
        var porClaveLocal = new Map(s.puntos.map(function (p) { return [p.clave, p.precio]; }));
        var color = colorSerie(i);
        return {
            label: descripcionEntrada(s.entrada) + ' ($/' + s.entrada.unidad_dosis + ')',
            data: claves.map(function (clave) { return porClaveLocal.has(clave) ? porClaveLocal.get(clave) : null; }),
            borderColor: color,
            backgroundColor: color,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            spanGaps: true,
            tension: 0
        };
    });

    chart = new Chart(ctx, {
        type: 'line',
        data: { labels: labels, datasets: datasets },
        options: {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: true, position: 'top', labels: { usePointStyle: true, pointStyle: 'line', color: chrome.tick } },
                tooltip: {
                    callbacks: {
                        label: function (item) {
                            return item.dataset.label + ': ' + formatoPesosDecimal(item.parsed.y);
                        }
                    }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: chrome.tick, maxTicksLimit: 12 } },
                y: { grid: { color: chrome.grid }, ticks: { color: chrome.tick, callback: function (v) { return formatoPesosDecimal(v); } } }
            }
        }
    });
}

// --- Tabla resumen -----------------------------------------------------------------

function renderTabla(series) {
    var $tbody = $('#tabla-comparativo tbody');
    $tbody.empty();

    series.forEach(function (s, i) {
        var puntos = s.puntos;
        var primero = puntos[0], ultimo = puntos[puntos.length - 1];
        var precios = puntos.map(function (p) { return p.precio; });
        var minimo = Math.min.apply(null, precios);
        var maximo = Math.max.apply(null, precios);
        var variacionPct = primero.precio ? (ultimo.precio - primero.precio) / primero.precio * 100 : null;

        var tr = document.createElement('tr');

        var tdMarca = document.createElement('td');
        var swatch = document.createElement('span');
        swatch.className = 'serie-swatch';
        swatch.style.backgroundColor = colorSerie(i);
        tdMarca.appendChild(swatch);
        tdMarca.appendChild(document.createTextNode(descripcionEntrada(s.entrada)));
        tr.appendChild(tdMarca);

        var tdUnidad = document.createElement('td');
        tdUnidad.textContent = '$/' + s.entrada.unidad_dosis;
        tr.appendChild(tdUnidad);

        var tdUltimo = document.createElement('td');
        tdUltimo.textContent = formatoPesosDecimal(ultimo.precio) + ' (' + periodoLabel(ultimo.anio, ultimo.mes) + ')';
        tr.appendChild(tdUltimo);

        var tdMin = document.createElement('td');
        tdMin.textContent = formatoPesosDecimal(minimo);
        tr.appendChild(tdMin);

        var tdMax = document.createElement('td');
        tdMax.textContent = formatoPesosDecimal(maximo);
        tr.appendChild(tdMax);

        var tdVar = document.createElement('td');
        tdVar.textContent = formatoPct(variacionPct);
        tdVar.className = variacionPct === null ? '' : (variacionPct > 0 ? 'up-bad' : 'down-good');
        tr.appendChild(tdVar);

        $tbody.append(tr);
    });
}

// --- Formato ---------------------------------------------------------------------

function formatoPesosDecimal(valor) {
    if (valor === null || valor === undefined || valor === '') return '—';
    var num = Number(valor);
    if (isNaN(num)) return '—';
    return '$ ' + num.toLocaleString('es-CO', { maximumFractionDigits: 2 });
}

function formatoNumero(valor) {
    var num = Number(valor);
    if (isNaN(num)) return '—';
    return num.toLocaleString('es-CO', { maximumFractionDigits: 2 });
}

function formatoPct(valor) {
    if (valor === null || valor === undefined) return '—';
    var num = Number(valor);
    if (isNaN(num)) return '—';
    var signo = num > 0 ? '+' : '';
    return signo + num.toFixed(1) + '%';
}
