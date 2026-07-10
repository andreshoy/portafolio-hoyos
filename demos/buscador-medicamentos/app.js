// Adaptado del buscador SISPRO original: misma lógica de agregación y
// gráficas, pero el dropdown de medicamento se limita a los 10 incluidos
// en data/diccionario.json (sin búsqueda por texto vía ajax).

// Mapeo código -> texto de los 4 filtros, en ambos idiomas. Fijo y chico, va hardcodeado.
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
        },
        unidad: {
            'A': 'Presentacion comercial',
            'B': 'Unidad por embalaje primario',
            'C': 'Unidad de dispensacion'
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
        },
        unidad: {
            'A': 'Commercial presentation',
            'B': 'Unit per primary packaging',
            'C': 'Dispensing unit'
        }
    }
};

// Textos de UI generados por JS (KPIs, gráficas, mensajes) en ambos idiomas.
var STR = {
    es: {
        placeholderMedicamento: 'Seleccione un medicamento',
        placeholderPresentacion: 'Seleccione una presentación',
        placeholderPresentacionPrimero: 'Seleccione un medicamento primero',
        filtroTodos: 'Todos',
        sinPresentacion: '(sin presentación)',
        fichaCampos: [
            ['principio_activo', 'Principio activo'],
            ['via_administracion', 'Vía de administración'],
            ['fabricante', 'Fabricante nacional'],
            ['registro_sanitario', 'Registro sanitario INVIMA'],
            ['estado_registro', 'Estado del registro'],
            ['estado_cum', 'Estado de la presentación (CUM)'],
            ['forma_farmaceutica', 'Forma farmacéutica'],
            ['muestra_medica', 'Muestra médica'],
            ['modalidad', 'Modalidad'],
            ['cantidad', 'Cantidad (CUM)'],
            ['unidad', 'Unidad (CUM)'],
            ['unidad_medida', 'Unidad de medida'],
            ['concentracion', 'Concentración (código CUM)'],
            ['ium', 'IUM'],
            ['fecha_expedicion', 'Fecha de expedición'],
            ['fecha_vencimiento', 'Fecha de vencimiento'],
            ['fecha_activo', 'Activo desde'],
            ['fecha_inactivo', 'Inactivo desde']
        ],
        chartPrecioMinimo: 'Precio mínimo',
        chartPrecioMaximo: 'Precio máximo',
        chartUnidadesFacturadas: 'Unidades facturadas',
        chartValorTotalFacturado: 'Valor total facturado',
        tooltipUnidadesSuffix: ' unidades',
        sinDatosAnuales: 'Sin datos anuales para la selección.',
        sinDatosSeleccion: 'No se encontraron datos para la selección.',
        errorCatalogo: function (msg) { return 'Error al cargar el catálogo (' + msg + '). Recarga la página.'; },
        errorHistorico: function (msg) { return 'Error al cargar el histórico (' + msg + ').'; }
    },
    en: {
        placeholderMedicamento: 'Select a medication',
        placeholderPresentacion: 'Select a presentation',
        placeholderPresentacionPrimero: 'Select a medication first',
        filtroTodos: 'All',
        sinPresentacion: '(no presentation)',
        fichaCampos: [
            ['principio_activo', 'Active ingredient'],
            ['via_administracion', 'Route of administration'],
            ['fabricante', 'National manufacturer'],
            ['registro_sanitario', 'INVIMA sanitary registration'],
            ['estado_registro', 'Registration status'],
            ['estado_cum', 'Presentation status (CUM)'],
            ['forma_farmaceutica', 'Pharmaceutical form'],
            ['muestra_medica', 'Medical sample'],
            ['modalidad', 'Modality'],
            ['cantidad', 'Quantity (CUM)'],
            ['unidad', 'Unit (CUM)'],
            ['unidad_medida', 'Unit of measure'],
            ['concentracion', 'Concentration (CUM code)'],
            ['ium', 'IUM'],
            ['fecha_expedicion', 'Issue date'],
            ['fecha_vencimiento', 'Expiration date'],
            ['fecha_activo', 'Active since'],
            ['fecha_inactivo', 'Inactive since']
        ],
        chartPrecioMinimo: 'Minimum price',
        chartPrecioMaximo: 'Maximum price',
        chartUnidadesFacturadas: 'Units billed',
        chartValorTotalFacturado: 'Total amount billed',
        tooltipUnidadesSuffix: ' units',
        sinDatosAnuales: 'No annual data for this selection.',
        sinDatosSeleccion: 'No data found for this selection.',
        errorCatalogo: function (msg) { return 'Error loading the catalog (' + msg + '). Reload the page.'; },
        errorHistorico: function (msg) { return 'Error loading the history (' + msg + ').'; }
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

// Índices posicionales de cada fila en data/expedientes/{no_expediente}.json
var COL = { pc: 0, anio: 1, mes: 2, rol: 3, operacion: 4, transaccion: 5, unidad: 6, pmin: 7, pmax: 8, unidades: 9, valor: 10 };

var porNombre = new Map();     // nombre comercial -> [entradas del diccionario]
var porClave = new Map();      // "no_expediente|presentacion_comercial" -> entrada del diccionario
var nombresOrdenados = [];     // los (hasta) 10 nombres de esta demo
var cacheExpedientes = new Map(); // no_expediente -> filas ya parseadas
var cacheFichas = new Map();      // no_expediente -> { presentacion_comercial: {...} }
var filasBase = [];            // filas de la presentación seleccionada (sin filtrar)
var charts = { precios: null, unidades: null, valor: null };

// --- Paleta (dataviz skill / references/palette.md) -----------------------------

function paletaActual() {
    var oscuro = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return oscuro
        ? { blue: '#3987e5', aqua: '#199e70', violet: '#9085e9', orange: '#d95926', grid: '#2c2c2a', tick: '#c3c2b7' }
        : { blue: '#2a78d6', aqua: '#1baf7a', violet: '#4a3aa7', orange: '#eb6834', grid: '#e1e0d9', tick: '#52514e' };
}

// --- Arranque: cargar el diccionario (solo 10 medicamentos) --------------------

$(document).ready(function () {
    var i18nReady = (window.portafolioI18n && window.portafolioI18n.ready) || Promise.resolve();
    i18nReady.then(function () {
        fetch('data/diccionario.json')
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (diccionario) {
                diccionario.forEach(function (e) {
                    if (!porNombre.has(e.nombre)) porNombre.set(e.nombre, []);
                    porNombre.get(e.nombre).push(e);
                    porClave.set(e.exp + '|' + e.pc, e);
                });
                nombresOrdenados = Array.from(porNombre.keys()).sort();

                $('#panel-carga').addClass('d-none');
                $('#panel-buscador').removeClass('d-none');
                inicializarBuscador();
            })
            .catch(function (err) {
                $('#panel-carga').text(t('errorCatalogo')(err.message));
            });
    });

    document.addEventListener('i18n:applied', function () {
        if (!nombresOrdenados.length) return; // catálogo aún no cargó
        reinicializarSelect2Base();
        // Si ya había una presentación seleccionada, poblarPresentacion() dispara
        // 'change' en #presentacion, que en cascada vuelve a renderizar ficha,
        // filtros, KPIs y gráficas en el idioma nuevo (ver handlers más abajo).
        if ($('#medicamento').val()) poblarPresentacion($('#medicamento').val());
    });
});

function reinicializarSelect2Base() {
    var $medicamento = $('#medicamento');
    if ($medicamento.hasClass('select2-hidden-accessible')) $medicamento.select2('destroy');
    $medicamento.select2({ placeholder: t('placeholderMedicamento'), allowClear: true, width: '100%' });

    var $presentacion = $('#presentacion');
    if ($presentacion.hasClass('select2-hidden-accessible')) $presentacion.select2('destroy');
    $presentacion.select2({ placeholder: t('placeholderPresentacion'), allowClear: true });
}

function poblarPresentacion(nombre) {
    var entradas = (porNombre.get(nombre) || []).slice().sort(function (a, b) {
        return (a.presentacion || '').localeCompare(b.presentacion || '');
    });
    var select = $('#presentacion');
    var valorPrevio = select.val();
    select.empty().append(nuevaOpcion('', t('placeholderPresentacion')));
    entradas.forEach(function (e) {
        var valor = e.exp + '|' + e.pc;
        var texto = [e.pc, e.presentacion].filter(Boolean).join(' - ') || t('sinPresentacion');
        select.append(nuevaOpcion(valor, texto));
    });
    select.prop('disabled', false);
    if (valorPrevio) select.val(valorPrevio);
    select.trigger('change');
}

function inicializarBuscador() {
    var $medicamento = $('#medicamento');
    nombresOrdenados.forEach(function (nombre) {
        $medicamento.append(nuevaOpcion(nombre, nombre));
    });
    reinicializarSelect2Base();

    $medicamento.on('change', function () {
        var nombre = $(this).val();
        ocultarResultados();

        if (!nombre) {
            $('#presentacion').empty().append(nuevaOpcion('', t('placeholderPresentacionPrimero')));
            $('#presentacion').prop('disabled', true).trigger('change');
            return;
        }

        poblarPresentacion(nombre);
    });

    $('#presentacion').on('change', function () {
        var valor = $(this).val();
        if (!valor) {
            ocultarResultados();
            return;
        }
        var partes = valor.split('|');
        seleccionarPresentacion(partes[0], partes[1]);
    });

    $('#filtro-rol, #filtro-operacion, #filtro-transaccion, #filtro-unidad').on('change', function () {
        actualizarDashboard();
    });
}

function nuevaOpcion(valor, texto) {
    var opt = document.createElement('option');
    opt.value = valor;
    opt.textContent = texto;
    return opt;
}

function ocultarResultados() {
    $('#panel-ficha').addClass('d-none');
    $('#panel-filtros').addClass('d-none');
    $('#panel-resultados').addClass('d-none');
    $('#panel-mensaje').addClass('d-none');
}

// --- Ficha técnica (CUM vigente) -------------------------------------------------

function formatoFecha(valor) {
    if (!valor) return null;
    return String(valor).split('T')[0];
}

function renderFicha(entrada, ficha) {
    var $grid = $('#ficha-grid');
    $grid.empty();

    var datos = Object.assign({}, entrada || {}, ficha || {});
    var esFecha = { fecha_expedicion: 1, fecha_vencimiento: 1, fecha_activo: 1, fecha_inactivo: 1 };
    var huboDato = false;

    t('fichaCampos').forEach(function (campo) {
        var clave = campo[0], etiqueta = campo[1];
        var valor = esFecha[clave] ? formatoFecha(datos[clave]) : datos[clave];
        if (valor === null || valor === undefined || valor === '') return;
        huboDato = true;

        var col = document.createElement('div');
        col.className = 'col-6 col-lg-3 ficha-item';
        var label = document.createElement('div');
        label.className = 'ficha-label';
        label.textContent = etiqueta;
        var val = document.createElement('div');
        val.className = 'ficha-valor';
        val.textContent = valor;
        col.appendChild(label);
        col.appendChild(val);
        $grid.append(col);
    });

    $('#panel-ficha').toggleClass('d-none', !huboDato);
}

function obtenerFicha(noExpediente) {
    if (cacheFichas.has(noExpediente)) return Promise.resolve(cacheFichas.get(noExpediente));
    return fetch('data/fichas/' + noExpediente + '.json')
        .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(function (fichas) {
            cacheFichas.set(noExpediente, fichas);
            return fichas;
        })
        .catch(function () {
            return {};
        });
}

// --- Selección de presentación: trae (o reusa) el JSON del expediente ----------

function seleccionarPresentacion(noExpediente, presentacionComercial) {
    ocultarResultados();

    var entrada = porClave.get(noExpediente + '|' + presentacionComercial);
    obtenerFicha(noExpediente).then(function (fichas) {
        renderFicha(entrada, fichas[presentacionComercial]);
    });

    var promesa = cacheExpedientes.has(noExpediente)
        ? Promise.resolve(cacheExpedientes.get(noExpediente))
        : fetch('data/expedientes/' + noExpediente + '.json')
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (filas) {
                cacheExpedientes.set(noExpediente, filas);
                return filas;
            });

    promesa
        .then(function (filas) {
            filasBase = filas.filter(function (r) { return r[COL.pc] === presentacionComercial; });
            poblarFiltros(filasBase);
            $('#panel-filtros').removeClass('d-none');
            actualizarDashboard();
        })
        .catch(function (err) {
            $('#panel-mensaje').removeClass('d-none').text(t('errorHistorico')(err.message));
        });
}

