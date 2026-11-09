/**
 * frontend/src/views/mesa_trabalho/ferramenta_divisao_lotes.ts
 * Ferramenta Interativa de Divisão de Lotes e Desmembramento por Offset Paralelo à Reta de Referência.
 * Suporta divisão 50/50 e Área Definida (em hectares ou m²).
 */

import L from 'leaflet';
import { API_BASE } from '../../config';
import { showToast } from '../../utils';
import type { MesaTrabalhoContext } from './mesa_trabalho_context';

export class FerramentaDivisaoLotes {
  private ctx: MesaTrabalhoContext;
  private ativo: boolean = false;
  private executando: boolean = false;
  private pontosBase: any[] = [];
  private modo: 'AREAS_IGUAIS' | 'AREA_DEFINIDA' = 'AREAS_IGUAIS';
  private alvo: 'BASE' | 'REMANESCENTE' = 'BASE';
  private unidade: 'HA' | 'M2' = 'HA';
  private valorArea: number = 0;
  private simulacaoAtual: any = null;

  private painelElement: HTMLElement | null = null;
  private previewLayer: L.LayerGroup | null = null;

  constructor(ctx: MesaTrabalhoContext) {
    this.ctx = ctx;
  }

  public isAtivo(): boolean {
    return this.ativo;
  }

  public alternar(): void {
    if (this.ativo) this.desativar();
    else this.ativar();
  }

  public ativar(): void {
    if (this.ativo) return;
    const map = this.ctx.triagemMap;
    if (!map) {
      showToast('O mapa ainda não está pronto para a ferramenta de divisão de lotes.', 'info');
      return;
    }

    if (!this.ctx.currentMatriculaId) {
      showToast('Selecione uma matrícula ativa com perímetro fechado para realizar a divisão.', 'info');
      return;
    }

    this.ativo = true;
    this.previewLayer = L.layerGroup().addTo(map);

    // Tenta obter os 2 pontos de referência pré-selecionados
    const selecionados = this.obterPontosSelecionados();
    if (selecionados.length === 2) {
      this.pontosBase = [...selecionados];
    } else {
      this.pontosBase = [];
    }

    this.criarPainelFlutuante();

    if (this.pontosBase.length === 2) {
      this.executarSimulacao();
    } else {
      showToast('Selecione 2 vértices consecutivos da divisa base (com Ctrl+Clique na tabela ou mapa) para simular o corte.', 'info', 6000);
    }
  }

  public desativar(): void {
    if (!this.ativo) return;
    this.ativo = false;
    this.pontosBase = [];
    this.simulacaoAtual = null;

    const map = this.ctx.triagemMap;
    if (map && this.previewLayer) {
      map.removeLayer(this.previewLayer);
      this.previewLayer = null;
    }

    this.removerPainel();
  }

  private obterPontosSelecionados(): any[] {
    const todos = this.ctx.pontosList || [];
    const matId = this.ctx.currentMatriculaId;
    if (this.ctx.selectedPontoIds && this.ctx.selectedPontoIds.length >= 2) {
      const pts = this.ctx.selectedPontoIds
        .map(id => todos.find(p => String(p.id) === String(id)))
        .filter((p): p is any => Boolean(p) && (!matId || String(p.matricula_id) === String(matId)));
      return pts.slice(0, 2);
    }
    return [];
  }

