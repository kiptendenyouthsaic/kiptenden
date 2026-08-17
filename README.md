# Kiptenden Youths Bot

Kiptenden Youths Bot is a WhatsApp multi-device community assistant adapted for Kiptenden Youths. It combines a welcoming youth-organization identity with the original bot’s command framework, group-management tools, media utilities, AI helpers, converters, games, and administration features.

> **Community identity:** Connect, learn, lead, and serve.

## What was changed

The bot now uses Kiptenden Youths as its default name, footer, caption, AI self-description, sticker-pack author, menu theme, browser pairing-page identity, and deployment metadata. A new bundled community emblem is included at `kiptenden/kiptenden-youths-logo-clean.png`, and the default menu uses that local image instead of the previous external image host or channel attribution.

The package also adds organization-focused commands for the public profile, suggested focus areas, participation guidance, and owner-managed organization details. Existing commands and internal plugin names were preserved where necessary so the original feature set remains compatible.

## Requirements

Use Node.js 22.x and npm 11.x. The bot also needs a WhatsApp account that can complete the pairing flow, a persistent filesystem for its SQLite databases, and ffmpeg for audio and media features. The included Dockerfile installs ffmpeg automatically.

## Local setup

```bash
npm install
cp .env.example .env
npm start
```

Open the pairing page shown by the bot’s web server, generate a session ID, and set it as `SESSION_ID` before starting the production process. The exact pairing-page port is controlled by the existing project configuration and defaults to the project’s configured web port.

## Core environment variables

| Variable | Purpose | Recommended value |
| --- | --- | --- |
| `SESSION_ID` | WhatsApp authentication session | Required; generate through the pairing page |
| `BOT_NAME` | WhatsApp bot display name | `KIPTENDEN YOUTHS` |
| `OWNER_NAME` | Administrator or organization name | `Kiptenden Youths` |
| `OWNER_NUMBER` | Owner number used for administration | International digits without `+` |
| `MODE` | Access mode | `public` or `private` |
| `TIME_ZONE` | Menu and scheduler timezone | `Africa/Nairobi` |
| `BOT_PIC` | Optional public profile-image URL | Leave blank to use the bundled local emblem for menus |
| `NEWSLETTER_JID` | Optional official WhatsApp channel JID | Leave blank until an official channel exists |
| `NEWSLETTER_URL` | Optional official WhatsApp channel URL | Leave blank until an official channel exists |
| `BOT_REPO` | Optional GitHub repository for controlled updates | Leave blank unless you own and maintain the repository |
| `AUTO_UPDATE` | Automatic update behavior | `false` by default |

### AI provider configuration

The chatbot no longer uses the unavailable GiftedTech API. With `AI_PROVIDER=auto`, it uses an OpenAI-compatible API when `AI_API_KEY` is configured. If no key is present, it returns a clear configuration error rather than calling an unreliable public endpoint. Pollinations can be selected explicitly with `AI_PROVIDER=pollinations` when its access and key are configured.

| Variable | Purpose | Example |
| --- | --- | --- |
| `AI_PROVIDER` | Provider mode: `auto`, `openai`, or `pollinations` | `auto` |
| `AI_API_BASE_URL` | OpenAI-compatible API base URL | `https://api.openai.com/v1` |
| `AI_API_KEY` | API key for the selected OpenAI-compatible provider | Keep secret |
| `AI_MODEL` | Model name accepted by the provider | `gpt-4o-mini` |
| `AI_REASONING_EFFORT` | Optional reasoning effort for supported models | Blank, or `minimal` |
| `AI_REASONING_PARAM` | Reasoning request format | `reasoning` |
| `POLLINATIONS_MODEL` | Model name when Pollinations is explicitly selected | `openai` |
| `POLLINATIONS_API_KEY` | Optional Pollinations access key | Keep secret |
| `ALLOW_POLLINATIONS_FALLBACK` | Allow fallback after an OpenAI-compatible failure | `false` |

For a reliable production deployment, configure `AI_API_KEY`, `AI_API_BASE_URL`, and `AI_MODEL` through the hosting platform’s secret/environment manager. Use `AI_REASONING_EFFORT=minimal` only with a model/provider that supports the configured reasoning parameter.

Never publish session IDs, WhatsApp credentials, API keys, or GitHub tokens. If the bot is deployed on Heroku or another platform, add secrets through the platform’s secret manager rather than committing them to this repository.

