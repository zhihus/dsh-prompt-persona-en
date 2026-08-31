import { PERSONA_SECTION } from '@deepseek-ai/dsh-system-prompt'
import { Config, SETTINGS_NAMESPACE, resolveConfig } from './config.js'
import { PromptPersonaWebBackend, installPromptPersonaWeb } from './web.js'

export const name = '@xilin3/dsh-prompt-persona'

/** Dependent services: settings (persistence) and systemPrompt (injection). */
export const inject = ['settings', 'systemPrompt']

/**
 * Host plugin entry point.
 * 1. Register the settings namespace (persisted to settings.yaml, editable from the Settings page).
 * 2. Inject the persona into deployment:persona in the system-prompt/assemble waterfall.
 * 3. Mount a same-origin HTTP route for the browser Settings page (current prompt / preview / save).
 */
export function apply(ctx, config = {}) {
  const settings = ctx.settings.register(SETTINGS_NAMESPACE, Config, {
    base: config,
    applies: 'live',
    validate: (value) => { resolveConfig(value) },
  })

  // After every prompt assembly, write the settings persona into deployment:persona.
  // The untagged global listener is let through by scopeTarget, covering every agent scope.
  const disposeAssembly = ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const assembled = await next()
    const { persona, mode } = resolveConfig(settings.get())
    if (mode === 'off' || persona.length === 0) return assembled
    for (const section of assembled.sections) {
      if (section.name !== PERSONA_SECTION) continue
      if (mode === 'replace') {
        section.text = persona
      } else {
        const current = typeof section.text === 'string' && section.text.length > 0 ? section.text : ''
        section.text = (current ? current + '\n\n' : '') + persona
      }
    }
    return assembled
  })

  const backend = new PromptPersonaWebBackend(ctx, settings)
  installPromptPersonaWeb(ctx, backend)

  return () => { disposeAssembly() }
}