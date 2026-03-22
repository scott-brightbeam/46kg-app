#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


SOURCE_PDF = "/Users/scott/Documents/Strength&/Content/Lockdown 2/STRENGTH& Conditioning Menu.pdf"


def step(
    name: str,
    *,
    reps: int | None = None,
    duration_seconds: int | None = None,
    distance_meters: int | None = None,
    notes: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"name": name}
    if reps is not None:
        payload["reps"] = reps
    if duration_seconds is not None:
        payload["duration_seconds"] = duration_seconds
    if distance_meters is not None:
        payload["distance_meters"] = distance_meters
    if notes:
        payload["notes"] = notes
    return payload


def workout(
    number: int,
    title: str,
    page: int,
    notes: str,
    sequence: list[dict[str, Any]],
    *,
    score_mode: str = "for_completion",
    rounds: int | None = None,
    rest_between_rounds_seconds: int | None = None,
    time_cap_seconds: int | None = None,
) -> dict[str, Any]:
    normalized_steps: list[dict[str, Any]] = []
    for index, item in enumerate(sequence, start=1):
        normalized = {"order": index, **item}
        normalized_steps.append(normalized)
    return {
        "number": number,
        "title": title,
        "source_page": page,
        "score_mode": score_mode,
        "rounds": rounds,
        "rest_between_rounds_seconds": rest_between_rounds_seconds,
        "time_cap_seconds": time_cap_seconds,
        "notes": notes,
        "sequence": normalized_steps,
    }


