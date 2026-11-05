import { test, expect } from '@playwright/test';

test('login e cadastro carregam sem erros de módulos no navegador', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/auth/me', route => route.fulfill({status: 401, json: {detail: 'Não autenticado'}}));
  await page.route('**/api/sectors/options', route => route.fulfill({json: []}));
  await page.goto('/login');
  await expect(page.getByTestId('login-submit-button')).toBeVisible();
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/pastoral.svg');
  await page.getByTestId('go-signup-link').click();
  await expect(page).toHaveURL(/\/solicitar-acesso$/);
  await expect(page.getByTestId('signup-username-input')).toBeVisible();
  expect(errors).toEqual([]);
});


test('proxy local preserva a origem e bloqueia origens externas', async ({ request, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const local = await request.post('/api/auth/logout', { headers: { Origin: origin } });
  expect(local.status()).toBe(200);
  const external = await request.post('/api/auth/logout', { headers: { Origin: 'https://outro.example' } });
  expect(external.status()).toBe(403);
  expect(await external.json()).toEqual({ detail: 'Origem não permitida' });
});
