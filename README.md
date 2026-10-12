# Bibel Escape Room V3.2.5 — Separate Activity Modes

## New in this update
- After selecting **Sonntagsschüler/in**, students first choose between **Bibel Escape Room** and **Bibel-Challenge**. Each opens on a separate page.
- The three Escape Room missions now appear only after the student selects Bibel Escape Room.
- In the Lehrerbereich, teachers first choose between **Bibel Escape Room verwalten** and **Bibel-Challenges verwalten**; each management area opens separately.
- Teachers can still enter a separate game-selection screen to play either type themselves.
- Existing challenge editor, question types, bilingual German/Arabic content, feedback, explanations and local results remain intact.
- Updated the service-worker cache key to load the current navigation and style files.

## Current prototype boundary
Bibel-Challenges and their results are currently saved in this browser's local storage. A challenge created on one device will not yet automatically appear on students' other devices. Firebase shared publishing and results are a separate next step.

The Financial Money Plan Firebase configuration and security rules should not be reused for Sunday School data. Use a dedicated Firebase project/database with rules designed for teacher-managed challenges and student results. No AI/API calls are included.

## Demo teacher login
Username: `Lehrer`
Password: `1234`

This is a local prototype login, not a secure multi-teacher account system.
