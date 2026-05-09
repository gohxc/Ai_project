import { expect, test } from '@playwright/test'

test('loads the workbench and preserves local configuration', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'API 中转测试台' })).toBeVisible()
  await expect(page.getByText('测试与聊天工作台')).toBeVisible()

  await page.getByRole('menuitem', { name: '中转管理' }).click()
  await expect(page.getByRole('heading', { name: '中转管理' })).toBeVisible()
  await page.locator('.relay-card').first().getByLabel('名称').fill('测速节点 A')
  await page.locator('.relay-card').first().getByLabel('API Base URL').fill('https://relay.example.com/v1')
  await page.locator('.relay-card').first().getByLabel('API Key').fill('sk-speed-test')
  await expect(page.locator('.relay-card').first().getByRole('button', { name: '获取模型' })).toBeVisible()

  await page.getByRole('menuitem', { name: 'API 配置' }).click()
  const configForm = page.locator('.config-form')
  await expect(page.getByRole('heading', { name: '当前会话设置' })).toBeVisible()
  await configForm.getByText('Responses API', { exact: true }).click()
  await expect(configForm.getByLabel('当前 Base URL')).toHaveValue('https://relay.example.com/v1')
  await expect(configForm.getByLabel('当前模型')).toHaveValue('gpt-4.1-mini')

  await page.getByRole('menuitem', { name: '接口测试' }).click()

  await expect(page.getByRole('heading', { name: '接口测试' })).toBeVisible()
  await expect(page.getByText('https://relay.example.com/v1 · gpt-4.1-mini')).toBeVisible()
  await expect(page.getByRole('button', { name: '测试 /responses' })).toBeVisible()
  await expect(page.locator('.debug-panels').getByText('"input"')).toBeVisible()

  await page.getByRole('menuitem', { name: '中转测速' }).click()
  await expect(page.getByRole('heading', { name: '中转测速' })).toBeVisible()
  await expect(page.locator('.relay-source-table').getByText('测速节点 A', { exact: true })).toBeVisible()
  await expect(page.locator('.relay-source-table').getByText('gpt-4.1-mini')).toBeVisible()
  await expect(page.getByRole('radio', { name: '连通性测试' })).toBeChecked()
  await page.getByText('真实速度测试', { exact: true }).click()
  await expect(page.getByRole('radio', { name: '真实速度测试' })).toBeChecked()

  await page.reload()
  await expect(page.getByText('https://relay.example.com/v1 · gpt-4.1-mini')).toBeVisible()
})
