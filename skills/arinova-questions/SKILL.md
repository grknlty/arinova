---
name: arinova-questions
description: Write multiple-choice practice sets for Arinova in its JSON format - 4 options, 1 correct answer and an explanation per question - in knowledge style (does the pupil know what the lesson taught) or Cito style (can the pupil reason with it), with optional pictures and the lesson document. Use when asked to make a test, quiz, toets, kennisvragen, Cito vragen, a Cito-stijl oefening or "vragen" from study material, a photo or PDF of a school page, a topic, or a lesson such as "Thema 7.1 Les 4", for Taal, Rekenen, Huiswerk, Topografie, Aardrijkskunde, Verkeer, Geschiedenis or Natuur en Techniek, groep 6-8.
---

# Arinova questions

Turn study material into one Arinova practice set: 4 options per question, 1 correct answer, 1 explanation. The output is a JSON study set that Arinova imports directly (upload or paste it under **Add material**, or send it with the `addStudySet` action).

A set has one of two test styles (`testStyle`):

- **`knowledge`** – checks that the pupil knows and understands what the lesson taught: its terms, facts, rules and examples.
- **`cito`** – practice in the style of the Cito tests: the pupil has to **reason with** the lesson content (observe, compare, classify, conclude, read carefully), not only recall it.

## Before writing

Work these out from the request or the material. Ask only if one cannot be guessed:

- **Subject** – one of `Taal`, `Rekenen`, `Huiswerk`, `Topografie`, `Aardrijkskunde`, `Verkeer`, `Geschiedenis`, `Natuur en Techniek`. Always this Dutch name.
- **Language** – `nl` (default), `tr` or `en`: the language of the school material, not of the chat.
- **Test style** – words like "Cito", "Cito-stijl" or "redeneren" mean `cito`; "kennis", "kennisvragen" or "wat ze moeten weten" mean `knowledge`. If the request says neither: for a lesson from a book (Thema/Les) ask, and use `cito` if you cannot ask; for anything else use `knowledge`. When the user asks for both, make two separate sets.
- **Theme and lesson** – as the book numbers them, e.g. `Thema 7.1` (name `Puur natuur`) and `Les 4` (name `Nieuwe diersoorten`), if the material says so.
- **Group** – e.g. `Groep 7`. A theme number usually tells you (Thema 7.x → Groep 7).
- **Number of questions** – default **30** for a book lesson, **10** otherwise; never more than 100.
- **Difficulty** – `easy`, `medium` or `hard` for that group; default `medium`.

Read the whole material first and list its **key concepts and rules** (for example the steps of a zoekkaart, the kenmerken of each group, the terms the lesson defines). Every question must test one of these. Use only facts from the material; general knowledge only when it is certain and at the level of the group.

## The question standard

Every question, in both styles, follows all of these:

1. **Exactly 4 options**, all different. No "all of the above", "none of the above" or "both A and B".
2. **Exactly 1 defensible answer.** The other three are clearly wrong for someone who knows the material; no option is "partly right". If a teacher could argue for a second option, rewrite it. Words like "kan", "waarschijnlijk", "volgens de zoekkaart" help keep the correct one strictly true.
3. **Every option is on topic and believable.** All 4 options come from the same category as the answer and from the lesson itself, so a pupil who has not learned the lesson cannot rule any of them out. Wrong options are built on real pupil mistakes: a nearby number, a neighbouring country or group, a related term from the same lesson, a word that looks similar, judging by habitat, colour or size, taking one feature for proof, mixing up observation and opinion. No silly, joke or off-topic options, and none that can be eliminated with common sense alone. See **Wrong options** below.
4. **Options alike** in length and form, so the correct one is not the longest or the only careful one. If the correct answer is a full sentence, so are the others.
5. **Never give the answer away.** The correct option must not repeat a fact the prompt already states, and must not be the only option using words from the prompt. Check especially "what information is still needed" questions.
6. **The prompt stands alone.** Tables, quotes and descriptions go in the prompt text; the pupil sees one question at a time. Never refer to "the text above" or another question.
7. **Clear language** at the pupil's level, one idea per question. Avoid double negatives; key words in capitals: `NIET`, `ZEKER`, `BESTE`, `EERST`, `ALLEEN`, `MEEST` (Turkish `DEĞİL` etc.).
8. **Explanation** – 1–2 sentences in the same language that say *why* the correct answer is right (name the deciding rule), and where useful why a tempting wrong option fails. Not just "The answer is B".
9. **Answer spread** – the correct answer about equally often at A, B, C and D (for 30 questions 7 or 8 each), no run of more than 2 at the same letter and no pattern.
10. **Names and settings vary** – different names (Mila, Sam, Noor, Daan, Isa, Ahmed …) and scenes, not the same one twice in a row.
11. **Rekenen** – work out every answer yourself first; wrong options are results of typical calculation mistakes; the explanation shows the steps.

