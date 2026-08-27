import { escapeHtml } from '../../utils';
import type {
  Cliente,
  ClienteEstatisticas,
  ClienteHistoricoLog,
  ClienteAcessoLog,
  ClienteDocumento,
  PropriedadeVinculadaCliente
} from '../../types';

export const aplicarMascaraCpfCnpj = (value: string): string => {
  const apenasNumeros = value.replace(/\D/g, '');
  if (apenasNumeros.length <= 11) {
    return apenasNumeros
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  } else {
    return apenasNumeros
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
  }
};

export const aplicarMascaraTelefone = (value: string): string => {
  const apenasNumeros = value.replace(/\D/g, '');
  if (apenasNumeros.length <= 10) {
    return apenasNumeros
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  } else {
    return apenasNumeros
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d{1,4})$/, '$1-$2');
  }
};

export const aplicarMascaraCep = (value: string): string => {
  return value.replace(/\D/g, '').replace(/(\d{5})(\d{1,3})$/, '$1-$2');
};

export const gerarLinkWhatsApp = (telefone?: string | null): string | null => {
  if (!telefone) return null;
  const nums = telefone.replace(/\D/g, '');
  if (nums.length < 10) return null;
  const foneCompleto = nums.startsWith('55') ? nums : `55${nums}`;
  return `https://wa.me/${foneCompleto}`;
};

export const copiarParaClipboard = async (texto: string, btnElement?: HTMLElement | null): Promise<boolean> => {
  if (!texto) return false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto);
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = texto;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      textArea.remove();
    }

    if (btnElement) {
      const originalHtml = btnElement.innerHTML;
      btnElement.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5 text-mint-vibrant animate-in fade-in"></i>`;
      btnElement.classList.add('text-mint-vibrant');
      setTimeout(() => {
        btnElement.innerHTML = originalHtml;
        btnElement.classList.remove('text-mint-vibrant');
      }, 2000);
    }
    return true;
  } catch (err) {
    console.warn("Falha ao copiar texto para o clipboard:", err);
    return false;
  }
};

export const isCnhVencida = (dataValidade?: string | null): boolean => {
  if (!dataValidade || !dataValidade.trim()) return false;
  try {
    const valDate = new Date(dataValidade);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return valDate < today;
  } catch {
    return false;
  }
};

export const calcularEstatisticasClientes = (clientes: Cliente[]): ClienteEstatisticas => {
  let pf = 0;
  let pj = 0;
  let incompletos = 0;

  clientes.forEach(cli => {
    const isPj = cli.tipo_pessoa === 'PJ' || (cli.cpf_cnpj || '').replace(/\D/g, '').length > 11;
    if (isPj) {
      pj++;
    } else {
      pf++;
    }

    const estCivil = cli.estado_civil || '';
    const casadoOuUniao = estCivil.includes("Casado") || estCivil.includes("União Estável");
    const conjugeEmBranco = !cli.nome_conjuge || cli.nome_conjuge.trim() === '';
    if (casadoOuUniao && conjugeEmBranco) {
      incompletos++;
    }
  });

  return { total: clientes.length, pf, pj, incompletos };
};

