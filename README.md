# Bibel Escape Room – V3.1 / V3.2

German PWA prototype for Sunday School (ages 9–15).

## V3.1 – Teacher Foundation
- Lehrerbereich with prototype login
- Dashboard for all games
- Edit existing 3 games
- Create new games
- Add, edit, duplicate and delete puzzles
- Archive games so they disappear from participant view
- Draft / Published status
- Edit title, Bible reference, introduction, duration, difficulty and final solution
- Teacher test mode
- All content is stored locally on the device in this prototype

### Prototype teacher login
- User: `Lehrer`
- Password: `1234`

This is intentionally only a local prototype login. It is **not** a secure multi-device teacher authentication system yet. A real shared teacher login will require a backend/authentication service.

## V3.2 – Puzzle Engine
Supported puzzle types:
1. Richtig / Falsch
2. Reihenfolge
3. Multiple Choice
4. Offene Frage
5. Bibel-Suche

Existing number questions are also retained as a simple answer subtype so the three prototype games continue to work.

Each puzzle supports:
- Question
- Correct answer / correct order
- Optional accepted answers
- Hint
- Points
- Collected clue

The participant collects clues after successful answers and must use them for the final escape solution.

## Important architecture note
The current prototype intentionally uses localStorage so the teacher workflow can be tested without backend costs. It is **not yet a multi-teacher shared database**.

The next planned stage is to test V3.1/V3.2 with the Sunday School team before deciding on backend authentication, shared games, live sessions and any AI assistant.

## Files
- `index.html` – application
- `manifest.webmanifest` – PWA manifest
- `sw.js` – service worker/offline cache
- `icon.svg` – app icon

## Deployment
The ZIP is intentionally flat. Upload the **contents of this ZIP directly into the GitHub Pages repository root** so that `index.html` is at the root level. Do not upload the ZIP's containing folder as a subfolder.

The service worker uses a new cache version and network-first loading for the app document so newly deployed versions can refresh correctly.
