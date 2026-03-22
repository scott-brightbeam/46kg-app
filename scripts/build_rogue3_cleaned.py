#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


SOURCE_DIR = "/Users/scott/Documents/Strength&/Content/Lockdown 3"


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
    week: int,
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
        normalized_steps.append({"order": index, **item})
    return {
        "number": number,
        "title": title,
        "source_page": page,
        "score_mode": score_mode,
        "rounds": rounds,
        "rest_between_rounds_seconds": rest_between_rounds_seconds,
        "time_cap_seconds": time_cap_seconds,
        "notes": f"Week {week}. {notes}",
        "sequence": normalized_steps,
    }


def build_payload() -> dict[str, Any]:
    workouts = [
        workout(
            1,
            "Decked Twice",
            1,
            2,
            "Download a deck of cards app. Hearts are press-ups, diamonds are squats, spades are lunges, clubs are mountain climbers. Rest 3 minutes and repeat. Record both times and total duration.",
            [
                step("Push Up", reps=1, notes="Hearts in the deck."),
                step("Full Squat", reps=1, notes="Diamonds in the deck."),
                step("Lunge", reps=1, notes="Spades in the deck."),
                step("Mountain Climber", reps=1, notes="Clubs in the deck."),
            ],
            score_mode="for_time",
            rounds=2,
            rest_between_rounds_seconds=180,
        ),
        workout(
            2,
            "Run To Ground",
            1,
            3,
            "25m sandbag run, 5 Turkish get-ups, 25m sandbag run, 5 Turkish get-ups, then 30 seconds rest. Repeat for 3 rounds.",
            [
                step("Sandbag Run", distance_meters=25),
                step("Get-Up", reps=5, notes="Turkish get-ups."),
                step("Sandbag Run", distance_meters=25),
                step("Get-Up", reps=5, notes="Turkish get-ups."),
            ],
            rounds=3,
            rest_between_rounds_seconds=30,
        ),
        workout(
            3,
            "Axle F Is Dead",
            1,
            4,
            "Work up to a 5-rep max deadlift, reset to 70% and do max reps in 60 seconds for 3 sets, then deload to 50% for 3 sets and 30% for 3 sets.",
            [
                step("Deadlift", reps=5, notes="Work up to a 5-rep max."),
                step("Deadlift", duration_seconds=60, notes="70% weight, max reps."),
                step("Deadlift", duration_seconds=60, notes="50% weight, max reps."),
                step("Deadlift", duration_seconds=60, notes="30% weight, max reps."),
            ],
        ),
        workout(
            4,
            "Lumberjack Stack",
            1,
            5,
            "Load the log to your 10-rep max weight. Do 10 log lifts and 10 sandbag lunges as a pyramid set of 10-8-6-4-2-1.",
            [
                step("Overhead Press", reps=10, notes="Use the log."),
                step("Weighted Lunge", reps=10, notes="Use the sandbag."),
            ],
            score_mode="for_time",
        ),
        workout(
            5,
            "It's A Complex",
            1,
            6,
            "Grab a keg and set a stopwatch running. Do 5 ground-to-overhead lifts, 10 rows, and a 50m carry. Repeat for 5 rounds and finish under 20 minutes.",
            [
                step("Ground To Overhead Lifts", reps=5),
                step("Bent Over Row", reps=10),
                step("Keg Carry", distance_meters=50),
            ],
            rounds=5,
            score_mode="for_time",
            time_cap_seconds=1200,
        ),
        workout(
            6,
            "Halfway To Hell",
            2,
            2,
            "Load a bar for a Zercher carry. Walk 50m, squat for 10 reps, walk 50m again, then rest 2 minutes. Repeat for 3 rounds.",
            [
                step("Zercher Carry", distance_meters=50),
                step("Front Squat", reps=10, notes="Zercher squat."),
                step("Zercher Carry", distance_meters=50),
            ],
            rounds=3,
            rest_between_rounds_seconds=120,
        ),
        workout(
            7,
            "Phil's Medley",
            2,
            3,
            "Set up a 10m track. Do 20m tyre flips, 20m keg carry, and 20m sandbag carry. Repeat for 5 rounds.",
            [
                step("Tyre Flips", distance_meters=20),
                step("Keg Carry", distance_meters=20),
                step("Sandbag Carry", distance_meters=20),
            ],
            rounds=5,
        ),
        workout(
            8,
            "Strictly Zerching",
            2,
            4,
            "Hold the sandbag in Zercher position for 20 seconds, then strict press the bar or log for 20 reps. Rest 1 minute, add weight, and repeat for 3 or more sets.",
            [
                step("Zercher Hold", duration_seconds=20),
                step("Overhead Press", reps=20, notes="Use the bar or log."),
            ],
            rounds=3,
            rest_between_rounds_seconds=60,
        ),
        workout(
            9,
            "Pain & Suffering",
            2,
            5,
            "Use a timer with 60 seconds of work and 30 seconds of rest. Tyre flips for 60 seconds, rest 30, suitcase carry for 60 seconds, rest 30. Repeat until failure.",
            [
                step("Tyre Flips", duration_seconds=60),
                step("Suitcase Carry", duration_seconds=60),
            ],
            rest_between_rounds_seconds=30,
        ),
        workout(
            10,
            "Bear Behinds",
            2,
            6,
            "20m bear crawl, 20m backward bear crawl, then rest 90 seconds. Repeat for 5 rounds and chase sub-15 minutes.",
            [
                step("Bear Crawl", distance_meters=20),
                step("Backward Bear Crawl", distance_meters=20),
            ],
            rounds=5,
            rest_between_rounds_seconds=90,
            score_mode="for_time",
            time_cap_seconds=900,
        ),
        workout(
            11,
            "Flip The Viking",
            3,
            2,
            "10-8-6-4 Viking press with 20m bear crawl between rounds, then 10-8-6-4 Viking row with 20m backward bear crawl between rounds, then 60 seconds trap-bar deadlift for max reps, rest 3-5 minutes, and finish with tyre flips to failure.",
            [
                step("Landmine Press", reps=10, notes="Descend 10-8-6-4."),
                step("Bear Crawl", distance_meters=20),
                step("Landmine Row", reps=10, notes="Descend 10-8-6-4."),
                step("Backward Bear Crawl", distance_meters=20),
                step("Deadlift", duration_seconds=60, notes="Max reps."),
                step("Tyre Flips", reps=1, notes="Finish with a max-rep set."),
            ],
            rest_between_rounds_seconds=240,
        ),
        workout(
            12,
            "Sandbag City",
            3,
            3,
            "800m 50kg sandbag carry with 5 burpees every minute, then 400m 20kg overhead sandbag lunge walk with 5 burpees every minute. Repeat for 3 rounds.",
            [
                step("Sandbag Carry", distance_meters=800, notes="50kg."),
                step("Burpee", reps=5, notes="Every minute."),
                step("Overhead Sandbag Lunge Walk", distance_meters=400, notes="20kg."),
                step("Burpee", reps=5, notes="Every minute."),
            ],
            rounds=3,
        ),
        workout(
            13,
            "Shoulder It",
            3,
            4,
            "Ground-to-shoulder and push-up ladder of 10-8-6-4-2, then 1 minute of sledgehammers and 1 minute of tyre flips repeated 3 times.",
            [
                step("Ground to Shoulder", reps=10, notes="Descend 10-8-6-4-2."),
                step("Push Up", reps=10, notes="Keep at 10 reps each round."),
                step("Sledgehammer Slams", duration_seconds=60),
                step("Tyre Flips", duration_seconds=60),
            ],
            rounds=3,
        ),
        workout(
            14,
            "Max It Out",
            3,
            5,
            "Find your 3-rep max on trap-bar deadlift and log press. Halve the weight and do max reps for 1 minute, repeat 3 times. Then pair dumbbell press with 100m shuttle runs on a 2-4-6-8-10 ladder.",
            [
                step("Deadlift", reps=3, notes="Find your 3RM."),
                step("Overhead Press", reps=3, notes="Use the log, find your 3RM."),
                step("Deadlift", duration_seconds=60, notes="Half the 3RM, max reps."),
                step("Overhead Press", duration_seconds=60, notes="Half the 3RM, max reps."),
                step("Dumbbell Press", reps=2, notes="Ascend 2-4-6-8-10."),
                step("Shuttle Run", distance_meters=100),
            ],
        ),
        workout(
            15,
            "Circus Tricks",
            4,
            2,
            "10 dumbbell presses and 20 kettlebell swings with 60 seconds rest for 3 rounds, then 20 seconds of sledgehammer slams with 10 seconds rest for 8 rounds, then 20 seconds of sandbag over shoulders with 10 seconds rest for 8 rounds.",
            [
                step("Dumbbell Press", reps=10),
                step("Kettlebell Swing", reps=20),
                step("Sledgehammer Slams", duration_seconds=20),
                step("Sandbag Over Shoulders", duration_seconds=20),
            ],
            rounds=3,
            rest_between_rounds_seconds=60,
        ),
        workout(
            16,
            "60 To 30",
            4,
            3,
            "At least 5 reps each of sandbag over shoulders, sandbag over yoke, tyre flips, and deadlift for 60 seconds, repeated 3 rounds. Then 30m sandbag run, 30m keg run, and 30m farmer carry run for 3 rounds.",
            [
                step("Sandbag Over Shoulders", duration_seconds=60, notes="At least 5 reps."),
                step("Sandbag Over Yoke", duration_seconds=60, notes="At least 5 reps."),
                step("Tyre Flips", duration_seconds=60, notes="At least 5 reps."),
                step("Deadlift", duration_seconds=60, notes="At least 5 reps."),
                step("Sandbag Run", distance_meters=30),
                step("Keg Run", distance_meters=30),
                step("Farmers Carry", distance_meters=30),
            ],
            rounds=3,
        ),
        workout(
            17,
            "Push 'n' Squat",
            4,
            4,
            "With a partner, take turns with no other rest. Log press x5, Viking press x10, banded push-ups x20 for 3 rounds. Then Zercher squat x5, sandbag squat x10, landmine squat x20 for 3 rounds.",
            [
                step("Overhead Press", reps=5, notes="Use the log."),
                step("Landmine Press", reps=10, notes="Viking press."),
                step("Banded Push-Up", reps=20),
                step("Front Squat", reps=5, notes="Zercher squat."),
                step("Sandbag Squat", reps=10),
                step("Landmine Squat", reps=20),
            ],
            rounds=3,
        ),
        workout(
            18,
            "Mountain Bears",
            4,
            5,
            "Set markers 100m apart and a timer every 15 seconds. Run 800m with 6 mountain climbers every 15 seconds, rest 120 seconds. Then bear crawl 100m and run 100m, rest 60 seconds, and repeat 5 times.",
            [
                step("Running", distance_meters=800),
                step("Mountain Climber", reps=6, notes="Every 15 seconds during the run."),
                step("Bear Crawl", distance_meters=100),
                step("Running", distance_meters=100),
            ],
            rounds=5,
            rest_between_rounds_seconds=60,
        ),
        workout(
            19,
            "Drag Me To Hell",
            5,
            2,
            "With a partner, drag and tow the sled over 40m at extra heavy, heavy, and moderate loads. Perform 3 reps at each load for both drags and tows.",
            [
                step("Sled Drag", distance_meters=40, notes="3 reps at extra heavy load."),
                step("Sled Drag", distance_meters=40, notes="3 reps at heavy load."),
                step("Sled Drag", distance_meters=40, notes="3 reps at moderate load."),
                step("Sled Tow", distance_meters=40, notes="3 reps at extra heavy load."),
                step("Sled Tow", distance_meters=40, notes="3 reps at heavy load."),
                step("Sled Tow", distance_meters=40, notes="3 reps at moderate load."),
            ],
        ),
        workout(
            20,
            "Big Will's Fatal 50",
            5,
            3,
            "Take as much time between exercises as needed. 50 Zercher squats, 50 log presses, and 50 deadlifts.",
            [
                step("Front Squat", reps=50, notes="Use Zercher position."),
                step("Overhead Press", reps=50, notes="Use the log."),
                step("Deadlift", reps=50),
            ],
        ),
        workout(
            21,
            "3 Is The Magic #",
            5,
            4,
            "Set up a trap bar with your 3-rep max deadlift. Do sets of 3 every minute on the minute until you have lifted 100 times your bodyweight.",
            [
                step("Deadlift", reps=3, notes="EMOM until 100x bodyweight total volume."),
            ],
        ),
        workout(
            22,
            "Keg Killer",
            5,
            5,
            "25m keg carry EMOM for 15 minutes, then 6 ground-to-overhead keg lifts and 10 burpees AMRAP for 12 minutes, then 1 minute of keg grip spins.",
            [
                step("Keg Carry", distance_meters=25, notes="Every minute for 15 rounds."),
                step("Ground To Overhead Lifts", reps=6, notes="Use the keg."),
                step("Burpee", reps=10),
                step("Keg Grip Spin", duration_seconds=60),
            ],
            time_cap_seconds=720,
        ),
        workout(
            23,
            "Blame It On Jmac",
            5,
            6,
            "10 hill sprints, then 400m of lunges with 10 press-ups every minute. Repeat for 2 rounds and finish with a deck of cards.",
            [
                step("Running", reps=10, notes="Hill sprints."),
                step("Lunge", distance_meters=400),
                step("Push Up", reps=10, notes="Every minute during the lunges."),
            ],
            rounds=2,
            score_mode="for_time",
        ),
        workout(
            24,
            "Carry Me To Hell",
            6,
            2,
            "With a partner, go heavy and take turns with no other rest: 40m suitcase carry, 40m keg carry, 40m farmers carry, and 40m kettlebell carry. Repeat for 5 rounds.",
            [
                step("Suitcase Carry", distance_meters=40),
                step("Keg Carry", distance_meters=40),
                step("Farmers Carry", distance_meters=40),
                step("Kettlebell Carry", distance_meters=40),
            ],
            rounds=5,
        ),
        workout(
            25,
            "Ever Hotter Burn",
            6,
            3,
            "40m sled drags for 3 reps, add 20kg, 40m sled drags for 3 reps, add another 20kg, then 40m sled drags for 3 reps.",
            [
                step("Sled Drag", distance_meters=40, notes="3 reps at starting load."),
                step("Sled Drag", distance_meters=40, notes="3 reps after adding 20kg."),
                step("Sled Drag", distance_meters=40, notes="3 reps after adding another 20kg."),
            ],
        ),
        workout(
            26,
            "Hold Then Go",
            6,
            4,
            "20 seconds of sandbag Zercher hold and 20 strict presses. Repeat for 3 rounds.",
            [
                step("Zercher Hold", duration_seconds=20),
                step("Overhead Press", reps=20, notes="Strict press."),
            ],
            rounds=3,
        ),
        workout(
            27,
            "Circuit Of Strength",
            6,
            5,
            "Start at 70% of 1RM. Do 8 trap-bar deadlifts, 8 log presses, and 8 x 10m farmers carry. Repeat for 4 sets, increasing the weight and dropping the reps by 2 each round.",
            [
                step("Deadlift", reps=8),
                step("Overhead Press", reps=8, notes="Use the log."),
                step("Farmers Carry", distance_meters=10, notes="Complete 8 carries."),
            ],
            rounds=4,
        ),
        workout(
            28,
            "Landmine 21s",
            6,
            6,
            "7 landmine squats, 7 landmine presses, 7 landmine thrusters, and 90 seconds of plank. Repeat for 3 rounds.",
            [
                step("Landmine Squat", reps=7),
                step("Landmine Press", reps=7),
                step("Landmine Thruster", reps=7),
                step("Plank", duration_seconds=90),
            ],
            rounds=3,
        ),
        workout(
            29,
            "Bands & Hills",
            6,
            7,
            "Prepare with 1 minute of X-band walk for 3 rounds, then 20-second hill sprints with 45 seconds rest for 15 rounds.",
            [
                step("X-Band Walk", duration_seconds=60),
                step("Running", duration_seconds=20, notes="Hill sprint."),
            ],
            rounds=15,
            rest_between_rounds_seconds=45,
        ),
        workout(
            30,
            "Where Are You?",
            7,
            2,
            "Find your 8-rep, 5-rep, and 3-rep maximums on deadlifts and overhead presses.",
            [
                step("Deadlift", reps=8, notes="Then 5 and 3 rep max attempts."),
                step("Overhead Press", reps=8, notes="Then 5 and 3 rep max attempts."),
            ],
        ),
        workout(
            31,
            "Chance Your Arms",
            7,
            3,
            "10 log or barbell presses, 10 chins or inverted/assisted pull-ups, 10 narrow push-ups, and 10 curls. After each exercise do one 15m heavy rope pull for time. Repeat for 3 rounds.",
            [
                step("Overhead Press", reps=10, notes="Use the log or barbell."),
                step("Chin Up", reps=10, notes="Use inverted or assisted pull-ups if needed."),
                step("Narrow Push-Up", reps=10),
                step("Bicep Curl (Dumbbell)", reps=10),
                step("Heavy Rope Pull", distance_meters=15),
            ],
            rounds=3,
        ),
        workout(
            32,
            "Barrel Of Laughs",
            7,
            4,
            "As fast as you can, 10-8-6-4-2 reps of keg over yoke and tyre flips.",
            [
                step("Keg Over Yoke", reps=10, notes="Descend 10-8-6-4-2."),
                step("Tyre Flips", reps=10, notes="Descend 10-8-6-4-2."),
            ],
            score_mode="for_time",
        ),
        workout(
            33,
            "Sandbag Push",
            7,
            5,
            "10m heavy sandbag carry and 10 push-ups repeated 5 times, rest 2 minutes, then go back to the start and repeat the full block 3 times.",
            [
                step("Sandbag Carry", distance_meters=10),
                step("Push Up", reps=10),
            ],
            rounds=15,
            rest_between_rounds_seconds=120,
        ),
        workout(
            34,
            "Lift, Run, Done!",
            7,
            6,
            "5 deadlifts at 70% of max and 50m sled drag for 3 rounds, then 5 axle or barbell presses and 50m farmers walk for 3 rounds.",
            [
                step("Deadlift", reps=5, notes="70% of max."),
                step("Sled Drag", distance_meters=50),
                step("Overhead Press", reps=5, notes="Use the axle or barbell."),
                step("Farmers Carry", distance_meters=50),
            ],
            rounds=3,
        ),
        workout(
            35,
            "Heartbreak Hill",
            8,
            2,
            "Grab a sandbag and find an incline of at least 50m. Keep your effort at RPE 8+ for hill carries, resting between reps, for 10-15 rounds.",
            [
                step("Sandbag Hill Carry", reps=1, notes="Repeat for 10-15 rounds at RPE 8+."),
            ],
        ),
        workout(
            36,
            "Flipping Lunges",
            8,
            3,
            "Set a 15-minute countdown timer. Do 10 tyre flips and 40m weighted lunges. Repeat until the timer ends.",
            [
                step("Tyre Flips", reps=10),
                step("Weighted Lunge", distance_meters=40),
            ],
            score_mode="fixed_duration",
            time_cap_seconds=900,
        ),
        workout(
            37,
            "Gassed At 50",
            8,
            4,
            "Set out a 50m track and maintain maximum intensity. One prowler sprint, rest until fully recovered, repeat for 10 rounds.",
            [
                step("Sled Push", distance_meters=50, notes="Prowler sprint."),
            ],
            rounds=10,
        ),
        workout(
            38,
            "10 For The Legs",
            8,
            5,
            "Find a 10-rep max on back squat, front squat, and Zercher squat.",
            [
                step("Back Squat", reps=10),
                step("Front Squat", reps=10),
                step("Front Squat", reps=10, notes="Use Zercher position."),
            ],
        ),
        workout(
            39,
            "Jimmy's Big Tow",
            8,
            6,
            "Hook up your car to a harness with someone steering and braking. Pull the car for 500m.",
            [
                step("Car Pull", distance_meters=500),
            ],
        ),
        workout(
            40,
            "Kegs Be Friends",
            9,
            2,
            "25m keg carry on the minute for 15 rounds, then a 12-minute timer of 6 over-the-shoulder keg or sandbag throws and 10 burpees repeated until the timer ends.",
            [
                step("Keg Carry", distance_meters=25, notes="Every minute for 15 rounds."),
                step("Over The Shoulder Throw", reps=6, notes="Use a keg or sandbag."),
                step("Burpee", reps=10),
            ],
            score_mode="fixed_duration",
            time_cap_seconds=720,
        ),
        workout(
            41,
            "Against The Ropes",
            9,
            3,
            "First circuit: 60 seconds battle ropes, 60 seconds banded push-ups, 60 seconds run, then 60 seconds rest for 5 rounds. Second circuit: 30 seconds battle ropes, 30 seconds hammer holds, 30 seconds ground to overhead lift, then 30 seconds rest for 5 rounds.",
            [
                step("Battle Ropes", duration_seconds=60),
                step("Banded Push-Up", duration_seconds=60),
                step("Running", duration_seconds=60),
                step("Battle Ropes", duration_seconds=30),
                step("Hammer Hold", duration_seconds=30),
                step("Ground To Overhead Lifts", duration_seconds=30),
            ],
            rounds=5,
            rest_between_rounds_seconds=60,
        ),
        workout(
            42,
            "Caseload Of Hard",
            9,
            4,
            "With one farmer's handle loaded to 75% of bodyweight, set a 2-minute timer. Do 10m suitcase carry left hand and 10m suitcase carry right hand repeatedly until the timer pings, rest 1 minute, then repeat until failure.",
            [
                step("Suitcase Carry", distance_meters=10, notes="Left hand."),
                step("Suitcase Carry", distance_meters=10, notes="Right hand."),
            ],
            score_mode="fixed_duration",
            time_cap_seconds=120,
            rest_between_rounds_seconds=60,
        ),
        workout(
            43,
            "Log Jamming",
            9,
            5,
            "Pyramid overhead press with a log or barbell: 5, 4, 3, 2 reps increasing to your 2RM, then repeat in reverse starting from 2RM.",
            [
                step("Overhead Press", reps=5, notes="Pyramid 5-4-3-2 and reverse."),
            ],
        ),
    ]

    return {
        "source_pdf": SOURCE_DIR,
        "derived_from": SOURCE_DIR,
        "generated_for": "Hevy import batch",
        "source_label": "ROGUE 3",
        "workout_count": len(workouts),
        "hevy_folder": "ROGUE 3",
        "workouts": workouts,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a cleaned curated batch for ROGUE 3 weekly PDFs.")
    parser.add_argument("output_json", type=Path)
    args = parser.parse_args()

    payload = build_payload()
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
