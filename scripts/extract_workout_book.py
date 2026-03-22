from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

from pypdf import PdfReader


SITE_MARKERS = ("www.strongdad.co.uk", "strongdad.co.uk")


def clean_line(value: str) -> str:
    return " ".join(value.replace("\u00a0", " ").split()).strip()


def split_sentences_to_lines(text: str) -> list[str]:
    raw_lines = [clean_line(line) for line in text.splitlines()]
    return [line for line in raw_lines if line and line.lower() not in SITE_MARKERS]


def looks_like_title_fragment(line: str) -> bool:
    if len(line) > 36:
        return False
    if re.search(r"\b(standard|workout|repeat|rest|minute|meter|secs?|seconds?)\b", line, re.I):
        return False
    return True


def title_case_words(value: str) -> str:
    words = []
    for word in re.split(r"\s+", value.strip()):
        if not word:
            continue
        if word.isupper() and len(word) > 1:
            words.append(word.capitalize())
        else:
            words.append(word[0].upper() + word[1:] if len(word) > 1 else word.upper())
    return " ".join(words)


def normalize_step_name(name: str) -> str:
    cleaned = clean_line(name)
    cleaned = cleaned.strip(" .,:;")
    replacements = {
        "push ups": "Push Up",
        "push-ups": "Push Up",
        "press ups": "Push Up",
        "press-ups": "Push Up",
        "mountain climbers": "Mountain Climber",
        "sit ups": "Sit Up",
        "sit-ups": "Sit Up",
        "burpees": "Burpee",
        "lunges": "Lunge",
        "crunches": "Crunch",
        "chins": "Chin Up",
        "chin-ups": "Chin Up",
        "pull ups": "Pull Up",
        "pull-ups": "Pull Up",
        "inverted pull ups": "Inverted Row",
        "inverted rows": "Inverted Row",
        "star jumps": "Star Jump",
        "rows": "Row",
    }
    lowered = cleaned.lower()
    if lowered in replacements:
        return replacements[lowered]
    return title_case_words(cleaned)


def parse_numeric_step(segment: str, order: int) -> dict[str, Any] | None:
    text = clean_line(segment)
    if not text:
        return None

    lowered = text.lower()
    if lowered.startswith("rest") or lowered.startswith("repeat") or lowered.startswith("the standard"):
        return None

    if "until failure" in lowered:
        name = re.sub(r"until failure", "", text, flags=re.I).strip(" .,:;")
        return {
            "order": order,
            "name": normalize_step_name(name),
            "reps": 1,
            "notes": "Until failure."
        }

    if "max reps" in lowered:
        name = re.sub(r"max reps?", "", text, flags=re.I).strip(" .,:;")
        return {
            "order": order,
            "name": normalize_step_name(name),
            "reps": 1,
            "notes": "Max reps."
        }

    if match := re.match(r"(?i)^(\d+)\s*[xX]\s*(\d+)\s*(?:meters?|m)\s+(.+)$", text):
        rounds, meters, name = match.groups()
        return {
            "order": order,
            "name": normalize_step_name(name),
            "distance_meters": int(meters),
            "notes": f"{rounds} sets."
        }

    if match := re.match(r"(?i)^(\d+)\s*[xX]\s*(.+)$", text):
        reps, name = match.groups()
        if re.search(r"\bmin\b|\bminute\b", name, re.I):
            return None
        return {
            "order": order,
            "name": normalize_step_name(name),
            "reps": int(reps)
        }

    if match := re.match(r"(?i)^(\d+)\s*(?:secs?|seconds?)\s*[xX]\s*(.+)$", text):
        seconds, name = match.groups()
        return {
            "order": order,
            "name": normalize_step_name(name),
            "duration_seconds": int(seconds)
        }

    if match := re.match(r"(?i)^(\d+)\s*(?:meters?|m)\s+(.+)$", text):
        meters, name = match.groups()
        return {
            "order": order,
            "name": normalize_step_name(name),
            "distance_meters": int(meters)
        }

    if match := re.match(r"(?i)^(\d+)\s+(.+)$", text):
        reps, name = match.groups()
        if re.search(r"\bkg\b", name, re.I):
            return None
        if re.search(r"\b(min|mins|minute|minutes)\b", name, re.I):
            return None
        return {
            "order": order,
            "name": normalize_step_name(name),
            "reps": int(reps)
        }

    if match := re.match(r"(?i)^(.+?)\s+(\d+)\s*(?:meters?|m)$", text):
        name, meters = match.groups()
        return {
            "order": order,
            "name": normalize_step_name(name),
            "distance_meters": int(meters)
        }

    if match := re.match(r"(?i)^(.+?)\s+(\d+)\s*(?:secs?|seconds?)$", text):
        name, seconds = match.groups()
        return {
            "order": order,
            "name": normalize_step_name(name),
            "duration_seconds": int(seconds)
        }

    return None


