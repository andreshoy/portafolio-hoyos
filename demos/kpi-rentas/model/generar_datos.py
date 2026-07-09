"""
generar_datos.py
================
Genera un dataset dummy de títulos de cartera (rentas varias) y lo agrega
en un único JSON de salida, siguiendo la misma lógica de un tablero real:
KPIs de cartera, control de prescripción (MAX de fechas que interrumpen
+ 5 años) e inconsistencias de notificación.

Los datos son 100% ficticios — no corresponden a ninguna entidad.

Uso:
    pip install pandas numpy
    python3 generar_datos.py
"""

import json
import random
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

OUT_PATH = Path(__file__).resolve().parent.parent / "data" / "tablero.json"
N = 6000
SEED = 42

random.seed(SEED)
np.random.seed(SEED)

DEPENDENCIAS = [
    "Secretaría de Hacienda", "Dirección de Rentas", "Secretaría de Movilidad",
    "Secretaría de Gobierno", "Dirección de Impuestos", "Secretaría de Planeación",
    "Dirección de Ejecuciones Fiscales", "Secretaría de Infraestructura",
    "Dirección de Espacio Público", "Secretaría de Salud",
]

CONCEPTOS = [
    "Impuesto de Industria y Comercio", "Impuesto Predial Unificado",
    "Multas de Tránsito", "Sobretasa a la Gasolina", "Estampillas",
    "Contribución de Valorización", "Impuesto de Delineación Urbana",
    "Impuesto de Avisos y Tableros", "Otros conceptos",
]

ESTADOS_TITULO = ["EXIGIBLE", "EXIGIBLE-NUEVOS", "EN COBRO", "SUSPENDIDO", "TERMINADO", "ARCHIVADO"]
ESTADOS_PROCESO = ["ACTIVO", "PAGADO", "EN ACUERDO DE PAGO", "PRESCRITO", "ARCHIVADO"]

HOY = datetime(2026, 7, 9)


def fecha_aleatoria(inicio, fin):
    delta = (fin - inicio).days
    return inicio + timedelta(days=random.randint(0, max(delta, 0)))


def generar_dataframe():
    filas = []
    for i in range(1, N + 1):
        anno_traslado = np.random.choice(
            list(range(2016, 2026)),
            p=_pesos_anno(),
        )
        fecha_ejec = fecha_aleatoria(datetime(anno_traslado, 1, 1), datetime(anno_traslado, 12, 31))
        sin_ejecutoria = random.random() < 0.02

        valor = float(np.round(np.random.lognormal(mean=15.2, sigma=0.9), -3))
        valor = min(valor, 250_000_000)

        tiene_mp = random.random() < 0.72
        tiene_citacion = random.random() < 0.55
        tiene_roc = random.random() < 0.32
        tiene_sae = random.random() < 0.22
        tiene_embargo = random.random() < 0.16
        convenio = random.random() < 0.09

        pagado = random.random() < 0.14
        valor_pagado = 0.0
        if pagado:
            valor_pagado = float(np.round(valor * np.random.uniform(0.5, 1.0), -3))
        elif random.random() < 0.05:
            valor_pagado = float(np.round(valor * np.random.uniform(0.05, 0.4), -3))

        fecha_cit = fecha_aleatoria(fecha_ejec, fecha_ejec + timedelta(days=180)) if tiene_citacion else None

        notificado_personal = tiene_mp and random.random() < 0.5
        fecha_not_personal = None
        if notificado_personal and random.random() > 0.12:  # 12% inconsistentes (marcado sin fecha)
            fecha_not_personal = fecha_aleatoria(fecha_ejec, fecha_ejec + timedelta(days=365))

        notif_correo = tiene_mp and random.random() < 0.4
        fecha_noticorreo = None
        if notif_correo and random.random() > 0.15:  # 15% inconsistentes
            fecha_noticorreo = fecha_aleatoria(fecha_ejec, fecha_ejec + timedelta(days=365))

        publicado = tiene_mp and (not notificado_personal) and (not notif_correo) and random.random() < 0.3
        fecha_pub = fecha_aleatoria(fecha_ejec, fecha_ejec + timedelta(days=400)) if publicado else None

        filas.append({
            "id": i,
            "estado_titulo": np.random.choice(ESTADOS_TITULO, p=[0.42, 0.10, 0.18, 0.08, 0.12, 0.10]),
            "estado_proceso": np.random.choice(ESTADOS_PROCESO, p=[0.5, 0.14, 0.09, 0.12, 0.15]),
            "anno_traslado": int(anno_traslado),
            "dependencia": np.random.choice(DEPENDENCIAS),
            "concepto": np.random.choice(CONCEPTOS, p=[0.22, 0.24, 0.16, 0.08, 0.07, 0.07, 0.06, 0.05, 0.05]),
            "valor": valor,
            "valor_pagado": valor_pagado,
            "valor_mandamiento": valor if tiene_mp else 0.0,
            "tiene_mp": tiene_mp,
            "tiene_citacion": tiene_citacion,
            "tiene_roc": tiene_roc,
            "tiene_sae": tiene_sae,
            "tiene_embargo": tiene_embargo,
            "convenio_pago": convenio,
            "fecha_ejecutoria": None if sin_ejecutoria else fecha_ejec,
            "fecha_citacion": fecha_cit,
            "notificado_personalmente": notificado_personal,
            "fecha_not_personal": fecha_not_personal,
            "notificacion_correo_enviada": notif_correo,
            "fecha_noticorreo": fecha_noticorreo,
            "publicado": publicado,
            "fecha_publicacion": fecha_pub,
        })
    return pd.DataFrame(filas)


