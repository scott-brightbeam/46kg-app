#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any


REQUIRED_WORKOUT_KEYS = {
    "number",
    "title_raw",
    "title",
    "source_page",
    "instructions",
    "instruction_lines",
    "hevy_folder",
    "hevy_notes",
    "score_mode",
    "rounds",
    "rest_seconds",
    "time_cap_seconds",
    "candidate_exercises",
    "needs_manual_review",
}

SUSPICIOUS_EXERCISE_PATTERNS = [
    re.compile(r"\brecord\b", re.IGNORECASE),
    re.compile(r"\btime\b", re.IGNORECASE),
    re.compile(r"\bchallenge\b", re.IGNORECASE),
    re.compile(r"\boverall total\b", re.IGNORECASE),
    re.compile(r"\bturn yourself\b", re.IGNORECASE),
    re.compile(r"\bstations of max reps\b", re.IGNORECASE),
    re.compile(r"\bif you\b", re.IGNORECASE),
    re.compile(r"\bonly\b", re.IGNORECASE),
]

SUSPICIOUS_TITLE_PATTERNS = [
    re.compile(r"Don'T", re.IGNORECASE),
    re.compile(r"Moredad", re.IGNORECASE),
    re.compile(r"Tohell", re.IGNORECASE),
    re.compile(r"To Theground", re.IGNORECASE),
    re.compile(r"[A-Za-z]talkabout", re.IGNORECASE),
]


def load_payload(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def find_suspicious_titles(workouts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    findings = []
    for workout in workouts:
        title = workout["title"]
        if any(pattern.search(title) for pattern in SUSPICIOUS_TITLE_PATTERNS):
            findings.append(
                {
                    "number": workout["number"],
                    "title": title,
                }
            )
    return findings


def find_suspicious_exercises(workouts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    findings = []

    for workout in workouts:
        for exercise in workout["candidate_exercises"]:
            name = exercise["name"]
            if len(name.split()) > 6 or any(pattern.search(name) for pattern in SUSPICIOUS_EXERCISE_PATTERNS):
                findings.append(
                    {
                        "number": workout["number"],
                        "title": workout["title"],
                        "exercise_name": name,
                    }
                )
    return findings


def find_false_negative_manual_flags(workouts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    findings = []

    suspicious_titles = {item["number"] for item in find_suspicious_titles(workouts)}
    suspicious_exercises = {}
    for item in find_suspicious_exercises(workouts):
        suspicious_exercises.setdefault(item["number"], []).append(item["exercise_name"])

    for workout in workouts:
        if workout["needs_manual_review"]:
            continue

        if workout["number"] in suspicious_titles or workout["number"] in suspicious_exercises:
            findings.append(
                {
                    "number": workout["number"],
                    "title": workout["title"],
                    "suspicious_exercises": suspicious_exercises.get(workout["number"], []),
                    "suspicious_title": workout["number"] in suspicious_titles,
                }
            )

    return findings


def validate_payload(payload: dict[str, Any]) -> dict[str, Any]:
    workouts = payload.get("workouts", [])
    numbers = [workout["number"] for workout in workouts]
    missing_numbers = [number for number in range(1, 51) if number not in numbers]
    duplicate_numbers = sorted({number for number in numbers if numbers.count(number) > 1})

    missing_key_findings = []
    for workout in workouts:
        missing = sorted(REQUIRED_WORKOUT_KEYS.difference(workout.keys()))
        if missing:
            missing_key_findings.append(
                {
                    "number": workout.get("number"),
                    "missing_keys": missing,
                }
            )

    empty_exercise_findings = [
        {
            "number": workout["number"],
            "title": workout["title"],
        }
        for workout in workouts
        if len(workout["candidate_exercises"]) == 0
    ]

    suspicious_titles = find_suspicious_titles(workouts)
    suspicious_exercises = find_suspicious_exercises(workouts)
    false_negative_manual_flags = find_false_negative_manual_flags(workouts)

    manual_review_count = sum(1 for workout in workouts if workout["needs_manual_review"])

    passes = (
        payload.get("workout_count") == 50
        and len(workouts) == 50
        and not missing_numbers
        and not duplicate_numbers
        and not missing_key_findings
    )

    return {
        "passes_core_structure": passes,
        "workout_count_declared": payload.get("workout_count"),
        "workout_count_actual": len(workouts),
        "manual_review_count": manual_review_count,
        "duplicate_pages_skipped": payload.get("duplicate_pages_skipped", []),
        "missing_numbers": missing_numbers,
        "duplicate_numbers": duplicate_numbers,
        "missing_key_findings": missing_key_findings,
        "empty_exercise_findings": empty_exercise_findings,
        "suspicious_titles": suspicious_titles,
        "suspicious_exercises": suspicious_exercises,
        "false_negative_manual_flags": false_negative_manual_flags,
        "ready_for_auto_import_count": sum(1 for workout in workouts if not workout["needs_manual_review"]),
    }


def to_markdown(report: dict[str, Any], source_json_path: Path) -> str:
    lines = [
        "# StrongDad 50 Validation",
        "",
        f"- Source JSON: `{source_json_path}`",
        f"- Core structure pass: `{report['passes_core_structure']}`",
        f"- Workout count: `{report['workout_count_actual']}`",
        f"- Manual review count: `{report['manual_review_count']}`",
        f"- Ready for auto-import count: `{report['ready_for_auto_import_count']}`",
        "",
        "## Key findings",
        "",
        f"- Missing workout numbers: `{report['missing_numbers']}`",
        f"- Duplicate workout numbers: `{report['duplicate_numbers']}`",
        f"- Duplicate pages skipped: `{report['duplicate_pages_skipped']}`",
        f"- Workouts with no candidate exercises: `{len(report['empty_exercise_findings'])}`",
        f"- Suspicious titles: `{len(report['suspicious_titles'])}`",
        f"- Suspicious exercise names: `{len(report['suspicious_exercises'])}`",
        f"- Likely false negatives on `needs_manual_review`: `{len(report['false_negative_manual_flags'])}`",
        "",
        "## Suspicious titles",
        "",
    ]

    if report["suspicious_titles"]:
        for item in report["suspicious_titles"]:
            lines.append(f"- `{item['number']}` {item['title']}")
    else:
        lines.append("- None")

    lines.extend(["", "## False negatives on manual review", ""])

    if report["false_negative_manual_flags"]:
        for item in report["false_negative_manual_flags"]:
            lines.append(
                f"- `{item['number']}` {item['title']} "
                f"(suspicious title: `{item['suspicious_title']}`, "
                f"suspicious exercises: `{item['suspicious_exercises']}`)"
            )
    else:
        lines.append("- None")

    lines.extend(["", "## Workouts with empty candidate exercises", ""])

    if report["empty_exercise_findings"]:
        for item in report["empty_exercise_findings"]:
            lines.append(f"- `{item['number']}` {item['title']}")
    else:
        lines.append("- None")

    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_path", type=Path)
    parser.add_argument("--json-output", type=Path)
    parser.add_argument("--markdown-output", type=Path)
    args = parser.parse_args()

    payload = load_payload(args.input_path)
    report = validate_payload(payload)

    if args.json_output:
        args.json_output.parent.mkdir(parents=True, exist_ok=True)
        args.json_output.write_text(json.dumps(report, indent=2, ensure_ascii=True) + "\n")

    if args.markdown_output:
        args.markdown_output.parent.mkdir(parents=True, exist_ok=True)
        args.markdown_output.write_text(to_markdown(report, args.input_path))

    print(json.dumps(report, indent=2, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
