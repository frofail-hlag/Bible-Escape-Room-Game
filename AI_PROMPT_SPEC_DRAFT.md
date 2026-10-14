# Bibelreise AI Assistant — Prompt and Import Specification (Draft)

**Status:** Living implementation specification. The PWA now includes a manual JSON import panel in the teacher dashboards, structural validation, a review preview, draft-only import for both game types, and direct German/Arabic Bible reading links in Bibel-Challenge. The ChatGPT button and any API-based generation are not implemented.

**Purpose:** Define a predictable bilingual content format for AI-assisted authoring of both existing game types. A teacher must review a generated draft before it is saved or published.

## 1. Constraints and design principles

- No OpenAI API key or API billing is introduced in this phase.
- The initial workflow is a no-cost manual hand-off: copy the guided prompt into ChatGPT, refine the content in the teacher's chosen chat, receive a structured JSON draft, paste it into a future import/preview step in Bibelreise, validate it, and review it.
- Generating/importing must never publish a game automatically. New AI content is always a draft.
- Output is German and Arabic side by side, in age-appropriate German and clear Modern Standard Arabic.
- Generate only fields supported by the current editor. The future importer generates IDs and timestamps locally; the model should not invent IDs.
- Bible references must be real and within the specified passage. Do not invent references or quote long Bible passages. Flag uncertainties in `reviewNotes`.
- The teacher remains responsible for checking biblical accuracy, suitability for the age group, and theological wording before publication.
- This is designed for a Coptic Orthodox Sunday School context when the teacher selects that context; do not present an interpretation as a direct Bible quotation.

## 2. Guided brief shared by both game types

The future AI panel should collect these inputs before preparing the prompt:

| Input | Required? | Guidance |
|---|---|---|
| Game type | Yes | Escape Room or Bibel-Challenge, detected from the editor |
| Age group | Yes | Teacher selects an age range or enters a custom range |
| Story / topic | Yes | A biblical person, story, theme, or lesson |
| Bible passage | Yes | Required passage or bounded reference |
| Learning objective | Recommended | What the children should understand or remember |
| Difficulty | Yes | Einfach, Mittel, Schwer |
| Special teacher notes | No | Lesson emphasis, classroom context, restrictions |
| Question count | Yes | Escape Room: choose 3–6 puzzles, default 4; Bibel-Challenge: choose 3 or 4 questions |

### Shared prompt instructions

> You are a careful Sunday School content designer for Bibelreise (رحلة في الكتاب المقدس). Create material for the specified age group and Bible passage. Produce complete German and Arabic content for every student-facing field. Use natural, age-appropriate German and clear Modern Standard Arabic. Keep both languages equivalent in meaning, not merely similar.
>
> Ground every factual question and answer in the given biblical passage. Do not invent verse references. Do not use ambiguous questions, trick questions, or distractors that could plausibly also be correct. Keep hints helpful without revealing the answer. Include a brief explanation when the game type supports it. If any detail requires verification, put it in `reviewNotes` and do not disguise uncertainty as fact.
>
> Return exactly one valid JSON object matching the requested schema. Do not include Markdown fences, comments, trailing commas, or prose before/after the JSON. Do not add unsupported fields inside `draft`. Do not create IDs, timestamps, or publish the game. The teacher must review the draft.

## 3. Escape Room output contract

The current Escape Room editor uses this game structure:
- Game metadata: `title`, `titleAr`, `ref`, `intro`, `introAr`, `color`, `duration`, `difficulty`, `status`, `puzzles`, `final`.
- Each puzzle uses `type`, `q`, `qAr`, `hint`, `hintAr`, `points`, `clue`, plus the answer fields appropriate to its type.
- Supported types: `choice`, `truefalse`, `order`, `text`, `number`, `bible`.
- For `choice`, `a` is the zero-based index of the correct option. German and Arabic option arrays must align index-for-index.
- For `truefalse`, `a` is the string `"true"` or `"false"`.
- For `order`, `items` and `itemsAr` list the events in the correct order; `correctItems` must match the intended German order.
- For `text`, `number`, and `bible`, provide `a` and `aAr`, and alternative accepted answers in `accepted` / `acceptedAr` where useful.
- Clue fragments must concatenate in sequence to the final code. Use simple uppercase Latin letters/numbers for clue fragments and `final` to avoid punctuation, spacing, and diacritic mismatches in the current answer comparison.

