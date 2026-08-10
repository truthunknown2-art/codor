import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import type { Daemon, UpdateController, UpdateStartResult, UpdateStatus } from '@codor/switchboard';

import { detectInstalledRuntime, durableRuntimeLocation, installedCliRoot } from './runtime-install.js';

const REPOSITORY = 'truthunknown2-art/codor';
const TASK_NAME = 'Codor Switchboard';
const UPDATE_TASK_NAME = 'Codor Update';
const UPDATE_LOCK_MAX_AGE_MS = 30 * 60_000;

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface GithubRelease {
  tag_name: string;
  target_commitish: string;
  assets: ReleaseAsset[];
}

interface UpdateDeps {
  platform?: NodeJS.Platform;
  fetch?: typeof fetch;
  exec?: typeof execFileSync;
  now?: () => number;
}

function ps(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function readJson(path: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function currentVersion(dataDir: string): string {
  return detectInstalledRuntime(dataDir)?.version ?? 'development';
}

export function updateBlockers(daemon: Daemon): UpdateStatus['blockers'] {
  const blockers: UpdateStatus['blockers'] = [];
  for (const room of daemon.store.listRooms()) {
    for (const member of daemon.store.listMembers(room.id)) {
      if (
        member.kind !== 'human' && member.kind !== 'system' && member.state !== undefined &&
        ['running', 'queued', 'awaiting_input', 'custody_uncertain'].includes(member.state)
      ) {
        blockers.push({ room: room.id, kind: 'member', id: member.id, label: `@${member.handle}`, state: member.state });
      }
    }
    for (const delivery of daemon.store.listDeliveries(room.id)) {
      if (delivery.state === 'queued' || delivery.state === 'delivering') {
        blockers.push({ room: room.id, kind: 'delivery', id: delivery.id, state: delivery.state });
      }
    }
    for (const interaction of daemon.store.listInteractions(room.id)) {
      if (interaction.state === 'pending' || interaction.state === 'answered') {
        blockers.push({ room: room.id, kind: 'interaction', id: interaction.id, state: interaction.state });
      }
    }
  }
  return blockers;
}

export function renderWindowsUpdateScript(options: {
  runtime: string;
  staging: string;
  runtimeBackup: string;
  database: string;
  databaseBackup: string;
  endpoint: string;
  lock: string;
  log: string;
  state: string;
  version: string;
  sha: string;
  tag: string;
  serviceTaskName?: string;
  updateTaskName?: string;
  healthAttempts?: number;
}): string {
  const serviceTaskName = options.serviceTaskName ?? TASK_NAME;
  const updateTaskName = options.updateTaskName ?? UPDATE_TASK_NAME;
  const healthAttempts = options.healthAttempts ?? 60;
  const success = JSON.stringify({ state: 'current', version: options.version, sha: options.sha, tag: options.tag });
  const rollback = JSON.stringify({ state: 'rolled_back', failed_version: options.version, failed_sha: options.sha, tag: options.tag });
  return [
    "$ErrorActionPreference = 'Stop'",
    `$runtime = ${ps(options.runtime)}`,
    `$staging = ${ps(options.staging)}`,
    `$rollbackRuntime = ${ps(options.runtimeBackup)}`,
    `$database = ${ps(options.database)}`,
    `$databaseBackup = ${ps(options.databaseBackup)}`,
    `$endpoint = ${ps(options.endpoint)}`,
    `$port = ([Uri]$endpoint).Port`,
    `$lock = ${ps(options.lock)}`,
    `$log = ${ps(options.log)}`,
    `$state = ${ps(options.state)}`,
    `function Log([string]$message) { Add-Content -LiteralPath $log -Value (('[{0:o}] {1}' -f [DateTime]::UtcNow, $message)) }`,
    `function Stop-Codor { & schtasks.exe /End /TN ${ps(serviceTaskName)} 2>$null | Out-Null; Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }; for ($i = 0; $i -lt 20; $i++) { if (-not (Healthy)) { return }; Start-Sleep -Milliseconds 250 }; throw 'old Codor process kept the health endpoint open' }`,
    `function Start-Codor { & schtasks.exe /Run /TN ${ps(serviceTaskName)} | Out-Null; if ($LASTEXITCODE -ne 0) { throw 'Scheduled Task failed to start' } }`,
    `function Finish { Remove-Item -LiteralPath $lock -Force -ErrorAction SilentlyContinue; & schtasks.exe /Delete /TN ${ps(updateTaskName)} /F 2>$null | Out-Null }`,
    `function Healthy { try { $r = Invoke-WebRequest -UseBasicParsing -Uri ($endpoint + '/api/pairing/status') -TimeoutSec 2; return $r.StatusCode -eq 200 } catch { return $false } }`,
    `function Wait-Healthy { for ($i = 0; $i -lt ${String(healthAttempts)}; $i++) { if (Healthy) { return $true }; Start-Sleep -Seconds 1 }; return $false }`,
    `function Move-WithRetry([string]$from, [string]$to) { for ($i = 0; $i -lt 120; $i++) { try { Move-Item -LiteralPath $from -Destination $to -ErrorAction Stop; return } catch { Start-Sleep -Milliseconds 500 } }; throw ('Windows kept files locked under ' + $from) }`,
    `Start-Sleep -Milliseconds 250`,
    `$movedOld = $false`,
    `try {`,
    `  Log 'stopping service for verified runtime swap'`,
    `  Stop-Codor`,
    `  if (Test-Path -LiteralPath $rollbackRuntime) { Remove-Item -LiteralPath $rollbackRuntime -Recurse -Force }`,
    `  Move-WithRetry $runtime $rollbackRuntime`,
    `  $movedOld = $true`,
    `  Move-WithRetry $staging $runtime`,
    `  Start-Codor`,
    `  if (-not (Wait-Healthy)) { throw 'updated Codor did not become healthy within ${String(healthAttempts)} seconds' }`,
    `  Set-Content -LiteralPath $state -Value ${ps(success)} -Encoding utf8`,
    `  Remove-Item -LiteralPath $rollbackRuntime -Recurse -Force`,
    `  Finish`,
    `  Log 'update healthy; previous runtime removed'`,
    `  exit 0`,
    `} catch {`,
    `  Log ('update failed: ' + $_.Exception.Message + '; restoring previous runtime and database')`,
    `  Stop-Codor`,
    `  if ($movedOld) {`,
    `    if (Test-Path -LiteralPath $runtime) { Remove-Item -LiteralPath $runtime -Recurse -Force }`,
    `    Move-WithRetry $rollbackRuntime $runtime`,
    `    Remove-Item -LiteralPath ($database + '-wal') -Force -ErrorAction SilentlyContinue`,
    `    Remove-Item -LiteralPath ($database + '-shm') -Force -ErrorAction SilentlyContinue`,
    `    Copy-Item -LiteralPath $databaseBackup -Destination $database -Force`,
    `  }`,
    `  Start-Codor`,
    `  $restored = Wait-Healthy`,
    `  Set-Content -LiteralPath $state -Value ${ps(rollback)} -Encoding utf8`,
    `  Finish`,
    `  if (-not $restored) { Log 'rollback failed its health check'; exit 2 }`,
    `  Log 'rollback healthy'`,
    `  exit 1`,
    `}`,
    '',
  ].join('\r\n');
}

async function bytes(url: string, fetcher: typeof fetch): Promise<Buffer> {
  const response = await fetcher(url, { headers: { 'user-agent': 'truthunknown-codor-updater' } });
  if (!response.ok) throw new Error(`download failed (${String(response.status)}): ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

async function release(tag: string | undefined, fetcher: typeof fetch): Promise<GithubRelease> {
  if (tag !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(tag)) throw new Error('invalid release tag');
  const suffix = tag === undefined ? 'latest' : `tags/${encodeURIComponent(tag)}`;
  const response = await fetcher(`https://api.github.com/repos/${REPOSITORY}/releases/${suffix}`, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'truthunknown-codor-updater' },
  });
  if (!response.ok) throw new Error(`GitHub release lookup failed (${String(response.status)})`);
  const value = await response.json() as GithubRelease;
  if (!/^[0-9a-f]{40}$/i.test(value.target_commitish)) {
    throw new Error('release is not pinned to an exact commit SHA');
  }
  return value;
}

function checksumFor(checksums: string, filename: string): string {
  const line = checksums.split(/\r?\n/).find((candidate) => candidate.trim().endsWith(`  ${filename}`));
  const hash = line?.trim().split(/\s+/)[0];
  if (hash === undefined || !/^[0-9a-f]{64}$/i.test(hash)) throw new Error(`SHA256SUMS has no valid entry for ${filename}`);
  return hash.toLowerCase();
}

export function createWindowsUpdateController(options: {
  daemon: Daemon;
  dataDir: string;
  endpoint: string;
  deps?: UpdateDeps;
}): UpdateController {
  const deps = options.deps ?? {};
  const platform = deps.platform ?? process.platform;
  const fetcher = deps.fetch ?? fetch;
  const exec = deps.exec ?? execFileSync;
  const now = deps.now ?? Date.now;
  const maintenance = join(options.dataDir, 'maintenance');
  const lock = join(maintenance, 'update.lock');
  const statePath = join(maintenance, 'update-state.json');

  const lockActive = (): boolean => {
    if (!existsSync(lock)) return false;
    if (now() - statSync(lock).mtimeMs <= UPDATE_LOCK_MAX_AGE_MS) return true;
    rmSync(lock, { force: true });
    return false;
  };

  const status = async (): Promise<UpdateStatus> => {
    const saved = readJson(statePath);
    return {
      supported: platform === 'win32' && detectInstalledRuntime(options.dataDir) !== undefined,
      current_version: currentVersion(options.dataDir),
      ...(saved?.state === 'current' && typeof saved.sha === 'string' && { current_sha: saved.sha }),
      state: lockActive() ? 'preparing' : 'idle',
      blockers: updateBlockers(options.daemon),
    };
  };

  return {
    status,
    start: async (tag): Promise<UpdateStartResult> => {
      if (platform !== 'win32') return { accepted: false, status_code: 501, error: 'safe updates currently require Windows', status: await status() };
      if (detectInstalledRuntime(options.dataDir) === undefined) return { accepted: false, status_code: 501, error: 'safe updates require a durable Codor install', status: await status() };
      mkdirSync(maintenance, { recursive: true });
      if (lockActive()) return { accepted: false, status_code: 409, error: 'an update is already preparing', status: await status() };
      const firstBlockers = updateBlockers(options.daemon);
      if (firstBlockers.length > 0) return { accepted: false, status_code: 409, error: 'Codor is not idle', status: await status() };
      writeFileSync(lock, `${new Date(now()).toISOString()}\n`, { encoding: 'utf8', flag: 'wx' });
      const runtime = durableRuntimeLocation(options.dataDir);
      const staging = `${runtime}.staging-update`;
      const runtimeBackup = `${runtime}.rollback`;
      try {
        const candidate = await release(tag, fetcher);
        if (readJson(statePath)?.sha === candidate.target_commitish) {
          rmSync(lock, { force: true });
          return { accepted: false, status_code: 409, error: 'this Codor release is already installed', status: await status() };
        }
        const tgzAsset = candidate.assets.find((asset) => /^richhardry-codor-[0-9A-Za-z.-]+\.tgz$/.test(asset.name));
        const sumsAsset = candidate.assets.find((asset) => asset.name === 'SHA256SUMS');
        if (tgzAsset === undefined || sumsAsset === undefined) throw new Error('release is missing the Codor package or SHA256SUMS');
        const [tgz, sums] = await Promise.all([
          bytes(tgzAsset.browser_download_url, fetcher),
          bytes(sumsAsset.browser_download_url, fetcher),
        ]);
        const expected = checksumFor(sums.toString('utf8'), tgzAsset.name);
        const actual = createHash('sha256').update(tgz).digest('hex');
        if (actual !== expected) throw new Error(`SHA-256 mismatch for ${tgzAsset.name}`);
        const secondBlockers = updateBlockers(options.daemon);
        if (secondBlockers.length > 0) throw new Error('Codor stopped being idle while the release downloaded');

        rmSync(staging, { recursive: true, force: true });
        rmSync(runtimeBackup, { recursive: true, force: true });
        const packagePath = join(maintenance, tgzAsset.name);
        writeFileSync(packagePath, tgz);
        exec(process.env.ComSpec ?? 'cmd.exe', [
          '/d', '/s', '/c', 'npm.cmd', 'install', '--prefix', staging, packagePath,
          '--omit=dev', '--no-audit', '--no-fund',
        ], { stdio: 'pipe' });
        const cliRoot = installedCliRoot(staging);
        if (!existsSync(join(cliRoot, 'dist', 'index.js')) || !existsSync(join(cliRoot, 'runtime', 'web'))) {
          throw new Error('staged release is missing its CLI entrypoint or web assets');
        }
        const manifest = readJson(join(staging, 'node_modules', '@richhardry', 'codor', 'package.json'));
        if (typeof manifest?.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
          throw new Error('staged release has no stable version');
        }

        const database = join(options.dataDir, 'switchboard.sqlite');
        const databaseBackup = join(maintenance, `switchboard-${candidate.target_commitish}.sqlite`);
        rmSync(databaseBackup, { force: true });
        options.daemon.store.backup(databaseBackup);
        const scriptPath = join(maintenance, 'apply-update.ps1');
        const log = join(maintenance, 'update.log');
        writeFileSync(statePath, `${JSON.stringify({ state: 'preparing', version: manifest.version, sha: candidate.target_commitish, tag: candidate.tag_name })}\n`);
        writeFileSync(scriptPath, renderWindowsUpdateScript({
          runtime,
          staging,
          runtimeBackup,
          database,
          databaseBackup,
          endpoint: options.endpoint,
          lock,
          log,
          state: statePath,
          version: manifest.version,
          sha: candidate.target_commitish,
          tag: candidate.tag_name,
        }), 'utf8');
        const taskCommand = `powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "${scriptPath}"`;
        exec('schtasks.exe', ['/Create', '/TN', UPDATE_TASK_NAME, '/TR', taskCommand, '/SC', 'ONCE', '/ST', '00:00', '/IT', '/F'], { stdio: 'pipe' });
        exec('schtasks.exe', ['/Run', '/TN', UPDATE_TASK_NAME], { stdio: 'pipe' });
        return { accepted: true, version: manifest.version, sha: candidate.target_commitish, tag: candidate.tag_name };
      } catch (error) {
        rmSync(lock, { force: true });
        rmSync(staging, { recursive: true, force: true });
        return { accepted: false, status_code: 500, error: String(error), status: await status() };
      }
    },
  };
}
