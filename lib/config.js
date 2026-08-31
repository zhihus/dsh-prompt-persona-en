import z from 'schemastery'

/** The settings document namespace owned by this plugin. */
export const SETTINGS_NAMESPACE = 'prompt-persona'

/** User-facing config; all fields get defaults at the schema boundary. */
export const Config = z.object({
  /** Custom persona text (a template supporting {{model}} / {{cwd}}). */
  persona: z.string().default(''),
  /** replace=overwrite deployment:persona; append=append; off=skip injection. */
  mode: z.union(['replace', 'append', 'off']).default('replace'),
})

/** Parse and normalise config (invalid mode falls back to replace). */
export function resolveConfig(config = {}) {
  const persona = typeof config?.persona === 'string' ? config.persona.trim() : ''
  const mode = config?.mode === 'append' || config?.mode === 'off' ? config.mode : 'replace'
  return { persona, mode }
}