import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { PassThrough } from 'node:stream';

import spawn from 'cross-spawn';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { spawnCodexAppServer } from './app-server-transport.js';

vi.mock('cross-spawn', () => ({ default: vi.fn() }));

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fakeChild(): ChildProcessWithoutNullStreams {
  const child = new EventEmitter() as EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
  };
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  return child as unknown as ChildProcessWithoutNullStreams;
}

// harn:assume codex-app-server-resolves-windows-command-shims ref=codex-app-server-portable-spawn-regression
describe('portable Codex app-server launcher', () => {
  beforeEach(() => {
    vi.mocked(spawn).mockReset();
  });

  it('passes the exact command, argv, and retained-child fallback options', async () => {
    const child = fakeChild();
    vi.mocked(spawn).mockReturnValue(child);
    const env = { PATH: '/tools', CODOR_MEMBER_ID: 'member-codex' };

    const launched = spawnCodexAppServer({
      command: '/tools/codex',
      cwd: '/work',
      env,
    });

    expect(spawn).toHaveBeenCalledWith('/tools/codex', ['app-server'], {
      cwd: '/work',
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
      windowsHide: false,
    });
    child.emit('spawn');
    await expect(launched).resolves.toBe(child);
    expect(child.listenerCount('error')).toBe(0);
  });

  it.skipIf(process.platform !== 'win32')(
    'bypasses the npm shim and isolates the installed native Windows engine',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'codor-codex-native-'));
      dirs.push(dir);
      writeFileSync(join(dir, 'codex.cmd'), '@exit /b 9\r\n');
      const target = process.arch === 'arm64'
        ? ['codex-win32-arm64', 'aarch64-pc-windows-msvc']
        : ['codex-win32-x64', 'x86_64-pc-windows-msvc'];
      const packageRoot = join(dir, 'node_modules', '@openai', 'codex');
      const native = join(
        packageRoot,
        'node_modules',
        '@openai',
        target[0]!,
        'vendor',
        target[1]!,
        'bin',
        'codex.exe',
      );
      mkdirSync(join(native, '..'), { recursive: true });
      writeFileSync(join(packageRoot, 'package.json'), '{}');
      writeFileSync(native, 'fake');
      const child = fakeChild();
      vi.mocked(spawn).mockReturnValue(child);
      // Scheduled Tasks preserve Windows' conventional `Path` casing.
      const env = { Path: `${dir}${delimiter}C:\\Windows` };

      const launched = spawnCodexAppServer({ command: 'codex', cwd: dir, env });

      expect(spawn).toHaveBeenCalledWith(native, ['app-server'], {
        cwd: dir,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: true,
        windowsHide: true,
      });
      child.emit('spawn');
      await expect(launched).resolves.toBe(child);
    },
  );

  it('rejects startup errors without waiting for a spawn event', async () => {
    const child = fakeChild();
    vi.mocked(spawn).mockReturnValue(child);
    const launched = spawnCodexAppServer({
      command: 'codex',
      cwd: '/work',
      env: { PATH: '/tools' },
    });

    child.emit('error', new Error('spawn codex ENOENT'));
    await expect(launched).rejects.toThrow('spawn codex ENOENT');
    expect(child.listenerCount('spawn')).toBe(0);
  });
});
// harn:end codex-app-server-resolves-windows-command-shims