// --- Filtros (Rol / Operación / Transacción / Unidad) ---------------------------

function opcionesDisponibles(filas, indice) {
    var vistos = new Set();
    filas.forEach(function (r) { if (r[indice]) vistos.add(r[indice]); });
    return Array.from(vistos).sort();
}

function poblarFiltro(id, codigos, mapaTexto) {
    var $sel = $('#' + id);
    if ($sel.hasClass('select2-hidden-accessible')) {
        $sel.select2('destroy');
    }
    $sel.empty();
    codigos.forEach(function (cod) {
        var opt = document.createElement('option');
        opt.value = cod;
        opt.textContent = mapaTexto[cod] || cod;
        $sel.append(opt);
    });
    $sel.select2({ placeholder: t('filtroTodos'), allowClear: true, width: '100%', closeOnSelect: false });
}

function poblarFiltros(filas) {
    var codigos = codigosActuales();
    poblarFiltro('filtro-rol', opcionesDisponibles(filas, COL.rol), codigos.rol);
    poblarFiltro('filtro-operacion', opcionesDisponibles(filas, COL.operacion), codigos.operacion);
    poblarFiltro('filtro-transaccion', opcionesDisponibles(filas, COL.transaccion), codigos.transaccion);
    poblarFiltro('filtro-unidad', opcionesDisponibles(filas, COL.unidad), codigos.unidad);
}

