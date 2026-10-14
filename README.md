# Bibelreise V3.5.9 — Readable JSON Repair Output

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
- Bibel Escape Room: existing game engine and three starter missions retained; the prompt offers 3–10 puzzles (each count from 3 through 10), and the add-puzzle function prevents exceeding 10.
- Bibel-Challenge: separate, self-paced bilingual reading activities, 3–10 questions, passage access, feedback, explanations and cross-device results.
- Teacher login uses Firebase Email/Password and an explicit teacher allow-list.
- Direct AI/API integration remains paused; V3.5.0 adds manual prompts in German, Arabic or English, with German/Arabic game output and a copyable JSON syntax-repair prompt.


## Personalized teacher greeting
After successful Firebase teacher sign-in, the displayName returned from the Firestore teachers/{uid} profile is shown as a greeting across the teacher dashboard, activity selector, challenge manager, challenge editor and results page. The name is HTML-escaped before rendering.


## Teacher self-registration and approvals (V3.2.7)

- The teacher login page now offers Anmelden and Neues Konto erstellen.
- New teachers register a display name, email and password (minimum 8 characters), then confirm their email address. Signing up does not grant teacher permissions.
- After email verification, the new teacher signs in once; the app marks their request as verified and keeps it pending until an admin approves it.
- An active admin can open the Lehrerverwaltung screen from the teacher activity selector. Pending requests show display name, email and verification state. Unverified requests cannot be approved. Approve grants regular teacher access; Reject blocks the request.
- Approved teachers cannot promote themselves or others to admin. Admin status is set only in Firestore by a trusted project administrator.
- For the first admin, edit the existing document at teachers/{your Firebase Auth UID} and add admin (Boolean) = true. Keep active (Boolean) = true, displayName and email. This account remains a regular teacher as well.
- Publish the current firestore.rules from this repository in Firebase Console → Firestore Database → Rules before allowing new registrations. Enable Email/Password and ensure the GitHub Pages domain is in Auth authorized domains.
- Firestore requests are stored in teacherRequests/{uid}. Approved teacher profiles are stored in teachers/{uid}. Requests and teacher records cannot be self-approved from the client.


## Teacher account cleanup (V3.2.8)

The trusted Firebase Functions in `functions/index.js` add two cleanup paths. Both run in `europe-west3` (Frankfurt), matching the project's Firestore location. The web app calls the callable function in that same region:

- `cleanupTeacherDataOnAuthDelete` removes `teacherRequests/{uid}` and `teachers/{uid}` after an individual Firebase Authentication account is deleted. This runs only for deletions that occur after the function has been deployed.
- `cleanupOrphanTeacherRecords` is callable only by an active admin. It compares the UIDs in Firebase Authentication with document IDs in `teacherRequests` and `teachers`, deleting only documents for which no Authentication account exists. Use the **🧹 Verwaiste Konten bereinigen** button in Lehrerverwaltung to clean up older leftovers, including test users deleted before the trigger was installed.

The cleanup is deliberately limited to these two teacher-account collections; it does not delete Bible challenges or student results. The action is permanent and requires an administrator confirmation in the app.

### Deploy the cleanup functions

