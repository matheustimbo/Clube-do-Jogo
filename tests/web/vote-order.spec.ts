import { expect, test, type Locator, type Page } from '@playwright/test';

// Placar, botões e abas de quem votou seguem a mesma ordem, a de voteChoices.
// Quando cada tela mantinha a própria lista, o número verde acabou em cima do
// botão vermelho.
const scoreboardOrder = ['would_not_play', 'neutral', 'would_play'];

function choiceOrder(scope: Locator) {
  return scope.locator('[data-choice]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-choice')));
}

// O deck de votação rápida abre por cima quando há jogo sem voto no demo.
async function closeQuickVoting(page: Page) {
  const close = page.getByRole('button', { name: 'Fechar votação rápida' });
  await close.click({ timeout: 5_000 }).catch(() => undefined);
  await expect(close).toBeHidden();
}

async function expectScoreboardOrder(summary: Locator, picker: Locator) {
  await expect(summary.locator('[data-choice]')).toHaveCount(3);
  expect(await choiceOrder(summary)).toEqual(scoreboardOrder);
  expect(await choiceOrder(picker)).toEqual(scoreboardOrder);
  // O diálogo abre em Jogaria por padrão, então o contador do meio prova que cada um abre a própria aba.
  await summary.locator('[data-choice="neutral"]').click();
  const dialog = summary.page().getByRole('dialog', { name: 'Escolhas do clube' });
  await expect(dialog.getByRole('tab')).toHaveText([/^Não · \d+$/, /^Neutro · \d+$/, /^Jogaria · \d+$/]);
  await expect(dialog.getByRole('tab', { selected: true })).toHaveText(/^Neutro · /);
}

test('no ranking, contador, botão e abas seguem a ordem do placar', async ({ page }) => {
  await page.goto('/ranking');
  await closeQuickVoting(page);
  const card = page.locator('article.ranking-card', { hasText: 'Cocoon' });
  await expectScoreboardOrder(card.locator('.preference-summary'), card.locator('.preference-picker'));
});

test('na página do jogo, contador, botão e abas seguem a ordem do placar', async ({ page }) => {
  await page.goto('/jogos/cocoon');
  await closeQuickVoting(page);
  await expect(page.getByRole('heading', { name: 'Cocoon', level: 1 })).toBeVisible();
  await expectScoreboardOrder(page.locator('.preference-summary'), page.locator('.preference-picker'));
});

// O botão mostra o rótulo curto ("Não"); o leitor de tela precisa da escolha inteira.
const choiceNames = ['Não jogaria', 'Neutro', 'Jogaria'];

async function expectFullChoiceNames(summary: Locator, picker: Locator) {
  const counters = summary.locator('[data-choice]');
  const buttons = picker.locator('[data-choice]');
  for (const [index, name] of choiceNames.entries()) {
    await expect(buttons.nth(index)).toHaveAccessibleName(name);
    await expect(counters.nth(index)).toHaveAccessibleName(new RegExp(`^Ver quem votou ${name} \\(\\d+\\)$`));
  }
}

test('no ranking, botões e contadores dizem o nome inteiro da escolha', async ({ page }) => {
  await page.goto('/ranking');
  await closeQuickVoting(page);
  const card = page.locator('article.ranking-card', { hasText: 'Cocoon' });
  await expectFullChoiceNames(card.locator('.preference-summary'), card.locator('.preference-picker'));
});

test('na página do jogo, botões e contadores dizem o nome inteiro da escolha', async ({ page }) => {
  await page.goto('/jogos/cocoon');
  await closeQuickVoting(page);
  await expect(page.getByRole('heading', { name: 'Cocoon', level: 1 })).toBeVisible();
  await expectFullChoiceNames(page.locator('.preference-summary'), page.locator('.preference-picker'));
});
