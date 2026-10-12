# Bibel Escape Room V3.2.4 — Deutsch / العربية

## Deployment
Upload all files in this ZIP directly to the root of the GitHub Pages repository, replacing the previous version. Keep `index.html`, `manifest.webmanifest`, `sw.js`, `icon.svg`, `background-bible.png`, `README.md`, and `VERSION.txt` together in the repository root.

## New in V3.2.4
- Existing three games now include Arabic translations alongside German for titles, introductions, questions, answer options, answers, and hints.
- The teacher editor lets teachers edit German and Arabic game titles, introductions, questions, answer options, correct answers, hints, and ordering events.
- A Bible area is accessible from the student home and during a game. It includes the requested Bible.com German SCH2000 and Arabic AVD pages.
- If Bible.com blocks iframe embedding in a browser, visible buttons open the same Bible passages in a new tab. Bible.com content requires an internet connection.
- Returning from the Bible page to an active game restores the current question and timer.
- No AI/API calls are included.

## Prototype limitations
- Teacher login and game data remain local to the device, as in the previous prototype.
- Bible.com may prevent third-party embedding. For a fully native embedded Bible reader, YouVersion Platform access and an app key may be needed.

## Demo teacher login
Username: `Lehrer`
Password: `1234`
