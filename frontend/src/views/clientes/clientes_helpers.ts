import { escapeHtml, formatarDataHoraUtc } from '../../utils';
import { API_BASE } from '../../config';
import type {
  Cliente,
  ClienteEstatisticas,
  ClienteHistoricoLog,
  ClienteAcessoLog,
  ClienteDocumento,
  PropriedadeVinculadaCliente
} from '../../types';

/** Só caracteres válidos de CPF/CNPJ (o CNPJ alfanumérico, vigente desde jul/2026, admite A-Z). */
export const limparDocumento = (value?: string | null): string =>
  (value || '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();

/** CNPJ = 12+ caracteres, ou qualquer valor com letra (CPF só tem dígitos). */
export const ehDocumentoCnpj = (value?: string | null): boolean => {
  const limpo = limparDocumento(value);
  return limpo.length > 11 || /[A-Z]/.test(limpo);
};

export const ehPessoaJuridica = (cli: { tipo_pessoa?: string | null; cpf_cnpj?: string | null }): boolean =>
  cli.tipo_pessoa === 'PJ' || ehDocumentoCnpj(cli.cpf_cnpj);

export const aplicarMascaraCpfCnpj = (value: string): string => {
  const limpo = limparDocumento(value);
  if (!ehDocumentoCnpj(limpo)) {
    return limpo
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return limpo
    .slice(0, 14)
    .replace(/^([0-9A-Z]{2})([0-9A-Z])/, '$1.$2')
    .replace(/^([0-9A-Z]{2})\.([0-9A-Z]{3})([0-9A-Z])/, '$1.$2.$3')
    .replace(/\.([0-9A-Z]{3})([0-9A-Z])/, '.$1/$2')
    .replace(/([0-9A-Z]{4})([0-9A-Z]{1,2})$/, '$1-$2');
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
    const cleanDate = dataValidade.trim().split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
      const todayStr = new Date().toLocaleDateString('sv-SE');
      return cleanDate < todayStr;
    }
    const valDate = new Date(dataValidade);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return valDate < today;
  } catch {
    return false;
  }
};

const semAcento = (texto: string): string =>
  texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Filtra por nome, razão social, fantasia, e-mail, CPF/CNPJ ou telefone.
 * O documento só entra na comparação quando o termo tem dígitos/letras de documento:
 * "silva".replace(/\D/g, '') é "" e includes("") casa com todo mundo.
 */
export const filtrarClientes = <T extends Cliente>(clientes: T[], termo: string): T[] => {
  const t = semAcento((termo || '').trim());
  if (!t) return clientes;
  const termoDigitos = t.replace(/\D/g, '');
  const termoDoc = limparDocumento(t);
  // Documento: só dígitos/letras e separadores de CPF/CNPJ, com ao menos um dígito
  const pareceDocumento = /^[0-9a-z.\-/]+$/.test(t) && /\d/.test(t);
  return clientes.filter(c => {
    const texto = [c.nome_completo, (c as { nome?: string }).nome, c.razao_social, c.nome_fantasia, c.email]
      .map(v => semAcento(v || '')).join('|');
    if (texto.includes(t)) return true;
    if (pareceDocumento && limparDocumento(c.cpf_cnpj).includes(termoDoc)) return true;
    if (termoDigitos.length >= 3 && (c.telefone || '').replace(/\D/g, '').includes(termoDigitos)) return true;
    return false;
  });
};

/** <option>s do select de representante legal (somente PF); nome e documento sempre escapados. */
export const renderOpcoesRepresentanteHtml = (clientes: Cliente[], selecionadoId?: number | null): string => {
  let html = '<option value="">Selecione um cliente PF já cadastrado...</option>';
  clientes.filter(c => !ehPessoaJuridica(c)).forEach(pf => {
    const pid = pf.pessoa_id || pf.id;
    const marcado = selecionadoId && Number(selecionadoId) === Number(pid);
    html += `<option value="${pid}" ${marcado ? 'selected' : ''}>${escapeHtml(pf.nome_completo)} (${escapeHtml(aplicarMascaraCpfCnpj(pf.cpf_cnpj || ''))})</option>`;
  });
  return html;
};

