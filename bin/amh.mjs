#!/usr/bin/env node
// Thin launcher: the CLI lives in dist/ (built from src/ with tsc).
// Run `npm run build` after changing sources; `npm run amh -- ...` uses the sources directly.
import "../dist/cli.js";
