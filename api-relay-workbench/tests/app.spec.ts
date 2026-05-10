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
  await page.getByRole('button', { name: '添加中转站' }).click()
  await expect(page.getByRole('list', { name: '中转站列表' })).toBeVisible()
  await page.getByRole('button', { name: '中转站 2' }).click()
  await page.getByLabel('名称').fill('测速节点 A')
  await page.getByLabel('API Base URL').fill('https://relay.example.com/v1')
  await page.getByLabel('API Key').fill('sk-speed-test')
  await expect(page.getByRole('button', { name: '获取模型' })).toBeVisible()

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
  await page.locator('.topbar').getByText('普通响应', { exact: true }).click()
  await expect(page.locator('.debug-panels').getByText('"stream": false')).toBeVisible()
  await page.locator('.topbar').getByText('流式输出', { exact: true }).click()
  await expect(page.locator('.debug-panels').getByText('"stream": true')).toBeVisible()

  await page.getByRole('menuitem', { name: '中转测速' }).click()
  await expect(page.getByRole('heading', { name: '中转测速' })).toBeVisible()
  const benchmarkSourceRows = page.locator('.relay-source-table .el-table__body-wrapper tbody tr')
  const relaySourceRow = benchmarkSourceRows.filter({ hasText: '测速节点 A' })
  await expect(relaySourceRow).toBeVisible()
  await expect(relaySourceRow.getByText('gpt-4.1-mini')).toBeVisible()
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
    await page.getByRole('button', { name: '添加中转站' }).click()
    await page.getByRole('button', { name: '中转站 2' }).click()
    await page.getByLabel('API Base URL').fill(relay.baseUrl)
    await page.getByLabel('API Key').fill('sk-local-proxy')

    await page.getByRole('menuitem', { name: 'API 配置' }).click()
    await page.locator('.config-form').getByText('本地代理', { exact: true }).click()

    await page.getByRole('menuitem', { name: '接口测试' }).click()
    await page.getByRole('button', { name: '测试 /models' }).click()

    await expect(page.locator('.debug-panels').getByText('proxy-model')).toBeVisible()
  } finally {
    await relay.close()
  }
})

test('api testing sends streaming Responses API requests when stream mode is enabled', async ({ page }) => {
  let receivedBody: unknown
  const relay = await withMockRelay((req, res) => {
    if (req.url === '/v1/responses' && req.method === 'POST') {
      const chunks: Buffer[] = []
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      req.on('end', () => {
        receivedBody = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        res.writeHead(200, { 'Content-Type': 'text/event-stream' })
        res.end(
          [
            'data: {"type":"response.output_text.delta","delta":"pong"}',
            '',
            'data: {"type":"response.completed"}',
            '',
            'data: [DONE]',
            '',
          ].join('\n'),
        )
      })
      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: { message: 'unexpected request' } }))
  })

  try {
    await page.goto('/')
    await page.getByRole('menuitem', { name: '中转管理' }).click()
    await page.getByRole('button', { name: '添加中转站' }).click()
    await page.getByRole('button', { name: '中转站 2' }).click()
    await page.getByLabel('API Base URL').fill(relay.baseUrl)
    await page.getByLabel('API Key').fill('sk-local-proxy')

    await page.getByRole('menuitem', { name: 'API 配置' }).click()
    await page.locator('.config-form').getByText('Responses API', { exact: true }).click()
    await page.locator('.config-form').getByText('本地代理', { exact: true }).click()

    await page.getByRole('menuitem', { name: '接口测试' }).click()
    await page.locator('.topbar').getByText('流式输出', { exact: true }).click()
    await page.getByRole('button', { name: '测试 /responses' }).click()

    await expect(page.locator('.debug-panels').getByText('response.output_text.delta')).toBeVisible()
    await expect.poll(() => receivedBody).toMatchObject({ stream: true, input: [{ role: 'system' }, { role: 'user' }] })
  } finally {
    await relay.close()
  }
})