def dedupe_steps(steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[Any, ...]] = set()
    deduped: list[dict[str, Any]] = []
    order = 1
    for step in steps:
        key = (
            step.get("name"),
            step.get("reps"),
            step.get("distance_meters"),
            step.get("duration_seconds"),
            step.get("notes"),
        )
        if key in seen:
            continue
        seen.add(key)
        normalized = dict(step)
        normalized["order"] = order
        deduped.append(normalized)
        order += 1
    return deduped


def extract_pattern_steps_from_text(text: str, starting_order: int) -> list[dict[str, Any]]:
    normalized = clean_line(text)
    normalized = re.sub(r"(?<=[a-z)])(?=\d)", " ", normalized)
    patterns = [
        (
            re.compile(
                r"(?i)(\d+)\s*(?:x\s*)?(push-?ups?|press-?ups?|burpees?|lunges?|squats?|mountain climbers?|hindu push-?ups?|plank get ups?|chin-?ups?|pull-?ups?|rows?|swings?|press(?:es)?|curls?|crunches?|sit-?ups?|deadlifts?|thrusters?|carries?|flips?|slams?|get-ups?|jogs?|runs?|sprints?|shuttles?)"
            ),
            "reps",
        ),
        (
            re.compile(
                r"(?i)(bear crawl|run backward|runbackward|running|run|jog|shuttle run|shuttles|suitcase carry|farmer(?:s)? carry|sandbag run|sled drag|yoke carry|keg carry|carry)\s*(\d+)\s*(?:meters?|m)"
            ),
            "distance_name_first",
        ),
        (
            re.compile(
                r"(?i)(\d+)\s*(?:meters?|m)\s*(tyre flips?|keg carry|sandbag carry|carry|run|jog|shuttle run|shuttles|sprint|sled drag|lunges?|incline carries?)"
            ),
            "distance_amount_first",
        ),
        (
            re.compile(
                r"(?i)(\d+)\s*(?:secs?|seconds?)\s*(battle ropes?|hammer holds?|high knees?|plank|plank holds?)"
            ),
            "duration",
        ),
    ]

    results: list[dict[str, Any]] = []
    order = starting_order
    for pattern, kind in patterns:
        for match in pattern.finditer(normalized):
            if kind == "reps":
                reps, name = match.groups()
                results.append(
                    {
                        "order": order,
                        "name": normalize_step_name(name),
                        "reps": int(reps),
                    }
                )
            elif kind == "distance_name_first":
                name, meters = match.groups()
                results.append(
                    {
                        "order": order,
                        "name": normalize_step_name(name),
                        "distance_meters": int(meters),
                    }
                )
            elif kind == "distance_amount_first":
                meters, name = match.groups()
                results.append(
                    {
                        "order": order,
                        "name": normalize_step_name(name),
                        "distance_meters": int(meters),
                    }
                )
            elif kind == "duration":
                seconds, name = match.groups()
                results.append(
                    {
                        "order": order,
                        "name": normalize_step_name(name),
                        "duration_seconds": int(seconds),
                    }
                )
            order += 1

    return dedupe_steps(results)


def extract_steps_from_segments(segments: list[str]) -> tuple[list[dict[str, Any]], list[str]]:
    steps: list[dict[str, Any]] = []
    leftovers: list[str] = []
    order = 1

    for segment in segments:
        parsed = parse_numeric_step(segment, order)
        if parsed:
            steps.append(parsed)
            order += 1
        else:
            leftovers.append(segment)

    return steps, leftovers


def detect_rounds(text: str) -> int | None:
    if match := re.search(r"(?i)\brepeat\s*x\s*(\d+)", text):
        return int(match.group(1))
    if match := re.search(r"(?i)\b(\d+)\s+sets?\b", text):
        return int(match.group(1))
    if match := re.search(r"(?i)\b(\d+)\s+rounds?\b", text):
        return int(match.group(1))
    return None


def detect_rest_seconds(text: str) -> int | None:
    if match := re.search(r"(?i)\brest\s*(?:x)?\s*(\d+)\s*(?:mins?|minutes?)", text):
        return int(match.group(1)) * 60
    if match := re.search(r"(?i)\brest\s*(?:x)?\s*(\d+)\s*(?:secs?|seconds?)", text):
        return int(match.group(1))
    return None


def detect_time_cap_seconds(text: str) -> int | None:
    if match := re.search(r"(?i)\b(\d+)\s*(?:mins?|minutes?)\b", text):
        return int(match.group(1)) * 60
    return None


