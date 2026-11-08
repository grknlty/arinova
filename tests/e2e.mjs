import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (
  testDatabaseUrl &&
  !['localhost', '127.0.0.1'].includes(new URL(testDatabaseUrl).hostname)
) {
  throw new Error(
    'Browser tests require a disposable local PostgreSQL database',
  );
}
const directory = await mkdtemp(join(tmpdir(), 'arinova-test-'));
const url = 'http://127.0.0.1:3100';
const server = spawn(
  process.execPath,
  [
    'node_modules/next/dist/bin/next',
    'dev',
    '--port',
    '3100',
    '--hostname',
    '127.0.0.1',
  ],
  {
    env: {
      ...process.env,
      ARINOVA_DATA_DIR: directory,
      DATABASE_URL: '',
      POSTGRES_URL: testDatabaseUrl ?? '',
      PARENT_PASSWORD: 'test-parent-password',
      LEARNER_PASSWORD: 'test-learner-password',
      SESSION_SECRET: 'test-session-secret-not-for-production-123456',
      IMPORT_API_TOKEN: 'test-import-token-not-for-production-123456',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let logs = '';
server.stdout.on('data', (b) => (logs += b));
server.stderr.on('data', (b) => (logs += b));
let browser;
try {
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch {}
    if (i === 89) throw new Error('Server did not start');
    await new Promise((r) => setTimeout(r, 1000));
  }
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({
    viewport: { width: 820, height: 1180 },
  });
  // The language picker is a custom dropdown: open it, then pick the option.
  const pickLanguage = async (code, name) => {
    await (
      name
        ? page.getByRole('combobox', { name })
        : page.getByRole('combobox').first()
    ).click();
    await page
      .getByRole('option', { name: new RegExp(`^${code.toUpperCase()} ·`) })
      .click();
  };
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  await page.getByRole('button', { name: 'Ouder', exact: true }).click();
  let simulatedCode = '';
  await page.route('**/api/auth', (route) =>
    route.fulfill({
      status: 503,
      json: {
        code: simulatedCode,
        diagnostic:
          simulatedCode === 'AUTH_DATABASE_UNAVAILABLE'
            ? 'database_network'
            : undefined,
      },
    }),
  );
  for (const [language, code, message] of [
    [
      'nl',
      'AUTH_SESSION_NOT_CONFIGURED',
      'De sessiesleutel ontbreekt of is te kort.',
    ],
    ['en', 'AUTH_DATABASE_UNAVAILABLE', 'The database connection failed.'],
    [
      'tr',
      'AUTH_PASSWORD_NOT_CONFIGURED',
      'Bu rolün şifresi henüz ayarlanmamış.',
    ],
  ]) {
    simulatedCode = code;
    await pickLanguage(language);
    await page.locator('#login-password').fill('test-parent-password');
    await page.locator('button[type="submit"], form > button.primary').click();
    await page.getByRole('alert').filter({ hasText: message }).waitFor();
    if (code === 'AUTH_DATABASE_UNAVAILABLE')
      await page
        .getByRole('alert')
        .filter({ hasText: 'database_network' })
        .waitFor();
  }
  await page.unroute('**/api/auth');
  await pickLanguage('nl');
  await page
    .getByLabel('Wachtwoord', { exact: true })
    .fill('test-parent-password');
  await page.getByRole('button', { name: 'Inloggen', exact: true }).click();
  await page
    .getByRole('heading', { name: 'Hoi Nova, klaar voor een ontdekking?' })
    .waitFor();
  await pickLanguage('tr', 'Taal');
  await page
    .getByRole('heading', { name: 'Merhaba Nova, keşfetmeye hazır mısın?' })
    .waitFor();
  await pickLanguage('en');
  await page
    .getByRole('heading', { name: 'Hi Nova, ready to discover?' })
    .waitFor();
  // Material is filed under a group and subject from the catalog, which
  // starts with the learner's group.
  await page.getByRole('button', { name: 'Materials', exact: true }).click();
  await page.getByRole('button', { name: 'Add material', exact: true }).click();
  await page.getByRole('combobox', { name: 'Group', exact: true }).click();
  await page.getByRole('option', { name: 'Groep 7–8', exact: true }).click();
  await page.getByRole('combobox', { name: 'Subject', exact: true }).click();
  await page.getByRole('option', { name: 'Language', exact: true }).click();
  await page.getByLabel('JSON', { exact: true }).fill(
    JSON.stringify({
      title: 'Browser workflow test',
      subject: 'Taal',
      language: 'en',
      material: 'A noun names a thing.',
      questions: [
        {
          prompt: 'Which is a noun?',
          options: ['Book', 'Run'],
          correctIndex: 0,
          explanation: 'A book is a thing.',
        },
        {
          prompt: 'What does a verb do?',
          options: ['Names a colour', 'Describes an action'],
          correctIndex: 1,
          explanation: 'A verb describes an action.',
        },
      ],
    }),
  );
  await page
    .getByRole('button', { name: 'Add to learning space', exact: true })
    .click();
  await page.getByRole('status').waitFor();
  assert.equal(
    (
      await page.request.post(url + '/api/sets', { data: { title: 'Invalid' } })
    ).status(),
    400,
  );
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page
    .getByLabel('Password', { exact: true })
    .fill('test-learner-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page
    .getByRole('heading', { name: 'Hi Nova, ready to discover?' })
    .waitFor();
  assert.equal((await page.request.get(url + '/api/progress')).status(), 200);
  const sets = await (await page.request.get(url + '/api/sets')).json();
  assert.equal('correctIndex' in sets[0].questions[0], false);
  // Practice cards live on each subject's planet page.
  await page.getByRole('button', { name: 'Language', exact: true }).click();
  const card = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Browser workflow test' }),
  });
  await card.getByRole('button', { name: 'Learn first' }).click();
  await page.getByText('A noun names a thing.', { exact: true }).waitFor();
  await page
    .getByRole('button', { name: 'Start practice', exact: true })
    .click();
  assert.equal(
    await page.getByRole('button', { name: 'Next question' }).isDisabled(),
    true,
  );
  await page.getByRole('button', { name: 'A Book', exact: true }).click();
  // Doubt checkboxes are optional: an answer alone is enough to continue.
  assert.equal(
    await page.getByRole('button', { name: 'Next question' }).isDisabled(),
    false,
  );
  await page.getByLabel('I’m not sure about my answer').check();
  await page.getByRole('button', { name: 'Next question' }).click();
  // Leaving keeps her place: the card continues at question 2.
  await page.getByRole('button', { name: 'Stop, continue later' }).click();
  await card.getByRole('button', { name: /^Continue · 2\// }).click();
  await page.getByText('Question 2 of', { exact: false }).waitFor();
  await page.getByLabel('I don’t understand the question').check();
  await page.getByRole('button', { name: 'See my results' }).click();
  await page.getByRole('heading', { name: 'Well practised!' }).waitFor();
  await page.getByText('Correct, but still unsure', { exact: true }).waitFor();
  const review = page.locator('.review');
  await review.getByText('Not answered', { exact: true }).waitFor();
  // The result filters narrow the answer list; the chart sums the score.
  await page.getByRole('img', { name: /Correct: 1/ }).waitFor();
  await page.getByRole('radio', { name: /Not sure/ }).check();
  assert.equal(await review.locator('.review-card').count(), 1);
  await page.getByRole('radio', { name: /Didn’t understand/ }).check();
  await review.getByText('Not answered', { exact: true }).waitFor();
  await page.getByRole('radio', { name: /^Incorrect/ }).check();
  await review.getByText('No questions in this group.').waitFor();
  await page.getByRole('radio', { name: /^All/ }).check();
  // Previous results have the same filters, across every practice.
  await page.getByRole('button', { name: 'Language', exact: true }).click();
  await card.getByRole('button', { name: 'Previous results' }).click();
  const past = page.getByRole('dialog', { name: 'Browser workflow test' });
  await past.locator('summary').first().click();
  await past.getByRole('radio', { name: /Not sure/ }).check();
  assert.equal(await past.locator('.review-card').count(), 1);
  await past.getByRole('radio', { name: /^Incorrect/ }).check();
  await past.getByText('No questions in this group.').waitFor();
  await page.keyboard.press('Escape');
  await past.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('button', { name: 'Parent', exact: true }).click();
  await page
    .getByLabel('Password', { exact: true })
    .fill('test-parent-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await page.getByRole('heading', { name: 'Watch Nova grow' }).waitFor();
  const attempts = await (await page.request.get(url + '/api/progress')).json();
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].correct, 1);
  assert.equal(attempts[0].answers[0].confidence, 'unsure');
  assert.equal(attempts[0].answers[1].selected, null);
  // The subject list beside the numbers narrows them to one subject.
  const bySubject = page.getByRole('navigation', { name: 'By subject' });
  await bySubject.getByRole('button', { name: /^Language/ }).click();
  assert.equal(
    await bySubject
      .getByRole('button', { name: /^Language/ })
      .getAttribute('aria-current'),
    'true',
  );
  const session = page
    .locator('details.attempt')
    .filter({ hasText: 'Browser workflow test' });
  await session.locator('summary').click();
  await page.getByText('Correct, but still unsure', { exact: true }).waitFor();
  // Each practice session in the list has its own answer filters.
  await session.getByRole('radio', { name: /Not sure/ }).check();
  assert.equal(await session.locator('.review-card').count(), 1);
  await session.getByRole('radio', { name: /^All/ }).check();
  // The parent can open a set from the history to see its answers.
  await page.getByRole('button', { name: 'Materials', exact: true }).click();
  await page.getByRole('button', { name: 'Add material', exact: true }).click();
  await page.getByRole('button', { name: /Browser workflow test/ }).click();
  const viewer = page.getByRole('dialog', { name: 'Browser workflow test' });
  await viewer.getByText('Question 1', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await viewer.waitFor({ state: 'detached' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page
    .getByRole('button', { name: 'My learning space', exact: true })
    .click();
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.screenshot({ path: '/tmp/arinova-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/arinova-mobile.png', fullPage: true });
  assert.equal((await fetch(url + '/api/sets')).status, 401);
  const payload = JSON.stringify({
    title: 'API import test',
    subject: 'Türkçe',
    language: 'tr',
    material: 'Merhaba!',
    questions: [
      { prompt: 'Bir seçenek seç.', options: ['A', 'B'], correctIndex: 0 },
    ],
  });
  assert.equal(
    (
      await fetch(url + '/api/sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(url + '/api/sets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-import-token-not-for-production-123456',
        },
        body: payload,
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await fetch(url + '/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://untrusted.example',
        },
        body: JSON.stringify({
          role: 'parent',
          password: 'test-parent-password',
        }),
      })
    ).status,
    403,
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS: parent import → learner study → confidence/skip → saved result → parent review; NL/TR/EN; mobile overflow; role boundaries.',
  );
} catch (e) {
  console.error(logs);
  throw e;
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await new Promise((r) => server.once('exit', r));
  await rm(directory, { recursive: true, force: true });
}
