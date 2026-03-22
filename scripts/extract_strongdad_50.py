#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from pypdf import PdfReader
except ImportError as exc:
    raise SystemExit(
        "pypdf is required. Activate the local virtualenv first: "
        "source .venv/bin/activate && pip install pypdf"
    ) from exc


META_LINE_PATTERNS = [
    re.compile(r"^NO\.\s*\d+$", re.IGNORECASE),
    re.compile(r"^RECORD (?:YOUR|THE) ", re.IGNORECASE),
    re.compile(r"^MARK (?:DOWN )?(?:YOURSELF|YOUR|THE) ", re.IGNORECASE),
    re.compile(r"^SET (?:UP|THE CLOCK|A CLOCK)", re.IGNORECASE),
    re.compile(r"^(?:TURN YOURSELF INTO A GOD|DON'T BE SICK\.?|HAVE FUN\.?)$", re.IGNORECASE),
]

ROUND_PATTERN = re.compile(r"\b(?:(\d+)\s*[Xx]\s*)?(\d+)\s*(SECONDS?|MINUTES?)\s+ROUNDS?\b", re.IGNORECASE)
REST_PATTERN = re.compile(r"\b(\d+)(?:-(\d+))?\s*[- ]?(SECONDS?|MINUTES?)\s+REST\b", re.IGNORECASE)
TIME_CAP_PATTERN = re.compile(r"\bWITHIN A (\d+)\s*(SECONDS?|MINUTES?)\s+TIME LIMIT\b", re.IGNORECASE)
AMRAP_PATTERN = re.compile(r"\b(?:AS MANY AS YOU CAN|MAX REPS)\b", re.IGNORECASE)
TIME_PATTERN = re.compile(r"\b(?:RECORD|MARK DOWN)\s+(?:YOUR\s+)?TIME\b", re.IGNORECASE)
MAX_DISTANCE_PATTERN = re.compile(r"\bDISTANCE COVERED\b", re.IGNORECASE)

REPS_LINE = re.compile(r"^(\d+)\s+(.+)$")
DISTANCE_LINE = re.compile(r"^(\d+)\s*(M|METER|METERS)\s+(.+)$", re.IGNORECASE)
ROUNDS_LINE = re.compile(r"^(\d+)\s+ROUNDS?\.?$", re.IGNORECASE)


@dataclass
class HevyExerciseDraft:
    name: str
    rep_target: int | None = None
    distance_meters: int | None = None
    duration_seconds: int | None = None
    notes: str | None = None


