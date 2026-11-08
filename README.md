# Nova

A private family learning space: study notes, tablet-friendly multiple-choice practices, and a parent dashboard that records correctness **and** confidence. Dutch is the default UI language, with Turkish and English throughout. Content retains its author’s language; changing the UI language does not translate school material.

## Run locally

Requires Node.js 22+ and npm.

```sh
npm ci
npm run dev
```

With no login or database configuration, this is an explicitly labelled **local demo**, with the parent interface enabled and data retained in ignored `.data/store.json`. It is a single-process development store, not shared/cloud storage. It starts empty; import a set to practise. No external AI API is called, and there are no analytics or trackers.

```sh
npm test
npm run typecheck
npm run build
npm run test:e2e # requires Chromium; set CHROMIUM_PATH if needed
```

For database integration tests, run a disposable local PostgreSQL instance and pass `TEST_DATABASE_URL` to `npm test`. The suite verifies saved sets/results, login throttling, and row-level security under anonymous-role grants. `TEST_DATABASE_URL` also enables PostgreSQL in `npm run test:e2e`; use a **separate empty local database** for that browser run. Both runners reject non-local test database URLs. Without `TEST_DATABASE_URL`, unit tests report the PostgreSQL integration test as skipped and browser tests use a temporary local file store.

For production-mode local testing, supply the same variables as Vercel and a PostgreSQL database, then `npm run build && npm start`. No production demo bypass exists.

## Deploy to Vercel

1. Import the GitHub repository into Vercel with framework **Next.js** and Node.js **24.x**. Repository root is the project root. The checked-in `vercel.json` explicitly selects the Next.js framework, `npm ci`, `npm run build`, and `.next` output, overriding an incorrect `public` output setting. Leave the root directory as `./`; do not configure a static export.
2. Add a managed PostgreSQL database (for example Supabase or Neon through Vercel Marketplace). The Supabase integration’s `POSTGRES_URL` works automatically, or set a pooled connection string as `DATABASE_URL` (which takes precedence). Both storage and login throttling use that connection; preserve the provider’s TLS verification settings. Supabase hosts (`*.supabase.com`, `*.supabase.co`) are verified against the bundled Supabase Root 2021 CA (`lib/supabase-ca.ts`), since Node does not trust that private CA by default; other providers use the system trust store. The app creates its tables on first use (see **Database tables** below). The database user must own the application tables and have table creation permission. Tables are created with row-level security enabled in the same transaction: the owner connection can use them, while Supabase’s anonymous/authenticated API roles have no access policies. Browser code does not use Supabase API keys.
3. Configure these **server-only** environment variables in Vercel:
   - `DATABASE_URL` or `POSTGRES_URL`: PostgreSQL connection URL (one is sufficient).
   - `PARENT_PASSWORD`: a strong unique parent password.
   - `LEARNER_PASSWORD`: a separate learner password.
   - `SESSION_SECRET`: at least 32 random characters (`openssl rand -hex 32`).
   - `IMPORT_API_TOKEN`: a different random token of at least 32 characters; needed only for API imports.
4. Deploy. Import a set as Parent, sign in as Nova to finish it, then as Parent again to verify that the result and confidence appear. This verifies database persistence as well as deployment.

Passwords and keys go in Vercel settings, never Git, browser code, or chat. Parent login can import material and see all attempts; learner login can study and submit attempts. Signed, HttpOnly, SameSite cookies expire after one day. Answer keys are removed from learner set responses and grading happens on the server. This version supports **one family and one learner**. Login attempts are rate-limited in PostgreSQL. Rotate SESSION_SECRET to invalidate existing sessions. The import token authorizes creating sets only.

## Database tables

With PostgreSQL, content and answers are stored relationally:

| Table                           | Columns                                                                                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `arinova_groups`                | `id`, `name`                                                                                                                                                                                      |
| `arinova_subjects`              | `id`, `subject_name`, `group_id`                                                                                                                                                                  |
| `arinova_users`                 | `id`, `name`, `user_name`, `role` (`parent`/`learner`), `group_id`                                                                                                                                |
| `arinova_tests`                 | `id`, `subject_id`, `title`, `description`, `material`, `language`, `is_sample`, `created_at`, `source`, `file_name`, `lesson`, `group_id`, `test_type`, `difficulty`, `added_date`, `deleted_at` |
| `arinova_questions`             | `id`, `subject_id`, `test_id`, `position`, `question_text`, `explanation`, `answer_count`, `image`                                                                                                |
| `arinova_options`               | `id`, `question_id`, `position`, `option_text`, `is_answer`, `image`                                                                                                                              |
| `arinova_attempts`              | `id`, `user_id`, `test_id`, `correct`, `total`, `created_at`                                                                                                                                      |
| `arinova_user_question_answers` | `id`, `attempt_id`, `user_id`, `question_id`, `options_id` (null when skipped), `is_correct`, `confidence`, `answered_at`                                                                         |

