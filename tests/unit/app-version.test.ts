import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_VERSION } from '../../src/components/help/shortcuts';

describe('APP_VERSION', () => {
  it('matches package.json, so Help and About show the released version', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8')) as { version: string };
    expect(APP_VERSION).toBe(pkg.version);
  });
});
