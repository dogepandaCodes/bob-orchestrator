import { defineConfig, type HtmlTagDescriptor, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { Readable } from 'node:stream'
import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { IncomingMessage } from 'node:http'

import siteConfiguration from './.figma/make/site.json'

// Vite config — https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // .figma/make/deploy-preview passes `--mode development` for cached-preview builds.
  const emitSourcemaps = mode === 'development'

  return {
    base: process.env.FIGMA_PUBLIC_URL ? `${process.env.FIGMA_PUBLIC_URL}/` : '/',
    build: {
      sourcemap: emitSourcemaps ? 'inline' : false,
      minify: !emitSourcemaps,
    },
    plugins: [
      react(),
      tailwindcss(),
      figmaSiteConfiguration(siteConfiguration),
      figmaErrorOverlayReplay(),
      figmaReactRefreshBoundaryFallback(),
      figmaMakeKitPlugin({ storiesGlob: '/src/**/*.stories.{ts,tsx,js,jsx}' }),
      icaGatewayProxy(),
      bobBridge(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: process.env.FIGMA_DEV_SERVER_HOST || '0.0.0.0',
      port: parseInt(process.env.PORT || '8443'),
      strictPort: true,
      watch: {
        ignored: [
          '**/.figma/**',
          // Runtime state the Bob page writes; watching it reloads the page mid-change.
          '**/mcp/settings.local.json*',
          '**/mcp/repos.local.json*',
],
      },
    },
    preview: {
      host: process.env.FIGMA_DEV_SERVER_HOST || '0.0.0.0',
      port: parseInt(process.env.PORT || '8443'),
    },
  }
})

type FigmaSiteConfiguration = {
  title?: string
  description?: string
  language?: string
  robots?: {
    index?: boolean
  }
  icons?: {
    icon?: string
  }
  openGraph?: {
    image?: string
  }
  analytics?: {
    googleAnalyticsId?: string
  }
  customScripts?: {
    headStart?: string
    headEnd?: string
    bodyStart?: string
    bodyEnd?: string
  }
  accessibility?: {
    addBypassLinks?: boolean
  }
}