function aplicarFiltros(filas) {
    var rol = $('#filtro-rol').val() || [];
    var operacion = $('#filtro-operacion').val() || [];
    var transaccion = $('#filtro-transaccion').val() || [];
    var unidad = $('#filtro-unidad').val() || [];

    if (!rol.length && !operacion.length && !transaccion.length && !unidad.length) return filas;

    return filas.filter(function (r) {
        if (rol.length && rol.indexOf(r[COL.rol]) === -1) return false;
        if (operacion.length && operacion.indexOf(r[COL.operacion]) === -1) return false;
        if (transaccion.length && transaccion.indexOf(r[COL.transaccion]) === -1) return false;
        if (unidad.length && unidad.indexOf(r[COL.unidad]) === -1) return false;
        return true;
    });
}

// --- Agregación (KPIs, series mensual/anual) ------------------------------------

function agregar(filas) {
    var pmin = null, pmax = null, unidades = 0, valor = 0;
    filas.forEach(function (r) {
        if (r[COL.pmin] !== null) pmin = (pmin === null) ? r[COL.pmin] : Math.min(pmin, r[COL.pmin]);
        if (r[COL.pmax] !== null) pmax = (pmax === null) ? r[COL.pmax] : Math.max(pmax, r[COL.pmax]);
        if (r[COL.unidades] !== null) unidades += r[COL.unidades];
        if (r[COL.valor] !== null) valor += r[COL.valor];
    });
    return { precio_minimo: pmin, precio_maximo: pmax, unidades: unidades, valor_total: valor };
}

