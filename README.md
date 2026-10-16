# RoomZero

RoomZero is a browser-based campus space finder and recommendation prototype. It helps a student or organizer find rooms that fit a group, a requested time, and facility or accessibility needs. It also includes a searchable room directory, schedule-based utilization views, personal search suggestions, and an optional from-scratch machine-learning estimate for attendance overflow risk.

RoomZero was built for a datathon using a supplied **synthetic educational dataset**. It is a prototype: it does not connect to a live campus system and cannot reserve a room.

## Contents

- [Quick start](#quick-start)
- [Features](#features)
- [How a room recommendation is made](#how-a-room-recommendation-is-made)
- [Dataset and data flow](#dataset-and-data-flow)
- [Machine-learning model](#machine-learning-model)
- [Profile and personal recommendations](#profile-and-personal-recommendations)
- [Run locally](#run-locally)
- [Publish with GitHub Pages](#publish-with-github-pages)
- [Project files](#project-files)
- [Limitations and responsible use](#limitations-and-responsible-use)

## Quick start

The app is static and runs in a modern browser. Keep the app files together in one folder and open `index.html`.

For the supplied app build, these files must sit beside `index.html`:

- `styles.css`
- `app.js`
- `data.js`
- `attendance_model.js`

No package installation, API key, database, or server is needed for the basic demo. The page reads the prepared data from `data.js`; it does not ask the user to upload the CSV files each time.

## Features

### Home and room recommendations

Enter a day, optional date, time range, group size, room type, and any required facilities or accessibility needs. RoomZero removes rooms that fail required constraints or conflict with the supplied class schedule or dated events. It ranks the rooms that remain and gives a short explanation for each result.

The optional ML control can use the attendance-overflow estimate when ranking. It does not override hard checks such as room capacity, required facilities, accessibility, or schedule conflicts.

### Room finder

Browse the room catalog, search by room or building, filter by room type, and open a room's details. The catalog shows the room's supplied capacity, location/building, room type, facilities, and accessibility information.

### Space utilization

View summaries derived from schedule records, including how many schedule entries are associated with rooms and how that activity varies across the supplied records. These are record counts, not sensor readings or measurements of actual occupancy.

### Recommendations

RoomZero can remember recent searches in the current browser and highlight repeated weekday/time patterns. A repeated pattern can be selected to fill the room-search form again; the app then checks current filters and availability rules for that search.

### Profile and settings

The profile page lets a visitor save a name, optional pronouns, and profile photo in the current browser. The settings panel includes appearance and reduced-motion preferences. These settings are local to that browser as well.

### Dataset information

The sidebar's dataset information page describes the supplied data and key limitations. The source dataset README is also included in the `data/` folder in the project copy.

## How a room recommendation is made

1. **Read the request.** The app takes the selected day/date, start and end time, group size, room type, accessibility requirement, and selected facilities.
2. **Check room fit.** A room must have sufficient capacity and satisfy the requested type, facility, and accessibility constraints.
3. **Check schedule conflicts.** Recurring class records are checked by weekday and time interval. Dated events are checked against the selected date and time interval.
4. **Rank feasible rooms.** Rooms that pass hard checks are ranked using fit signals. If the ML estimate is enabled, estimated overflow risk contributes to ranking; it never makes an infeasible room eligible.
5. **Explain the result.** The result card shows the room facts and why the room passed the request checks.

Room requests are historical demand records, not room assignments. Since the source notes say they do not have a guaranteed room ID, RoomZero does not join them to rooms or use them to block availability.

## Dataset and data flow

The supplied data is synthetic and intended for demonstration. The source README describes four CSV files and their join relationships:

| File | Records | How RoomZero uses it |
| --- | ---: | --- |
| `rooms.csv` | 120 | Room ID, building/location, room type, capacity, facilities, and accessibility. Used for the directory and room-fit checks. |
| `class_schedule.csv` | 5,000 | Recurring weekday/time entries associated with rooms by `room_id`. Used to reject rooms with overlapping classes. |
| `events.csv` | 1,800 | Dated event intervals, attendance information, and room IDs. Used for event conflict checks and to build/evaluate the overflow model after joining to rooms by `room_id`. |
| `room_requests.csv` | 5,000 | Historical demand context. Requests have no guaranteed `room_id`, so they are not joined to rooms and are not treated as bookings. Cancelled and rejected requests are excluded from the demand count. |

In the browser-ready build, the prepared records are in `data.js`. The CSVs and their source README are retained in the project copy's `data/` directory for reference. The app does not fetch fresh data from a campus service.

## Machine-learning model

### What it predicts

The optional model estimates the probability that **actual event attendance exceeds the room's capacity**. RoomZero uses that estimated risk as a ranking signal for candidate rooms. The model is not a booking system, does not predict whether a room is currently empty, and does not replace the schedule-conflict or room-requirement checks.

### How it is trained

`outputs/train_attendance_model.js` contains the training program. It reads the prepared data from `data.js`, joins each event to its room using `room_id`, and labels a training example as an overflow when `actual_attendance > room.capacity`.

The program builds features from expected attendance, event duration and start hour, room capacity, capacity/headcount relationships, room facilities and accessibility, event type, and room type. It standardizes features using the training subset and fits multivariable logistic regression from scratch with batch gradient descent and L2 regularization. The resulting model parameters and evaluation metrics are written to `attendance_model.js`, which the browser app loads.

### Evaluation on this synthetic dataset

The split is deterministic: event IDs ending in 0 or 5 are held out for testing; the other joined events are used for training. The current generated artifact reports 1,440 training examples and 360 test examples:

| Method | Test accuracy |
| --- | ---: |
| Logistic regression model | 76.39% |
| Expected-headcount rule (`expected_attendance > capacity`) | 69.72% |
| Always predict no overflow | 61.94% |

These figures describe this particular synthetic dataset and split. They are not evidence of real-campus performance. Accuracy alone also does not capture all costs of missed overflow or false alarms; the training artifact includes precision, recall, F1, and Brier score as additional metrics.

To regenerate the model from the project root, with Node.js installed, run:

```sh
node outputs/train_attendance_model.js
```

The script reads `data.js` and writes `attendance_model.js` in the current working directory. Run it from the project root if you want the generated model to replace the root-level browser artifact. The training script is included in `outputs/` too; if running from that folder, it expects the corresponding `data.js` there and writes `attendance_model.js` there.

## Profile and personal recommendations

Profile information and recommendation history are stored with browser `localStorage` on the visitor's device. In practical terms:

- Each person using their own browser gets their own profile and search history.
- The data is not uploaded to RoomZero or shared with other visitors.
- It remains available in the same browser on the same device until browser storage is cleared.
- It does not automatically sync between browsers or devices, even for the same person.
- A visitor can clear their recommendation history from the Recommendations page and clear their profile from the Profile page.
- If browser storage is blocked or unavailable, saved information may not persist after the page is closed.

This is local personalization, not an account system. There is no login, server-side profile, or cross-device synchronization.

## Run locally

1. Download or copy the project files.
2. Keep `index.html`, `styles.css`, `app.js`, `data.js`, and `attendance_model.js` together.
3. Open `index.html` in a current browser.
4. To retrain the ML artifact, install Node.js if needed and run the command in the [Machine-learning model](#machine-learning-model) section from the project root.

If the browser blocks local files in your environment, serve the same folder using any simple static web server or use GitHub Pages. The app itself has no server-side component.

## Publish with GitHub Pages

For the browser app to load correctly from a GitHub Pages URL, publish the five browser files together in the same published directory:

```text
index.html
styles.css
app.js
data.js
attendance_model.js
```

You can publish the repository root or a folder containing these files by configuring GitHub Pages for that location. The training script and raw CSVs are not required for visitors to use the browser app; include them if you want the repository to document the training process and source dataset. GitHub Pages hosts the static site, but it does not add accounts or shared storage. Each visitor's profile and recommendation history remain in that visitor's own browser.

## Project files

| File or folder | Purpose |
| --- | --- |
| `index.html` | Page structure and browser entry point. |
| `styles.css` | Layout, visual theme, responsive styling, and animation styles. |
| `app.js` | Page interactions, room filtering/ranking, personal history, profile, and navigation. |
| `data.js` | Prepared browser-readable room, schedule, event, and request data. |
| `attendance_model.js` | Generated model weights, feature metadata, and evaluation metrics loaded by the app. |
| `outputs/train_attendance_model.js` | Reproducible from-scratch training script. |
| `data/` | Original synthetic CSVs and source dataset README in the project copy. |
| `index.before-refactor.html` | Preserved pre-refactor single-file page for rollback/reference. |

The `outputs/` folder contains a ready-to-open distribution copy of the browser files and training script. Keep its sibling files together when moving or publishing it.

## Limitations and responsible use

- The records are synthetic educational data, not official campus data.
- Room availability is inferred from the supplied schedule and event rows. It is not live availability.
- A room recommendation is not a booking or reservation.
- The utilization view counts schedule records; it does not measure occupied hours, occupancy, or seat usage.
- The ML model was trained and evaluated on synthetic records from the same supplied dataset. It must not be presented as validated for real campus operations.
- The recommendation history is browser-local and can be cleared by the visitor; it is not centrally collected.

## Credits and context

Built as a datathon prototype using the provided synthetic educational campus-space dataset. The project demonstrates data preparation, rule-based room matching, an interpretable attendance-overflow model, and an end-to-end browser workflow.
