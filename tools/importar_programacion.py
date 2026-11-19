"""Convierte la hoja de sesiones en datos del portal sin modificar el Excel.

Uso: python tools/importar_programacion.py "archivo.xlsx" --fecha-corte AAAA-MM-DD
Requiere openpyxl (python -m pip install openpyxl).
"""
import argparse
from datetime import date, datetime, time
import json
from pathlib import Path
import re

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
GROUP_FIELDS = {
    "term": "Periodo", "crn": "CRN", "key": "Clave", "name": "Materia",
    "group": "Grupo", "type": "Unidad de Formación", "periods": "Periodo Tec 21",
    "credits": "Créditos", "language": "Inglés",
}
REQUIRED = set(GROUP_FIELDS.values()) | {
    "Nomina", "Profesor(a)", "Fecha Inicio", "Fecha Fin", "Días",
    "Horario Inicio", "Horario Fin", "Salón", "Porcentaje",
}


def clean(value):
    return str(value).strip() if value is not None else ""


def number(value):
    if value is None or clean(value) == "":
        return None
    result = float(value)
    if result != result or abs(result) == float("inf"):
        raise ValueError(f"Número no válido: {value}")
    return int(result) if result.is_integer() else result


def iso_date(value):
    if not value:
        return None
    if isinstance(value, (datetime, date)):
        return value.date().isoformat() if isinstance(value, datetime) else value.isoformat()
    return date.fromisoformat(clean(value)).isoformat()


def clock_time(value):
    if value is None or clean(value) == "":
        return None
    if isinstance(value, (time, datetime)):
        return value.strftime("%H:%M")
    text = clean(value)
    return datetime.strptime(text, "%H:%M").strftime("%H:%M")


def convert(records):
    groups = {}
    source_rows = 0
    for row_number, row in records:
        if not any(v is not None and clean(v) for v in row.values()):
            continue
        source_rows += 1
        missing = [key for key in ("CRN", "Nomina", "Profesor(a)", "Materia", "Clave", "Periodo") if not clean(row[key])]
        if missing:
            raise ValueError(f"Fila {row_number}: faltan {', '.join(missing)}")
        payroll = clean(row["Nomina"]).upper()
        if not re.fullmatch(r"L\d{8}", payroll):
            raise ValueError(f"Fila {row_number}: nómina inválida {payroll!r}")
        metadata = {key: clean(row[column]) for key, column in GROUP_FIELDS.items()}
        metadata["credits"] = number(row["Créditos"])
        english = clean(row["Inglés"]).upper()
        metadata["language"] = {"SI": "Inglés", "SÍ": "Inglés", "NO": "Español"}.get(english, "No indicado")
        group_key = (metadata["term"], metadata["crn"])
        group = groups.setdefault(group_key, {**metadata, "assignments": {}})
        if any(group[key] != value for key, value in metadata.items()):
            raise ValueError(f"Fila {row_number}: información contradictoria para CRN {metadata['crn']}")
        teacher = group["assignments"].setdefault(payroll, {
            "payroll": payroll, "name": clean(row["Profesor(a)"]), "sessions": [],
        })
        if teacher["name"] != clean(row["Profesor(a)"]):
            raise ValueError(f"Fila {row_number}: nombres distintos para {payroll}")
        session = {
            "start": iso_date(row["Fecha Inicio"]), "end": iso_date(row["Fecha Fin"]),
            "days": clean(row["Días"]) or None,
            "startTime": clock_time(row["Horario Inicio"]), "endTime": clock_time(row["Horario Fin"]),
            "room": clean(row["Salón"]) or None, "participation": number(row["Porcentaje"]),
        }
        if session["start"] and session["end"] and session["start"] > session["end"]:
            raise ValueError(f"Fila {row_number}: fecha final anterior a la inicial")
        if session["participation"] is not None and not 0 <= session["participation"] <= 100:
            raise ValueError(f"Fila {row_number}: porcentaje fuera de 0 a 100")
        if session not in teacher["sessions"]:
            teacher["sessions"].append(session)
    result = []
    for group in groups.values():
        group["assignments"] = sorted(group["assignments"].values(), key=lambda p: p["name"])
        for person in group["assignments"]:
            person["sessions"].sort(key=lambda s: (s["start"] or "", s["startTime"] or "", s["days"] or ""))
        result.append(group)
    result.sort(key=lambda g: (g["term"], g["name"], g["crn"]))
    return result, source_rows


def import_workbook(path, cutoff, sheet="Sesiones y Porcentajes"):
    workbook = load_workbook(path, read_only=True, data_only=True)
    try:
        if sheet not in workbook.sheetnames:
            raise ValueError(f"No existe la hoja {sheet!r}")
        rows = workbook[sheet].iter_rows(values_only=True)
        headers = [clean(value) for value in next(rows)]
        if len(headers) != len(set(headers)):
            raise ValueError("Hay encabezados duplicados")
        missing = REQUIRED - set(headers)
        if missing:
            raise ValueError(f"Faltan columnas: {', '.join(sorted(missing))}")
        groups, count = convert((i, dict(zip(headers, row))) for i, row in enumerate(rows, 2))
        if not groups:
            raise ValueError("El archivo no tiene programación")
        return {
            "source": Path(path).name, "sheet": sheet, "cutoff": date.fromisoformat(cutoff).isoformat(),
            "terms": sorted({g["term"] for g in groups}), "sourceRows": count,
            "teacherCount": len({p["payroll"] for g in groups for p in g["assignments"]}),
            "groups": groups,
        }
    finally:
        workbook.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archivo", type=Path)
    parser.add_argument("--fecha-corte", required=True, help="Fecha de actualización de la fuente (AAAA-MM-DD)")
    parser.add_argument("--salida", type=Path, default=ROOT / "assets/data/programacion.json")
    args = parser.parse_args()
    payload = import_workbook(args.archivo, args.fecha_corte)
    args.salida.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.salida.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n", encoding="utf-8")
    temporary.replace(args.salida)
    print(f"Importadas {payload['sourceRows']} filas: {len(payload['groups'])} grupos, {payload['teacherCount']} docentes.")


if __name__ == "__main__":
    main()
