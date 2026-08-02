import { escapeHtml, formatarCCIR } from '../../utils';

export const aplicarMascaraCCIRMat = (val: string): string => {
   const d = val.replace(/\D/g, '').slice(0, 13);
   if (d.length === 13) {
      return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{3})(\d{1})$/, "$1.$2.$3.$4-$5");
   }
   return d;
};

export const aplicarMascaraITRMat = (val: string): string => {
   return val.replace(/\D/g, '')
      .replace(/(\d{1})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1})$/, '$1-$2');
};

export const aplicarMascaraUUIDMat = (val: string): string => {
   const limpo = val.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 32);
   let r = "";
   if (limpo.length > 0) r += limpo.slice(0, 8);
   if (limpo.length > 8) r += "-" + limpo.slice(8, 12);
   if (limpo.length > 12) r += "-" + limpo.slice(12, 16);
   if (limpo.length > 16) r += "-" + limpo.slice(16, 20);
   if (limpo.length > 20) r += "-" + limpo.slice(20, 32);
   return r;
};

export const obterProprietarioPrincipalTexto = (clientes: any[]) => {
   if (!clientes || clientes.length === 0) {
      return '<span class="text-white/20 italic text-[11px]">Sem proprietário</span>';
   }
   
   const clientesOrdenados = [...clientes].sort((a, b) => {
      const partA = a.percentual_participacao || 0;
      const partB = b.percentual_participacao || 0;
      if (partB !== partA) return partB - partA; 
      return (a.nome_completo || '').localeCompare(b.nome_completo || ''); 
   });
   
   const principal = clientesOrdenados[0];
   const nomeCompleto = principal.nome_completo || '';
   const partesNome = nomeCompleto.trim().split(/\s+/);
   const nomeAbreviado = partesNome.slice(0, 2).join(' ');
   
   if (clientes.length > 1) {
      return `<span class="font-semibold text-white/80">${escapeHtml(nomeAbreviado)}</span> <span class="text-white/40 text-[10px]">e mais ${clientes.length - 1}</span>`;
   }
   return `<span class="font-semibold text-white/80">${escapeHtml(nomeAbreviado)}</span>`;
};

export const renderLinhasPropriedadesHtml = (visiveis: any[], propriedadesSelecionadas: Set<number>): string => {
   return visiveis.map(prop => {
      const isSel = propriedadesSelecionadas.has(prop.id);
      const rowClass = isSel ? 'bg-mint-vibrant/5 border-l-2 border-l-mint-vibrant' : 'hover:bg-white/[0.01]';
      const principalTexto = obterProprietarioPrincipalTexto(prop.clientes || []);

      return `
         <tr class="border-b border-white/5 transition-all text-xs ${rowClass}" data-id="${prop.id}">
            <td class="py-2.5 px-4">
               <ui-checkbox class="check-propriedade" data-id="${prop.id}" ${isSel ? 'marcado' : ''}></ui-checkbox>
            </td>
            <td class="py-2.5 px-4 font-medium text-white flex items-center gap-2.5 cursor-pointer hover:text-mint-vibrant truncate w-72" onclick="window.abrirDetalhesPropriedade(${prop.id})">
               <div class="w-7 h-7 rounded-full bg-mint-vibrant/10 flex items-center justify-center text-[10px] font-bold text-mint-vibrant shrink-0">
                  <i data-lucide="home" class="w-3.5 h-3.5"></i>
               </div>
               <span class="truncate font-semibold">${escapeHtml(prop.nome_propriedade)}</span>
            </td>
            <td class="py-2.5 px-4 font-mono text-white/75">${escapeHtml(prop.municipio)} / ${escapeHtml(prop.uf)}</td>
            <td class="py-2.5 px-4">${principalTexto}</td>
            <td class="py-2.5 px-4 text-center font-mono font-medium">${prop.total_matriculas || 0}</td>
            <td class="py-2.5 px-4 text-center font-mono font-medium">${prop.total_levantamentos || 0}</td>
            <td class="py-2.5 px-4 text-right">
               <div class="flex items-center justify-end gap-1">
                  <button class="p-1.5 text-white/40 hover:text-mint-vibrant rounded hover:bg-white/5 transition-colors cursor-pointer" onclick="window.abrirDetalhesPropriedade(${prop.id})" title="Ver Detalhes">
                     <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                  </button>
                  <button class="p-1.5 text-white/40 hover:text-mint-vibrant rounded hover:bg-white/5 transition-colors cursor-pointer" onclick="window.abrirEdicaoPropriedade(${prop.id})" title="Editar">
                     <i data-lucide="edit" class="w-3.5 h-3.5"></i>
                  </button>
                  <button class="p-1.5 text-white/40 hover:text-red-400 rounded hover:bg-white/5 transition-colors cursor-pointer" onclick="window.excluirPropriedadeIndividual(${prop.id})" title="Excluir">
                     <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                  </button>
               </div>
            </td>
         </tr>
      `;
   }).join('');
};

