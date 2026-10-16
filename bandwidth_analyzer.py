#!/usr/bin/env python3
"""Estimate Smart Campus link utilization from editable JSON assumptions.

This is an engineering estimate, not a live Packet Tracer telemetry collector.
Only Python's standard library is required.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import sys
from pathlib import Path
from typing import Any

STANDARD_LINK_RATES_MBPS = [10, 100, 1000, 10000, 40000, 100000]


def load_config(path: Path) -> dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except FileNotFoundError as exc:
        raise ValueError(f"Configuration file not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON in {path}: {exc}") from exc

    for key in ("design_endpoint_assumption", "segments", "links", "thresholds"):
        if key not in data:
            raise ValueError(f"Missing required top-level key: {key}")
    if not isinstance(data["segments"], list) or not data["segments"]:
        raise ValueError("'segments' must be a non-empty list")
    if not isinstance(data["links"], list) or not data["links"]:
        raise ValueError("'links' must be a non-empty list")
    return data


def validate_and_calculate(data: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    expected_total = int(data["design_endpoint_assumption"])
    segment_by_key: dict[str, dict[str, Any]] = {}
    segment_rows: list[dict[str, Any]] = []
    total_count = 0

    for segment in data["segments"]:
        for key in ("key", "name", "vlan", "endpoints", "active_fraction", "avg_mbps_per_active_endpoint", "external_fraction"):
            if key not in segment:
                raise ValueError(f"Segment missing required field {key!r}: {segment}")
        key = str(segment["key"])
        if key in segment_by_key:
            raise ValueError(f"Duplicate segment key: {key}")
        count = int(segment["endpoints"])
        active = float(segment["active_fraction"])
        avg_rate = float(segment["avg_mbps_per_active_endpoint"])
        external_fraction = float(segment["external_fraction"])
        if count < 0:
            raise ValueError(f"Segment {key}: endpoints cannot be negative")
        if not (0 <= active <= 1):
            raise ValueError(f"Segment {key}: active_fraction must be between 0 and 1")
        if avg_rate < 0:
            raise ValueError(f"Segment {key}: average rate cannot be negative")
        if not (0 <= external_fraction <= 1):
            raise ValueError(f"Segment {key}: external_fraction must be between 0 and 1")

        offered = count * active * avg_rate
        external = offered * external_fraction
        row = {
            "key": key,
            "name": str(segment["name"]),
            "vlan": str(segment["vlan"]),
            "endpoints": count,
            "active_fraction": active,
            "avg_mbps_per_active_endpoint": avg_rate,
            "estimated_offered_mbps": offered,
            "external_fraction": external_fraction,
            "estimated_external_mbps": external,
        }
        segment_by_key[key] = row
        segment_rows.append(row)
        total_count += count

    if total_count != expected_total:
        raise ValueError(
            f"Segment endpoint counts sum to {total_count}, but design_endpoint_assumption is {expected_total}. "
            "Edit the sample counts or update the design assumption so they match."
        )

    thresholds = data["thresholds"]
    warning_at = float(thresholds.get("warning_utilization_percent", 70))
    critical_at = float(thresholds.get("critical_utilization_percent", 85))
    target_util = float(thresholds.get("target_utilization_percent", 70))
    headroom_factor = float(thresholds.get("headroom_factor", 1.25))
    if not (0 < target_util <= 100):
        raise ValueError("target_utilization_percent must be greater than 0 and at most 100")
    if headroom_factor < 1:
        raise ValueError("headroom_factor should be >= 1.0")

    link_rows: list[dict[str, Any]] = []
    seen_links: set[str] = set()
    for link in data["links"]:
        for key in ("name", "capacity_mbps", "mode", "segment_keys"):
            if key not in link:
                raise ValueError(f"Link missing required field {key!r}: {link}")
        name = str(link["name"])
        if name in seen_links:
            raise ValueError(f"Duplicate link name: {name}")
        seen_links.add(name)
        capacity = float(link["capacity_mbps"])
        if capacity <= 0:
            raise ValueError(f"Link {name}: capacity_mbps must be positive")
        segment_keys = list(link["segment_keys"])
        missing = [item for item in segment_keys if item not in segment_by_key]
        if missing:
            raise ValueError(f"Link {name}: unknown segment keys {missing}")
        mode = str(link["mode"]).lower()
        if mode == "aggregate":
            demand = sum(segment_by_key[item]["estimated_offered_mbps"] for item in segment_keys)
        elif mode == "external":
            demand = sum(segment_by_key[item]["estimated_external_mbps"] for item in segment_keys)
        else:
            raise ValueError(f"Link {name}: mode must be 'aggregate' or 'external'")

        utilization = demand / capacity * 100
        required = demand / (target_util / 100) * headroom_factor
        recommended = next((rate for rate in STANDARD_LINK_RATES_MBPS if rate >= required), STANDARD_LINK_RATES_MBPS[-1])
        if utilization >= critical_at:
            status = "CRITICAL"
        elif utilization >= warning_at:
            status = "WARNING"
        else:
            status = "OK (estimate)"
        link_rows.append({
            "link_name": name,
            "capacity_mbps": capacity,
            "mode": mode,
            "segment_keys": ", ".join(segment_keys),
            "estimated_demand_mbps": demand,
            "estimated_utilization_percent": utilization,
            "target_utilization_percent": target_util,
            "headroom_factor": headroom_factor,
            "required_capacity_with_headroom_mbps": required,
            "next_standard_capacity_mbps": recommended,
            "status": status,
            "notes": str(link.get("notes", "")),
        })

    return segment_rows, link_rows


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="Estimate Smart Campus bandwidth and link utilization from JSON assumptions.")
    parser.add_argument("--config", default="smart_campus_assumptions.json", help="Path to editable JSON input (default: smart_campus_assumptions.json)")
    parser.add_argument("--output", default="bandwidth_results.csv", help="Path for link-results CSV (default: bandwidth_results.csv)")
    parser.add_argument("--segment-output", default="segment_estimates.csv", help="Path for segment-results CSV (default: segment_estimates.csv)")
    args = parser.parse_args()

    try:
        config_path = Path(args.config)
        data = load_config(config_path)
        segment_rows, link_rows = validate_and_calculate(data)
    except (ValueError, OSError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    print("SMART CAMPUS BANDWIDTH ESTIMATE")
    print("=" * 80)
    print(f"Input file: {config_path.resolve()}")
    print(f"Design endpoint assumption: {data['design_endpoint_assumption']}")
    notice = data.get("notice", "")
    if notice:
        print(f"IMPORTANT: {notice}")
    print("\nSEGMENT ESTIMATES")
    print(f"{'Segment':<18} {'VLAN':>5} {'Count':>7} {'Offered Mbps':>15} {'External Mbps':>16}")
    print("-" * 66)
    for row in segment_rows:
        print(f"{row['name']:<18} {row['vlan']:>5} {row['endpoints']:>7} {row['estimated_offered_mbps']:>15.2f} {row['estimated_external_mbps']:>16.2f}")

    print("\nLINK ESTIMATES")
    print(f"{'Link':<42} {'Mbps cap':>9} {'Demand':>10} {'Util %':>9} {'Status':>16} {'Suggested':>12}")
    print("-" * 104)
    for row in link_rows:
        label = row["link_name"]
        if len(label) > 41:
            label = label[:38] + "..."
        print(f"{label:<42} {row['capacity_mbps']:>9.0f} {row['estimated_demand_mbps']:>10.2f} {row['estimated_utilization_percent']:>8.1f}% {row['status']:>16} {row['next_standard_capacity_mbps']:>9.0f} Mbps")
    output_path = Path(args.output)
    segment_output_path = Path(args.segment_output)
    write_csv(output_path, link_rows)
    write_csv(segment_output_path, segment_rows)
    print(f"\nLink results CSV written to: {output_path.resolve()}")
    print(f"Segment estimates CSV written to: {segment_output_path.resolve()}")
    print("Interpretation: outputs are estimates from the JSON assumptions, not measured Packet Tracer throughput.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
