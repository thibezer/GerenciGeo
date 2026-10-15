// Garante o código-fonte do ui-components-kit antes do build.
// O pacote npm (github:thibezer/Componentes-UI) não traz dist/ nem src/, então o alias do vite.config.ts
// precisa encontrar o kit em disco. Local e CI já têm; o build Git da Hostinger não, e aí clonamos aqui.
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const candidatos = [
  resolve(raiz, '../../UI_Componentes/src/index.ts'),
  resolve(raiz, '../UI_Componentes/src/index.ts'),
  resolve(raiz, 'UI_Componentes/src/index.ts')
];

if (candidatos.some((p) => existsSync(p))) {
  console.log('[clonar-kit] ui-components-kit já disponível, nada a fazer.');
  process.exit(0);
}

console.log('[clonar-kit] clonando thibezer/Componentes-UI em frontend/UI_Componentes...');
execFileSync(
  'git',
  ['clone', '--depth', '1', 'https://github.com/thibezer/Componentes-UI', 'UI_Componentes'],
  { cwd: raiz, stdio: 'inherit' }
);
