import type { StudySet } from './model';
// An example set: the downloadable import format and a test fixture. It is
// not shown in the app.
export const sample: StudySet = {
  id: 'a4266814-4f8b-4b57-b582-ea5f50f27f20',
  title: 'Op ontdekking met taal',
  subject: 'Taal',
  language: 'nl',
  sample: true,
  description:
    'Een korte oefening over zelfstandige naamwoorden, werkwoorden en de hoofdgedachte.',
  createdAt: '2026-01-01T00:00:00.000Z',
  material:
    'Zelfstandige naamwoorden\n\nEen zelfstandig naamwoord is een woord voor een mens, dier, ding of plaats. Bijvoorbeeld: meisje, kat, boek en school. Vaak kun je er de, het of een voor zetten.\n\nWerkwoorden\n\nEen werkwoord vertelt wat iemand doet of wat er gebeurt. In “Nova leest een boek” is leest het werkwoord.\n\nDe hoofdgedachte\n\nDe hoofdgedachte is het belangrijkste dat de schrijver je wil vertellen. Vraag jezelf af: waar gaat de hele tekst vooral over?',
  questions: [
    {
      prompt: 'Welk woord is een zelfstandig naamwoord?',
      options: ['Rennen', 'Vrolijk', 'Boek', 'Snel'],
      correctIndex: 2,
      explanation: 'Boek is een ding. Je kunt zeggen: het boek of een boek.',
    },
    {
      prompt: 'Wat is het werkwoord in: “Nova leest een spannend verhaal”?',
      options: ['Nova', 'Leest', 'Spannend', 'Verhaal'],
      correctIndex: 1,
      explanation:
        'Leest vertelt wat Nova doet. Daarom is leest het werkwoord.',
    },
    {
      prompt:
        '“Bijen vliegen van bloem naar bloem. Ze nemen stuifmeel mee. Zo helpen ze planten om te groeien.” Wat is de hoofdgedachte?',
      options: [
        'Bijen slapen in bloemen.',
        'Alle bloemen zijn geel.',
        'Planten kunnen vliegen.',
        'Bijen helpen planten.',
      ],
      correctIndex: 3,
      explanation:
        'De hele tekst vertelt hoe bijen planten helpen door stuifmeel mee te nemen.',
    },
  ],
};
