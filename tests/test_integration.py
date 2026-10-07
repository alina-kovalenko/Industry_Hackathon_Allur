import math
import unittest

from allur.engine import load_case
from allur.integration import STATE_UNITS, build_state, calculate_stop_scenario


class IntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.case = load_case()

    def test_state_has_exact_envelope_and_section_schema(self):
        result = build_state(self.case, "2026-10-02", scheduled_hours=8)
        self.assertEqual(set(result), {"sections"})
        self.assertEqual([row["id"] for row in result["sections"]], ["welding", "painting", "assembly"])
        fields = {"id", "status", "throughput", "queue", "downtime_minutes", "defect_rate"}
        self.assertTrue(all(set(row) == fields for row in result["sections"]))
        self.assertEqual(result["sections"][0]["throughput"], 111 / 8)
        self.assertIsNone(result["sections"][0]["queue"])
        self.assertEqual(result["sections"][0]["downtime_minutes"], 30)
        self.assertAlmostEqual(result["sections"][1]["defect_rate"], 6 / 116)
        self.assertTrue(all(row["status"] in {"running", "warning", "stopped"} for row in result["sections"]))
        self.assertIn("selected calendar-period hour", STATE_UNITS["throughput"])

    def test_state_uses_latest_date_and_zero_runtime_means_stopped(self):
        result = build_state(self.case)
        self.assertEqual(result["sections"][0]["throughput"], 111 / 8)
        case = {**self.case, "production": [dict(row) for row in self.case["production"]]}
        for row in case["production"]:
            if row["date"] == "2026-10-02" and row["line_id"] == "painting":
                row.update(actual_units=0, defects=0, runtime_hours=0)
        state = build_state(case, "2026-10-02")
        paint = next(row for row in state["sections"] if row["id"] == "painting")
        self.assertEqual(paint["status"], "stopped")
        self.assertEqual(paint["throughput"], 0)

    def test_stop_scenario_returns_serial_stage_example_and_zero_stop_identity(self):
        zero = calculate_stop_scenario(self.case, {
            "date":"2026-10-02", "scheduled_hours":8, "id":"painting",
            "equipment_id":"Камера-02", "stop_minutes":0, "horizon_minutes":480,
        })
        self.assertEqual(zero["scenario"]["good_units"], zero["baseline"]["good_units"])
        self.assertEqual(zero["lost_good_units"], 0)
        self.assertEqual(len(zero["baseline"]["stages"]), 3)
        self.assertIsNone(zero["baseline"]["stages"][0]["input_units"])
        self.assertEqual(zero["baseline"]["stages"][1]["input_units"], zero["baseline"]["stages"][0]["good_output_units"])
        self.assertEqual(zero["threshold"]["projected_minutes"], 0)
        self.assertFalse(zero["threshold"]["exceeded"])

        painting_stop = calculate_stop_scenario(self.case, {
            "date":"2026-10-02", "scheduled_hours":8, "id":"painting",
            "equipment_id":"Камера-02", "stop_minutes":60, "horizon_minutes":480,
        })
        self.assertGreater(painting_stop["lost_good_units"], 0)
        self.assertLess(painting_stop["scenario"]["good_units"], painting_stop["baseline"]["good_units"])
        self.assertAlmostEqual(painting_stop["scenario"]["stages"][1]["effective_capacity_units"], 116 * 0.875)
        self.assertFalse(painting_stop["threshold"]["exceeded"])

    def test_stop_limit_matches_equipment_total_for_calendar_day(self):
        exact = calculate_stop_scenario(self.case, {
            "date":"2026-10-02", "id":"assembly", "equipment_id":"Конвейер-03",
            "stop_minutes":5, "horizon_minutes":480,
        })
        self.assertEqual(exact["threshold"]["equipment_prior_minutes"], 55)
        self.assertEqual(exact["threshold"]["projected_minutes"], 60)
        self.assertFalse(exact["threshold"]["exceeded"])
        over = calculate_stop_scenario(self.case, {
            "date":"2026-10-02", "id":"assembly", "equipment_id":"Конвейер-03",
            "stop_minutes":6, "horizon_minutes":480,
        })
        self.assertEqual(over["threshold"]["projected_minutes"], 61)
        self.assertTrue(over["threshold"]["exceeded"])
        self.assertEqual(over["threshold"]["scope"], "equipment_per_calendar_day")

    def test_zero_output_runtime_and_full_stop_are_supported(self):
        case = {**self.case, "production": [dict(row) for row in self.case["production"]]}
        for row in case["production"]:
            if row["date"] == "2026-10-02":
                row.update(actual_units=0, defects=0, runtime_hours=0)
        baseline = calculate_stop_scenario(case, {
            "date":"2026-10-02", "id":"painting", "equipment_id":"unknown",
            "stop_minutes":0, "horizon_minutes":480,
        })
        self.assertEqual(baseline["baseline"]["good_units"], 0)
        self.assertEqual(baseline["scenario"]["good_units"], 0)

        stopped = calculate_stop_scenario(self.case, {
            "date":"2026-10-02", "id":"painting", "equipment_id":"Камера-02",
            "stop_minutes":480, "horizon_minutes":480,
        })
        self.assertEqual(stopped["scenario"]["good_units"], 0)
        self.assertTrue(math.isclose(stopped["lost_good_units"], stopped["baseline"]["good_units"]))

    def test_invalid_dates_gaps_ranges_and_known_equipment_mapping_raise(self):
        with self.assertRaises(ValueError):
            build_state(self.case, "2026-10-03")
        incomplete = {**self.case, "production": [row for row in self.case["production"] if not (row["date"] == "2026-10-02" and row["line_id"] == "painting")]}
        with self.assertRaisesRegex(ValueError, "missing line records"):
            build_state(incomplete, "2026-10-02")
        for changes in (
            {"stop_minutes": -1}, {"stop_minutes": 481}, {"horizon_minutes": 1441},
            {"stop_minutes": float("nan")}, {"scheduled_hours": 0},
            {"line_id":"painting", "equipment_id":"ABB-01"},
        ):
            scenario = {"date":"2026-10-01", "scheduled_hours":8, "id":"painting",
                        "equipment_id":"Камера-02", "stop_minutes":10, "horizon_minutes":480}
            scenario.update(changes)
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                calculate_stop_scenario(self.case, scenario)


if __name__ == "__main__":
    unittest.main()