function calcularMensual(filas) {
    var grupos = new Map();
    filas.forEach(function (r) {
        if (r[COL.mes] === null || r[COL.mes] === undefined) return;
        var key = r[COL.anio] * 12 + r[COL.mes];
        if (!grupos.has(key)) grupos.set(key, []);
        grupos.get(key).push(r);
    });
    return Array.from(grupos.keys()).sort(function (a, b) { return a - b; }).map(function (key) {
        var filasGrupo = grupos.get(key);
        var agg = agregar(filasGrupo);
        agg.periodo = filasGrupo[0][COL.anio] + '-' + String(filasGrupo[0][COL.mes]).padStart(2, '0');
        return agg;
    });
}

function calcularAnual(filas) {
    var grupos = new Map();
    filas.forEach(function (r) {
        var key = r[COL.anio];
        if (!grupos.has(key)) grupos.set(key, []);
        grupos.get(key).push(r);
    });
    return Array.from(grupos.keys()).sort(function (a, b) { return a - b; }).map(function (anio) {
        var agg = agregar(grupos.get(anio));
        agg.anio = anio;
        return agg;
    });
}

function calcularKpis(anual) {
    if (!anual.length) return null;

    var unidadesTotales = anual.reduce(function (s, f) { return s + (f.unidades || 0); }, 0);
    var valorTotal = anual.reduce(function (s, f) { return s + (f.valor_total || 0); }, 0);
    var preciosMin = anual.map(function (f) { return f.precio_minimo; }).filter(function (v) { return v !== null; });
    var preciosMax = anual.map(function (f) { return f.precio_maximo; }).filter(function (v) { return v !== null; });

    var primero = anual[0], ultimo = anual[anual.length - 1];
    var precioPromPrimero = primero.unidades ? (primero.valor_total / primero.unidades) : null;
    var precioPromUltimo = ultimo.unidades ? (ultimo.valor_total / ultimo.unidades) : null;
    var variacionPct = (precioPromPrimero && precioPromUltimo)
        ? (precioPromUltimo - precioPromPrimero) / precioPromPrimero * 100
        : null;

    return {
        precio_promedio: unidadesTotales ? (valorTotal / unidadesTotales) : null,
        precio_minimo: preciosMin.length ? Math.min.apply(null, preciosMin) : null,
        precio_maximo: preciosMax.length ? Math.max.apply(null, preciosMax) : null,
        variacion_pct: variacionPct,
        unidades_totales: unidadesTotales,
        valor_total: valorTotal,
        anio_inicial: primero.anio,
        anio_final: ultimo.anio
    };
}

