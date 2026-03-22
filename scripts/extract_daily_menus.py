#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from pypdf import PdfReader

from extract_workout_book import (
    SITE_MARKERS,
    clean_line,
    dedupe_steps,
    detect_rest_seconds,
    detect_rounds,
    detect_score_mode,
    detect_time_cap_seconds,
    extract_pattern_steps_from_text,
    extract_steps_from_segments,
    split_sentences_to_lines,
    title_case_words,
)


SECTION_LABELS = {
    "starters",
    "starter",
    "main course",
    "maincourse",
    "main course ",
    "main",
    "mains",
    "pudding",
}

SKIP_TITLES = {"glossary", "amuse bouche"}

GENERIC_STEP_PATTERNS = [
    re.compile(r"\bwhatever kit you have\b", re.IGNORECASE),
    re.compile(r"\bheavy object\b", re.IGNORECASE),
    re.compile(r"\bremaining fuel\b", re.IGNORECASE),
    re.compile(r"\bfreestyle\b", re.IGNORECASE),
    re.compile(r"\buntil timer", re.IGNORECASE),
    re.compile(r"\bas many as you can\b", re.IGNORECASE),
    re.compile(r"\bgreatest intensity\b", re.IGNORECASE),
    re.compile(r"\bkeep going\b", re.IGNORECASE),
    re.compile(r"\bset a timer\b", re.IGNORECASE),
    re.compile(r"\bchoose a bodyweight exercise\b", re.IGNORECASE),
    re.compile(r"\bcarry the object\b", re.IGNORECASE),
    re.compile(r"\bas a superset\b", re.IGNORECASE),
    re.compile(r"\bsmash out\b", re.IGNORECASE),
    re.compile(r"\bfocus on your form\b", re.IGNORECASE),
    re.compile(r"\bhold it in\b", re.IGNORECASE),
]


def parse_day_number(path: Path) -> int:
    match = re.search(r"day\s*(\d+)", path.stem, re.IGNORECASE)
    if not match:
        raise ValueError(f"Could not determine day number from {path.name}")
    return int(match.group(1))


def normalize_ocr_spacing(text: str) -> str:
    value = text.replace("\u00a0", " ")
    value = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", value)
    value = re.sub(r"(?<=[A-Za-z])(?=\d)", " ", value)
    value = re.sub(r"(?<=\d)(?=[A-Za-z])", " ", value)
    return clean_line(value)


def is_gibberish(text: str) -> bool:
    if not text:
        return True
    if text.count("[") > 6 or text.count("]") > 6:
        return True
    weird = sum(1 for char in text if ord(char) > 127)
    return weird > len(text) * 0.08


def build_segments(text: str) -> list[str]:
    normalized = normalize_ocr_spacing(text)
    normalized = re.sub(r"(?i)\b(hearts|diamonds|clubs|spades)\s*-\s*", ", ", normalized)
    normalized = re.sub(r"(?i)\b(today'?s 21s are:)\s*", "", normalized)
    normalized = re.sub(r"(?i)\brepeat\s*x\s*\d+\b", "", normalized)
    normalized = re.sub(r"(?i)\brest\s*(?:x)?\s*\d+\s*(?:secs?|seconds?|mins?|minutes?)\b", "", normalized)
    return [
        segment.strip(" .,:;-")
        for segment in re.split(r"[,.]|(?<=\d)\s+(?=[A-Z])|(?<=[a-z])\s+(?=\d+\s*x)", normalized)
        if segment.strip(" .,:;-")
    ]


