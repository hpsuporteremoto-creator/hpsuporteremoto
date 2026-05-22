// Gera src/version.ts a partir do estado do Git.
// Roda nos hooks npm `postinstall` e `prebuild`.
// No GitHub Actions usa as env vars GITHUB_SHA / GITHUB_REF_NAME;
// localmente cai pro `git` da máquina.
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function git(args, fallback) {
  try {
    return execSync(`git ${args}`, {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return fallback;
  }
}

const shaFull = process.env.GITHUB_SHA || git('rev-parse HEAD', 'dev');
const sha = shaFull === 'dev' ? 'dev' : shaFull.slice(0, 7);
const ref =
  process.env.GITHUB_REF_NAME || git('rev-parse --abbrev-ref HEAD', 'local');
const builtAt = new Date().toISOString();

const content = `// AUTO-GERADO por scripts/gen-version.mjs — não editar nem versionar.
export interface AppVersion {
  sha: string;
  shaFull: string;
  ref: string;
  builtAt: string;
}

export const APP_VERSION: AppVersion = {
  sha: '${sha}',
  shaFull: '${shaFull}',
  ref: '${ref}',
  builtAt: '${builtAt}',
};
`;

const target = fileURLToPath(new URL('../src/version.ts', import.meta.url));
writeFileSync(target, content);
console.log(`[gen-version] src/version.ts → ${sha} (${ref})`);
