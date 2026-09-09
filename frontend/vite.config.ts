import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';

const localUiPath = resolve(__dirname, '../../UI_Componentes/src/index.ts');
const hasLocalUi = fs.existsSync(localUiPath);

export default defineConfig({
  resolve: {
    alias: hasLocalUi
      ? { 'ui-components-kit': localUiPath }
      : {}
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        principal: resolve(__dirname, 'principal.html'),
        config: resolve(__dirname, 'config_mapa.html')
      }
    }
  }
});