function actualizarDashboard() {
    var filas = aplicarFiltros(filasBase);
    var anual = calcularAnual(filas);
    var mensual = calcularMensual(filas);
    var kpis = calcularKpis(anual);

    if (!kpis) {
        $('#panel-resultados').addClass('d-none');
        $('#panel-mensaje').removeClass('d-none').text(t('sinDatosSeleccion'));
        return;
    }
    $('#panel-mensaje').addClass('d-none');
    $('#panel-resultados').removeClass('d-none');

    renderKpis(kpis);
    renderChartPrecios(mensual);
    renderChartUnidades(mensual);
    renderChartValor(mensual);
    renderTablaAnual(anual);
}

// --- Formato ---------------------------------------------------------------------

function formatoPesos(valor) {
    if (valor === null || valor === undefined || valor === '') return '—';
    var num = Number(valor);
    if (isNaN(num)) return '—';
    return '$ ' + Math.round(num).toLocaleString('es-CO');
}

function formatoCompacto(valor) {
    if (valor === null || valor === undefined || valor === '') return '—';
    var num = Number(valor);
    if (isNaN(num)) return '—';
    return new Intl.NumberFormat('es-CO', { notation: 'compact', maximumFractionDigits: 1 }).format(num);
}

function formatoPesosCompacto(valor) {
    if (valor === null || valor === undefined || valor === '') return '—';
    return '$ ' + formatoCompacto(valor);
}

function formatoPct(valor) {
    if (valor === null || valor === undefined || valor === '') return '—';
    var num = Number(valor);
    if (isNaN(num)) return '—';
    var signo = num > 0 ? '+' : '';
    return signo + num.toFixed(1) + '%';
}

// --- KPIs ----------------------------------------------------------------------

function renderKpis(kpis) {
    $('#kpi-precio-promedio').text(formatoPesos(kpis.precio_promedio));
    $('#kpi-precio-minimo').text(formatoPesos(kpis.precio_minimo));
    $('#kpi-precio-maximo').text(formatoPesos(kpis.precio_maximo));
    $('#kpi-unidades').text(formatoCompacto(kpis.unidades_totales));
    $('#kpi-valor').text(formatoPesosCompacto(kpis.valor_total));

    $('#kpi-variacion').text(formatoPct(kpis.variacion_pct));
    var $sub = $('#kpi-variacion-sub');
    $sub.removeClass('up-bad down-good');
    if (kpis.variacion_pct === null || kpis.variacion_pct === undefined) {
        $sub.text('');
    } else {
        $sub.text(kpis.anio_inicial + ' → ' + kpis.anio_final);
        $sub.addClass(kpis.variacion_pct > 0 ? 'up-bad' : 'down-good');
    }
}

// --- Gráficas (Chart.js) --------------------------------------------------------

