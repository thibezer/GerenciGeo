import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      'ui-components-kit': resolve(__dirname, '../../UI_Componentes/src/index.ts')
    }
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