test('real benchmark runs generation requests concurrently without listing models', async ({ page }) => {
  const requestsByRelay = new Map<string, number>()
  let modelRequests = 0
  const pendingResponses: ServerResponse[] = []

  const createBenchmarkRelay = () => withMockRelay((req, res) => {
    const host = req.headers.host ?? ''
    if (req.url === '/v1/models') {
      modelRequests += 1
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: { message: 'models should not be called' } }))
      return
    }

    if (req.url === '/v1/responses' && req.method === 'POST') {
      requestsByRelay.set(host, (requestsByRelay.get(host) ?? 0) + 1)
      req.resume()
      req.on('end', () => {
        pendingResponses.push(res)
      })
      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: { message: 'unexpected request' } }))
  })
  const relayA = await createBenchmarkRelay()
  const relayB = await createBenchmarkRelay()

  try {
    await page.goto('/')
    await page.getByRole('menuitem', { name: '中转管理' }).click()
    await page.getByRole('button', { name: '添加中转站' }).click()
    await page.getByRole('button', { name: '中转站 2' }).click()
    await page.getByLabel('名称').fill('测速节点 A')
    await page.getByLabel('API Base URL').fill(relayA.baseUrl)
    await page.getByLabel('API Key').fill('sk-local-proxy')
    await page.getByRole('button', { name: '添加中转站' }).click()
    await page.getByRole('button', { name: '中转站 3' }).click()
    await page.getByLabel('名称').fill('测速节点 B')
    await page.getByLabel('API Base URL').fill(relayB.baseUrl)
    await page.getByLabel('API Key').fill('sk-local-proxy')

    await page.getByRole('menuitem', { name: 'API 配置' }).click()
    await page.locator('.config-form').getByText('Responses API', { exact: true }).click()
    await page.locator('.config-form').getByText('本地代理', { exact: true }).click()

    await page.getByRole('menuitem', { name: '中转测速' }).click()
    await page.getByText('真实速度测试', { exact: true }).click()
    await expect(page.getByLabel('每个模型运行次数')).toHaveValue('5')
    await page.getByRole('button', { name: '开始测速' }).click()

    for (let round = 1; round <= 5; round += 1) {
      await expect.poll(() => Array.from(requestsByRelay.values())).toEqual([round, round])
      await expect.poll(() => pendingResponses.length).toBe(2)
      while (pendingResponses.length > 0) {
        const response = pendingResponses.shift()
        response?.writeHead(200, { 'Content-Type': 'application/json' })
        response?.end(JSON.stringify({ output_text: 'pong' }))
      }
    }

    expect(requestsByRelay.size).toBe(2)
    for (const count of requestsByRelay.values()) {
      expect(count).toBe(5)
    }
    await expect(page.locator('.benchmark-table').getByText('5/5')).toHaveCount(2)
    await expect(page.locator('.benchmark-table').getByText(/ms/).first()).toBeVisible()
    expect(modelRequests).toBe(0)
  } finally {
    await relayA.close()
    await relayB.close()
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
    await page.getByRole('button', { name: '添加中转站' }).click()
    await page.getByRole('button', { name: '中转站 2' }).click()
    await page.getByLabel('API Base URL').fill(relay.baseUrl)
    await page.getByLabel('API Key').fill('sk-local-proxy')

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

 test('image generation uses its own base url and api key', async ({ page }) => {
  let receivedBody: unknown
  let receivedAuthorization = ''
  const relay = await withMockRelay((req, res) => {
    if (req.url === '/v1/images/generations' && req.method === 'POST') {
      receivedAuthorization = String(req.headers.authorization ?? '')
      const chunks: Buffer[] = []
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      req.on('end', () => {
        receivedBody = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            data: [
              {
                b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn8cK0AAAAASUVORK5CYII=',
                revised_prompt: '一只坐在霓虹雨夜街头的柴犬',
              },
            ],
          }),
        )
      })
      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: { message: 'unexpected request' } }))
  })

  try {
    await page.goto('/')
    await page.getByRole('menuitem', { name: 'API 配置' }).click()
    await page.locator('.config-form').getByText('本地代理', { exact: true }).click()

    await page.getByRole('menuitem', { name: '图片生成' }).click()
    await page.getByLabel('图片 API Base URL').fill(relay.baseUrl)
    await page.getByLabel('图片 API Key').fill('sk-image-only')
    await page.getByLabel('图片模型').fill('gpt-image-2')
    await page.getByPlaceholder('描述你想生成的图片内容').fill('一只戴宇航员头盔的柯基')

    await expect(page.locator('.image-debug-panels')).toContainText(encodeURIComponent(relay.baseUrl))
    await page.getByRole('button', { name: '生成图片' }).click()

    await expect(page.locator('.image-gallery img')).toHaveCount(1)
    await expect(page.locator('.image-card-body').getByText('一只坐在霓虹雨夜街头的柴犬')).toBeVisible()
    await expect.poll(() => receivedAuthorization).toBe('Bearer sk-image-only')
    await expect.poll(() => receivedBody).toMatchObject({
      model: 'gpt-image-2',
      prompt: '一只戴宇航员头盔的柯基',
      output_format: 'png',
      n: 1,
    })
  } finally {
    await relay.close()
  }
})