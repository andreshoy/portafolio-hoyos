"""
preparar_modelo.py
===================
Prepara el modelo XGBoost real (modelo_xgb_supervivencia.json, objetivo
survival:aft) para desplegarlo en una página estática: extrae solo los
campos de cada árbol necesarios para inferencia, valida que un recorrido de
árbol reimplementado en Python reproduzca exactamente xgb.Booster.predict(),
y escribe el resultado minificado a data/modelo.json (lo que consume
predict.js en el navegador).

Uso:
    pip install xgboost numpy
    python3 preparar_modelo.py
"""

import json
import math
from pathlib import Path

import numpy as np
import xgboost as xgb

BASE = Path(__file__).resolve().parent.parent
MODEL_PATH = BASE / "modelo_xgb_supervivencia.json"
OUT_PATH = BASE / "data" / "modelo.json"

FEATURE_NAMES = ["vigencia", "uso", "estrato", "avaluo", "comuna", "monto",
                  "pago_inicial", "pct_pagado", "vigencias_adeudadas"]


def cargar_json_crudo():
    with open(MODEL_PATH, encoding="utf-8") as f:
        return json.load(f)


def extraer_modelo_liviano(raw):
    learner = raw["learner"]
    gb = learner["gradient_booster"]["model"]

    base_score = float(learner["learner_model_param"]["base_score"].strip("[]"))
    objetivo = learner["objective"]
    scale = float(objetivo["aft_loss_param"]["aft_loss_distribution_scale"])
    distribucion = objetivo["aft_loss_param"]["aft_loss_distribution"]

    # Categorías de 'estrato' (única variable categórica en este modelo)
    cats_enc = raw["learner"]["gradient_booster"]["model"]["cats"]["enc"]
    categorias_por_feature = {}
    for i, enc in enumerate(cats_enc):
        if enc["values"]:
            categorias_por_feature[FEATURE_NAMES[i]] = enc["values"]

    arboles = []
    for t in gb["trees"]:
        arboles.append({
            "left": t["left_children"],
            "right": t["right_children"],
            "feat": t["split_indices"],
            "cond": t["split_conditions"],
            "defL": t["default_left"],
            "type": t["split_type"],
            "cat_nodes": t["categories_nodes"],
            "cat_seg": t["categories_segments"],
            "cat_size": t["categories_sizes"],
            "cats": t["categories"],
        })

    # Confirmado con el autor del modelo (no viene en el JSON exportado): estas
    # variables se entrenaron transformadas, no en su escala cruda. El
    # formulario de la demo pide valores crudos (COP, % 0-100) y se aplican
    # aquí antes de recorrer los árboles.
    transformaciones = {
        "avaluo": "ln",
        "monto": "ln",
        "pago_inicial": "ln1p",
        "pct_pagado": "fraccion",
    }

    return {
        "feature_names": FEATURE_NAMES,
        "base_score": base_score,
        "aft_distribution": distribucion,
        "aft_scale": scale,
        "categorias": categorias_por_feature,
        "transformaciones": transformaciones,
        "num_trees": len(arboles),
        "trees": arboles,
    }


def aplicar_transformaciones(modelo_liviano, x_crudo):
    """x_crudo: dict con valores tal como los ingresaría el formulario (COP
    crudos, porcentaje 0-100). Devuelve una copia con las variables monetarias
    y de porcentaje ya transformadas a la escala de entrenamiento."""
    x = dict(x_crudo)
    for fname, tipo in modelo_liviano["transformaciones"].items():
        if fname not in x or x[fname] is None:
            continue
        v = x[fname]
        if tipo == "ln":
            x[fname] = math.log(max(v, 1e-6))
        elif tipo == "ln1p":
            x[fname] = math.log(max(v, 0.0) + 1.0)
        elif tipo == "fraccion":
            x[fname] = v / 100.0
    return x


def recorrer_arbol(t, x):
    """x: dict feature_name -> valor (categóricas ya convertidas a código). Reproduce
    el recorrido de un árbol XGBoost."""
    node = 0
    while t["left"][node] != -1:
        fi = t["feat"][node]
        fname = FEATURE_NAMES[fi]
        val = x.get(fname)
        if val is None or (isinstance(val, float) and math.isnan(val)):
            va_izq = bool(t["defL"][node])
        elif t["type"][node] == 1:
            # split categórico: los valores del conjunto van a la derecha, el resto
            # (y los valores faltantes) a la izquierda — confirmado contra
            # bst.trees_to_dataframe() (columnas Yes/No/Category). El conjunto usa
            # los valores crudos de la variable (no códigos posicionales).
            if node in t["cat_nodes"]:
                idx = t["cat_nodes"].index(node)
                seg = t["cat_seg"][idx]
                size = t["cat_size"][idx]
                conjunto = t["cats"][seg:seg + size]
                va_izq = val not in conjunto
            else:
                va_izq = True
        else:
            va_izq = val < t["cond"][node]
        node = t["left"][node] if va_izq else t["right"][node]
    return t["cond"][node]  # en una hoja, split_conditions == valor de la hoja


def predecir_mu(modelo_liviano, x):
    # base_score se guarda en espacio "tiempo crudo" (no log) para este modelo AFT;
    # hay que llevarlo a espacio margen (log-tiempo) para sumarlo con las hojas
    # (confirmado empíricamente contra xgb.Booster.predict(output_margin=True)).
    total = math.log(modelo_liviano["base_score"])
    for t in modelo_liviano["trees"]:
        total += recorrer_arbol(t, x)
    return total


