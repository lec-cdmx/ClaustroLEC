"""Controles del importador y reconciliación completa con el archivo fuente."""
from datetime import datetime
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("importer", ROOT / "tools/importar_programacion.py")
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)


def row(**changes):
    base = {k: None for k in importer.REQUIRED}
    base.update({"Periodo": "202613", "CRN": 123, "Clave": "EC1010B", "Materia": "Economía",
                 "Grupo": 101, "Unidad de Formación": "Bloque", "Periodo Tec 21": "1-3",
                 "Créditos": 0, "Inglés": "NO", "Nomina": "L01234567", "Profesor(a)": "Docente Uno",
                 "Fecha Inicio": datetime(2026, 8, 10), "Fecha Fin": datetime(2026, 12, 6),
                 "Días": "Lu---Ju--", "Horario Inicio": "07:00", "Horario Fin": "08:30",
                 "Salón": "Aulas I, 403", "Porcentaje": "50"})
    return {**base, **changes}


class ImporterTests(unittest.TestCase):
    def test_shared_group_keeps_two_sessions_without_adding_percentages(self):
        rows = [row(), row(**{"Días": "----Vi-"}), row(),
                row(**{"Nomina": "L07654321", "Profesor(a)": "Docente Dos"})]
        groups, count = importer.convert(enumerate(rows, 2))
        self.assertEqual(count, 4)
        self.assertEqual(len(groups), 1)
        self.assertEqual(len(groups[0]["assignments"]), 2)
        person = next(p for p in groups[0]["assignments"] if p["payroll"] == "L01234567")
        self.assertEqual(len(person["sessions"]), 2)
        self.assertEqual({s["participation"] for s in person["sessions"]}, {50})

    def test_zero_and_missing_are_distinct(self):
        groups, _ = importer.convert([(2, row(**{"Porcentaje": "0"})),
                                      (3, row(**{"CRN": 124, "Créditos": None, "Porcentaje": None}))])
        self.assertEqual(groups[0]["credits"], 0)
        self.assertEqual(groups[0]["assignments"][0]["sessions"][0]["participation"], 0)
        self.assertIsNone(groups[1]["credits"])
        self.assertIsNone(groups[1]["assignments"][0]["sessions"][0]["participation"])

    def test_reused_crn_in_another_term_is_separate(self):
        groups, _ = importer.convert([(2, row()), (3, row(**{"Periodo": "202713"}))])
        self.assertEqual(len(groups), 2)

    def test_conflicting_course_and_invalid_payroll_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "contradictoria"):
            importer.convert([(2, row()), (3, row(**{"Materia": "Otra UF"}))])
        with self.assertRaisesRegex(ValueError, "nómina inválida"):
            importer.convert([(2, row(**{"Nomina": "L123"}))])

    def test_invalid_dates_and_percentage_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "fecha final"):
            importer.convert([(2, row(**{"Fecha Fin": datetime(2025, 1, 1)}))])
        with self.assertRaisesRegex(ValueError, "porcentaje"):
            importer.convert([(2, row(**{"Porcentaje": 101}))])

    def test_all_source_records_match_published_data(self):
        path = ROOT / "Programación 202613 - 2026_11_11 ECSG.xlsx"
        if not path.exists():
            self.skipTest("Archivo fuente local no disponible")
        payload = json.loads((ROOT / "assets/data/programacion.json").read_text(encoding="utf-8"))
        workbook = importer.load_workbook(path, read_only=True, data_only=True)
        try:
            values = workbook["Sesiones y Porcentajes"].values
            headers = next(values)
            source = [dict(zip(headers, values)) for values in values if any(v is not None for v in values)]
            expected = set()
            for r in source:
                expected.add((str(r["Periodo"]), str(r["CRN"]), r["Clave"], r["Materia"], str(r["Grupo"]),
                              r["Unidad de Formación"], r["Periodo Tec 21"], r["Créditos"],
                              "Inglés" if r["Inglés"] == "SI" else "Español", r["Nomina"].strip(),
                              r["Profesor(a)"].strip(), r["Fecha Inicio"].date().isoformat(),
                              r["Fecha Fin"].date().isoformat(), r["Días"], r["Horario Inicio"],
                              r["Horario Fin"], r["Salón"], float(r["Porcentaje"])))
            actual = set()
            for g in payload["groups"]:
                for p in g["assignments"]:
                    for s in p["sessions"]:
                        actual.add((g["term"], g["crn"], g["key"], g["name"], g["group"], g["type"],
                                    g["periods"], g["credits"], g["language"], p["payroll"], p["name"],
                                    s["start"], s["end"], s["days"], s["startTime"], s["endTime"],
                                    s["room"], s["participation"]))
            self.assertSetEqual(expected, actual)
            self.assertEqual(len(source), payload["sourceRows"])
            self.assertEqual(len({str(r["CRN"]) for r in source}), len(payload["groups"]))
            self.assertEqual(len({r["Nomina"].strip() for r in source}), payload["teacherCount"])
        finally:
            workbook.close()


if __name__ == "__main__":
    unittest.main()
