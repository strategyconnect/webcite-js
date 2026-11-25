// Marks the CommonJS build so Node loads it with require(), and makes the CLI executable.
import { chmodSync, writeFileSync } from 'node:fs';

writeFileSync('dist/cjs/package.json', '{\n  "type": "commonjs"\n}\n');
chmodSync('dist/esm/cli/bin.js', 0o755);