def detect_score_mode(notes: str) -> str:
    lowered = notes.lower()
    if "for time" in lowered or "how long" in lowered or "under " in lowered:
        return "for_time"
    if "time limit" in lowered or "set a timer for" in lowered:
        return "time_cap"
    if "every minute on the minute" in lowered or "emom" in lowered:
        return "fixed_duration"
    return "for_completion"


def extract_another_50(pdf_path: Path) -> dict[str, Any]:
    reader = PdfReader(str(pdf_path))
    workouts: list[dict[str, Any]] = []

    for workout_number, page in enumerate(reader.pages[1:51], start=1):
        text = page.extract_text() or ""
        lines = split_sentences_to_lines(text)
        if not lines:
            continue

        title_candidates = [idx for idx, line in enumerate(lines) if re.match(r"^\d{2}(?!/)\s*[A-Za-z]", line)]
        title_parts: list[str] = []
        consumed_title_indices: set[int] = set()
        if title_candidates:
            title_index = title_candidates[-1]
            title_line = lines[title_index]
            title_match = re.match(r"^(\d{2})\s*(.*)$", title_line)
            if title_match and title_match.group(2).strip():
                title_parts.append(title_match.group(2).strip())
            consumed_title_indices.add(title_index)
            next_index = title_index + 1
            while next_index < len(lines) and looks_like_title_fragment(lines[next_index]):
                title_parts.append(lines[next_index])
                consumed_title_indices.add(next_index)
                next_index += 1

        title = title_case_words(" ".join(part for part in title_parts if part))
        content_lines = [line for idx, line in enumerate(lines) if idx not in consumed_title_indices]

        standard_index = next(
            (idx for idx, line in enumerate(content_lines) if line.lower().startswith("the standard") or line.lower().startswith("standard")),
            None
        )
        if standard_index is None:
            body_lines = content_lines
            standard_lines: list[str] = []
        else:
            body_lines = content_lines[:standard_index]
            standard_lines = content_lines[standard_index:]

        steps: list[dict[str, Any]] = []
        leftovers: list[str] = []
        default_reps: int | None = None
        order = 1
        for line in body_lines:
            if match := re.match(r"(?i)^(\d+)\s+reps?\s+of:?$", line):
                default_reps = int(match.group(1))
                continue

            parsed = parse_numeric_step(line, order)
            if parsed:
                steps.append(parsed)
                order += 1
                continue

            if default_reps and looks_like_title_fragment(line):
                steps.append(
                    {
                        "order": order,
                        "name": normalize_step_name(line),
                        "reps": default_reps,
                    }
                )
                order += 1
                continue

            leftovers.append(line)

        regex_steps = extract_pattern_steps_from_text(" ".join(body_lines), order)
        steps = dedupe_steps(steps + regex_steps)
        note_lines = [line for line in leftovers if line]
        note_lines.extend(standard_lines)
        notes = " ".join(note_lines).strip() or "See source page for the original StrongDad workout wording."

        workouts.append(
            {
                "number": workout_number,
                "title": title or f"Workout {workout_number}",
                "source_page": workout_number + 1,
                "score_mode": detect_score_mode(notes),
                "rounds": detect_rounds(" ".join(body_lines + standard_lines)),
                "rest_between_rounds_seconds": detect_rest_seconds(" ".join(body_lines + standard_lines)),
                "time_cap_seconds": detect_time_cap_seconds(" ".join(standard_lines)),
                "notes": notes,
                "sequence": steps,
            }
        )

    return {
        "source_pdf": str(pdf_path),
        "derived_from": str(pdf_path),
        "generated_for": "Hevy import batch",
        "workout_count": len(workouts),
        "hevy_folder": "Another StrongDad 50",
        "workouts": workouts,
    }


