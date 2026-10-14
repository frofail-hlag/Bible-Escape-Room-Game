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
| Question count | Yes | Both game types: choose 3, 4, 6, 7 or 10 items (default 4) |

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

> Create the selected number of connected Escape Room puzzles (3, 4, 6, 7 or 10; default 4) for the requested Bible story and age group. Use a meaningful mix of the currently supported puzzle types: choice, truefalse, order, text, number, and bible. The puzzles should form a coherent learning journey, not random trivia. Each puzzle awards 100 points unless the brief says otherwise.
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
> The example above shows the shape only; the actual response must contain the selected number of well-written puzzles (3, 4, 6, 7 or 10; default 4). Include only the answer fields relevant to each puzzle type. For non-choice puzzles, use the correct type-specific fields listed above. Keep `status` as `draft`.

## 4. Bibel-Challenge output contract

The current Bibel-Challenge editor uses:
- Metadata: `title`, `titleAr`, `passage`, `instructions`, `instructionsAr`, `status`, `questions`.
- Each question has `type`, `q`, `qAr`, `hint`, `hintAr`, `explanation`, `explanationAr`, `points`, and type-specific answer fields.
- Supported types: `choice`, `truefalse`, `order`, `text`, `number`, `bible`.
- Bibel-Challenges support 3–10 questions; the prompt form offers 3, 4, 6, 7 or 10. New drafts stay unpublished.

### Bibel-Challenge-specific prompt

> Create a reading-based Bible Challenge with exactly the teacher-selected count (3, 4, 6, 7 or 10) questions, strictly based on the specified Bible passage. Start with clear bilingual instructions to read the passage. Use a useful mix of supported question types only when they suit the passage. Each question needs a correct answer and a short, age-appropriate explanation in German and Arabic. Distractors must be clearly wrong and not misleading.
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
> The example above shows the shape only; the actual response must contain the exact selected count (3, 4, 6, 7 or 10) of questions. For `truefalse`, `a` must be the string `"true"` or `"false"`. For `order`, include aligned `items` and `itemsAr` arrays in the intended correct order. For `text`, `number`, and `bible`, provide `a`, `aAr`, `accepted`, and `acceptedAr` as appropriate. For `choice`, `a` is the zero-based correct option index. Keep `status` as `draft`.

## 5. Initial importer implementation and validation requirements

The initial in-app importer is implemented in `ai-assistant.js`. It is available from the Escape Room teacher dashboard and from both the Bibel-Challenge teacher dashboard and editor. Challenge Bible-link injection is called directly after its relevant screens render to avoid asynchronous-render timing issues. The teacher pastes JSON, validates it, reviews a preview, and explicitly chooses to import it as a new draft. The importer creates local IDs and timestamps, forces draft status, and never publishes or overwrites an existing game automatically. Escape Room drafts are stored in the existing local game list. Bibel-Challenge drafts are stored locally and the importer attempts to save the draft to Firebase; if that fails, the local draft remains and normal teacher sync can retry.

The importer rejects or asks the teacher to correct the draft if:
- JSON is invalid, has the wrong `schemaVersion` or wrong `gameType`, or lacks the `draft` object.
- Required German or Arabic content is empty.
- Escape Room puzzle count is outside 3–10 or does not match the selected count (3, 4, 6, 7 or 10); a question uses an unsupported type; choice arrays differ in length; the correct choice index is out of range; or concatenated clue fragments do not match `final`.
- Bibel-Challenge has fewer than 3 or more than 4 questions; required text/options/answers are missing; choice arrays differ in length; the correct choice index is invalid; order arrays differ in length; or a correct answer cannot be identified.
- A Bible reference does not match the topic/passage or has a possible factual/theological ambiguity. These should be warnings for teacher review, not silently changed.
- The output sets `status` to anything other than `draft`. The importer should force draft status regardless.

On successful validation, the importer should show a preview/diff and require a teacher action before saving. It must not overwrite an existing game automatically. For an edit workflow, the teacher should explicitly choose whether to replace the existing questions or append selected ones.

## 6. Integration feasibility — separate track

**Research checked on 2026-10-14 against current official OpenAI documentation. Eligibility is not yet confirmed for Bibelreise.**

There are three separate capabilities; do not conflate them:

1. **Manual ChatGPT hand-off (available now):** The teacher copies the prepared prompt into a ChatGPT conversation, refines it, copies the resulting JSON into Bibelreise, validates the structure, reviews the preview, and explicitly imports it as a draft. The app does not read the conversation automatically. This path needs no API key and no separate AI/API billing.

2. **Use the teacher's ChatGPT Go plan from inside the hosted Bibelreise PWA (promising, but requires access approval):** OpenAI documents that Go, Plus, and Pro users can authorize eligible AI requests in participating third-party apps to count against usage included in their ChatGPT plan. This does not provide access to the teacher's ChatGPT conversations or memories, and it does not share an OpenAI API key. OpenAI's developer guidance says the self-registration flow is for open-source and locally hosted apps; developers offering this in a remotely hosted app should use the Sign in with ChatGPT interest form. Since Bibelreise is hosted on GitHub Pages, the current next step is to submit that form and wait for OpenAI's response before implementation. Approval is not guaranteed.
   - Official plan-use guidance: https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites
   - Official developer overview: https://developers.openai.com/siwc/token-sharing-open-source
   - Interest form: https://openai.com/form/sign-in-with-chatgpt-interest/

