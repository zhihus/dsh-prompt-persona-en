# @xilin3/dsh-prompt-persona

[![license](https://img.shields.io/badge/license-MIT-6758d4.svg)](./LICENSE)
[![topic](https://img.shields.io/badge/topic-dsh--plugin-6758d4.svg)](https://github.com/topics/dsh-plugin)

A **DeepSeek Harness (DSH) plugin**: visually edit the system prompt (`deployment:persona`) from the Web Settings page and preview changes live. This is **method 1 — edit the deployment persona** for adding a system prompt to the Harness.

> In the Harness system prompt assembly model, `deployment:persona` is the only section written by the config/deployment author (order `0`). This plugin takes over that section and turns it into content that is directly editable, previewable and persistent from the Settings page — no changes to the Harness itself, no hand-written `cordis.patch.yml`.

---

## Features

- 🎛️ **Visual editing**: a new "System Prompt" section appears in the Settings page to write the persona text directly.
- 🔀 **Three injection modes**: `replace` / `append` / `off`.
- 👁️ **Current prompt**: shows the full system prompt currently in effect (persona + harness identity + tool guidance sections).
- ✨ **Applied preview**: applies the draft to a copy and shows the full prompt as it would be after saving, without persisting or touching the current state.
- 💾 **Optimistic concurrent save**: conflict detection based on the settings revision (`SETTINGS_CONFLICT` → HTTP 409), avoiding overwriting concurrent edits by others.
- 🧩 **Template variables**: the persona supports strict interpolation of `{{model}}` / `{{cwd}}` / `{{provider}}`.

---

## UI

The Settings page gains a "System Prompt" section containing:

| Section | Description |
| --- | --- |
| Injection Mode | Dropdown: replace / append / off |
| Custom Prompt | Multi-line textarea with the persona content, supports template variables |
| Save & Apply / Preview | Persist to `settings.yaml`; or only preview the draft |
| Current Prompt | The complete system prompt currently in effect (read-only) |
| Applied Preview | The complete prompt after applying the draft (shown after clicking Preview) |

---

## How it works

```text
settings.yaml                    HTTP route
  prompt-persona ──────────────► /_dsh/prompt-persona/settings
       │  (persona, mode)              ▲
       ▼                               │ GET snapshot / POST preview|save
system-prompt/assemble waterfall ──────┘
       │  write persona into deployment:persona section
       ▼
full system prompt (assembled dynamically each step)
```

1. **Host plugin** (`lib/index.js`) registers the `prompt-persona` settings namespace and listens to the global `system-prompt/assemble` waterfall; after each assembly it writes the settings persona into the `deployment:persona` section according to `mode`.
2. **HTTP backend** (`lib/web.js`) mounts a same-origin route exposing current prompt, preview, and save to the browser.
3. **Browser plugin** (`lib/client.js`) injects the React settings panel via the `settings.section` slot.

---

## Install

Add the plugin to the web profile (`$DSH_HOME/profiles/web/`, Windows default `C:\Users\<you>\.dsh\profiles\web\`).

**Option A: command line** (recommended)

```bash
dsh plugin --profile web add github:zhihus/dsh-prompt-persona-en
```

Then append `@xilin3/dsh-prompt-persona` to the `dsh.profile.bundles` array in that profile's `package.json` (see the full example in Option B), and restart `dsh web`.

**Option B: manually edit the profile's `package.json`**

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "@xilin3/dsh-prompt-persona"
      ]
    }
  },
  "dependencies": {
    "@xilin3/dsh-prompt-persona": "github:zhihus/dsh-prompt-persona-en"
  }
}
```

Then run in the profile directory:

```bash
pnpm install
```

Finally restart `dsh web` (frontend/host changes are **not** hot-reloaded; you must restart the process and refresh the browser).

> For local development you can also use `"file:../path/to/dsh-prompt-persona"`, or copy the source into the profile directory and mount it with the relative path `"file:dsh-prompt-persona"`.

---

## Injection semantics

`mode` decides how the persona acts on the `deployment:persona` section (the section's original text is the **current persona**):

### `replace` (default)

Replaces the whole section:

```text
current persona:
  You are a DeepSeek assistant.

saved persona:
  You are a senior data analyst, working directory is {{cwd}}.

resulting deployment:persona:
  You are a senior data analyst, working directory is {{cwd}}.
```

### `append`

Appends after the existing persona (separated by a blank line):

```text
current persona:
  You are a DeepSeek assistant.

saved persona:
  Please always answer in Simplified Chinese.

resulting deployment:persona:
  You are a DeepSeek assistant.

  Please always answer in Simplified Chinese.
```

### `off`

Does not inject; keeps the deployment default persona.

---

## Template variables

The persona is a template rendered with **strict interpolation** (unregistered variables throw). Available variables:

| Variable | Meaning |
| --- | --- |
| `{{model}}` | Current model (agent-default-model or runtime variable) |
| `{{provider}}` | Current provider |
| `{{cwd}}` | Process working directory |

---

## Configuration reference

Persisted in `$DSH_HOME/settings.yaml` under the `prompt-persona` namespace:

```yaml
prompt-persona:
  persona: |
    You are a senior data analyst.
    Working directory is {{cwd}}, model is {{model}}.
  mode: replace        # replace | append | off
```

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `persona` | string | `""` | Custom persona text (template) |
| `mode` | enum | `"replace"` | `replace` / `append` / `off` |

An invalid `mode` is normalised to `replace`; `persona` is trimmed.

---

## HTTP API

The same-origin route `/_dsh/prompt-persona/settings` used by the browser Settings page:

| Method | Request body | Description |
| --- | --- | --- |
| `GET` | — | Returns `{ settings: {value, revision, applies}, currentPrompt }` |
| `POST` | `{ action: "preview", persona, mode }` | Returns `{ previewPrompt }` |
| `POST` | `{ action: "save", persona, mode, expectedRevision }` | Saves; returns the new snapshot |

Saving carries an `expectedRevision` (optimistic lock): on revision mismatch the server returns HTTP `409` (`code: "settings-conflict"`); the client must reload and retry.

---

## Directory structure

```text
dsh-prompt-persona/
├── package.json          # dual-face package: dsh.bundle.patch + dsh.client.inject
├── cordis.patch.yml      # bundle patch: inserts the plugin into the profile layer stack
├── lib/
│   ├── index.js          # host plugin: settings registration + waterfall injection
│   ├── config.js         # settings schema (schemastery)
│   ├── web.js            # HTTP backend (snapshot / preview / save)
│   └── client.js         # browser settings UI (CommonJS + window.__ModuleLoader__)
├── README.md
├── README.zh.md
└── LICENSE
```

No build step: `lib/client.js` is a hand-written CommonJS module loaded directly by the DSH client module loader (`window.__ModuleLoader__`).

---

## Dependencies (peerDependencies, provided by the DSH host)

| Package | Purpose |
| --- | --- |
| `@deepseek-ai/dsh-settings` | Settings namespace registration / read-write / revision concurrency control |
| `@deepseek-ai/dsh-system-prompt` | `PERSONA_SECTION`, `renderPrompt`, assemble waterfall |
| `@deepseek-ai/dsh-host-webserver` (optional) | Mounts the same-origin HTTP route |
| `@deepseek-ai/dsh-client-runtime` / `-ui-settings` / `-ui-slots` | Browser `slots` service and the `settings.section` slot |
| `schemastery` | Config schema |
| `cordis` / `react` | Injected by the host at runtime |

---

## License

[MIT](./LICENSE) © 2026 xilin3