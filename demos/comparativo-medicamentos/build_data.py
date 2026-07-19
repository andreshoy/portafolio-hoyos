"""Genera data/catalogo.json y data/series/{no_expediente}.json para el demo
"comparativo-medicamentos" a partir de:

  - data/cum_estandarizado.parquet: catálogo INVIMA de expedientes CUM con sus
    presentaciones (un principio activo por fila; los expedientes multi-principio
    activo tienen una fila por cada uno, con expediente/consecutivo repetidos).
  - data/consolidado.parquet: histórico de precios reportados a SISPRO (Colombia).

El universo elegible se filtra desde cum_estandarizado.parquet con dos restricciones:
  1. concentracion == "A".
  2. Integridad por expediente: si un expediente tiene varias filas (varios
     principios activos, en cualquiera de sus consecutivos), todas deben cumplir
     la restricción anterior — si una sola fila del expediente no es concentracion
     "A", se descarta el expediente completo en vez de dejarlo incompleto.

Sobre ese universo (~4.150 principios activos), PRINCIPIOS_MUESTRA recorta a una
muestra chica curada con seleccionar_muestra.py: entre los principios con >=4
marcas/expedientes y precio con histórico en 2025, se queda con los que, una vez
estandarizado el precio (mediana de valor/unidades por presentación en 2025,
dividida por cantidad_total_presentacion), muestran el precio estandarizado más
consistente entre marcas (menor coeficiente de variación) — es decir, principios
donde estandarizar de verdad hace comparables las presentaciones. Reejecutar
seleccionar_muestra.py y actualizar PRINCIPIOS_MUESTRA si cum_estandarizado.parquet
o consolidado.parquet cambian.

Se cruzan ambos archivos por (expedientecum/consecutivocum, NoExpediente/PresentacionComercial).

Requiere: pandas, pyarrow (pip install pandas pyarrow).
"""

import json
from pathlib import Path

import numpy as np
import pandas as pd

BASE = Path(__file__).resolve().parent
CUM_PATH = BASE / "data" / "cum_estandarizado.parquet"
PARQUET_PATH = BASE / "data" / "consolidado.parquet"
CATALOGO_OUT = BASE / "data" / "catalogo.json"
SERIES_DIR = BASE / "data" / "series"

# Muestra curada por seleccionar_muestra.py (ver docstring del módulo).
PRINCIPIOS_MUESTRA = {
    "OXALIPLATINO",
    "DEFLAZACORT MICRONIZADO",
    "AZITROMICINA",
    "PARICALCITOL",
    "DAPTOMICINA",
    "NIFUROXAZIDA",
    "TIOTEPA",
    "TOPIRAMATO",
    "PIRACETAM",
    "CABAZITAXEL",
}


def cargar_catalogo():
    cum = pd.read_parquet(CUM_PATH)

    # Las muestras médicas no se venden (precio casi siempre 0) y se excluyen del
    # comparativo. cum_estandarizado.parquet no tiene una columna de categoría de
    # presentación dedicada; el dato queda embebido como texto libre dentro de
    # descripcioncomercial.
    es_muestra = cum["descripcioncomercial"].str.contains("muestra m", case=False, na=False)
    cum = cum[~es_muestra].copy()

    # Restricción 1: solo concentracion "A".
    es_concentracion_a = cum["concentracion"] == "A"

    # Restricción 2: integridad por expediente. Si el expediente tiene alguna fila
    # (cualquier consecutivo, cualquier principio activo) que no sea concentracion
    # "A", se descarta el expediente completo para no dejar un principio activo del
    # combinado sin sus pares.
    filas_por_expediente = cum.groupby("expedientecum").size()
    filas_a_por_expediente = cum.loc[es_concentracion_a].groupby("expedientecum").size()
    expedientes_completos = filas_a_por_expediente[
        filas_a_por_expediente == filas_por_expediente.reindex(filas_a_por_expediente.index)
    ].index

    cum = cum[es_concentracion_a & cum["expedientecum"].isin(expedientes_completos)].copy()

    cum["no_expediente"] = cum["expedientecum"].astype(str)
    cum["consecutivo"] = cum["consecutivocum"].astype(str)

    # Cantidad total de principio activo en la presentación completa = unidades de
    # la presentación (cantidadcum, ej. 5 plumas) × contenido por unidad (cantidad,
    # ej. 100 UI/pluma). Es el divisor que estandariza el precio ($/UI, $/mg, etc.).
    cantidadcum = pd.to_numeric(cum["cantidadcum"].str.replace(",", ".", regex=False), errors="coerce")
    contenido_unitario = pd.to_numeric(cum["cantidad"].str.replace(",", ".", regex=False), errors="coerce")
    cum["cantidad_total_presentacion"] = cantidadcum * contenido_unitario

    return cum


