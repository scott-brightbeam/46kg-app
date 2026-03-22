#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


SUSPICIOUS_NAME_PATTERNS = [
    re.compile(r"\b(record|time|measure|measurement|standard|challenge)\b", re.IGNORECASE),
    re.compile(r"\b(as many as you can|whatever|freestyle|until timer)\b", re.IGNORECASE),
]


def summarize(payload: dict[str, Any]) -> dict[str, Any]:
    workouts: list[dict[str, Any]] = payload.get("workouts", [])
    numbers = [int(workout["number"]) for workout in workouts]

    rep_steps = 0
    distance_steps = 0
    duration_steps = 0
    suspicious_steps: list[dict[str, Any]] = []
    empty_sequence_numbers: list[int] = []

    for workout in workouts:
        sequence = workout.get("sequence", [])
        if not sequence:
            empty_sequence_numbers.append(int(workout["number"]))
        for step in sequence:
            if isinstance(step.get("reps"), int):
                rep_steps += 1
            if isinstance(step.get("distance_meters"), int):
                distance_steps += 1
            if isinstance(step.get("duration_seconds"), int):
                duration_steps += 1
            name = str(step.get("name", ""))
            if len(name.split()) > 6 or any(pattern.search(name) for pattern in SUSPICIOUS_NAME_PATTERNS):
                suspicious_steps.append(
                    {
                        "number": int(workout["number"]),
                        "title": workout["title"],
                        "name": name,
                    }
                )

    duplicate_numbers = sorted({number for number in numbers if numbers.count(number) > 1})
    issues: list[str] = []
    if payload.get("workout_count") != len(workouts):
        issues.append("Declared workout_count does not match actual workouts length.")
    if duplicate_numbers:
        issues.append(f"Duplicate workout numbers: {duplicate_numbers}")
    if suspicious_steps:
        issues.append(f"Suspicious step names: {len(suspicious_steps)}")
    if empty_sequence_numbers:
        issues.append(f"Workouts with empty sequence: {len(empty_sequence_numbers)}")

    return {
        "summary": {
            "passes": not issues,
            "workout_count": len(workouts),
            "rep_steps": rep_steps,
            "distance_steps": distance_steps,
            "duration_steps": duration_steps,
            "duplicate_numbers": duplicate_numbers,
        },
        "issues": issues,
        "empty_sequence_numbers": empty_sequence_numbers,
        "suspicious_steps": suspicious_steps[:100],
    }


def to_markdown(report: dict[str, Any], source_path: Path) -> str:
    summary = report["summary"]
    lines = [
        "# StrongDad Curated Batch Validation",
        "",
        f"- Source JSON: `{source_path}`",
        f"- Passes: `{summary['passes']}`",
        f"- Workout count: `{summary['workout_count']}`",
        f"- Rep steps: `{summary['rep_steps']}`",
        f"- Distance steps: `{summary['distance_steps']}`",
        f"- Duration steps: `{summary['duration_steps']}`",
        f"- Duplicate numbers: `{summary['duplicate_numbers']}`",
        "",
        "## Issues",
        "",
    ]
    if report["issues"]:
        lines.extend(f"- {issue}" for issue in report["issues"])
    else:
        lines.append("- None")

    if report["empty_sequence_numbers"]:
        lines.extend(["", "## Empty Sequence Numbers", ""])
        lines.append(", ".join(str(number) for number in report["empty_sequence_numbers"]))

    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate a curated StrongDad batch.")
    parser.add_argument("input_path", type=Path)
    parser.add_argument("--json-output", type=Path)
    parser.add_argument("--markdown-output", type=Path)
    parser.add_argument("--allow-duplicate-numbers", action="store_true", default=False)
    args = parser.parse_args()

    payload = json.loads(args.input_path.read_text())
    report = summarize(payload)
    if args.allow_duplicate_numbers:
        report["issues"] = [issue for issue in report["issues"] if not issue.startswith("Duplicate workout numbers:")]
        report["summary"]["passes"] = not report["issues"]

    if args.json_output:
        args.json_output.parent.mkdir(parents=True, exist_ok=True)
        args.json_output.write_text(json.dumps(report, indent=2, ensure_ascii=True) + "\n")

    if args.markdown_output:
        args.markdown_output.parent.mkdir(parents=True, exist_ok=True)
        args.markdown_output.write_text(to_markdown(report, args.input_path), encoding="utf-8")

    print(json.dumps(report, indent=2, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
