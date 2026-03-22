from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def main() -> int:
    parser = argparse.ArgumentParser(description="Filter a curated workout batch down to routines that are safe enough to import.")
    parser.add_argument("input_path", type=Path)
    parser.add_argument("output_path", type=Path)
    parser.add_argument("--require-sequence", action="store_true", default=False)
    parser.add_argument(
        "--include-numbers",
        type=str,
        help="Comma-separated list of workout numbers to keep. If omitted, all workouts that pass the other filters are kept.",
    )
    args = parser.parse_args()

    payload = json.loads(args.input_path.read_text())
    workouts: list[dict[str, Any]] = payload.get("workouts", [])
    include_numbers = None
    if args.include_numbers:
        include_numbers = {int(part.strip()) for part in args.include_numbers.split(",") if part.strip()}

    filtered: list[dict[str, Any]] = []
    for workout in workouts:
        if args.require_sequence and not workout.get("sequence"):
            continue
        if include_numbers is not None and int(workout.get("number")) not in include_numbers:
            continue
        filtered.append(workout)

    output = dict(payload)
    output["workout_count"] = len(filtered)
    output["workouts"] = filtered

    args.output_path.parent.mkdir(parents=True, exist_ok=True)
    args.output_path.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