Cloud Functions for Firebase requires the project to be on the **Blaze** plan with a linked billing account. Firebase currently includes a no-cost Cloud Functions quota, but usage beyond no-cost quotas can be billed. Consider setting a budget alert before deployment. See the [official Firebase pricing information](https://firebase.google.com/pricing) and [Authentication deletion-trigger guide](https://firebase.google.com/docs/functions/1st-gen/auth-events).

From Google Cloud Shell or a terminal with Node.js installed:

```bash
git clone https://github.com/frofail-hlag/Bible-Escape-Room-Game.git
cd Bible-Escape-Room-Game
npm install -g firebase-tools
firebase login
npm --prefix functions install
firebase deploy --only functions
```

The repository's `.firebaserc` targets project `bible-escape-room`. The cleanup functions are configured for `europe-west3` (Frankfurt), not `us-central1`. Verify the selected project and billing account before deployment. After deployment, sign in as the administrator, open **Lehrerverwaltung**, and click **🧹 Verwaiste Konten bereinigen**. The result message reports how many orphaned requests and teacher profiles were deleted. Do not manually delete Figo's remaining Firestore documents before this test if you want to verify the cleanup result.


## Bibelreise branding (V3.2.9)

- The PWA is branded as **Bibelreise · رحلة في الكتاب المقدس** to represent the broader Sunday School app beyond the original Escape Room game.
- `icon.png` is the app icon (cross, open Bible, and a journey path).
- `welcome-banner.webp` is displayed on the role-selection welcome screen, with the English heading translated into German while retaining the Arabic title.
- The PWA manifest, browser icon, Apple touch icon, app header and service-worker cache have been updated. Game logic, Firebase Functions, authentication, Firestore rules and database collections are unchanged.


## Guided ChatGPT prompt builder (V3.4.0)

- The Escape Room and Bibel-Challenge teacher dashboards and individual editors provide **🧠 ChatGPT-Prompt erstellen**.
- The form collects age group, Bible story/topic, Bible passage, learning objective, difficulty, number of puzzles/questions, and optional teacher notes.
- It builds a German prompt asking ChatGPT to create bilingual German/Arabic content matching the existing `bibelreise-ai-v1` JSON schema. The Escape Room prompt includes the clue-fragment/final-code rule.
- Teachers copy the prompt into their own ChatGPT conversation, refine it as needed, then paste ChatGPT's JSON into **📥 JSON-Entwurf importieren**.
- Bibelreise makes no AI/API request in this workflow and needs no OpenAI API key. The existing validation, preview, and explicit draft import flow remain in place. Activities are never published automatically.
- Direct Sign in with ChatGPT / plan-usage integration is a separate optional future track and is not required for the guided prompt builder.


## Readable JSON repair output (V3.5.9)

- The syntax-repair prompt requests exactly one complete, readable JSON object inside a single Markdown code block labelled `json`, with no explanatory text outside the block.
- It also requires readable two-space indentation, straight ASCII double quotes, complete values and arrays, no trailing commas, and a final parseability check—the same formatting approach used by the initial generation prompt.
- The repair remains syntax-only: preserve all German and Arabic text, questions, answers, hints, explanations, fields, order and meaning. The importer still removes only an optional outer code fence and never silently repairs the JSON content itself.

## JSON repair output format (V3.5.8)

- The syntax-repair prompt now asks ChatGPT to return exactly one complete, readable JSON object inside a single Markdown code block labelled `json`, with no explanatory text outside the block.
- The repair remains syntax-only: preserve all German and Arabic text, questions, answers, hints, explanations, fields, order and meaning. The importer still removes only an optional outer code fence and never silently repairs the JSON content itself.

## Flexible question counts and multiple Bible passages (V3.5.7)

- Both guided activity types now offer each count from 3 through 10, inclusive (3, 4, 5, 6, 7, 8, 9, 10).
- The Bible-reference field is a multi-line text area. Teachers can specify an entire Bible book/all chapters, a chapter range such as `Daniel 2–4`, or selected passages from different chapters/books such as `Matthew 5:1–12; Matthew 6:25–34`.
- Prompt instructions require ChatGPT to treat the full combined reference list as the reading scope, distribute questions across it, and avoid inventing passages. Multiple references should be separated by semicolons or line breaks and each should repeat the book name.
- The student Bible links now support multiple semicolon/newline-separated references and chapter ranges; whole-book requests open at chapter 1, with the scope still displayed in the activity.
- The existing manual ChatGPT JSON-code workflow and validation remain unchanged.

## ChatGPT JSON code-block output and paste handling (V3.5.6)

- The guided prompt now asks ChatGPT to return exactly one complete JSON object inside a single Markdown code block labelled json, with no commentary before or after it.
- Teachers should use ChatGPT's **Copy code** control when available, then paste the JSON code into Bibelreise's importer.
- The importer accepts either the copied JSON body or one outer json code fence. It removes only that outer wrapper and trims whitespace; it does not rewrite JSON values, German/Arabic text, arrays, or question order.
- Invalid JSON still fails validation and can use the existing syntax-repair prompt. This change does not add direct AI/API access, API keys, or API billing.
- This version supersedes the older prompt instruction that forbade Markdown code fences.

## Explicit readable JSON reminder (V3.5.5)

- Adds the short instruction “Write it in a readable JSON format” near the top of the quality rules (translated to the selected prompt language), in addition to the detailed JSON formatting checklist. This mirrors the wording that was shown to improve real-world results during teacher testing.

## Pretty-printed JSON prompts (V3.5.4)

- Guided prompts in German, Arabic, and English now require pretty-printed JSON with exactly two spaces of indentation, with each property and array item on its own line.
- The model is told to use straight ASCII double quotes (U+0022), never curly quotation marks as JSON delimiters.
- Every key must have a valid value. Empty review notes and optional answer lists must use `[]`; German and Arabic option arrays must both be bracketed and have matching item counts.
- The generated prompt instructs ChatGPT to check brackets, commas, values, arrays, and overall parseability before returning the JSON, without Markdown fences or extra commentary.

## JSON missing-value diagnostics (V3.5.3)

- The importer now detects the specific malformed pattern `"reviewNotes": ,` and tells the teacher to use `"reviewNotes": []` when there are no notes.
- The JSON-repair prompt in German, Arabic, and English explicitly tells ChatGPT to fill missing values with schema-correct JSON values, preserve the `reviewNotes` field, and retain all German/Arabic content and question order.
- The service-worker cache was bumped so installed PWAs can receive the updated diagnostics.

## Multilingual prompt builder, selectable counts and JSON recovery (V3.5.0)

- Prompt language selector: Deutsch, العربية, English. Prompt instructions follow the selected language; the generated game always retains the German/Arabic JSON fields.
- Both game types previously offered a smaller set of prompt counts; V3.5.7 expands the options to every count from 3 through 10. Import validation and the Bibel-Challenge editor support up to 10 questions.
- Prompt instructions require strict JSON and forbid trailing commas, comments, Markdown fences, ellipses, and text outside the object.
- When JSON parsing fails, the importer can generate and copy a syntax-repair prompt in the selected language. It explicitly preserves German and Arabic content and asks ChatGPT to fix syntax only. Pasted JSON is never silently rewritten by the app.
- No API key, OpenAI API request, or direct account connection has been added.


### Firebase Rules update required for 5–10 question Bibel-Challenges (V3.5.1)

The repository's `firestore.rules` now permits up to 10 questions and result answers. **After this change is deployed to GitHub Pages, publish the updated rules in Firebase Console → Firestore Database → Rules.** Until the Firebase rules are published, challenges with more than four questions and their results can be rejected by Firestore. The client serializer in `firebase-service.js` now supports results with up to 10 questions.
