// Empacota cada tests/*.test.ts com o rolldown (que já vem com o Vite) e roda com o test runner nativo do Node.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(fileURLToPath(import.meta.url), '..', '..');
const pastaTestes = join(raiz, 'tests');
const saida = mkdtempSync(join(tmpdir(), 'gerencigeo-testes-'));

try {
  const arquivos = readdirSync(pastaTestes).filter(f => f.endsWith('.test.ts'));
  const gerados = arquivos.map(arq => {
    const destino = join(saida, arq.replace(/\.ts$/, '.mjs'));
    execFileSync(process.execPath, [
      join(raiz, 'node_modules', 'rolldown', 'bin', 'cli.mjs'),
      join(pastaTestes, arq), '-f', 'esm', '--platform', 'node', '-o', destino
    ], { stdio: 'inherit' });
    return destino;
  });
  execFileSync(process.execPath, ['--test', ...gerados], { stdio: 'inherit' });
} finally {
  rmSync(saida, { recursive: true, force: true });
}
