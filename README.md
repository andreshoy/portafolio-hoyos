# Portafolio Hoyos

Sitio de portafolio de servicios: tableros de control y modelos predictivos con
machine learning. HTML/CSS/JS puro, sin build step, bilingüe (ES/EN).

## Estructura

```
index.html                          Landing
cv/                                  Hoja de vida (self-contained, propio toggle ES/EN)
demos/buscador-medicamentos/         Demo: buscador de precios de medicamentos (datos públicos reales, SISPRO)
demos/kpi-rentas/                    Demo: tablero KPI de seguimiento de cartera (datos dummy)
demos/supervivencia-predial/         Demo: simulador de riesgo con modelo XGBoost real (survival:aft)
assets/css/styles.css                Estilos compartidos (paleta y componentes)
assets/js/                           main.js (nav/footer) e i18n.js (toggle ES/EN)
assets/i18n/                         Diccionarios es.json / en.json
```

## Desarrollo local

El sitio usa `fetch()` para cargar diccionarios de idioma y datos de las demos,
así que hay que servirlo con un servidor HTTP local (no abrir los `.html`
directamente con `file://`):

```bash
python3 -m http.server 8000
```

Luego abre `http://localhost:8000`.

## Las demos

### Buscador de precios de medicamentos

Usa datos **públicos reales** del sistema SISPRO (Colombia), recortados a los
10 medicamentos con historial más completo (de ~8.600 en el buscador
original). Los datos ya están generados en `demos/buscador-medicamentos/data/`;
no requieren regeneración para servir el sitio.

### Tablero KPI de seguimiento de cartera (rentas varias)

Datos 100% **ficticios**, generados para replicar la estructura de un tablero
real de cartera (KPIs, control de prescripción, inconsistencias de
notificación). Para regenerar `data/tablero.json`:

```bash
cd demos/kpi-rentas/model
python3 -m venv .venv && source .venv/bin/activate
pip install pandas numpy
python3 generar_datos.py
```

### Simulador de riesgo — cartera vencida de predial

Esta demo corre un modelo **XGBoost real** (`survival:aft`, 500 árboles,
`modelo_xgb_supervivencia.json`) directamente en el navegador — el archivo
`data/modelo.json` es una versión liviana (solo lo necesario para inferencia)
de ese mismo modelo. Los valores del formulario son hipotéticos; el modelo es
real. Para regenerar `data/modelo.json` (por ejemplo si el modelo original
cambia):

```bash
cd demos/supervivencia-predial/model
python3 -m venv .venv && source .venv/bin/activate
pip install xgboost numpy pandas
python3 preparar_modelo.py
```

El script valida el recorrido de árbol reimplementado en Python contra
`xgb.Booster.predict()` antes de escribir el JSON — si la lógica de inferencia
alguna vez se toca (en Python o en `predict.js`), correr este script confirma
que sigue coincidiendo con el modelo real.

## Desplegar en Cloudflare Pages

1. Crea un repositorio en GitHub y sube este proyecto:
   ```bash
   git remote add origin <URL-de-tu-repo>
   git branch -M main
   git push -u origin main
   ```
2. En el dashboard de Cloudflare Pages: **Create a project → Connect to Git**,
   selecciona el repositorio.
3. Configuración de build:
   - Framework preset: `None`
   - Build command: (vacío)
   - Build output directory: `/`
4. Guarda y despliega. Cloudflare te dará una URL `*.pages.dev`; puedes
   conectar un dominio propio después desde la misma pantalla del proyecto.