/** Applies /.figma/make/site.json to the generated document shell. */
function figmaSiteConfiguration(config: FigmaSiteConfiguration): Plugin {
  function sanitizeHtmlValue(value: string | undefined): string {
    return value?.replace(/[^a-zA-Z0-9_-]/g, '') || ''
  }
  function escapeHtmlText(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
  function replaceHtmlCommentSlot(html: string, slotName: string, content: string): string {
    return html.replace(`<!-- ${slotName} -->`, content)
  }

  const title = config.title ?? "Figma Make App"
  const description = config.description ?? ''
  const favicon = config.icons?.icon ?? ''
  const socialImage = config.openGraph?.image ?? ''
  const language = sanitizeHtmlValue(config.language) || 'en'
  const googleAnalyticsId = sanitizeHtmlValue(config.analytics?.googleAnalyticsId)
  const headStart = config.customScripts?.headStart ?? ''
  const headEnd = config.customScripts?.headEnd ?? ''
  const bodyStart = config.customScripts?.bodyStart ?? ''
  const bodyEnd = config.customScripts?.bodyEnd ?? ''
  const robotsTxt = config.robots?.index === false ? 'User-agent: *\nDisallow: /\n' : ''

  return {
    name: 'figma-site-configuration',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!robotsTxt || req.url?.split('?')[0] !== '/robots.txt') return next()

        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end(robotsTxt)
      })
    },
    generateBundle() {
      if (!robotsTxt) return

      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: robotsTxt,
      })
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        let result = html
        result = replaceHtmlCommentSlot(result, 'figma:lang', language)
        result = replaceHtmlCommentSlot(result, 'figma:title', escapeHtmlText(title))
        result = replaceHtmlCommentSlot(result, 'figma:head-start', headStart)
        result = replaceHtmlCommentSlot(result, 'figma:head-end', headEnd)
        result = replaceHtmlCommentSlot(result, 'figma:body-start', bodyStart)
        result = replaceHtmlCommentSlot(result, 'figma:body-end', bodyEnd)

        const tags: HtmlTagDescriptor[] = []
        if (description) {
          tags.push({ tag: 'meta', attrs: { name: 'description', content: description }, injectTo: 'head' })
        }
        if (config.robots?.index === false) {
          tags.push({ tag: 'meta', attrs: { name: 'robots', content: 'noindex, nofollow' }, injectTo: 'head' })
        }
        if (favicon) {
          tags.push({ tag: 'link', attrs: { rel: 'icon', href: favicon }, injectTo: 'head' })
        }
        if (title) {
          tags.push({ tag: 'meta', attrs: { property: 'og:title', content: title }, injectTo: 'head' })
        }
        if (description) {
          tags.push({ tag: 'meta', attrs: { property: 'og:description', content: description }, injectTo: 'head' })
        }
        if (socialImage) {
          tags.push(
            { tag: 'meta', attrs: { property: 'og:image', content: socialImage }, injectTo: 'head' },
            { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' }, injectTo: 'head' },
            { tag: 'meta', attrs: { name: 'twitter:image', content: socialImage }, injectTo: 'head' },
          )
        }

        if (googleAnalyticsId) {
          tags.push(
            {
              tag: 'script',
              attrs: {
                async: true,
                src: `https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`,
              },
              injectTo: 'head',
            },
            {
              tag: 'script',
              children: `
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', ${JSON.stringify(googleAnalyticsId)});
`,
              injectTo: 'head',
            },
          )
        }

        if (config.accessibility?.addBypassLinks) {
          tags.push(
            {
              tag: 'style',
              children: `
  .figma-bypass-link {
    position: fixed;
    top: 8px;
    left: 8px;
    z-index: 2147483647;
    transform: translateY(-150%);
    border-radius: 6px;
    background: #111827;
    color: #fff;
    padding: 8px 12px;
    font: 600 14px/1.2 system-ui, sans-serif;
    text-decoration: none;
  }
  .figma-bypass-link:focus {
    transform: translateY(0);
  }
`,
              injectTo: 'head',
            },
            {
              tag: 'a',
              attrs: { class: 'figma-bypass-link', href: '#root' },
              children: 'Skip to content',
              injectTo: 'body-prepend',
            },
          )
        }

        return {
          html: result,
          tags,
        }
      },
    },
  }
}

/**
 * Replay the most recent build error to clients that connect after
 * it was first broadcast. Vite buffers an error payload only while
 * no clients are connected and clears the buffer on the first
 * reconnect (see `bufferedMessage` in `createWebSocketServer`), so
 * if the preview iframe reloads after Vite already delivered an
 * error to a live socket, the new socket misses the payload and
 * the overlay stays hidden even though the build is still broken.
 * We intercept `ws.send` to remember the latest error and replay
 * it on every new connection; the cache clears on a successful
 * `update` or `full-reload` so a stale overlay can't survive a
 * fixed build.
 */
function figmaErrorOverlayReplay(): Plugin {
  return {
    name: 'figma-error-overlay-replay',
    apply: 'serve',
    configureServer(server) {
      let lastError: object | null = null

      const origSend = server.ws.send.bind(server.ws) as (...args: any[]) => void
      server.ws.send = ((...args: any[]) => {
        const payload = args[0]
        if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
          const type = (payload as { type?: string }).type
          if (type === 'error') {
            lastError = payload as object
          } else if (type === 'update' || type === 'full-reload') {
            lastError = null
          }
        }
        return origSend(...args)
      }) as typeof server.ws.send

      server.ws.on('connection', (socket) => {
        if (lastError !== null) {
          socket.send(JSON.stringify(lastError))
        }
      })
    },
  }
}

/**
 * Reload when a module that previously defined a React Refresh boundary stops
 * defining one. This happens when an agent moves a component into a new file
 * and replaces the old module with a re-export:
 *
 *   export { default } from './app/App'
 *
 * Vite otherwise accepts the update using the previous module's HMR boundary,
 * but the re-export-only transform no longer registers a replacement for the
 * mounted component family. React reports a successful refresh while leaving
 * the old tree mounted until the page is reloaded.
 */
