import { execSync } from 'child_process';
import { cpSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const DIST  = 'dist/auto-rpg/browser';
const TMP   = 'C:\\tmp\\ghpd';
const REPO  = 'https://github.com/xiaomii-tseng/auto-rpg.git';
const BRANCH = 'gh-pages';

// Find git.exe path (avoids ENAMETOOLONG from long PATH in spawn)
const gitExe = execSync('where git', { encoding: 'utf8' }).trim().split(/\r?\n/)[0].trim();
const gitBin = gitExe.replace(/[/\\]git\.exe$/i, '');

// Minimal env — only what git needs
const env = {
  PATH: `${gitBin};${process.env.SystemRoot}\\System32`,
  HOME: process.env.USERPROFILE,
  USERPROFILE: process.env.USERPROFILE,
  APPDATA: process.env.APPDATA,
  SystemRoot: process.env.SystemRoot,
  GIT_TERMINAL_PROMPT: '0',
};

const run = (cmd, cwd) =>
  execSync(cmd, { stdio: 'inherit', env, cwd: cwd ?? process.cwd() });

console.log('→ Preparing temp dir...');
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

console.log('→ Cloning gh-pages branch...');
try {
  run(`"${gitExe}" clone --depth 1 --branch ${BRANCH} ${REPO} "${TMP}"`);
} catch {
  // Branch doesn't exist yet — init fresh
  run(`"${gitExe}" init`, TMP);
  run(`"${gitExe}" checkout -b ${BRANCH}`, TMP);
  run(`"${gitExe}" remote add origin ${REPO}`, TMP);
}

console.log('→ Copying dist files...');
// Clear old files (keep .git)
for (const f of (await import('fs')).readdirSync(TMP)) {
  if (f !== '.git') rmSync(`${TMP}\\${f}`, { recursive: true, force: true });
}
cpSync(resolve(DIST), TMP, { recursive: true });

// Write .nojekyll so GitHub Pages serves all files
writeFileSync(`${TMP}\\.nojekyll`, '');

console.log('→ Committing...');
run(`"${gitExe}" add -A`, TMP);
run(`"${gitExe}" commit -m "Deploy to GitHub Pages" --allow-empty`, TMP);

console.log('→ Pushing...');
run(`"${gitExe}" push origin ${BRANCH} --force`, TMP);

console.log('✓ Deployed successfully!');
