import { subjects } from './subjects';

// JSON Schema of a study set as Arinova imports it, shared by the OpenAPI
// description and /api/format. questionRef points to the Question schema
// wherever the caller keeps it.
export function setJsonSchema(questionRef: string) {
  return {
    StudySet: {
      type: 'object',
      required: ['title', 'subject', 'language', 'questions'],
      properties: {
        title: { type: 'string', maxLength: 150 },
        subject: {
          type: 'string',
          description: `School subject: ${subjects.map((s) => s.name).join(', ')}.`,
        },
        language: { type: 'string', enum: ['nl', 'tr', 'en'] },
        description: { type: 'string', maxLength: 1000 },
        questionCount: {
          type: 'integer',
          minimum: 1,
          description:
            'Optional. Number of questions; the test is refused if it differs from the questions sent.',
        },
        testType: {
          type: 'string',
          enum: ['single-choice', 'true-false'],
          description:
            'Optional. single-choice: one correct option; true-false: 2 options, one correct.',
        },
        difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
        lesson: {
          type: 'string',
          maxLength: 100,
          description: 'e.g. Les 4',
        },
        theme: {
          type: 'string',
          maxLength: 100,
          description:
            'Optional theme within the subject, e.g. Het menselijk lichaam; the learner can filter by it.',
        },
        testStyle: {
          type: 'string',
          enum: ['knowledge', 'cito'],
          description:
            'Optional. knowledge: a test on what a lesson taught; cito: practice in the style of the Cito tests.',
        },
        group: {
          type: 'string',
          maxLength: 60,
          description: 'School group, e.g. Groep 7 or Groep 7–8.',
        },
        addedDate: {
          type: 'string',
          format: 'date',
          description: 'Optional. The day the test was made, YYYY-MM-DD.',
        },
        material: {
          type: 'string',
          maxLength: 50000,
          description:
            'Optional study text shown under "Learn" (plain text; line breaks are kept).',
        },
        materialDoc: {
          description:
            'Optional lesson document (PDF, DOC or DOCX), shown as a link under "Learn". A data URL or https link, or an object { fileName, url } or { fileName, mimeType, data } with base64 data. null for none.',
          oneOf: [
            { type: 'null' },
            { type: 'string' },
            {
              type: 'object',
              properties: {
                fileName: { type: 'string', maxLength: 200 },
                url: { type: 'string' },
                mimeType: {
                  type: 'string',
                  enum: [
                    'application/pdf',
                    'application/msword',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                  ],
                },
                data: { type: 'string', description: 'Base64 file data.' },
              },
            },
          ],
        },
        questions: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: { $ref: questionRef },
        },
      },
    },
    Question: {
      type: 'object',
      required: ['prompt', 'options', 'correctIndex'],
      properties: {
        prompt: {
          type: 'string',
          maxLength: 3000,
          description:
            'The question, as plain text. Line breaks (\\n) are kept; Markdown such as | tables or **bold** is not rendered.',
        },
        options: {
          type: 'array',
          minItems: 2,
          maxItems: 6,
          items: { type: 'string' },
          description: 'Answer options, shown as A, B, C…',
        },
        correctIndex: {
          type: 'integer',
          minimum: 0,
          description:
            'Zero-based index of the one correct option (0 = A, 1 = B, …).',
        },
        explanation: {
          type: 'string',
          description: 'Why the correct answer is right.',
        },
        image: {
          type: ['string', 'null'],
          description:
            'Optional picture as a data URL: data:image/png;base64,… (PNG, JPEG, WebP or GIF). null for none.',
        },
        optionImages: {
          type: ['array', 'null'],
          items: { type: ['string', 'null'] },
          description:
            'Optional small picture per option, in the same order as options: a data URL, or null for an option without one.',
        },
      },
    },
  };
}

// A complete set that imports as it is, to copy the shape from.
export const exampleSet = {
  title: 'Thema 7.1 Puur natuur – Les 2 Plantachtige dieren – Kennis',
  subject: 'Natuur en Techniek',
  language: 'nl',
  description: '2 kennisvragen over cellen (Les 2).',
  theme: 'Thema 7.1',
  lesson: 'Les 2: Plantachtige dieren',
  group: 'Groep 7',
  testStyle: 'knowledge',
  testType: 'single-choice',
  difficulty: 'medium',
  addedDate: '2026-11-08',
  questionCount: 2,
  material: '',
  materialDoc: null,
  questions: [
    {
      prompt: 'Welk onderdeel geeft een plantencel stevigheid?',
      image: null,
      options: ['Het celmembraan', 'De celwand', 'De celkern', 'De vacuole'],
      optionImages: [null, null, null, null],
      correctIndex: 1,
      explanation:
        'De stevige celwand geeft de plantencel steun. Het celmembraan is een dun vliesje en de celkern stuurt de cel.',
    },
    {
      prompt:
        'Een klas vergelijkt twee celmonsters. Ja betekent dat het onderdeel is aangetroffen.\n\nMonster P\nCelwand: nee\nBladgroenkorrels: nee\n\nMonster Q\nCelwand: ja\nBladgroenkorrels: ja\n\nWelk monster past bij een groene bladcel?',
      image: null,
      options: ['Monster P', 'Monster Q', 'Allebei', 'Geen van beide'],
      optionImages: [null, null, null, null],
      correctIndex: 1,
      explanation:
        'Een groene bladcel heeft een celwand en bladgroenkorrels; alleen monster Q heeft ze allebei.',
    },
  ],
};

// What makes a set good, beyond what the schema can check.
export const writingRules = [
  'Exactly 4 options per question and exactly 1 correct answer; correctIndex counts from 0 (0 = A).',
  'All 4 options come from the same category and from the lesson itself; no option can be ruled out with common sense alone.',
  'Options are alike in length and form, each on one line; the correct one is not the longest.',
  'Spread the correct answers about evenly over A, B, C and D, with no run of more than 2.',
  'Every question has an explanation of why the correct answer is right.',
  'Text is plain: no Markdown tables, bold or lists. Write data one item per block of lines with \\n, an empty line between items.',
  'Pictures are data URLs (PNG, JPEG, WebP or GIF, up to about 1 MB each); use null when there is none. Never invent base64 data.',
  'questionCount must equal the number of questions; keep the whole set under 4 MB.',
];