  private criarPainelFlutuante(): void {
    this.removerPainel();

    const painel = document.createElement('div');
    painel.id = 'painel-flutuante-divisao-lotes';
    painel.className = 'absolute top-16 left-4 z-[500] w-[360px] bg-[#0c1510]/95 backdrop-blur-md border border-white/10 rounded-technical shadow-2xl p-4 text-white text-xs font-sans animate-in slide-in-from-left duration-200';

    painel.innerHTML = `
      <div class="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
        <div class="flex items-center gap-2">
          <i data-lucide="scissors" class="w-4 h-4 text-amber-400"></i>
          <span class="font-bold text-sm tracking-wide text-white">Divisão de Lotes por Offset</span>
        </div>
        <button id="btn-fechar-divisao" class="text-white/40 hover:text-white p-1 rounded transition-colors" title="Fechar">✕</button>
      </div>

      <!-- Referência de Base -->
      <div class="bg-black/40 border border-white/5 rounded p-2.5 mb-3">
        <div class="text-[10px] uppercase font-mono tracking-wider text-white/50 mb-1">Reta de Referência (Base)</div>
        <div id="divisao-status-referencia" class="font-semibold text-amber-400">
          ${this.obterTextoReferencia()}
        </div>
      </div>

      <!-- Modo de Divisão -->
      <div class="space-y-3 mb-3">
        <div class="text-[10px] uppercase font-mono tracking-wider text-white/50">Critério de Divisão</div>
        <div class="grid grid-cols-2 gap-2">
          <label class="flex items-center gap-2 p-2 rounded bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition">
            <input type="radio" name="modo-divisao" value="AREAS_IGUAIS" ${this.modo === 'AREAS_IGUAIS' ? 'checked' : ''} class="text-amber-500 focus:ring-0">
            <span class="font-bold">Áreas Iguais (50%)</span>
          </label>
          <label class="flex items-center gap-2 p-2 rounded bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition">
            <input type="radio" name="modo-divisao" value="AREA_DEFINIDA" ${this.modo === 'AREA_DEFINIDA' ? 'checked' : ''} class="text-amber-500 focus:ring-0">
            <span class="font-bold">Área Definida</span>
          </label>
        </div>
      </div>

      <!-- Opções de Área Definida -->
      <div id="container-area-definida" class="${this.modo === 'AREA_DEFINIDA' ? '' : 'hidden'} space-y-2 mb-3 bg-white/5 border border-white/5 p-2.5 rounded">
        <div class="flex items-center justify-between">
          <span class="text-[11px] text-white/70">Área Alvo:</span>
          <div class="flex items-center gap-1 bg-black/40 p-0.5 rounded border border-white/10 text-[10px]">
            <button id="btn-unidade-ha" class="px-2 py-0.5 rounded font-bold transition ${this.unidade === 'HA' ? 'bg-amber-500 text-black' : 'text-white/60'}">ha</button>
            <button id="btn-unidade-m2" class="px-2 py-0.5 rounded font-bold transition ${this.unidade === 'M2' ? 'bg-amber-500 text-black' : 'text-white/60'}">m²</button>
          </div>
        </div>
        <div class="flex gap-2">
          <input id="input-valor-area" type="number" step="any" min="0" placeholder="Ex: 5.0" class="flex-1 bg-black/60 border border-white/20 rounded px-2.5 py-1.5 text-white font-mono text-xs focus:border-amber-400 focus:outline-none" value="${this.valorArea > 0 ? this.valorArea : ''}">
          <button id="btn-recalcular-area" class="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 rounded font-bold text-xs transition">Calcular</button>
        </div>
        <div class="flex items-center justify-between text-[11px] pt-1 border-t border-white/5">
          <span class="text-white/60">Atribuir área ao:</span>
          <select id="select-alvo-lote" class="bg-black/60 border border-white/20 rounded px-1.5 py-0.5 text-white text-[11px] focus:outline-none">
            <option value="BASE" ${this.alvo === 'BASE' ? 'selected' : ''}>Lote da Base</option>
            <option value="REMANESCENTE" ${this.alvo === 'REMANESCENTE' ? 'selected' : ''}>Lote do Fundo</option>
          </select>
        </div>
      </div>

      <!-- Resumo da Divisão Calculada -->
      <div id="resultado-divisao-preview" class="space-y-2 mb-4">
        <div class="text-[10px] uppercase font-mono tracking-wider text-white/50">Pré-visualização do Corte</div>
        <div id="cards-resumo-lotes" class="space-y-1.5 text-[11px]">
          <div class="text-white/40 italic text-center py-2">Selecione 2 vértices da base para simular.</div>
        </div>
      </div>

      <!-- Ações -->
      <div class="flex items-center gap-2 pt-2 border-t border-white/10">
        <button id="btn-cancelar-divisao" class="w-1/3 py-2 bg-white/5 hover:bg-white/10 rounded font-bold text-white/70 transition">Cancelar</button>
        <button id="btn-confirmar-divisao" class="w-2/3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold shadow-lg transition flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed" disabled>
          <i data-lucide="check" class="w-3.5 h-3.5"></i>
          <span>Desmembrar Lote</span>
        </button>
      </div>
    `;

    const container = this.ctx.triagemMap?.getContainer()?.parentElement || document.body;
    container.appendChild(painel);
    this.painelElement = painel;

    this.vincularEventosPainel();
  }

