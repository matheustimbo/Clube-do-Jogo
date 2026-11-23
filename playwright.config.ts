import { defineConfig } from '@playwright/test';

const CATALOG_SPEC = /catalog-credit-dialogs\.spec\.ts/;

export default defineConfig({
  testDir: './tests/web',
  timeout: 30_000,
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'demo', testIgnore: CATALOG_SPEC, use: { baseURL: 'http://127.0.0.1:3100' } },
    // Fora da demo, com a RAWG ativa: o crédito do catálogo só aparece assim.
    { name: 'catalog', testMatch: CATALOG_SPEC, use: { baseURL: 'http://127.0.0.1:3104' } },
  ],
  webServer: [
    {
      command: 'npm run dev -- --hostname 127.0.0.1 --port 3100',
      url: 'http://127.0.0.1:3100',
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        NEXT_PUBLIC_AUTO_OPEN_PRODUCT_UPDATE: 'false',
      },
    },
    {
      command: 'npm run dev -- --hostname 127.0.0.1 --port 3104',
      url: 'http://127.0.0.1:3104',
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        // Outro next dev no mesmo checkout precisa de outra pasta de build.
        NEXT_DIST_DIR: '.next-e2e',
        // Um Supabase que não existe: o spec responde por ele no navegador.
        NEXT_PUBLIC_SUPABASE_URL: 'http://supabase.e2e.test',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-anon',
        GAME_CATALOG_PROVIDER: 'rawg',
        NEXT_PUBLIC_AUTO_OPEN_PRODUCT_UPDATE: 'false',
      },
    },
  ],
});
