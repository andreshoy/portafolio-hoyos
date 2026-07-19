"""Deriva la muestra chica de principios activos (PRINCIPIOS_MUESTRA en build_data.py)
a partir del universo elegible de cargar_catalogo() (concentracion == "A" +
integridad por expediente, ver build_data.py).

Metodología: para cada presentación (expediente+consecutivo) con precio en el
último año calendario completo disponible en consolidado.parquet, se toma la
mediana del precio por fila (ValorTotalFacturado / TotalUnidadesFacturadas,
CodUnidadFactura="A") y se divide por cantidad_total_presentacion para obtener
un precio estandarizado por presentación. Se agrupa por principio activo y se
mide qué tan consistente es ese precio estandarizado entre sus distintas
marcas/presentaciones (coeficiente de variación = desviación estándar / media):
un cv bajo indica que estandarizar de verdad vuelve comparables las
presentaciones de ese principio, que es el objetivo del demo.

Salida: imprime los mejores candidatos (>=4 marcas, ordenados por menor cv) para
elegir a mano la muestra final y pegarla en PRINCIPIOS_MUESTRA.

Requiere: pandas, pyarrow, numpy.
"""

from pathlib import Path

import numpy as np
import pandas as pd

from build_data import PARQUET_PATH, cargar_catalogo

ULTIMO_ANIO = 2025  # último año calendario completo en consolidado.parquet
MIN_MARCAS = 4


def main():
    cum = cargar_catalogo()
    cum = cum[cum["cantidad_total_presentacion"] > 0].copy()
    print(f"Universo elegible: {len(cum)} filas, {cum['expedientecum'].nunique()} expedientes, "
          f"{cum['principioactivo'].nunique()} principios activos")

    cols = ["NoExpediente", "PresentacionComercial", "CodUnidadFactura",
            "AnnioCorte", "TotalUnidadesFacturadas", "ValorTotalFacturado"]
    df = pd.read_parquet(PARQUET_PATH, columns=cols)
    anio = pd.to_numeric(df["AnnioCorte"], errors="coerce")
    df = df[(df["CodUnidadFactura"] == "A") & (anio == ULTIMO_ANIO)].copy()

    df = df.merge(
        cum[["no_expediente", "consecutivo", "principioactivo", "cantidad_total_presentacion"]],
        left_on=["NoExpediente", "PresentacionComercial"],
        right_on=["no_expediente", "consecutivo"],
        how="inner",
    )

    unidades = pd.to_numeric(df["TotalUnidadesFacturadas"], errors="coerce")
    valor = pd.to_numeric(df["ValorTotalFacturado"], errors="coerce")
    df["precio_fila"] = valor / unidades
    df = df[(unidades > 0) & (valor > 0) & np.isfinite(df["precio_fila"])]

    por_presentacion = (
        df.groupby(["no_expediente", "consecutivo", "principioactivo", "cantidad_total_presentacion"])
        .agg(precio_mediano=("precio_fila", "median"))
        .reset_index()
    )
    por_presentacion["precio_estandarizado"] = (
        por_presentacion["precio_mediano"] / por_presentacion["cantidad_total_presentacion"]
    )

    def resumen(g):
        precios = g["precio_estandarizado"]
        return pd.Series({
            "n_marcas": g["no_expediente"].nunique(),
            "mediana": precios.median(),
            "cv": precios.std() / precios.mean() if precios.mean() else np.nan,
        })

    por_principio = por_presentacion.groupby("principioactivo").apply(resumen, include_groups=False).reset_index()
    candidatos = por_principio[(por_principio["n_marcas"] >= MIN_MARCAS) & por_principio["cv"].notna()]
    candidatos = candidatos.sort_values("cv")

    pd.set_option("display.width", 160)
    print(f"\nCandidatos con >={MIN_MARCAS} marcas y precio estandarizado en {ULTIMO_ANIO}, "
          f"ordenados por menor coeficiente de variación:")
    print(candidatos.head(30).to_string(index=False))


if __name__ == "__main__":
    main()