def filter_steps(steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    filtered: list[dict[str, Any]] = []
    order = 1
    for step in steps:
        name = clean_line(step.get("name", ""))
        if not name:
            continue
        if any(pattern.search(name) for pattern in GENERIC_STEP_PATTERNS):
            continue
        lowered = name.lower()
        if lowered in {"standard", "measurement", "measure", "main course", "starters", "pudding"}:
            continue
        if re.search(r"\b\d+\b", name):
            continue
        if re.search(r"\bx\b|\brest\b|\bsecs?\b|\bseconds?\b|\bmeters?\b", lowered):
            continue
        if any(token in lowered for token in ["mobilise", "timer", "failure", "spot", "start again", "record", "standard"]):
            continue
        if len(name.split()) > 6:
            continue
        normalized = dict(step)
        normalized["name"] = title_case_words(name)
        normalized["order"] = order
        filtered.append(normalized)
        order += 1
    return filtered


def parse_section(page_text: str) -> dict[str, Any] | None:
    lines = split_sentences_to_lines(page_text)
    if not lines:
        return None

    filtered_lines = [
        line
        for line in lines
        if line.lower() not in SITE_MARKERS and not re.match(r"^day\s*\d+", line, re.IGNORECASE)
    ]
    if not filtered_lines:
        return None

    title = title_case_words(normalize_ocr_spacing(filtered_lines[0]).strip(" .,:;-"))
    if not title or title.lower() in SKIP_TITLES:
        return None

    body_lines = filtered_lines[1:]
    body_lines = [
        line
        for line in body_lines
        if clean_line(line).lower() not in SECTION_LABELS
    ]
    if not body_lines:
        return {"title": title, "instructions": "", "standard": "", "sequence": []}

    combined = normalize_ocr_spacing(" ".join(body_lines))
    marker_match = re.search(r"(?i)\b(the standard|the measure(?:ment)?)\b", combined)
    if marker_match:
        instructions = clean_line(combined[: marker_match.start()])
        standard = clean_line(combined[marker_match.end() :])
    else:
        instructions = combined
        standard = ""

    segments = build_segments(instructions)
    steps, leftovers = extract_steps_from_segments(segments)
    regex_steps = extract_pattern_steps_from_text(instructions, len(steps) + 1)
    steps = filter_steps(dedupe_steps(steps + regex_steps))

    notes_parts = [segment for segment in leftovers if segment]
    if standard:
        notes_parts.append(f"Standard: {standard}")

    return {
        "title": title,
        "instructions": instructions,
        "standard": standard,
        "notes": " ".join(notes_parts).strip(),
        "sequence": steps,
    }


def extract_daily_menus(input_dir: Path) -> dict[str, Any]:
    workouts: list[dict[str, Any]] = []
    pdf_paths = sorted(input_dir.glob("[Dd][Aa][Yy]*.pdf"), key=parse_day_number)

    for pdf_path in pdf_paths:
        day_number = parse_day_number(pdf_path)
        reader = PdfReader(str(pdf_path))

        sections: list[dict[str, Any]] = []
        combined_text_parts: list[str] = []
        for page_index in range(1, min(len(reader.pages), 5)):
            page_text = (reader.pages[page_index].extract_text() or "").strip()
            if not page_text or is_gibberish(page_text):
                continue
            parsed = parse_section(page_text)
            if not parsed:
                continue
            sections.append(parsed)
            combined_text_parts.extend(part for part in [parsed["instructions"], parsed["standard"]] if part)

        if not sections:
            continue

        title = f"Day {day_number}"

        notes_lines = []
        sequence: list[dict[str, Any]] = []
        order = 1
        for section in sections:
            section_bits = [f"{section['title']}:"]
            if section["instructions"]:
                section_bits.append(section["instructions"])
            if section["standard"]:
                section_bits.append(f"Standard: {section['standard']}")
            notes_lines.append(" ".join(section_bits).strip())

            for step in section["sequence"]:
                normalized = dict(step)
                normalized["order"] = order
                sequence.append(normalized)
                order += 1

        combined_text = " ".join(combined_text_parts)
        workouts.append(
            {
                "number": day_number,
                "title": title,
                "source_page": 2,
                "score_mode": detect_score_mode(combined_text),
                "rounds": detect_rounds(combined_text),
                "rest_between_rounds_seconds": detect_rest_seconds(combined_text),
                "time_cap_seconds": detect_time_cap_seconds(combined_text),
                "notes": "\n".join(notes_lines),
                "sequence": sequence,
            }
        )

    return {
        "source_pdf": str(input_dir),
        "derived_from": str(input_dir),
        "generated_for": "Hevy import batch",
        "source_label": "StrongDad Daily Workouts",
        "workout_count": len(workouts),
        "hevy_folder": "StrongDad Daily Workouts",
        "workouts": workouts,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract StrongDad daily workout PDFs into a Hevy-ready curated batch.")
    parser.add_argument("input_dir", type=Path)
    parser.add_argument("output_json", type=Path)
    args = parser.parse_args()

    payload = extract_daily_menus(args.input_dir)
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
