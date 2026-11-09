/**
 * frontend/src/views/mesa_trabalho/ferramenta_divisao_lotes.ts
 * Ferramenta Interativa de Divisão de Lotes e Desmembramento por Offset Paralelo à Reta de Referência.
 *
 * Dois cenários:
 *  - Matrícula com perímetro próprio: divide em Gleba A + nova Gleba B (50/50 ou área definida em ha/m²).
 *  - Perímetro unificado (2 matrículas no mesmo polígono): separa o polígono entre as duas matrículas,
 *    cortando na área registrada da matrícula escolhida como "base".
 */

import L from 'leaflet';
import { API_BASE } from '../../config';
import { showToast } from '../../utils';
import type { MesaTrabalhoContext } from './mesa_trabalho_context';

type ModoDivisao = 'AREAS_IGUAIS' | 'AREA_DEFINIDA' | 'SEPARAR_MATRICULAS';

export class FerramentaDivisaoLotes {
  private ctx: MesaTrabalhoContext;
  private ativo: boolean = false;
  private executando: boolean = false;
  private pontosBase: any[] = [];
  private modo: ModoDivisao = 'AREAS_IGUAIS';
  private alvo: 'BASE' | 'REMANESCENTE' = 'BASE';
  private unidade: 'HA' | 'M2' = 'HA';
  private valorArea: number = 0;
  private matriculaBaseId: number | null = null;
  private simulacaoAtual: any = null;
  /** Corpo exato enviado na simulação: a confirmação reutiliza o mesmo, para nunca divergir do preview. */
  private corpoSimulado: any = null;
  private timerSelecao: number | null = null;
  private chaveSelecao: string = '';

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

    const { grupo } = this.obterGrupo();
    if (grupo.length === 2) {
      this.modo = 'SEPARAR_MATRICULAS';
      this.matriculaBaseId = Number(this.ctx.currentMatriculaId);
    } else if (this.modo === 'SEPARAR_MATRICULAS') {
      this.modo = 'AREAS_IGUAIS';
    }

    this.pontosBase = this.obterPontosSelecionados();
    this.chaveSelecao = this.pontosBase.map(p => p.id).join(',');

    this.criarPainelFlutuante();

    if (this.pontosBase.length === 2) {
      this.executarSimulacao();
    } else {
      showToast('Selecione 2 vértices consecutivos da divisa base (Ctrl+Clique na tabela ou no mapa).', 'info', 6000);
    }

