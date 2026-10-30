import { resolve } from 'node:path';
const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
export function clientSetup(command: string, args: string[], name = 'darb') {
  const launch = [command, ...args].map(quote).join(' ');
  return {
    codex: `codex mcp add ${name} -- ${launch}`,
    claudeCode: `claude mcp add --transport stdio --scope user ${name} -- ${launch}`,
    verifyCodex: 'codex mcp list',
    verifyClaudeCode: 'claude mcp list',
    next: 'Restart your client session, inspect /mcp, and ask: Use Darb to list my shared courses and show my next session.',
  };
}
export function setupForMode(mode: 'snapshot' | 'live', file: string) {
  return clientSetup(
    process.execPath,
    [resolve(process.argv[1]!), `--${mode}`, resolve(file)],
    `darb-${mode}`,
  );
}
