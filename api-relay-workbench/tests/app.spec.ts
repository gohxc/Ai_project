import { expect, test } from '@playwright/test'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

async function withMockRelay(handler: (req: IncomingMessage, res: ServerResponse) => void) {
  const server = createServer(handler)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Failed to start mock relay')

  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  }
}

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
  await configForm.getByText('本地代理', { exact: true }).click()
  await expect(configForm.getByText('本地代理通过 Vite dev server 转发请求')).toBeVisible()

  await page.getByRole('menuitem', { name: '接口测试' }).click()

  await expect(page.getByRole('heading', { name: '接口测试' })).toBeVisible()
  await expect(page.getByText('https://relay.example.com/v1 · gpt-4.1-mini')).toBeVisible()
  await expect(page.locator('.test-actions .el-tag').filter({ hasText: '本地代理' })).toBeVisible()
  await expect(page.getByText('/api/openai-proxy/responses?baseUrl=https%3A%2F%2Frelay.example.com%2Fv1')).toBeVisible()
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

test('local proxy forwards model requests without browser CORS requirements', async ({ page }) => {
  const relay = await withMockRelay((req, res) => {
    if (req.url === '/v1/models' && req.headers.authorization === 'Bearer sk-local-proxy') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ data: [{ id: 'proxy-model' }] }))
      return
    }

    res.writeHead(403, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: { message: 'unexpected request' } }))
  })

  try {
    await page.goto('/')
    await page.getByRole('menuitem', { name: '中转管理' }).click()
    await page.locator('.relay-card').first().getByLabel('API Base URL').fill(relay.baseUrl)
    await page.locator('.relay-card').first().getByLabel('API Key').fill('sk-local-proxy')

    await page.getByRole('menuitem', { name: 'API 配置' }).click()
    await page.locator('.config-form').getByText('本地代理', { exact: true }).click()

    await page.getByRole('menuitem', { name: '接口测试' }).click()
    await page.getByRole('button', { name: '测试 /models' }).click()

    await expect(page.locator('.debug-panels').getByText('proxy-model')).toBeVisible()
  } finally {
    await relay.close()
  }
})

test('chat request excludes pending assistant placeholder message', async ({ page }) => {
  let receivedBody: unknown
  const relay = await withMockRelay((req, res) => {
    if (req.url === '/v1/chat/completions' && req.method === 'POST') {
      const chunks: Buffer[] = []
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      req.on('end', () => {
        receivedBody = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        res.writeHead(200, { 'Content-Type': 'text/event-stream' })
        res.end('data: {"choices":[{"delta":{"content":"pong"}}]}\n\ndata: [DONE]\n\n')
      })
      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: { message: 'unexpected request' } }))
  })

  try {
    await page.goto('/')
    await page.locator('.nav .el-menu-item').nth(2).click()
    await page.locator('.relay-card').first().getByLabel('API Base URL').fill(relay.baseUrl)
    await page.locator('.relay-card').first().getByLabel('API Key').fill('sk-local-proxy')

    await page.locator('.nav .el-menu-item').nth(0).click()
    await page.locator('.config-form .el-segmented__item').nth(1).click()

    await page.locator('.nav .el-menu-item').nth(4).click()
    await page.locator('.composer textarea').fill('ping')
    await page.locator('.composer button').click()
    await expect(page.locator('.message-assistant').getByText('pong')).toBeVisible()

    expect(receivedBody).toMatchObject({
      messages: [
        { role: 'system' },
        { role: 'user', content: 'ping' },
      ],
    })
    expect((receivedBody as { messages: Array<{ role: string; content: string }> }).messages).not.toContainEqual({
      role: 'assistant',
      content: '',
    })
  } finally {
    await relay.close()
  }
})
