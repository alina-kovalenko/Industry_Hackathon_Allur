import math
import unittest

from allur.engine import build_dashboard, load_case, simulate


class EngineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.case = load_case()

    def test_case_transcription_and_monthly_gap(self):
        self.assertEqual(len(self.case["production"]), 6)
        self.assertEqual(len(self.case["downtime"]), 4)
        self.assertEqual(sum(item["units"] for item in self.case["monthly_plan"]), 4800)
        dashboard = build_dashboard(self.case, "2026-10-02")
        self.assertEqual(dashboard["kpis"]["monthly_target"], 5500)
        self.assertTrue(any("4800" in warning and "5500" in warning for warning in dashboard["warnings"]))

    def test_kpi_identity_uses_assembly_and_not_sum_of_serial_stages(self):
        dashboard = build_dashboard(self.case, "2026-10-02")
        kpis = dashboard["kpis"]
        self.assertEqual(kpis["final_output"], 119)
        self.assertEqual(kpis["final_good_output"], 117)
        self.assertEqual(kpis["final_plan"], 120)
        self.assertAlmostEqual(kpis["plan_attainment_pct"], 119 / 120 * 100)
        self.assertAlmostEqual(kpis["defect_pct"], 2 / 119 * 100)
        self.assertEqual(kpis["downtime_minutes"], 85)
        assembly_oee = next(line["oee_pct"] for line in dashboard["lines"] if line["line_id"] == "assembly")
        self.assertAlmostEqual(kpis["oee_pct"], assembly_oee)
        self.assertNotEqual(kpis["final_output"], sum(line["actual_units"] for line in dashboard["lines"]))

    def test_oee_proxy_components_and_downtime_not_subtracted_twice(self):
        dashboard = build_dashboard(self.case, "2026-10-02", scheduled_hours=8)
        welding = next(line for line in dashboard["lines"] if line["line_id"] == "welding")
        expected_availability = 7.2 / 8 * 100
        expected_performance = min(100, 111 / (7.2 / (8 / 120)) * 100)
        expected_quality = 108 / 111 * 100
        self.assertAlmostEqual(welding["availability_pct"], expected_availability)
        self.assertAlmostEqual(welding["performance_pct"], expected_performance)
        self.assertAlmostEqual(welding["quality_pct"], expected_quality)
        self.assertAlmostEqual(welding["oee_pct"], expected_availability * expected_performance * expected_quality / 10000)
        self.assertEqual(welding["runtime_hours"], 7.2)
        self.assertEqual(welding["downtime_minutes"], 30)
        self.assertTrue(any("не вычитается повторно" in assumption for assumption in dashboard["assumptions"]))

    def test_overspeed_is_capped_and_warned(self):
        case = {**self.case, "production": [dict(row) for row in self.case["production"]]}
        assembly = next(row for row in case["production"] if row["date"] == "2026-10-01" and row["line_id"] == "assembly")
        assembly["actual_units"] = 150
        dashboard = build_dashboard(case, "2026-10-01")
        line = next(item for item in dashboard["lines"] if item["line_id"] == "assembly")
        self.assertEqual(line["performance_pct"], 100)
        self.assertTrue(any("выше 100%" in warning for warning in dashboard["warnings"]))

    def test_oee_components_are_capped_before_product(self):
        case = {**self.case, "production": [dict(row) for row in self.case["production"]]}
        assembly = next(row for row in case["production"] if row["date"] == "2026-10-01" and row["line_id"] == "assembly")
        assembly["actual_units"] = 150
        assembly["defects"] = 0
        assembly["runtime_hours"] = 9
        dashboard = build_dashboard(case, "2026-10-01", scheduled_hours=8)
        line = next(item for item in dashboard["lines"] if item["line_id"] == "assembly")
        self.assertEqual((line["availability_pct"], line["performance_pct"], line["quality_pct"], line["oee_pct"]), (100, 100, 100, 100))
        self.assertTrue(any("Доступность" in warning for warning in dashboard["warnings"]))
        self.assertTrue(any("Производительность" in warning for warning in dashboard["warnings"]))

    def test_exact_threshold_is_not_critical_and_daily_equipment_total_is_checked(self):
        case = {**self.case, "downtime": [
            {"date":"2026-10-02","line_id":"welding","equipment":"X","reason":"a","duration_minutes":30,"planned":False},
            {"date":"2026-10-02","line_id":"welding","equipment":"X","reason":"b","duration_minutes":30,"planned":False},
        ]}
        dashboard = build_dashboard(case, "2026-10-02")
        self.assertTrue(all(item["severity"] != "critical" for item in dashboard["incidents"]))
        case["downtime"].append({"date":"2026-10-02","line_id":"welding","equipment":"X","reason":"c","duration_minutes":1,"planned":False})
        dashboard = build_dashboard(case, "2026-10-02")
        downtime_incidents = [item for item in dashboard["incidents"] if item["id"].startswith("2026-10-02-") and item["id"].rsplit("-", 1)[-1].isdigit()]
        self.assertEqual(len(downtime_incidents), 3)
        self.assertTrue(all(item["severity"] == "critical" for item in downtime_incidents))

    def test_critical_status_is_attached_only_to_line_with_over_threshold_equipment(self):
        case = {**self.case, "downtime": [
            {"date":"2026-10-02","line_id":"welding","equipment":"X","reason":"a","duration_minutes":61,"planned":False},
            {"date":"2026-10-02","line_id":"painting","equipment":"Y","reason":"b","duration_minutes":10,"planned":False},
        ]}
        dashboard = build_dashboard(case, "2026-10-02")
        statuses = {line["line_id"]: line["status"] for line in dashboard["lines"]}
        self.assertEqual(statuses["welding"], "critical")
        self.assertNotEqual(statuses["painting"], "critical")

    def test_simulation_zero_change_equals_baseline_and_obeys_serial_bottleneck(self):
        result = simulate(self.case, {"date":"2026-10-01", "downtime_reduction_pct":0,
                                      "defect_reduction_pct":0, "capacity_increase_pct":0,
                                      "working_days":22, "shifts_per_day":2})
        baseline = result["baseline"]
        scenario = result["scenario"]
        self.assertEqual(scenario["daily_good_units"], baseline["daily_good_units"])
        self.assertEqual(scenario["monthly_good_units"], baseline["monthly_good_units"])
        self.assertEqual(result["delta"], {"monthly_good_units": 0, "percent": 0})
        self.assertEqual(baseline["bottleneck"]["line_id"], "painting")
        self.assertTrue(math.isclose(baseline["daily_good_units"], 115 * (111 / 115) * (120 / 121) * 2))
        self.assertNotEqual(baseline["daily_good_units"], (118 + 115 + 121) * 2)

    def test_simulation_scenario_is_bounded_and_monotonic(self):
        base = simulate(self.case, {"date":"2026-10-02", "working_days":22, "shifts_per_day":2})
        improved = simulate(self.case, {"date":"2026-10-02", "downtime_reduction_pct":100,
                                        "defect_reduction_pct":100, "capacity_increase_pct":100,
                                        "working_days":22, "shifts_per_day":2})
        self.assertGreaterEqual(improved["scenario"]["daily_good_units"], base["baseline"]["daily_good_units"])
        self.assertLessEqual(improved["scenario"]["daily_good_units"], 120 * (1 + 1.0) * 2)
        self.assertGreaterEqual(improved["delta"]["percent"], 0)
        self.assertIn(improved["scenario"]["bottleneck"]["line_id"], {"welding", "painting", "assembly"})

    def test_invalid_controls_and_dates_raise_value_error(self):
        with self.assertRaises(ValueError):
            build_dashboard(self.case, "2026-10-03")
        with self.assertRaises(ValueError):
            build_dashboard(self.case, "2026-10-02", scheduled_hours=float("nan"))
        for kwargs in (
            {"capacity_increase_pct": 101}, {"defect_reduction_pct": -1},
            {"downtime_reduction_pct": float("inf")}, {"date": "2026-10-03"},
            {"scheduled_hours": 16, "shifts_per_day": 2},
        ):
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                simulate(self.case, kwargs)

    def test_zero_runtime_zero_output_and_missing_lines_are_handled_explicitly(self):
        case = {**self.case, "production": [dict(row) for row in self.case["production"]]}
        for row in case["production"]:
            if row["date"] == "2026-10-02":
                row["actual_units"] = 0
                row["defects"] = 0
                row["runtime_hours"] = 0
        dashboard = build_dashboard(case, "2026-10-02")
        self.assertEqual(dashboard["kpis"]["final_output"], 0)
        self.assertEqual(dashboard["kpis"]["final_good_output"], 0)
        self.assertEqual(dashboard["kpis"]["oee_pct"], 0)
        result = simulate(case, {"date":"2026-10-02", "shifts_per_day":1})
        self.assertEqual(result["baseline"]["daily_good_units"], 0)
        self.assertEqual(result["scenario"]["daily_good_units"], 0)
        incomplete = {**case, "production": [row for row in case["production"] if not (row["date"] == "2026-10-02" and row["line_id"] == "painting")]}
        with self.assertRaisesRegex(ValueError, "missing line records"):
            build_dashboard(incomplete, "2026-10-02")


if __name__ == "__main__":
    unittest.main()