/** Endereço para exibição: não fabrica separadores quando faltam partes. */
export const montarEnderecoDetalhe = (cli: Cliente): string => {
  const logradouro = [cli.endereco_completo, cli.bairro].map(v => (v || '').trim()).filter(Boolean).join(' - ');
  const cidadeUf = [cli.cidade, cli.estado].map(v => (v || '').trim()).filter(Boolean).join('/');
  const cep = cli.cep ? `CEP: ${aplicarMascaraCep(cli.cep)}` : '';
  return [logradouro, cidadeUf, cep].filter(Boolean).join(' · ');
};

/** Texto de confirmação de exclusão: avisa quando há vínculos com propriedades que serão desfeitos. */
export const montarConfirmacaoExclusao = (clientes: Cliente[]): string => {
  const nomes = clientes.slice(0, 5).map(c => `• ${c.nome_completo || 'Sem nome'}`).join('\n');
  const resto = clientes.length > 5 ? `\n… e mais ${clientes.length - 5}` : '';
  const totalProps = clientes.reduce((acc, c) => acc + (c.total_propriedades || 0), 0);
  const aviso = totalProps > 0
    ? `\n\nAtenção: ${totalProps} vínculo(s) com propriedades serão removidos e a composição de proprietários delas poderá ficar incompleta.`
    : '';
  const titulo = clientes.length === 1 ? 'Excluir este cliente?' : `Excluir ${clientes.length} clientes?`;
  return `${titulo}\n${nomes}${resto}${aviso}`;
};

