#!/usr/bin/env node
import { main } from '../src/cli.js';

main().then(
  (code) => { process.exitCode = code; },
  (err) => {
    process.stderr.write(`falsegreen: internal error: ${err?.stack || err}\n`);
    process.exitCode = 2;
  },
);