def _pesos_anno():
    # más volumen en años recientes
    pesos = np.linspace(0.4, 1.6, 10)
    return (pesos / pesos.sum()).tolist()


def calcular(df):
    fechas_cols = ["fecha_ejecutoria", "fecha_citacion", "fecha_not_personal", "fecha_noticorreo", "fecha_publicacion"]
    df["_fecha_base"] = df[fechas_cols].max(axis=1)
    df["_fecha_pres"] = df["_fecha_base"] + pd.DateOffset(years=5)

    df["_pagado"] = df["valor_pagado"] > 0
    df["_activo"] = ~df["_pagado"] & ~df["convenio_pago"]

    df["_prescrito"] = df["_activo"] & df["_fecha_pres"].notna() & (df["_fecha_pres"] < HOY)
    df["_riesgo_critico"] = df["_activo"] & df["_fecha_pres"].notna() & \
        (df["_fecha_pres"] >= HOY) & (df["_fecha_pres"] <= HOY + pd.DateOffset(months=6))
    df["_riesgo_alto"] = df["_activo"] & df["_fecha_pres"].notna() & \
        (df["_fecha_pres"] > HOY + pd.DateOffset(months=6)) & (df["_fecha_pres"] <= HOY + pd.DateOffset(years=1))
    df["_sin_fecha_base"] = df["_activo"] & df["_fecha_base"].isna()

    sin_not_pers = df["fecha_not_personal"].isna()
    sin_not_correo = df["fecha_noticorreo"].isna()
    sin_pub = df["fecha_publicacion"].isna()

    df["_inc_not_pers"] = df["tiene_mp"] & df["notificado_personalmente"] & sin_not_pers
    df["_inc_not_correo"] = df["tiene_mp"] & df["notificacion_correo_enviada"] & sin_not_correo
    df["_mp_sin_nada"] = df["tiene_mp"] & sin_not_pers & sin_not_correo & sin_pub
    df["_sin_ejecutoria"] = df["fecha_ejecutoria"].isna()

    total = len(df)
    val_total = df["valor"].sum()
    val_pag = df["valor_pagado"].sum()

    kpis = {
        "total_titulos": total,
        "valor_total_cartera": round(val_total, 0),
        "valor_pagado": round(val_pag, 0),
        "valor_pendiente": round(val_total - val_pag, 0),
        "pct_recaudo": round(val_pag / val_total * 100, 2) if val_total else 0,
        "titulos_prescritos": int(df["_prescrito"].sum()),
        "titulos_riesgo_critico": int(df["_riesgo_critico"].sum()),
        "titulos_riesgo_alto": int(df["_riesgo_alto"].sum()),
        "titulos_sin_fecha_interrupcion": int(df["_sin_fecha_base"].sum()),
        "sin_ejecutoria": int(df["_sin_ejecutoria"].sum()),
        "titulos_con_mp": int(df["tiene_mp"].sum()),
        "valor_mandamiento": round(df["valor_mandamiento"].sum(), 0),
        "titulos_con_citacion": int(df["tiene_citacion"].sum()),
        "titulos_con_roc": int(df["tiene_roc"].sum()),
        "titulos_con_sae": int(df["tiene_sae"].sum()),
        "titulos_con_embargo": int(df["tiene_embargo"].sum()),
        "titulos_con_convenio": int(df["convenio_pago"].sum()),
        "mp_sin_notificacion": int(df["_mp_sin_nada"].sum()),
        "inc_notificacion_personal": int(df["_inc_not_pers"].sum()),
        "inc_notificacion_correo": int(df["_inc_not_correo"].sum()),
    }

    por_estado = (
        df.groupby("estado_titulo").agg(cantidad=("id", "count"), valor_total=("valor", "sum"))
        .reset_index().sort_values("cantidad", ascending=False)
    )
    por_estado = [
        {"estado": r["estado_titulo"], "cantidad": int(r["cantidad"]), "valor_total": round(r["valor_total"], 0)}
        for _, r in por_estado.iterrows()
    ]

    por_dependencia = (
        df.groupby("dependencia").agg(cantidad=("id", "count"), valor_total=("valor", "sum"))
        .reset_index().sort_values("cantidad", ascending=False)
    )
    por_dependencia = [
        {"dependencia": r["dependencia"], "cantidad": int(r["cantidad"]), "valor_total": round(r["valor_total"], 0)}
        for _, r in por_dependencia.iterrows()
    ][::-1]

    por_concepto = (
        df.groupby("concepto").agg(cantidad=("id", "count"), valor_total=("valor", "sum"))
        .reset_index().sort_values("cantidad", ascending=False)
    )
    por_concepto = [
        {"concepto": r["concepto"], "cantidad": int(r["cantidad"]), "valor_total": round(r["valor_total"], 0)}
        for _, r in por_concepto.iterrows()
    ][::-1]

    por_anno = (
        df.groupby("anno_traslado").agg(cantidad=("id", "count"), valor_total=("valor", "sum"), valor_pagado=("valor_pagado", "sum"))
        .reset_index().sort_values("anno_traslado")
    )
    por_anno = [
        {"anno": int(r["anno_traslado"]), "cantidad": int(r["cantidad"]),
         "valor_total": round(r["valor_total"], 0), "valor_pagado": round(r["valor_pagado"], 0)}
        for _, r in por_anno.iterrows()
    ]

    indicadores_defs = [
        ("tiene_mp", "Mandamiento de Pago"),
        ("tiene_citacion", "Citación"),
        ("tiene_roc", "Resolución de Cobro (ROC)"),
        ("tiene_sae", "SAE"),
        ("tiene_embargo", "Embargo"),
    ]
    indicadores = [
        {"indicador": nombre, "con_indicador": int(df[col].sum()), "sin_indicador": total - int(df[col].sum())}
        for col, nombre in indicadores_defs
    ]

    riesgo_prescripcion = [
        {"categoria": "Prescritos", "cantidad": int(df["_prescrito"].sum()), "descripcion": "Superaron los 5 años"},
        {"categoria": "Riesgo crítico (<6 meses)", "cantidad": int(df["_riesgo_critico"].sum()), "descripcion": "Prescriben antes de 6 meses"},
        {"categoria": "Riesgo alto (6-12 meses)", "cantidad": int(df["_riesgo_alto"].sum()), "descripcion": "Prescriben entre 6 y 12 meses"},
        {"categoria": "Sin fecha de interrupción", "cantidad": int(df["_sin_fecha_base"].sum()), "descripcion": "No se puede calcular la prescripción"},
        {"categoria": "Con pago o convenio", "cantidad": int((df["_pagado"] | df["convenio_pago"]).sum()), "descripcion": "Prescripción suspendida o extinguida"},
    ]

    return {
        "actualizacion": HOY.strftime("%Y-%m-%d"),
        "total_registros": total,
        "kpis": kpis,
        "porEstado": por_estado,
        "porDependencia": por_dependencia,
        "porConcepto": por_concepto,
        "porAnno": por_anno,
        "indicadores": indicadores,
        "riesgoPrescripcion": riesgo_prescripcion,
    }


def main():
    df = generar_dataframe()
    datos = calcular(df)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=2)
    print(f"[OK] {OUT_PATH} generado ({OUT_PATH.stat().st_size / 1024:.1f} KB, {df.shape[0]} títulos dummy)")


if __name__ == "__main__":
    main()
