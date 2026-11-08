---
name: arinova-cito
description: Write a Cito-style practice set for one school lesson in Arinova's JSON format - usually 30 reasoning questions (4 options, 1 correct, explanation) for a Thema and Les of a method like Blink, Naut or Meander, for groep 6-8. Use when asked for "Cito vragen", a Cito toets, Cito-stijl oefening, or a question set for "Thema 7.1 Les 4" and similar, from a lesson page, photo, PDF or topic, for Natuur en Techniek, Aardrijkskunde, Geschiedenis, Verkeer, Taal, Rekenen or Topografie.
---

# Arinova Cito lesson set

Turn one lesson into one Arinova practice set in the style of the Cito tests: the pupil has to **reason with** the lesson content (observe, compare, classify, conclude, read carefully), not only recall it. The output is a JSON study set that Arinova imports directly (upload or paste it under **Add material**, or send it with the `addStudySet` action).

The base rules of the Arinova question standard apply (exactly 4 options, exactly 1 correct, an explanation for each question). This skill adds the Cito way of asking and the metadata for a lesson set.

## Before writing

Work these out from the request or the material. Ask only if one cannot be guessed:

- **Subject** – one of `Taal`, `Rekenen`, `Huiswerk`, `Topografie`, `Aardrijkskunde`, `Verkeer`, `Geschiedenis`, `Natuur en Techniek`.
- **Theme** – the chapter as the book numbers it, e.g. `Thema 7.1`, plus its name, e.g. `Puur natuur`.
- **Lesson** – number and name, e.g. `Les 4` and `Nieuwe diersoorten`.
- **Group** – e.g. `Groep 7`. The theme number usually tells you (Thema 7.x → Groep 7).
- **Number of questions** – default **30**; never more than 100.
- **Language** – the language of the school material, normally `nl`.

Read the whole lesson first and list its **key concepts and rules** (for example the steps of a zoekkaart, the kenmerken of each group, the terms the lesson defines). Every question must test one of these. Use only facts from the lesson; general knowledge only when it is certain and at the level of the group.

## How Cito asks

A Cito question gives the pupil a small situation and asks them to apply what the lesson taught. Mix the types in [references/question-types.md](references/question-types.md) across the set; for 30 questions use at least 7 different types and no more than 6 questions of one type. Most-used:

- **Toepassen** – a new case (an unknown animal, a map, a situation) that the pupil classifies or solves with the lesson's rule.
- **Waarneming of mening** – which statement is an observation, opinion, assumption or hypothesis.
- **Gegevens lezen** – a small table, list or description written into the prompt (`Tabel: A: …, B: …`) that the pupil combines.
- **Conclusie trekken** – which conclusion is best supported, or what you can say for **ZEKER**.
- **Redenering beoordelen** – a pupil says something wrong; which argument shows best why it is wrong.
- **Volgorde / eerste stap** – what you check **EERST**, or what information is still needed.
- **Uitzondering** – an example that breaks a simple rule (vogelbekdier, vleermuis, pinguïn).
- **Begrijpend lezen** – the function of a signal word (`hoewel`, `daarom`, `want`) or the best summary of a short quote from the lesson.

Writing rules:

