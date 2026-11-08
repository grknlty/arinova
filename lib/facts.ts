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

export function factOrder(saved?: readonly string[] | null): FactKey[] {
  const known = (saved ?? []).filter((k): k is FactKey =>
    (factKeys as readonly string[]).includes(k),
  );
  return [...new Set([...known, ...factKeys])];
}
