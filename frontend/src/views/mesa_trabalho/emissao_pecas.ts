import { API_BASE } from '../../config';
import { escapeHtml, showToast } from '../../utils';
import type { MesaTrabalhoContext } from './mesa_trabalho_context';
import { solicitarParametrosPeca, lembrarEquipamento } from './dialogos_cartorio';
import type { ParametrosPeca } from './dialogos_cartorio';

/** Extrai a mensagem de erro de uma resposta HTTP do FastAPI (detail string, lista de erros 422 ou corpo texto). */
export async function extrairDetalhe(res: Response, padrao: string): Promise<string> {
  try {
    const texto = await res.text();
    if (!texto) return padrao;
    try {
      const dados = JSON.parse(texto);
      const detalhe = dados?.detail ?? dados?.error ?? dados?.message;
      if (typeof detalhe === 'string' && detalhe.trim()) return detalhe;
      if (Array.isArray(detalhe) && detalhe.length) {
        return detalhe.map((d: any) => d?.msg || JSON.stringify(d)).join('; ');
      }
    } catch {
      // corpo não-JSON: usa o texto bruto se for curto e sem HTML
      if (texto.length < 200 && !texto.includes('<')) return texto;
    }
  } catch { /* corpo ilegível */ }
  return padrao;
}

const emissoesEmAndamento = new Set<string>();

const marcarBotaoOcupado = (botao: HTMLElement | null | undefined, ocupado: boolean) => {
  if (!botao) return;
  if (ocupado) {
    botao.setAttribute('aria-busy', 'true');
    botao.setAttribute('disabled', '');
    botao.classList.add('opacity-60', 'cursor-wait');
    if (!botao.querySelector('[data-spinner-emissao]')) {
      const sp = document.createElement('span');
      sp.setAttribute('data-spinner-emissao', '');
      sp.setAttribute('aria-hidden', 'true');
      sp.className = 'inline-block w-3.5 h-3.5 ml-1.5 shrink-0 border-2 border-current border-t-transparent rounded-full animate-spin';
      botao.appendChild(sp);
    }
  } else {
    botao.removeAttribute('aria-busy');
    botao.removeAttribute('disabled');
    botao.classList.remove('opacity-60', 'cursor-wait');
    botao.querySelector('[data-spinner-emissao]')?.remove();
  }
};

export interface EmitirPecaOpcoes {
  url: string;
  /** Nome da peça para as mensagens ("o Laudo Técnico"). */
  rotulo: string;
  botao?: HTMLElement | null;
  /** Chave anti-duplo-clique; por padrão o id do botão ou o rótulo. */
  chave?: string;
  signal?: AbortSignal;
}

/**
 * Emite uma peça HTML do backend: abre a janela de forma síncrona (logo após o último clique do usuário, antes de
 * qualquer rede, para não cair no bloqueador de pop-ups), busca o HTML e o escreve via Blob URL. Em erro fecha a janela
 * e mostra a mensagem do servidor num toast em vez de deixar o JSON cru numa aba em branco.
 */
export async function emitirPeca(opts: EmitirPecaOpcoes): Promise<boolean> {
  const chave = opts.chave || opts.botao?.id || opts.rotulo;
  if (emissoesEmAndamento.has(chave)) return false;

  const janela = window.open('about:blank', '_blank');
  if (!janela) {
    showToast('O navegador bloqueou a janela da peça. Permita pop-ups para este site e tente novamente.', 'error', 6000);
    return false;
  }

  emissoesEmAndamento.add(chave);
  marcarBotaoOcupado(opts.botao, true);
  try {
    try {
      janela.document.title = opts.rotulo;
      janela.document.body.style.cssText = 'font-family:system-ui,sans-serif;padding:2rem;color:#334155';
      janela.document.body.textContent = `Gerando ${opts.rotulo}…`;
    } catch { /* janela já navegada */ }

    const res = await fetch(opts.url, { signal: opts.signal });
    if (!res.ok) {
      const detalhe = await extrairDetalhe(res, `erro ${res.status} no servidor.`);
      janela.close();
      showToast(`Não foi possível emitir ${escapeHtml(opts.rotulo)}: ${escapeHtml(detalhe)}`, 'error', 7000);
      return false;
    }
    const html = await res.text();
    const urlBlob = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    janela.location.replace(urlBlob);
    setTimeout(() => URL.revokeObjectURL(urlBlob), 10 * 60 * 1000);
    return true;
  } catch (err: any) {
    try { janela.close(); } catch { /* ignora */ }
    if (err?.name !== 'AbortError') {
      console.error(`Erro ao emitir ${opts.rotulo}:`, err);
      showToast(`Não foi possível emitir ${escapeHtml(opts.rotulo)}. Verifique a conexão e tente novamente.`, 'error', 6000);
    }
    return false;
  } finally {
    emissoesEmAndamento.delete(chave);
    marcarBotaoOcupado(opts.botao, false);
  }
}