### Escape Room-specific prompt

> Create the selected number of connected Escape Room puzzles (3–6; default 4) for the requested Bible story and age group. Use a meaningful mix of the currently supported puzzle types: choice, truefalse, order, text, number, and bible. The puzzles should form a coherent learning journey, not random trivia. Each puzzle awards 100 points unless the brief says otherwise.
>
> Give each puzzle one short clue fragment. Concatenating the clue fragments in order must produce exactly the `final` value after removing spaces and punctuation and ignoring letter case. Use only simple uppercase Latin letters or digits for the fragments and final code. Do not put the full final code in any clue or hint.
>
> Return this envelope:
>
> ```json
> {
>   "schemaVersion": "bibelreise-ai-v1",
>   "gameType": "escape-room",
>   "reviewNotes": [],
>   "draft": {
>     "title": "German title",
>     "titleAr": "عنوان عربي",
>     "ref": "Bible reference",
>     "intro": "German introduction",
>     "introAr": "مقدمة عربية",
>     "color": "📖",
>     "duration": 15,
>     "difficulty": "Mittel",
>     "status": "draft",
>     "puzzles": [
>       {
>         "type": "choice",
>         "q": "German question",
>         "qAr": "السؤال بالعربية",
>         "opts": ["German option A", "German option B", "German option C"],
>         "optsAr": ["الخيار أ", "الخيار ب", "الخيار ج"],
>         "a": 0,
>         "hint": "German hint",
>         "hintAr": "تلميح عربي",
>         "points": 100,
>         "clue": "AB"
>       }
>     ],
>     "final": "ABCD"
>   }
> }
> ```
>
> The example above shows the shape only; the actual response must contain the selected number of well-written puzzles (3–6, default 4). Include only the answer fields relevant to each puzzle type. For non-choice puzzles, use the correct type-specific fields listed above. Keep `status` as `draft`.

## 4. Bibel-Challenge output contract

The current Bibel-Challenge editor uses:
- Metadata: `title`, `titleAr`, `passage`, `instructions`, `instructionsAr`, `status`, `questions`.
- Each question has `type`, `q`, `qAr`, `hint`, `hintAr`, `explanation`, `explanationAr`, `points`, and type-specific answer fields.
- Supported types: `choice`, `truefalse`, `order`, `text`, `number`, `bible`.
- Published challenges require 3–4 questions, so imported output must have 3 or 4; new drafts stay unpublished.

### Bibel-Challenge-specific prompt

> Create a reading-based Bible Challenge with 3 or 4 questions, strictly based on the specified Bible passage. Start with clear bilingual instructions to read the passage. Use a useful mix of supported question types only when they suit the passage. Each question needs a correct answer and a short, age-appropriate explanation in German and Arabic. Distractors must be clearly wrong and not misleading.
>
> Return this envelope:
>
> ```json
> {
>   "schemaVersion": "bibelreise-ai-v1",
>   "gameType": "bibel-challenge",
>   "reviewNotes": [],
>   "draft": {
>     "title": "German title",
>     "titleAr": "عنوان عربي",
>     "passage": "Bible reference",
>     "instructions": "German reading instructions",
>     "instructionsAr": "تعليمات القراءة بالعربية",
>     "status": "draft",
>     "questions": [
>       {
>         "type": "choice",
>         "q": "German question",
>         "qAr": "السؤال بالعربية",
>         "opts": ["German option A", "German option B", "German option C"],
>         "optsAr": ["الخيار أ", "الخيار ب", "الخيار ج"],
>         "a": 0,
>         "hint": "German hint",
>         "hintAr": "تلميح عربي",
>         "explanation": "Short German explanation",
>         "explanationAr": "شرح عربي قصير",
>         "points": 100,
>         "accepted": [],
>         "acceptedAr": []
>       }
>     ]
>   }
> }
> ```
>
> The example above shows the shape only; the actual response must contain 3 or 4 questions. For `truefalse`, `a` must be the string `"true"` or `"false"`. For `order`, include aligned `items` and `itemsAr` arrays in the intended correct order. For `text`, `number`, and `bible`, provide `a`, `aAr`, `accepted`, and `acceptedAr` as appropriate. For `choice`, `a` is the zero-based correct option index. Keep `status` as `draft`.

