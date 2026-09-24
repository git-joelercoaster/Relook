# Changelog

All notable changes to Relook are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-09-24

First public release.

### Added
- Opens Telegram Desktop HTML exports, and merges several exports of the same chat with duplicates removed.
- Year → month → day date tree with message counts.
- Search everything, or only the selected dates (<kbd>/</kbd> or <kbd>Ctrl</kbd>+<kbd>F</kbd>).
- Filters for text, links, photos, videos, audio and files, plus a sender filter; photo and video gallery.
- Viewer pane for photos, videos (with seeking), voice messages and PDFs; arrow-key browsing.
- Links open live in a built-in browser pane with back, forward, reload and a **Message** button.
- Light, dark and system themes.
- Windows, macOS and Linux builds.

### Security
- Export files are served under a private address that changes every launch; web pages in the browser pane get no access to the app or its files, and no camera, microphone, location or notification permissions.

[0.2.0]: https://github.com/git-joelercoaster/Relook/releases/tag/v0.2.0
