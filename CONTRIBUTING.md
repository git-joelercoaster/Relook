# Contributing to Relook

Thanks for helping! Relook is a small personal project, so please keep changes focused and expect replies to take a little while.

## Ground rules

- **Never commit real chat exports**, not even snippets or screenshots of them. Use the fictional sample in `tests/fixtures` or make your own with `tests/fixtures/make_sample_export.py`.
- Keep Relook **local and private**: no telemetry, no uploads, no accounts, no new network calls beyond opening a link the user clicked.
- Be kind. See the [Code of Conduct](CODE_OF_CONDUCT.md).

## Set up

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
git clone https://github.com/git-joelercoaster/Relook.git
cd Relook
npm install
npm start                                  # run the app
npm start -- "path/to/Telegram Desktop"    # open a folder directly
```

## Before you open a pull request

```bash
npm test                 # Windows / macOS
xvfb-run -a npm test     # Linux without a desktop session
```

All tests must pass. If you change what Relook shows or how it parses exports, add or adjust a test in `tests/e2e.mjs`, and extend the sample export if you need new kinds of messages.

## Where things live

| Path | What it does |
|---|---|
| `src/main.js` | Window and panes, the `relook://` file server, folder scanning, settings, theme |
| `src/preload.js` | The bridge between Relook's own pages and the app (web pages never get it) |
| `web/index.html` | Export parser, date tree, searches, list and gallery |
| `web/pane.html` | Message and media viewer |
| `web/shell.html` | Divider and browser toolbar |

## Security-sensitive areas

Changes to these get extra scrutiny, so please explain your reasoning in the PR:

- anything that serves files (`handleAppRequest`, `serveFile`) or the per-launch token
- the preload bridge and the checks on who may send messages
- navigation rules for the browser pane and permission handling

Found a vulnerability? Please don't open a public issue. See [SECURITY.md](SECURITY.md).

## Good first contributions

- Support Telegram's machine-readable **JSON export**
- Viewers for **WhatsApp** or **Signal** exports
- A report of **duplicate media** across several exports
- Translations of the interface
