import L from 'leaflet';
import { API_BASE } from '../../config';
import { initIcons, showToast } from '../../utils';
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

        const pontosMat = ctx.pontosList;
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
    const statusEl = document.getElementById('status-matricula-anexo');
    const btnVer = document.getElementById('btn-ver-matricula-conf');
    const btnRemover = document.getElementById('btn-remover-matricula-conf');

    if (!statusEl) return;

    if (selectedConf && selectedConf.caminho_matricula_pdf) {
      const pathStr = selectedConf.caminho_matricula_pdf;
      const parts = pathStr.split(/[\\/]/);
      const fileName = parts[parts.length - 1];

      statusEl.innerHTML = `<span class="text-mint-vibrant font-medium flex items-center gap-1.5"><i data-lucide="file-text" class="w-3.5 h-3.5"></i> ${fileName}</span>`;
      
      if (btnVer) {
        btnVer.classList.remove('hidden');
        btnVer.onclick = () => {
          window.open(`${API_BASE}/confrontantes/${selectedConf.id}/visualizar-matricula`, '_blank');
        };
      }
      
      if (btnRemover) {
        btnRemover.classList.remove('hidden');
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
      statusEl.innerHTML = `<span class="text-white/50">Nenhum arquivo anexado.</span>`;
      if (btnVer) btnVer.classList.add('hidden');
      if (btnRemover) btnRemover.classList.add('hidden');
    }
    initIcons();
  };

  // 5. Inicialização principal dos eventos do gerador de documentos para cartório
  const inicializarEventosCartorio = () => {
    const validarPreRequisitosPecas = async (): Promise<boolean> => {
      if (!ctx.currentMatriculaId) return false;
      try {
        const resLev = await fetch(`${API_BASE}/levantamentos`);
        const allLevs = await resLev.json();
        const levObj = allLevs.find((l: any) => l.id === ctx.currentLevId);
        if (levObj) ctx.currentLevantamento = levObj;
      } catch (e) {
        console.error("Erro ao recarregar levantamento:", e);
      }
      if (ctx.currentLevantamento && (!ctx.currentLevantamento.propriedade_id || !ctx.currentLevantamento.profissional_id)) {
        return confirm("Atenção: A Propriedade ou o Profissional Principal não estão vinculados a este levantamento. As peças de cartório poderão conter campos em branco. Deseja emitir mesmo assim?");
      }
      return true;
    };

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
        if (!(await validarPreRequisitosPecas())) return;
        
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
      btnResp.onclick = async () => {
        if (!(await validarPreRequisitosPecas())) return;
        const url = `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/declaracao-responsabilidade-html`;
        window.open(url, '_blank');
      };
    }
    
    const btnLaudo = document.getElementById('btn-emitir-laudo-tec');
    if (btnLaudo) {
      btnLaudo.onclick = async () => {
        if (!(await validarPreRequisitosPecas())) return;
        
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
        if (!(await validarPreRequisitosPecas())) return;
        
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
      btnManualProprietario.onclick = async () => {
        if (!(await validarPreRequisitosPecas())) return;
        const url = `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/manual-proprietario-html`;
        window.open(url, '_blank');
      };
    }
    
    const btnAnuenciaDesmembramento = document.getElementById('btn-emitir-anuencia-desmembramento');
    if (btnAnuenciaDesmembramento) {
      btnAnuenciaDesmembramento.onclick = async () => {
        if (!(await validarPreRequisitosPecas())) return;
        const cnsVal = prompt("Informe o Código CNS do Cartório de Registro de Imóveis (opcional):", "");
        if (cnsVal === null) return;
        const qtdVal = prompt("Informe a quantidade de novas parcelas resultantes do desmembramento:", "3");
        if (qtdVal === null) return;
        
        let url = `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/declaracao-anuencia-desmembramento-html?qtd_parcelas=${encodeURIComponent(qtdVal || "3")}`;
        if (cnsVal.trim()) {
          url += `&codigo_cns=${encodeURIComponent(cnsVal.trim())}`;
        }
        window.open(url, '_blank');
      };
    }

    const btnAverbacaoCasamento = document.getElementById('btn-emitir-averbacao-casamento');
    if (btnAverbacaoCasamento) {
      btnAverbacaoCasamento.onclick = async () => {
        if (!(await validarPreRequisitosPecas())) return;
        const url = `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/requerimento-averbacao-casamento-html`;
        window.open(url, '_blank');
      };
    }


    const btnAnuencia = document.getElementById('btn-emitir-anuencia');
    if (btnAnuencia) {
      btnAnuencia.onclick = async () => {
        if (!(await validarPreRequisitosPecas())) return;
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

    // =========================================================================
    // PRÉ-VISUALIZAÇÃO DA DIVISA DE ANUÊNCIA (MAPA + CROQUI + DADOS TÉCNICOS)
    // =========================================================================
    let previewAnuenciaMap: L.Map | null = null;
    let currentPreviewConfId: string | number | null = null;
    let tileLayerSatelite: L.TileLayer | null = null;
    let tileLayerDark: L.TileLayer | null = null;

    const modalPreview = document.getElementById('modal-preview-divisa-anuencia') as HTMLElement;
    const loaderMapaPreview = document.getElementById('loader-mapa-preview-anuencia') as HTMLElement;

    const fecharModalPreview = () => {
      if (modalPreview) modalPreview.classList.add('hidden');
      if (previewAnuenciaMap) {
        previewAnuenciaMap.remove();
        previewAnuenciaMap = null;
      }
      currentPreviewConfId = null;
    };

    const btnFecharPreview = document.getElementById('btn-fechar-modal-preview-anuencia');
    const btnCancelarPreview = document.getElementById('btn-preview-cancelar');
    if (btnFecharPreview) btnFecharPreview.onclick = fecharModalPreview;
    if (btnCancelarPreview) btnCancelarPreview.onclick = fecharModalPreview;

    const btnGerarOficialPreview = document.getElementById('btn-preview-gerar-anuencia');
    if (btnGerarOficialPreview) {
      btnGerarOficialPreview.onclick = () => {
        if (!currentPreviewConfId || !ctx.currentLevId || !ctx.currentMatriculaId) return;
        const url = `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/confrontantes/${currentPreviewConfId}/anuencia-html`;
        window.open(url, '_blank');
      };
    }

    const btnFocarCad = document.getElementById('btn-preview-focar-cad');
    if (btnFocarCad) {
      btnFocarCad.onclick = () => {
        fecharModalPreview();
        const tabGeodesica = document.querySelector('[data-tab="mesa_geodesica"]') as HTMLElement;
        if (tabGeodesica) tabGeodesica.click();
        showToast("Visualizando perímetro no Canvas CAD.", "info");
      };
    }

    const abrirPreviewDivisaAnuencia = async (confrontanteId: string | number) => {
      if (!ctx.currentLevId || !ctx.currentMatriculaId) {
        showToast("Selecione um levantamento e matrícula válidos.", "info");
        return;
      }
      if (!confrontanteId || confrontanteId === "lote") {
        showToast("Selecione um confrontante individual para visualizar o pedaço da propriedade.", "info");
        return;
      }

      currentPreviewConfId = confrontanteId;
      if (!modalPreview) return;
      modalPreview.classList.remove('hidden');
      if (loaderMapaPreview) loaderMapaPreview.classList.remove('hidden');

      const badgeConf = document.getElementById('preview-anuencia-badge-conf');
      const txtSubtitulo = document.getElementById('preview-anuencia-subtitulo');
      const txtExtensao = document.getElementById('preview-anuencia-extensao');
      const txtCaminhamento = document.getElementById('preview-anuencia-caminhamento');
      const txtQtdVertices = document.getElementById('preview-anuencia-qtd-vertices');
      const txtQtdSegmentos = document.getElementById('preview-anuencia-qtd-segmentos');
      const txtNomeConf = document.getElementById('preview-anuencia-nome-conf');
      const txtCpfConf = document.getElementById('preview-anuencia-cpf-conf');
      const txtMatConf = document.getElementById('preview-anuencia-mat-conf');
      const txtImovelReq = document.getElementById('preview-anuencia-imovel-req');
      const tbodySegs = document.getElementById('preview-anuencia-tbody-segmentos');
      const statusGeo = document.getElementById('preview-anuencia-status-geo');

      if (badgeConf) badgeConf.innerText = "CARREGANDO...";
      if (tbodySegs) {
        tbodySegs.innerHTML = `<tr><td colspan="3" class="py-4 text-center text-white/40 italic">Buscando dados da divisa...</td></tr>`;
      }

      try {
        const url = `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/confrontantes/${confrontanteId}/preview-divisa`;
        const res = await fetch(url);
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: "Falha ao obter geometria." }));
          throw new Error(err.detail || "Falha ao obter dados do trecho da divisa.");
        }
        const data = await res.json();

        if (badgeConf) badgeConf.innerText = data.confrontante.nome || "CONFRONTANTE";
        if (txtSubtitulo) {
          txtSubtitulo.innerText = `Confrontação com ${data.imovel.nome} (${data.imovel.matricula ? `Matrícula ${data.imovel.matricula}` : 'Área do Projeto'})`;
        }
        if (txtNomeConf) txtNomeConf.innerText = data.confrontante.nome || "-";
        if (txtCpfConf) txtCpfConf.innerText = data.confrontante.cpf_cnpj || "Não informado";
        if (txtMatConf) txtMatConf.innerText = data.confrontante.matricula_imovel || "Não informada";
        if (txtImovelReq) {
          txtImovelReq.innerText = `${data.imovel.nome} - Matrícula ${data.imovel.matricula || 'S/N'}`;
        }

        const metricas = data.metricas || {};
        if (txtExtensao) txtExtensao.innerText = metricas.extensao_total_str || "0.00 m";
        if (txtCaminhamento) {
          txtCaminhamento.innerText = (metricas.vertice_inicial && metricas.vertice_final && metricas.vertice_inicial !== "-") 
            ? `${metricas.vertice_inicial} ➔ ${metricas.vertice_final}` 
            : "Não encadeado";
        }
        if (txtQtdVertices) txtQtdVertices.innerText = `${metricas.qtd_vertices || 0} vértices`;
        if (txtQtdSegmentos) txtQtdSegmentos.innerText = `${metricas.qtd_segmentos || 0} segmentos`;

        if (statusGeo) {
          if ((metricas.qtd_segmentos || 0) > 0) {
            statusGeo.innerText = "TRECHO VÁLIDO";
            statusGeo.className = "text-[9px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold";
          } else {
            statusGeo.innerText = "SEM SEGMENTOS";
            statusGeo.className = "text-[9px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold";
          }
        }

        // Tabela de segmentos
        if (tbodySegs) {
          if (Array.isArray(data.segmentos) && data.segmentos.length > 0) {
            tbodySegs.innerHTML = data.segmentos.map((s: any) => `
              <tr class="border-b border-white/5 hover:bg-white/[0.03] transition-colors font-mono">
                <td class="py-1.5 px-1.5 font-bold text-white">${s.de} <span class="text-mint-vibrant">➔</span> ${s.para}</td>
                <td class="py-1.5 px-1.5 text-right text-white/80">${s.azimute}</td>
                <td class="py-1.5 px-1.5 text-right font-bold text-mint-vibrant">${s.distancia_str}</td>
              </tr>
            `).join('');
          } else {
            tbodySegs.innerHTML = `
              <tr>
                <td colspan="3" class="py-4 text-center text-amber-400/80 italic">
                  Nenhum segmento da matrícula foi vinculado a este confrontante na Etapa 2 de Definição de Limites.
                </td>
              </tr>
            `;
          }
        }

        // Mapa Leaflet
        const mapContainer = document.getElementById('mapa-preview-anuencia-divisa');
        if (mapContainer) {
          if (previewAnuenciaMap) {
            previewAnuenciaMap.remove();
            previewAnuenciaMap = null;
          }

          previewAnuenciaMap = L.map(mapContainer, {
            attributionControl: false,
            zoomControl: true,
            maxZoom: 22
          });

          tileLayerSatelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 20
          });

          tileLayerDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 20,
            subdomains: 'abcd'
          });

          tileLayerSatelite.addTo(previewAnuenciaMap);

          const btnSat = document.getElementById('btn-preview-tile-satelite');
          const btnDark = document.getElementById('btn-preview-tile-escuro');
          if (btnSat && btnDark) {
            btnSat.onclick = () => {
              if (tileLayerDark && previewAnuenciaMap?.hasLayer(tileLayerDark)) previewAnuenciaMap.removeLayer(tileLayerDark);
              if (tileLayerSatelite && previewAnuenciaMap && !previewAnuenciaMap.hasLayer(tileLayerSatelite)) tileLayerSatelite.addTo(previewAnuenciaMap);
              btnSat.className = "px-2 py-1 text-[10px] font-bold rounded bg-mint-vibrant text-slate-900 transition-all shadow-sm";
              btnDark.className = "px-2 py-1 text-[10px] font-bold rounded text-white/70 hover:text-white transition-all";
            };
            btnDark.onclick = () => {
              if (tileLayerSatelite && previewAnuenciaMap?.hasLayer(tileLayerSatelite)) previewAnuenciaMap.removeLayer(tileLayerSatelite);
              if (tileLayerDark && previewAnuenciaMap && !previewAnuenciaMap.hasLayer(tileLayerDark)) tileLayerDark.addTo(previewAnuenciaMap);
              btnDark.className = "px-2 py-1 text-[10px] font-bold rounded bg-mint-vibrant text-slate-900 transition-all shadow-sm";
              btnSat.className = "px-2 py-1 text-[10px] font-bold rounded text-white/70 hover:text-white transition-all";
            };
          }

          const boundsGroup = L.featureGroup();

          // Desenha polígono geral
          if (Array.isArray(data.poligono_imovel) && data.poligono_imovel.length >= 3) {
            const polyImovel = L.polygon(data.poligono_imovel, {
              color: '#94a3b8',
              weight: 2,
              dashArray: '5, 5',
              fillColor: '#00f5a0',
              fillOpacity: 0.04
            }).addTo(previewAnuenciaMap);
            polyImovel.bindTooltip("Limite Geral do Imóvel", { sticky: true });
            boundsGroup.addLayer(polyImovel);
          }

          // Desenha divisa lindeira em destaque
          if (Array.isArray(data.lindeira_coords) && data.lindeira_coords.length > 0) {
            const polylineLindeira = L.polyline(data.lindeira_coords, {
              color: '#00f5a0',
              weight: 6,
              opacity: 0.95
            }).addTo(previewAnuenciaMap);

            polylineLindeira.bindTooltip(`Divisa: ${data.confrontante.nome} (${metricas.extensao_total_str || ''})`, {
              sticky: true,
              className: 'bg-[#0c1510] text-mint-vibrant font-bold font-mono text-[10px] border border-mint-vibrant/30 rounded px-2 py-1 shadow-xl'
            });
            boundsGroup.addLayer(polylineLindeira);
          }

          // Marcadores circulares nos vértices
          if (Array.isArray(data.lindeira_pontos)) {
            data.lindeira_pontos.forEach((p: any) => {
              if (p.coords && p.coords.length === 2) {
                const marker = L.circleMarker(p.coords, {
                  radius: p.is_extremo ? 6 : 4,
                  color: '#00f5a0',
                  fillColor: p.is_extremo ? '#ffffff' : '#0c1510',
                  fillOpacity: 1,
                  weight: 2
                }).addTo(previewAnuenciaMap!);

                marker.bindTooltip(`Vértice ${p.nome}`, {
                  permanent: p.is_extremo,
                  direction: 'top',
                  className: 'bg-[#0c1510] text-white font-bold font-mono text-[9px] border border-white/20 rounded px-1.5 py-0.5'
                });
                boundsGroup.addLayer(marker);
              }
            });
          }

          setTimeout(() => {
            if (previewAnuenciaMap) {
              previewAnuenciaMap.invalidateSize();
              if (boundsGroup.getLayers().length > 0) {
                previewAnuenciaMap.fitBounds(boundsGroup.getBounds(), { padding: [40, 40], maxZoom: 19 });
              }
            }
            if (loaderMapaPreview) loaderMapaPreview.classList.add('hidden');
          }, 250);
        }
      } catch (err: any) {
        console.error("Erro ao carregar pré-visualização da divisa:", err);
        showToast(err.message || "Erro ao carregar pré-visualização da divisa.", "error");
        if (loaderMapaPreview) loaderMapaPreview.classList.add('hidden');
      }

      initIcons();
    };

    (window as any).abrirPreviewDivisaAnuenciaGlobal = abrirPreviewDivisaAnuencia;

    const btnPreviewAnuencia = document.getElementById('btn-preview-anuencia');
    if (btnPreviewAnuencia) {
      btnPreviewAnuencia.onclick = () => {
        const select = document.getElementById('select-confrontante-anuencia') as HTMLSelectElement;
        const confId = select ? select.value : '';
        if (!confId || confId === 'lote') {
          showToast("Selecione um confrontante da lista para pré-visualizar a divisa.", "info");
          return;
        }
        abrirPreviewDivisaAnuencia(confId);
      };
    }

    const btnPreviewDivisaForm = document.getElementById('btn-preview-divisa-form');
    if (btnPreviewDivisaForm) {
      btnPreviewDivisaForm.onclick = () => {
        const inputConf = document.getElementById('input-conf-id') as HTMLInputElement;
        const containerF = document.getElementById('container-form-confrontante') as HTMLElement;
        const confId = inputConf ? inputConf.value : (containerF ? containerF.dataset.confrontanteId : '');
        if (!confId) {
          showToast("Selecione ou salve o confrontante primeiro para pré-visualizar sua divisa.", "info");
          return;
        }
        abrirPreviewDivisaAnuencia(confId);
      };
    }

    const selectAnuencia = document.getElementById('select-confrontante-anuencia') as HTMLSelectElement;
    const containerForm = document.getElementById('container-form-confrontante') as HTMLElement;
    const inputConfId = document.getElementById('input-conf-id') as HTMLInputElement;
    const txtConfIdEdicao = document.getElementById('txt-conf-id-edicao') as HTMLElement;
    const badgeConfStatus = document.getElementById('badge-conf-status') as HTMLElement;
    const formConfrontante = document.getElementById('form-edicao-confrontante') as HTMLFormElement;
    const btnNovoConf = document.getElementById('btn-novo-confrontante-cartorio') as HTMLElement;
    const btnFecharCard = document.getElementById('btn-fechar-card-confrontante') as HTMLElement;
    const btnCancelarConf = document.getElementById('btn-cancelar-confrontante-qualificacao') as HTMLElement;
    const btnSalvarConf = document.getElementById('btn-salvar-confrontante-qualificacao') as HTMLElement;
    const inputCpf = document.getElementById('input-conf-cpf') as any;
    const inputCpfConjuge = document.getElementById('input-conf-conjuge-cpf') as any;
    const fileInputMatricula = document.getElementById('file-matricula-conf') as HTMLInputElement;
    const statusBuscaCpf = document.getElementById('status-busca-cpf') as HTMLElement;

    const abrirFormularioNovoConfrontante = () => {
      if (!containerForm) return;
      containerForm.classList.remove('hidden');
      if (inputConfId) inputConfId.value = '';
      containerForm.dataset.confrontanteId = '';
      if (txtConfIdEdicao) txtConfIdEdicao.innerText = 'NOVO';
      if (badgeConfStatus) {
        badgeConfStatus.innerText = 'NOVO CADASTRO';
        badgeConfStatus.className = 'text-[9px] font-mono font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20';
      }

      // Limpar todos os campos e aplicar defaults
      (document.getElementById('input-conf-nome') as any).value = '';
      if (inputCpf) inputCpf.value = '';
      (document.getElementById('conf-genero') as any).value = 'M';
      (document.getElementById('input-conf-rg') as any).value = '';
      (document.getElementById('input-conf-nacionalidade') as any).value = 'brasileiro(a)';
      (document.getElementById('input-conf-profissao') as any).value = '';
      (document.getElementById('conf-estado-civil') as any).value = 'solteiro';
      (document.getElementById('conf-regime-bens') as any).value = '';
      (document.getElementById('input-conf-conjuge-nome') as any).value = '';
      if (inputCpfConjuge) inputCpfConjuge.value = '';
      (document.getElementById('input-conf-conjuge-rg') as any).value = '';
      (document.getElementById('conf-conjuge-genero') as any).value = 'F';
      (document.getElementById('input-conf-conjuge-nacionalidade') as any).value = 'brasileiro(a)';
      (document.getElementById('input-conf-conjuge-profissao') as any).value = '';
      (document.getElementById('input-conf-endereco') as any).value = '';
      (document.getElementById('input-conf-matricula-imovel') as any).value = '';

      configurarMaquinadeEstadosCivil(containerForm);
      renderizarStatusAnexoMatricula(null);
      initIcons();

      setTimeout(() => {
        (document.getElementById('input-conf-nome') as any)?.focus?.();
      }, 100);
    };

    const fecharFormularioConfrontante = () => {
      if (containerForm) containerForm.classList.add('hidden');
      if (inputConfId) inputConfId.value = '';
      if (containerForm) containerForm.dataset.confrontanteId = '';
      if (selectAnuencia) selectAnuencia.value = '';
    };

    if (btnNovoConf) {
      btnNovoConf.onclick = abrirFormularioNovoConfrontante;
    }
    if (btnFecharCard) {
      btnFecharCard.onclick = fecharFormularioConfrontante;
    }
    if (btnCancelarConf) {
      btnCancelarConf.onclick = fecharFormularioConfrontante;
    }

    if (selectAnuencia) {
      selectAnuencia.addEventListener('change', async () => {
        const confIdVal = selectAnuencia.value;
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
            if (inputConfId) inputConfId.value = String(selectedConf.id);
            containerForm.dataset.confrontanteId = String(selectedConf.id);
            if (txtConfIdEdicao) txtConfIdEdicao.innerText = `ID: ${selectedConf.id}`;
            if (badgeConfStatus) {
              badgeConfStatus.innerText = 'EDIÇÃO';
              badgeConfStatus.className = 'text-[9px] font-mono font-bold px-2 py-0.5 rounded bg-mint-vibrant/10 text-mint-vibrant border border-mint-vibrant/20';
            }
            
            (document.getElementById('input-conf-nome') as any).value = selectedConf.nome || '';
            if (inputCpf) inputCpf.value = selectedConf.cpf_cnpj ? formatarCpfCnpjDinamico(selectedConf.cpf_cnpj) : '';
            (document.getElementById('conf-genero') as any).value = selectedConf.genero || 'M';
            (document.getElementById('input-conf-rg') as any).value = selectedConf.rg || '';
            (document.getElementById('input-conf-nacionalidade') as any).value = selectedConf.nacionalidade || 'brasileiro(a)';
            (document.getElementById('input-conf-profissao') as any).value = selectedConf.profissao || '';
            (document.getElementById('conf-estado-civil') as any).value = normalizarEstadoCivil(selectedConf.estado_civil);
            (document.getElementById('conf-regime-bens') as any).value = normalizarRegimeBens(selectedConf.regime_bens);
            (document.getElementById('input-conf-conjuge-nome') as any).value = selectedConf.nome_conjuge || '';
            if (inputCpfConjuge) inputCpfConjuge.value = selectedConf.cpf_conjuge ? formatarCpfCnpjDinamico(selectedConf.cpf_conjuge) : '';
            (document.getElementById('input-conf-conjuge-rg') as any).value = selectedConf.rg_conjuge || '';
            (document.getElementById('conf-conjuge-genero') as any).value = selectedConf.genero_conjuge || 'F';
            (document.getElementById('input-conf-conjuge-nacionalidade') as any).value = selectedConf.nacionalidade_conjuge || 'brasileiro(a)';
            (document.getElementById('input-conf-conjuge-profissao') as any).value = selectedConf.profissao_conjuge || '';
            (document.getElementById('input-conf-endereco') as any).value = selectedConf.endereco_completo || '';
            (document.getElementById('input-conf-matricula-imovel') as any).value = selectedConf.matricula_imovel || '';
            
            configurarMaquinadeEstadosCivil(containerForm);
            renderizarStatusAnexoMatricula(selectedConf);
            initIcons();
          }
        } catch (err) {
          console.error("Erro ao carregar qualificacoes do confrontante:", err);
          showToast("Erro ao carregar dados do confrontante.", "error");
        }
      });
    }

    const buscarPreenchimentoCpf = async (cpfVal: string) => {
      if (!cpfVal) return;
      const cpfLimpo = cpfVal.replace(/\D/g, '');
      if (cpfLimpo.length !== 11 && cpfLimpo.length !== 14) return;
      
      if (statusBuscaCpf) {
        statusBuscaCpf.innerText = 'Buscando cadastro...';
        statusBuscaCpf.classList.remove('hidden');
      }

      try {
        const res = await fetch(`${API_BASE}/confrontantes/buscar-por-cpf?cpf=${encodeURIComponent(cpfLimpo)}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.nome) {
            (document.getElementById('input-conf-nome') as any).value = data.nome || '';
            (document.getElementById('conf-genero') as any).value = data.genero || 'M';
            (document.getElementById('input-conf-rg') as any).value = data.rg || '';
            (document.getElementById('input-conf-nacionalidade') as any).value = data.nacionalidade || 'brasileiro(a)';
            (document.getElementById('input-conf-profissao') as any).value = data.profissao || '';
            (document.getElementById('conf-estado-civil') as any).value = normalizarEstadoCivil(data.estado_civil);
            (document.getElementById('conf-regime-bens') as any).value = normalizarRegimeBens(data.regime_bens);
            (document.getElementById('input-conf-conjuge-nome') as any).value = data.nome_conjuge || '';
            if (inputCpfConjuge) inputCpfConjuge.value = data.cpf_conjuge ? formatarCpfCnpjDinamico(data.cpf_conjuge) : '';
            (document.getElementById('input-conf-conjuge-rg') as any).value = data.rg_conjuge || '';
            (document.getElementById('conf-conjuge-genero') as any).value = data.genero_conjuge || 'F';
            (document.getElementById('input-conf-conjuge-nacionalidade') as any).value = data.nacionalidade_conjuge || 'brasileiro(a)';
            (document.getElementById('input-conf-conjuge-profissao') as any).value = data.profissao_conjuge || '';
            (document.getElementById('input-conf-endereco') as any).value = data.endereco_completo || '';
            if (data.matricula_imovel) {
              const inputMat = document.getElementById('input-conf-matricula-imovel') as any;
              if (inputMat && !inputMat.value.trim()) {
                inputMat.value = data.matricula_imovel;
              }
            }
            
            if (containerForm) {
              configurarMaquinadeEstadosCivil(containerForm);
            }
            
            showToast("✨ Dados de qualificação carregados automaticamente pelo CPF/CNPJ!", "success");
          }
        }
      } catch (err) {
        console.error("Erro ao buscar confrontante por CPF:", err);
      } finally {
        if (statusBuscaCpf) statusBuscaCpf.classList.add('hidden');
      }
    };

    if (inputCpf) {
      inputCpf.addEventListener('input', () => {
        inputCpf.value = formatarCpfCnpjDinamico(inputCpf.value);
        const limpo = inputCpf.value.replace(/\D/g, '');
        if (limpo.length === 11 || limpo.length === 14) {
          buscarPreenchimentoCpf(inputCpf.value);
        }
      });
      inputCpf.addEventListener('blur', () => {
        buscarPreenchimentoCpf(inputCpf.value);
      });
    }

    if (inputCpfConjuge) {
      inputCpfConjuge.addEventListener('input', () => {
        inputCpfConjuge.value = formatarCpfCnpjDinamico(inputCpfConjuge.value);
      });
    }

    const executarSalvarQualificacao = async () => {
      let confIdVal = inputConfId?.value?.trim() || containerForm?.dataset?.confrontanteId || (selectAnuencia ? selectAnuencia.value : '');
      if (confIdVal === 'lote' || confIdVal === 'novo') confIdVal = '';
      
      if (!ctx.currentLevId) {
        showToast("Nenhum levantamento ativo selecionado.", "info");
        return;
      }

      const inputNome = document.getElementById('input-conf-nome') as any;
      const nome = (inputNome?.value || '').trim();
      if (!nome) {
        showToast("O Nome Completo / Razão Social do confrontante é obrigatório.", "info");
        inputNome?.focus?.();
        return;
      }

      const payload = {
        nome: nome,
        cpf_cnpj: (document.getElementById('input-conf-cpf') as any)?.value?.trim() || null,
        genero: (document.getElementById('conf-genero') as any)?.value || 'M',
        rg: (document.getElementById('input-conf-rg') as any)?.value?.trim() || null,
        nacionalidade: (document.getElementById('input-conf-nacionalidade') as any)?.value?.trim() || 'brasileiro(a)',
        profissao: (document.getElementById('input-conf-profissao') as any)?.value?.trim() || null,
        estado_civil: (document.getElementById('conf-estado-civil') as any)?.value || null,
        regime_bens: (document.getElementById('conf-regime-bens') as any)?.value || null,
        nome_conjuge: (document.getElementById('input-conf-conjuge-nome') as any)?.value?.trim() || null,
        cpf_conjuge: (document.getElementById('input-conf-conjuge-cpf') as any)?.value?.trim() || null,
        rg_conjuge: (document.getElementById('input-conf-conjuge-rg') as any)?.value?.trim() || null,
        genero_conjuge: (document.getElementById('conf-conjuge-genero') as any)?.value || null,
        nacionalidade_conjuge: (document.getElementById('input-conf-conjuge-nacionalidade') as any)?.value?.trim() || null,
        profissao_conjuge: (document.getElementById('input-conf-conjuge-profissao') as any)?.value?.trim() || null,
        endereco_completo: (document.getElementById('input-conf-endereco') as any)?.value?.trim() || null,
        matricula_imovel: (document.getElementById('input-conf-matricula-imovel') as any)?.value?.trim() || null,
        tipo_relacao: null
      };

      if (btnSalvarConf) {
        btnSalvarConf.setAttribute('carregando', '');
        btnSalvarConf.setAttribute('disabled', '');
      }

      try {
        const url = confIdVal 
          ? `${API_BASE}/confrontantes/${confIdVal}` 
          : `${API_BASE}/levantamentos/${ctx.currentLevId}/confrontantes`;
        const method = confIdVal ? 'PUT' : 'POST';

        const res = await fetch(url, {
          method: method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok) {
          showToast(confIdVal ? "Qualificação do confrontante salva com sucesso!" : "Novo confrontante cadastrado com sucesso!", "success");
          
          await ctx.carregarConfrontantesAtivosSelect();
          await ctx.loadLevantamentoDetails();

          fecharFormularioConfrontante();
        } else {
          let errorMsg = "Erro ao salvar qualificações do confrontante.";
          if (data.detail) {
            if (Array.isArray(data.detail)) {
              errorMsg = data.detail.map((d: any) => d.msg || JSON.stringify(d)).join('; ');
            } else {
              errorMsg = String(data.detail);
            }
          } else if (data.error) {
            errorMsg = String(data.error);
          } else if (data.message) {
            errorMsg = String(data.message);
          }
          showToast(errorMsg, "error");
        }
      } catch (err) {
        console.error("Erro ao salvar qualificações:", err);
        showToast("Erro de rede ao salvar qualificações do confrontante.", "error");
      } finally {
        if (btnSalvarConf) {
          btnSalvarConf.removeAttribute('carregando');
          btnSalvarConf.removeAttribute('disabled');
        }
        initIcons();
      }
    };

    if (btnSalvarConf) {
      btnSalvarConf.onclick = executarSalvarQualificacao;
      btnSalvarConf.addEventListener('ui-click', executarSalvarQualificacao);
    }

    if (formConfrontante) {
      formConfrontante.addEventListener('submit', (e) => {
        e.preventDefault();
        executarSalvarQualificacao();
      });
    }

    if (fileInputMatricula) {
      fileInputMatricula.onchange = async (e: any) => {
        let confId = inputConfId?.value?.trim() || containerForm?.dataset?.confrontanteId || (selectAnuencia ? selectAnuencia.value : '');
        if (!confId) {
          showToast("Nenhum confrontante selecionado para anexar matrícula.", "info");
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

            const data = await res.json().catch(() => ({}));
            if (res.ok) {
              showToast("Matrícula anexada com sucesso!", "success");
              
              // Buscar o confrontante atualizado e renderizar
              const resConf = await fetch(`${API_BASE}/levantamentos/${ctx.currentLevId}/confrontantes`);
              const confs = await resConf.json();
              const updatedConf = confs.find((c: any) => String(c.id) === confId);
              if (updatedConf) {
                renderizarStatusAnexoMatricula(updatedConf);
              }
              
              await ctx.loadLevantamentoDetails();
            } else {
              showToast(data.detail || data.error || "Erro ao fazer upload da matrícula.", "error");
            }
          } catch (err) {
            console.error("Erro no upload da matrícula:", err);
            showToast("Erro de rede ao fazer upload da matrícula.", "error");
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
              
              // Detectar se a aba ou o nome do arquivo menciona mais de uma matrícula
              const matsEncontradas = ctx.matriculasList.filter((m: any) => {
                const matriculaNorm = normalizarMatriculaJS(String(m.numero_matricula));
                const abaNorm = normalizarMatriculaJS(aba.nome);
                const filenameNorm = normalizarMatriculaJS(filename);
                return matriculaNorm && (abaNorm.includes(matriculaNorm) || filenameNorm.includes(matriculaNorm));
              });

              const temUnificadaDetectada = matsEncontradas.length > 1;

              if (temUnificadaDetectada) {
                const idsUnificados = matsEncontradas.map((m: any) => m.id).join(',');
                const numsUnificados = matsEncontradas.map((m: any) => m.numero_matricula).join(' e ');
                selectHtml += `<option value="${idsUnificados}" selected class="text-mint-vibrant font-bold">✨ Gleba Unificada: Matrículas ${numsUnificados}</option>`;
              }

              // Se houver vínculos de desenho compartilhado pré-existentes, adicionar também como opção
              const matsFilhas = ctx.matriculasList.filter((m: any) => m.matricula_origem_desenho_id);
              matsFilhas.forEach((filho: any) => {
                const pai = ctx.matriculasList.find((m: any) => m.id === filho.matricula_origem_desenho_id);
                if (pai && (!temUnificadaDetectada || !matsEncontradas.some((x: any) => x.id === pai.id && matsEncontradas.some((y: any) => y.id === filho.id)))) {
                  selectHtml += `<option value="${pai.id},${filho.id}" class="text-mint-vibrant">🔗 Gleba Conjunta: Matrículas ${pai.numero_matricula} e ${filho.numero_matricula}</option>`;
                }
              });

              ctx.matriculasList.forEach((m: any) => {
                const matriculaNorm = normalizarMatriculaJS(String(m.numero_matricula));
                const abaNorm = normalizarMatriculaJS(aba.nome);
                const filenameNorm = normalizarMatriculaJS(filename);
                
                const devePreSelecionar = !temUnificadaDetectada && (
                  (matriculaNorm && abaNorm && abaNorm.includes(matriculaNorm)) ||
                  (matriculaNorm && filenameNorm && filenameNorm.includes(matriculaNorm)) ||
                  (ctx.matriculasList.length === 1)
                );
                
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

// Normalizadores para Estado Civil e Regime de Bens
export function normalizarEstadoCivil(val: string | null | undefined): string {
  if (!val) return 'solteiro';
  const v = val.toLowerCase().trim();
  if (v.includes('casad')) return 'casado';
  if (v.includes('estav') || v.includes('estáv') || v.includes('uniao')) return 'uniao_estavel';
  if (v.includes('divorc') || v.includes('divorç')) return 'divorciado';
  if (v.includes('viuv') || v.includes('viúv')) return 'viuvo';
  return 'solteiro';
}

export function normalizarRegimeBens(val: string | null | undefined): string {
  if (!val) return '';
  const v = val.toLowerCase().trim();
  if (v.includes('parcial')) return 'comunhao_parcial';
  if (v.includes('universal')) return 'comunhao_universal';
  if (v.includes('separac') || v.includes('separaç')) return 'separacao_total';
  if (v.includes('aquestos') || v.includes('participacao') || v.includes('participação')) return 'participacao_final';
  return v;
}

// Máquina de Estados Reativa para a Qualificação de Cônjuge
export function configurarMaquinadeEstadosCivil(cardElement: HTMLElement) {
  const selectEstadoCivil = cardElement.querySelector('#conf-estado-civil') as any;
  const selectRegime = cardElement.querySelector('#conf-regime-bens') as any;
  const groupConjuge = (cardElement.querySelector('#box-conjuge') || cardElement.querySelector('#group-dados-conjuge')) as HTMLElement;
  const inputConjugeNome = cardElement.querySelector('#input-conf-conjuge-nome') as any;
  const inputsCamposExtra = cardElement.querySelectorAll(
    '#input-conf-conjuge-cpf, #input-conf-conjuge-rg, #conf-conjuge-genero, #input-conf-conjuge-nacionalidade, #input-conf-conjuge-profissao'
  ) as NodeListOf<any>;

  const atualizarCampos = () => {
    if (!selectEstadoCivil || !groupConjuge) return;
    const estCivil = (selectEstadoCivil.value || '').toLowerCase().trim();
    const regime = selectRegime ? (selectRegime.value || '').toLowerCase().trim() : '';

    const precisaConjuge = estCivil.includes('casad') || estCivil.includes('estav') || estCivil.includes('estáv') || estCivil === 'uniao_estavel';

    if (!precisaConjuge) {
      if (selectRegime) {
        selectRegime.setAttribute('disabled', '');
        selectRegime.value = "";
      }
      groupConjuge.classList.add('hidden');
    } else {
      if (selectRegime) {
        selectRegime.removeAttribute('disabled');
      }
      groupConjuge.classList.remove('hidden');
      
      if (inputConjugeNome) {
        inputConjugeNome.removeAttribute('disabled');
        if (inputConjugeNome.placeholder !== undefined) {
          inputConjugeNome.placeholder = "Nome completo";
        }
      }
      
      const isSeparacao = regime.includes('separac') || regime.includes('separaç') || regime === 'separacao_total';
      inputsCamposExtra.forEach(input => {
        if (input.removeAttribute) {
          input.removeAttribute('disabled');
        } else {
          input.disabled = false;
        }
        if (input.id?.includes('cpf') && input.placeholder !== undefined) {
          input.placeholder = isSeparacao ? "CPF (Opcional na Separação)" : "000.000.000-00";
        } else if (input.id?.includes('rg') && input.placeholder !== undefined) {
          input.placeholder = isSeparacao ? "RG (Opcional na Separação)" : "RG / Órgão";
        }
      });
    }
  };

  if (selectEstadoCivil) {
    selectEstadoCivil.addEventListener('change', atualizarCampos);
    selectEstadoCivil.addEventListener('ui-selecionar', atualizarCampos);
  }
  if (selectRegime) {
    selectRegime.addEventListener('change', atualizarCampos);
    selectRegime.addEventListener('ui-selecionar', atualizarCampos);
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
