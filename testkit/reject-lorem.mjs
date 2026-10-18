// A guard that rejects placeholder text.
import { readFileSync } from 'node:fs';
process.exit(/lorem ipsum/i.test(readFileSync(process.argv[2], 'utf8')) ? 1 : 0);
