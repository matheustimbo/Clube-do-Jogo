import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';

// O crédito só aparece fora da demo, com a RAWG ativa: este spec roda no servidor do
// projeto `catalog` (playwright.config.ts), que aponta o Supabase para um endereço falso.
// O navegador fala com esse endereço, e as rotas abaixo respondem por ele: uma sessão
// de membro, um ciclo ativo e um jogo. As rotas /api do app, menos /api/catalog, também
// respondem daqui, então nada sai para a RAWG, a IGDB ou um banco.
const SUPABASE = 'http://supabase.e2e.test';
const USER = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'membro@clube.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };

const month = new Date().toISOString().slice(0, 7);
const game = (index: number) => ({
  id: `00000000-0000-4000-8000-${String(100 + index).padStart(12, '0')}`,
  title: `Jogo do catálogo ${index}`,
  duration_hours: 12,
  image_url: null,
  description: 'Um jogo da RAWG.',
  average_rating: 85,
  release_year: 2024,
  igdb_id: null,
  rawg_id: 5000 + index,
  screenshot_urls: ['https://media.rawg.io/media/screenshots/um.jpg', 'https://media.rawg.io/media/screenshots/dois.jpg'],
  trailer_url: null,
  genres: ['Adventure'],
  platforms: ['PC'],
  platform_ids: [6],
  created_at: '2026-01-01T00:00:00Z',
});
const GAME = game(0);
const RESULTS = Array.from({ length: 12 }, (_, index) => game(index + 1));

function base64url(text: string) {
  return Buffer.from(text).toString('base64url');
}

/** Tabelas que as telas abertas aqui leem; o resto volta vazio. */
function tableRows(table: string): unknown[] {
  if (table === 'profiles') return [{ id: USER.id, name: 'Membro', avatar_url: null, avatar_crop: null, bio: null, created_at: '2026-01-01T00:00:00Z' }];
  if (table === 'user_roles') return [{ role: 'admin' }];
  if (table === 'club_months') return [{ month, game_id: GAME.id, status: 'active', started_at: '2026-01-01T00:00:00Z', closed_at: null, selected_by: null, game: GAME }];
  if (table === 'games') return [GAME];
  if (table === 'backlogs') return [{ created_at: '2026-01-01T00:00:00Z', games: GAME }];
  return [];
}

async function signIn(context: BrowserContext, baseURL: string) {
  const token = `${base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${base64url(JSON.stringify({ sub: USER.id, role: 'authenticated', exp: 4102444800 }))}.e2e`;
  const session = { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'e2e', user: USER };
  await context.addCookies([{ name: 'sb-supabase-auth-token', value: `base64-${base64url(JSON.stringify(session))}`, url: baseURL }]);
  await context.route(`${SUPABASE}/**`, async route => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (pathname === '/auth/v1/user') return route.fulfill({ json: USER });
    if (pathname.startsWith('/auth/') || pathname.startsWith('/rest/v1/rpc/') || request.method() !== 'GET') return route.fulfill({ json: null });
    const rows = tableRows(pathname.replace('/rest/v1/', ''));
    const single = (request.headers().accept ?? '').includes('vnd.pgrst.object');
    if (!single) return route.fulfill({ json: rows });
    return rows.length === 1 ? route.fulfill({ json: rows[0] }) : route.fulfill({ status: 406, json: { code: 'PGRST116', message: 'no rows', details: null, hint: null } });
  });
  await context.route('**/api/**', async route => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/catalog') return route.continue();
    if (pathname === '/api/search') return route.fulfill({ json: RESULTS });
    if (pathname === '/api/platforms/search') return route.fulfill({ json: Array.from({ length: 12 }, (_, index) => ({ igdb_platform_id: 900 + index, name: `Console ${index}`, abbreviation: null, logo_url: null })) });
    if (pathname === '/api/goty/search-games') return route.fulfill({ json: { items: RESULTS.map(item => ({ ...item, release_year: 2026, release_eligibility: 'commercial_2026', effective_release_year: 2026, effective_release_date: '2026', eligibility_label: 'Lançamento 2026', is_eligible_2026: true })), source: 'cache', only2026: true } });
    if (pathname.endsWith('/media')) return route.fulfill({ json: GAME });
    if (pathname.endsWith('/mugshots')) return route.fulfill({ json: { mugshots: [] } });
    return route.fulfill({ json: {} });
  });
}

