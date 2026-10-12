# Bibel Escape Room V3.2.5 — Bibel-Challenge Pilot

## Deployment
All files belong in the root of the GitHub Pages repository. The PWA service worker caches the HTML, CSS, JavaScript and image assets, so it may take a refresh or a moment for an installed PWA to activate the new cache after deployment.

## New in V3.2.5
- Adds a second student mode: **Bibel-Challenge / تحدي الكتاب المقدس**, alongside the existing Bibel Escape Room.
- Teachers can create, edit, preview, publish and archive self-paced Bible-reading activities.
- Each challenge contains a title, Bible passage, German and Arabic instructions, and 3–4 questions.
- Question types reuse the current engine: True/False, ordering, multiple choice, open answer, number and Bible search.
- Questions support German and Arabic text, answers, optional hints, points and bilingual explanations.
- Students enter a name, can reopen the relevant Bible chapter during every question, see feedback/explanations, and review the answers at the end.
- Challenge results can be reviewed in the teacher area on the same device.
- Bible.com links attempt to open the selected book/chapter in SCH2000 and AVD. If embedding is blocked by Bible.com, the existing “open in new tab” buttons remain available.
- No AI/API calls are included.

## Current prototype boundary
**Bibel-Challenges and their results are currently stored in this browser's local storage.** Publishing a challenge on one device will not yet make it available on other devices. Shared publishing and shared results are the next step.

The Firebase configuration in the Financial Money Plan belongs to that finance app and uses rules for private per-user data. To avoid exposing or mixing financial records, the Bible Escape Room should use a separate Firebase project (under the same Firebase account is fine), with Firebase Authentication and Firestore security rules specifically for teacher-managed challenges and student results. Do not copy a service-account key into the PWA.

## Demo teacher login
Username: `Lehrer`
Password: `1234`

This is a local prototype login, not a secure multi-teacher account system.
