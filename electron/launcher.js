// Launches electron.exe with ELECTRON_RUN_AS_NODE removed from env.
// This is needed when running inside environments (e.g. Claude Code) that set
// ELECTRON_RUN_AS_NODE=1, which would otherwise force electron into Node.js mode.
const electron = require('electron');
const { spawnSync } = require('child_process');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const result = spawnSync(electron, ['.'], {
  env,
  stdio: 'inherit',
  cwd: process.cwd(),
});
process.exit(result.status || 0);