export const renderLinhasTabelaHtml = (visiveis: Cliente[], clientesSelecionados: Set<number>): string => {
  return visiveis.map(cli => {
    const isSel = clientesSelecionados.has(cli.id);
    const rowClass = isSel ? 'bg-mint-vibrant/5 border-l-2 border-l-mint-vibrant' : 'hover:bg-white/[0.01]';
    const isPj = cli.tipo_pessoa === 'PJ' || (cli.cpf_cnpj || '').replace(/\D/g, '').length > 11;
    const badgeTipo = isPj 
      ? '<span class="text-[8.5px] px-1.5 py-0.5 rounded font-mono font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">PJ</span>'
      : '<span class="text-[8.5px] px-1.5 py-0.5 rounded font-mono font-bold bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/20">PF</span>';

    return `
      <tr class="border-b border-white/5 transition-all text-xs ${rowClass}" data-id="${cli.id}">
        <td class="py-2.5 px-4">
          <ui-checkbox class="check-cliente" data-id="${cli.id}" ${isSel ? 'marcado' : ''}></ui-checkbox>
        </td>
        <td class="py-2.5 px-4 font-medium text-white flex items-center gap-2.5 cursor-pointer hover:text-mint-vibrant truncate w-72 btn-action" data-action="detalhes" data-id="${cli.id}">
          <ui-avatar nome="${escapeHtml(cli.nome_completo || '')}" tamanho="sm"></ui-avatar>
          <div class="min-w-0 flex-1 flex items-center gap-1.5">
            <span class="truncate font-semibold">${escapeHtml(cli.nome_completo)}</span>
            ${badgeTipo}
          </div>
        </td>
        <td class="py-2.5 px-4 font-mono text-white/75">${aplicarMascaraCpfCnpj(cli.cpf_cnpj || '')}</td>
        <td class="py-2.5 px-4 font-mono text-white/75 font-medium">
          ${(cli.tem_senha_gov || cli.senha_gov) ? `
            <div class="flex items-center gap-1.5 font-mono">
              <span id="senha-gov-val-${cli.id}">••••••••</span>
              <button type="button" class="text-white/40 hover:text-mint-vibrant transition-colors p-1 cursor-pointer btn-action" data-action="revelar-senha" data-id="${cli.id}" title="Mostrar/Ocultar Senha GOV">
                <i data-lucide="eye" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          ` : '-'}
        </td>
        <td class="py-2.5 px-4 text-center font-mono font-medium">${cli.total_propriedades || 0}</td>
        <td class="py-2.5 px-4 text-center font-mono font-medium">${cli.total_levantamentos || 0}</td>
        <td class="py-2.5 px-4 text-right">
          <div class="flex items-center justify-end gap-1">
            <button class="p-1.5 text-white/40 hover:text-mint-vibrant rounded hover:bg-white/5 transition-colors cursor-pointer btn-action" data-action="detalhes" data-id="${cli.id}" title="Ver Detalhes">
              <i data-lucide="eye" class="w-3.5 h-3.5"></i>
            </button>
            <button class="p-1.5 text-white/40 hover:text-mint-vibrant rounded hover:bg-white/5 transition-colors cursor-pointer btn-action" data-action="editar" data-id="${cli.id}" title="Editar">
              <i data-lucide="edit" class="w-3.5 h-3.5"></i>
            </button>
            <button class="p-1.5 text-white/40 hover:text-red-400 rounded hover:bg-white/5 transition-colors cursor-pointer btn-action" data-action="excluir" data-id="${cli.id}" title="Excluir">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
};

export const renderBotoesPaginacaoHtml = (paginaAtual: number, totalPaginas: number): string => {
  let pagButtonsHtml = '';
  if (totalPaginas > 1) {
    pagButtonsHtml += `
      <button class="h-7 px-2.5 rounded border border-white/10 hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition-all font-bold flex items-center justify-center cursor-pointer btn-page" ${paginaAtual === 1 ? 'disabled' : ''} data-page="${paginaAtual - 1}">
        Anterior
      </button>
    `;
    
    for (let p = 1; p <= totalPaginas; p++) {
      if (p === 1 || p === totalPaginas || (p >= paginaAtual - 1 && p <= paginaAtual + 1)) {
        const activeClass = p === paginaAtual ? 'bg-mint-vibrant text-forest-deep border-transparent font-bold' : 'border-white/10 hover:bg-white/5 text-white/70';
        pagButtonsHtml += `
          <button class="w-7 h-7 rounded border text-xs font-mono transition-all flex items-center justify-center cursor-pointer btn-page ${activeClass}" data-page="${p}">
            ${p}
          </button>
        `;
      } else if (p === paginaAtual - 2 || p === paginaAtual + 2) {
        pagButtonsHtml += `<span class="px-1 text-white/20 select-none">...</span>`;
      }
    }

    pagButtonsHtml += `
      <button class="h-7 px-2.5 rounded border border-white/10 hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition-all font-bold flex items-center justify-center cursor-pointer btn-page" ${paginaAtual === totalPaginas ? 'disabled' : ''} data-page="${paginaAtual + 1}">
        Próxima
      </button>
    `;
  }
  return pagButtonsHtml;
};

export const renderMetadadosTabelaHtml = (metadadosObj: Record<string, string>): string => {
  const entries = Object.entries(metadadosObj);
  if (!entries.length) {
    return '<tr><td colspan="3" class="text-white/30 text-center py-4">Nenhum metadado customizado cadastrado.</td></tr>';
  }
  return entries.map(([k, v]) => `
    <tr class="hover:bg-white/[0.01]">
      <td class="py-2 px-3 font-semibold text-white/90 font-mono">${escapeHtml(k)}</td>
      <td class="py-2 px-3 text-white/60 font-mono">${escapeHtml(v)}</td>
      <td class="py-2 px-3 text-right">
        <button data-action="excluir-meta" data-meta-key="${escapeHtml(k)}" class="text-white/45 hover:text-red-400 p-1 rounded hover:bg-white/5 transition-colors cursor-pointer btn-action-meta" title="Remover Campo">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </td>
    </tr>
  `).join('');
};

export const renderLogsHistoricoTabelaHtml = (logs: ClienteHistoricoLog[]): string => {
  if (!Array.isArray(logs) || logs.length === 0) {
    return '<tr><td colspan="4" class="text-center py-4 text-white/20">Nenhum log de alteração gravado.</td></tr>';
  }
  return logs.map(log => {
    const dataFormatada = new Date(log.data_alteracao).toLocaleString('pt-BR');
    return `
      <tr class="hover:bg-white/[0.01]">
        <td class="py-2 px-3 font-medium text-white/80">${escapeHtml(log.campo_alterado)}</td>
        <td class="py-2 px-3 text-red-400 font-mono truncate max-w-[120px]" title="${escapeHtml(log.valor_antigo || '')}">${escapeHtml(log.valor_antigo || '-')}</td>
        <td class="py-2 px-3 text-mint-vibrant font-mono truncate max-w-[120px]" title="${escapeHtml(log.valor_novo || '')}">${escapeHtml(log.valor_novo || '-')}</td>
        <td class="py-2 px-3 text-right text-white/40 font-mono">${dataFormatada}</td>
      </tr>
    `;
  }).join('');
};

export const renderLogsAcessoTabelaHtml = (acessos: ClienteAcessoLog[]): string => {
  if (!Array.isArray(acessos) || acessos.length === 0) {
    return '<tr><td colspan="5" class="text-center py-4 text-white/20">Nenhum registro de acesso a dados sensíveis gravado.</td></tr>';
  }
  return acessos.map(ac => {
    const dataFormatada = new Date(ac.data_acesso).toLocaleString('pt-BR');
    return `
      <tr class="hover:bg-white/[0.01]">
        <td class="py-2 px-3 font-mono text-mint-vibrant">${escapeHtml(ac.tipo_dado)}</td>
        <td class="py-2 px-3 text-white/80 font-medium">${escapeHtml(ac.acao)}</td>
        <td class="py-2 px-3 text-white/60">${escapeHtml(ac.usuario || 'Operador')}</td>
        <td class="py-2 px-3 font-mono text-white/40 text-[10px]">${escapeHtml(ac.ip_origem || 'Local')}</td>
        <td class="py-2 px-3 text-right text-white/40 font-mono">${dataFormatada}</td>
      </tr>
    `;
  }).join('');
};

export const renderDocumentosTabelaHtml = (docs: ClienteDocumento[], clienteId?: number): string => {
  if (!Array.isArray(docs) || docs.length === 0) {
    return '<tr><td colspan="7" class="text-center py-4 text-white/30">Nenhum documento cadastrado.</td></tr>';
  }
  return docs.map(doc => {
    const isVencida = doc.tipo_documento === 'CNH' && isCnhVencida(doc.data_validade);
    const validadeFormatada = doc.data_validade ? doc.data_validade.split('-').reverse().join('/') : '-';
    const badgeVencida = isVencida 
      ? `<span class="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse"><i data-lucide="alert-triangle" class="w-3 h-3"></i> CNH Vencida</span>`
      : '';

    const temArquivo = Boolean(doc.arquivo_path || doc.arquivo_nome);
    const btnArquivo = temArquivo && clienteId
      ? `<a href="/clientes/${clienteId}/documentos/${doc.id}/arquivo" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-[10px] bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/20 hover:bg-mint-vibrant/20 transition-colors" title="Visualizar / Baixar PDF original">
          <i data-lucide="file-text" class="w-3 h-3"></i>
          Ver PDF
         </a>`
      : `<span class="text-white/20 text-[10px]">-</span>`;

    return `
      <tr class="hover:bg-white/[0.01] text-xs">
        <td class="py-2 px-3 font-bold font-mono text-mint-vibrant">${escapeHtml(doc.tipo_documento)}</td>
        <td class="py-2 px-3 font-mono text-white/90 font-medium">${escapeHtml(doc.numero)}</td>
        <td class="py-2 px-3 text-white/60">${escapeHtml(doc.orgao_emissor || '-')}${doc.uf_emissor ? `/${escapeHtml(doc.uf_emissor)}` : ''}</td>
        <td class="py-2 px-3 font-mono text-white/60">${escapeHtml(doc.categoria_cnh || '-')}</td>
        <td class="py-2 px-3 font-mono text-white/80">
          <div class="flex items-center gap-2">
            <span>${validadeFormatada}</span>
            ${badgeVencida}
          </div>
        </td>
        <td class="py-2 px-3 text-center">${btnArquivo}</td>
        <td class="py-2 px-3 text-right">
          <button data-action="excluir-doc" data-doc-id="${doc.id}" class="text-white/40 hover:text-red-400 p-1 rounded hover:bg-white/5 transition-colors cursor-pointer btn-action-doc" title="Excluir Documento">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
};

export const renderPropriedadesVinculadasHtml = (props: PropriedadeVinculadaCliente[]): string => {
  if (!Array.isArray(props) || props.length === 0) {
    return `<p class="text-[11px] text-white/30 italic py-1">Nenhuma propriedade vinculada a este cliente.</p>`;
  }
  return props.map((p: PropriedadeVinculadaCliente) => `
    <div class="flex items-center justify-between py-1.5 text-xs">
      <div class="min-w-0 flex-1 pr-2">
        <span class="font-bold text-white truncate block text-[11px]" title="${escapeHtml(p.nome_propriedade)}">${escapeHtml(p.nome_propriedade)}</span>
        <span class="text-[9px] text-white/40 block mt-0.5">Participação: <strong class="text-mint-vibrant font-mono">${(p.percentual_participacao || 0).toFixed(2)}%</strong></span>
      </div>
      <button data-action="ir-propriedade" data-prop-id="${p.id}" class="text-mint-vibrant hover:text-white transition-colors flex items-center gap-1 hover:underline text-[10px] font-bold shrink-0 cursor-pointer btn-action-prop">
        Ver Propriedade
        <i data-lucide="external-link" class="w-3 h-3"></i>
      </button>
    </div>
  `).join('');
};

