# ICS Lunch Money Sync - Bookmarklet

A browser bookmarklet that syncs ICS Bank transactions to Lunch Money directly from your browser.

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

## How It Works

The build script (`build.js`):
1. Reads `src/bookmarklet.js`
2. Minifies it using esbuild
3. Wraps it with `javascript:` protocol
4. Writes to `bookmarklet.js`

### Build Output

- **Source**: ~250 lines, readable
- **Built**: ~4.7KB, single-line minified
- **Target**: ES2022 (modern browsers)

## Using the Bookmarklet

1. Copy the entire content of `bookmarklet.js`
2. Create a new bookmark in your browser
3. Paste the code as the URL
4. Visit [ICS Cards website](https://www.icscards.nl/) and log in
5. Click the bookmarklet

On first run, it will prompt for:
- ICS Bank Account Number
- Lunch Money Asset ID
- Lunch Money API Token

Values are stored in localStorage for future use.

## Demo

Watch a video demonstration of the bookmarklet in action:

<video width="800" height="450" controls>
  <source src="https://github.com/H1D/ics_lunchmoney_sync/raw/main/bookmarklet/usage.mp4" type="video/mp4">
  Your browser does not support the video tag. <a href="https://github.com/H1D/ics_lunchmoney_sync/raw/main/bookmarklet/usage.mp4">Download the video</a> instead.
</video>

## Submission to getbookmarklets.com

This bookmarklet is ready for submission to [getbookmarklets.com](https://getbookmarklets.com/scripts/add).

**Submission URL:** Use the raw GitHub URL to the source file:
```
https://raw.githubusercontent.com/H1D/ics_lunchmoney_sync/main/bookmarklet/src/bookmarklet.js
```

The source file includes userscript-style metadata (`@name`, `@description`, `@image`, `@video`) that will be automatically extracted by getbookmarklets.com.

## Features

- ✅ Modern JavaScript (ES2022)
- ✅ Native `<dialog>` element for modals
- ✅ Tailwind CSS styling (loaded dynamically)
- ✅ Automatic minification with esbuild
- ✅ Watch mode for development
- ✅ localStorage for credentials
- ✅ Syncs last 50 days of transactions

## Tech Stack

- **Runtime**: Bun
- **Bundler**: esbuild (fastest in class)
- **Styling**: Tailwind CSS CDN
- **Target**: Modern browsers (2022+)
