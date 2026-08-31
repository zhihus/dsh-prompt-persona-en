import { PERSONA_SECTION, renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import { SETTINGS_NAMESPACE, resolveConfig } from './config.js'

/** The main route used by the browser Settings page. */
export const SETTINGS_ROUTE = '/_dsh/prompt-persona/settings'

/** Apply the draft persona to a copy of the sections (does not mutate the original objects). */
function applyDraft(sections, draft) {
  const { persona, mode } = resolveConfig(draft)
  if (mode === 'off' || persona.length === 0) return sections
  return sections.map((section) => {
    if (section.name !== PERSONA_SECTION) return section
    if (mode === 'replace') return { ...section, text: persona }
    const current = typeof section.text === 'string' && section.text.length > 0 ? section.text : ''
    return { ...section, text: (current ? current + '\n\n' : '') + persona }
  })
}

/** Render an assembly into the full prompt text, filling in model/cwd/provider variables. */
function renderAssembly(assembly, ctx) {
  const defaultModel = ctx.settings.get('agent-default-model')
  const variables = {
    ...assembly.variables,
    provider: assembly.variables.provider ?? defaultModel?.provider ?? '(provider)',
    model: assembly.variables.model ?? defaultModel?.model ?? '(model)',
    cwd: assembly.variables.cwd ?? process.cwd(),
  }
  try {
    return renderPrompt({ sections: assembly.sections, tools: assembly.tools, variables })
  } catch {
    // Fallback: if strict interpolation fails because of some future unregistered variable,
    // manually replace the known variables.
    const v = variables
    const repl = (s) => String(s)
      .replace(/\{\{\s*model\s*\}\}/g, v.model)
      .replace(/\{\{\s*cwd\s*\}\}/g, v.cwd)
      .replace(/\{\{\s*provider\s*\}\}/g, v.provider)
    return assembly.sections.map((s) => repl(s.text)).filter((t) => t.length > 0).join('\n\n')
  }
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

async function readBody(req, maxBytes = 256 * 1024) {
  const chunks = []
  let bytes = 0
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += part.length
    if (bytes > maxBytes) throw new RangeError('request body too large')
    chunks.push(part)
  }
  if (chunks.length === 0) throw new TypeError('empty body')
  return Buffer.concat(chunks).toString('utf8')
}

/** Same-origin settings/preview handler. */
export class PromptPersonaWebBackend {
  constructor(ctx, settingsScope) {
    this.ctx = ctx
    this.settingsScope = settingsScope
  }

  async currentPromptText() {
    const assembly = await this.ctx.systemPrompt.assemble()
    return renderAssembly(assembly, this.ctx)
  }

  async snapshot() {
    const descriptor = this.ctx.settings.describe().find((row) => row.ns === SETTINGS_NAMESPACE)
    const value = this.settingsScope.get()
    return {
      settings: {
        value: resolveConfig(value),
        revision: descriptor?.revision ?? 0,
        applies: descriptor?.applies ?? 'live',
      },
      currentPrompt: await this.currentPromptText(),
    }
  }

  async preview(draft) {
    const assembly = await this.ctx.systemPrompt.assemble()
    const sections = applyDraft(assembly.sections.map((s) => ({ ...s })), draft)
    return { previewPrompt: renderAssembly({ ...assembly, sections }, this.ctx) }
  }

  async save(draft, expectedRevision) {
    if (!this.ctx.settings.writable) throw new Error('settings provider is read-only')
    const { persona, mode } = resolveConfig(draft)
    await this.ctx.settings.replace(SETTINGS_NAMESPACE, { persona, mode }, expectedRevision)
    return this.snapshot()
  }

  responseJson(res, status, body) {
    const bytes = Buffer.from(JSON.stringify(body))
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Length', String(bytes.length))
    res.setHeader('Cache-Control', 'no-store')
    res.writeHead(status)
    res.end(bytes)
  }

  async handle(req, res) {
    if (req.method === 'GET') {
      try {
        this.responseJson(res, 200, { ok: true, value: await this.snapshot() })
      } catch (error) {
        this.responseJson(res, 503, { ok: false, error: { code: 'unavailable', message: messageOf(error) } })
      }
      return
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST')
      this.responseJson(res, 405, { ok: false, error: { code: 'method-not-allowed', message: 'Use GET or POST' } })
      return
    }
    let body
    try {
      body = JSON.parse(await readBody(req))
    } catch (error) {
      this.responseJson(res, 400, { ok: false, error: { code: 'invalid-request', message: messageOf(error) } })
      return
    }
    try {
      if (body?.action === 'preview') {
        this.responseJson(res, 200, { ok: true, value: await this.preview(body) })
      } else if (body?.action === 'save') {
        if (!Number.isSafeInteger(body.expectedRevision)) throw new Error('expectedRevision must be a non-negative integer')
        this.responseJson(res, 200, { ok: true, value: await this.save(body, body.expectedRevision) })
      } else {
        this.responseJson(res, 400, { ok: false, error: { code: 'invalid-request', message: 'unsupported action' } })
      }
    } catch (error) {
      const conflict = error?.code === 'SETTINGS_CONFLICT'
      this.responseJson(res, conflict ? 409 : 400, {
        ok: false,
        error: { code: conflict ? 'settings-conflict' : 'rejected', message: messageOf(error) },
      })
    }
  }
}

/** Mount the same-origin route when a webServer service is available. */
export function installPromptPersonaWeb(ctx, backend) {
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => {
      const dispose = webCtx.webServer.register({
        kind: 'exact',
        path: SETTINGS_ROUTE,
        handler: (req, res) => backend.handle(req, res),
      })
      return () => dispose()
    }, 'prompt-persona: web route')
  })
}