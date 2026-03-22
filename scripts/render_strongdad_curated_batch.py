#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def render_step(step: dict) -> str:
    parts = [step["name"]]
    if step.get("reps") is not None:
        parts.append(f"x{step['reps']}")
    if step.get("distance_meters") is not None:
        parts.append(f"{step['distance_meters']}m")
    if step.get("duration_seconds") is not None:
        parts.append(f"{step['duration_seconds']}s")
    if step.get("notes"):
        parts.append(f"({step['notes']})")
    return " ".join(parts)


def render(payload: dict, source_path: Path) -> str:
    lines = [
        "# StrongDad Curated First Batch",
        "",
        f"- Source JSON: `{source_path}`",
        f"- Workout count: `{payload['workout_count']}`",
        f"- Hevy folder: `{payload['hevy_folder']}`",
        "",
    ]

    for workout in payload["workouts"]:
        lines.append(f"## {workout['number']}. {workout['title']}")
        lines.append("")
        lines.append(f"- Score mode: `{workout['score_mode']}`")
        lines.append(f"- Rounds: `{workout['rounds']}`")
        lines.append(f"- Rest between rounds: `{workout['rest_between_rounds_seconds']}`")
        lines.append(f"- Time cap: `{workout['time_cap_seconds']}`")
        lines.append(f"- Notes: {workout['notes']}")
        lines.append("- Sequence:")
        for step in workout["sequence"]:
            lines.append(f"  - `{step['order']}` {render_step(step)}")
        lines.append("")

    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_path", type=Path)
    parser.add_argument("output_path", type=Path)
    args = parser.parse_args()

    payload = json.loads(args.input_path.read_text())
    args.output_path.parent.mkdir(parents=True, exist_ok=True)
    args.output_path.write_text(render(payload, args.input_path))
    print(str(args.output_path))
    return 0


if __name__ == "__main__":
    sys.exit(main())
