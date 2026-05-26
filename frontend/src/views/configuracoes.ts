import type { RouteDef } from '../types';

export const configuracoesRoute: RouteDef = {
  render: () => `
    <div class="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h2 class="text-3xl font-bold">Configurações</h2>
      <div class="glass-card p-6 max-w-2xl">
         <p class="text-white/40 italic">Módulo de configurações do sistema GerenciGeo em desenvolvimento...</p>
      </div>
    </div>
  `
};