  private vincularEventosPainel(): void {
    if (!this.painelElement) return;

    // Fechar / Cancelar
    this.painelElement.querySelector('#btn-fechar-divisao')?.addEventListener('click', () => this.desativar());
    this.painelElement.querySelector('#btn-cancelar-divisao')?.addEventListener('click', () => this.desativar());

    // Rádios de modo
    const radios = this.painelElement.querySelectorAll<HTMLInputElement>('input[name="modo-divisao"]');
    radios.forEach(r => {
      r.addEventListener('change', () => {
        this.modo = r.value as any;
        const containerDef = this.painelElement?.querySelector('#container-area-definida');
        if (containerDef) {
          if (this.modo === 'AREA_DEFINIDA') containerDef.classList.remove('hidden');
          else containerDef.classList.add('hidden');
        }
        if (this.pontosBase.length === 2) {
          this.executarSimulacao();
        }
      });
    });

    // Unidades ha / m2
    const btnHa = this.painelElement.querySelector('#btn-unidade-ha');
    const btnM2 = this.painelElement.querySelector('#btn-unidade-m2');
    btnHa?.addEventListener('click', () => {
      this.unidade = 'HA';
      btnHa.className = 'px-2 py-0.5 rounded font-bold transition bg-amber-500 text-black';
      if (btnM2) btnM2.className = 'px-2 py-0.5 rounded font-bold transition text-white/60';
    });
    btnM2?.addEventListener('click', () => {
      this.unidade = 'M2';
      btnM2.className = 'px-2 py-0.5 rounded font-bold transition bg-amber-500 text-black';
      if (btnHa) btnHa.className = 'px-2 py-0.5 rounded font-bold transition text-white/60';
    });

    // Alvo do lote
    const selectAlvo = this.painelElement.querySelector<HTMLSelectElement>('#select-alvo-lote');
    selectAlvo?.addEventListener('change', () => {
      this.alvo = selectAlvo.value as any;
      if (this.pontosBase.length === 2 && this.modo === 'AREA_DEFINIDA') {
        this.executarSimulacao();
      }
    });

    // Botão Recalcular Área
    this.painelElement.querySelector('#btn-recalcular-area')?.addEventListener('click', () => {
      const input = this.painelElement?.querySelector<HTMLInputElement>('#input-valor-area');
      const val = parseFloat(input?.value || '0');
      if (val > 0) {
        this.valorArea = val;
        this.executarSimulacao();
      } else {
        showToast('Informe um valor de área maior que zero.', 'info');
      }
    });

    // Botão Confirmar Divisão
    this.painelElement.querySelector('#btn-confirmar-divisao')?.addEventListener('click', () => {
      this.confirmarDivisao();
    });
  }

  private obterTextoReferencia(): string {
    if (this.pontosBase.length === 0) return 'Selecione 2 vértices contíguos da base';
    if (this.pontosBase.length === 1) return `Vértice 1: ${this.pontosBase[0].nome_vertice || this.pontosBase[0].id} (selecione o 2º)`;
    return `${this.pontosBase[0].nome_vertice || this.pontosBase[0].id} ➔ ${this.pontosBase[1].nome_vertice || this.pontosBase[1].id}`;
  }

  private async executarSimulacao(): Promise<void> {
    if (this.pontosBase.length < 2) return;
    const levId = this.ctx.currentLevId;
    const matId = this.ctx.currentMatriculaId;
    if (!levId || !matId) return;

    let areaAlvoM2: number | null = null;
    if (this.modo === 'AREA_DEFINIDA') {
      const input = this.painelElement?.querySelector<HTMLInputElement>('#input-valor-area');
      const val = parseFloat(input?.value || String(this.valorArea));
      if (!val || val <= 0) {
        showToast('Informe uma área alvo válida para a simulação.', 'info');
        return;
      }
      this.valorArea = val;
      areaAlvoM2 = this.unidade === 'HA' ? val * 10000.0 : val;
    }

    try {
      const res = await fetch(`${API_BASE}/levantamentos/${levId}/matriculas/${matId}/divisao-offset/simular`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ponto_base_1_id: this.pontosBase[0].id,
          ponto_base_2_id: this.pontosBase[1].id,
          modo: this.modo,
          alvo: this.alvo,
          area_alvo_m2: areaAlvoM2
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Erro ao simular divisão.');
      }

      this.simulacaoAtual = data;
      this.renderizarPreviewNoMapa(data);
      this.renderizarResumoNoPainel(data);

      const btnConfirmar = this.painelElement?.querySelector<HTMLButtonElement>('#btn-confirmar-divisao');
      if (btnConfirmar) btnConfirmar.disabled = false;
    } catch (e: any) {
      showToast(e.message || 'Falha ao simular corte.', 'error');
    }
  }