A test is one toets; an attempt is one practice session through it. The parent and learner sign-in roles each have a user row, seeded on first use; set `LEARNER_NAME` and `LEARNER_GROUP` to change the defaults (`Nova`, `Groep 7–8`). Sets and attempts saved by earlier versions in `arinova_records` are copied into these tables once and kept there with kind `sets_migrated`/`attempts_migrated`.

Example: questions answered wrong most often.

```sql
SELECT q.question_text, count(*) FILTER (WHERE NOT a.is_correct) AS wrong, count(*) AS answered
FROM arinova_user_question_answers a
JOIN arinova_questions q ON q.id = a.question_id
JOIN arinova_users u ON u.id = a.user_id AND u.role = 'learner'
GROUP BY q.id ORDER BY wrong DESC LIMIT 20;
```

## Add study material

In the parent’s **Add material** tab, upload a Word test (.docx), download the example JSON, or upload/paste a JSON study set.

Below the upload box, **Added material** lists every set, newest first: when and how it was added (Word file, JSON, or ChatGPT/API), its file name, subject, number of questions and how often it was practised. **Delete** removes a set from the learning space after a confirmation; Nova’s results for it stay in Progress, and **Restore** puts it back. Each practice card shows the number of questions, options per question, subject, lesson, group and date added. Lesson and group come from the material (a Word header such as “Les 3 tot en met 5 • Groep 7–8”, the JSON fields `lesson` and `group`, or the generated format’s `lessons`); for older sets they are read from the title or description. Changing the interface language translates the app’s labels, not the school material.

### Word tests

A Word file can hold one or more tests. Each test has a title (Title or Heading style), numbered questions (`1. …`) with options on their own lines (`A. …` to `F. …`), and an answer key under a heading starting with **Antwoorden** (or Answers/Cevaplar) with lines like `1. B  Optional explanation`. A question can instead give its answer on a line `Antwoord: B`. Questions may sit in table cells. The subject is taken from the title (for example _Verkeer toets 1_). The file is read on the server (max 4 MB) and shown for checking; nothing is saved until the parent presses save. Before saving, a long test can be split into practices of about 5, 10 or 20 questions, titled “… (deel 2/4)”. Questions without an answer are reported by number.

### Generated JSON with pictures

Files in the generated “toets” layout are read as well: `{ subject, title, toetsname, language, lessons, questions: [{ question, image, options: [{ option1, isExpectedAnswer: "yes" | "no", explanationIfExpected, image }] }] }`, or several under `{ "tests": [ … ] }`. Each question needs exactly one expected answer. An `image` is `{ "mimeType": "image/png", "encoding": "base64", "data": "…" }` or a data URL; PNG, JPEG, WebP and GIF are accepted (no SVG), up to about 1 MB each and 4 MB per upload. Pictures are stored in the database and served from `/api/images/{set}/{question}[/{option}]` to signed-in users only. If a file is rejected, the page names the question and the problem.

### JSON

A set contains a study text and 1–100 questions. Every question has 2–6 options, a zero-based correctIndex, an optional explanation, and optionally an `image` (data URL) and `optionImages` (one data URL or null per option, shown small beside the option). `null` means no picture. An exported set lists `image` and `optionImages` for every question, with `null` where there is no picture, so a picture can be dropped into place and the file imported again. The interface accepts up to 4 MB per upload.

A set may also have a `materialDoc`: the lesson material as a PDF or Word (`.doc`, `.docx`) document, shown as a link under “Study notes”. Give it as `{ "fileName": "Les 3.pdf", "mimeType": "application/pdf", "data": "<base64>" }`, as `{ "fileName": "…", "url": "data:application/pdf;base64,…" }`, as a data URL on its own, or as an `https://` link to where the document is kept (useful for documents too large for the 4 MB upload). Files are checked by their first bytes and served from `/api/documents/{set}` to signed-in users only: a PDF opens in the browser, a Word file downloads. `null` means no document, and an export writes `materialDoc` right after `material`, `null` when there is none.

General information about the set is optional: `questionCount` (checked against the questions, not stored), `testType` (`single-choice`, or `true-false` with 2 options per question; `multiple-choice` and `type-answer` are refused for now), `difficulty` (`easy`, `medium`, `hard`), `lesson`, `group` (for example `Groep 7`) and `addedDate` (`YYYY-MM-DD`, the day the test was made). The practice card shows the test type, difficulty and this date; without `addedDate` it shows the import date. `skills/arinova-questions` is a skill for ChatGPT or Claude that writes tests in this format.

