#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOME = process.env.CHENGFENG_VIDEOCUT_HUAMIAN_HOME || os.homedir();
const PKG_ROOT = path.resolve(__dirname, '..');
const SKILL_NAME = 'chengfeng-videocut-huamian';
const SOURCE = path.join(PKG_ROOT, 'skills', SKILL_NAME);
const PRIMARY_SKILLS = path.join(HOME, '.claude', 'skills');
const COMPAT_SKILLS = path.join(HOME, '.codex', 'skills');
const DESTINATION = path.join(PRIMARY_SKILLS, SKILL_NAME);
const LINK = path.join(COMPAT_SKILLS, SKILL_NAME);
const TOOL_HOME = path.join(HOME, '.chengfeng-videocut-huamian');

const log = (message = '') => process.stdout.write(`${message}\n`);
const timestamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');

function copyDir(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.name === '__pycache__') continue;
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function backupAndRemove(target, label) {
  if (!fs.existsSync(target) && !fs.lstatSync(target, { throwIfNoEntry: false })) return null;
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) {
    fs.unlinkSync(target);
    return null;
  }
  const backupRoot = path.join(PRIMARY_SKILLS, '.backups');
  const backup = path.join(backupRoot, `${label}-${timestamp()}`);
  fs.mkdirSync(backupRoot, { recursive: true });
  if (stat.isDirectory()) copyDir(target, backup);
  else fs.copyFileSync(target, backup);
  fs.rmSync(target, { recursive: true, force: true });
  return backup;
}

function has(command, args) {
  const r = spawnSync(command, args, { stdio: 'ignore' });
  return !r.error && r.status === 0;
}

function playwrightPath() {
  for (const base of [TOOL_HOME, process.cwd()]) {
    try { return require.resolve('playwright-core', { paths: [base] }); } catch { }
  }
  return null;
}

function ensurePlaywright() {
  if (playwrightPath()) return true;
  log('Installing playwright-core (drives Chrome to capture frames)…');
  fs.mkdirSync(TOOL_HOME, { recursive: true });
  const r = spawnSync('npm', ['install', '--prefix', TOOL_HOME, 'playwright-core@1', '--no-audit', '--no-fund', '--loglevel=error'],
    { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) log(`  Could not install it automatically. Run: npm install --prefix ${TOOL_HOME} playwright-core`);
  return Boolean(playwrightPath());
}

function findBrowser() {
  if (process.env.CHROME_PATH) return fs.existsSync(process.env.CHROME_PATH) ? process.env.CHROME_PATH : null;
  const candidates = {
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium'],
    linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/microsoft-edge', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'],
    win32: [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean)
      .flatMap((p) => [path.join(p, 'Google/Chrome/Application/chrome.exe'), path.join(p, 'Microsoft/Edge/Application/msedge.exe')]),
  }[process.platform] || [];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function checkTools() {
  const node = Number(process.versions.node.split('.')[0]) >= 18;
  const python = has('python3', ['--version']);
  const ffmpeg = has('ffmpeg', ['-version']) && has('ffprobe', ['-version']);
  const playwright = Boolean(playwrightPath());
  const browser = findBrowser();
  log(`${node ? '✓' : '✗'} Node.js ${process.versions.node}${node ? '' : '  (need 18+)'}`);
  log(`${python ? '✓' : '✗'} python3`);
  log(`${ffmpeg ? '✓' : '✗'} ffmpeg / ffprobe${ffmpeg ? '' : '  (macOS: brew install ffmpeg)'}`);
  log(`${playwright ? '✓' : '✗'} playwright-core${playwright ? '' : `  (npm install --prefix ${TOOL_HOME} playwright-core)`}`);
  log(`${browser ? '✓' : '·'} Chrome / Edge / Chromium${browser ? ` ${browser}` : '  (install Google Chrome, or run: npx playwright install chromium; or set CHROME_PATH)'}`);
  return node && python && ffmpeg && playwright;
}

function install() {
  if (!fs.existsSync(SOURCE)) throw new Error(`Missing packaged skill: ${SOURCE}`);
  fs.mkdirSync(PRIMARY_SKILLS, { recursive: true });
  const skillBackup = backupAndRemove(DESTINATION, SKILL_NAME);
  copyDir(SOURCE, DESTINATION);
  for (const file of ['LICENSE', 'NOTICE.md', 'CITATION.cff']) {
    fs.copyFileSync(path.join(PKG_ROOT, file), path.join(DESTINATION, file));
  }
  fs.mkdirSync(COMPAT_SKILLS, { recursive: true });
  const compatBackup = backupAndRemove(LINK, `${SKILL_NAME}-compat`);
  fs.symlinkSync(DESTINATION, LINK);
  log(`✓ ${SKILL_NAME} installed`);
  log('✓ Agent Skill registered');
  if (skillBackup) log('  Existing Agent Skill backed up.');
  if (compatBackup) log('  Existing Agent registration backed up.');
  log('');
  ensurePlaywright();
  checkTools();
  log('');
  log('Restart your Agent so the Skill list reloads.');
}

function doctor() {
  const skill = path.join(DESTINATION, 'SKILL.md');
  const notice = path.join(DESTINATION, 'NOTICE.md');
  const linkOk = fs.existsSync(LINK) && fs.lstatSync(LINK).isSymbolicLink();
  log(`${fs.existsSync(skill) ? '✓' : '✗'} Agent Skill installed`);
  log(`${fs.existsSync(notice) ? '✓' : '✗'} Attribution notice present`);
  log(`${linkOk ? '✓' : '✗'} Agent Skill registration present`);
  const tools = checkTools();
  process.exitCode = fs.existsSync(skill) && fs.existsSync(notice) && linkOk && tools ? 0 : 1;
}

function uninstall() {
  const linkBackup = backupAndRemove(LINK, `${SKILL_NAME}-compat-removed`);
  const skillBackup = backupAndRemove(DESTINATION, `${SKILL_NAME}-removed`);
  log(`✓ Removed ${SKILL_NAME}; backups are preserved.`);
  if (skillBackup) log('  Removed Agent Skill backed up.');
  if (linkBackup) log('  Removed Agent registration backed up.');
  log(`  ${TOOL_HOME} (playwright-core) is kept; delete it by hand if you want.`);
}

function help() {
  log('chengfeng-videocut-huamian');
  log('');
  log('Usage:');
  log('  npx -y github:Agentchengfeng/chengfeng-videocut-huamian install');
  log('  npx -y github:Agentchengfeng/chengfeng-videocut-huamian doctor');
  log('');
  log('Commands: install, doctor, uninstall, help');
  log('For test-only installs: CHENGFENG_VIDEOCUT_HUAMIAN_HOME=/tmp/test-home');
}

function main() {
  let [command = 'install', subcommand] = process.argv.slice(2);
  if (command === 'cpm') command = subcommand || 'install';
  if (['help', '--help', '-h'].includes(command)) return help();
  if (command === 'install') return install();
  if (command === 'doctor') return doctor();
  if (command === 'uninstall') return uninstall();
  log(`Unknown command: ${command}`);
  help();
  process.exitCode = 1;
}

main();