3. **Send a finished JSON draft from the current ChatGPT conversation directly into Bibelreise:** This is a separate ChatGPT app/custom MCP integration and should not be confused with Sign in with ChatGPT for usage inside the PWA. OpenAI's current help guidance says full MCP support with write/modify actions is available in beta for ChatGPT Business, Enterprise, and Edu. It is not currently documented as available for a personal Go plan, so do not make this the primary path for this project.

### Required cost and safety controls

- No OpenAI API key, paid API fallback, or silent fallback to credits.
- If the no-additional-API-cost path has not been approved or cannot be authorized for an account, keep the manual copy/paste workflow available and stop the AI request with a clear explanation.
- If plan usage is approved, require the teacher to explicitly authorize it and give them a clear way to set a low usage limit. Never assume access to ChatGPT conversations.
- Check the user's app-specific usage cap and the separate “allow apps to use credits” setting before tests. Do not enable credit usage or automatic credit purchases on the user's behalf.
- Every generated activity must remain a draft until a teacher reviews it and explicitly publishes it.

## 7. Current progress and next steps

1. **Complete:** Finalize prompt inputs and create one sample JSON fixture for each game type.
2. **Complete:** Standalone validator/preview page with Daniel sample fixtures.
3. **Complete and hands-on tested on 2026-10-14:** The in-app manual JSON import workflow for both game types. The user confirmed that both Daniel fixtures imported as drafts, and that validation, bilingual preview, gameplay, answers/scoring, hints/clues, completion/results, layout, and Bible-reference checks passed. Both Daniel activities must remain drafts until the full app development and final release review are complete.
4. **Implemented and previously tested:** Direct German SCH2000 and Arabic AVD Bible.com links are displayed on the Bibel-Challenge list, teacher editor, introduction and each question. Multi-chapter references such as Esther 4–7 offer a separate link for each chapter in both languages. The existing in-app two-language Bible reader remains available. Unrecognized references fall back to Bible.com rather than incorrectly opening John 1.
5. **Implemented, pending hands-on testing:** Guided teacher prompt builder is now available from both game-type dashboards and their individual editors. It collects age group, Bible story/topic, passage, learning objective, difficulty, question/puzzle count, and optional notes; it generates a schema-specific German prompt for the teacher to copy into their own ChatGPT conversation. The teacher then pastes the returned JSON into the existing in-app collector for validation, preview, and draft-only import. No app-to-ChatGPT request is made, and no AI/API billing is introduced by Bibelreise.
6. **Separate optional future track — direct ChatGPT plan integration:** Only if the user later wants teachers to sign in/connect ChatGPT and trigger AI requests directly from inside Bibelreise should we pursue the Sign in with ChatGPT interest form for the remotely hosted PWA. Approval and user authorization would be required for plan usage. This is not a prerequisite for the manual prompt-builder workflow described in item 5. Do not add an API key or paid fallback.
7. **Final publication gate:** Keep the Daniel Escape Room and Daniel Bibel-Challenge as drafts during development. Publish only after the remaining teacher-area work is complete and the final end-to-end release checklist passes.



## Guided prompt builder implementation (V3.4.0)

- Added a manual, no-API prompt builder to both the Escape Room and Bibel-Challenge teacher dashboards and each editor.
- Fields: age group, Bible story/topic, passage, learning objective, difficulty, requested puzzle/question count, and optional teacher notes.
- Generates a German prompt that asks ChatGPT for age-appropriate, equivalent German/Arabic content in the existing `bibelreise-ai-v1` JSON schema. Escape Room prompts also explain the clue-fragment/final-code rule; both activity types describe supported question types and required answer fields.
- Teacher explicitly copies the prompt to their own ChatGPT conversation, then copies the JSON response back into the existing importer. The app does not call ChatGPT, inspect conversations, use an API key, or invoke paid API usage.
- The JSON import validation, preview and draft-only persistence workflow remains the same. No activity is published automatically.
- Needs a live-browser check for prompt generation/copying, then a Daniel end-to-end regression test from prompt to draft import.


## Prompt language, count and JSON syntax recovery (V3.5.0)

- The prompt form offers German, Arabic and English. Its instruction text is generated in the selected prompt language.
- Regardless of the prompt language, the generated activity always uses the existing bilingual German/Arabic fields and the same `bibelreise-ai-v1` JSON schema.
- Both activity types offer these exact requested-count options: 3, 4, 6, 7 or 10. The importer accepts 3–10 items, and the Bibel-Challenge editor and publication checks support up to 10.
- Prompts explicitly prohibit Markdown fences, comments, ellipses, prose outside the JSON object and trailing commas before `}` or `]`.
- If pasted JSON fails to parse, the importer offers a copyable repair prompt in the currently selected prompt language. It asks ChatGPT to repair syntax only and preserve every German and Arabic field/value, meaning, ordering and item count. Bibelreise does not silently rewrite JSON.
- No direct ChatGPT or OpenAI API call has been added.
- Live testing is required: test all three prompt languages, all count choices, the malformed-JSON repair helper, and one 10-item activity of each game type. Keep all test activities as drafts.


Escape Room editor guard: a game can contain a maximum of 10 puzzles; its add-puzzle function prevents creating an 11th puzzle.
