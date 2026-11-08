// The details a material card lists, in their default order. A subject can
// set its own order; details it does not name follow in this order.
export const factKeys = [
  'group',
  'theme',
  'lesson',
  'testStyle',
  'questions',
  'options',
  'subject',
  'testType',
  'difficulty',
  'added',
] as const;
export type FactKey = (typeof factKeys)[number];

// The buttons under a card, in their default order. Each shows only when it
// applies (there is material to learn, earlier results, saved progress).
export const buttonKeys = [
  'study',
  'results',
  'startOver',
  'practice',
] as const;
export type ButtonKey = (typeof buttonKeys)[number];

// A saved order first, then anything it leaves out in the default order.
function ordered<K extends string>(
  keys: readonly K[],
  saved?: readonly string[] | null,
): K[] {
  const known = (saved ?? []).filter((k): k is K =>
    (keys as readonly string[]).includes(k),
  );
  return [...new Set([...known, ...keys])];
}
export const factOrder = (saved?: readonly string[] | null) =>
  ordered(factKeys, saved);
export const buttonOrder = (saved?: readonly string[] | null) =>
  ordered(buttonKeys, saved);

// How many details a card shows before its "more" link, and how many
// buttons stand side by side, unless the subject sets other numbers.
export const defaultFactCount = 5;
export const defaultButtonsPerRow = 2;

// A subject's card layout as the parent saved it; what is left out uses the
// defaults.
export type CardLayout = {
  factOrder?: FactKey[];
  factCount?: number;
  buttonOrder?: ButtonKey[];
  buttonsPerRow?: number;
};
