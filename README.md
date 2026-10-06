# TravelMapExplorer

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.2.1.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

The shippable SillyTavern extension bundle is built with:

```bash
npm run build:extension
```

This produces a single self-contained ESM bundle at `dist/extension/` (together with `manifest.json` and `style.css`), and fails if the minified + gzipped bundle exceeds the 1.5 MB budget.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
npm run test:unit
```

The unit suites live under `tests/` and run in bare Node. The full acceptance gate — typecheck, boundary lint, ESLint, and the unit suites — is `npm run verify`.

## Running end-to-end tests

End-to-end tests run with [Playwright](https://playwright.dev/) via:

```bash
npm run test:e2e
```

The specs live in `tests/e2e/` as `*.e2e-spec.ts`, and each one runs against two projects: a desktop viewport and an emulated phone (iPhone 13) with touch. The Playwright web server reuses an already-running dev server on `http://localhost:4200/` and starts one otherwise.

## Maps & storage

Uploaded background images are machine-local: they are stored in your browser's localforage under this extension's own store (`travel-map-explorer` / `tme-background-assets`), and a saved or exported map carries only a reference key, not the image bytes. A map moved to another machine therefore keeps its URL-based backgrounds but loses uploaded ones until the images are uploaded again on that machine.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