def derivar_periodo(df):
    """Año/mes por fila, a partir de AnnioCorte/MesFactura — granularidad mensual,
    poblada desde 2019-10 en adelante (antes de esa fecha AnnioCorte viene vacío y
    solo hay un texto trimestral en Periodo, ej. "201501 a 201503"). El demo usa
    únicamente este tramo mensual, así que las filas trimestrales anteriores no se
    parsean: quedan en NA y las descarta el dropna(subset=["anio","mes"]) de main()."""
    tiene_mes = df["AnnioCorte"] != ""
    anio = pd.Series(pd.NA, index=df.index, dtype="Int64")
    mes = pd.Series(pd.NA, index=df.index, dtype="Int64")

    anio[tiene_mes] = pd.to_numeric(df.loc[tiene_mes, "AnnioCorte"], errors="coerce")
    mes[tiene_mes] = pd.to_numeric(df.loc[tiene_mes, "MesFactura"], errors="coerce")

    return anio, mes


def main():
    catalogo = cargar_catalogo()
    print(f"Universo elegible (concentracion=A + integridad por expediente): {len(catalogo)} filas, "
          f"{catalogo['principioactivo'].nunique()} principios activos")

    catalogo = catalogo[catalogo["principioactivo"].isin(PRINCIPIOS_MUESTRA)].copy()
    faltantes = PRINCIPIOS_MUESTRA - set(catalogo["principioactivo"].unique())
    if faltantes:
        print(f"AVISO: {len(faltantes)} principio(s) de PRINCIPIOS_MUESTRA no aparecen en el universo elegible: {faltantes}")

    expedientes = sorted(catalogo["no_expediente"].unique().tolist())
    print(f"Muestra del demo: {len(catalogo)} filas, {len(expedientes)} expedientes, "
          f"{catalogo['principioactivo'].nunique()} principios activos")

    columnas = [
        "NoExpediente", "PresentacionComercial", "CodUnidadFactura",
        "CodRolActorReportante", "CodTipoOperacion", "CodTipoTransaccion",
        "AnnioCorte", "MesFactura",
        "TotalUnidadesFacturadas", "ValorTotalFacturado",
    ]
    print("Leyendo consolidado.parquet (puede tardar unos segundos)...")
    df = pd.read_parquet(PARQUET_PATH, columns=columnas)
    # CodUnidadFactura se fija en 'A' (presentación comercial completa) sin excepción:
    # es la única base en que dividir por "Cantidad total en presentación" da un precio
    # estandarizado con sentido (unidad B/C/D son por empaque primario o dispensación,
    # de escala distinta). No se expone como filtro para el usuario.
    df = df[(df["NoExpediente"].isin(expedientes)) & (df["CodUnidadFactura"] == "A")].copy()
    print(f"Filas del parquet tras filtrar por expediente + CodUnidadFactura='A': {len(df)}")

    df["unidades"] = pd.to_numeric(df["TotalUnidadesFacturadas"], errors="coerce")
    df["valor"] = pd.to_numeric(df["ValorTotalFacturado"], errors="coerce")
    df["anio"], df["mes"] = derivar_periodo(df)
    antes = len(df)
    df = df.dropna(subset=["anio", "mes"])
    print(f"Filas descartadas por ser anteriores a octubre de 2019 (el demo solo usa el tramo mensual): {antes - len(df)}")

    # Filas sin unidades ni valor facturado no aportan nada al precio estandarizado
    # (ni al numerador ni al denominador) y solo son ruido en las series de salida.
    antes = len(df)
    df = df[(df["unidades"] != 0) | (df["valor"] != 0)]
    print(f"Filas descartadas por unidades=0 y valor=0: {antes - len(df)}")

    # --- Datos atípicos por (expediente, presentación) -----------------------------
    # Precio por fila = valor / unidades (antes de agregar por período). Dentro de
    # cada presentación con datos suficientes, se descartan filas cuyo precio cae
    # fuera de [Q1 − 1.5·IQR, Q3 + 1.5·IQR] (regla de Tukey) — errores de captura
    # puntuales que si no se filtran dominan la gráfica (ej. un mes reportado con
    # 100x el precio habitual de esa presentación). Con menos de MIN_FILAS_ATIPICOS
    # filas no hay evidencia suficiente para distinguir un atípico real de variación
    # legítima, así que esas presentaciones quedan intactas; lo mismo las filas con
    # unidades<=0 (precio no definible, no evaluables por este método).
    MIN_FILAS_ATIPICOS = 4
    df["precio_fila"] = np.where(df["unidades"] > 0, df["valor"] / df["unidades"], np.nan)

    validos = df[df["precio_fila"].notna()]
    g = validos.groupby(["NoExpediente", "PresentacionComercial"])["precio_fila"]
    resumen_grupo = pd.DataFrame({"q1": g.quantile(0.25), "q3": g.quantile(0.75), "n": g.size()})
    resumen_grupo["iqr"] = resumen_grupo["q3"] - resumen_grupo["q1"]
    resumen_grupo["lo"] = resumen_grupo["q1"] - 1.5 * resumen_grupo["iqr"]
    resumen_grupo["hi"] = resumen_grupo["q3"] + 1.5 * resumen_grupo["iqr"]

    df = df.join(resumen_grupo[["lo", "hi", "n"]], on=["NoExpediente", "PresentacionComercial"])
    es_atipico = (
        (df["n"] >= MIN_FILAS_ATIPICOS)
        & ((df["precio_fila"] < df["lo"]) | (df["precio_fila"] > df["hi"]))
    ).fillna(False)
    print(f"Filas descartadas por precio atípico (Tukey, dentro de expediente+presentación): {int(es_atipico.sum())}")
    df = df[~es_atipico].drop(columns=["precio_fila", "lo", "hi", "n"])

    # Agregado por (expediente, presentación, año, mes, rol, operación, transacción):
    # suma de unidades y valor. Se conservan estas 3 dimensiones (igual que
    # buscador-medicamentos) para poder filtrar en el cliente sin perder la
    # posibilidad de recalcular el precio estandarizado sumando valor/unidades del
    # subconjunto filtrado (no promediando precios ya divididos).
    agregado = (
        df.groupby(
            ["NoExpediente", "PresentacionComercial", "anio", "mes",
             "CodRolActorReportante", "CodTipoOperacion", "CodTipoTransaccion"],
            as_index=False,
        )
        .agg(unidades=("unidades", "sum"), valor=("valor", "sum"))
    )

    claves_con_datos = set(zip(agregado["NoExpediente"], agregado["PresentacionComercial"]))
    catalogo["tiene_historico"] = list(
        zip(catalogo["no_expediente"], catalogo["consecutivo"])
    )
    catalogo["tiene_historico"] = catalogo["tiene_historico"].apply(lambda k: k in claves_con_datos)

    n_sin_historico = int((~catalogo["tiene_historico"]).sum())
    print(f"\n{n_sin_historico} fila(s) del catálogo sin histórico en el parquet.")

    # --- data/catalogo.json ---
    registros = []
    for _, fila in catalogo.iterrows():
        registros.append({
            "principio_activo": fila["principioactivo"],
            "nombre": fila["producto"],
            "productor": fila["titular"],
            "no_expediente": fila["no_expediente"],
            "consecutivo": fila["consecutivo"],
            "categoria_presentacion": "",
            "cantidad_total_presentacion": (
                None if pd.isna(fila["cantidad_total_presentacion"])
                else float(fila["cantidad_total_presentacion"])
            ),
            "unidad_dosis": fila["unidad"],
            "descripcion": (str(fila["descripcioncomercial"])[:160] if pd.notna(fila["descripcioncomercial"]) else ""),
            "tiene_historico": bool(fila["tiene_historico"]),
        })

    CATALOGO_OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(CATALOGO_OUT, "w", encoding="utf-8") as f:
        json.dump(registros, f, ensure_ascii=False, separators=(",", ":"))
    print(f"\nEscrito {CATALOGO_OUT} ({len(registros)} presentaciones)")

    # --- data/series/{no_expediente}.json ---
    SERIES_DIR.mkdir(parents=True, exist_ok=True)
    for archivo_viejo in SERIES_DIR.glob("*.json"):
        archivo_viejo.unlink()

    total_filas_series = 0
    for no_expediente, grupo in agregado.groupby("NoExpediente"):
        filas = grupo.sort_values(["PresentacionComercial", "anio", "mes"])[
            ["PresentacionComercial", "anio", "mes",
             "CodRolActorReportante", "CodTipoOperacion", "CodTipoTransaccion",
             "unidades", "valor"]
        ].values.tolist()
        filas = [
            [pc, int(anio), int(mes), rol, operacion, transaccion,
             round(float(unidades), 2), round(float(valor), 2)]
            for pc, anio, mes, rol, operacion, transaccion, unidades, valor in filas
        ]
        total_filas_series += len(filas)
        with open(SERIES_DIR / f"{no_expediente}.json", "w", encoding="utf-8") as f:
            json.dump(filas, f, ensure_ascii=False, separators=(",", ":"))

    print(f"Escritos {len(list(SERIES_DIR.glob('*.json')))} archivos en {SERIES_DIR} ({total_filas_series} filas totales)")

    n_ok = int(catalogo["tiene_historico"].sum())
    print(f"\nResumen: {n_ok}/{len(catalogo)} presentaciones con histórico de precios.")


if __name__ == "__main__":
    main()
