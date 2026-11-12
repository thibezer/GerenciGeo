import { API_BASE } from '../config';

interface StatusAtualizacao {
  habilitado?: boolean;
  disponivel?: boolean;
  commits_atras?: number;
  novidades?: string[];
  erro?: string;
}

interface Progresso {
  etapa: 'ocioso' | 'baixando' | 'compilando' | 'pronto' | 'erro';
  mensagem: string;
}

const INTERVALO_VERIFICACAO_MS = 30 * 60 * 1000;
const ID_AVISO = 'aviso-atualizacao';

const esc = (t: string): string =>
  t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const pedir = async <T>(caminho: string, metodo = 'GET'): Promise<T> => {
  const resp = await fetch(`${API_BASE}${caminho}`, { method: metodo });
  if (!resp.ok) {
    const corpo = await resp.json().catch(() => ({}));
    throw new Error(corpo.detail || `HTTP ${resp.status}`);
  }
  return resp.json() as Promise<T>;
};

const obterCaixa = (): HTMLElement => {
  let caixa = document.getElementById(ID_AVISO);
  if (!caixa) {
    caixa = document.createElement('div');
    caixa.id = ID_AVISO;
    caixa.className =
      'fixed bottom-4 right-4 z-[10000] w-80 bg-[#0c1510] border border-mint-vibrant/30 rounded-xl shadow-2xl p-4 text-white text-xs space-y-3';
    document.body.appendChild(caixa);
  }
  return caixa;
};

const fecharAviso = (): void => document.getElementById(ID_AVISO)?.remove();

const botao = (id: string, rotulo: string, primario = true): string =>
  `<button id="${id}" class="px-3 py-1.5 rounded-lg font-bold cursor-pointer ${
    primario ? 'bg-mint-vibrant text-forest-deep hover:opacity-90' : 'bg-white/5 text-white/70 hover:bg-white/10'
  }">${rotulo}</button>`;

const mostrarDisponivel = (s: StatusAtualizacao): void => {
  const caixa = obterCaixa();
  const lista = (s.novidades ?? []).map((n) => `<li class="truncate" title="${esc(n)}">• ${esc(n)}</li>`).join('');
  caixa.innerHTML = `
    <div class="font-bold text-mint-vibrant text-sm">Atualização disponível</div>
    <p class="text-white/70">${s.commits_atras === 1 ? 'Há 1 melhoria nova' : `Há ${s.commits_atras} melhorias novas`} para o GerenciGeo.</p>
    ${lista ? `<ul class="text-white/50 space-y-0.5">${lista}</ul>` : ''}
    <div class="flex gap-2 justify-end">${botao('btn-atualizar-depois', 'Depois', false)}${botao('btn-atualizar-agora', 'Atualizar agora')}</div>`;
  caixa.querySelector('#btn-atualizar-depois')?.addEventListener('click', fecharAviso);
  caixa.querySelector('#btn-atualizar-agora')?.addEventListener('click', () => void instalar());
};

const mostrarProgresso = (texto: string): void => {
  obterCaixa().innerHTML = `
    <div class="font-bold text-mint-vibrant text-sm">Atualizando...</div>
    <p class="text-white/70">${esc(texto)}</p>
    <div class="h-1 bg-white/10 rounded overflow-hidden"><div class="h-full w-1/3 bg-mint-vibrant animate-pulse"></div></div>`;
};

const mostrarPronto = (): void => {
  const caixa = obterCaixa();
  caixa.innerHTML = `
    <div class="font-bold text-mint-vibrant text-sm">Atualização instalada</div>
    <p class="text-white/70">Reinicie o GerenciGeo para usar a nova versão.</p>
    <div class="flex gap-2 justify-end">${botao('btn-reiniciar-depois', 'Depois', false)}${botao('btn-reiniciar-agora', 'Reiniciar agora')}</div>`;
  caixa.querySelector('#btn-reiniciar-depois')?.addEventListener('click', fecharAviso);
  caixa.querySelector('#btn-reiniciar-agora')?.addEventListener('click', async () => {
    mostrarProgresso('Reiniciando...');
    try {
      await pedir('/atualizacao/reiniciar', 'POST');
    } catch (e) {
      mostrarErro((e as Error).message);
    }
  });
};

const mostrarErro = (mensagem: string): void => {
  const caixa = obterCaixa();
  caixa.innerHTML = `
    <div class="font-bold text-red-400 text-sm">Falha ao atualizar</div>
    <p class="text-white/60 break-words max-h-24 overflow-y-auto">${esc(mensagem)}</p>
    <div class="flex gap-2 justify-end">${botao('btn-atualizar-fechar', 'Fechar', false)}${botao('btn-atualizar-tentar', 'Tentar de novo')}</div>`;
  caixa.querySelector('#btn-atualizar-fechar')?.addEventListener('click', fecharAviso);
  caixa.querySelector('#btn-atualizar-tentar')?.addEventListener('click', () => void instalar());
};

const instalar = async (): Promise<void> => {
  mostrarProgresso('Iniciando...');
  try {
    await pedir('/atualizacao/aplicar', 'POST');
    for (;;) {
      await new Promise((r) => setTimeout(r, 1500));
      const p = await pedir<Progresso>('/atualizacao/progresso');
      if (p.etapa === 'pronto') return mostrarPronto();
      if (p.etapa === 'erro') return mostrarErro(p.mensagem);
      mostrarProgresso(p.mensagem);
    }
  } catch (e) {
    mostrarErro((e as Error).message);
  }
};

const verificar = async (): Promise<boolean> => {
  try {
    const s = await pedir<StatusAtualizacao>('/atualizacao/status');
    if (!s.habilitado) return false;
    if (s.disponivel && !document.getElementById(ID_AVISO)) mostrarDisponivel(s);
  } catch {
    // sem rede/git: o aviso simplesmente não aparece
  }
  return true;
};

/** Verifica logo após abrir e depois periodicamente; só age no app desktop local. */
export const iniciarAvisoAtualizacao = (): void => {
  if (typeof window === 'undefined') return;
  setTimeout(async () => {
    if (!(await verificar())) return;
    setInterval(() => void verificar(), INTERVALO_VERIFICACAO_MS);
  }, 4000);
};