  private renderizarPreviewNoMapa(data: any): void {
    if (!this.previewLayer) return;
    this.previewLayer.clearLayers();

    const loteBase = data.lote_base;
    const loteRem = data.lote_remanescente;

    // Polígono do Lote 1 (Base - Verde)
    if (loteBase?.coordenadas_geo?.length) {
      const poly1 = L.polygon(loteBase.coordenadas_geo, {
        color: '#10b981',
        weight: 2,
        fillColor: '#10b981',
        fillOpacity: 0.25
      });
      poly1.bindTooltip(`<strong>Lote Base</strong><br>${loteBase.area_ha} ha (${loteBase.percentual}%)`, {
        permanent: true,
        direction: 'center',
        className: 'tooltip-divisao-lote-verde'
      });
      this.previewLayer.addLayer(poly1);
    }

    // Polígono do Lote 2 (Remanescente - Azul)
    if (loteRem?.coordenadas_geo?.length) {
      const poly2 = L.polygon(loteRem.coordenadas_geo, {
        color: '#3b82f6',
        weight: 2,
        fillColor: '#3b82f6',
        fillOpacity: 0.25
      });
      poly2.bindTooltip(`<strong>Lote Fundo</strong><br>${loteRem.area_ha} ha (${loteRem.percentual}%)`, {
        permanent: true,
        direction: 'center',
        className: 'tooltip-divisao-lote-azul'
      });
      this.previewLayer.addLayer(poly2);
    }

    // Linha de Corte Divisória (Amarela Pontilhada)
    if (data.pontos_corte?.length === 2) {
      const p1 = [data.pontos_corte[0].lat, data.pontos_corte[0].lon] as [number, number];
      const p2 = [data.pontos_corte[1].lat, data.pontos_corte[1].lon] as [number, number];

      const linhaCorte = L.polyline([p1, p2], {
        color: '#f59e0b',
        weight: 3,
        dashArray: '6, 6'
      });
      linhaCorte.bindTooltip(`Linha de Corte (Offset: ${data.distancia_offset_m}m)`, {
        permanent: false,
        direction: 'top'
      });
      this.previewLayer.addLayer(linhaCorte);

      // Marcadores nos dois novos vértices de corte
      [p1, p2].forEach((pos, idx) => {
        const marker = L.circleMarker(pos, {
          radius: 5,
          color: '#f59e0b',
          weight: 2,
          fillColor: '#ffffff',
          fillOpacity: 0.95
        });
        marker.bindTooltip(`Vértice de Corte ${idx + 1}`, { permanent: false });
        this.previewLayer?.addLayer(marker);
      });
    }
  }

  private renderizarResumoNoPainel(data: any): void {
    const container = this.painelElement?.querySelector('#cards-resumo-lotes');
    if (!container) return;

    container.innerHTML = `
      <div class="bg-black/40 border-l-2 border-emerald-500 p-2 rounded">
        <div class="font-bold text-emerald-400 flex justify-between">
          <span>Gleba A (Lote Base):</span>
          <span>${data.lote_base.percentual}%</span>
        </div>
        <div class="text-white/80 font-mono">${data.lote_base.area_ha} ha (${data.lote_base.area_m2.toLocaleString('pt-BR')} m²)</div>
      </div>

      <div class="bg-black/40 border-l-2 border-blue-500 p-2 rounded">
        <div class="font-bold text-blue-400 flex justify-between">
          <span>Gleba B (Lote Fundo):</span>
          <span>${data.lote_remanescente.percentual}%</span>
        </div>
        <div class="text-white/80 font-mono">${data.lote_remanescente.area_ha} ha (${data.lote_remanescente.area_m2.toLocaleString('pt-BR')} m²)</div>
      </div>

      <div class="text-[10px] text-white/50 text-right font-mono pt-1">
        Afastamento Paralelo: <strong>${data.distancia_offset_m} m</strong>
      </div>
    `;
  }

  private async confirmarDivisao(): Promise<void> {
    if (this.executando || !this.simulacaoAtual) return;
    const levId = this.ctx.currentLevId;
    const matId = this.ctx.currentMatriculaId;
    if (!levId || !matId) return;

    this.executando = true;
    showToast('Executando desmembramento e registrando novas glebas...', 'info');

    try {
      let areaAlvoM2: number | null = null;
      if (this.modo === 'AREA_DEFINIDA') {
        areaAlvoM2 = this.unidade === 'HA' ? this.valorArea * 10000.0 : this.valorArea;
      }

      const res = await fetch(`${API_BASE}/levantamentos/${levId}/matriculas/${matId}/divisao-offset/executar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ponto_base_1_id: this.pontosBase[0].id,
          ponto_base_2_id: this.pontosBase[1].id,
          modo: this.modo,
          alvo: this.alvo,
          area_alvo_m2: areaAlvoM2
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Erro ao executar desmembramento.');
      }

      showToast(data.mensagem || 'Desmembramento concluído com sucesso!', 'success', 7000);
      this.desativar();

      // Recarrega os dados da Mesa de Trabalho
      if (typeof this.ctx.loadLevantamentoDetails === 'function') {
        await this.ctx.loadLevantamentoDetails();
      } else {
        window.location.reload();
      }
    } catch (e: any) {
      showToast(e.message || 'Falha ao efetivar desmembramento.', 'error');
    } finally {
      this.executando = false;
    }
  }

  private removerPainel(): void {
    if (this.painelElement) {
      this.painelElement.remove();
      this.painelElement = null;
    }
  }
}
