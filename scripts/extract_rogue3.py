#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from pypdf import PdfReader

from extract_workout_book import (
    clean_line,
    dedupe_steps,
    detect_rest_seconds,
    detect_rounds,
    detect_score_mode,
    detect_time_cap_seconds,
    extract_pattern_steps_from_text,
    extract_steps_from_segments,
    normalize_step_name,
    title_case_words,
)


BODY_STARTERS = [
    "Download",
    "Grab",
    "Set up",
    "Set a",
    "Set an",
    "Set",
    "Load",
    "Find",
    "Take",
    "Start",
    "Begin",
    "As fast",
    "As you",
    "At least",
    "How heavy",
    "Go heavy",
    "Keep it",
    "Hook up",
    "Work on",
    "This is",
    "Now prepare",
    "Prepare with",
    "You’ll need",
    "You'll need",
    "First",
    "Bodyweight",
    "EMOM",
]

MEASURE_MARKERS = ["The measure:", "The standard:", "The objective:"]
SITE_MARKER = "www.strengthand.com"


def normalize_page_text(text: str) -> str:
    value = text.replace("\u00a0", " ").replace("’", "'").replace("‘", "'")
    value = value.replace("“", '"').replace("”", '"')
    value = re.sub(r"(?<=[A-Z0-9?!#])(?=[A-Z][a-z])", " ", value)
    value = re.sub(r"(?<=[a-z)])(?=\d)", " ", value)
    value = re.sub(r"(?<=\d)(?=[A-Za-z])", " ", value)
    value = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", value)
    value = re.sub(r"\s+", " ", value)
    return clean_line(value.replace(SITE_MARKER, ""))


def split_title_and_body(text: str) -> tuple[str, str]:
    candidates: list[int] = []

    digit_match = re.search(r"(?=\d+\s*(?:x|m|kg|secs?|seconds?|minutes?|mins?))", text, re.I)
    if digit_match:
        candidates.append(digit_match.start())

    for starter in BODY_STARTERS:
        match = re.search(re.escape(starter), text, re.I)
        if match and match.start() > 0:
            candidates.append(match.start())

    if not candidates:
        return title_case_words(text), ""

    split_at = min(candidates)
    return title_case_words(text[:split_at].strip(" .:-")), text[split_at:].strip()


def extract_steps(body: str) -> list[dict[str, Any]]:
    normalized = body
    normalized = normalized.replace("REST & REPEAT", " REST REPEAT ")
    normalized = normalized.replace("REPEATINREVERSE", " REPEAT IN REVERSE ")
    normalized = normalized.replace("REPEATAS", " REPEAT AS ")
    normalized = re.sub(r"(?i)\bREST\s*x\s*(\d+)\s*(secs?|seconds?|mins?|minutes?)", "", normalized)
    normalized = re.sub(r"(?i)\bREPEAT\s*x\s*\d+\b", "", normalized)
    normalized = re.sub(r"(?i)\bAS MANY REPS AS POSSIBLE\b", "", normalized)

    segments = [
        segment.strip(" .,:;")
        for segment in re.split(r"[,.]|(?<=\d)\s+(?=[A-Z])|(?<=[a-z])\s+(?=\d+\s*x)", normalized)
        if segment.strip(" .,:;")
    ]

    steps, leftovers = extract_steps_from_segments(segments)
    regex_steps = extract_pattern_steps_from_text(normalized, len(steps) + 1)
    combined = dedupe_steps(steps + regex_steps)

    cleaned: list[dict[str, Any]] = []
    order = 1
    for step in combined:
        name = step.get("name", "")
        if not name:
            continue
        lowered = str(name).lower()
        if any(
            phrase in lowered
            for phrase in [
                "the measure",
                "the standard",
                "the objective",
                "record your",
                "record both",
                "what weight",
                "how long",
                "how much",
                "how many",
                "complete in",
                "take your time between sets",
                "start light",
                "work up",
                "rest until timer pings",
                "timer to ping",
                "set a timer",
            ]
        ):
            continue
        if len(str(name).split()) > 8:
            continue
        normalized_name = normalize_step_name(str(name))
        cleaned_step = dict(step)
        cleaned_step["name"] = normalized_name
        cleaned_step["order"] = order
        cleaned.append(cleaned_step)
        order += 1

    return cleaned


def extract_rogue3(input_dir: Path) -> dict[str, Any]:
    workouts: list[dict[str, Any]] = []
    running_number = 1

    for pdf_path in sorted(input_dir.glob("ROGUE 3 - WEEK *.pdf")):
        week_match = re.search(r"WEEK\s+(\d+)", pdf_path.stem, re.I)
        week = int(week_match.group(1)) if week_match else None
        reader = PdfReader(str(pdf_path))

        for page_index, page in enumerate(reader.pages[1:], start=2):
            raw = page.extract_text() or ""
            normalized = normalize_page_text(raw)
            if not normalized:
                continue

            marker_positions = [normalized.find(marker) for marker in MEASURE_MARKERS if normalized.find(marker) != -1]
            marker_at = min(marker_positions) if marker_positions else len(normalized)
            body_chunk = normalized[:marker_at].strip()
            notes_chunk = normalized[marker_at:].strip() if marker_at < len(normalized) else ""

            title, body = split_title_and_body(body_chunk)
            body = body.strip()
            sequence = extract_steps(body)
            notes = notes_chunk or body
            if week is not None:
                notes = f"Week {week}. {notes}".strip()

            workouts.append(
                {
                    "number": running_number,
                    "title": title or f"Workout {running_number}",
                    "source_page": page_index,
                    "score_mode": detect_score_mode(f"{body} {notes_chunk}"),
                    "rounds": detect_rounds(f"{body} {notes_chunk}"),
                    "rest_between_rounds_seconds": detect_rest_seconds(f"{body} {notes_chunk}"),
                    "time_cap_seconds": detect_time_cap_seconds(f"{body} {notes_chunk}"),
                    "notes": notes,
                    "sequence": sequence,
                }
            )
            running_number += 1

    return {
        "source_pdf": str(input_dir),
        "derived_from": str(input_dir),
        "generated_for": "Hevy import batch",
        "source_label": "ROGUE 3",
        "workout_count": len(workouts),
        "hevy_folder": "ROGUE 3",
        "workouts": workouts,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract ROGUE 3 weekly PDFs into a curated Hevy batch.")
    parser.add_argument("input_dir", type=Path)
    parser.add_argument("output_json", type=Path)
    args = parser.parse_args()

    payload = extract_rogue3(args.input_dir)
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
