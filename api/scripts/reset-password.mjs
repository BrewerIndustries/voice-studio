#!/usr/bin/env node
// Reset a user's password directly in D1 (the recovery path when an admin is
// locked out — there is no email reset flow). Prompts for the new password with
// hidden input so it never lands in shell history, hashes it locally in the SAME
// format the Worker verifies (pbkdf2$iter$saltB64$hashB64), and signs the user
// out of every session.
//
//   npm run reset-password -- --env prod --email you@example.com
//
// Flags: --env prod|dev (default prod) · --email · --local (target local D1)

import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';

function parse(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      out[key] = val;
    }
  }
  return out;
}

function askHidden(prompt) {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) return reject(new Error('run this in an interactive terminal'));
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let buf = '';
    const onData = (ch) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          stdout.write('\n');
          return resolve(buf);
        }
        if (c === '\u0003') { stdout.write('\n'); process.exit(130); } // Ctrl-C
        if (c === '\u007f' || c === '\b') buf = buf.slice(0, -1);
        else buf += c;
      }
    };
    stdin.on('data', onData);
  });
}

const args = parse(process.argv.slice(2));
const env = args.env === 'dev' ? 'dev' : 'prod';
const email = String(args.email || '').trim().toLowerCase();
const dbName = env === 'dev' ? 'voice-studio-dev' : 'voice-studio-prod';
const target = args.local ? '--local' : '--remote';

if (!email) {
  console.error('Usage: --email <email> [--env prod|dev] [--local]');
  process.exit(1);
}

const password = await askHidden(`New password for ${email}: `);
if (password.length < 10) {
  console.error('Password must be at least 10 characters (same rule as the app).');
  process.exit(1);
}
if ((await askHidden('Again: ')) !== password) {
  console.error('Passwords did not match.');
  process.exit(1);
}

const ITER = 100_000;
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, ITER, 32, 'sha256');
const stored = `pbkdf2$${ITER}$${salt.toString('base64')}$${hash.toString('base64')}`;
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

const sql =
  `UPDATE users SET password_hash = ${q(stored)} WHERE email = ${q(email)}; ` +
  `DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = ${q(email)}); ` +
  `SELECT COUNT(*) AS matched FROM users WHERE email = ${q(email)};`;

const wranglerArgs = ['wrangler', 'd1', 'execute', dbName];
if (env === 'dev' && !args.local) wranglerArgs.push('--env', 'dev');
wranglerArgs.push(target, '--json', '--command', sql);

console.log(`Resetting password for "${email}" in ${dbName} (${target})...`);
const out = JSON.parse(execFileSync('npx', wranglerArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }));
const matched = out.at(-1)?.results?.[0]?.matched ?? 0;
if (!matched) {
  console.error(`No user with email "${email}" in ${dbName}. Nothing changed.`);
  process.exit(1);
}
console.log('Done. All existing sessions for that user were signed out.');
