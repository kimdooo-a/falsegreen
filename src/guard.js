// Run a guard: a shell command that answers with its exit code and nothing else.
import { spawnSync } from 'node:child_process';

export const PLACEHOLDER = '{artifact}';

/** Build the shell command: every {artifact} becomes the double-quoted path; appended if absent. */
export function buildCommand(command, artifactPath) {
  const quoted = `"${artifactPath}"`;
  return command.includes(PLACEHOLDER)
    ? command.split(PLACEHOLDER).join(quoted)
    : `${command} ${quoted}`;
}

export function runGuard(command, artifactPath, { timeoutMs = 30000, cwd = process.cwd() } = {}) {
  const started = process.hrtime.bigint();
  const r = spawnSync(buildCommand(command, artifactPath), {
    shell: true,
    cwd,
    timeout: timeoutMs,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, FALSEGREEN: '1' },
  });
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  const timedOut = r.error?.code === 'ETIMEDOUT' || (r.signal === 'SIGTERM' && ms >= timeoutMs - 5);
  return {
    exitCode: r.status,
    signal: r.signal,
    timedOut,
    spawnError: r.error && !timedOut ? r.error.message : null,
    ms: Math.round(ms),
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
}