function figmaReactRefreshBoundaryFallback(): Plugin {
  const hadRefreshBoundary = new Map<string, boolean>()
  let sendFullReload: (() => void) | null = null

  return {
    name: 'figma-react-refresh-boundary-fallback',
    apply: 'serve',
    enforce: 'post',
    configureServer(server) {
      sendFullReload = () => server.ws.send({ type: 'full-reload', path: '*' })
    },
    transform(code, id) {
      if (!/\.[jt]sx?(?:\?|$)/.test(id) || id.includes('/node_modules/')) return null

      const moduleId = id.split('?')[0] ?? id
      const hasRefreshBoundary = code.includes('registerExportsForReactRefresh')
      const previousHadRefreshBoundary = hadRefreshBoundary.get(moduleId)
      hadRefreshBoundary.set(moduleId, hasRefreshBoundary)

      if (previousHadRefreshBoundary && !hasRefreshBoundary) {
        queueMicrotask(() => sendFullReload?.())
      }

      return null
    },
  }
}

/**
 * Serves a blank render-target page at /.figma/make/kit.html that
 * the Figma preview script drives directly. The page exposes a
 * registry of every file matching `storiesGlob` on
 * window.__FIGMA__.stories so the design surface can dynamically
 * import + mount each entry into its own grid view.
 *
 * Dev-only: `apply: 'serve'` gates the plugin to `vite dev`. Prod
 * builds (`vite build`) skip it entirely so the route doesn't leak
 * into shipped bundles.
 */
