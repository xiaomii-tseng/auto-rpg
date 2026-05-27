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

// ── Push notification ─────────────────────────────────────────────────────────
await (async () => {
  let secret, apiUrl;
  try {
    const cfg = JSON.parse((await import('fs')).readFileSync('push.local.json', 'utf8'));
    secret  = cfg.adminSecret;
    apiUrl  = cfg.apiUrl ?? 'https://minirpg-q1zq.onrender.com/push/notify-version';
  } catch {
    return; // push.local.json 不存在 → 跳過推撥
  }

  // 讀版本號
  const verLine = (await import('fs')).readFileSync('src/app/game/version.ts', 'utf8');
  const verMatch = verLine.match(/'(v[^']+)'/);
  if (!verMatch) return;
  const version = verMatch[1];

  // 讀 CHANGELOG 最新區塊，整理成一行說明
  const changelog = (await import('fs')).readFileSync('CHANGELOG.md', 'utf8').split('\n');
  let collecting = false, noteLines = [];
  for (const line of changelog) {
    if (line.startsWith(`## ${version}`)) { collecting = true; continue; }
    if (collecting) {
      if (line.startsWith('## ') || line.startsWith('---')) break;
      noteLines.push(line);
    }
  }
  const notes = noteLines
    .map(l => l.trim())
    .filter(l => l && l !== '---')
    .map(l => l.replace(/^#+\s*/, '').replace(/^\*\*(.+?)\*\*：/, '【$1】').replace(/^- /, ''))
    .slice(0, 5)
    .join(' / ') || '新版本已上線，請重新整理遊戲';

  console.log(`→ Sending push: ${version} — ${notes}`);
  try {
    const r = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
      body: JSON.stringify({ version, notes }),
    });
    const data = await r.json();
    if (data.ok) console.log(`✓ Push sent: ${data.sent} / ${data.total} devices`);
    else         console.warn('⚠ Push skipped:', data.error ?? data);
  } catch (e) {
    console.warn('⚠ Push failed:', e.message);
  }
})();
