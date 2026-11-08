// Converts tests written in the "toets" layout used by generated files into
// the study-set shape that setSchema checks:
//
//   { subject, title, toetsname, language, lessons: [3, 4],
//     questions: [{ question, image, options: [
//       { option1: "…", isExpectedAnswer: "yes", explanationIfExpected, image }
//     ] }] }
//
// A file may also hold { tests: [ … ] }. Anything else is returned unchanged,
// so the app's own JSON format keeps working.

type Picture = string | { mimeType?: string; data?: string } | null | undefined;
type Option = Record<string, unknown> & {
  isExpectedAnswer?: unknown;
  explanationIfExpected?: unknown;
  image?: Picture;
};
type Question = {
  question?: unknown;
  explanation?: unknown;
  image?: Picture;
  options?: Option[];
};
type Toets = {
  subject?: unknown;
  title?: unknown;
  toetsname?: unknown;
  language?: unknown;
  description?: unknown;
  material?: unknown;
  materialDoc?: unknown;
  lessons?: unknown[];
  group?: unknown;
  questions?: Question[];
};

function picture(image: Picture) {
  if (!image) return undefined;
  if (typeof image === 'string') return image;
  return image.mimeType && image.data
    ? `data:${image.mimeType};base64,${image.data.replace(/\s+/g, '')}`
    : undefined;
}

const yes = (value: unknown) =>
  value === true || /^(yes|ja|evet|true)$/i.test(String(value ?? ''));

function optionText(option: Option, index: number) {
  return option[`option${index + 1}`] ?? option.option ?? option.text;
}

function lessonsText(lessons: unknown[], language: unknown) {
  const word =
    { nl: 'Les', en: 'Lesson', tr: 'Ders' }[String(language)] ?? 'Les';
  const and = { nl: 'en', en: 'and', tr: 've' }[String(language)] ?? 'en';
  const list = lessons.map(String);
  return `${word} ${list.length > 1 ? `${list.slice(0, -1).join(', ')} ${and} ${list.at(-1)}` : list[0]}`;
}

function isToets(value: unknown): value is Toets {
  const questions = (value as Toets)?.questions;
  return (
    Array.isArray(questions) &&
    questions.some((q) => typeof q?.question === 'string')
  );
}

function convert(toets: Toets) {
  const questions = (toets.questions ?? []).map((q) => {
    const options = q.options ?? [];
    const correct = options.findIndex((o) => yes(o.isExpectedAnswer));
    const optionImages = options.map((o) => picture(o.image) ?? null);
    return {
      prompt: q.question,
      options: options.map(optionText),
      // More than one or no expected answer is left for setSchema to reject.
      correctIndex:
        options.filter((o) => yes(o.isExpectedAnswer)).length === 1
          ? correct
          : -1,
      explanation:
        (correct >= 0 && options[correct].explanationIfExpected) ||
        q.explanation ||
        '',
      ...(picture(q.image) ? { image: picture(q.image) } : {}),
      ...(optionImages.some(Boolean) ? { optionImages } : {}),
    };
  });
  return {
    title: [toets.title, toets.toetsname].filter(Boolean).join(' – '),
    subject: toets.subject,
    language: toets.language ?? 'nl',
    description: toets.description ?? '',
    ...(toets.lessons?.length
      ? { lesson: lessonsText(toets.lessons, toets.language) }
      : {}),
    ...(toets.group ? { group: toets.group } : {}),
    material: toets.material ?? '',
    ...(toets.materialDoc ? { materialDoc: toets.materialDoc } : {}),
    questions,
  };
}

export function normalizeSets(input: unknown): unknown {
  const tests = (input as { tests?: unknown[] })?.tests;
  if (Array.isArray(tests) && tests.some(isToets))
    return tests.map((t) => (isToets(t) ? convert(t) : t));
  if (Array.isArray(input))
    return input.map((t) => (isToets(t) ? convert(t) : t));
  return isToets(input) ? convert(input) : input;
}