/** O crédito inteiro dentro do retângulo do diálogo, e o clique no meio dele cai no link. */
async function expectCreditInside(dialog: Locator) {
  const credit = dialog.getByRole('link', { name: 'RAWG' });
  await expect(credit).toBeVisible();
  // Mede o diálogo parado: a entrada dele anima a escala. Uma animação que o React troca
  // no meio é cancelada, e o `finished` dela rejeita; parada também serve.
  await dialog.evaluate(element => Promise.all(element.getAnimations({ subtree: true })
    .filter(animation => animation.effect?.getTiming().iterations !== Infinity)
    .map(animation => animation.finished.catch(() => undefined))));
  const [link, frame] = await Promise.all([credit.boundingBox(), dialog.boundingBox()]);
  expect(link && frame, 'crédito e diálogo têm caixa').toBeTruthy();
  expect(link!.y, 'topo do crédito dentro do diálogo').toBeGreaterThanOrEqual(frame!.y);
  expect(link!.y + link!.height, 'base do crédito dentro do diálogo').toBeLessThanOrEqual(frame!.y + frame!.height);
  expect(link!.x).toBeGreaterThanOrEqual(frame!.x);
  expect(link!.x + link!.width).toBeLessThanOrEqual(frame!.x + frame!.width);
  const clickable = await credit.evaluate(element => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return hit === element || element.contains(hit);
  });
  expect(clickable, 'o ponto do meio do crédito cai no link').toBe(true);
}

async function shoot(page: Page, name: string) {
  const { width, height } = page.viewportSize()!;
  await page.screenshot({ path: test.info().outputPath(`${name}-${width}x${height}.png`) });
}

const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
  { width: 375, height: 667 },
  { width: 360, height: 560 },
  { width: 844, height: 390 },
];

async function search(dialog: Locator, placeholder: string) {
  await dialog.getByPlaceholder(placeholder).fill('jogo');
  await dialog.getByRole('button', { name: 'Buscar' }).click();
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test.beforeEach(async ({ context, baseURL }) => {
      await signIn(context, baseURL!);
    });

    test('adding a game to the vote keeps the credit inside the dialog', async ({ page }) => {
      await page.goto('/ranking');
      await page.getByRole('button', { name: 'Adicionar jogo à votação' }).click();
      const dialog = page.getByRole('dialog', { name: 'Adicionar jogo à votação' });
      await search(dialog, 'Nome do jogo');
      await expect(dialog.getByText(RESULTS[11].title)).toBeAttached();
      await expectCreditInside(dialog);
      await shoot(page, 'ranking-add');
    });

    test('adding a game to my games keeps the credit inside the dialog', async ({ page }) => {
      await page.goto('/seus-jogos');
      await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Adicionar a Meus Jogos' });
      await search(dialog, 'Nome do jogo');
      await expect(dialog.getByText(RESULTS[11].title)).toBeAttached();
      await expectCreditInside(dialog);
      await shoot(page, 'library-add');
    });

    test('choosing a GOTY game keeps the credit inside the dialog', async ({ page }) => {
      await page.goto('/goty-2026');
      await page.getByRole('tab', { name: 'Seu GOTY' }).click();
      await page.getByRole('button', { name: /Escolher Meu GOTY/ }).first().click();
      const dialog = page.getByRole('dialog', { name: /Escolher jogo/ });
      await expect(dialog.getByRole('button', { name: new RegExp(RESULTS[11].title) })).toBeAttached();
      await expectCreditInside(dialog);
      await shoot(page, 'goty-picker');
    });

    test('framing an avatar from a screenshot keeps the credit inside the dialog', async ({ page }) => {
      await page.goto(`/jogos/${GAME.id}`);
      await page.getByRole('button', { name: 'Usar imagem como avatar' }).first().click();
      const dialog = page.getByRole('dialog', { name: 'Ajustar avatar' });
      await expect(dialog.getByRole('button', { name: 'Usar avatar' })).toBeAttached();
      await expectCreditInside(dialog);
      await shoot(page, 'avatar-crop');
    });

    test('searching consoles keeps the credit inside the dialog', async ({ page }) => {
      await page.goto('/seus-jogos');
      await page.getByRole('button', { name: 'Gerenciar consoles' }).click();
      const dialog = page.getByRole('dialog', { name: 'Meus consoles' });
      await search(dialog, 'Buscar console');
      await expect(dialog.getByRole('button', { name: 'Console 11' })).toBeAttached();
      await expectCreditInside(dialog);
      await shoot(page, 'consoles');
    });

    test('managing the club game keeps the credit inside the dialog', async ({ page }) => {
      await page.goto(`/jogos/${GAME.id}`);
      await page.getByRole('button', { name: 'Gerenciar jogo do clube' }).click();
      const dialog = page.getByRole('dialog', { name: 'Definir jogo do clube' });
      await expect(dialog.getByRole('img', { name: `Capa de ${GAME.title}` })).toBeAttached();
      await expectCreditInside(dialog);
      await shoot(page, 'club-admin');
    });
  });
}
