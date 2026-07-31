import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        principal: resolve(__dirname, 'principal.html'),
        config: resolve(__dirname, 'config_mapa.html'),
        testes: resolve(__dirname, 'src/testes_componentes/index.html')
      }
    }
  }
});
