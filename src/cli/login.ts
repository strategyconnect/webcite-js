/**
 * `webcite login`. The Webcite authorization server does not advertise a device authorization
 * endpoint, so this opens the API keys page and stores a pasted key; it does not invent a flow.
 */

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { KEYS_PAGE } from '../errors.js';
import { storeKey } from './credentials.js';

function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true })
      .on('error', () => undefined)
      .unref();
  } catch {
    // The URL is printed as well, so a missing opener is not an error.
  }
}

async function readPiped(): Promise<string> {
  let text = '';
  for await (const chunk of process.stdin) text += String(chunk);
  return text.trim();
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
    const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput.bind(rl);
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
      if (s.includes(question)) write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stderr.write('\n');
      resolve(answer.trim());
    });
  });
}

export interface LoginResult {
  readonly apiKey: string;
  readonly interactive: boolean;
}

/** Returns the key to validate, or undefined when none was given. */
export async function readKey(options: { openBrowser: boolean }): Promise<LoginResult | undefined> {
  if (!process.stdin.isTTY) {
    const piped = await readPiped();
    return piped ? { apiKey: piped, interactive: false } : undefined;
  }
  process.stderr.write(`Create or copy an API key at ${KEYS_PAGE} (sign-in required).\n`);
  if (options.openBrowser) openBrowser(KEYS_PAGE);
  const apiKey = await promptHidden('Paste your API key: ');
  return apiKey ? { apiKey, interactive: true } : undefined;
}

export { storeKey };