function destruir(clave) {
    if (charts[clave]) {
        charts[clave].destroy();
        charts[clave] = null;
    }
}

function renderChartPrecios(mensual) {
    destruir('precios');
    var p = paletaActual();
    var ctx = document.getElementById('chart-precios').getContext('2d');

    charts.precios = new Chart(ctx, {
        type: 'line',
        data: {
            labels: mensual.map(function (d) { return d.periodo; }),
            datasets: [
                {
                    label: t('chartPrecioMinimo'),
                    data: mensual.map(function (d) { return d.precio_minimo; }),
                    borderColor: p.blue,
                    backgroundColor: p.blue,
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    tension: 0
                },
                {
                    label: t('chartPrecioMaximo'),
                    data: mensual.map(function (d) { return d.precio_maximo; }),
                    borderColor: p.aqua,
                    backgroundColor: p.aqua,
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    tension: 0
                }
            ]
        },
        options: {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: true, position: 'top', labels: { usePointStyle: true, pointStyle: 'line', color: p.tick } },
                tooltip: {
                    callbacks: {
                        label: function (item) {
                            return item.dataset.label + ': ' + formatoPesos(item.parsed.y);
                        }
                    }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: p.tick, maxTicksLimit: 12 } },
                y: { grid: { color: p.grid }, ticks: { color: p.tick, callback: function (v) { return formatoPesosCompacto(v); } } }
            }
        }
    });
}

function renderChartUnidades(mensual) {
    destruir('unidades');
    var p = paletaActual();
    var ctx = document.getElementById('chart-unidades').getContext('2d');

    charts.unidades = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: mensual.map(function (d) { return d.periodo; }),
            datasets: [
                {
                    label: t('chartUnidadesFacturadas'),
                    data: mensual.map(function (d) { return d.unidades; }),
                    backgroundColor: p.violet,
                    borderRadius: { topLeft: 4, topRight: 4 },
                    borderSkipped: 'bottom',
                    maxBarThickness: 24
                }
            ]
        },
        options: {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (item) { return formatoCompacto(item.parsed.y) + t('tooltipUnidadesSuffix'); }
                    }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: p.tick, maxTicksLimit: 8 } },
                y: { grid: { color: p.grid }, ticks: { color: p.tick, callback: function (v) { return formatoCompacto(v); } } }
            }
        }
    });
}

function renderChartValor(mensual) {
    destruir('valor');
    var p = paletaActual();
    var ctx = document.getElementById('chart-valor').getContext('2d');

    charts.valor = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: mensual.map(function (d) { return d.periodo; }),
            datasets: [
                {
                    label: t('chartValorTotalFacturado'),
                    data: mensual.map(function (d) { return d.valor_total; }),
                    backgroundColor: p.orange,
                    borderRadius: { topLeft: 4, topRight: 4 },
                    borderSkipped: 'bottom',
                    maxBarThickness: 24
                }
            ]
        },
        options: {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (item) { return formatoPesosCompacto(item.parsed.y); }
                    }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: p.tick, maxTicksLimit: 8 } },
                y: { grid: { color: p.grid }, ticks: { color: p.tick, callback: function (v) { return formatoPesosCompacto(v); } } }
            }
        }
    });
}

// --- Tabla anual -----------------------------------------------------------------

function renderTablaAnual(anual) {
    var $tbody = $('#tabla-anual tbody');
    $tbody.empty();

    if (!anual || anual.length === 0) {
        var tr = document.createElement('tr');
        var td = document.createElement('td');
        td.colSpan = 5;
        td.textContent = t('sinDatosAnuales');
        tr.appendChild(td);
        $tbody.append(tr);
        return;
    }

    anual.forEach(function (fila) {
        var tr = document.createElement('tr');
        [
            fila.anio,
            formatoPesos(fila.precio_minimo),
            formatoPesos(fila.precio_maximo),
            fila.unidades !== null && fila.unidades !== undefined ? Math.round(fila.unidades).toLocaleString('es-CO') : '—',
            formatoPesos(fila.valor_total)
        ].forEach(function (valor) {
            var td = document.createElement('td');
            td.textContent = valor;
            tr.appendChild(td);
        });
        $tbody.append(tr);
    });
}
