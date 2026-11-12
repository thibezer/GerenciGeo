import { API_BASE, PUBLIC_HOST_URL } from '../../config';
import { initIcons, showToast, escapeHtml, customConfirm } from '../../utils';

interface StatusCompartilhamento {
  ativo: boolean;
  codigo: string | null;
  expira_em: string | null;
  expirado: boolean;
  protegido_por_pin: boolean;
}

const ID_MODAL = 'modal-compartilhar-lev';

const montarLink = (codigo: string): string => `${PUBLIC_HOST_URL}#compartilhado/${codigo}`;

const formatarExpiracao = (iso: string | null): string => {
  if (!iso) return 'Sem validade';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'Sem validade' : d.toLocaleDateString('pt-BR');
};

const fechar = () => document.getElementById(ID_MODAL)?.remove();

const copiar = async (texto: string) => {
  try {
    await navigator.clipboard.writeText(texto);
    showToast('Copiado para a área de transferência!', 'success');
  } catch {
    prompt('Copie abaixo:', texto);
  }
};

/**
 * Modal "Link do cliente": gera/atualiza o link público do levantamento com validade e PIN opcionais,
 * copia, abre, envia por WhatsApp e revoga.
 */
export const abrirModalCompartilhar = async (levId: number, nomeLevantamento: string): Promise<void> => {
  fechar();

  let status: StatusCompartilhamento;
  try {
    const res = await fetch(`${API_BASE}/levantamentos/${levId}/compartilhar`);
    if (!res.ok) throw new Error();
    status = await res.json();
  } catch {
    showToast('Não foi possível consultar o link deste levantamento.', 'error');
    return;
  }

  const modal = document.createElement('div');
  modal.id = ID_MODAL;
  modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4';
  document.body.appendChild(modal);

  const desenhar = (s: StatusCompartilhamento) => {
    const link = s.codigo ? montarLink(s.codigo) : '';
    const campo = 'w-full bg-black/40 border border-white/15 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-mint-vibrant';
    modal.innerHTML = `
      <div class="w-full max-w-md bg-[#101713] border border-white/10 rounded-2xl shadow-2xl p-5 space-y-4 text-white">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h3 class="font-bold flex items-center gap-2"><i data-lucide="share-2" class="w-4 h-4 text-mint-vibrant"></i>Link do cliente</h3>
            <p class="text-xs text-white/50 truncate">${escapeHtml(nomeLevantamento)}</p>
          </div>
          <button id="cmp-fechar" class="text-white/40 hover:text-white cursor-pointer" aria-label="Fechar"><i data-lucide="x" class="w-5 h-5"></i></button>
        </div>

        ${s.ativo ? `
        <div class="space-y-2">
          <label class="text-[11px] uppercase tracking-wider text-white/40 font-bold">Link público</label>
          <input id="cmp-link" readonly value="${escapeHtml(link)}" class="${campo} font-mono text-xs" />
          <div class="flex flex-wrap gap-2">
            <button id="cmp-copiar" class="flex-1 min-w-[110px] py-2 bg-mint-vibrant text-black font-bold rounded-lg text-xs cursor-pointer">Copiar link</button>
            <a id="cmp-abrir" href="${escapeHtml(link)}" target="_blank" rel="noopener" class="flex-1 min-w-[110px] py-2 text-center bg-white/10 hover:bg-white/15 rounded-lg text-xs font-semibold">Abrir</a>
            <button id="cmp-whats" class="flex-1 min-w-[110px] py-2 bg-white/10 hover:bg-white/15 rounded-lg text-xs font-semibold cursor-pointer">WhatsApp</button>
          </div>
          <p class="text-[11px] ${s.expirado ? 'text-rose-400' : 'text-white/50'}">
            ${s.expirado ? 'Expirado em' : 'Validade:'} ${escapeHtml(formatarExpiracao(s.expira_em))}
            • ${s.protegido_por_pin ? 'Protegido por PIN' : 'Sem PIN (qualquer pessoa com o link acessa)'}
          </p>
        </div>` : `
        <p class="text-sm text-white/60">Gere um link para o cliente ver a propriedade no mapa, com os vértices e os confrontantes. O cliente não vê CPF, RG nem endereço.</p>`}

        <div class="border-t border-white/10 pt-3 space-y-3">
          <p class="text-[11px] uppercase tracking-wider text-white/40 font-bold">${s.ativo ? 'Alterar acesso' : 'Configurar acesso'}</p>
          <div>
            <label class="text-xs text-white/60 block mb-1" for="cmp-validade">Validade do link</label>
            <select id="cmp-validade" class="${campo}">
              <option value="7">7 dias</option>
              <option value="30" selected>30 dias</option>
              <option value="90">90 dias</option>
              <option value="0">Sem validade</option>
            </select>
          </div>
          <div>
            <label class="text-xs text-white/60 block mb-1" for="cmp-pin">PIN de acesso (opcional, 4 a 8 números)</label>
            <input id="cmp-pin" inputmode="numeric" maxlength="8" autocomplete="off" placeholder="${s.protegido_por_pin ? 'Deixe vazio para manter o PIN atual' : 'Sem PIN'}" class="${campo}" />
            ${s.protegido_por_pin ? `<label class="text-[11px] text-white/50 flex items-center gap-1.5 mt-1.5"><input type="checkbox" id="cmp-remover-pin" /> Remover o PIN</label>` : ''}
          </div>
          <div class="flex gap-2">
            <button id="cmp-salvar" class="flex-1 py-2 bg-mint-vibrant/15 hover:bg-mint-vibrant/25 text-mint-vibrant border border-mint-vibrant/30 font-bold rounded-lg text-xs cursor-pointer">${s.ativo ? 'Salvar alterações' : 'Gerar link'}</button>
            ${s.ativo ? `<button id="cmp-revogar" class="py-2 px-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-xs font-bold cursor-pointer">Revogar link</button>` : ''}
          </div>
        </div>
      </div>`;
    initIcons();

    modal.querySelector('#cmp-fechar')?.addEventListener('click', fechar);
    modal.addEventListener('click', (e) => { if (e.target === modal) fechar(); });
    modal.querySelector('#cmp-copiar')?.addEventListener('click', () => copiar(link));
    modal.querySelector('#cmp-whats')?.addEventListener('click', () => {
      const texto = `Olá! Segue o link para você ver a sua propriedade no mapa:\n${link}${s.protegido_por_pin ? '\n(Vou te passar o PIN de acesso separadamente.)' : ''}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
    });

    modal.querySelector('#cmp-salvar')?.addEventListener('click', async () => {
      const validade = parseInt((modal.querySelector('#cmp-validade') as HTMLSelectElement).value, 10);
      const pinTxt = (modal.querySelector('#cmp-pin') as HTMLInputElement).value.trim();
      const remover = (modal.querySelector('#cmp-remover-pin') as HTMLInputElement | null)?.checked;
      const corpo: { validade_dias: number; pin?: string } = { validade_dias: validade };
      if (remover) corpo.pin = '';
      else if (pinTxt) corpo.pin = pinTxt;

      if (pinTxt && !/^\d{4,8}$/.test(pinTxt)) {
        showToast('O PIN deve ter de 4 a 8 números.', 'error');
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/levantamentos/${levId}/compartilhar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corpo),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast(data.detail || 'Erro ao gerar o link de compartilhamento.', 'error');
          return;
        }
        const novo: StatusCompartilhamento = await (await fetch(`${API_BASE}/levantamentos/${levId}/compartilhar`)).json();
        desenhar(novo);
        showToast('Link atualizado.', 'success');
      } catch {
        showToast('Erro na comunicação com o servidor.', 'error');
      }
    });

    modal.querySelector('#cmp-revogar')?.addEventListener('click', async () => {
      const ok = await customConfirm('Revogar o link? Quem já recebeu deixará de conseguir abrir o mapa.');
      if (!ok) return;
      try {
        const res = await fetch(`${API_BASE}/levantamentos/${levId}/compartilhar`, { method: 'DELETE' });
        if (!res.ok) throw new Error();
        desenhar({ ativo: false, codigo: null, expira_em: null, expirado: false, protegido_por_pin: false });
        showToast('Link revogado.', 'success');
      } catch {
        showToast('Não foi possível revogar o link.', 'error');
      }
    });
  };

  desenhar(status);
};
