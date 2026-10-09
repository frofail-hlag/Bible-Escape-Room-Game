# Bibel Escape Room – V3.2.2 Design Update

## Deployment
Upload all files in this ZIP directly to the root of the GitHub Pages repository (do not upload the enclosing folder). Keep `index.html`, `manifest.webmanifest`, `sw.js`, `icon.svg`, `background-bible.png`, `README.md`, and `VERSION.txt` together.

## What's changed
- The app opens with a role choice: **Sonntagsschüler/in** or **Diener/in**.
- Students go directly to the game list and do not see the Lehrerbereich entry.
- Diener/in must log in before accessing the teacher dashboard.
- The teacher dashboard has a prominent **Spiele spielen** option; the teacher can play published games and return to the Lehrerbereich.
- The supplied Bible image is used as a subtle page background with a pale overlay to preserve readability.
- Existing game/puzzle logic and manual game editor are retained. AI assistant remains intentionally out of scope.

## Prototype login
Username: `Lehrer`
Password: `1234`

This is a local demo login, not secure multi-user authentication. Game edits and leaderboard data remain in the browser's local storage on each device.