```json
{
  "title": "Zelfstandige naamwoorden",
  "subject": "Taal",
  "language": "nl",
  "description": "Oefenen met mensen, dieren en dingen.",
  "material": "Een zelfstandig naamwoord is een woord voor een mens, dier, ding of plaats.\n\nVoorbeeld: het boek.",
  "questions": [
    {
      "prompt": "Welk woord is een zelfstandig naamwoord?",
      "options": ["Boek", "Rennen", "Snel"],
      "correctIndex": 0,
      "explanation": "Een boek is een ding. Je kunt zeggen: het boek."
    }
  ]
}
```

Supported content languages: `nl`, `tr`, `en`. All content is rendered as plain text, never executed as HTML. Study notes can also be printed from the study view.

### Upload from ChatGPT

ChatGPT cannot reach the site from an ordinary chat: pasting the key into a chat makes it try its own sandbox, which has no internet access (“The outbound call did not succeed”). Use a custom GPT with an action instead:

1. In ChatGPT, **Explore GPTs → Create → Configure → Create new action**.
2. **Import from URL**: `https://arinova.vercel.app/openapi.json` (use the production address; preview addresses are behind Vercel’s login).
3. **Authentication → API Key → Bearer**, and paste the value of `IMPORT_API_TOKEN`. Keep the key only there and in Vercel, never in a chat.
4. Ask the GPT to add a test; it calls `addStudySet` and the test appears in the learning space. A refused call returns an `error` that says whether the key is missing, has the wrong type, is wrong, or imports are switched off on the server.

### API

The authenticated ingestion endpoint allows a future assistant integration to add prepared questions directly. Keep the bearer token server-side. It does not connect this chat automatically to your website: an authenticated integration/action must be configured separately once a deployed URL exists.

```sh
curl --fail-with-body "$ARINOVA_URL/api/sets" \
  -H "Authorization: Bearer $IMPORT_API_TOKEN" \
  -H 'Content-Type: application/json' \
  --data-binary @study-set.json
```

- `POST /api/sets`: parent cookie or import token; returns `{ "id": "…" }`, status 201. An array of up to 50 sets is saved in one transaction and returns `{ "ids": […] }`.
- `GET /api/format`: public; the study set format as `{ schema, subjects, example, rules }` (JSON Schema, a set that imports as it is, and the writing rules).
- `POST /api/format`: parent cookie or import token; checks a set (or an array) without saving it. Returns `{ "valid": true, "questionCounts": […], "set": … }` with the set as it would be stored, or status 400 with `{ "valid": false, "error": "…" }`.
- `PATCH /api/sets/{id}`: parent only; body `{ "deleted": true }` hides a set from the learning space (answers are kept), `false` restores it.
- `POST /api/import`: parent cookie or import token; body is a .docx file. Returns the draft sets without saving them.
- `GET /api/sets`: signed-in parent/learner; learner response omits answer keys.
- `POST /api/attempts`: signed-in parent/learner; body `{ "setId": "…", "answers": [{ "option": 0, "confidence": "sure" }] }`. Submit one entry per question, in order. Options are zero-based; `null` is allowed only with `not_understood`.
- Confidence values: `sure`, `unsure`, `best_guess`, `not_understood`.
- `GET /api/progress`: parent only; complete attempt history including per-question feedback.

While practising, Nova can tick “I don’t understand the question” (which also lets her skip it) or “I’m not sure about my answer”; both are optional, and no tick is recorded as `sure`. Leaving a practice keeps her place and answers in that browser, so starting it again continues at the same question; finishing it clears this. Correctness and confidence are independent: a guessed correct answer remains a learning signal. Unanswered questions count separately from incorrect choices. The dashboard includes repeated attempts and records timestamps; it is not a claim of mastery.

## Current scope and next steps

This is a first working version. Screenshots/PDFs from school can be shared in chat to prepare reviewed study-set JSON, then imported. Existing ChatGPT projects cannot be read automatically from this repository. Pictures inside Word tests, direct photo/PDF storage, automatic OCR/question generation, free-text answers, multiple learner profiles, content editing/deletion, and spaced repetition are future work. Do not treat the sample as age- or curriculum-specific school material.

A database backup/export policy should be configured with the database provider before retaining important learning history. Production deployment and a real cross-device check require a Vercel project and database credentials; a local build does not establish those capabilities.