function figmaMakeKitPlugin(options: { storiesGlob: string | string[] }): Plugin {
  const storiesGlob = Array.isArray(options.storiesGlob) ? options.storiesGlob : [options.storiesGlob]
  const ROUTE = '/.figma/make/kit.html'
  const VIRTUAL_ID = 'virtual:figma-stories'
  const RESOLVED_ID = '\0' + VIRTUAL_ID
  const STORIES_MODULE = `export const stories = import.meta.glob(${JSON.stringify(storiesGlob)})`
  const HTML_BOOTSTRAP = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body>
<div id="figma-make-kit-root"></div>
<script type="module">
  import { stories } from 'virtual:figma-stories'
  window.__FIGMA__ = Object.assign(window.__FIGMA__ ?? {}, { stories })
  window.dispatchEvent(new CustomEvent('figma.ready'))
</script>
</body>
</html>`

  return {
    name: 'figma-make-kit',
    apply: 'serve',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
      return null
    },
    load(id) {
      if (id !== RESOLVED_ID) return null
      return STORIES_MODULE
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || ''
        if (url.split('?')[0] !== ROUTE) return next()

        try {
          res.setHeader('Content-Type', 'text/html')
          res.end(await server.transformIndexHtml(url, HTML_BOOTSTRAP))
        } catch (err) {
          next(err as Error)
        }
      })
    },
  }
}

/**
 * Dev-only forwarder for ICA servers.
 *
 * ICA sends access-control-allow-origin only to IBM domains, so the browser
 * cannot call it directly. And which server a user is on (Global, Global beta…)
 * is chosen in the page, which a static `server.proxy` target cannot follow.
 *
 * The page calls `/ica-gw/<encodeURIComponent(gateway base URL)>/<path>`.
 * Only https hosts under ibm.com are forwarded: the dev server listens on every
 * interface by default, and an unrestricted forwarder would be an open relay
 * for anyone on the network.
 */
function icaGatewayProxy(): Plugin {
  return {
    name: 'ica-gateway-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/ica-gw', async (req, res) => {
        const fail = (status: number, message: string) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: message }))
        }

        const raw = req.url ?? '/'
        const slash = raw.indexOf('/', 1)
        const encoded = slash === -1 ? raw.slice(1) : raw.slice(1, slash)
        const rest = slash === -1 ? '' : raw.slice(slash)

        let base: URL
        try {
          base = new URL(decodeURIComponent(encoded))
        } catch {
          return fail(400, 'The gateway is not a valid URL.')
        }
        const host = base.hostname.toLowerCase()
        if (base.protocol !== 'https:' || !(host === 'ibm.com' || host.endsWith('.ibm.com'))) {
          return fail(403, 'Only https://*.ibm.com gateways can be reached through the dev proxy.')
        }

        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(chunk as Buffer)
        const headers: Record<string, string> = {}
        for (const name of ['authorization', 'content-type', 'accept']) {
          const value = req.headers[name]
          if (typeof value === 'string') headers[name] = value
        }

        // Stop the upstream stream when the page aborts (the chat's stop button).
        const ctl = new AbortController()
        res.on('close', () => ctl.abort())

        let upstream: Response
        try {
          upstream = await fetch(base.href.replace(/\/+$/, '') + rest, {
            method: req.method,
            headers,
            body: req.method === 'GET' || req.method === 'HEAD' || chunks.length === 0 ? undefined : Buffer.concat(chunks),
            signal: ctl.signal,
            redirect: 'manual',
          })
        } catch (e) {
          if (!ctl.signal.aborted) fail(502, `Could not reach ${base.host}: ${(e as Error).message}`)
          return
        }

        // What was asked for against what answered, so a gateway quietly serving
        // another model shows in this log. ICA's gateway is LiteLLM, which names
        // its routing and fallbacks in x-litellm-* headers. Model names only —
        // never the key or the conversation.
        const chat = /\/chat\/completions$/.test(rest.split('?')[0])
        let report = (_served: string) => {}
        if (chat) {
          let asked = '?'
          try {
            asked = String(JSON.parse(Buffer.concat(chunks).toString('utf8')).model ?? '?')
          } catch {
            // not JSON; the gateway will say so
          }
          const routing: string[] = []
          upstream.headers.forEach((value, name) => {
            if (/^x-litellm-.*(model|fallback|retries|api-base)/.test(name)) routing.push(`${name}=${value}`)
          })
          let logged = false
          report = (served) => {
            if (logged) return
            logged = true
            server.config.logger.info(
              `[ica] asked ${asked} · ${upstream.status} · answered ${served || '(not named)'}` +
                (routing.length ? ` · ${routing.join(' ')}` : ''),
              { timestamp: true },
            )
          }
        }

        res.statusCode = upstream.status
        // Pass the upstream's headers through — gateways often report credit or
        // rate-limit state there, and same-origin means the page can read them.
        // Except: content-encoding/length (fetch already decompressed the body,
        // so they would corrupt it), hop-by-hop headers, and set-cookie (an IBM
        // cookie has no business landing on localhost).
        const DROP = new Set([
          'content-encoding', 'content-length', 'transfer-encoding', 'connection',
          'keep-alive', 'set-cookie', 'strict-transport-security', 'alt-svc',
        ])
        upstream.headers.forEach((value, name) => {
          if (!DROP.has(name)) res.setHeader(name, value)
        })
        if (!upstream.body) {
          report('')
          return res.end()
        }
        // Piped, not buffered — chat replies are SSE and must arrive as they stream.
        const body = Readable.fromWeb(upstream.body as never)
        if (chat) {
          // Every chunk names its model; the first one is enough.
          let seen = ''
          body.on('data', (chunk: Buffer) => {
            seen = (seen + chunk.toString('utf8')).slice(-8192)
            const m = /"model"\s*:\s*"([^"]+)"/.exec(seen)
            if (m) report(m[1])
          })
          body.on('end', () => report(''))
        }
        body.on('error', () => res.end()).pipe(res)
      })
    },
  }
}

/**
 * Dev-only bridge from the page to the Orchestrator MCP server (mcp/server.mjs).
 *
 * A page cannot spawn processes, so the dev server runs one copy of the MCP
 * server and speaks MCP to it over stdio — the same server Claude Code runs
 * from .mcp.json, reading the same security settings.
 *
 *   GET  /bob-api/status     repo, security level, Bob Shell state
 *   GET  /bob-api/tools      tools/list
 *   POST /bob-api/call       { name, arguments }  -> tools/call
 *   POST /bob-api/security   { level }            -> orchestrator/setSecurity
 *   GET  /bob-api/changes                         -> orchestrator/changes
 *   POST /bob-api/changes/apply    { id }         -> orchestrator/applyChange
 *   POST /bob-api/changes/discard  { id }         -> orchestrator/discardChange
 *   POST /bob-api/repos/choose                    -> orchestrator/chooseFolder (native dialog)
 *   POST /bob-api/repos/select     { path }       -> orchestrator/setRepo
 *
 * This reads the user's repository, so it answers this machine only: a
 * loopback peer, a localhost Host header (DNS rebinding), and no page from
 * another origin (any site open in another tab could otherwise POST here).
 */
function bobBridge(): Plugin {
  // The slowest role (the Implementer) gives up at 600 s; leave room for its
  // answer, and for a call that waited its turn behind other Bob runs.
  const CALL_TIMEOUT = 900_000
  const QUICK_TIMEOUT = 15_000

  type Pending = { resolve: (value: any) => void; reject: (error: Error) => void }
  type Conn = { proc: ChildProcess; pending: Map<number, Pending>; ready: Promise<void> }

  const abortError = () => Object.assign(new Error('Cancelled'), { name: 'AbortError' })

  return {
    name: 'bob-bridge',
    apply: 'serve',
    configureServer(server) {
      const script = path.resolve(__dirname, 'mcp/server.mjs')
      let conn: Conn | null = null
      let seq = 0

      const send = (c: Conn, msg: object) => c.proc.stdin?.write(`${JSON.stringify(msg)}\n`)

      const call = (c: Conn, method: string, params?: object, signal?: AbortSignal, timeout = QUICK_TIMEOUT) =>
        new Promise<any>((resolve, reject) => {
          if (signal?.aborted) return reject(abortError())
          const id = ++seq
          const finish = () => {
            c.pending.delete(id)
            clearTimeout(timer)
            signal?.removeEventListener('abort', onAbort)
          }
          // Tell the server, so it kills the Bob run instead of finishing it for nobody.
          const cancel = (error: Error, reason: string) => {
            finish()
            send(c, { jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: id, reason } })
            reject(error)
          }
          const onAbort = () => cancel(abortError(), 'The page closed the request.')
          const timer = setTimeout(
            () => cancel(new Error(`${method} got no answer within ${timeout / 1000} s.`), 'Timed out.'),
            timeout,
          )
          signal?.addEventListener('abort', onAbort, { once: true })
          c.pending.set(id, {
            resolve: (value) => (finish(), resolve(value)),
            reject: (error) => (finish(), reject(error)),
          })
          send(c, { jsonrpc: '2.0', id, method, params })
        })

      const open = (): Conn => {
        const proc = spawn(process.execPath, [script], {
          cwd: __dirname,
          // ORCHESTRATOR_REPO, if set, picks the repo at startup; otherwise the
          // server resumes the Bob page's last choice (mcp/repos.local.json).
          env: process.env,
          stdio: ['pipe', 'pipe', 'pipe'],
        })
        const c: Conn = { proc, pending: new Map(), ready: Promise.resolve() }

        createInterface({ input: proc.stdout! }).on('line', (line) => {
          let msg: any
          try {
            msg = JSON.parse(line)
          } catch {
            return
          }
          const entry = c.pending.get(msg?.id)
          if (!entry) return
          if (msg.error) entry.reject(Object.assign(new Error(msg.error.message ?? 'MCP error'), { code: msg.error.code }))
          else entry.resolve(msg.result)
        })
        proc.stderr!.setEncoding('utf8').on('data', (chunk: string) => {
          for (const line of chunk.split('\n')) {
            if (line.trim()) server.config.logger.info(`[bob] ${line}`, { timestamp: true })
          }
        })
        proc.stdin!.on('error', () => {})

        // A crash rejects what was waiting; the next request starts a fresh copy.
        const gone = (why: string) => {
          if (conn === c) conn = null
          for (const entry of [...c.pending.values()]) entry.reject(new Error(`The MCP server ${why}.`))
        }
        proc.on('exit', (code, signal) => gone(`exited (${signal ?? code})`))
        proc.on('error', (e) => gone(`could not start: ${e.message}`))

        c.ready = call(c, 'initialize', {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'orchestrator-web', version: '0.1.0' },
        }).then(() => void send(c, { jsonrpc: '2.0', method: 'notifications/initialized' }))
        c.ready.catch(() => proc.kill())
        return c
      }

      const rpc = async (method: string, params?: object, signal?: AbortSignal, timeout?: number) => {
        const c = (conn ??= open())
        await c.ready
        return call(c, method, params, signal, timeout)
      }

      server.httpServer?.on('close', () => conn?.proc.kill())
      // The page never imports mcp/, so HMR won't notice an edit there — retire
      // the running copy instead, and the next request starts the new code.
      const mcpDir = path.dirname(script) + path.sep
      server.watcher.on('change', (file) => {
        if (file.startsWith(mcpDir) && file.endsWith('.mjs')) conn?.proc.kill()
      })

      server.middlewares.use('/bob-api', async (req, res) => {
        const reply = (status: number, body: unknown) => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json')
          res.setHeader('cache-control', 'no-store')
          res.end(JSON.stringify(body))
        }
        if (!isLocalRequest(req)) return reply(403, { error: 'The Bob bridge only answers this machine.' })

        const route = (req.url ?? '/').split('?')[0]
        const ctl = new AbortController()
        res.on('close', () => {
          if (!res.writableFinished) ctl.abort()
        })

        try {
          if (req.method === 'GET' && route === '/status') {
            return reply(200, await rpc('orchestrator/status', undefined, ctl.signal))
          }
          if (req.method === 'GET' && route === '/tools') {
            return reply(200, await rpc('tools/list', undefined, ctl.signal))
          }
          if (req.method === 'GET' && route === '/changes') {
            return reply(200, await rpc('orchestrator/changes', undefined, ctl.signal))
          }
          const POSTS = ['/call', '/security', '/changes/apply', '/changes/discard', '/repos/choose', '/repos/select']
          if (req.method !== 'POST' || !POSTS.includes(route)) {
            return reply(404, { error: `No such route: ${req.method} /bob-api${route}` })
          }
          // A cross-site form can post text/plain without a preflight; never JSON.
          if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) {
            return reply(415, { error: 'Send application/json.' })
          }
          const body = await readJson(req)
          if (route === '/security') {
            return reply(200, await rpc('orchestrator/setSecurity', { level: body.level }, ctl.signal))
          }
          // Applying writes to the user's checkout. It is reachable only from
          // this page's buttons — the bridge's local-only checks above — and
          // never as a tool, so no model can do it.
          // The dialog waits for the user, so it gets minutes rather than seconds.
          if (route === '/repos/choose') {
            return reply(200, await rpc('orchestrator/chooseFolder', undefined, ctl.signal, 5 * 60_000))
          }
          if (route === '/repos/select') {
            return reply(200, await rpc('orchestrator/setRepo', { path: String(body.path ?? '') }, ctl.signal))
          }
          if (route === '/changes/apply' || route === '/changes/discard') {
            const method = route === '/changes/apply' ? 'orchestrator/applyChange' : 'orchestrator/discardChange'
            return reply(200, await rpc(method, { id: String(body.id ?? '') }, ctl.signal, 60_000))
          }
          return reply(
            200,
            await rpc('tools/call', { name: body.name, arguments: body.arguments ?? {} }, ctl.signal, CALL_TIMEOUT),
          )
        } catch (e) {
          if (ctl.signal.aborted) return
          const error = e as Error & { code?: number }
          reply(error.code === -32602 ? 400 : 502, { error: error.message })
        }
      })
    },
  }
}

function isLocalRequest(req: IncomingMessage): boolean {
  const peer = req.socket.remoteAddress ?? ''
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer)) return false
  const hostOf = (value: string) => {
    try {
      return new URL(value).hostname
    } catch {
      return ''
    }
  }
  if (!['localhost', '127.0.0.1', '[::1]'].includes(hostOf(`http://${req.headers.host ?? ''}`))) return false
  // Browsers send Origin on every POST; it must be this very page.
  const origin = req.headers.origin
  if (!origin) return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

async function readJson(req: IncomingMessage): Promise<Record<string, any>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > 1_000_000) throw Object.assign(new Error('Request body too large.'), { code: -32602 })
    chunks.push(chunk as Buffer)
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  } catch {
    // fall through
  }
  throw Object.assign(new Error('The body is not a JSON object.'), { code: -32602 })
}
