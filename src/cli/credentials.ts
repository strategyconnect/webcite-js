/** Stores the API key in a config file readable only by the current user (mode 600). */

import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function credentialsPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.WEBCITE_CONFIG_DIR) return join(env.WEBCITE_CONFIG_DIR, 'credentials.json');
  const base =
    process.platform === 'win32'
      ? (env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'))
      : (env.XDG_CONFIG_HOME ?? join(homedir(), '.config'));
  return join(base, 'webcite', 'credentials.json');
}

export async function readStoredKey(path = credentialsPath()): Promise<string | undefined> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as { api_key?: unknown };
    return typeof parsed.api_key === 'string' && parsed.api_key ? parsed.api_key : undefined;
  } catch {
    return undefined;
  }
}

export async function storeKey(apiKey: string, path = credentialsPath()): Promise<string> {
  await mkdir(join(path, '..'), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify({ api_key: apiKey })}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
  return path;
}