### Wrong options

This is where most sets fail. A pupil who does not know the answer must still have to think about all 4 options; if they can find the answer by striking out options that obviously do not belong, the question tests nothing.

How to build them:

1. Name the **category** of the correct answer: a part of a cell, an animal group, a province, a year, a traffic sign, a calculation result.
2. Pick the 3 wrong options from that **same category**, preferably terms the **same lesson** also teaches, so each one sounds right to someone who half-knows the lesson.
3. Make each wrong option wrong for a **reason the lesson explains** (another part with another job, a group with a different kenmerk, a step in the wrong order), and use that reason in the explanation.
4. Test each wrong option: *could a pupil who never saw this lesson rule it out with common sense?* If yes, replace it.

Examples (Thema 7.1, a lesson about cells):

| Question | Bad options (easy to strike out) | Good options (all from the lesson) |
| --- | --- | --- |
| Wat geeft een plantencel stevigheid? | een celwand · een vin · een oog · een poot | de celwand · het celmembraan · de celkern · de vacuole |
| Wat zit er in de celkern? | erfelijk materiaal · zand · zonlicht · water uit de zee | erfelijk materiaal · bladgroen · celvocht · zetmeel |
| Wat is de kleinste bouwsteen van een organisme? | een cel · een blad · een wortel · een bot | een cel · een celkern · een weefsel · een orgaan |

In the bad rows the pupil only has to see which option is about cells; in the good rows they must know what each part does. The same goes for every subject: a Topografie question offers 4 real places in the same region, a Geschiedenis question 4 events or years from the same period, a Rekenen question 4 results of plausible calculations, a Taal question 4 real words of the same kind.

### Knowledge style (`knowledge`)

A knowledge question checks one thing the lesson teaches, asked directly. Cover the key concepts evenly, so every important term, fact and rule gets at least one question. Mix:

- **Begrip** – what a term means: "Wat is een ongewerveld dier?"
- **Feit** – a fact from the lesson: "Welk kenmerk hebben alle vogels?"
- **Herkennen** – which example belongs to a group or rule: "Welk dier is een weekdier?"
- **Indeling** – which feature separates two groups: "Waarin verschilt een reptiel van een amfibie?"
- **Volgorde** – the steps or order the lesson gives: "Welke vraag staat als eerste op de zoekkaart?"
- **Simple application** – one short case with one step: "Een dier heeft veren. Bij welke groep hoort het?"

Keep prompts short, in the words the lesson uses. Short questions make weak wrong options easy to spot, so here especially all 4 options must be terms from the same lesson and the same category (see **Wrong options**).

### Cito style (`cito`)

A Cito question gives the pupil a small situation and asks them to apply what the lesson taught. Prefer "Noor vindt een dier met …. Bij welke groep hoort het?" over "Wat is een weekdier?"; at most a fifth of the set may be plain recall. Mix the types in [references/question-types.md](references/question-types.md); for 30 questions use at least 7 types and no more than 6 questions of one type. Most-used:

- **Toepassen** – a new case (an unknown animal, a map, a situation) to classify or solve with the lesson's rule.
- **Waarneming of mening** – which statement is an observation, opinion, assumption or hypothesis.
- **Gegevens lezen** – a small table or list in the prompt (`Tabel: A: …, B: …`) that the pupil combines.
- **Conclusie trekken** – which conclusion is best supported, or what you can say for **ZEKER**.
- **Redenering beoordelen** – a pupil says something wrong; which argument shows best why.
- **Volgorde / eerste stap** – what you check **EERST**, or what information is still needed.
- **Uitzondering** – an example that breaks a simple rule (vogelbekdier, vleermuis, pinguïn).
- **Begrijpend lezen** – the function of a signal word (`hoewel`, `daarom`, `want`) or the best summary of a short quote.

## Output format

Reply with one JSON object in one ```json block, nothing else in it:

```json
{
  "title": "Thema 7.1 Puur natuur – Les 4 Nieuwe diersoorten – Cito",
  "subject": "Natuur en Techniek",
  "language": "nl",
  "description": "30 CITO-stijl vragen over observeren, kenmerken en het classificeren van gewervelde en ongewervelde dieren (Les 4).",
  "theme": "Thema 7.1",
  "lesson": "Les 4: Nieuwe diersoorten",
  "group": "Groep 7",
  "testStyle": "cito",
  "testType": "single-choice",
  "difficulty": "medium",
  "addedDate": "2026-11-08",
  "questionCount": 30,
  "material": "",
  "materialDoc": null,
  "questions": [
    {
      "prompt": "Een bioloog ontdekt een klein dier. Het heeft geen ruggengraat, maar wel een hard skelet aan de buitenkant en poten met gewrichten. Welke conclusie past het best bij deze gegevens?",
      "image": null,
      "options": [
        "Het is een geleedpotige.",
        "Het is een zoogdier.",
        "Het is een weekdier.",
        "Het is een amfibie."
      ],
      "optionImages": [null, null, null, null],
      "correctIndex": 0,
      "explanation": "Een geleedpotige heeft geen ruggengraat, maar wel een uitwendig skelet en gelede poten."
    }
  ]
}
```

| Field | Rule |
| --- | --- |
| `title` | Up to 150 characters. A book lesson: `Thema <nr> <themanaam> – Les <nr> <lesnaam> – Cito` or `… – Kennis`, with en dashes. Otherwise short and clear, e.g. `Verkeer – voorrang (les 4)` |
| `subject` | One of the eight Dutch subject names |
| `language` | `nl`, `tr` or `en` |
| `description` | One sentence, e.g. `30 CITO-stijl vragen over … (Les 4).` or `10 kennisvragen over …`; up to 1000 characters |
| `theme` | `Thema <nr>` only, e.g. `Thema 7.1`, so sets of one theme group together; leave out if there is none |
| `lesson` | `Les <nr>: <lesnaam>`, or e.g. `Les 3 tot en met 5`; leave out if there is none |
| `group` | `Groep 7`, or a range like `Groep 7–8` |
| `testStyle` | `knowledge` or `cito` |
| `testType` | Always `single-choice` |
| `difficulty` | `easy`, `medium` or `hard` |
| `addedDate` | Today, `YYYY-MM-DD` |
| `questionCount` | Must equal the number of questions, or Arinova refuses the set |
| `material` | Optional "Learn first" text the pupil reads before the questions: a short summary of the key rules, `\n` for new lines; `""` if not wanted |
| `materialDoc` | The lesson document (PDF or Word), or `null`; see **Pictures and documents** |
| `questions[].prompt` | The question |
| `questions[].image` | A picture for the question, or `null` |
| `questions[].options` | Exactly 4 strings, shown as A–D; no "A." in the text |
| `questions[].optionImages` | One picture or `null` per option: always 4 entries |
| `questions[].correctIndex` | Counting from 0: 0 = A, 1 = B, 2 = C, 3 = D |
| `questions[].explanation` | Why the correct answer is right |

Do not add `source`, a top-level `fileName` or other fields. Arinova also knows the test types `true-false` (2 options), `multiple-choice` and `type-answer`, but this skill writes only `single-choice`.

### File name

When you save the set as a file, or tell the user what to save it as, name it from its fields, joined by ` – ` (space, en dash, space):

`<subject> – <theme> <themanaam> – <lesson> – <questionCount> vragen – <testStyle> – <addedDate>.json`

For example `Natuur en Techniek – Thema 7.1 Puur natuur – Les 4 Nieuwe diersoorten – 30 vragen – Cito – 2026-11-08.json`. Write the lesson without the colon, the test style as `Cito` or `Kennis`, and "vragen" in the language of the set (`soru` for `tr`, `questions` for `en`). Leave out parts the set does not have (no theme → no theme part) and characters not allowed in file names (`/ \ : * ? " < > |`).

