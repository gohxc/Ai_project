import { defineConfig } from 'vite'
import type { Plugin, ViteDevServer } from 'vite'
import vue from '@vitejs/plugin-vue'

const proxyPrefix = '/api/openai-proxy'
const allowedProxyPaths = ['/models', '/chat/completions', '/responses']

function openAiProxyPlugin(): Plugin {
  return {
    name: 'openai-local-proxy',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(proxyPrefix, async (req, res) => {
        try {
          const requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1')
          const targetBaseUrl = requestUrl.searchParams.get('baseUrl')?.replace(/\/+$/, '')
          const targetPath = requestUrl.pathname

          if (!targetBaseUrl) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: { message: 'Missing baseUrl query parameter' } }))
            return
          }

          if (!allowedProxyPaths.includes(targetPath)) {
            res.writeHead(404, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: { message: 'Unsupported proxy endpoint' } }))
            return
          }

          const targetUrl = `${targetBaseUrl}${targetPath}`
          const headers = new Headers()
          for (const [name, value] of Object.entries(req.headers)) {
            if (!value) continue
            const lowerName = name.toLowerCase()
            if (['host', 'connection', 'content-length', 'origin', 'referer'].includes(lowerName)) continue
            headers.set(name, Array.isArray(value) ? value.join(', ') : value)
          }

          const chunks: Buffer[] = []
          for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          }
          const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined

          const response = await fetch(targetUrl, {
            method: req.method,
            headers,
            body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
          })

          const responseHeaders: Record<string, string> = {}
          response.headers.forEach((value, name) => {
            if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(name.toLowerCase())) {
              responseHeaders[name] = value
            }
          })
          responseHeaders['Access-Control-Allow-Origin'] = '*'

          res.writeHead(response.status, responseHeaders)
          if (!response.body) {
            res.end()
            return
          }

          const reader = response.body.getReader()
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            res.write(Buffer.from(value))
          }
          res.end()
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          res.writeHead(502, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: { message } }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), openAiProxyPlugin()],
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
  },
})