def normal_cdf(z):
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))


def supervivencia(mu, scale, t_meses):
    """S(t) = 1 - Phi((ln(t) - mu) / scale), t en meses (misma unidad que el label de entrenamiento)."""
    if t_meses <= 0:
        return 1.0
    z = (math.log(t_meses) - mu) / scale
    return 1.0 - normal_cdf(z)


def validar(raw, modelo_liviano, n=25, seed=7):
    print("[..] Validando recorrido Python contra xgboost.Booster.predict()...")
    bst = xgb.Booster()
    bst.load_model(str(MODEL_PATH))

    rng = np.random.default_rng(seed)
    filas_crudas = []
    for _ in range(n):
        filas_crudas.append({
            "vigencia": int(rng.integers(2010, 2026)),
            "uso": float(rng.integers(1, 7)),
            "estrato": float(rng.choice([1, 2, 3, 4, 5, 6, 9])),
            "avaluo": float(rng.uniform(20_000_000, 800_000_000)),
            "comuna": float(rng.integers(1, 23)),
            "monto": float(rng.uniform(50_000, 20_000_000)),
            "pago_inicial": float(rng.uniform(0, 5_000_000)),
            "pct_pagado": float(rng.uniform(0, 100)),
            "vigencias_adeudadas": int(rng.integers(1, 15)),
        })
    # Filas ya transformadas a la escala de entrenamiento (ln/ln1p/fracción) —
    # así es como llegan al recorrido de árbol tanto en Python como en JS.
    filas = [aplicar_transformaciones(modelo_liviano, f) for f in filas_crudas]

    import pandas as pd
    # Importante: NO usar dtype pandas "category" aquí. Xgboost re-codifica una
    # columna categórica de pandas con SUS PROPIOS códigos posicionales, que no
    # necesariamente coinciden con los valores crudos que el modelo ya trae
    # embebidos en sus splits (confirmado comparando bst.predict(pred_leaf=True)
    # contra trees_to_dataframe()). Pasando los valores crudos + feature_types
    # explícito, xgboost los compara tal cual contra las categorías del árbol.
    FEATURE_TYPES = ["int", "float", "c", "float", "float", "float", "float", "float", "int"]
    df = pd.DataFrame(filas)[FEATURE_NAMES]
    dm = xgb.DMatrix(df, feature_names=FEATURE_NAMES, feature_types=FEATURE_TYPES, enable_categorical=True)

    margin_xgb = bst.predict(dm, output_margin=True)
    margin_py = np.array([predecir_mu(modelo_liviano, fila) for fila in filas])

    diff = np.abs(margin_xgb - margin_py)
    print(f"    max |diff| margen (log-tiempo): {diff.max():.8f}")
    print(f"    mean |diff|: {diff.mean():.8f}")
    assert diff.max() < 1e-4, "El recorrido Python NO coincide con xgboost — revisar lógica antes de portar a JS"
    print("[OK] Recorrido Python coincide con xgboost.Booster.predict() (output_margin)")

    # Además: tiempo_predicho = exp(margin) según xgboost para AFT
    tiempo_xgb = bst.predict(dm)
    tiempo_py = np.exp(margin_py)
    diff2 = np.abs(tiempo_xgb - tiempo_py)
    print(f"    max |diff| tiempo predicho: {diff2.max():.4f}")
    assert diff2.max() < 1e-2
    print("[OK] exp(mu) coincide con la predicción de tiempo de xgboost")


def chequeo_sensibilidad(modelo_liviano):
    """Chequeo informativo (no falla el build): confirma que, con las variables
    ya transformadas, el modelo responde a monto/pago_inicial/pct_pagado en
    vez de quedar plano (como pasaba antes de aplicar ln/ln1p/fracción)."""
    print("\n[..] Chequeo de sensibilidad (informativo)...")
    base = dict(vigencia=2022, uso=1, estrato=3, avaluo=120_000_000, comuna=10,
                monto=2_500_000, pago_inicial=0, pct_pagado=0, vigencias_adeudadas=4)

    def mediana(x_crudo):
        x = aplicar_transformaciones(modelo_liviano, x_crudo)
        return math.exp(predecir_mu(modelo_liviano, x))

    for campo, valores in [
        ("monto", [100_000, 2_500_000, 10_000_000, 20_000_000]),
        ("pago_inicial", [0, 500_000, 2_000_000, 5_000_000]),
        ("pct_pagado", [0, 25, 50, 90]),
        ("vigencias_adeudadas", [1, 4, 8, 15]),
    ]:
        linea = []
        for v in valores:
            x = dict(base)
            x[campo] = v
            linea.append(f"{v}->{mediana(x):.1f}a")
        print(f"    {campo:20s}: " + "  ".join(linea))


def main():
    raw = cargar_json_crudo()
    modelo_liviano = extraer_modelo_liviano(raw)
    validar(raw, modelo_liviano)
    chequeo_sensibilidad(modelo_liviano)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(modelo_liviano, f, separators=(",", ":"))

    kb = OUT_PATH.stat().st_size / 1024
    print(f"\n[OK] {OUT_PATH} generado ({kb:.1f} KB, {modelo_liviano['num_trees']} árboles)")


if __name__ == "__main__":
    main()