def extract_minimalism(pdf_path: Path) -> dict[str, Any]:
    reader = PdfReader(str(pdf_path))
    workouts: list[dict[str, Any]] = []

    for workout_number, page in enumerate(reader.pages[1:32], start=1):
        text = clean_line(page.extract_text() or "")
        if not text:
            continue

        title_match = re.match(r"^(.*?)\s*The workout", text, re.I)
        if not title_match:
            continue

        title = title_case_words(title_match.group(1))

        workout_body_match = re.search(r"The workout(.*?)The standard", text, re.I)
        standard_match = re.search(r"The standard(.*?)Workout\s*#", text, re.I)
        workout_body = clean_line(workout_body_match.group(1)) if workout_body_match else ""
        standard = clean_line(standard_match.group(1)) if standard_match else ""

        workout_body = re.sub(r"(?<=[a-z)])(?=\d)", " ", workout_body)
        segments = [
            segment.strip()
            for segment in re.split(r"[,.&]|(?<=\d)\s+(?=[A-Z])|(?<=[a-z])\s+(?=\d+\s*x)", workout_body)
            if segment.strip()
        ]
        steps, leftovers = extract_steps_from_segments(segments)
        steps = dedupe_steps(steps + extract_pattern_steps_from_text(workout_body, len(steps) + 1))
        notes = " ".join(leftovers + ([f"Standard: {standard}"] if standard else [])).strip()

        workouts.append(
            {
                "number": workout_number,
                "title": title or f"Workout {workout_number}",
                "source_page": workout_number + 1,
                "score_mode": detect_score_mode(f"{workout_body} {standard}"),
                "rounds": detect_rounds(f"{workout_body} {standard}"),
                "rest_between_rounds_seconds": detect_rest_seconds(f"{workout_body} {standard}"),
                "time_cap_seconds": detect_time_cap_seconds(f"{workout_body} {standard}") if "timer" in workout_body.lower() else None,
                "notes": notes or workout_body,
                "sequence": steps,
            }
        )

    return {
        "source_pdf": str(pdf_path),
        "derived_from": str(pdf_path),
        "generated_for": "Hevy import batch",
        "source_label": "StrongDad Minimalism",
        "workout_count": len(workouts),
        "hevy_folder": "StrongDad Minimalism",
        "workouts": workouts,
    }


def extract_conditioning_menu(pdf_path: Path) -> dict[str, Any]:
    reader = PdfReader(str(pdf_path))
    workouts: list[dict[str, Any]] = []

    for page_number, page in enumerate(reader.pages[2:32], start=3):
        text = clean_line(page.extract_text() or "")
        if not text:
            continue

        text = re.sub(r"(?<=[a-z)])(?=\d)", " ", text)
        text = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", text)

        title_match = re.match(r"^(.*?)\s*The workout\b", text, re.I)
        if not title_match:
            continue

        title = title_case_words(title_match.group(1))

        workout_number_match = re.search(r"Workout\s*#\s*(\d+)", text, re.I)
        if not workout_number_match:
            continue
        workout_number = int(workout_number_match.group(1))

        after_workout = re.search(r"The workout(.*?)(?:Workout\s*#\s*\d+|LOCKDOWN$)", text, re.I)
        if not after_workout:
            continue

        content = clean_line(after_workout.group(1))
        content = re.sub(r"(?<=[a-z)])(?=\d)", " ", content)
        content = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", content)

        marker_match = re.search(r"(?i)\b(The standard|The measure|Progression)\b", content)
        if marker_match:
            workout_body = clean_line(content[: marker_match.start()])
            notes = clean_line(content[marker_match.start() :])
        else:
            workout_body = content
            notes = ""

        segments = [
            segment.strip()
            for segment in re.split(r"[,.]|(?<=\d)\s+(?=[A-Z])|(?<=[a-z])\s+(?=\d+\s*x)", workout_body)
            if segment.strip()
        ]
        steps, leftovers = extract_steps_from_segments(segments)
        steps = dedupe_steps(steps + extract_pattern_steps_from_text(workout_body, len(steps) + 1))

        workout_notes = " ".join(leftovers + ([notes] if notes else [])).strip()

        workouts.append(
            {
                "number": workout_number,
                "title": title or f"Workout {workout_number}",
                "source_page": page_number,
                "score_mode": detect_score_mode(f"{workout_body} {notes}"),
                "rounds": detect_rounds(f"{workout_body} {notes}"),
                "rest_between_rounds_seconds": detect_rest_seconds(f"{workout_body} {notes}"),
                "time_cap_seconds": detect_time_cap_seconds(f"{workout_body} {notes}") if "timer" in content.lower() else None,
                "notes": workout_notes or workout_body,
                "sequence": steps,
            }
        )

    workouts.sort(key=lambda workout: int(workout["number"]))

    return {
        "source_pdf": str(pdf_path),
        "derived_from": str(pdf_path),
        "generated_for": "Hevy import batch",
        "source_label": "Strength& Conditioning Menu",
        "workout_count": len(workouts),
        "hevy_folder": "Strength& Conditioning Menu",
        "workouts": workouts,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract StrongDad workout books into curated Hevy batch JSON.")
    parser.add_argument("mode", choices=["another-50", "minimalism", "conditioning-menu"])
    parser.add_argument("input_pdf", type=Path)
    parser.add_argument("output_json", type=Path)
    args = parser.parse_args()

    if args.mode == "another-50":
        payload = extract_another_50(args.input_pdf)
    elif args.mode == "conditioning-menu":
        payload = extract_conditioning_menu(args.input_pdf)
    else:
        payload = extract_minimalism(args.input_pdf)

    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
