# NEET PG 377

A static, offline-capable React quiz application for a 377-question NEET PG bank. It supports focused subject practice, flexible mixed quizzes, and a strict 180-question GT with five timed sections.

## Requirements

- [Bun](https://bun.sh/) 1.2 or newer

## Run locally

```bash
bun install
bun run dev:pages
```

The local Vite server prints the URL when it starts.

## Validate and build

```bash
bun run lint
bun run typecheck
bun run test:unit
bun run build:pages
bun run validate:pages
```

`bun run validate` runs the tests, type check, GitHub Pages build, and packaged-data validation in sequence. The static site is written to `dist-github/`.

## GitHub Pages

The workflow at `.github/workflows/deploy-pages.yml` validates and deploys every push to `main`.

1. Push this project to a GitHub repository.
2. In **Settings > Pages**, set **Source** to **GitHub Actions**.
3. Push to `main`, or run the workflow manually from the Actions tab.

The workflow derives the correct base path from the repository name, so both `https://username.github.io/repository/` and a root user site work without source changes.

## Quiz behavior

- **Subject practice:** one subject, 5 to 50 questions, with teaching after each answer or after completion.
- **Mixed quiz:** multiple subjects, 5 to 100 questions, optional image-only filtering, with the same reveal choices.
- **NEET PG GT:** 180 unique scored questions, proportionally sampled by subject, deterministic option shuffling, five sections of 36 questions, and 42 minutes per section. Answers and teaching remain hidden until submission.
- **Scoring:** +4 correct, -1 wrong, 0 skipped.
- **Analysis:** overall score, subject and curriculum-phase performance, GT section performance, time analysis, slow questions, and per-question review.

Progress, answers, deadlines, review flags, elapsed time, and question exposure counts are stored in IndexedDB with a localStorage fallback. Reloading resumes the exact attempt state.

## Data loading

The application loads `manifest.json`, `modes.json`, `taxonomy.json`, and `questions-core.json` at startup. The core file contains no answer or teaching payload. A subject teaching shard is fetched only when an answer may be revealed or when final review needs it. Images also load on demand.

```text
public/data/
├── manifest.json
├── modes.json
├── taxonomy.json
├── questions-core.json
├── teaching/
│   └── {subject}.json
└── images/
```

The service worker precaches the application shell and core quiz data, then runtime-caches teaching shards and images as they are requested.

## Project layout

```text
src/                 React application and domain code
tests/unit/          Bun unit and integrity tests
public/data/         Static, checksummed question bank
public/sw.js         Offline caching strategy
.github/workflows/   GitHub Pages deployment
```

`src/` never contains tests. Question selection, scoring, section timers, persistence, and data access are isolated from view components so they can be tested without a browser.

## Keyboard controls

- `1` to `4`: select an option
- `R`: mark or unmark for review
- Left and right arrows: move between available questions

## Responsive targets

The interface is regression-checked at these CSS viewport profiles:

- iPhone 12: 390 × 844, plus 844 × 390 landscape
- Galaxy S26 Ultra: 412 × 891 and the wider 480 × 1040 display-scaling profile
- Galaxy Tab S9 11-inch: 753 × 1205 and 800 × 1280, plus landscape layouts

Mobile layouts account for display cutouts, iPhone home-indicator insets, dynamic browser toolbars, coarse-pointer touch targets, and Samsung display-scaling changes. Question palettes keep the current item in view automatically. On phones, analysis tables become labelled cards instead of requiring horizontal scrolling.

## Notes

- The web build uses relative data and image URLs so repository subpaths work on GitHub Pages.
- The included Sites/Vinext route imports the same `src/` application and exists only for the verified preview environment used during development. GitHub Pages uses the static Vite build.
