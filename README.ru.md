# @xilin3/dsh-prompt-persona

[![license](https://img.shields.io/badge/license-MIT-6758d4.svg)](./LICENSE)
[![topic](https://img.shields.io/badge/topic-dsh--plugin-6758d4.svg)](https://github.com/topics/dsh-plugin)

**Плагин для DeepSeek Harness (DSH)**: визуальное редактирование системного промпта (`deployment:persona`) прямо на странице настроек, с живым предпросмотром изменений. Это **способ 1 — изменение deployment persona** для добавления системного промпта в Harness.

> В модели сборки системного промпта Harness `deployment:persona` — единственная секция, которую пишет автор конфигурации/деплоя (порядок `0`). Плагин берёт эту секцию под свой контроль и превращает её в содержимое, которое можно редактировать, просматривать и сохранять прямо со страницы настроек — без изменений в самом Harness и без ручного `cordis.patch.yml`.

---

## Возможности

- 🎛️ **Визуальное редактирование**: на странице настроек появляется секция «System Prompt» для прямой записи текста persona.
- 🔀 **Три режима инъекции**: `replace` / `append` / `off`.
- 👁️ **Текущий промпт**: показывает полный системный промпт, действующий сейчас (persona + идентичность harness + инструкции инструментов и все остальные секции).
- ✨ **Предпросмотр результата**: применяет черновик к копии и показывает полный промпт таким, каким он будет после сохранения, — без записи на диск и без влияния на текущее состояние.
- 💾 **Оптимистичное сохранение**: обнаружение конфликтов на основе ревизии настроек (`SETTINGS_CONFLICT` → HTTP 409), чтобы не затереть чужие параллельные правки.
- 🧩 **Шаблонные переменные**: persona поддерживает строгую интерполяцию `{{model}}` / `{{cwd}}` / `{{provider}}`.

---

## Интерфейс

На странице настроек (Settings) появляется секция «System Prompt»:

| Секция | Описание |
| --- | --- |
| Injection Mode | Выпадающий список: replace / append / off |
| Custom Prompt | Многострочное поле с содержимым persona, поддерживает шаблонные переменные |
| Save & Apply / Preview | Сохранение в `settings.yaml`; или только предпросмотр черновика |
| Current Prompt | Полный системный промпт, действующий сейчас (только чтение) |
| Applied Preview | Полный промпт после применения черновика (появляется после нажатия Preview) |

---

## Как это работает

```text
settings.yaml                    HTTP route
  prompt-persona ──────────────► /_dsh/prompt-persona/settings
       │  (persona, mode)              ▲
       ▼                               │ GET snapshot / POST preview|save
system-prompt/assemble waterfall ──────┘
       │  запись persona в секцию deployment:persona
       ▼
полный системный промпт (собирается динамически на каждом шаге)
```

1. **Хост-плагин** (`lib/index.js`) регистрирует namespace настроек `prompt-persona` и слушает глобальный waterfall `system-prompt/assemble`; после каждой сборки записывает persona из настроек в секцию `deployment:persona` согласно `mode`.
2. **HTTP-бэкенд** (`lib/web.js`) вешает маршрут на том же origin и отдаёт браузеру три возможности: текущий промпт, предпросмотр, сохранение.
3. **Браузерный плагин** (`lib/client.js`) встраивает React-панель настроек через слот `settings.section`.

---

## Установка

Добавьте плагин в веб-профиль (`$DSH_HOME/profiles/web/`, Windows по умолчанию `C:\Users\<имя>\.dsh\profiles\web\`).

**Способ A: командная строка** (рекомендуется)

```bash
dsh plugin --profile web add github:zhihus/dsh-prompt-persona-en
```

Затем добавьте `@xilin3/dsh-prompt-persona` в массив `dsh.profile.bundles` в `package.json` профиля (полный пример — в способе B) и перезапустите `dsh web`.

**Способ B: ручное редактирование `package.json` профиля**

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

Затем выполните в каталоге профиля:

```bash
pnpm install
```

И перезапустите `dsh web` (изменения фронтенда/хоста **не** применяются горячо; нужно перезапустить процесс и обновить браузер).

> Для локальной разработки можно использовать `"file:../path/to/dsh-prompt-persona"` или скопировать исходники в каталог профиля и подключить относительным путём `"file:dsh-prompt-persona"`.

---

## Семантика инъекции

`mode` определяет, как persona действует на секцию `deployment:persona` (исходный текст секции — это **текущая persona**):

### `replace` (по умолчанию)

Полная замена секции:

```text
текущая persona:
  Ты — ассистент DeepSeek.

сохранённая persona:
  Ты — старший аналитик данных, рабочая директория — {{cwd}}.

результат deployment:persona:
  Ты — старший аналитик данных, рабочая директория — {{cwd}}.
```

### `append`

Добавление после текущей persona (через пустую строку):

```text
текущая persona:
  Ты — ассистент DeepSeek.

сохранённая persona:
  Отвечай всегда на русском языке.

результат deployment:persona:
  Ты — ассистент DeepSeek.

  Отвечай всегда на русском языке.
```

### `off`

Не инъектировать; оставить persona deployment по умолчанию.

---

## Шаблонные переменные

Persona — это шаблон, который рендерится со **строгой интерполяцией** (незарегистрированные переменные вызывают ошибку). Доступные переменные:

| Переменная | Значение |
| --- | --- |
| `{{model}}` | Текущая модель (agent-default-model или переменная времени выполнения) |
| `{{provider}}` | Текущий провайдер |
| `{{cwd}}` | Рабочая директория процесса |

---

## Справочник по конфигурации

Хранится в `$DSH_HOME/settings.yaml`, namespace `prompt-persona`:

```yaml
prompt-persona:
  persona: |
    Ты — старший аналитик данных.
    Рабочая директория — {{cwd}}, модель — {{model}}.
  mode: replace        # replace | append | off
```

| Поле | Тип | По умолчанию | Описание |
| --- | --- | --- | --- |
| `persona` | string | `""` | Текст persona (шаблон) |
| `mode` | enum | `"replace"` | `replace` / `append` / `off` |

Некорректный `mode` нормализуется в `replace`; `persona` обрезается (`trim`).

---

## HTTP API

Маршрут на том же origin `/_dsh/prompt-persona/settings`, который использует страница настроек браузера:

| Метод | Тело запроса | Описание |
| --- | --- | --- |
| `GET` | — | Возвращает `{ settings: {value, revision, applies}, currentPrompt }` |
| `POST` | `{ action: "preview", persona, mode }` | Возвращает `{ previewPrompt }` |
| `POST` | `{ action: "save", persona, mode, expectedRevision }` | Сохраняет; возвращает новый snapshot |

Сохранение несёт `expectedRevision` (оптимистичная блокировка): при несовпадении ревизии сервер возвращает HTTP `409` (`code: "settings-conflict"`); клиенту нужно перезагрузить данные и повторить.

---

## Структура каталога

```text
dsh-prompt-persona/
├── package.json          # двуликий пакет: dsh.bundle.patch + dsh.client.inject
├── cordis.patch.yml      # bundle patch: вставляет плагин в стек слоёв профиля
├── lib/
│   ├── index.js          # хост-плагин: регистрация настроек + инъекция в waterfall
│   ├── config.js         # схема настроек (schemastery)
│   ├── web.js            # HTTP-бэкенд (snapshot / preview / save)
│   └── client.js         # UI настроек в браузере (CommonJS + window.__ModuleLoader__)
├── README.md
├── README.ru.md
├── README.zh.md
└── LICENSE
```

Без шага сборки: `lib/client.js` — вручную написанный CommonJS-модуль, который загружает напрямую клиентский загрузчик модулей DSH (`window.__ModuleLoader__`).

---

## Зависимости (peerDependencies, предоставляются хостом DSH)

| Пакет | Назначение |
| --- | --- |
| `@deepseek-ai/dsh-settings` | Регистрация namespace настроек / чтение-запись / контроль ревизий |
| `@deepseek-ai/dsh-system-prompt` | `PERSONA_SECTION`, `renderPrompt`, waterfall assemble |
| `@deepseek-ai/dsh-host-webserver` (опционально) | Монтирование HTTP-маршрута на том же origin |
| `@deepseek-ai/dsh-client-runtime` / `-ui-settings` / `-ui-slots` | Браузерный сервис `slots` и слот `settings.section` |
| `schemastery` | Схема конфигурации |
| `cordis` / `react` | Инжектируются хостом во время выполнения |

---

## Лицензия

[MIT](./LICENSE) © 2026 xilin3