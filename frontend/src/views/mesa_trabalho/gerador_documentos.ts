import L from 'leaflet';
import { API_BASE } from '../../config';
import { initIcons } from '../../utils';
import type { MesaTrabalhoContext } from './mesa_trabalho_context';

export function setupGeradorDocumentos(ctx: MesaTrabalhoContext) {
  
  // 1. Carrega os dados de homologação do SIGEF (poligonal importada)
  ctx.carregarHomologacaoDados = async (_profissionalId: number) => {
    renderPlanilhasHomologadas();
    if (!ctx.currentLevId) return;
    try {
      // 1. Carrega todos os pontos homologados de todas as planilhas do levantamento para exibir no mapa
      const resTodos = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/pontos-homologados`);
      const todosPontos = await resTodos.json();
      
      // 2. Carrega apenas os pontos da matrícula ativa para o grid de baixo, contador e peças
      let pontosDoProjeto: any[] = [];
      if (ctx.currentMatriculaId) {
        const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/pontos-homologados`);
        pontosDoProjeto = await res.json();
      }
      
      const container = document.getElementById('container-vertices-homologados');
      const countTxt = document.getElementById('txt-qtd-homologados');
      
      if (Array.isArray(todosPontos)) {
        ctx.bancoPontosList = todosPontos;
        
        if (countTxt) {
          countTxt.innerText = `${pontosDoProjeto.length} Pontos`;
        }
        
        if (todosPontos.length > 0) {
          ctx.bancoPontosExibido = true;
          ctx.mapaController.plotPoligonalHomologada(todosPontos);
          
          const btnToggleMapa = document.getElementById('btn-toggle-mapa-banco');
          const icon = document.getElementById('icon-toggle-mapa-banco');
          const txt = document.getElementById('txt-toggle-mapa-banco');
          if (btnToggleMapa) {
            btnToggleMapa.classList.remove('bg-amber-500/10');
            btnToggleMapa.classList.add('bg-amber-500/20');
          }
          if (txt) txt.innerText = "Ocultar Poligonal";
          if (icon) icon.setAttribute('data-lucide', 'eye-off');
        } else {
          ctx.bancoPontosExibido = false;
          ctx.mapaController.plotPoligonalHomologada([]);
          
          const btnToggleMapa = document.getElementById('btn-toggle-mapa-banco');
          const icon = document.getElementById('icon-toggle-mapa-banco');
          const txt = document.getElementById('txt-toggle-mapa-banco');
          if (btnToggleMapa) {
            btnToggleMapa.classList.remove('bg-amber-500/20');
            btnToggleMapa.classList.add('bg-amber-500/10');
          }
          if (txt) txt.innerText = "Exibir Poligonal";
          if (icon) icon.setAttribute('data-lucide', 'eye');
        }
        initIcons();
        
        const containerPecas = document.getElementById('container-pecas-cartorio');
        if (containerPecas) {
          if (pontosDoProjeto.length > 0) {
            containerPecas.classList.remove('hidden');
          } else {
            containerPecas.classList.add('hidden');
          }
        }

        const pontosMat = ctx.pontosList.filter(p => p.matricula_id === ctx.currentMatriculaId);
        const validCoords = pontosMat.filter(p => p.lat && p.lon && p.lat !== 0 && p.lon !== 0);
        if (validCoords.length === 0 && ctx.triagemMap) {
          const validHomologadosCoords = pontosDoProjeto.filter((p: any) => p.lat && p.lon && p.lat !== 0 && p.lon !== 0).map((p: any) => L.latLng(p.lat, p.lon));
          if (validHomologadosCoords.length > 0) {
            const bounds = L.latLngBounds(validHomologadosCoords);
            ctx.triagemMap.fitBounds(bounds, { padding: [40, 40] });
          }
        }
        
        if (container) {
          if (pontosDoProjeto.length === 0) {
            container.innerHTML = `<div class="text-white/20 italic py-4 text-center">Selecione uma matrícula com pontos homologados para listar seus vértices.</div>`;
          } else {
            container.innerHTML = `
              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                ${pontosDoProjeto.map((p: any) => `
                  <div class="p-1.5 bg-white/5 border border-white/5 rounded-technical flex items-center justify-between">
                    <span class="text-[10px] text-mint-vibrant font-bold">${p.codigo_completo}</span>
                    <span class="text-[8px] text-white/40 uppercase font-mono">${p.tipo_ponto}</span>
                  </div>
                `).join('')}
              </div>
            `;
          }
        }
      }
    } catch (err) {
      console.error("Erro ao carregar dados de homologação:", err);
    }

    const containerAuditoria = document.getElementById('container-auditoria-banco');
    if (containerAuditoria && !containerAuditoria.classList.contains('hidden')) {
      renderAuditoriaBancoPontos();
    }
  };

  // 2. Carrega confrontantes ativos no select da anuência
  ctx.carregarConfrontantesAtivosSelect = async () => {
    if (!ctx.currentLevId || !ctx.currentMatriculaId) return;
    try {
      const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/confrontantes-ativos`);
      const confs = await res.json();
      
      const select = document.getElementById('select-confrontante-anuencia') as HTMLSelectElement;
      if (select) {
        select.innerHTML = `
          <option value="" class="bg-[#0c1510]">Anuência Confrontante...</option>
          <option value="lote" class="bg-[#0c1510] text-mint-vibrant font-bold">✨ Gerar Todas em Lote (PDF Único)</option>
        `;
        if (Array.isArray(confs)) {
          confs.forEach((c: any) => {
            const opt = document.createElement('option');
            opt.value = String(c.id);
            opt.className = 'bg-[#0c1510]';
            opt.textContent = c.matricula_imovel ? `${c.nome} (Matrícula: ${c.matricula_imovel})` : c.nome;
            select.appendChild(opt);
          });
        }
      }
    } catch (err) {
      console.error("Erro ao carregar confrontantes ativos da matricula:", err);
    }
  };

  // 3. Renderiza a tabela de planilhas homologadas (SIGEF)
  const renderPlanilhasHomologadas = async () => {
    const container = document.getElementById('container-planilhas-homologadas');
    if (!container || !ctx.currentLevId) return;

    try {
      const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/planilhas-homologadas`);
      const planilhas = await res.json();

      if (!Array.isArray(planilhas) || planilhas.length === 0) {
        container.innerHTML = `<div class="text-white/20 italic py-2 text-center">Nenhuma planilha cadastrada.</div>`;
        return;
      }

      let html = `
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="text-[9px] font-bold uppercase tracking-widest text-white/30 border-b border-white/5">
              <th class="py-1.5 px-2">Arquivo / Planilha</th>
              <th class="py-1.5 px-2 text-center">Vértices</th>
              <th class="py-1.5 px-2">Matrícula Associada</th>
              <th class="py-1.5 px-2 text-center">Ações</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-white/5">
      `;

      planilhas.forEach((p: any) => {
        const selectId = `select-assoc-mat-${btoa(p.planilha_origem).replace(/=/g, '')}`;
        html += `
          <tr class="hover:bg-white/[0.02] transition-colors">
            <td class="py-2 px-2 font-mono text-white/80 max-w-[150px] truncate" title="${p.planilha_origem}">${p.planilha_origem}</td>
            <td class="py-2 px-2 text-center font-mono text-mint-vibrant font-bold">${p.qtd_pontos}</td>
            <td class="py-2 px-2">
              <select class="select-assoc-matricula bg-white/5 border border-white/10 hover:border-mint-vibrant/30 rounded px-1.5 py-0.5 text-[11px] text-white focus:outline-none transition-all w-full max-w-[140px]" data-planilha="${p.planilha_origem}" id="${selectId}">
                <option value="" class="bg-[#0c1510]">Nenhuma (Pendente)</option>
                ${ctx.matriculasList.map(m => `
                  <option value="${m.id}" class="bg-[#0c1510]" ${p.matricula_id === m.id ? 'selected' : ''}>Matrícula ${m.numero_matricula}</option>
                `).join('')}
              </select>
            </td>
            <td class="py-2 px-2 text-center">
              <button class="btn-deletar-planilha text-red-400 hover:text-red-300 hover:bg-red-500/10 p-1 rounded transition-colors" data-planilha="${p.planilha_origem}" title="Excluir planilha e todos os seus pontos">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </td>
          </tr>
        `;
      });

      html += `
          </tbody>
        </table>
      `;

      container.innerHTML = html;
      initIcons();

      container.querySelectorAll('.select-assoc-matricula').forEach((select: any) => {
        select.addEventListener('change', async () => {
          const planilha = select.getAttribute('data-planilha');
          const matIdVal = select.value;
          const matId = matIdVal ? parseInt(matIdVal) : null;

          try {
            const resAssoc = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/planilhas-homologadas/associar-matricula`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                planilha_origem: planilha,
                matricula_id: matId
              })
            });
            if (resAssoc.ok) {
              await ctx.loadLevantamentoDetails();
            } else {
              const errData = await resAssoc.json();
              alert(errData.detail || "Erro ao associar matrícula.");
            }
          } catch (err) {
            console.error("Erro ao associar matrícula:", err);
          }
        });
      });

      container.querySelectorAll('.btn-deletar-planilha').forEach((btn: any) => {
        btn.addEventListener('click', async () => {
          const planilha = btn.getAttribute('data-planilha');
          if (!confirm(`Deseja realmente excluir a planilha "${planilha}" e todos os seus vértices homologados deste levantamento? Esta ação é irreversível.`)) {
            return;
          }

          try {
            const resDel = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/planilhas-homologadas?planilha_origem=${encodeURIComponent(planilha)}`, {
              method: 'DELETE'
            });
            if (resDel.ok) {
              alert("Planilha e pontos excluídos com sucesso!");
              await ctx.loadLevantamentoDetails();
            } else {
              const errData = await resDel.json();
              alert(errData.detail || "Erro ao excluir planilha.");
            }
          } catch (err) {
            console.error("Erro ao excluir planilha:", err);
          }
        });
      });

    } catch (err) {
      console.error("Erro ao renderizar planilhas homologadas:", err);
      container.innerHTML = `<div class="text-red-400 italic py-2 text-center">Erro ao carregar lista de planilhas.</div>`;
    }
  };

  // 4. Renderiza a auditoria do banco de pontos (duplicatas)
  const renderAuditoriaBancoPontos = async () => {
    const container = document.getElementById('lista-grupos-auditoria');
    const totalPtsEl = document.getElementById('auditoria-total-pontos');
    const totalGruposEl = document.getElementById('auditoria-total-grupos');
    const totalDupEl = document.getElementById('auditoria-total-duplicados');
    
    if (!container || !ctx.currentLevId) return;

    try {
      const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/banco-pontos/auditoria`);
      const data = await res.json();

      if (totalPtsEl) totalPtsEl.innerText = String(data.total_pontos || 0);
      if (totalGruposEl) totalGruposEl.innerText = String(data.total_grupos || 0);
      if (totalDupEl) totalDupEl.innerText = String(data.total_duplicatas || 0);

      if (!data.grupos || data.grupos.length === 0) {
        container.innerHTML = `<div class="text-white/20 italic py-4 text-center">Nenhum ponto no banco para auditar.</div>`;
        return;
      }

      let html = '';
      data.grupos.forEach((g: any) => {
        const isDuplicadoGrupo = g.tem_duplicata;
        
        html += `
          <div class="bg-white/[0.02] border border-white/5 rounded-lg p-3 space-y-2">
            <div class="flex justify-between items-center border-b border-white/5 pb-2">
              <div class="flex items-center gap-2">
                <span class="font-bold text-xs text-white max-w-[200px] truncate" title="${g.planilha_origem}">${g.planilha_origem}</span>
                <span class="text-[9px] font-mono bg-white/5 px-1.5 py-0.5 rounded text-white/40">${g.total} Pontos</span>
                ${isDuplicadoGrupo ? `<span class="text-[8px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/25 px-1.5 py-0.5 rounded font-bold uppercase">Contém Duplicatas</span>` : ''}
              </div>
              <button class="btn-deletar-planilha-auditoria text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2 py-1 rounded text-[10px] flex items-center gap-1 transition-all active:scale-95" data-planilha="${g.planilha_origem}">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                Excluir Planilha
              </button>
            </div>
            
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse text-[10px] font-mono">
                <thead>
                  <tr class="text-[8px] font-bold uppercase tracking-wider text-white/20 border-b border-white/5">
                    <th class="py-1 px-1">Código</th>
                    <th class="py-1 px-1">Tipo</th>
                    <th class="py-1 px-1">Coordenadas (N, E, H)</th>
                    <th class="py-1 px-1">Método / Limite</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-white/5">
                  ${g.pontos.map((p: any) => `
                    <tr class="${p.is_duplicado ? 'bg-amber-500/5 hover:bg-amber-500/10' : 'hover:bg-white/[0.01]'} transition-colors">
                      <td class="py-1 px-1 font-bold ${p.is_duplicado ? 'text-amber-400' : 'text-mint-vibrant'}">
                        ${p.codigo_completo}
                        ${p.is_duplicado ? '<span class="text-[8px] text-amber-500 font-bold block">(Duplicado)</span>' : ''}
                      </td>
                      <td class="py-1 px-1 text-white/60">${p.tipo_ponto}</td>
                      <td class="py-1 px-1 text-white/40">
                        ${p.norte ? p.norte.toFixed(3) : '-'}, ${p.este ? p.este.toFixed(3) : '-'}, ${p.altitude ? p.altitude.toFixed(2) : '-'}
                      </td>
                      <td class="py-1 px-1 text-white/40">
                        ${p.metodo_posicionamento || '-'} / ${p.tipo_limite || '-'}
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
      });

      container.innerHTML = html;
      initIcons();

      container.querySelectorAll('.btn-deletar-planilha-auditoria').forEach((btn: any) => {
        btn.addEventListener('click', async () => {
          const planilha = btn.getAttribute('data-planilha');
          if (planilha.startsWith("Sem arquivo")) {
            alert("Não é possível excluir pontos criados manualmente por este atalho.");
            return;
          }
          if (!confirm(`Deseja realmente excluir a planilha "${planilha}" e todos os seus vértices homologados deste levantamento? Esta ação é irreversível.`)) {
            return;
          }

          try {
            const resDel = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/planilhas-homologadas?planilha_origem=${encodeURIComponent(planilha)}`, {
              method: 'DELETE'
            });
            if (resDel.ok) {
              alert("Planilha e pontos excluídos com sucesso!");
              await ctx.loadLevantamentoDetails();
            } else {
              const errData = await resDel.json();
              alert(errData.detail || "Erro ao excluir planilha.");
            }
          } catch (err) {
            console.error("Erro ao excluir planilha da auditoria:", err);
          }
        });
      });

    } catch (err) {
      console.error("Erro ao renderizar auditoria do banco de pontos:", err);
      container.innerHTML = `<div class="text-red-400 italic py-2 text-center">Erro ao carregar auditoria.</div>`;
    }
  };

  const renderizarStatusAnexoMatricula = (selectedConf: any) => {
    const wrapper = document.getElementById('wrapper-anexo-matricula-conf');
    if (!wrapper) return;

    if (selectedConf && selectedConf.caminho_matricula_pdf) {
      const pathStr = selectedConf.caminho_matricula_pdf;
      const parts = pathStr.split(/[\\/]/);
      const fileName = parts[parts.length - 1];

      wrapper.innerHTML = `
        <div class="flex items-center justify-between w-full gap-2 text-xs">
          <a href="${API_BASE}/confrontantes/${selectedConf.id}/visualizar-matricula" target="_blank" class="flex items-center gap-1.5 text-mint-vibrant hover:underline font-medium truncate max-w-[200px]" title="Visualizar matrícula anexada">
            <i data-lucide="file-text" class="w-4 h-4 shrink-0"></i>
            <span class="truncate text-ellipsis overflow-hidden">${fileName}</span>
          </a>
          <button type="button" id="btn-remover-matricula-conf" class="text-red-400 hover:text-red-300 hover:bg-red-500/10 p-1 rounded transition-colors" title="Excluir anexo da matrícula">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      `;

      initIcons();

      const btnRemover = document.getElementById('btn-remover-matricula-conf');
      if (btnRemover) {
        btnRemover.onclick = async () => {
          if (!confirm("Deseja realmente remover o anexo da matrícula deste confrontante?")) return;
          
          try {
            const res = await fetch(`${API_BASE}/confrontantes/${selectedConf.id}/matricula`, {
              method: 'DELETE'
            });
            if (res.ok) {
              alert("Matrícula removida com sucesso!");
              selectedConf.caminho_matricula_pdf = null;
              renderizarStatusAnexoMatricula(selectedConf);
              await ctx.loadLevantamentoDetails();
            } else {
              const errData = await res.json();
              alert(errData.detail || "Erro ao remover matrícula.");
            }
          } catch (err) {
            console.error("Erro ao remover matrícula:", err);
            alert("Erro de rede ao remover matrícula.");
          }
        };
      }
    } else {
      wrapper.innerHTML = `
        <button type="button" id="btn-upload-matricula-conf" class="text-xs text-white/60 hover:text-white flex items-center gap-1.5 font-medium w-full text-left">
          <i data-lucide="upload" class="w-4 h-4"></i>
          Escolher Arquivo (PDF/Imagem)
        </button>
      `;

      initIcons();

      const btnUpload = document.getElementById('btn-upload-matricula-conf');
      if (btnUpload) {
        btnUpload.onclick = () => {
          const fileInput = document.getElementById('file-matricula-conf') as HTMLInputElement;
          if (fileInput) fileInput.click();
        };
      }
    }
  };

  // 5. Inicialização principal dos eventos do gerador de documentos para cartório
  const inicializarEventosCartorio = () => {
    const btnToggleMapa = document.getElementById('btn-toggle-mapa-banco');
    if (btnToggleMapa) {
      btnToggleMapa.onclick = () => {
        if (!ctx.bancoPontosList || ctx.bancoPontosList.length === 0) {
          alert("Nenhum ponto homologado importado para exibir no mapa.");
          return;
        }
        
        ctx.bancoPontosExibido = !ctx.bancoPontosExibido;
        const icon = document.getElementById('icon-toggle-mapa-banco');
        const txt = document.getElementById('txt-toggle-mapa-banco');
        
        if (ctx.bancoPontosExibido) {
          ctx.mapaController.plotPoligonalHomologada(ctx.bancoPontosList);
          if (txt) txt.innerText = "Ocultar Poligonal";
          if (icon) icon.setAttribute('data-lucide', 'eye-off');
          btnToggleMapa.classList.replace('bg-amber-500/10', 'bg-amber-500/20');
        } else {
          ctx.mapaController.plotPoligonalHomologada([]);
          if (txt) txt.innerText = "Exibir Poligonal";
          if (icon) icon.setAttribute('data-lucide', 'eye');
          btnToggleMapa.classList.replace('bg-amber-500/20', 'bg-amber-500/10');
        }
        initIcons();
      };
    }
    
    const btnReq = document.getElementById('btn-emitir-req-cartorio');
    if (btnReq) {
      btnReq.onclick = async () => {
        if (!ctx.currentMatriculaId) return;
        
        try {
          const resLev = await fetch(`${API_BASE}/levantamentos`);
          const allLevs = await resLev.json();
          const levObj = allLevs.find((l: any) => l.id === ctx.currentLevId);
          if (levObj) ctx.currentLevantamento = levObj;
        } catch (e) {
          console.error("Erro ao recarregar levantamento:", e);
        }
        
        let trt = "";
        let data = "";
        
        if (ctx.currentLevantamento && ctx.currentLevantamento.numero_trt && ctx.currentLevantamento.numero_trt.trim()) {
          trt = ctx.currentLevantamento.numero_trt;
          data = ctx.currentLevantamento.data_trt || "";
        } else {
          const trtVal = prompt("Informe o número do TRT/ART:");
          if (trtVal === null) return;
          const dataVal = prompt("Informe a data de quitação do TRT/ART (AAAA-MM-DD):", new Date().toISOString().substring(0, 10));
          if (dataVal === null) return;
          trt = trtVal;
          data = dataVal;
          
          if (ctx.currentLevantamento) {
            const payload = {
              propriedade_id: ctx.currentLevantamento.propriedade_id,
              profissional_id: ctx.currentLevantamento.profissional_id,
              data_inicio: ctx.currentLevantamento.data_inicio,
              status: ctx.currentLevantamento.status || "EM_ANDAMENTO",
              numero_trt: trt,
              data_trt: data
            };
            try {
              const resPut = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              });
              const resData = await resPut.json();
              if (!resData.error) {
                ctx.currentLevantamento.numero_trt = trt;
                ctx.currentLevantamento.data_trt = data;
              }
            } catch (err) {
              console.error("Erro ao salvar TRT no levantamento:", err);
            }
          }
        }
        
        const url = `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/requerimento-cartorio-html?numero_trt=${encodeURIComponent(trt)}&data_trt=${encodeURIComponent(data)}`;
        window.open(url, '_blank');
      };
    }
    
    const btnResp = document.getElementById('btn-emitir-decl-resp');
    if (btnResp) {
      btnResp.onclick = () => {
        if (!ctx.currentMatriculaId) return;
        const url = `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/declaracao-responsabilidade-html`;
        window.open(url, '_blank');
      };
    }
    
    const btnLaudo = document.getElementById('btn-emitir-laudo-tec');
    if (btnLaudo) {
      btnLaudo.onclick = async () => {
        if (!ctx.currentMatriculaId) return;
        
        try {
          const resLev = await fetch(`${API_BASE}/levantamentos`);
          const allLevs = await resLev.json();
          const levObj = allLevs.find((l: any) => l.id === ctx.currentLevId);
          if (levObj) ctx.currentLevantamento = levObj;
        } catch (e) {
          console.error("Erro ao recarregar levantamento:", e);
        }
        
        let trt = "";
        let data = "";
        
        if (ctx.currentLevantamento && ctx.currentLevantamento.numero_trt && ctx.currentLevantamento.numero_trt.trim()) {
          trt = ctx.currentLevantamento.numero_trt;
          data = ctx.currentLevantamento.data_trt || "";
        } else {
          const trtVal = prompt("Informe o número do TRT/ART:");
          if (trtVal === null) return;
          const dataVal = prompt("Informe a data de quitação do TRT/ART (AAAA-MM-DD):", new Date().toISOString().substring(0, 10));
          if (dataVal === null) return;
          trt = trtVal;
          data = dataVal;
          
          if (ctx.currentLevantamento) {
            const payload = {
              propriedade_id: ctx.currentLevantamento.propriedade_id,
              profissional_id: ctx.currentLevantamento.profissional_id,
              data_inicio: ctx.currentLevantamento.data_inicio,
              status: ctx.currentLevantamento.status || "EM_ANDAMENTO",
              numero_trt: trt,
              data_trt: data
            };
            try {
              const resPut = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              });
              const resData = await resPut.json();
              if (!resData.error) {
                ctx.currentLevantamento.numero_trt = trt;
                ctx.currentLevantamento.data_trt = data;
              }
            } catch (err) {
              console.error("Erro ao salvar TRT no levantamento:", err);
            }
          }
        }
        
        const equip = prompt("Informe o Equipamento GNSS Utilizado:", "Receptor GNSS Hi-Target V30 / RTK de Dupla Frequência (L1/L2)");
        if (equip === null) return;
        
        const url = `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/laudo-tecnico-html?numero_trt=${encodeURIComponent(trt)}&data_trt=${encodeURIComponent(data)}&equipamento=${encodeURIComponent(equip)}`;
        window.open(url, '_blank');
      };
    }
    
    const btnTermoSigef = document.getElementById('btn-emitir-termo-sigef');
    if (btnTermoSigef) {
      btnTermoSigef.onclick = async () => {
        if (!ctx.currentMatriculaId) return;
        
        try {
          const resLev = await fetch(`${API_BASE}/levantamentos`);
          const allLevs = await resLev.json();
          const levObj = allLevs.find((l: any) => l.id === ctx.currentLevId);
          if (levObj) ctx.currentLevantamento = levObj;
        } catch (e) {
          console.error("Erro ao recarregar levantamento:", e);
        }
        
        let trt = "";
        let data = "";
        
        if (ctx.currentLevantamento && ctx.currentLevantamento.numero_trt && ctx.currentLevantamento.numero_trt.trim()) {
          trt = ctx.currentLevantamento.numero_trt;
          data = ctx.currentLevantamento.data_trt || "";
        } else {
          const trtVal = prompt("Informe o número do TRT/ART:");
          if (trtVal === null) return;
          const dataVal = prompt("Informe a data de quitação do TRT/ART (AAAA-MM-DD):", new Date().toISOString().substring(0, 10));
          if (dataVal === null) return;
          trt = trtVal;
          data = dataVal;
          
          if (ctx.currentLevantamento) {
            const payload = {
              propriedade_id: ctx.currentLevantamento.propriedade_id,
              profissional_id: ctx.currentLevantamento.profissional_id,
              data_inicio: ctx.currentLevantamento.data_inicio,
              status: ctx.currentLevantamento.status || "EM_ANDAMENTO",
              numero_trt: trt,
              data_trt: data
            };
            try {
              const resPut = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              });
              const resData = await resPut.json();
              if (!resData.error) {
                ctx.currentLevantamento.numero_trt = trt;
                ctx.currentLevantamento.data_trt = data;
              }
            } catch (err) {
              console.error("Erro ao salvar TRT no levantamento:", err);
            }
          }
        }
        
        const url = `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/termo-responsabilidade-sigef-html?numero_trt=${encodeURIComponent(trt)}&data_trt=${encodeURIComponent(data)}`;
        window.open(url, '_blank');
      };
    }
    
    const btnManualProprietario = document.getElementById('btn-emitir-manual-proprietario');
    if (btnManualProprietario) {
      btnManualProprietario.onclick = () => {
        if (!ctx.currentMatriculaId) return;
        const url = `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/manual-proprietario-html`;
        window.open(url, '_blank');
      };
    }
    
    const btnAnuencia = document.getElementById('btn-emitir-anuencia');
    if (btnAnuencia) {
      btnAnuencia.onclick = () => {
        if (!ctx.currentMatriculaId) return;
        const select = document.getElementById('select-confrontante-anuencia') as HTMLSelectElement;
        const confId = select ? select.value : '';
        if (!confId) {
          alert("Selecione um confrontante da lista ou a opção de Lote para emitir a anuência.");
          return;
        }
        
        let url = "";
        if (confId === "lote") {
          url = `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/anuencia-lote-html`;
        } else {
          url = `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/confrontantes/${confId}/anuencia-html`;
        }
        window.open(url, '_blank');
      };
    }

    const selectAnuencia = document.getElementById('select-confrontante-anuencia') as HTMLSelectElement;
    if (selectAnuencia) {
      selectAnuencia.addEventListener('change', async () => {
        const confIdVal = selectAnuencia.value;
        const containerForm = document.getElementById('container-form-confrontante');
        if (!confIdVal || confIdVal === "lote" || !ctx.currentLevId) {
          if (containerForm) containerForm.classList.add('hidden');
          return;
        }
        
        try {
          const res = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/confrontantes`);
          const confs = await res.json();
          const selectedConf = confs.find((c: any) => String(c.id) === confIdVal);
          
          if (selectedConf && containerForm) {
            containerForm.classList.remove('hidden');
            
            (document.getElementById('txt-conf-id-edicao') as HTMLElement).innerText = `ID: ${selectedConf.id}`;
            (document.getElementById('input-conf-nome') as HTMLInputElement).value = selectedConf.nome || '';
            (document.getElementById('input-conf-cpf') as HTMLInputElement).value = selectedConf.cpf_cnpj || '';
            (document.getElementById('input-conf-rg') as HTMLInputElement).value = selectedConf.rg || '';
            (document.getElementById('input-conf-nacionalidade') as HTMLInputElement).value = selectedConf.nacionalidade || '';
            (document.getElementById('input-conf-profissao') as HTMLInputElement).value = selectedConf.profissao || '';
            (document.getElementById('conf-estado-civil') as HTMLSelectElement).value = selectedConf.estado_civil || 'solteiro';
            (document.getElementById('conf-regime-bens') as HTMLSelectElement).value = selectedConf.regime_bens || '';
            (document.getElementById('input-conf-conjuge-nome') as HTMLInputElement).value = selectedConf.nome_conjuge || '';
            (document.getElementById('input-conf-conjuge-cpf') as HTMLInputElement).value = selectedConf.cpf_conjuge || '';
            (document.getElementById('input-conf-conjuge-rg') as HTMLInputElement).value = selectedConf.rg_conjuge || '';
            (document.getElementById('input-conf-endereco') as HTMLInputElement).value = selectedConf.endereco_completo || '';
            (document.getElementById('input-conf-matricula-imovel') as HTMLInputElement).value = selectedConf.matricula_imovel || '';
            
            // Inicia máquina de estados reativa para visibilidade de cônjuge
            configurarMaquinadeEstadosCivil(containerForm);

            renderizarStatusAnexoMatricula(selectedConf);

            initIcons();
          }
        } catch (err) {
          console.error("Erro ao carregar qualificacoes do confrontante:", err);
        }
      });
    }

    const inputCpf = document.getElementById('input-conf-cpf') as HTMLInputElement;
    if (inputCpf) {
      inputCpf.addEventListener('blur', async () => {
        const cpfVal = inputCpf.value.trim();
        if (!cpfVal) return;
        
        // Limpa pontuações para checagem rápida de tamanho (CPF ou CNPJ)
        const cpfLimpo = cpfVal.replace(/\D/g, '');
        if (cpfLimpo.length < 11) return; // Menor que CPF completo
        
        try {
          const res = await fetch(`${API_BASE}/confrontantes/buscar-por-cpf?cpf=${encodeURIComponent(cpfLimpo)}`);
          if (res.ok) {
            const data = await res.json();
            if (data && data.nome) {
              // Preenche os campos do formulário
              (document.getElementById('input-conf-nome') as HTMLInputElement).value = data.nome || '';
              (document.getElementById('input-conf-rg') as HTMLInputElement).value = data.rg || '';
              (document.getElementById('input-conf-nacionalidade') as HTMLInputElement).value = data.nacionalidade || '';
              (document.getElementById('input-conf-profissao') as HTMLInputElement).value = data.profissao || '';
              (document.getElementById('conf-estado-civil') as HTMLSelectElement).value = data.estado_civil || 'solteiro';
              (document.getElementById('conf-regime-bens') as HTMLSelectElement).value = data.regime_bens || '';
              (document.getElementById('input-conf-conjuge-nome') as HTMLInputElement).value = data.nome_conjuge || '';
              (document.getElementById('input-conf-conjuge-cpf') as HTMLInputElement).value = data.cpf_conjuge || '';
              (document.getElementById('input-conf-conjuge-rg') as HTMLInputElement).value = data.rg_conjuge || '';
              (document.getElementById('input-conf-endereco') as HTMLInputElement).value = data.endereco_completo || '';
              if (data.matricula_imovel) {
                const inputMat = document.getElementById('input-conf-matricula-imovel') as HTMLInputElement;
                if (inputMat && !inputMat.value.trim()) {
                  inputMat.value = data.matricula_imovel;
                }
              }
              
              // Executa a máquina de estados reativa para atualizar visibilidade do cônjuge
              const containerForm = document.getElementById('container-form-confrontante');
              if (containerForm) {
                configurarMaquinadeEstadosCivil(containerForm);
              }
              
              // Exibe um aviso visual temporário de auto-preenchimento
              const msgEl = document.createElement('span');
              msgEl.id = 'alert-cpf-auto-complete';
              msgEl.className = 'text-[10px] text-mint-vibrant font-semibold mt-1 block animate-pulse';
              msgEl.innerText = '✨ Dados de qualificação carregados automaticamente do banco de dados!';
              
              // Remove alerta antigo se houver
              const oldMsg = document.getElementById('alert-cpf-auto-complete');
              if (oldMsg) oldMsg.remove();
              
              inputCpf.parentNode?.appendChild(msgEl);
              setTimeout(() => {
                msgEl.remove();
              }, 5000);
            }
          }
        } catch (err) {
          console.error("Erro ao buscar confrontante por CPF:", err);
        }
      });
    }

    const inputCpfConjuge = document.getElementById('input-conf-conjuge-cpf') as HTMLInputElement;
    if (inputCpfConjuge) {
      inputCpfConjuge.addEventListener('input', () => {
        inputCpfConjuge.value = formatarCpfCnpjDinamico(inputCpfConjuge.value);
      });
    }

    if (inputCpf) {
      inputCpf.addEventListener('input', () => {
        inputCpf.value = formatarCpfCnpjDinamico(inputCpf.value);
      });
    }

    const btnSalvarConf = document.getElementById('btn-salvar-confrontante-qualificacao') as HTMLButtonElement;
    if (btnSalvarConf) {
      btnSalvarConf.onclick = async () => {
        const confIdVal = selectAnuencia ? selectAnuencia.value : '';
        if (!confIdVal || !ctx.currentLevId) return;

        const nome = (document.getElementById('input-conf-nome') as HTMLInputElement).value.trim();
        if (!nome) {
          alert("O nome do confrontante é obrigatório.");
          return;
        }

        const payload = {
          nome: nome,
          cpf_cnpj: (document.getElementById('input-conf-cpf') as HTMLInputElement).value.trim() || null,
          rg: (document.getElementById('input-conf-rg') as HTMLInputElement).value.trim() || null,
          nacionalidade: (document.getElementById('input-conf-nacionalidade') as HTMLInputElement).value.trim() || null,
          profissao: (document.getElementById('input-conf-profissao') as HTMLInputElement).value.trim() || null,
          estado_civil: (document.getElementById('conf-estado-civil') as HTMLSelectElement).value || null,
          regime_bens: (document.getElementById('conf-regime-bens') as HTMLSelectElement).value || null,
          nome_conjuge: (document.getElementById('input-conf-conjuge-nome') as HTMLInputElement).value.trim() || null,
          cpf_conjuge: (document.getElementById('input-conf-conjuge-cpf') as HTMLInputElement).value.trim() || null,
          rg_conjuge: (document.getElementById('input-conf-conjuge-rg') as HTMLInputElement).value.trim() || null,
          endereco_completo: (document.getElementById('input-conf-endereco') as HTMLInputElement).value.trim() || null,
          matricula_imovel: (document.getElementById('input-conf-matricula-imovel') as HTMLInputElement).value.trim() || null,
          tipo_relacao: null
        };

        btnSalvarConf.disabled = true;
        const originalHTML = btnSalvarConf.innerHTML;
        btnSalvarConf.innerHTML = `<i data-lucide="refresh-cw" class="w-4 h-4 animate-spin"></i> Salvando...`;
        initIcons();

        try {
          const res = await fetch(`${API_BASE}/confrontantes/${confIdVal}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (res.ok) {
            alert("Qualificação do confrontante salva com sucesso!");
            const containerForm = document.getElementById('container-form-confrontante');
            if (containerForm) containerForm.classList.add('hidden');
            if (selectAnuencia) selectAnuencia.value = '';
            
            await ctx.loadLevantamentoDetails();
          } else {
            const data = await res.json();
            alert(data.error || "Erro ao salvar qualificações do confrontante.");
          }
        } catch (err) {
          console.error("Erro ao salvar qualificações:", err);
          alert("Erro de rede ao salvar qualificações.");
        } finally {
          btnSalvarConf.disabled = false;
          btnSalvarConf.innerHTML = originalHTML;
          initIcons();
        }
      };
    }

    const btnCancelarConf = document.getElementById('btn-cancelar-confrontante-qualificacao');
    if (btnCancelarConf) {
      btnCancelarConf.onclick = () => {
        const containerForm = document.getElementById('container-form-confrontante');
        if (containerForm) containerForm.classList.add('hidden');
        if (selectAnuencia) selectAnuencia.value = '';
      };
    }

    const fileInputMatricula = document.getElementById('file-matricula-conf') as HTMLInputElement;
    if (fileInputMatricula) {
      fileInputMatricula.onchange = async (e: any) => {
        const select = document.getElementById('select-confrontante-anuencia') as HTMLSelectElement;
        const confId = select ? select.value : '';
        if (!confId) {
          alert("Nenhum confrontante selecionado.");
          return;
        }

        if (e.target.files && e.target.files.length > 0) {
          const file = e.target.files[0];
          const formData = new FormData();
          formData.append('file', file);

          try {
            const res = await fetch(`${API_BASE}/confrontantes/${confId}/upload-matricula`, {
              method: 'POST',
              body: formData
            });

            const data = await res.json();
            if (res.ok) {
              alert("Matrícula anexada com sucesso!");
              
              // Buscar o confrontante atualizado e renderizar
              const resConf = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/confrontantes`);
              const confs = await resConf.json();
              const updatedConf = confs.find((c: any) => String(c.id) === confId);
              if (updatedConf) {
                renderizarStatusAnexoMatricula(updatedConf);
              }
              
              await ctx.loadLevantamentoDetails();
            } else {
              alert(data.detail || data.error || "Erro ao fazer upload da matrícula.");
            }
          } catch (err) {
            console.error("Erro no upload da matrícula:", err);
            alert("Erro de rede ao fazer upload da matrícula.");
          } finally {
            fileInputMatricula.value = '';
          }
        }
      };
    }
  };

  // 6. Ingestion dropzone para a planilha homologada do SIGEF (Múltiplos Arquivos e Abas com Mapeamento)
  const inicializarHomologacaoIncra = () => {
    const dropzone = document.getElementById('homologacao-dropzone');
    const fileInput = document.getElementById('homologacao-file-input') as HTMLInputElement;
    const btnProcessar = document.getElementById('btn-processar-homologacao') as HTMLButtonElement;
    const containerMapeamento = document.getElementById('container-mapeamento-abas-homologacao');
    const listaAbasMapeamento = document.getElementById('lista-abas-mapeamento');
    
    let selectedFiles: File[] = [];
    
    if (!dropzone || !fileInput || !btnProcessar || !containerMapeamento || !listaAbasMapeamento) return;
    
    const updateButtonState = () => {
      if (selectedFiles.length > 0) {
        btnProcessar.disabled = false;
        btnProcessar.classList.remove('opacity-55', 'cursor-not-allowed');
        btnProcessar.classList.add('btn-primary');
      } else {
        btnProcessar.disabled = true;
        btnProcessar.classList.add('opacity-55', 'cursor-not-allowed');
        btnProcessar.classList.remove('btn-primary');
        containerMapeamento.classList.add('hidden');
        listaAbasMapeamento.innerHTML = '';
      }
    };
    
    dropzone.onclick = () => fileInput.click();
    
    const analisarArquivos = async (files: File[]) => {
      if (!ctx.currentLevId) return;
      
      selectedFiles = files;
      const textElement = dropzone.querySelector('p.text-xs') as HTMLElement;
      if (textElement) {
        textElement.innerText = selectedFiles.length === 1 
          ? `Arquivo: ${selectedFiles[0].name}` 
          : `${selectedFiles.length} arquivos selecionados`;
      }
      
      // Mostrar carregamento no mapeamento
      containerMapeamento.classList.remove('hidden');
      listaAbasMapeamento.innerHTML = `
        <div class="flex items-center justify-center gap-2 py-4 text-white/50 text-xs">
          <i data-lucide="refresh-cw" class="w-4 h-4 animate-spin text-mint-vibrant"></i>
          Analisando estruturas dos arquivos...
        </div>
      `;
      initIcons();
      
      try {
        // Chamar /analisar-planilha-abas para cada arquivo em paralelo
        const promessas = selectedFiles.map(async (file) => {
          const formData = new FormData();
          formData.append('file', file);
          
          const url = `${API_BASE}/levantamentos/${ctx.currentLevId}/analisar-planilha-abas`;
          const res = await fetch(url, {
            method: 'POST',
            body: formData
          });
          
          if (!res.ok) {
            throw new Error(`Falha ao analisar ${file.name}`);
          }
          return await res.json();
        });
        
        const resultados = await Promise.all(promessas);
        
        // Renderizar a interface de mapeamento
        listaAbasMapeamento.innerHTML = '';
        
        let abasEncontradas = 0;
        
        resultados.forEach((resData) => {
          if (resData.sucesso && resData.abas && resData.abas.length > 0) {
            const filename = resData.filename;
            
            // Criar um bloco para o arquivo
            const fileBlock = document.createElement('div');
            fileBlock.className = 'space-y-2 border-b border-white/5 pb-2 last:border-b-0 last:pb-0';
            
            const fileTitle = document.createElement('div');
            fileTitle.className = 'text-xs font-bold text-white/70 flex items-center gap-1.5 pt-1';
            fileTitle.innerHTML = `<i data-lucide="file" class="w-3.5 h-3.5 text-white/40"></i> ${filename}`;
            fileBlock.appendChild(fileTitle);
            
            resData.abas.forEach((aba: any) => {
              abasEncontradas++;
              const mapKey = `${filename}#${aba.nome}`;
              
              const abaRow = document.createElement('div');
              abaRow.className = 'flex flex-col sm:flex-row sm:items-center justify-between gap-2 pl-4';
              
              const labelDiv = document.createElement('div');
              labelDiv.className = 'flex items-center gap-2 text-xs text-white/50';
              labelDiv.innerHTML = `
                <span class="font-semibold text-white/80">${aba.nome}</span>
                <span class="text-[10px] bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-white/40 font-mono">${aba.qtd_pontos} pts</span>
              `;
              
              const select = document.createElement('select');
              select.className = 'selecao-matricula-aba bg-white/5 border border-white/10 hover:border-white/20 text-white rounded px-2 py-1 text-xs outline-none transition-colors w-full sm:w-[220px]';
              select.setAttribute('data-map-key', mapKey);
              
              let selectHtml = `<option value="">-- Não importar --</option>`;
              
              // Função local de normalização para comparação inteligente
              const normalizarMatriculaJS = (val: string) => {
                if (!val) return "";
                let texto = val.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                texto = texto.replace(/^(matricula|mat\.|mat|nº|n\.|m\-|\bm\b|reg\.|reg)\s*/g, "");
                texto = texto.replace(/[^a-z0-9]/g, "");
                texto = texto.replace(/^0+/, "");
                return texto || "0";
              };
              
              ctx.matriculasList.forEach((m: any) => {
                const matriculaNorm = normalizarMatriculaJS(String(m.numero_matricula));
                const abaNorm = normalizarMatriculaJS(aba.nome);
                const filenameNorm = normalizarMatriculaJS(filename);
                
                const devePreSelecionar = 
                  (matriculaNorm && abaNorm && abaNorm.includes(matriculaNorm)) ||
                  (matriculaNorm && filenameNorm && filenameNorm.includes(matriculaNorm)) ||
                  (ctx.matriculasList.length === 1); // Se só tiver uma matrícula, pré-seleciona
                
                selectHtml += `<option value="${m.id}" ${devePreSelecionar ? 'selected' : ''}>Matrícula ${m.numero_matricula}</option>`;
              });
              
              select.innerHTML = selectHtml;
              
              abaRow.appendChild(labelDiv);
              abaRow.appendChild(select);
              fileBlock.appendChild(abaRow);
            });
            
            listaAbasMapeamento.appendChild(fileBlock);
          }
        });
        
        if (abasEncontradas === 0) {
          listaAbasMapeamento.innerHTML = `
            <div class="text-amber-400/80 text-xs py-2 italic text-center">
              Nenhum vértice correspondente ao padrão geodésico regulamentar foi identificado nos arquivos selecionados.
            </div>
          `;
        }
        
        initIcons();
        updateButtonState();
        
        // Mudar o texto do botão para refletir que faremos o processamento das glebas mapeadas
        btnProcessar.innerHTML = `<i data-lucide="upload" class="w-4 h-4"></i> Confirmar e Importar Glebas`;
        initIcons();
      } catch (err: any) {
        console.error("Erro ao analisar arquivos:", err);
        listaAbasMapeamento.innerHTML = `
          <div class="text-red-400 text-xs py-2 italic text-center">
            Erro ao inspecionar os arquivos: ${err.message || err}
          </div>
        `;
        selectedFiles = [];
        updateButtonState();
      }
    };
    
    fileInput.addEventListener('change', (e: any) => {
      if (e.target.files && e.target.files.length > 0) {
        analisarArquivos(Array.from(e.target.files));
      }
    });
    
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('border-mint-vibrant', 'bg-mint-vibrant/[0.02]');
    });
    
    dropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-mint-vibrant', 'bg-mint-vibrant/[0.02]');
    });
    
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-mint-vibrant', 'bg-mint-vibrant/[0.02]');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        analisarArquivos(Array.from(e.dataTransfer.files));
      }
    });
    
    btnProcessar.addEventListener('click', async () => {
      if (selectedFiles.length === 0 || !ctx.currentLevId) return;
      
      // Coletar mapeamento do DOM
      const mapeamento: Record<string, number> = {};
      const selects = listaAbasMapeamento.querySelectorAll('.selecao-matricula-aba') as NodeListOf<HTMLSelectElement>;
      
      let temPeloMenosUmMapeado = false;
      selects.forEach(select => {
        const key = select.getAttribute('data-map-key');
        const val = select.value;
        if (key) {
          mapeamento[key] = val ? parseInt(val) : null as any;
          if (val) {
            temPeloMenosUmMapeado = true;
          }
        }
      });
      
      if (!temPeloMenosUmMapeado) {
        alert("Por favor, selecione pelo menos uma matrícula para importar alguma das abas/arquivos.");
        return;
      }
      
      btnProcessar.disabled = true;
      btnProcessar.innerHTML = `<i data-lucide="refresh-cw" class="w-4 h-4 animate-spin"></i> Processando Lote...`;
      initIcons();
      
      const formData = new FormData();
      selectedFiles.forEach(file => {
        formData.append('files', file);
      });
      
      try {
        const url = `${API_BASE}/levantamentos/${ctx.currentLevId}/importar-pontos-aprovados-lote?mapeamento=${encodeURIComponent(JSON.stringify(mapeamento))}`;
        const res = await fetch(url, {
          method: 'POST',
          body: formData
        });
        
        const data = await res.json();
        if (res.ok && data.sucesso) {
          alert(data.mensagem || "Pontos em lote importados com sucesso!");
          
          selectedFiles = [];
          fileInput.value = '';
          const textElement = dropzone.querySelector('p.text-xs') as HTMLElement;
          if (textElement) {
            textElement.innerText = `Lançar TXT/CSV/ODS Homologado`;
          }
          containerMapeamento.classList.add('hidden');
          listaAbasMapeamento.innerHTML = '';
          
          ctx.loadLevantamentoDetails();
        } else {
          alert(data.detail || data.error || "Erro ao processar lote de arquivos.");
        }
      } catch (err) {
        console.error("Erro no upload em lote:", err);
        alert("Erro de conexão com o servidor API.");
      } finally {
        btnProcessar.innerHTML = `<i data-lucide="upload" class="w-4 h-4"></i> Importar Pontos no Banco`;
        updateButtonState();
        initIcons();
      }
    });
  };

  // 7. Auditoria de duplicatas do banco de pontos
  const inicializarAuditoriaBancoPontos = () => {
    const btnToggle = document.getElementById('btn-toggle-auditoria-banco');
    const container = document.getElementById('container-auditoria-banco');
    const iconChevron = document.getElementById('icon-chevron-auditoria');

    if (!btnToggle || !container) return;

    btnToggle.onclick = () => {
      const isHidden = container.classList.contains('hidden');
      if (isHidden) {
        container.classList.remove('hidden');
        if (iconChevron) iconChevron.classList.add('rotate-180');
        renderAuditoriaBancoPontos();
      } else {
        container.classList.add('hidden');
        if (iconChevron) iconChevron.classList.remove('rotate-180');
      }
    };
  };

  // 8. Reatribui a inicialização de eventos
  ctx.inicializarEventosCartorio = () => {
    inicializarEventosCartorio();
    inicializarHomologacaoIncra();
    inicializarAuditoriaBancoPontos();
  };
}

