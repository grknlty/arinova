#!/usr/bin/env python3
"""Check an Arinova Cito set: format, answer spread and common flaws.

Usage: python3 check_set.py set.json
Exits 1 when there are errors; warnings are worth a look but may be fine.
"""
import json
import re
import sys
from collections import Counter

SUBJECTS = {'Taal', 'Rekenen', 'Huiswerk', 'Topografie', 'Aardrijkskunde',
            'Verkeer', 'Geschiedenis', 'Natuur en Techniek'}
LETTERS = 'ABCD'


def words(text):
    return set(re.findall(r'\w{4,}', text.lower()))


def main(path):
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    errors, warnings = [], []

    for field in ('title', 'subject', 'language', 'questions'):
        if not data.get(field):
            errors.append(f'missing {field}')
    if str(data.get('subject', '')).lower() not in {s.lower() for s in SUBJECTS}:
        errors.append(f"subject {data.get('subject')!r} is not one of {sorted(SUBJECTS)}")
    if data.get('language') not in ('nl', 'tr', 'en'):
        errors.append('language must be nl, tr or en')
    if len(data.get('title', '')) > 150:
        errors.append('title is longer than 150 characters')
    if data.get('testStyle') not in ('knowledge', 'cito'):
        errors.append('testStyle must be "knowledge" or "cito"')
    for field in ('theme', 'lesson', 'group'):
        if not data.get(field):
            warnings.append(f'no {field}')

    questions = data.get('questions') or []
    if not 1 <= len(questions) <= 100:
        errors.append('a set needs 1 to 100 questions')
    if 'questionCount' in data and data['questionCount'] != len(questions):
        errors.append(f"questionCount is {data['questionCount']} but there are {len(questions)} questions")

    answers = []
    seen = {}
    for n, q in enumerate(questions, 1):
        where = f'question {n}'
        options = q.get('options') or []
        index = q.get('correctIndex')
        if not str(q.get('prompt', '')).strip():
            errors.append(f'{where}: empty prompt')
        if len(options) != 4:
            errors.append(f'{where}: {len(options)} options instead of 4')
        if any(not str(o).strip() for o in options):
            errors.append(f'{where}: empty option')
        if len({str(o).strip().lower() for o in options}) != len(options):
            errors.append(f'{where}: two options are the same')
        if re.match(r'^[A-D][.)]\s', str(options[0]) if options else ''):
            errors.append(f'{where}: options start with a letter label')
        if not isinstance(index, int) or not 0 <= index < len(options):
            errors.append(f'{where}: correctIndex {index!r} does not point to an option')
            continue
        if not str(q.get('explanation', '')).strip():
            errors.append(f'{where}: no explanation')
        answers.append(index)

        lengths = [len(str(o)) for o in options]
        if lengths[index] == max(lengths) and lengths[index] > 1.5 * sorted(lengths)[-2]:
            warnings.append(f'{where}: the correct option is much longer than the others')
        prompt_words = words(q['prompt'])
        overlap = [len(words(str(o)) & prompt_words) for o in options]
        if overlap[index] >= 3 and all(overlap[index] > 2 * o for i, o in enumerate(overlap) if i != index):
            warnings.append(f'{where}: only the correct option repeats words from the prompt - does the prompt give the answer away?')
        key = re.sub(r'\W+', ' ', q['prompt'].lower()).strip()[:80]
        if key in seen:
            warnings.append(f'{where}: starts like question {seen[key]}')
        seen.setdefault(key, n)

    counts = Counter(answers)
    spread = ', '.join(f'{LETTERS[i]}={counts.get(i, 0)}' for i in range(4))
    if answers:
        expected = len(answers) / 4
        for i in range(4):
            if abs(counts.get(i, 0) - expected) > max(2, expected * 0.35):
                warnings.append(f'answer {LETTERS[i]} is used {counts.get(i, 0)} times (expected about {expected:.0f})')
        run = 1
        for n in range(1, len(answers)):
            run = run + 1 if answers[n] == answers[n - 1] else 1
            if run == 3:
                warnings.append(f'questions {n - 1}-{n + 1} all have answer {LETTERS[answers[n]]}')

    for e in errors:
        print('ERROR  ', e)
    for w in warnings:
        print('WARNING', w)
    print(f'{len(questions)} questions; answers {spread}; '
          f'{len(errors)} errors, {len(warnings)} warnings')
    return 1 if errors else 0


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    sys.exit(main(sys.argv[1]))