1. **A situation, not a definition.** Prefer "Noor vindt een dier met …. Bij welke groep hoort het?" over "Wat is een weekdier?". At most a fifth of the set may be plain recall.
2. **Everything needed is in the prompt.** Tables, quotes and descriptions are written in the prompt text; the pupil sees one question at a time and nothing else.
3. **Key words in capitals:** `NIET`, `ZEKER`, `BESTE`, `EERST`, `ALLEEN`, `MEEST`. Avoid double negatives.
4. **Plausible wrong options** built on real pupil mistakes: judging by habitat, colour, size or movement; confusing neighbouring groups; taking one feature for proof; mixing up observation and opinion. No joke options and no "alle bovenstaande".
5. **Options alike** in length and form; the correct one must not be the longest or the only careful one. If the correct answer is a full sentence, so are the others.
6. **Never give the answer away.** The correct option must not repeat a fact the prompt already states as known, and must not be the only option using words from the prompt. Check especially "what information is still needed" questions: the answer must be something the prompt does **not** yet tell.
7. **Exactly one defensible answer.** If a teacher could argue for a second option, rewrite it. Words like "kan", "waarschijnlijk", "volgens de zoekkaart" help keep the correct one strictly true.
8. **Names and settings vary.** Use different Dutch names (Mila, Sam, Noor, Daan, Isa, Ahmed …) and scenes (a bioloog, a klas, an eiland, a vijver), not the same one twice in a row.
9. **Explanation** – 1–2 sentences that name the lesson rule that decides the answer, and where useful why the tempting wrong option fails.
10. **Answer spread** – for 30 questions put the correct answer 7 or 8 times at each of A, B, C, D, with no run of more than 2 at the same letter and no repeating pattern.

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
  "questions": [
    {
      "prompt": "Een bioloog ontdekt een klein dier. Het heeft geen ruggengraat, maar wel een hard skelet aan de buitenkant en poten met gewrichten. Welke conclusie past het best bij deze gegevens?",
      "options": [
        "Het is een geleedpotige.",
        "Het is een zoogdier.",
        "Het is een weekdier.",
        "Het is een amfibie."
      ],
      "correctIndex": 0,
      "explanation": "Een geleedpotige heeft geen ruggengraat, maar wel een uitwendig skelet en gelede poten."
    }
  ]
}
```

Field rules:

| Field | Rule |
| --- | --- |
| `title` | `Thema <nr> <themanaam> – Les <nr> <lesnaam> – Cito`, with en dashes; up to 150 characters |
| `subject` | One of the eight Dutch subject names |
| `language` | `nl`, `tr` or `en` |
| `description` | One sentence: `<n> CITO-stijl vragen over … (Les <nr>).` |
| `theme` | `Thema <nr>` only, e.g. `Thema 7.1`, so sets of the same theme group together |
| `lesson` | `Les <nr>: <lesnaam>` |
| `group` | `Groep 7`, or a range like `Groep 7–8` |
| `testStyle` | Always `cito` |
| `testType` | Always `single-choice` |
| `difficulty` | `medium` unless asked otherwise (`easy`, `hard`) |
| `addedDate` | Today, `YYYY-MM-DD` |
| `questionCount` | Must equal the number of questions, or Arinova refuses the set |
| `material` | Optional "Learn first" text: a short summary of the lesson's key rules (e.g. the zoekkaart as steps), `\n` for new lines; `""` if not wanted |
| `questions[].options` | Exactly 4 strings, without "A." in front |
| `questions[].correctIndex` | Counting from 0: 0 = A, 1 = B, 2 = C, 3 = D |
| `questions[].explanation` | Required; why the correct answer is right |

### File name

When you save the set as a file, or tell the user what to save it as, name it from its fields, joined by ` – ` (space, en dash, space):

`<subject> – <theme> <themanaam> – <lesson> – <questionCount> vragen – <testStyle> – <addedDate>.json`

For example `Natuur en Techniek – Thema 7.1 Puur natuur – Les 4 Nieuwe diersoorten – 30 vragen – Cito – 2026-11-08.json`. Write the lesson without the colon (`Les 4 Nieuwe diersoorten`), the test style as `Cito` or `Kennis`, and "vragen" in the language of the set (`soru` for `tr`, `questions` for `en`). Leave out characters that are not allowed in file names (`/ \ : * ? " < > |`).

Leave out `image` and `optionImages` unless the user supplied pictures (then: data URLs, PNG/JPEG/WebP/GIF, no SVG, about 1 MB each). Arinova also accepts `"image": null` and `"optionImages": [null, null, null, null]` as an export writes them. Do not add `source`, `fileName` or other fields.

## Check before you answer

If you can run code, save the JSON and run `python3 scripts/check_set.py <file>`; fix everything it reports. Then, or otherwise by hand, check each question:

- [ ] 4 different, non-empty options; `correctIndex` points to the option that is really correct (count again from 0)
- [ ] Only that option is correct; the prompt does not already state it
- [ ] It asks the pupil to reason with a lesson rule, not just recall a word (at most a fifth recall)
- [ ] The correct option is not clearly the longest
- [ ] Explanation gives the deciding rule, in the language of the question
- [ ] Across the set: answers spread evenly over A–D, no run longer than 2; at least 7 question types; no two prompts nearly the same
- [ ] `questionCount` matches; `testStyle` is `cito`; the JSON is valid (double quotes, no trailing commas)

After the code block, give the file name (see **File name**) and one line: number of questions, the count at A/B/C/D, and the question types used. If you can write files, also save the JSON under that name.
