# ICS Lunch Money Sync - Bookmarklet

A browser bookmarklet that syncs ICS Bank transactions to Lunch Money directly from your browser.

## Install Bookmarklet

**[Click here to install the bookmarklet](https://getbookmarklets.com/scripts/add?source_url=https%3A%2F%2Fraw.githubusercontent.com%2FH1D%2Fics_lunchmoney_sync%2Fmain%2Fbookmarklet%2Fsrc%2Fbookmarklet.js)** (drag the [Install bookmarklet] button there)

## Project Structure

```
bookmarklet/
├── src/
│   └── bookmarklet.js      # Source code (editable)
├── build.js                 # Build script
├── package.json             # Dependencies & scripts
└── README.md                # This file
../bookmarklet.js            # Built/minified output (repo root)
```

## Development

### Setup

Install dependencies (from this directory):

```bash
cd bookmarklet
bun install
```

### Build

Single build:

```bash
bun run build
```

Watch mode (auto-rebuild on changes):

```bash
bun run watch
# or
bun run dev
```

Or from repo root:

```bash
bun run bookmarklet:build
bun run bookmarklet:watch
```

### Workflow

1. Edit the source file: `src/bookmarklet.js`
2. Run `bun run watch` to auto-build on save
3. The minified bookmarklet is written to `bookmarklet.js`
4. Copy the contents of `bookmarklet.js` and save as a bookmark

## Demo

[▶ Watch demo video](https://github.com/H1D/ics_lunchmoney_sync/blob/main/bookmarklet/usage.mp4)