def build_payload() -> dict[str, Any]:
    workouts = [
        workout(
            1,
            "Bulgarian Badassary",
            3,
            "Find a bench or chair. Do 10 Bulgarian split squats each leg, then go straight into a 45-second wall sit. Repeat for 5 rounds. Progress by adding reps, hold time, or resistance.",
            [
                step("Bulgarian Split Squat", reps=10, notes="Each leg."),
                step("Wall Sit", duration_seconds=45),
            ],
            rounds=5,
        ),
        workout(
            2,
            "Please Release Me",
            4,
            "100 hand release push-ups. The standard is how long it takes you.",
            [step("Hand Release Push-Up", reps=100)],
            score_mode="for_time",
        ),
        workout(
            3,
            "Back To Front",
            5,
            "Hold a prone back extension for 30 seconds, then hold a traditional plank for 30 seconds. Rest 1 minute and repeat. Stick it out for 20 minutes.",
            [
                step("Back Extension", duration_seconds=30),
                step("Plank", duration_seconds=30),
            ],
            score_mode="fixed_duration",
            rest_between_rounds_seconds=60,
            time_cap_seconds=1200,
        ),
        workout(
            4,
            "Heart Attack Medley",
            6,
            "20 seconds all-out sprint on the spot, 20 seconds all-out plyo push-ups, 20 seconds all-out burpees, 20 seconds all-out mountain climbers, then 20 seconds all-out sprint on the spot again. Rest 3 minutes and repeat 3 rounds.",
            [
                step("Running", duration_seconds=20, notes="On the spot."),
                step("Plyo Push-Up", duration_seconds=20),
                step("Burpee", duration_seconds=20),
                step("Mountain Climber", duration_seconds=20),
                step("Running", duration_seconds=20, notes="On the spot."),
            ],
            rounds=3,
            rest_between_rounds_seconds=180,
        ),
        workout(
            5,
            "All The Squats",
            7,
            "200 squats for time. Every time you hit 30 seconds, do 2 push-ups.",
            [
                step("Full Squat", reps=200),
                step("Push Up", reps=2, notes="Perform every 30 seconds."),
            ],
            score_mode="for_time",
        ),
        workout(
            6,
            "The V-Swim",
            8,
            "Face down and raise the arms into a V with thumbs up for a 10-second hold. Swim the hands down to shoulder line and repeat with thumbs down. Do 3 controlled reps, then finish with a max set of pull-ups or tabletop pull-ups.",
            [
                step("V-Swim", reps=3, notes="10-second hold in each position."),
                step("Pull Up", reps=1, notes="Max reps. Use tabletop pull-ups if no bar."),
            ],
        ),
        workout(
            7,
            "Table Top Pull-Up Test",
            9,
            "Lay underneath a table and perform tabletop pull-ups EMOM at 7-10 reps for as long as you can.",
            [
                step("Inverted Row", reps=7, notes="EMOM for 7-10 reps until failure."),
            ],
        ),
        workout(
            8,
            "Sidesplitters",
            10,
            "Hold a side plank for 30 seconds each side, rest 30 seconds, then do 45 seconds of boxer roll sit-ups. Repeat for 4-5 sets. Finish with 4-5 sets of isometric towel holds.",
            [
                step("Side Plank", duration_seconds=30, notes="Each side."),
                step("Boxer Roll Sit-Up", duration_seconds=45),
                step("Towel Hold", reps=1, notes="Finish with 4-5 sets."),
            ],
            rounds=5,
            rest_between_rounds_seconds=30,
        ),
        workout(
            9,
            "Burpee Breakdown",
            11,
            "As fast as you can do 10 inchworms to standing, 10 push-up to squat sits, and 10 full burpees. Rest 60 seconds and repeat for 3 rounds.",
            [
                step("Inchworm", reps=10, notes="Return to standing each rep."),
                step("Push-Up to Squat Sit", reps=10),
                step("Burpee", reps=10),
            ],
            score_mode="for_time",
            rounds=3,
            rest_between_rounds_seconds=60,
        ),
        workout(
            10,
            "Run For Home",
            12,
            "40-second squat hold, then 20 seconds of chair or bench toe touches. Keep that loop going for 5 minutes.",
            [
                step("Wall Sit", duration_seconds=40),
                step("Toe Touch", duration_seconds=20, notes="Use a chair or bench."),
            ],
            score_mode="fixed_duration",
            time_cap_seconds=300,
        ),
        workout(
            11,
            "Push Past The Pain",
            13,
            "40-second push-up hold, then 20 seconds of push-ups. Keep that loop going for 5 minutes.",
            [
                step("Push-Up Hold", duration_seconds=40),
                step("Push Up", duration_seconds=20),
            ],
            score_mode="fixed_duration",
            time_cap_seconds=300,
        ),
        workout(
            12,
            "Back 2 Basics",
            14,
            "10 back extensions with a 10-second hold on the final rep, then 10 one-arm door pull-ups for 5 rounds. Then do 10 plank rocks with a 10-second hold on the final rep and 10 V-sits for 5 rounds.",
            [
                step("Back Extension", reps=10, notes="Hold the final rep for 10 seconds."),
                step("Door Pull-Up", reps=10, notes="One-arm door pull-up variation."),
                step("Plank Rock", reps=10, notes="Hold the final rep for 10 seconds."),
                step("V-Sit", reps=10),
            ],
            rounds=5,
        ),
        workout(
            13,
            "Rocky Mountain Way",
            15,
            "Mountain climbers on a Tabata clock. Go for 2-3 Tabata rounds and track total reps.",
            [
                step("Mountain Climber", duration_seconds=20, notes="Tabata work interval."),
            ],
            score_mode="fixed_duration",
            time_cap_seconds=240,
        ),
        workout(
            14,
            "The 4400",
            16,
            "22 split squats, 22 Cossack lunges, and 10 push-ups. Repeat for 10 rounds and chase a sub-20-minute finish with good form.",
            [
                step("Split Squat", reps=22),
                step("Cossack Lunge", reps=22),
                step("Push Up", reps=10),
            ],
            score_mode="for_time",
            rounds=10,
        ),
        workout(
            15,
            "Reverse Up",
            17,
            "Do 10 reverse wrist push-ups, 10 pike push-ups, and 10 plank get-ups, then descend 8-6-4-2 on each movement.",
            [
                step("Reverse Wrist Push-Up", reps=10),
                step("Pike Push-Up", reps=10),
                step("Plank Get-Up", reps=10),
            ],
        ),
        workout(
            16,
            "The Wooden Back",
            18,
            "Grab a broom handle or towel. Do 10 presses with shoulders and back locked in, then 10 one-and-a-half squats. Repeat for 5 rounds.",
            [
                step("Overhead Press", reps=10, notes="Use a broom handle or towel."),
                step("One-And-A-Half Squat", reps=10),
            ],
            rounds=5,
        ),
        workout(
            17,
            "All The Dips",
            19,
            "15 chair dips and 15 diamond push-ups, then 10 chair dips and 10 diamond push-ups, then 5 chair dips and 5 diamond push-ups, followed by 50 lunges. Repeat the full sequence.",
            [
                step("Chair Dip", reps=15),
                step("Diamond Push-Up", reps=15),
                step("Chair Dip", reps=10),
                step("Diamond Push-Up", reps=10),
                step("Chair Dip", reps=5),
                step("Diamond Push-Up", reps=5),
                step("Lunge", reps=50),
            ],
            rounds=2,
            score_mode="for_time",
        ),
        workout(
            18,
            "Snakes & Ladders",
            20,
            "Burpee ladder of 10-8-6-4-2, alternated with one-and-a-half squat ladder of 2-4-6-8-10.",
            [
                step("Burpee", reps=10, notes="Descend 10-8-6-4-2."),
                step("One-And-A-Half Squat", reps=2, notes="Ascend 2-4-6-8-10."),
            ],
            score_mode="for_time",
        ),
        workout(
            19,
            "Hateful 8",
            21,
            "8 burpees, 8 pull-ups, 8 single-leg squats, 8 hand release push-ups, 8 mountain climbers, 8 V-sit ups, 8 split squats, and 8 plank get-ups. Repeat for 3 rounds.",
            [
                step("Burpee", reps=8),
                step("Pull Up", reps=8, notes="Use door pull-ups if no bar."),
                step("Single-Leg Squat", reps=8, notes="Use Bulgarian split squats if pistols are too hard."),
                step("Hand Release Push-Up", reps=8),
                step("Mountain Climber", reps=8),
                step("V-Sit", reps=8),
                step("Split Squat", reps=8),
                step("Plank Get-Up", reps=8),
            ],
            rounds=3,
        ),
        workout(
            20,
            "100 For The Fun",
            22,
            "100 burpees. Try not to swear. The goal is under 10 minutes.",
            [step("Burpee", reps=100)],
            score_mode="for_time",
        ),
        workout(
            21,
            "Get On Up",
            23,
            "Bodyweight Turkish get-ups for 60 seconds, then a 60-second plank hold. Do 5 rounds and count total quality get-ups.",
            [
                step("Get-Up", duration_seconds=60, notes="Bodyweight Turkish get-ups. Count quality reps."),
                step("Plank", duration_seconds=60),
            ],
            rounds=5,
        ),
        workout(
            22,
            "The Prison Lizard",
            24,
            "Lizard or knee-elbow push-ups, 10 reps every 60 seconds. Keep the tempo super slow for 10 minutes.",
            [
                step("Spiderman Push-Up", reps=10, notes="Every 60 seconds."),
            ],
            score_mode="fixed_duration",
            time_cap_seconds=600,
            rounds=10,
        ),
        workout(
            23,
            "World War Core",
            25,
            "25 V-sit-ups, 25 crunches, and 25 sit-ups. No timer. Aim for 3 quality sets.",
            [
                step("V-Sit", reps=25),
                step("Crunch", reps=25),
                step("Sit Up", reps=25),
            ],
            rounds=3,
        ),
        workout(
            24,
            "In The Kitchen At Parties",
            26,
            "Set an EMOM timer and do 10 door pull-ups, 10 chair dips, 10 Bulgarian split squats, and 10 table pull-ups. Keep going for 20 minutes.",
            [
                step("Door Pull-Up", reps=10),
                step("Chair Dip", reps=10),
                step("Bulgarian Split Squat", reps=10),
                step("Inverted Row", reps=10, notes="Table pull-up."),
            ],
            score_mode="fixed_duration",
            time_cap_seconds=1200,
        ),
        workout(
            25,
            "Jacks Back!",
            27,
            "Set a Tabata timer. Work 20 seconds of jumping jacks, then 10 seconds of fast plank get-ups. Do 3 rounds.",
            [
                step("Jumping Jack", duration_seconds=20),
                step("Plank Get-Up", duration_seconds=10),
            ],
            score_mode="fixed_duration",
            rounds=3,
            time_cap_seconds=720,
        ),
        workout(
            26,
            "Top Of The Table",
            28,
            "10 table pull-ups and 10 raised-leg push-ups for 10 rounds. Keep your form and chase sub-7 minutes.",
            [
                step("Inverted Row", reps=10, notes="Table pull-up."),
                step("Decline Push-Up", reps=10),
            ],
            score_mode="for_time",
            rounds=10,
        ),
        workout(
            26,
            "Superstarjacks",
            29,
            "100 old-school squat thrusts with feet on a towel, then 100 chair dips. The source PDF also labels this as Workout #26.",
            [
                step("Squat Thrust", reps=100),
                step("Chair Dip", reps=100),
            ],
            score_mode="for_time",
        ),
        workout(
            27,
            "Power House",
            30,
            "10 power jump squats, 10 power plyo push-ups, 10 power jump lunges, and 10 power skater jumps. Rest 2 minutes and repeat for 4-5 sets.",
            [
                step("Jump Squat", reps=10, notes="Power jump squat."),
                step("Plyo Push-Up", reps=10),
                step("Jump Lunge", reps=10, notes="Power jump lunge."),
                step("Skater Jump", reps=10),
            ],
            rounds=5,
            rest_between_rounds_seconds=120,
        ),
        workout(
            28,
            "Brutality",
            31,
            "100 push-ups, 100 squats, 100 V-sit-ups, and 100 burpees. Cut-off is 30 minutes.",
            [
                step("Push Up", reps=100),
                step("Full Squat", reps=100),
                step("V-Sit", reps=100),
                step("Burpee", reps=100),
            ],
            score_mode="time_cap",
            time_cap_seconds=1800,
        ),
        workout(
            29,
            "Mo Minutes Mo Problems",
            32,
            "EMOM for 15 minutes. Start with 5 burpees then jog on the spot for the remainder of the minute. Add one burpee every minute.",
            [
                step("Burpee", reps=5, notes="Add one rep every minute."),
                step("Running", duration_seconds=60, notes="Jog on the spot for the remainder of the minute."),
            ],
            score_mode="fixed_duration",
            time_cap_seconds=900,
        ),
        workout(
            30,
            "Hit The Wall",
            33,
            "Wall sit for 60 seconds, then immediately do 60 seconds of max-rep squats. Do 6 rounds. Measure total squats and aim for 180.",
            [
                step("Wall Sit", duration_seconds=60),
                step("Full Squat", duration_seconds=60, notes="Max reps."),
            ],
            rounds=6,
        ),
    ]

    return {
        "source_pdf": SOURCE_PDF,
        "derived_from": SOURCE_PDF,
        "generated_for": "Hevy import batch",
        "source_label": "Strength& Conditioning Menu",
        "workout_count": len(workouts),
        "hevy_folder": "Strength& Conditioning Menu",
        "workouts": workouts,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a cleaned curated batch for the Strength& Conditioning Menu.")
    parser.add_argument("output_json", type=Path)
    args = parser.parse_args()

    payload = build_payload()
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