### Pictures and documents

Write `materialDoc`, `image` and `optionImages` in every set, as Arinova's own export does: `null` (and `[null, null, null, null]`) when there is nothing, real data when there is.

**Pictures** (`image`, `optionImages`):

- A base64 data URL: `data:image/png;base64,…`, also `image/jpeg`, `image/webp` or `image/gif`. No SVG and no links to websites.
- At most about 1 MB per picture (1,500,000 characters of data URL).
- Use them when the user gives pictures, or when the material has a picture a question needs: a map for Topografie, a verkeerssituatie, a diagram, a photo of an animal to classify. Crop to the part that matters.
- With option pictures, the option texts are still required: give each a short label (`Kaart 1`, `Kever`) so the question works when pictures are small.
- Write the prompt so it points at the picture ("Welk land is rood gekleurd op de kaart?") and still makes sense on a phone.
- Only put in a picture when you have the real image file and encode it (e.g. `base64 -i foto.png`). Never invent or shorten base64 text; if you cannot encode files, keep `null` and tell the user which questions need a picture.

**Lesson document** (`materialDoc`): the lesson page or chapter, which the pupil can open next to the practice. One of:

- `null` – no document.
- An https link: `"materialDoc": "https://…/les-4.pdf"`.
- A file with its name: `"materialDoc": { "fileName": "Les 4 Nieuwe diersoorten.pdf", "mimeType": "application/pdf", "data": "<base64>" }`. Types: PDF (`application/pdf`), Word `.docx` (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`) or `.doc` (`application/msword`). The data must be the real file; Arinova checks its first bytes.
- At most about 3 MB of file (4,000,000 characters of base64).

When the user gives the lesson as a PDF or Word file, put that file in `materialDoc` if you can encode it; otherwise leave `null` and mention they can add it in Arinova. Keep the whole JSON file under about 4 MB, or the upload fails: with many pictures, make them smaller or use fewer.

## Check before you answer

If you can run code, save the JSON and run `python3 scripts/check_set.py <file>`; fix every error and look at every warning. Then, or otherwise by hand, check each question:

- [ ] 4 different, non-empty options; `correctIndex` points to the option that is really correct (count again from 0)
- [ ] Only that option is correct; the prompt does not already state it
- [ ] All 4 options are from the same category and on the lesson's topic; no wrong option can be struck out with common sense alone, without knowing the lesson
- [ ] `cito`: it asks the pupil to reason with a lesson rule (at most a fifth recall). `knowledge`: it checks one key concept, and together the questions cover all of them
- [ ] The correct option is not clearly the longest
- [ ] Explanation gives the reason, in the language of the question
- [ ] Across the set: answers spread evenly over A–D, no run longer than 2; no two prompts nearly the same
- [ ] Every question has `image` and 4 `optionImages` entries, each `null` or a real PNG/JPEG/WebP/GIF data URL; `materialDoc` is `null`, an https link or a real PDF/Word file
- [ ] `subject` is one of the eight names; `language` matches the text; `questionCount` matches; `testStyle` matches the title; the JSON is valid (double quotes, no trailing commas, no comments)

After the code block, give the file name and one line: number of questions, the count at A/B/C/D, and the question types used. If you can write files, also save the JSON under that name. If the user wants the test as a Word file instead, use the layout in [references/word-layout.md](references/word-layout.md).