def normalize_pdf_text(text: str) -> str:
    text = text.replace("\xa0", " ")
    text = text.replace("\u2019", "'")
    text = text.replace("\u2018", "'")
    text = text.replace("\u201c", '"')
    text = text.replace("\u201d", '"')
    text = text.replace("\u2013", "-")
    text = text.replace("\u2014", "-")
    text = re.sub(r"(?<!\n)(NO\.\s*\d+)", r"\n\1", text)
    text = re.sub(r"\b([A-Z])\s+([A-Z]{2,})\b", r"\1\2", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    return text.strip()


def normalize_title(raw: str) -> str:
    raw = raw.strip().replace(",", ", ")
    raw = re.sub(r"\s+", " ", raw)
    raw = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", raw)
    raw = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", " ", raw)
    return raw.title()


def clean_exercise_name(name: str) -> str:
    name = name.strip(" .")
    name = re.sub(r"\s*&\s*", " and ", name)
    name = re.sub(r"\s+", " ", name)
    return name.title()


def is_meta_line(line: str) -> bool:
    if not line:
        return True

    upper = line.upper()
    if upper in {"ONLY FULL REPS COUNT.", ".", "REPEAT 5 TIMES"}:
        return True

    return any(pattern.search(line) for pattern in META_LINE_PATTERNS)


def parse_duration_seconds(amount: str, unit: str) -> int:
    value = int(amount)
    return value * 60 if unit.upper().startswith("MINUTE") else value


def infer_score_mode(instructions: str) -> str:
    if TIME_PATTERN.search(instructions):
        return "for_time"
    if MAX_DISTANCE_PATTERN.search(instructions):
        return "max_distance"
    if AMRAP_PATTERN.search(instructions):
        return "max_reps"
    return "notes_only"


def infer_structure(lines: list[str], instructions: str) -> dict[str, Any]:
    rounds = None
    rest_seconds = None
    time_cap_seconds = None

    rounds_match = ROUND_PATTERN.search(instructions)
    if rounds_match:
        rounds = int(rounds_match.group(1) or rounds_match.group(2))

    rest_match = REST_PATTERN.search(instructions)
    if rest_match:
        low = int(rest_match.group(1))
        high = int(rest_match.group(2)) if rest_match.group(2) else low
        unit = rest_match.group(3)
        rest_seconds = {
            "min": parse_duration_seconds(str(low), unit),
            "max": parse_duration_seconds(str(high), unit),
        }

    time_cap_match = TIME_CAP_PATTERN.search(instructions)
    if time_cap_match:
        time_cap_seconds = parse_duration_seconds(time_cap_match.group(1), time_cap_match.group(2))

    if rounds is None:
        for line in lines:
            match = ROUNDS_LINE.match(line)
            if match:
                rounds = int(match.group(1))
                break

    return {
        "rounds": rounds,
        "rest_seconds": rest_seconds,
        "time_cap_seconds": time_cap_seconds,
        "score_mode": infer_score_mode(instructions),
    }


def extract_exercises(lines: list[str]) -> list[HevyExerciseDraft]:
    exercises: list[HevyExerciseDraft] = []
    pending_interval_seconds: int | None = None
    seen = set()

    for raw_line in lines:
        line = raw_line.strip(" .")
        if not line or is_meta_line(line):
            continue

        if line.upper().endswith("OF:"):
            duration_match = re.match(r"^(\d+)\s*(SECONDS?|MINUTES?)\s+OF:?$", line, re.IGNORECASE)
            if duration_match:
                pending_interval_seconds = parse_duration_seconds(
                    duration_match.group(1), duration_match.group(2)
                )
            continue

        distance_match = DISTANCE_LINE.match(line)
        if distance_match:
            distance = int(distance_match.group(1))
            name = clean_exercise_name(distance_match.group(3))
            key = ("distance", distance, name)
            if key not in seen:
                exercises.append(
                    HevyExerciseDraft(
                        name=name,
                        distance_meters=distance,
                        notes=f"Extracted from line: {line}",
                    )
                )
                seen.add(key)
            continue

        reps_match = REPS_LINE.match(line)
        if reps_match:
            count = int(reps_match.group(1))
            name = clean_exercise_name(reps_match.group(2))
            if name and not name.upper().startswith("ROUNDS"):
                key = ("reps", count, name)
                if key not in seen:
                    exercises.append(
                        HevyExerciseDraft(
                            name=name,
                            rep_target=count,
                            notes=f"Extracted from line: {line}",
                        )
                    )
                    seen.add(key)
                continue

        if line.isupper() and len(line.split()) <= 8 and not any(ch.isdigit() for ch in line):
            name = clean_exercise_name(line)
            key = ("name", name, pending_interval_seconds)
            if key not in seen:
                exercises.append(
                    HevyExerciseDraft(
                        name=name,
                        duration_seconds=pending_interval_seconds,
                        notes="Likely exercise name extracted from all-caps line.",
                    )
                )
                seen.add(key)
            pending_interval_seconds = None

    return exercises


def parse_workout_page(page_number: int, text: str) -> dict[str, Any] | None:
    normalized = normalize_pdf_text(text)
    if not normalized or "NO." not in normalized:
        return None

    lines = [line.strip() for line in normalized.splitlines() if line.strip()]

    workout_number = None
    title_raw = None
    title_index = None
    instruction_stop_idx = None

    for idx in range(len(lines) - 1, -1, -1):
        line = lines[idx]
        match = re.match(r"^NO\.\s*(\d+)$", line, re.IGNORECASE)
        embedded_match = re.match(r"^(.*?)\s*NO\.\s*(\d+)$", line, re.IGNORECASE)

        if match:
            workout_number = int(match.group(1))
            title_index = idx + 1
            instruction_stop_idx = idx
            if title_index < len(lines):
                title_raw = lines[title_index]
            break

        if embedded_match:
            prefix = embedded_match.group(1).strip()
            workout_number = int(embedded_match.group(2))
            if prefix:
                lines[idx] = prefix
            else:
                lines = lines[:idx] + lines[idx + 1 :]
            title_index = idx + 1
            instruction_stop_idx = idx + 1 if prefix else idx
            if title_index < len(lines):
                title_raw = lines[title_index]
            break

    if workout_number is None or title_raw is None:
        return None

    instruction_lines = lines[: instruction_stop_idx]
    instructions = "\n".join(instruction_lines).strip()
    heuristics = infer_structure(instruction_lines, instructions)
    exercises = extract_exercises(instruction_lines)
    score_mode = heuristics["score_mode"]

    return {
        "number": workout_number,
        "title_raw": title_raw,
        "title": normalize_title(title_raw),
        "source_page": page_number,
        "instructions": instructions,
        "instruction_lines": instruction_lines,
        "hevy_folder": "StrongDad 50",
        "hevy_notes": instructions,
        "score_mode": score_mode,
        "rounds": heuristics["rounds"],
        "rest_seconds": heuristics["rest_seconds"],
        "time_cap_seconds": heuristics["time_cap_seconds"],
        "candidate_exercises": [asdict(exercise) for exercise in exercises],
        "needs_manual_review": len(exercises) == 0 or score_mode == "notes_only",
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf_path", type=Path)
    parser.add_argument("output_path", type=Path)
    args = parser.parse_args()

    reader = PdfReader(str(args.pdf_path))
    workouts = []
    duplicates: list[dict[str, Any]] = []
    seen_numbers: set[int] = set()

    for index, page in enumerate(reader.pages, start=1):
        parsed = parse_workout_page(index, page.extract_text() or "")
        if parsed:
            if parsed["number"] in seen_numbers:
                duplicates.append(
                    {
                        "number": parsed["number"],
                        "source_page": parsed["source_page"],
                        "title_raw": parsed["title_raw"],
                    }
                )
                continue

            seen_numbers.add(parsed["number"])
            workouts.append(parsed)

    workouts.sort(key=lambda workout: workout["number"])

    payload = {
        "source_pdf": str(args.pdf_path),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "workout_count": len(workouts),
        "duplicate_pages_skipped": duplicates,
        "workouts": workouts,
    }

    args.output_path.parent.mkdir(parents=True, exist_ok=True)
    args.output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n")

    print(
        json.dumps(
            {
                "output_path": str(args.output_path),
                "workout_count": len(workouts),
                "manual_review_count": sum(1 for workout in workouts if workout["needs_manual_review"]),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
