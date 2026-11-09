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

    const opcoesMatriculaBase = grupo
      .map(m => `<option value="${m.id}" ${Number(m.id) === this.matriculaBaseId ? 'selected' : ''}>${m.numero_matricula} (${Number(m.area_ha || 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 })} ha)</option>`)
      .join('');

    const blocoModo = !unificado
      ? `
        <div class="dl-row">
          <label class="dl-radio"><input type="radio" name="modo-divisao" value="AREAS_IGUAIS" ${this.modo === 'AREAS_IGUAIS' ? 'checked' : ''}><span>Áreas iguais (50%)</span></label>
          <label class="dl-radio"><input type="radio" name="modo-divisao" value="AREA_DEFINIDA" ${this.modo === 'AREA_DEFINIDA' ? 'checked' : ''}><span>Área definida</span></label>
        </div>`
      : separavel
        ? `
        <div class="dl-aviso dl-aviso-amber">Perímetro unificado com 2 matrículas. O corte usa a <b>área registrada</b> da matrícula escolhida.</div>
        <div class="dl-row dl-between">
          <span class="dl-muted">Matrícula da base:</span>
          <select id="select-matricula-base" class="dl-input dl-auto">${opcoesMatriculaBase}</select>
        </div>`
        : `<div class="dl-aviso dl-aviso-red">Este perímetro unificado possui ${grupo.length} matrículas. A separação automática suporta exatamente 2.</div>`;

    painel.innerHTML = `
      <style>
        #painel-flutuante-divisao-lotes * { box-sizing: border-box; }
        #painel-flutuante-divisao-lotes .dl-head { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-bottom:1px solid rgba(255,255,255,.12); }
        #painel-flutuante-divisao-lotes .dl-title { font-weight:700; font-size:13px; color:#fff; }
        #painel-flutuante-divisao-lotes .dl-close { background:transparent; border:0; color:rgba(255,255,255,.55); font-size:16px; cursor:pointer; padding:2px 6px; line-height:1; width:auto; height:auto; }
        #painel-flutuante-divisao-lotes .dl-close:hover { color:#fff; }
        #painel-flutuante-divisao-lotes .dl-body { padding:10px 12px; overflow-y:auto; flex:1 1 auto; min-height:0; display:flex; flex-direction:column; gap:10px; }
        #painel-flutuante-divisao-lotes .dl-foot { display:flex; gap:8px; padding:10px 12px; border-top:1px solid rgba(255,255,255,.12); }
        #painel-flutuante-divisao-lotes .dl-label { font-size:10px; text-transform:uppercase; letter-spacing:.06em; color:rgba(255,255,255,.5); margin-bottom:4px; font-family:ui-monospace,monospace; }
        #painel-flutuante-divisao-lotes .dl-box { background:rgba(0,0,0,.35); border:1px solid rgba(255,255,255,.08); border-radius:6px; padding:8px; }
        #painel-flutuante-divisao-lotes .dl-ref { color:#fbbf24; font-weight:600; }
        #painel-flutuante-divisao-lotes .dl-row { display:flex; gap:8px; align-items:center; }
        #painel-flutuante-divisao-lotes .dl-between { justify-content:space-between; }
        #painel-flutuante-divisao-lotes .dl-radio { flex:1; display:flex; align-items:center; gap:6px; padding:7px 8px; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12); border-radius:6px; cursor:pointer; font-weight:600; }
        #painel-flutuante-divisao-lotes .dl-radio input { accent-color:#f59e0b; margin:0; }
        #painel-flutuante-divisao-lotes .dl-muted { color:rgba(255,255,255,.6); }
        #painel-flutuante-divisao-lotes .dl-input { width:100%; background:rgba(0,0,0,.55); border:1px solid rgba(255,255,255,.22); border-radius:6px; color:#fff; padding:6px 8px; font-size:12px; }
        #painel-flutuante-divisao-lotes .dl-input:focus { outline:none; border-color:#fbbf24; }
        #painel-flutuante-divisao-lotes .dl-auto { width:auto; }
        #painel-flutuante-divisao-lotes .dl-btn { border:1px solid rgba(255,255,255,.18); background:rgba(255,255,255,.08); color:rgba(255,255,255,.8); border-radius:6px; padding:6px 12px; font-weight:700; font-size:12px; cursor:pointer; width:auto; height:auto; }
        #painel-flutuante-divisao-lotes .dl-btn:hover { background:rgba(255,255,255,.16); }
        #painel-flutuante-divisao-lotes .dl-btn-amber { background:rgba(245,158,11,.2); border-color:rgba(245,158,11,.4); color:#fbbf24; }
        #painel-flutuante-divisao-lotes .dl-btn-on { background:#f59e0b; border-color:#f59e0b; color:#000; }
        #painel-flutuante-divisao-lotes .dl-btn-ok { flex:1; background:#059669; border-color:#059669; color:#fff; padding:9px 12px; }
        #painel-flutuante-divisao-lotes .dl-btn-ok:hover:not(:disabled) { background:#10b981; }
        #painel-flutuante-divisao-lotes .dl-btn:disabled { opacity:.4; cursor:not-allowed; }
        #painel-flutuante-divisao-lotes .dl-units { display:flex; gap:2px; }
        #painel-flutuante-divisao-lotes .dl-units .dl-btn { padding:3px 10px; }
        #painel-flutuante-divisao-lotes .dl-aviso { padding:8px; border-radius:6px; line-height:1.35; }
        #painel-flutuante-divisao-lotes .dl-aviso-amber { background:rgba(245,158,11,.12); border:1px solid rgba(245,158,11,.35); color:#fcd34d; }
        #painel-flutuante-divisao-lotes .dl-aviso-red { background:rgba(239,68,68,.12); border:1px solid rgba(239,68,68,.35); color:#fca5a5; }
        #painel-flutuante-divisao-lotes .dl-card { background:rgba(0,0,0,.35); border-left:3px solid; border-radius:6px; padding:7px 8px; margin-bottom:6px; }
        #painel-flutuante-divisao-lotes .dl-card-a { border-color:#10b981; }
        #painel-flutuante-divisao-lotes .dl-card-b { border-color:#3b82f6; }
        #painel-flutuante-divisao-lotes .dl-card-t { display:flex; justify-content:space-between; font-weight:700; }
        #painel-flutuante-divisao-lotes .dl-card-a .dl-card-t { color:#34d399; }
        #painel-flutuante-divisao-lotes .dl-card-b .dl-card-t { color:#60a5fa; }
        #painel-flutuante-divisao-lotes .dl-mono { font-family:ui-monospace,monospace; color:rgba(255,255,255,.85); }
        #painel-flutuante-divisao-lotes .dl-empty { color:rgba(255,255,255,.45); font-style:italic; text-align:center; padding:6px 0; }
        #painel-flutuante-divisao-lotes .dl-hidden { display:none !important; }
        #painel-flutuante-divisao-lotes .dl-stack { display:flex; flex-direction:column; gap:6px; }
      </style>

      <div class="dl-head">
        <span class="dl-title">✂ ${unificado ? 'Separar Matrículas do Perímetro' : 'Divisão de Lotes por Offset'}</span>
        <button id="btn-fechar-divisao" type="button" class="dl-close" title="Fechar">✕</button>
      </div>

      <div class="dl-body">
        <div class="dl-box">
          <div class="dl-label">Reta de referência (base)</div>
          <div id="divisao-status-referencia" class="dl-ref">${this.obterTextoReferencia()}</div>
        </div>

        <div>
          <div class="dl-label">${unificado ? 'Separação' : 'Critério de divisão'}</div>
          <div class="dl-stack">${blocoModo}</div>
        </div>

        <div id="container-area-definida" class="dl-box dl-stack ${this.modo === 'AREA_DEFINIDA' ? '' : 'dl-hidden'}">
          <div class="dl-row dl-between">
            <span class="dl-muted">Área alvo:</span>
            <div class="dl-units">
              <button id="btn-unidade-ha" type="button" class="dl-btn ${this.unidade === 'HA' ? 'dl-btn-on' : ''}">ha</button>
              <button id="btn-unidade-m2" type="button" class="dl-btn ${this.unidade === 'M2' ? 'dl-btn-on' : ''}">m²</button>
            </div>
          </div>
          <div class="dl-row">
            <input id="input-valor-area" type="number" step="any" min="0" placeholder="Ex: 5.0" class="dl-input" value="${this.valorArea > 0 ? this.valorArea : ''}">
            <button id="btn-recalcular-area" type="button" class="dl-btn dl-btn-amber">Calcular</button>
          </div>
          <div class="dl-row dl-between">
            <span class="dl-muted">Atribuir área ao:</span>
            <select id="select-alvo-lote" class="dl-input dl-auto">
              <option value="BASE" ${this.alvo === 'BASE' ? 'selected' : ''}>Lote da base</option>
              <option value="REMANESCENTE" ${this.alvo === 'REMANESCENTE' ? 'selected' : ''}>Lote do fundo</option>
            </select>
          </div>
        </div>

        <div id="container-nomes-glebas" class="${unificado ? 'dl-hidden' : ''}">
          <div class="dl-label">Nomes (opcional)</div>
          <div class="dl-stack">
            <input id="input-nome-gleba-a" type="text" placeholder="Gleba A: manter número atual" class="dl-input">
            <input id="input-nome-gleba-b" type="text" placeholder="Gleba B: nº da matrícula - GLEBA B" class="dl-input">
          </div>
        </div>

        <div>
          <div class="dl-label">Pré-visualização do corte</div>
          <div id="cards-resumo-lotes">
            <div class="dl-empty">Selecione 2 vértices da base para simular.</div>
          </div>
        </div>
      </div>

      <div class="dl-foot">
        <button id="btn-cancelar-divisao" type="button" class="dl-btn">Cancelar</button>
        <button id="btn-confirmar-divisao" type="button" class="dl-btn dl-btn-ok" disabled>${unificado ? 'Separar matrículas' : 'Desmembrar lote'}</button>
      </div>
    `;

    // Estilo essencial inline: o painel não pode depender de classes utilitárias geradas em build
    Object.assign(painel.style, {
      position: 'absolute',
      top: '64px',
      left: '12px',
      zIndex: '1000',
      width: '320px',
      maxHeight: 'calc(100% - 84px)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      boxSizing: 'border-box',
      padding: '0',
      background: 'rgba(12, 21, 16, 0.96)',
      border: '1px solid rgba(255, 255, 255, 0.12)',
      borderRadius: '8px',
      boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
      color: '#fff',
      fontSize: '12px',
      lineHeight: '1.35',
    } as Partial<CSSStyleDeclaration>);

    // Dentro do contêiner do mapa (referência do posicionamento), sem repassar cliques/scroll ao Leaflet
    const container = this.ctx.triagemMap?.getContainer() || document.body;
    container.appendChild(painel);
    L.DomEvent.disableClickPropagation(painel);
    L.DomEvent.disableScrollPropagation(painel);
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
        containerDef?.classList.toggle('dl-hidden', this.modo !== 'AREA_DEFINIDA');
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
      btnHa?.classList.toggle('dl-btn-on', u === 'HA');
      btnM2?.classList.toggle('dl-btn-on', u === 'M2');
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
    if (cards) cards.innerHTML = `<div class="dl-empty">${mensagem}</div>`;
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
      <div class="dl-card dl-card-a">
        <div class="dl-card-t"><span>${rotuloA}</span><span>${data.lote_base.percentual}%</span></div>
        <div class="dl-mono">${data.lote_base.area_ha} ha (${data.lote_base.area_m2.toLocaleString('pt-BR')} m²)</div>
      </div>
      <div class="dl-card dl-card-b">
        <div class="dl-card-t"><span>${rotuloB}</span><span>${data.lote_remanescente.percentual}%</span></div>
        <div class="dl-mono">${data.lote_remanescente.area_ha} ha (${data.lote_remanescente.area_m2.toLocaleString('pt-BR')} m²)</div>
      </div>
      ${avisos.map(a => `<div class="dl-aviso dl-aviso-amber" style="margin-bottom:6px">${a}</div>`).join('')}
      <div class="dl-mono" style="text-align:right;font-size:11px;opacity:.7">Afastamento paralelo: <b>${data.distancia_offset_m} m</b></div>
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