export const renderProprietariosTabelaHtml = (clientes: any[]): string => {
   if (!clientes || clientes.length === 0) {
      return `<tr><td colspan="4" class="text-white/30 text-center py-4 italic">Nenhum proprietário vinculado a esta propriedade.</td></tr>`;
   }
   return clientes.map(c => `
      <tr class="hover:bg-white/[0.01]">
         <td class="py-2 px-3 font-medium text-white/90 truncate max-w-[150px]">${escapeHtml(c.nome_completo)}</td>
         <td class="py-2 px-3 text-white/60 font-mono">${escapeHtml(c.cpf_cnpj)}</td>
         <td class="py-2 px-3 text-right font-mono font-bold text-mint-vibrant">${(c.percentual_participacao || 0).toFixed(2)}%</td>
         <td class="py-2 px-3 text-center">
            <button onclick="window.removerProprietarioVinculado(${c.id})" class="text-white/40 hover:text-red-400 p-1 rounded hover:bg-white/5 transition-colors cursor-pointer" title="Remover Proprietário">
               <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
         </td>
      </tr>
   `).join('');
};

export const renderMatriculasTabelaHtml = (matriculas: any[], propriedadeCcir?: string): string => {
   if (!matriculas || matriculas.length === 0) {
      return `<tr><td colspan="5" class="text-white/30 text-center py-4 italic">Nenhuma matrícula cadastrada nesta propriedade.</td></tr>`;
   }
   return matriculas.map(m => {
      const areaVal = m.area_registrada_ha ?? m.area_ha;
      const areaHa = (areaVal !== undefined && areaVal !== null && Number(areaVal) > 0) 
         ? `${Number(areaVal).toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} ha` 
         : '-';
      const ccirVal = m.codigo_ccir || m.ccir || propriedadeCcir;
      const ccir = ccirVal ? formatarCCIR(ccirVal) : '-';
      const itrVal = m.codigo_itr || m.itr;
      const itr = itrVal ? itrVal : '-';
      const sigef = m.georreferenciamento ? `<span class="text-mint-vibrant font-bold">Sim</span>` : `<span class="text-white/30">Não</span>`;
      const denominacao = m.denominacao_gleba || m.denominacao || '-';

      return `
         <tr class="hover:bg-white/[0.01]">
            <td class="py-2.5 px-3">
               <div class="font-bold text-white font-mono text-xs">${escapeHtml(m.numero_matricula)}</div>
               <div class="text-[10px] text-white/50 truncate max-w-[180px]">${escapeHtml(denominacao)}</div>
            </td>
            <td class="py-2.5 px-3 text-right font-mono text-white/80 font-bold">${areaHa}</td>
            <td class="py-2.5 px-3 text-[10px] font-mono">
               <div class="text-blue-400">CCIR: ${ccir}</div>
               <div class="text-white/60">ITR: ${itr} | SIGEF: ${sigef}</div>
            </td>
            <td class="py-2.5 px-3 text-center">
               ${m.caminho_certidao_pdf ? `
                  <a href="${escapeHtml(m.caminho_certidao_pdf)}" target="_blank" class="text-mint-vibrant hover:text-white p-1 rounded transition-colors inline-block" title="Abrir PDF Certidão">
                     <i data-lucide="file-text" class="w-4 h-4"></i>
                  </a>
               ` : '<span class="text-white/20">-</span>'}
            </td>
            <td class="py-2.5 px-3 text-right">
               <div class="flex items-center justify-end gap-1">
                  <button onclick="window.abrirHistoricoMatricula(${m.id}, '${escapeHtml(m.numero_matricula)}')" class="text-white/40 hover:text-blue-400 p-1 rounded hover:bg-white/5 transition-colors cursor-pointer" title="Histórico">
                     <i data-lucide="history" class="w-3.5 h-3.5"></i>
                  </button>
                  <button onclick="window.iniciarEdicaoMatricula(${m.id})" class="text-white/40 hover:text-mint-vibrant p-1 rounded hover:bg-white/5 transition-colors cursor-pointer" title="Editar">
                     <i data-lucide="edit" class="w-3.5 h-3.5"></i>
                  </button>
                  <button onclick="window.excluirMatriculaIndiv(${m.id})" class="text-white/40 hover:text-red-400 p-1 rounded hover:bg-white/5 transition-colors cursor-pointer" title="Excluir">
                     <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                  </button>
               </div>
            </td>
         </tr>
      `;
   }).join('');
};