export const calcularEstatisticasClientes = (clientes: Cliente[]): ClienteEstatisticas => {
  let pf = 0;
  let pj = 0;
  let incompletos = 0;

  clientes.forEach(cli => {
    const isPj = ehPessoaJuridica(cli);
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

// ---------------------------------------------------------------------------
// Listagem: segmentos, pendências, ordenação e renderização das linhas
// (padrão de tela de listagem — ver "Arquivos .md/PADRAO_TELA_LISTAGEM.md")
// ---------------------------------------------------------------------------

export type SegmentoCliente = 'todos' | 'pf' | 'pj' | 'pendencias';
export type CampoOrdenacaoCliente = 'nome' | 'cidade' | 'vinculos';
export type DirecaoOrdenacao = 'asc' | 'desc';

export interface PendenciaCliente {
  codigo: 'conjuge' | 'cnh-vencida' | 'sem-contato';
  rotulo: string;
  tom: 'warn' | 'danger';
}

const nomeDoCliente = (cli: Cliente): string => cli.nome_completo || (cli as { nome?: string }).nome || 'Sem Nome';

const casadoOuUniaoEstavel = (cli: Cliente): boolean => {
  const estCivil = cli.estado_civil || '';
  return estCivil.includes('Casado') || estCivil.includes('União Estável');
};

/** O que falta/vence no cadastro e merece atenção do operador. Vazio = cadastro em ordem. */
export const listarPendenciasCliente = (cli: Cliente): PendenciaCliente[] => {
  const pendencias: PendenciaCliente[] = [];
  if (casadoOuUniaoEstavel(cli) && !(cli.nome_conjuge || '').trim()) {
    pendencias.push({ codigo: 'conjuge', rotulo: 'Cônjuge pendente', tom: 'warn' });
  }
  if (isCnhVencida(cli.cnh_validade)) {
    pendencias.push({ codigo: 'cnh-vencida', rotulo: 'CNH vencida', tom: 'danger' });
  }
  if (!(cli.telefone || '').trim() && !(cli.email || '').trim()) {
    pendencias.push({ codigo: 'sem-contato', rotulo: 'Sem contato', tom: 'warn' });
  }
  return pendencias;
};

export const filtrarPorSegmento = <T extends Cliente>(clientes: T[], segmento: SegmentoCliente): T[] => {
  switch (segmento) {
    case 'pf': return clientes.filter(c => !ehPessoaJuridica(c));
    case 'pj': return clientes.filter(c => ehPessoaJuridica(c));
    case 'pendencias': return clientes.filter(c => listarPendenciasCliente(c).length > 0);
    default: return clientes;
  }
};

/** Contagem de cada segmento (sobre a lista inteira, para o número no chip não mudar com a busca). */
export const contarSegmentos = (clientes: Cliente[]): Record<SegmentoCliente, number> => ({
  todos: clientes.length,
  pf: filtrarPorSegmento(clientes, 'pf').length,
  pj: filtrarPorSegmento(clientes, 'pj').length,
  pendencias: filtrarPorSegmento(clientes, 'pendencias').length
});

const totalVinculos = (cli: Cliente): number => (cli.total_propriedades || 0) + (cli.total_levantamentos || 0);

/** Ordenação estável e sem mutar a lista de entrada; nome/cidade em pt-BR ignorando acentos e caixa. */
export const ordenarClientes = <T extends Cliente>(clientes: T[], campo: CampoOrdenacaoCliente, direcao: DirecaoOrdenacao): T[] => {
  const fator = direcao === 'asc' ? 1 : -1;
  const comparaTexto = (a: string, b: string): number => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
  return [...clientes].sort((a, b) => {
    let resultado = 0;
    if (campo === 'nome') {
      resultado = comparaTexto(nomeDoCliente(a), nomeDoCliente(b));
    } else if (campo === 'cidade') {
      const ca = (a.cidade || '').trim();
      const cb = (b.cidade || '').trim();
      // Sem cidade vai sempre para o fim, qualquer que seja a direção
      if (!ca && cb) return 1;
      if (ca && !cb) return -1;
      resultado = comparaTexto(ca, cb);
    } else {
      resultado = totalVinculos(a) - totalVinculos(b);
    }
    if (resultado !== 0) return resultado * fator;
    // Empate: desempata por nome A-Z em qualquer direção, para a ordem não "pular" ao inverter
    return comparaTexto(nomeDoCliente(a), nomeDoCliente(b));
  });
};

const renderContador = (icone: string, titulo: string, valor: number): string => `
  <span class="lp-cnt ${valor ? '' : 'is-zero'}" title="${titulo}: ${valor}">
    <i data-lucide="${icone}"></i>${valor}
  </span>`;

export const renderLinhasTabelaHtml = (visiveis: Cliente[], clientesSelecionados: Set<number>): string => {
  return visiveis.map(cli => {
    const isSel = clientesSelecionados.has(cli.id);
    const isPj = ehPessoaJuridica(cli);
    const nomeExibicao = nomeDoCliente(cli);
    const nomeEsc = escapeHtml(nomeExibicao);
    const badgeTipo = isPj
      ? '<span class="lp-tag lp-tag-pj">PJ</span>'
      : '<span class="lp-tag lp-tag-pf">PF</span>';
    const telefone = (cli.telefone || '').trim();
    const email = (cli.email || '').trim();
    // UF sozinha é ruído (o cadastro assume PR por padrão): só mostra quando há cidade
    const cidadeUf = (cli.cidade || '').trim()
      ? [cli.cidade, cli.estado].map(v => (v || '').trim()).filter(Boolean).join(' / ')
      : '';
    const pendencias = listarPendenciasCliente(cli);
    const temGov = Boolean(cli.tem_senha_gov || cli.senha_gov);

    const celulaContato = telefone || email
      ? `<div class="lp-id-txt">
           <span class="lp-mono" style="font-size:12.5px">${telefone ? escapeHtml(telefone) : '<span class="lp-muted">—</span>'}</span>
           <span class="lp-sub" title="${escapeHtml(email)}">${email ? escapeHtml(email) : '<span class="lp-muted">sem e-mail</span>'}</span>
         </div>`
      : '<span class="lp-muted">—</span>';

    const celulaSituacao = pendencias.length
      ? pendencias.map(p => `<span class="lp-tag ${p.tom === 'danger' ? 'lp-tag-danger' : 'lp-tag-warn'}"><i data-lucide="${p.tom === 'danger' ? 'alert-triangle' : 'alert-circle'}"></i>${p.rotulo}</span>`).join(' ')
      : '<span class="lp-muted" style="font-size:12px">Em ordem</span>';

    const celulaGov = temGov
      ? `<span class="inline-flex items-center gap-1">
           <span class="lp-mono" id="senha-gov-val-${cli.id}" style="font-size:12.5px">••••••••</span>
           <button type="button" class="lp-ico-btn btn-action" data-action="revelar-senha" data-id="${cli.id}" title="Mostrar/ocultar senha GOV" aria-label="Mostrar ou ocultar senha GOV de ${nomeEsc}">
             <i data-lucide="eye"></i>
           </button>
         </span>`
      : '<span class="lp-muted">—</span>';

    return `
      <tr class="${isSel ? 'is-sel' : ''}" data-id="${cli.id}" tabindex="0" aria-label="Abrir ficha de ${nomeEsc}">
        <td class="lp-col-check">
          <ui-checkbox class="check-cliente" data-id="${cli.id}" ${isSel ? 'marcado' : ''}></ui-checkbox>
        </td>
        <td>
          <div class="lp-id">
            <ui-avatar nome="${nomeEsc}" tamanho="sm"></ui-avatar>
            <div class="lp-id-txt">
              <div class="lp-id-nome"><span title="${nomeEsc}">${nomeEsc}</span>${badgeTipo}</div>
              <span class="lp-sub lp-mono">${escapeHtml(aplicarMascaraCpfCnpj(cli.cpf_cnpj || '')) || '<span class="lp-muted">sem documento</span>'}</span>
            </div>
          </div>
        </td>
        <td class="lp-oculta-md">${celulaContato}</td>
        <td class="lp-oculta-lg"><span class="lp-sub" style="font-size:13px;color:var(--lp-text)">${cidadeUf ? escapeHtml(cidadeUf) : '<span class="lp-muted">—</span>'}</span></td>
        <td class="lp-col-num">
          <span class="lp-vinculos">
            ${renderContador('home', 'Propriedades', cli.total_propriedades || 0)}
            ${renderContador('map-pin', 'Levantamentos', cli.total_levantamentos || 0)}
          </span>
        </td>
        <td class="lp-oculta-xl">${celulaGov}</td>
        <td class="lp-oculta-sm">${celulaSituacao}</td>
        <td class="lp-col-acoes">
          <div class="lp-acoes">
            <button type="button" class="lp-ico-btn btn-action" data-action="editar" data-id="${cli.id}" title="Editar" aria-label="Editar ${nomeEsc}">
              <i data-lucide="edit"></i>
            </button>
            <button type="button" class="lp-ico-btn is-danger btn-action" data-action="excluir" data-id="${cli.id}" title="Excluir" aria-label="Excluir ${nomeEsc}">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
};

export { renderBotoesPaginacaoHtml } from '../../utils/lista_padrao';

export const renderMetadadosTabelaHtml = (metadadosObj: Record<string, string>): string => {
  const entries = Object.entries(metadadosObj);
  if (!entries.length) {
    return '<tr><td colspan="3" class="text-white/30 text-center py-4">Nenhum metadado customizado cadastrado.</td></tr>';
  }
  return entries.map(([k, v]) => `
    <tr class="hover:bg-white/[0.01]">
      <td class="font-semibold text-white/90 font-mono">${escapeHtml(k)}</td>
      <td class="text-white/60 font-mono">${escapeHtml(v)}</td>
      <td class="text-right">
        <button data-action="excluir-meta" data-meta-key="${escapeHtml(k)}" class="text-white/45 hover:text-red-400 p-1 rounded hover:bg-white/5 transition-colors cursor-pointer btn-action-meta" title="Remover Campo">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </td>
    </tr>
  `).join('');
};

export const renderLogsHistoricoTabelaHtml = (logs: ClienteHistoricoLog[]): string => {
  if (!Array.isArray(logs) || logs.length === 0) {
    return '<tr><td colspan="4" class="det-vazio text-center py-3">Nenhum log de alteração gravado.</td></tr>';
  }
  return logs.map(log => {
    const dataFormatada = formatarDataHoraUtc(log.data_alteracao);
    return `
      <tr class="hover:bg-white/[0.01]">
        <td class="font-medium text-white/80">${escapeHtml(log.campo_alterado)}</td>
        <td class="text-red-400 font-mono truncate max-w-[120px]" title="${escapeHtml(log.valor_antigo || '')}">${escapeHtml(log.valor_antigo || '-')}</td>
        <td class="text-mint-vibrant font-mono truncate max-w-[120px]" title="${escapeHtml(log.valor_novo || '')}">${escapeHtml(log.valor_novo || '-')}</td>
        <td class="text-right text-white/40 font-mono">${dataFormatada}</td>
      </tr>
    `;
  }).join('');
};

export const renderLogsAcessoTabelaHtml = (acessos: ClienteAcessoLog[]): string => {
  if (!Array.isArray(acessos) || acessos.length === 0) {
    return '<tr><td colspan="5" class="det-vazio text-center py-3">Nenhum registro de acesso a dados sensíveis gravado.</td></tr>';
  }
  return acessos.map(ac => {
    const dataFormatada = formatarDataHoraUtc(ac.data_acesso);
    return `
      <tr class="hover:bg-white/[0.01]">
        <td class="font-mono text-mint-vibrant">${escapeHtml(ac.tipo_dado)}</td>
        <td class="text-white/80 font-medium">${escapeHtml(ac.acao)}</td>
        <td class="text-white/60">${escapeHtml(ac.usuario || 'Operador')}</td>
        <td class="font-mono text-white/40 text-[10px]">${escapeHtml(ac.ip_origem || 'Local')}</td>
        <td class="text-right text-white/40 font-mono">${dataFormatada}</td>
      </tr>
    `;
  }).join('');
};

export const renderDocumentosTabelaHtml = (docs: ClienteDocumento[], clienteId?: number): string => {
  if (!Array.isArray(docs) || docs.length === 0) {
    return '<tr><td colspan="7" class="det-vazio text-center py-3">Nenhum documento cadastrado.</td></tr>';
  }
  return docs.map(doc => {
    const isVencida = doc.tipo_documento === 'CNH' && isCnhVencida(doc.data_validade);
    const validadeFormatada = doc.data_validade ? doc.data_validade.split('-').reverse().join('/') : '-';
    const badgeVencida = isVencida 
      ? `<span class="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse"><i data-lucide="alert-triangle" class="w-3 h-3"></i> CNH Vencida</span>`
      : '';

    const temArquivo = Boolean(doc.arquivo_path || doc.arquivo_nome);
    const btnArquivo = temArquivo && clienteId
      ? `<a href="${API_BASE}/clientes/${clienteId}/documentos/${doc.id}/arquivo" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-[10px] bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/20 hover:bg-mint-vibrant/20 transition-colors" title="Visualizar / Baixar PDF original">
          <i data-lucide="file-text" class="w-3 h-3"></i>
          Ver PDF
         </a>`
      : `<span class="text-white/20 text-[10px]">-</span>`;

    return `
      <tr class="hover:bg-white/[0.01] text-xs">
        <td class="font-bold font-mono text-mint-vibrant">${escapeHtml(doc.tipo_documento)}</td>
        <td class="font-mono text-white/90 font-medium">${escapeHtml(doc.numero)}</td>
        <td class="text-white/60">${escapeHtml(doc.orgao_emissor || '-')}${doc.uf_emissor ? `/${escapeHtml(doc.uf_emissor)}` : ''}</td>
        <td class="font-mono text-white/60">${escapeHtml(doc.categoria_cnh || '-')}</td>
        <td class="font-mono text-white/80">
          <div class="flex items-center gap-2">
            <span>${validadeFormatada}</span>
            ${badgeVencida}
          </div>
        </td>
        <td class="text-center">${btnArquivo}</td>
        <td class="text-right">
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

