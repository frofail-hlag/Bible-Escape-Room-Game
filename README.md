# Bibel Escape Room V3.2.6 — Firebase Challenge Sync

## Hosting and Firebase
The PWA remains hosted on GitHub Pages. Firebase is used only for teacher authentication, shared Bibel-Challenges, and shared student results. No AI/API features are included.

## Firebase setup required
The web configuration is stored in firebase-config.js. It contains Firebase Web App configuration, not a service-account secret.

1. In Firebase Console, create the Cloud Firestore database for project bible-escape-room.
2. Open Firestore → Rules, paste the contents of this repository's firestore.rules file, and click Publish.
3. In Authentication → Sign-in method, enable:
   - Email/Password for teachers.
   - Anonymous for students to submit results without personal student accounts.
4. In Authentication → Settings → Authorized domains, ensure frofail-hlag.github.io is present.
5. In Authentication → Users, create a user for each teacher using the teacher's email and a temporary password. Teachers can sign in with these credentials.
6. Copy each teacher's Firebase UID from Authentication → Users. In Firestore → Data, create a collection named teachers. Create a document with the exact UID as its document ID, with these fields:
   - active — Boolean — true
   - email — String — teacher's email address
   - displayName — String — teacher's display name
   The teacher account cannot edit its own allow-list document. Add or disable teachers through the Firebase Console only.
7. challenges and challengeResults collections are created automatically when the first documents are saved.

## Data and access model
- Anyone can read published challenges only.
- Only Firebase teacher accounts with an active teachers/{uid} document can read drafts or create/edit/archive challenges and view submitted results.
- Student results are created through Firebase Anonymous Authentication. Students do not need email accounts. Results are not readable by other students.
- Result names should be a first name or team name only; avoid full names or other identifying details, especially for children.
- Draft/published state and challenge questions are stored in Firestore. The app keeps a browser cache for offline/fallback use, but Firestore is the shared source after a successful sync.
- Existing local challenges on the teacher's device are merged and uploaded during the first successful teacher sync when not already in Firestore. Review the teacher challenge list after initial sync.
- If Firebase is not set up or a write fails, the app keeps local data and displays a sync warning. A local change is not considered shared until Firebase reports a successful sync.

## Security
Do not use permissive rules such as “allow read, write: if true”. Do not put service-account keys in this repository. The browser Firebase config is public by design; Firestore Rules enforce access. The separate Financial Money Plan Firebase project/database is not used by this app.

## Current versions
- Bibel Escape Room: existing game engine and three starter missions retained.
- Bibel-Challenge: separate, self-paced bilingual reading activities, 3–4 questions, passage access, feedback, explanations and cross-device results.
- Teacher login uses Firebase Email/Password and an explicit teacher allow-list.
- AI Assistant V3.3 remains paused.


## Personalized teacher greeting
After successful Firebase teacher sign-in, the displayName returned from the Firestore teachers/{uid} profile is shown as a greeting across the teacher dashboard, activity selector, challenge manager, challenge editor and results page. The name is HTML-escaped before rendering.
