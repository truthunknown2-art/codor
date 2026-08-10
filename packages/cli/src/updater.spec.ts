import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Daemon } from '@codor/switchboard';
import { afterEach, describe, expect, it } from 'vitest';

import { createWindowsUpdateController, renderWindowsUpdateScript, updateBlockers } from './updater.js';

const SHA = 'a'.repeat(40);
const TGZ = Buffer.from('verified release');
const TGZ_NAME = 'richhardry-codor-0.11.0.tgz';

const daemon = (options: { memberState?: string; backup?: (path: string) => void } = {}) => ({
  store: {
    listRooms: () => [{ id: 'eng' }],
    listMembers: () => options.memberState === undefined ? [] : [{
      id: 'agent-1', kind: 'agent', handle: 'opus', state: options.memberState,
    }],
    listDeliveries: () => [],
    listInteractions: () => [],
    backup: options.backup ?? (() => undefined),
  },
}) as unknown as Daemon;

describe('updateBlockers', () => {
  it('blocks active agents but permits a fully idle team', () => {
    expect(updateBlockers(daemon())).toEqual([]);
    expect(updateBlockers(daemon({ memberState: 'awaiting_input' }))).toEqual([
      expect.objectContaining({ kind: 'member', label: '@opus', state: 'awaiting_input' }),
    ]);
  });
});

describe('renderWindowsUpdateScript', () => {
  it('health-checks the replacement and restores both runtime and database on failure', () => {
    const script = renderWindowsUpdateScript({
      runtime: 'C:\\runtime', staging: 'C:\\staging', runtimeBackup: 'C:\\rollback',
      database: 'C:\\data\\switchboard.sqlite', databaseBackup: 'C:\\backup.sqlite',
      endpoint: 'http://127.0.0.1:8137', lock: 'C:\\update.lock', log: 'C:\\update.log',
      state: 'C:\\state.json', version: '0.11.0', sha: SHA, tag: 'v0.11.0',
    });
    expect(script).toContain("throw 'updated Codor did not become healthy within 60 seconds'");
    expect(script).toContain('Get-NetTCPConnection -LocalPort $port -State Listen');
    expect(script).toContain('Copy-Item -LiteralPath $databaseBackup -Destination $database -Force');
    expect(script).toContain('Move-WithRetry $rollbackRuntime $runtime');
  });
});

describe('createWindowsUpdateController', () => {
  const roots: string[] = [];
  afterEach(() => { while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true }); });

  it('verifies, stages, snapshots, and launches the external swap helper', async () => {
    const root = mkdtempSync(join(tmpdir(), 'codor-update-'));
    roots.push(root);
    const dataDir = join(root, '.codor');
    mkdirSync(join(dataDir, 'runtime', 'node_modules', '@richhardry', 'codor'), { recursive: true });
    writeFileSync(join(dataDir, 'runtime', 'node_modules', '@richhardry', 'codor', 'package.json'), JSON.stringify({ version: '0.10.10' }));
    writeFileSync(join(dataDir, 'switchboard.sqlite'), 'live');
    let launched = false;
    let npmLaunch: { command: string; args: readonly string[] } | undefined;
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith('/releases/latest')) return new Response(JSON.stringify({
        tag_name: 'v0.11.0', target_commitish: SHA, assets: [
          { name: TGZ_NAME, browser_download_url: 'https://download/package' },
          { name: 'SHA256SUMS', browser_download_url: 'https://download/sums' },
        ],
      }));
      if (url.endsWith('/package')) return new Response(TGZ);
      const hash = createHash('sha256').update(TGZ).digest('hex');
      return new Response(`${hash}  ${TGZ_NAME}\n`);
    };
    const fakeDaemon = daemon({ backup: (path) => writeFileSync(path, 'snapshot') });
    const controller = createWindowsUpdateController({
      daemon: fakeDaemon,
      dataDir,
      endpoint: 'http://127.0.0.1:8137',
      deps: {
        platform: 'win32',
        fetch: fetcher,
        exec: ((command: string, args: readonly string[]) => {
          if (command === 'schtasks.exe') {
            if (args[0] === '/Run') launched = true;
            return Buffer.alloc(0);
          }
          npmLaunch = { command, args };
          const staging = args[args.indexOf('--prefix') + 1]!;
          const cli = join(staging, 'node_modules', '@richhardry', 'codor', 'node_modules', '@codor', 'cli');
          mkdirSync(join(cli, 'dist'), { recursive: true });
          mkdirSync(join(cli, 'runtime', 'web'), { recursive: true });
          writeFileSync(join(cli, 'dist', 'index.js'), '');
          mkdirSync(join(staging, 'node_modules', '@richhardry', 'codor'), { recursive: true });
          writeFileSync(join(staging, 'node_modules', '@richhardry', 'codor', 'package.json'), JSON.stringify({ version: '0.11.0' }));
          return Buffer.alloc(0);
        }) as never,
      },
    });
    const result = await controller.start();
    expect(result).toEqual({ accepted: true, version: '0.11.0', sha: SHA, tag: 'v0.11.0' });
    expect(npmLaunch?.command.toLowerCase()).toMatch(/cmd\.exe$/);
    expect(npmLaunch?.args.slice(0, 5)).toEqual(['/d', '/s', '/c', 'npm.cmd', 'install']);
    expect(launched).toBe(true);
    expect(existsSync(join(dataDir, 'maintenance', `switchboard-${SHA}.sqlite`))).toBe(true);
    expect(readFileSync(join(dataDir, 'maintenance', 'apply-update.ps1'), 'utf8')).toContain('rollback healthy');
  });
});
