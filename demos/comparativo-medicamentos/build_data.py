"""Genera data/catalogo.json y data/series/{no_expediente}.json para el demo
"comparativo-medicamentos" a partir de:

  - data/Archivo para prueba contenido.xlsx: catálogo de principios activos
    homologados (expediente + presentación + contenido total para estandarizar).
  - data/consolidado.parquet: histórico de precios reportados a SISPRO (Colombia).

Se cruzan ambos archivos por (NoExpediente, Consecutivo expediente / PresentacionComercial).
Reejecutar este script cuando el catálogo de homologados crezca.

Requiere: pandas, pyarrow, openpyxl (pip install pandas pyarrow openpyxl).
"""

import json
import re
from pathlib import Path

import pandas as pd

BASE = Path(__file__).resolve().parent
XLSX_PATH = BASE / "data" / "Archivo para prueba contenido.xlsx"
PARQUET_PATH = BASE / "data" / "consolidado.parquet"
CATALOGO_OUT = BASE / "data" / "catalogo.json"
SERIES_DIR = BASE / "data" / "series"


def cargar_catalogo():
    xl = pd.read_excel(XLSX_PATH)

    # Las muestras médicas no se venden (precio casi siempre 0) y se excluyen del
    # comparativo. De paso resuelve el problema de las 12 filas con
    # "Principio activo" = "MUESTRA MÉDICA" (mal etiquetado): todas están dentro de
    # este mismo filtro, así que no hace falta reclasificarlas por nombre comercial.
    es_muestra = xl["Categoría de presentación"].str.contains("muestr", case=False, na=False)
    xl = xl[~es_muestra].copy()

    xl["no_expediente"] = xl["NoExpediente"].astype(str)
    xl["consecutivo"] = xl["Consecutivo expediente"].astype(str)

    # --- Correcciones puntuales de errores de tipeo en el Excel de origen ---
    # Cada una se confirmó comparando descripción/concentración contra el
    # contenido real de esa presentación en consolidado.parquet (ver plan del demo).

    # BENEFIX: al NoExpediente le falta el "1" inicial (9904609 -> 19904609).
    m = xl["Nombre"] == "BENEFIX"
    xl.loc[m, "no_expediente"] = "19904609"

    # GENTROPIN: expediente equivocado (quedó igual al de TRESIBA, 20059262).
    # El producto real es "GENOTROPIN" 5,3mg/16 U.I., expediente 228038 (mismos
    # consecutivos 1-4 que en el Excel).
    m = xl["Nombre"] == "GENTROPIN"
    xl.loc[m, "no_expediente"] = "228038"

    # OCTANATE: fila con NoExpediente 19986300 (no existe); por contenido (1000 UI,
    # 10 mL) corresponde a 19986299 consecutivo 3.
    m = (xl["Nombre"] == "OCTANATE") & (xl["NoExpediente"] == 19986300)
    xl.loc[m, "no_expediente"] = "19986299"

    return xl


def derivar_periodo(df):
    """Año/mes por fila: mensual desde AnnioCorte/MesFactura (poblado desde 2019-10),
    trimestral antes de esa fecha (parseado del texto Periodo, ej. "201501 a 201503")."""
    tiene_mes = df["AnnioCorte"] != ""
    anio = pd.Series(pd.NA, index=df.index, dtype="Int64")
    mes = pd.Series(pd.NA, index=df.index, dtype="Int64")

    anio[tiene_mes] = pd.to_numeric(df.loc[tiene_mes, "AnnioCorte"], errors="coerce")
    mes[tiene_mes] = pd.to_numeric(df.loc[tiene_mes, "MesFactura"], errors="coerce")

    periodo_txt = df.loc[~tiene_mes, "Periodo"].str.extract(r"^(\d{4})(\d{2})")
    anio[~tiene_mes] = pd.to_numeric(periodo_txt[0], errors="coerce")
    mes[~tiene_mes] = pd.to_numeric(periodo_txt[1], errors="coerce")

    return anio, mes


def main():
    catalogo = cargar_catalogo()
    expedientes = sorted(catalogo["no_expediente"].unique().tolist())
    print(f"Catálogo (sin muestras médicas): {len(catalogo)} filas, {len(expedientes)} expedientes")

    columnas = [
        "NoExpediente", "PresentacionComercial", "CodUnidadFactura",
        "CodRolActorReportante", "CodTipoOperacion", "CodTipoTransaccion",
        "AnnioCorte", "MesFactura", "Periodo",
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
    df = df.dropna(subset=["anio", "mes"])

    # Filas sin unidades ni valor facturado no aportan nada al precio estandarizado
    # (ni al numerador ni al denominador) y solo son ruido en las series de salida.
    antes = len(df)
    df = df[(df["unidades"] != 0) | (df["valor"] != 0)]
    print(f"Filas descartadas por unidades=0 y valor=0: {antes - len(df)}")

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

    sin_historico = catalogo[~catalogo["tiene_historico"]]
    if len(sin_historico):
        print(f"\n{len(sin_historico)} fila(s) del catálogo sin histórico en el parquet:")
        print(
            sin_historico[["Principio activo", "Nombre", "no_expediente", "consecutivo"]]
            .to_string(index=False)
        )

    # --- data/catalogo.json ---
    registros = []
    for _, fila in catalogo.iterrows():
        registros.append({
            "principio_activo": fila["Principio activo"],
            "nombre": fila["Nombre"],
            "productor": fila["Productor"],
            "no_expediente": fila["no_expediente"],
            "consecutivo": fila["consecutivo"],
            "categoria_presentacion": fila["Categoría de presentación"],
            "cantidad_total_presentacion": (
                None if pd.isna(fila["Cantidad total en presentación"])
                else float(fila["Cantidad total en presentación"])
            ),
            "unidad_dosis": fila["Unidad para dosis"],
            "descripcion": (str(fila["Descripción"])[:160] if pd.notna(fila["Descripción"]) else ""),
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