## 5. Initial importer implementation and validation requirements

The initial in-app importer is implemented in `ai-assistant.js`. It is available from the Escape Room and Bibel-Challenge teacher dashboards. The teacher pastes JSON, validates it, reviews a preview, and explicitly chooses to import it as a new draft. The importer creates local IDs and timestamps, forces draft status, and never publishes or overwrites an existing game automatically. Escape Room drafts are stored in the existing local game list. Bibel-Challenge drafts are stored locally and the importer attempts to save the draft to Firebase; if that fails, the local draft remains and normal teacher sync can retry.

The importer rejects or asks the teacher to correct the draft if:
- JSON is invalid, has the wrong `schemaVersion` or wrong `gameType`, or lacks the `draft` object.
- Required German or Arabic content is empty.
- Escape Room puzzle count does not match the teacher's selection (3–6, default 4); a question uses an unsupported type; choice arrays differ in length; the correct choice index is out of range; or concatenated clue fragments do not match `final`.
- Bibel-Challenge has fewer than 3 or more than 4 questions; required text/options/answers are missing; choice arrays differ in length; the correct choice index is invalid; order arrays differ in length; or a correct answer cannot be identified.
- A Bible reference does not match the topic/passage or has a possible factual/theological ambiguity. These should be warnings for teacher review, not silently changed.
- The output sets `status` to anything other than `draft`. The importer should force draft status regardless.

On successful validation, the importer should show a preview/diff and require a teacher action before saving. It must not overwrite an existing game automatically. For an edit workflow, the teacher should explicitly choose whether to replace the existing questions or append selected ones.

## 6. Integration feasibility — separate track

There are three different technical capabilities; they must not be conflated:

1. **Manual ChatGPT hand-off:** Works without a new API integration or additional AI/API billing. The teacher pastes the prepared prompt into their chosen ChatGPT conversation and pastes the resulting JSON back into the future importer. The web app cannot automatically read the conversation.
2. **Generate inside Bibelreise with included ChatGPT plan usage:** OpenAI documents a Sign in with ChatGPT flow for eligible applications. Eligibility depends on app type/partner requirements and supported plans. The current guidance says remotely hosted apps should use the interest form; the user’s ChatGPT Go eligibility for this particular integration must be confirmed before implementation. This route would generate a fresh request in Bibelreise; it does not import the user’s current ChatGPT conversation.
3. **Ask ChatGPT to send a finished draft directly to Bibelreise from the current conversation:** This needs a supported ChatGPT app/tool connection with a write action and a secure endpoint. Current custom MCP write-action availability is plan/workspace-limited, so this path is not assumed to work on the user’s personal ChatGPT Go plan. We must verify availability/approval before investing in it.

No route should have silent fallback to paid API usage. If no-cost plan usage is not authorized or reaches its limit, the feature must stop and explain that the user can retry later or use the manual copy/paste workflow.

## 7. Current progress and next steps

1. **Complete:** Finalize prompt inputs and create one example for each game type.
2. **Complete:** Standalone validator/preview page with Daniel sample fixtures.
3. **Implemented, needs hands-on verification:** In-app manual JSON import from both teacher dashboards, with validation, preview, generated IDs, and draft-only saving.
4. **Implemented:** Direct German SCH2000 and Arabic AVD Bible.com links are displayed on the Bibel-Challenge list, introduction and each question. Multi-chapter references such as Esther 4–7 offer a separate link for each chapter in both languages. The existing in-app two-language Bible reader remains available as well. Unrecognized references now fall back to Bible.com rather than incorrectly opening John 1.
5. **Next:** Test importing both sample JSON files through the actual app, verify editor preview and gameplay, then test Challenge draft sync and the two direct Bible links on desktop and mobile.
6. **Separate track:** Confirm the eligibility path for ChatGPT-plan usage or direct ChatGPT-to-app integration. Do not add an API key, paid fallback, or silent credits.
7. Add the eventual AI-assistance button/form only after these manual import checks pass and the no-additional-cost integration path is confirmed.