export interface PedidoParametros {
  titulo: string;
  trt?: boolean;
  equipamento?: boolean;
  desmembramento?: boolean;
  signal?: AbortSignal;
}

/**
 * Reúne os parâmetros de uma peça num único modal acessível. O TRT/ART só é perguntado quando falta o número ou a data
 * no levantamento; ao informá-lo é gravado em PUT /levantamentos/{id}/trt (erros aparecem no toast). Devolve null se
 * o usuário cancelar.
 */
export async function coletarParametrosPeca(ctx: MesaTrabalhoContext, pedido: PedidoParametros): Promise<ParametrosPeca | null> {
  const lev = ctx.currentLevantamento;
  const trtAtual = String(lev?.numero_trt || '').trim();
  const dataAtual = String(lev?.data_trt || '').trim();
  const faltaTrt = !!pedido.trt && (!trtAtual || !dataAtual);

  if (!faltaTrt && !pedido.equipamento && !pedido.desmembramento) {
    return pedido.trt ? { numero_trt: trtAtual, data_trt: dataAtual } : {};
  }

  let descricao: string | undefined;
  if (pedido.trt && !faltaTrt) {
    descricao = `TRT/ART <strong>${escapeHtml(trtAtual)}</strong> já cadastrado no levantamento.`;
  } else if (faltaTrt && trtAtual && !dataAtual) {
    descricao = 'O TRT/ART está cadastrado sem a data de quitação. Informe a data para emitir a peça.';
  } else if (faltaTrt) {
    descricao = 'O levantamento ainda não tem TRT/ART cadastrado. Ele será gravado para as próximas peças.';
  }

  const resposta = await solicitarParametrosPeca({
    titulo: pedido.titulo,
    descricao,
    trt: faltaTrt ? { numero: trtAtual, data: dataAtual } : undefined,
    equipamento: pedido.equipamento,
    desmembramento: pedido.desmembramento,
  });
  if (!resposta) return null;

  if (resposta.equipamento) lembrarEquipamento(resposta.equipamento);

  if (faltaTrt && resposta.numero_trt && resposta.data_trt && ctx.currentLevId) {
    try {
      const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/trt`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero_trt: resposta.numero_trt, data_trt: resposta.data_trt }),
        signal: pedido.signal,
      });
      if (res.ok) {
        if (ctx.currentLevantamento) {
          ctx.currentLevantamento.numero_trt = resposta.numero_trt;
          ctx.currentLevantamento.data_trt = resposta.data_trt;
        }
      } else {
        const detalhe = await extrairDetalhe(res, `erro ${res.status} no servidor.`);
        showToast(`O TRT/ART não foi gravado no levantamento (${escapeHtml(detalhe)}). A peça será emitida com os valores informados.`, 'error', 7000);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return null;
      console.error('Erro ao salvar TRT no levantamento:', err);
      showToast('Não foi possível gravar o TRT/ART no levantamento. A peça será emitida com os valores informados.', 'error', 6000);
    }
  }

  return {
    ...resposta,
    numero_trt: resposta.numero_trt ?? trtAtual,
    data_trt: resposta.data_trt ?? dataAtual,
  };
}
