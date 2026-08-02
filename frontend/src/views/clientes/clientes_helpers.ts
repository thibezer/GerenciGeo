import { escapeHtml } from '../../utils';

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

export const calcularEstatisticasClientes = (clientes: any[]) => {
   let pf = 0;
   let pj = 0;
   let incompletos = 0;

   clientes.forEach(cli => {
      const docLimpo = (cli.cpf_cnpj || '').replace(/\D/g, '');
      if (docLimpo.length > 11) {
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

export const renderLinhasTabelaHtml = (visiveis: any[], clientesSelecionados: Set<number>): string => {
   return visiveis.map(cli => {
      const isSel = clientesSelecionados.has(cli.id);
      const rowClass = isSel ? 'bg-mint-vibrant/5 border-l-2 border-l-mint-vibrant' : 'hover:bg-white/[0.01]';

      return `
         <tr class="border-b border-white/5 transition-all text-xs ${rowClass}" data-id="${cli.id}">
            <td class="py-2.5 px-4">
               <ui-checkbox class="check-cliente" data-id="${cli.id}" ${isSel ? 'marcado' : ''}></ui-checkbox>
            </td>
            <td class="py-2.5 px-4 font-medium text-white flex items-center gap-2.5 cursor-pointer hover:text-mint-vibrant truncate w-72" onclick="window.abrirDetalhesCliente(${cli.id})">
               <ui-avatar nome="${escapeHtml(cli.nome_completo || '')}" tamanho="sm"></ui-avatar>
               <span class="truncate font-semibold">${escapeHtml(cli.nome_completo)}</span>
            </td>
            <td class="py-2.5 px-4 font-mono text-white/75">${aplicarMascaraCpfCnpj(cli.cpf_cnpj || '')}</td>
            <td class="py-2.5 px-4 font-mono text-white/75 font-medium">${cli.senha_gov ? escapeHtml(cli.senha_gov) : '-'}</td>
            <td class="py-2.5 px-4 text-center font-mono font-medium">${cli.total_propriedades || 0}</td>
            <td class="py-2.5 px-4 text-center font-mono font-medium">${cli.total_levantamentos || 0}</td>
            <td class="py-2.5 px-4 text-right">
               <div class="flex items-center justify-end gap-1">
                  <button class="p-1.5 text-white/40 hover:text-mint-vibrant rounded hover:bg-white/5 transition-colors cursor-pointer" onclick="window.abrirDetalhesCliente(${cli.id})" title="Ver Detalhes">
                     <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                  </button>
                  <button class="p-1.5 text-white/40 hover:text-mint-vibrant rounded hover:bg-white/5 transition-colors cursor-pointer" onclick="window.abrirEdicaoCliente(${cli.id})" title="Editar">
                     <i data-lucide="edit" class="w-3.5 h-3.5"></i>
                  </button>
                  <button class="p-1.5 text-white/40 hover:text-red-400 rounded hover:bg-white/5 transition-colors cursor-pointer" onclick="window.excluirClienteIndividual(${cli.id})" title="Excluir">
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
         <button class="h-7 px-2.5 rounded border border-white/10 hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition-all font-bold flex items-center justify-center cursor-pointer" ${paginaAtual === 1 ? 'disabled' : ''} onclick="window.mudarPaginaClientes(${paginaAtual - 1})">
            Anterior
         </button>
      `;
      
      for (let p = 1; p <= totalPaginas; p++) {
         if (p === 1 || p === totalPaginas || (p >= paginaAtual - 1 && p <= paginaAtual + 1)) {
            const activeClass = p === paginaAtual ? 'bg-mint-vibrant text-forest-deep border-transparent font-bold' : 'border-white/10 hover:bg-white/5 text-white/70';
            pagButtonsHtml += `
               <button class="w-7 h-7 rounded border text-xs font-mono transition-all flex items-center justify-center cursor-pointer ${activeClass}" onclick="window.mudarPaginaClientes(${p})">
                  ${p}
               </button>
            `;
         } else if (p === paginaAtual - 2 || p === paginaAtual + 2) {
            pagButtonsHtml += `<span class="px-1 text-white/20 select-none">...</span>`;
         }
      }

      pagButtonsHtml += `
         <button class="h-7 px-2.5 rounded border border-white/10 hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition-all font-bold flex items-center justify-center cursor-pointer" ${paginaAtual === totalPaginas ? 'disabled' : ''} onclick="window.mudarPaginaClientes(${paginaAtual + 1})">
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
            <button onclick="window.excluirMetadadoDetalhe('${escapeHtml(k)}')" class="text-white/45 hover:text-red-400 p-1 rounded hover:bg-white/5 transition-colors cursor-pointer" title="Remover Campo">
               <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
         </td>
      </tr>
   `).join('');
};

export const renderLogsHistoricoTabelaHtml = (logs: any[]): string => {
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

export const renderPropriedadesVinculadasHtml = (props: any[]): string => {
   if (!Array.isArray(props) || props.length === 0) {
      return `<p class="text-[11px] text-white/30 italic py-1">Nenhuma propriedade vinculada a este cliente.</p>`;
   }
   return props.map((p: any) => `
      <div class="flex items-center justify-between py-1.5 text-xs">
         <div class="min-w-0 flex-1 pr-2">
            <span class="font-bold text-white truncate block text-[11px]" title="${escapeHtml(p.nome_propriedade)}">${escapeHtml(p.nome_propriedade)}</span>
            <span class="text-[9px] text-white/40 block mt-0.5">Participação: <strong class="text-mint-vibrant font-mono">${(p.percentual_participacao || 0).toFixed(2)}%</strong></span>
         </div>
         <button onclick="window.irParaPropriedade(${p.id})" class="text-mint-vibrant hover:text-white transition-colors flex items-center gap-1 hover:underline text-[10px] font-bold shrink-0 cursor-pointer">
            Ver Propriedade
            <i data-lucide="external-link" class="w-3 h-3"></i>
         </button>
      </div>
   `).join('');
};