## Kiptenden Youths commands

The following commands are available with the default prefix `.`:

| Command | Purpose |
| --- | --- |
| `.kiptenden` | Show the Kiptenden Youths profile, mission, location, focus areas, and configured contact details |
| `.youths` | Alias for `.kiptenden` |
| `.community` | Alias for `.kiptenden` |
| `.programs` | List configured focus areas |
| `.volunteer` | Explain ways to participate, volunteer, mentor, or support youth-led work |
| `.orginfo` | Show official organization information |
| `.setorginfo field \| value` | Owner-only organization profile configuration |

Supported `.setorginfo` fields are `mission`, `location`, `programs`, `contact`, `email`, and `link`. Separate multiple program items with the pipe character. For example:

```text
.setorginfo programs | Digital literacy | Mentorship | Entrepreneurship | Sports and wellbeing
```

The default organization information is intentionally general. An administrator should replace it with the organization’s verified contact details, official links, current programs, and location before public launch.

## Existing bot features

The original command categories remain available through `.menu`, including AI chat, media downloading, stickers, converters, group administration, moderation, scheduled messages, games, search utilities, polls, reminders, and owner settings. Use `.setmenu` as an owner to view and switch between the available menu designs; the new `COMMUNITY` theme is the default.

The owner can further adjust the live identity with commands already present in the bot, including `.rebrand`, `.setbotpic`, `.setmenupic`, `.setfooter`, `.setcaption`, `.setwm`, and `.wmtoggle`. The bundled emblem is available locally for deployment and can be uploaded through `.setbotpic` or `.setmenupic` if a public URL is preferred for WhatsApp profile delivery.

## Lyrics command

The `.lyrics`, `.songlyrics`, and `.getlyrics` commands use LRCLIB’s anonymous search API by default. Search by title or artist, for example `.lyrics Adele Hello` or `.lyrics Shape of You Ed Sheeran`. The command sends an identifying `User-Agent`, selects a record containing plain or synchronized lyrics, and falls back to a normal text reply when WhatsApp button delivery is unavailable. Configure `LYRICS_API_BASE_URL` and `LYRICS_USER_AGENT` in `.env` if you need a different compatible service. Rate-limit responses are handled with a user-friendly retry message.

## Bible verse command

The `.bible`, `.verse`, `.bibleverse`, and `.scripture` commands use `https://bible-api.com` by default. Examples include `.bible John 3:16`, `.bible John 3:16-20`, and `.bible Psalm 23`. The endpoint and translation can be changed with `BIBLE_API_BASE_URL` and `BIBLE_TRANSLATION` in `.env`. The command no longer depends on the removed legacy API or legacy API credentials. If button delivery is unavailable, it falls back to a normal text reply.

## Duplicate-response protection

The chatbot listener is idempotent: repeated setup calls on the same WhatsApp socket do not create additional listeners, and each inbound message ID is processed only once. The default routing is now `allchats`, which includes both direct messages and groups. On an existing deployment, the owner can run `.setchatbotmode allchats` once, then restart the bot so the old in-memory listeners are discarded.

## Deployment

The included `Dockerfile`, `Procfile`, `heroku.yml`, and `app.json` retain the original deployment pathways but now use Kiptenden Youths metadata. The Docker image uses Node 22, installs Python and native compiler tools required by `better-sqlite3` and `sharp`, installs ffmpeg, installs production dependencies, copies the bot, exposes the configured web port, and starts the bot with `npm start`.

Before enabling update commands, configure `BOT_REPO` to a repository you control and maintain. Automatic updates are disabled by default so the rebranded bot cannot silently pull code from the previous upstream. Use `.setbotrepo <url>` only after verifying the repository and its access policy.

## Operational checklist

Before public launch, set and verify the owner number, session ID, timezone, organization contact, official links, and moderation policy. Test `.menu`, `.kiptenden`, `.programs`, `.volunteer`, `.orginfo`, `.setorginfo`, group-management commands, media conversion, and the pairing page in a staging account. Confirm that any API credentials used by AI or download features are valid and that the deployment has persistent storage for its SQLite databases.

## License

The existing project license and third-party package licenses remain in force. Review the original repository’s license terms and the licenses of all dependencies before redistributing the modified bot.
