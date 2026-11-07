---
name: arinova-questions
description: Write multiple-choice practice tests for Arinova in its standard format - each question has exactly 4 options, exactly 1 correct answer, and a short explanation of why that answer is right. Use when asked to make a test, quiz, toets, practice questions, or "vragen" from study material, a photo of a school page, a topic, or a lesson, for Taal, Rekenen, Huiswerk, Topografie, Aardrijkskunde, Verkeer, Geschiedenis or Natuur en Techniek.
---

# Arinova questions

Turn study material into one Arinova practice test: 4 options per question, 1 correct answer, 1 explanation. The output is a JSON study set that Arinova imports directly (upload or paste it under **Add material**, or send it with the `addStudySet` action).

## Before writing

Work out these from the request or the material. Ask only if one cannot be guessed:

- **Subject** – one of: `Taal`, `Rekenen`, `Huiswerk`, `Topografie`, `Aardrijkskunde`, `Verkeer`, `Geschiedenis`, `Natuur en Techniek`. Always use this Dutch name.
- **Language** – `nl` (default), `tr` or `en`. Write the questions, options, explanations and material in the language of the school material, not the language of the chat.
- **Number of questions** – default 10; never more than 100.
- **Lesson and group** – for example `Les 3 tot en met 5` and `Groep 7`, if the material says so.
- **Difficulty** – `easy`, `medium` or `hard` for that group; default `medium`.

Use only facts that are in the material the user gave. If you add general knowledge, it must be certain and fit the level of the class.

## The question standard

Every question follows all of these rules:

1. **Exactly 4 options.** No more, no fewer.
2. **Exactly 1 correct option.** The other three are clearly wrong for someone who knows the material, and no option is "partly right".
3. **Plausible wrong options.** Use mistakes a pupil really makes: a nearby number, a neighbouring country, a word that looks similar, a common misunderstanding. No joke options.
4. **Options look alike.** Similar length and style, so the longest or most detailed one is not obviously the answer. No "all of the above", "none of the above" or "both A and B".
5. **Vary the correct position.** Spread the correct answer over A, B, C and D across the test, roughly equally, with no visible pattern.
6. **One idea per question.** Short, clear sentences at the pupil's level. Avoid double negatives; if a question must use "not" (`niet`, `değil`), write it in bold capitals in the prompt, like **NIET**.
7. **The prompt stands alone.** Do not refer to "the text above" or to other questions; the pupil sees one question at a time.
8. **Explanation.** 1–3 sentences in the same language that say *why* the correct answer is right, and where useful why a tempting wrong option is wrong. Do not just repeat the answer ("The answer is B").
9. **Rekenen:** work out every answer yourself before writing it, and make the wrong options results of typical calculation mistakes. The explanation shows the steps.

Mix question types where the material allows: knowing a fact, understanding a meaning, applying a rule to a new example.

## Output format

Reply with one JSON object in a single ```json code block, nothing else in the block. Field rules:

| Field | Required | Rule |
| --- | --- | --- |
| `title` | yes | Up to 150 characters, e.g. `Verkeer – voorrang (les 4)` |
| `subject` | yes | One of the eight Dutch subject names above |
| `language` | yes | `nl`, `tr` or `en` |
| `description` | no | One sentence on what is practised, up to 1000 characters |
| `questionCount` | no | Number of questions in `questions`. Arinova refuses the test if it is wrong |
| `testType` | no | The kind of test, from the list below. For this standard: `single-choice` |
| `difficulty` | no | `easy`, `medium` or `hard` |
| `lesson` | no | e.g. `Les 4`, up to 100 characters |
| `group` | no | School group, written `Groep 6`, `Groep 7`, `Groep 8` or a range like `Groep 7–8`; up to 60 characters |
| `addedDate` | no | The day you made the test, as `YYYY-MM-DD` |
| `material` | no | The "Learn first" section: a short study text the pupil reads before the questions; plain text, `\n` for new lines |
| `questions` | yes | 1–100 questions |
| `questions[].prompt` | yes | The question |
| `questions[].options` | yes | Exactly 4 strings, shown as A, B, C, D. Do not put "A." in the text |
| `questions[].correctIndex` | yes | Position of the correct option, **counting from 0**: 0 = A, 1 = B, 2 = C, 3 = D |
| `questions[].explanation` | yes (for this standard) | Why the correct answer is right |

The general fields (`questionCount`, `testType`, `difficulty`, `lesson`, `group`, `addedDate`, `material`) are optional: fill in what you know and leave out the rest. Do not add other fields.

Test types (`testType`):

| Value | Meaning | Arinova |
| --- | --- | --- |
| `single-choice` | Choose the 1 correct answer – **this skill: 4 options** | Imports it |
| `true-false` | 2 options (true / false), 1 correct | Imports it |
| `multiple-choice` | 4 options, choose the 2 correct answers | Refuses it for now |
| `type-answer` | No options; the pupil types the answer | Refuses it for now |

This skill writes only `single-choice` tests.

### Pictures

A question can have a picture (`image`), and each option can have one (`optionImages`: a list with one entry per option, `null` for an option without a picture). A picture is a data URL: `data:image/png;base64,…` (PNG, JPEG, WebP or GIF; no SVG), up to about 1 MB each and 4 MB for the whole test. Only add a picture when the user gives you one, or when you can create a real image file and encode it; never invent base64 text. Write the prompt so it still makes sense if the picture is small, e.g. "Welk land is rood gekleurd op de kaart?".

Example:

```json
{
  "title": "Verkeer – voorrang",
  "subject": "Verkeer",
  "language": "nl",
  "description": "Oefenen wie voorrang heeft op een kruispunt.",
  "questionCount": 2,
  "testType": "single-choice",
  "difficulty": "easy",
  "lesson": "Les 4",
  "group": "Groep 7",
  "addedDate": "2026-11-07",
  "material": "Op een gelijkwaardig kruispunt heeft verkeer van rechts voorrang.\n\nHaaientanden op de weg betekenen: jij moet voorrang geven.",
  "questions": [
    {
      "prompt": "Je fietst op een gelijkwaardig kruispunt. Wie heeft voorrang?",
      "options": [
        "Verkeer van links",
        "Verkeer van rechts",
        "Wie het eerst bij het kruispunt is",
        "Wie het hardst rijdt"
      ],
      "correctIndex": 1,
      "explanation": "Op een gelijkwaardig kruispunt geldt: verkeer van rechts gaat voor. Wie het eerst komt, telt niet."
    },
    {
      "prompt": "Wat betekenen haaientanden op de weg voor jou?",
      "options": [
        "Je mag als eerste doorrijden",
        "Je moet hier parkeren",
        "Je moet voorrang geven",
        "Je rijdt op een fietspad"
      ],
      "correctIndex": 2,
      "explanation": "Haaientanden wijzen naar jou: dan moet je het verkeer op de andere weg voor laten gaan."
    }
  ]
}
```

## Check before you answer

Go through every question and fix any that fail:

- [ ] 4 options, all different, none empty
- [ ] `correctIndex` is 0, 1, 2 or 3 and points to the option that is really correct (count again from 0)
- [ ] Only that one option is correct
- [ ] Explanation says why, in the same language as the question
- [ ] Correct answers are spread over A–D across the test
- [ ] `subject` is one of the eight names and `language` matches the text
- [ ] If present, `questionCount` equals the number of questions and `testType` is `single-choice`
- [ ] The JSON is valid: double quotes, no trailing commas, no comments

After the code block, give one line: how many questions, and how many have their answer at A, B, C and D. If the user wants the test as a Word file instead, use the layout in [references/word-layout.md](references/word-layout.md).
