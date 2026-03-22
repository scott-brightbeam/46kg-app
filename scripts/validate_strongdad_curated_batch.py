#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


REQUIRED_WORKOUT_KEYS = {
    "number",
    "title",
    "source_page",
    "score_mode",
    "rounds",
    "rest_between_rounds_seconds",
    "time_cap_seconds",
    "notes",
    "sequence",
}

ALLOWED_SCORE_MODES = {
    "for_time",
    "time_cap",
    "fixed_duration",
    "for_completion",
}


def validate(payload: dict[str, Any]) -> dict[str, Any]:
    workouts = payload.get("workouts", [])
    missing_keys = []
    bad_steps = []
    duplicate_numbers = sorted({w["number"] for w in workouts if [x["number"] for x in workouts].count(w["number"]) > 1})

    for workout in workouts:
        missing = sorted(REQUIRED_WORKOUT_KEYS.difference(workout.keys()))
        if missing:
            missing_keys.append({"number": workout.get("number"), "missing_keys": missing})

        if workout["score_mode"] not in ALLOWED_SCORE_MODES:
            bad_steps.append({"number": workout["number"], "problem": f"invalid score_mode {workout['score_mode']}"})

        if not workout["sequence"]:
            bad_steps.append({"number": workout["number"], "problem": "empty sequence"})

        for step in workout["sequence"]:
            if not step.get("name"):
                bad_steps.append({"number": workout["number"], "problem": "step missing name", "step": step})
                continue

            has_metric = any(
                step.get(key) is not None for key in ("reps", "distance_meters", "duration_seconds")
            )
            if not has_metric:
                bad_steps.append(
                    {"number": workout["number"], "problem": "step missing reps/distance/duration", "step": step}
                )

    rep_steps = 0
    distance_steps = 0
    duration_steps = 0
    for workout in workouts:
        for step in workout["sequence"]:
            if step.get("reps") is not None:
                rep_steps += 1
            if step.get("distance_meters") is not None:
                distance_steps += 1
            if step.get("duration_seconds") is not None:
                duration_steps += 1

    return {
        "passes": not missing_keys and not bad_steps and not duplicate_numbers,
        "workout_count": len(workouts),
        "duplicate_numbers": duplicate_numbers,
        "missing_keys": missing_keys,
        "issues": bad_steps,
        "rep_steps": rep_steps,
        "distance_steps": distance_steps,
        "duration_steps": duration_steps,
    }


def markdown(report: dict[str, Any], source_path: Path) -> str:
    lines = [
        "# StrongDad Curated Batch Validation",
        "",
        f"- Source JSON: `{source_path}`",
        f"- Passes: `{report['passes']}`",
        f"- Workout count: `{report['workout_count']}`",
        f"- Rep steps: `{report['rep_steps']}`",
        f"- Distance steps: `{report['distance_steps']}`",
        f"- Duration steps: `{report['duration_steps']}`",
        f"- Duplicate numbers: `{report['duplicate_numbers']}`",
        "",
        "## Issues",
        "",
    ]

    if report["issues"] or report["missing_keys"]:
        for item in report["missing_keys"]:
            lines.append(f"- Workout `{item['number']}` missing keys: `{item['missing_keys']}`")
        for item in report["issues"]:
            lines.append(f"- Workout `{item['number']}` issue: `{item['problem']}`")
    else:
        lines.append("- None")

    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_path", type=Path)
    parser.add_argument("--json-output", type=Path)
    parser.add_argument("--markdown-output", type=Path)
    args = parser.parse_args()

    payload = json.loads(args.input_path.read_text())
    report = validate(payload)

    if args.json_output:
        args.json_output.parent.mkdir(parents=True, exist_ok=True)
        args.json_output.write_text(json.dumps(report, indent=2, ensure_ascii=True) + "\n")

    if args.markdown_output:
        args.markdown_output.parent.mkdir(parents=True, exist_ok=True)
        args.markdown_output.write_text(markdown(report, args.input_path))

    print(json.dumps(report, indent=2, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
