"""Download the pinned public source files into data/external/raw.

Raw research data are deliberately excluded from Git. Every downloaded file is
verified against the repository's source checksum (SHA-256 for Hugging Face,
MD5 as published by Zenodo).
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "external" / "raw"
SOURCES = [
    {
        "name": "mfg005-schema",
        "url": "https://huggingface.co/datasets/xpertsystems/mfg005-sample/resolve/427854b6ec8cddc3f929685d9efd58bfdc2a8af3/MFG_005_main_schema.json",
        "filename": "MFG_005_main_schema.json", "algorithm": "sha256", "checksum": "2706ebb9f670ab41648806ad72f8daa5dac6f1a8b01a267c4c2a49cfc0c32c2b",
        "source": "https://huggingface.co/datasets/xpertsystems/mfg005-sample/tree/427854b6ec8cddc3f929685d9efd58bfdc2a8af3", "license": "CC-BY-NC-4.0",
    },
    {
        "name": "mfg005-readme",
        "url": "https://huggingface.co/datasets/xpertsystems/mfg005-sample/resolve/427854b6ec8cddc3f929685d9efd58bfdc2a8af3/README.md",
        "filename": "MFG_005_README.md", "algorithm": "sha256", "checksum": "ea14982d7fc0d52929f02675b8df410242447a640b8ae6ca5af898357904a162",
        "source": "https://huggingface.co/datasets/xpertsystems/mfg005-sample/tree/427854b6ec8cddc3f929685d9efd58bfdc2a8af3", "license": "CC-BY-NC-4.0",
    },
    {
        "name": "mfg005-sample",
        "url": "https://huggingface.co/datasets/xpertsystems/mfg005-sample/resolve/427854b6ec8cddc3f929685d9efd58bfdc2a8af3/mfg005_synthetic_line_performance.csv",
        "filename": "mfg005_synthetic_line_performance.csv",
        "algorithm": "sha256",
        "checksum": "1a80b39c6e48c5ab38396986da0006c068fd1123e01203c03b8fafcdbb59c155",
        "source": "https://huggingface.co/datasets/xpertsystems/mfg005-sample/tree/427854b6ec8cddc3f929685d9efd58bfdc2a8af3",
        "license": "CC-BY-NC-4.0",
    },
    *[
        {
            "name": f"mfg005-{filename.removesuffix('.csv')}",
            "url": f"https://huggingface.co/datasets/xpertsystems/mfg005-sample/resolve/427854b6ec8cddc3f929685d9efd58bfdc2a8af3/{filename}",
            "filename": filename, "algorithm": "sha256", "checksum": {
                "bottleneck_analysis_report.csv": "d1c5c0074bafb1e4826f998d34fe557889ec2b1da75021ba6eefcf2fb6fd4478",
                "downtime_pareto.csv": "949d2db816f456a20507b142e78998c786021363fe5c9e032ce458c55f8f43b4",
                "oee_summary_by_line.csv": "ab75654afad2995870e86d1e52d13ce9657067d3e913f6119142916c8007fa38",
                "throughput_vs_takt.csv": "aaec2629f2b730e1cab7fe93e9126f3c6f9f1ffdcb7e0ba235a988238020c2fb",
            }[filename],
            "source": "https://huggingface.co/datasets/xpertsystems/mfg005-sample/tree/427854b6ec8cddc3f929685d9efd58bfdc2a8af3", "license": "CC-BY-NC-4.0",
        }
        for filename in ["bottleneck_analysis_report.csv", "downtime_pareto.csv", "oee_summary_by_line.csv", "throughput_vs_takt.csv"]
    ],
    {
        "name": "clay-readme",
        "url": "https://zenodo.org/api/records/17855209/files/README.md/content",
        "filename": "clay_README.md", "algorithm": "md5", "checksum": "8e4ce0f186f162c902f2bf7acf4386bc",
        "source": "https://doi.org/10.5281/zenodo.17855209", "license": "CC-BY-4.0",
    },
    {
        "name": "clay-oee-before",
        "url": "https://zenodo.org/api/records/17855209/files/OEEdataset.csv/content",
        "filename": "clay_OEEdataset.csv",
        "algorithm": "md5",
        "checksum": "f271a9a337fe58f8bc5c9eda2d38f43d",
        "source": "https://doi.org/10.5281/zenodo.17855209",
        "license": "CC-BY-4.0",
    },
    {
        "name": "clay-downtime-before",
        "url": "https://zenodo.org/api/records/17855209/files/DowntimeDataset.csv/content",
        "filename": "clay_DowntimeDataset.csv",
        "algorithm": "md5",
        "checksum": "7b46e04694809a1c510c2ff1c48d0a50",
        "source": "https://doi.org/10.5281/zenodo.17855209",
        "license": "CC-BY-4.0",
    },
    {
        "name": "clay-downtime-after-lss",
        "url": "https://zenodo.org/api/records/17855209/files/DowntimeDataset_afterLSS.csv/content",
        "filename": "clay_DowntimeDataset_afterLSS.csv",
        "algorithm": "md5",
        "checksum": "bb192fb4fccb945f679f85a2c52530e0",
        "source": "https://doi.org/10.5281/zenodo.17855209",
        "license": "CC-BY-4.0",
    },
    {
        "name": "clay-oee-after-lss",
        "url": "https://zenodo.org/api/records/17855209/files/OEEdataset_afterLSS.csv/content",
        "filename": "clay_OEEdataset_afterLSS.csv",
        "algorithm": "md5",
        "checksum": "806676e334595f3914d4646e286473a3",
        "source": "https://doi.org/10.5281/zenodo.17855209",
        "license": "CC-BY-4.0",
    },
    {
        "name": "automotive-inspection-monthly",
        "url": "https://zenodo.org/api/records/17649175/files/(Data%20Set)%20-%20A%20Smart%20Manufacturing%20Approach%20to%20Enhancing%20the%20Reliability%20of%20Visual%20Inspection%20in%20the%20Automotive%20Industry.xlsx/content",
        "filename": "automotive_visual_inspection.xlsx",
        "algorithm": "md5",
        "checksum": "65d668e151891b94fc321a3c0113ab8c",
        "source": "https://doi.org/10.5281/zenodo.17649175",
        "license": "CC-BY-4.0",
    },
]


def digest(data: bytes, algorithm: str) -> str:
    return hashlib.new(algorithm, data).hexdigest()


def download_all() -> list[dict]:
    RAW.mkdir(parents=True, exist_ok=True)
    results = []
    for item in SOURCES:
        target = RAW / item["filename"]
        if not target.exists():
            request = Request(item["url"], headers={"User-Agent": "Allur-MVP-data-fetch/1.0"})
            with urlopen(request, timeout=60) as response:
                payload = response.read()
            actual = digest(payload, item["algorithm"])
            if item["checksum"] and actual.lower() != item["checksum"].lower():
                raise ValueError(f"Checksum mismatch for {item['filename']}: {actual}")
            target.write_bytes(payload)
        payload = target.read_bytes()
        actual = digest(payload, item["algorithm"])
        expected = item["checksum"] or actual
        if item["checksum"] and actual.lower() != item["checksum"].lower():
            raise ValueError(f"Checksum mismatch for cached {item['filename']}: {actual}")
        results.append({**item, "bytes": len(payload), "checksum": expected, "verified": True})
    manifest_path = ROOT / "data" / "external" / "manifest.json"
    manifest_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
    return results


if __name__ == "__main__":
    for record in download_all():
        print(f"{record['name']}: {record['filename']} ({record['bytes']} bytes), verified")