    // Acompanha a seleção de vértices enquanto o painel está aberto
    this.timerSelecao = window.setInterval(() => this.sincronizarSelecao(), 400);
  }

  public desativar(): void {
    if (!this.ativo) return;
    this.ativo = false;
    this.pontosBase = [];
    this.simulacaoAtual = null;
    this.corpoSimulado = null;
    this.chaveSelecao = '';

    if (this.timerSelecao !== null) {
      window.clearInterval(this.timerSelecao);
      this.timerSelecao = null;
    }

    const map = this.ctx.triagemMap;
    if (map && this.previewLayer) {
      map.removeLayer(this.previewLayer);
      this.previewLayer = null;
    }

    this.removerPainel();
  }

  /** Matrícula dona do desenho e as matrículas que compartilham esse perímetro (gleba unificada). */
  private obterGrupo(): { desenhoId: number; grupo: any[] } {
    const lista = this.ctx.matriculasList || [];
    const atual = lista.find(m => String(m.id) === String(this.ctx.currentMatriculaId));
    const desenhoId = Number(atual?.matricula_origem_desenho_id || this.ctx.currentMatriculaId);
    const grupo = lista.filter(
      m => Number(m.id) === desenhoId || Number(m.matricula_origem_desenho_id) === desenhoId
    );
    return { desenhoId, grupo };
  }

  private obterPontosSelecionados(): any[] {
    const todos = this.ctx.pontosList || [];
    const { desenhoId } = this.obterGrupo();
    const ids = this.ctx.selectedPontoIds || [];
    if (ids.length !== 2) return [];
    const pts = ids
      .map(id => todos.find(p => String(p.id) === String(id)))
      .filter((p): p is any => Boolean(p) && String(p.matricula_id) === String(desenhoId));
    return pts.length === 2 ? pts : [];
  }

  /** Detecta troca de seleção feita depois de abrir o painel e refaz a simulação. */
  private sincronizarSelecao(): void {
    if (!this.ativo || this.executando) return;
    const pts = this.obterPontosSelecionados();
    const chave = pts.map(p => p.id).join(',');
    if (chave === this.chaveSelecao) return;
    this.chaveSelecao = chave;
    this.pontosBase = pts;
    this.atualizarTextoReferencia();
    if (pts.length === 2) {
      this.executarSimulacao();
    } else {
      this.invalidarSimulacao('Selecione 2 vértices consecutivos da base para simular.');
    }
  }

  private criarPainelFlutuante(): void {
    this.removerPainel();

    const { grupo } = this.obterGrupo();
    const unificado = grupo.length >= 2;
    const separavel = grupo.length === 2;

    const painel = document.createElement('div');
    painel.id = 'painel-flutuante-divisao-lotes';
    painel.className = 'absolute top-16 left-4 z-[500] w-[360px] max-h-[calc(100%-5rem)] overflow-y-auto bg-[#0c1510]/95 backdrop-blur-md border border-white/10 rounded-technical shadow-2xl p-4 text-white text-xs font-sans animate-in slide-in-from-left duration-200';

    const opcoesMatriculaBase = grupo
      .map(m => `<option value="${m.id}" ${Number(m.id) === this.matriculaBaseId ? 'selected' : ''}>${m.numero_matricula} (${Number(m.area_ha || 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 })} ha)</option>`)
      .join('');

    const blocoModo = !unificado
      ? `
        <div class="grid grid-cols-2 gap-2">
          <label class="flex items-center gap-2 p-2 rounded bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition">
            <input type="radio" name="modo-divisao" value="AREAS_IGUAIS" ${this.modo === 'AREAS_IGUAIS' ? 'checked' : ''} class="text-amber-500 focus:ring-0">
            <span class="font-bold">Áreas Iguais (50%)</span>
          </label>
          <label class="flex items-center gap-2 p-2 rounded bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 transition">
            <input type="radio" name="modo-divisao" value="AREA_DEFINIDA" ${this.modo === 'AREA_DEFINIDA' ? 'checked' : ''} class="text-amber-500 focus:ring-0">
            <span class="font-bold">Área Definida</span>
          </label>
        </div>`
      : separavel
        ? `
        <div class="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 leading-snug">
          Perímetro unificado com 2 matrículas. O corte separa o polígono usando a <strong>área registrada</strong> da matrícula escolhida abaixo.
        </div>
        <div class="flex items-center justify-between text-[11px]">
          <span class="text-white/60">Matrícula do lote da base:</span>
          <select id="select-matricula-base" class="bg-black/60 border border-white/20 rounded px-1.5 py-0.5 text-white text-[11px] focus:outline-none">${opcoesMatriculaBase}</select>
        </div>`
        : `
        <div class="p-2 rounded bg-red-500/10 border border-red-500/30 text-red-300 leading-snug">
          Este perímetro unificado possui ${grupo.length} matrículas. A separação automática suporta exatamente 2.
        </div>`;

    painel.innerHTML = `
      <div class="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
        <div class="flex items-center gap-2">
          <i data-lucide="scissors" class="w-4 h-4 text-amber-400"></i>
          <span class="font-bold text-sm tracking-wide text-white">${unificado ? 'Separar Matrículas do Perímetro' : 'Divisão de Lotes por Offset'}</span>
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
        <div class="text-[10px] uppercase font-mono tracking-wider text-white/50">${unificado ? 'Separação' : 'Critério de Divisão'}</div>
        ${blocoModo}
      </div>

      <!-- Opções de Área Definida -->
      <div id="container-area-definida" class="${this.modo === 'AREA_DEFINIDA' ? '' : 'hidden'} space-y-2 mb-3 bg-white/5 border border-white/5 p-2.5 rounded">
        <div class="flex items-center justify-between">
          <span class="text-[11px] text-white/70">Área Alvo:</span>
          <div class="flex items-center gap-1 bg-black/40 p-0.5 rounded border border-white/10 text-[10px]">
            <button id="btn-unidade-ha" type="button" class="px-2 py-0.5 rounded font-bold transition ${this.unidade === 'HA' ? 'bg-amber-500 text-black' : 'text-white/60'}">ha</button>
            <button id="btn-unidade-m2" type="button" class="px-2 py-0.5 rounded font-bold transition ${this.unidade === 'M2' ? 'bg-amber-500 text-black' : 'text-white/60'}">m²</button>
          </div>
        </div>
        <div class="flex gap-2">
          <input id="input-valor-area" type="number" step="any" min="0" placeholder="Ex: 5.0" class="flex-1 bg-black/60 border border-white/20 rounded px-2.5 py-1.5 text-white font-mono text-xs focus:border-amber-400 focus:outline-none" value="${this.valorArea > 0 ? this.valorArea : ''}">
          <button id="btn-recalcular-area" type="button" class="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 rounded font-bold text-xs transition">Calcular</button>
        </div>
        <div class="flex items-center justify-between text-[11px] pt-1 border-t border-white/5">
          <span class="text-white/60">Atribuir área ao:</span>
          <select id="select-alvo-lote" class="bg-black/60 border border-white/20 rounded px-1.5 py-0.5 text-white text-[11px] focus:outline-none">
            <option value="BASE" ${this.alvo === 'BASE' ? 'selected' : ''}>Lote da Base</option>
            <option value="REMANESCENTE" ${this.alvo === 'REMANESCENTE' ? 'selected' : ''}>Lote do Fundo</option>
          </select>
        </div>
      </div>

      <!-- Nomes opcionais (apenas desmembramento simples) -->
      <div id="container-nomes-glebas" class="${unificado ? 'hidden' : ''} space-y-1.5 mb-3">
        <div class="text-[10px] uppercase font-mono tracking-wider text-white/50">Nomes (opcional)</div>
        <input id="input-nome-gleba-a" type="text" placeholder="Gleba A: manter número atual" class="w-full bg-black/60 border border-white/20 rounded px-2.5 py-1.5 text-white text-xs focus:border-amber-400 focus:outline-none">
        <input id="input-nome-gleba-b" type="text" placeholder="Gleba B: nº da matrícula - GLEBA B" class="w-full bg-black/60 border border-white/20 rounded px-2.5 py-1.5 text-white text-xs focus:border-amber-400 focus:outline-none">
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
        <button id="btn-cancelar-divisao" type="button" class="w-1/3 py-2 bg-white/5 hover:bg-white/10 rounded font-bold text-white/70 transition">Cancelar</button>
        <button id="btn-confirmar-divisao" type="button" class="w-2/3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold shadow-lg transition flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed" disabled>
          <i data-lucide="check" class="w-3.5 h-3.5"></i>
          <span>${unificado ? 'Separar Matrículas' : 'Desmembrar Lote'}</span>
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
    const painel = this.painelElement;

    // Fechar / Cancelar
    painel.querySelector('#btn-fechar-divisao')?.addEventListener('click', () => this.desativar());
    painel.querySelector('#btn-cancelar-divisao')?.addEventListener('click', () => this.desativar());

    // Rádios de modo
    painel.querySelectorAll<HTMLInputElement>('input[name="modo-divisao"]').forEach(r => {
      r.addEventListener('change', () => {
        this.modo = r.value as ModoDivisao;
        const containerDef = painel.querySelector('#container-area-definida');
        containerDef?.classList.toggle('hidden', this.modo !== 'AREA_DEFINIDA');
        this.reSimular();
      });
    });

    // Matrícula do lote da base (separação)
    const selectMat = painel.querySelector<HTMLSelectElement>('#select-matricula-base');
    selectMat?.addEventListener('change', () => {
      this.matriculaBaseId = Number(selectMat.value);
      this.reSimular();
    });

    // Unidades ha / m2
    const btnHa = painel.querySelector<HTMLElement>('#btn-unidade-ha');
    const btnM2 = painel.querySelector<HTMLElement>('#btn-unidade-m2');
    const marcarUnidade = (u: 'HA' | 'M2') => {
      this.unidade = u;
      if (btnHa) btnHa.className = `px-2 py-0.5 rounded font-bold transition ${u === 'HA' ? 'bg-amber-500 text-black' : 'text-white/60'}`;
      if (btnM2) btnM2.className = `px-2 py-0.5 rounded font-bold transition ${u === 'M2' ? 'bg-amber-500 text-black' : 'text-white/60'}`;
      this.reSimular();
    };
    btnHa?.addEventListener('click', () => marcarUnidade('HA'));
    btnM2?.addEventListener('click', () => marcarUnidade('M2'));

    // Alvo do lote
    const selectAlvo = painel.querySelector<HTMLSelectElement>('#select-alvo-lote');
    selectAlvo?.addEventListener('change', () => {
      this.alvo = selectAlvo.value as any;
      this.reSimular();
    });

    // Valor digitado invalida o preview até "Calcular"
    painel.querySelector('#input-valor-area')?.addEventListener('input', () => {
      this.invalidarSimulacao('Clique em Calcular para atualizar a pré-visualização.');
    });

    // Botão Recalcular Área
    painel.querySelector('#btn-recalcular-area')?.addEventListener('click', () => {
      const input = painel.querySelector<HTMLInputElement>('#input-valor-area');
      const val = parseFloat(input?.value || '0');
      if (val > 0) {
        this.valorArea = val;
        this.executarSimulacao();
      } else {
        showToast('Informe um valor de área maior que zero.', 'info');
      }
    });

    // Botão Confirmar Divisão
    painel.querySelector('#btn-confirmar-divisao')?.addEventListener('click', () => {
      this.confirmarDivisao();
    });
  }

  /** Qualquer mudança de parâmetro descarta o preview anterior e, se possível, simula de novo. */
  private reSimular(): void {
    this.invalidarSimulacao('Atualizando pré-visualização...');
    if (this.pontosBase.length !== 2) return;
    if (this.modo === 'AREA_DEFINIDA' && !(this.valorArea > 0)) {
      this.invalidarSimulacao('Informe a área alvo e clique em Calcular.');
      return;
    }
    this.executarSimulacao();
  }

  private invalidarSimulacao(mensagem: string): void {
    this.simulacaoAtual = null;
    this.corpoSimulado = null;
    this.previewLayer?.clearLayers();
    const btn = this.painelElement?.querySelector<HTMLButtonElement>('#btn-confirmar-divisao');
    if (btn) btn.disabled = true;
    const cards = this.painelElement?.querySelector('#cards-resumo-lotes');
    if (cards) cards.innerHTML = `<div class="text-white/40 italic text-center py-2">${mensagem}</div>`;
  }

  private obterTextoReferencia(): string {
    if (this.pontosBase.length === 0) return 'Selecione 2 vértices consecutivos da base';
    if (this.pontosBase.length === 1) return `Vértice 1: ${this.pontosBase[0].nome_vertice || this.pontosBase[0].id} (selecione o 2º)`;
    return `${this.pontosBase[0].nome_vertice || this.pontosBase[0].id} ➔ ${this.pontosBase[1].nome_vertice || this.pontosBase[1].id}`;
  }

  private atualizarTextoReferencia(): void {
    const el = this.painelElement?.querySelector('#divisao-status-referencia');
    if (el) el.textContent = this.obterTextoReferencia();
  }

  private montarCorpo(): any | null {
    let areaAlvoM2: number | null = null;
    if (this.modo === 'AREA_DEFINIDA') {
      const input = this.painelElement?.querySelector<HTMLInputElement>('#input-valor-area');
      const val = parseFloat(input?.value || String(this.valorArea));
      if (!val || val <= 0) {
        showToast('Informe uma área alvo válida para a simulação.', 'info');
        return null;
      }
      this.valorArea = val;
      areaAlvoM2 = this.unidade === 'HA' ? val * 10000.0 : val;
    }
    return {
      ponto_base_1_id: this.pontosBase[0].id,
      ponto_base_2_id: this.pontosBase[1].id,
      modo: this.modo,
      alvo: this.alvo,
      area_alvo_m2: areaAlvoM2,
      matricula_base_id: this.modo === 'SEPARAR_MATRICULAS' ? this.matriculaBaseId : null,
    };
  }

  private async executarSimulacao(): Promise<void> {
    if (this.pontosBase.length < 2) return;
    const levId = this.ctx.currentLevId;
    const matId = this.ctx.currentMatriculaId;
    if (!levId || !matId) return;

    const corpo = this.montarCorpo();
    if (!corpo) return;

    this.simulacaoAtual = null;
    this.corpoSimulado = null;
    const btnConfirmar = this.painelElement?.querySelector<HTMLButtonElement>('#btn-confirmar-divisao');
    if (btnConfirmar) btnConfirmar.disabled = true;

    try {
      const res = await fetch(`${API_BASE}/levantamentos/${levId}/matriculas/${matId}/divisao-offset/simular`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Erro ao simular divisão.');
      }
      // Ignora resposta de uma simulação que já foi substituída por outra
      if (!this.ativo || JSON.stringify(this.montarCorpoSilencioso()) !== JSON.stringify(corpo)) return;

      this.simulacaoAtual = data;
      this.corpoSimulado = corpo;
      this.renderizarPreviewNoMapa(data);
      this.renderizarResumoNoPainel(data);
      if (btnConfirmar) btnConfirmar.disabled = false;
    } catch (e: any) {
      this.invalidarSimulacao('Não foi possível simular este corte.');
      showToast(e.message || 'Falha ao simular corte.', 'error');
    }
  }

  /** Mesmo corpo de montarCorpo, sem toasts (usado só para comparar parâmetros atuais). */
  private montarCorpoSilencioso(): any {
    const val = this.valorArea;
    return {
      ponto_base_1_id: this.pontosBase[0]?.id,
      ponto_base_2_id: this.pontosBase[1]?.id,
      modo: this.modo,
      alvo: this.alvo,
      area_alvo_m2: this.modo === 'AREA_DEFINIDA' ? (this.unidade === 'HA' ? val * 10000.0 : val) : null,
      matricula_base_id: this.modo === 'SEPARAR_MATRICULAS' ? this.matriculaBaseId : null,
    };
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
        fillOpacity: 0.25,
      });
      poly1.bindTooltip(`<strong>${loteBase.matricula ? `Mat. ${loteBase.matricula}` : 'Lote Base'}</strong><br>${loteBase.area_ha} ha (${loteBase.percentual}%)`, {
        permanent: true,
        direction: 'center',
        className: 'tooltip-divisao-lote-verde',
      });
      this.previewLayer.addLayer(poly1);
    }

    // Polígono do Lote 2 (Remanescente - Azul)
    if (loteRem?.coordenadas_geo?.length) {
      const poly2 = L.polygon(loteRem.coordenadas_geo, {
        color: '#3b82f6',
        weight: 2,
        fillColor: '#3b82f6',
        fillOpacity: 0.25,
      });
      poly2.bindTooltip(`<strong>${loteRem.matricula ? `Mat. ${loteRem.matricula}` : 'Lote Fundo'}</strong><br>${loteRem.area_ha} ha (${loteRem.percentual}%)`, {
        permanent: true,
        direction: 'center',
        className: 'tooltip-divisao-lote-azul',
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
        dashArray: '6, 6',
      });
      linhaCorte.bindTooltip(`Linha de Corte (Offset: ${data.distancia_offset_m}m)`, {
        permanent: false,
        direction: 'top',
      });
      this.previewLayer.addLayer(linhaCorte);

      // Marcadores nos dois vértices de corte
      [p1, p2].forEach((pos, idx) => {
        const marker = L.circleMarker(pos, {
          radius: 5,
          color: '#f59e0b',
          weight: 2,
          fillColor: '#ffffff',
          fillOpacity: 0.95,
        });
        marker.bindTooltip(`Vértice de Corte ${idx + 1}`, { permanent: false });
        this.previewLayer?.addLayer(marker);
      });
    }
  }

  private renderizarResumoNoPainel(data: any): void {
    const container = this.painelElement?.querySelector('#cards-resumo-lotes');
    if (!container) return;

    const separacao = data.tipo_operacao === 'SEPARACAO';
    const rotuloA = separacao ? `Mat. ${data.lote_base.matricula}` : 'Gleba A (Lote Base)';
    const rotuloB = separacao ? `Mat. ${data.lote_remanescente.matricula}` : 'Gleba B (Lote Fundo)';
    const avisos: string[] = Array.isArray(data.avisos) ? data.avisos : [];

    container.innerHTML = `
      <div class="bg-black/40 border-l-2 border-emerald-500 p-2 rounded">
        <div class="font-bold text-emerald-400 flex justify-between">
          <span>${rotuloA}:</span>
          <span>${data.lote_base.percentual}%</span>
        </div>
        <div class="text-white/80 font-mono">${data.lote_base.area_ha} ha (${data.lote_base.area_m2.toLocaleString('pt-BR')} m²)</div>
      </div>

      <div class="bg-black/40 border-l-2 border-blue-500 p-2 rounded">
        <div class="font-bold text-blue-400 flex justify-between">
          <span>${rotuloB}:</span>
          <span>${data.lote_remanescente.percentual}%</span>
        </div>
        <div class="text-white/80 font-mono">${data.lote_remanescente.area_ha} ha (${data.lote_remanescente.area_m2.toLocaleString('pt-BR')} m²)</div>
      </div>

      ${avisos.map(a => `<div class="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 leading-snug">${a}</div>`).join('')}

      <div class="text-[10px] text-white/50 text-right font-mono pt-1">
        Afastamento Paralelo: <strong>${data.distancia_offset_m} m</strong>
      </div>
    `;
  }

  private async confirmarDivisao(): Promise<void> {
    if (this.executando || !this.simulacaoAtual || !this.corpoSimulado) return;
    const levId = this.ctx.currentLevId;
    const matId = this.ctx.currentMatriculaId;
    if (!levId || !matId) return;

    // Usa exatamente os parâmetros que geraram o preview aprovado
    const corpo: any = { ...this.corpoSimulado };
    if (corpo.modo !== 'SEPARAR_MATRICULAS') {
      const nomeA = this.painelElement?.querySelector<HTMLInputElement>('#input-nome-gleba-a')?.value.trim();
      const nomeB = this.painelElement?.querySelector<HTMLInputElement>('#input-nome-gleba-b')?.value.trim();
      if (nomeA) corpo.nome_gleba_a = nomeA;
      if (nomeB) corpo.nome_gleba_b = nomeB;
    }

    this.executando = true;
    const btn = this.painelElement?.querySelector<HTMLButtonElement>('#btn-confirmar-divisao');
    if (btn) btn.disabled = true;
    showToast('Executando a divisão e atualizando as matrículas...', 'info');

    try {
      const res = await fetch(`${API_BASE}/levantamentos/${levId}/matriculas/${matId}/divisao-offset/executar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Erro ao executar a divisão.');
      }

      showToast(data.mensagem || 'Divisão concluída com sucesso!', 'success', 7000);
      this.ctx.selectedPontoIds = [];
      this.desativar();

      // Recarrega os dados da Mesa de Trabalho
      if (typeof this.ctx.loadLevantamentoDetails === 'function') {
        await this.ctx.loadLevantamentoDetails();
      } else {
        window.location.reload();
      }
    } catch (e: any) {
      if (btn) btn.disabled = false;
      showToast(e.message || 'Falha ao efetivar a divisão.', 'error');
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