// Máquina de Estados Reativa para a Qualificação de Cônjuge
export function configurarMaquinadeEstadosCivil(cardElement: HTMLElement) {
  const selectEstadoCivil = cardElement.querySelector('#conf-estado-civil') as HTMLSelectElement;
  const selectRegime = cardElement.querySelector('#conf-regime-bens') as HTMLSelectElement;
  const groupConjuge = cardElement.querySelector('#group-dados-conjuge') as HTMLElement;
  const inputConjugeNome = cardElement.querySelector('#input-conf-conjuge-nome') as HTMLInputElement;
  const inputsCamposExtra = cardElement.querySelectorAll('#input-conf-conjuge-cpf, #input-conf-conjuge-rg') as NodeListOf<HTMLInputElement>;

  const atualizarCampos = () => {
      if (!selectEstadoCivil || !selectRegime || !groupConjuge) return;
      const estCivil = selectEstadoCivil.value.toLowerCase();
      const regime = selectRegime.value.toLowerCase();

      const precisaConjuge = estCivil.includes('casad') || estCivil.includes('estável') || estCivil.includes('estavel');

      if (!precisaConjuge) {
          selectRegime.disabled = true;
          selectRegime.value = "";
          groupConjuge.classList.add('hidden');
      } else {
          selectRegime.disabled = false;
          groupConjuge.classList.remove('hidden');
          
          if (inputConjugeNome) {
              inputConjugeNome.disabled = false;
              inputConjugeNome.placeholder = "Nome do cônjuge";
          }
          
          if (regime.includes('separac') || regime.includes('separaç')) {
              inputsCamposExtra.forEach(input => {
                  input.placeholder = "Omitido no Laudo (Separação)";
                  input.disabled = true;
                  input.value = "";
              });
          } else {
              inputsCamposExtra.forEach(input => {
                  input.placeholder = "Digitar documento";
                  input.disabled = false;
              });
          }
      }
  };

  if (selectEstadoCivil) selectEstadoCivil.addEventListener('change', atualizarCampos);
  if (selectRegime) {
      selectRegime.addEventListener('change', atualizarCampos);
      selectRegime.addEventListener('input', atualizarCampos);
  }
  
  atualizarCampos();
}

export function formatarCpfCnpjDinamico(value: string): string {
  const apenasNumeros = value.replace(/\D/g, '');
  
  if (apenasNumeros.length <= 11) {
    // Formato CPF: 999.999.999-99
    return apenasNumeros
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  } else {
    // Formato CNPJ: 99.999.999/9999-99
    return apenasNumeros
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
  }
}
