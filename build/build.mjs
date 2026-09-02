// build/build.mjs — Schritt 4
// Baut renderer/js/vendor/editor-bundle.js aus build/editor-entry.js neu.
// Der fertige Bundle ist bereits mit ausgeliefert — dieses Skript muss NICHT
// bei jeder Installation laufen, nur wenn build/editor-entry.js geändert
// oder eine der Editor-Abhängigkeiten aktualisiert wird:
//
//   npm run build:vendor
//
// Kein Webpack/Vite nötig — esbuild bündelt alles (CodeMirror, marked,
// highlight.js, KaTeX) zu einer einzigen abhängigkeitsfreien ESM-Datei,
// die der Renderer per <script type="module"> ohne eigenen Bundler lädt.

import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['build/editor-entry.js'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'chrome120',
  outfile: 'renderer/js/vendor/editor-bundle.js',
  logLevel: 'info'
});

await esbuild.build({
  entryPoints: ['build/search-entry.js'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'chrome120',
  outfile: 'renderer/js/vendor/search-bundle.js',
  logLevel: 'info'
});
