import { showToast } from '../../utils';
import type { MesaTrabalhoContext } from './mesa_trabalho_context';

export interface PontoSnapshot {
  id: number;
  ordem_caminhamento?: number | null;
  ignorar_poligono?: number | null;
  sequencia_travada_id?: string | null;
  tipo_ponto?: string;
  tipo?: string;
  nome_vertice?: string;
  matricula_id?: number | null;
}

export interface HistoricoSnapshot {
  timestamp: number;
  descricao: string;
  pontos: PontoSnapshot[];
}

export class GerenciadorHistoricoMesa {
  private ctx: MesaTrabalhoContext;
  private undoStack: HistoricoSnapshot[] = [];
  private redoStack: HistoricoSnapshot[] = [];
  private maxHistory: number = 50;

  constructor(ctx: MesaTrabalhoContext) {
    this.ctx = ctx;
  }

  private criarSnapshot(descricao: string): HistoricoSnapshot {
    const pontos = (this.ctx.pontosList || []).map(p => ({
      id: p.id,
      ordem_caminhamento: p.ordem_caminhamento,
      ignorar_poligono: p.ignorar_poligono,
      sequencia_travada_id: p.sequencia_travada_id,
      tipo_ponto: p.tipo_ponto,
      tipo: p.tipo,
      nome_vertice: p.nome_vertice,
      matricula_id: p.matricula_id
    }));

    return {
      timestamp: Date.now(),
      descricao,
      pontos
    };
  }

  public salvarEstado(descricao: string): void {
    const snapshot = this.criarSnapshot(descricao);
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    // Nova ação limpa a pilha de redo
    this.redoStack = [];
    this.atualizarBotoesUI();
  }

  public desfazer(): boolean {
    if (this.undoStack.length === 0) {
      showToast("Nada para desfazer", "info", 1500);
      return false;
    }

    // Salva o estado atual na pilha de redo
    const estadoAtual = this.criarSnapshot("Estado antes de desfazer");
    this.redoStack.push(estadoAtual);

    const snapshotAnterior = this.undoStack.pop()!;
    this.aplicarSnapshot(snapshotAnterior);

    showToast(`Desfeito: ${snapshotAnterior.descricao} (Ctrl+Z)`, "info", 2500);
    this.atualizarBotoesUI();
    return true;
  }

  public refazer(): boolean {
    if (this.redoStack.length === 0) {
      showToast("Nada para refazer", "info", 1500);
      return false;
    }

    const estadoAtual = this.criarSnapshot("Estado antes de refazer");
    this.undoStack.push(estadoAtual);

    const proximoSnapshot = this.redoStack.pop()!;
    this.aplicarSnapshot(proximoSnapshot);

    showToast(`Refeito: ${proximoSnapshot.descricao} (Ctrl+Y)`, "info", 2500);
    this.atualizarBotoesUI();
    return true;
  }

  private aplicarSnapshot(snapshot: HistoricoSnapshot): void {
    if (!this.ctx.pontosList) return;

    const mapSnapshot = new Map<number, PontoSnapshot>();
    snapshot.pontos.forEach(p => mapSnapshot.set(p.id, p));

    this.ctx.pontosList.forEach(pt => {
      const snap = mapSnapshot.get(pt.id);
      if (snap) {
        pt.ordem_caminhamento = snap.ordem_caminhamento;
        pt.ignorar_poligono = snap.ignorar_poligono;
        pt.sequencia_travada_id = snap.sequencia_travada_id;
        if (snap.tipo_ponto !== undefined) pt.tipo_ponto = snap.tipo_ponto;
        if (snap.tipo !== undefined) pt.tipo = snap.tipo;
        if (snap.nome_vertice !== undefined) pt.nome_vertice = snap.nome_vertice;
      }
    });

    // Notifica UI e mapa
    if (this.ctx.renderListaReordenarSimplificada) {
      this.ctx.renderListaReordenarSimplificada();
    }
    if (this.ctx.atualizarPolilinhaMapaTemp) {
      this.ctx.atualizarPolilinhaMapaTemp();
    }
    if (this.ctx.renderMatriculaDados) {
      this.ctx.renderMatriculaDados();
    }
    if (this.ctx.salvarRascunhoLocal) {
      this.ctx.salvarRascunhoLocal();
    }

    if (this.ctx.modoCliqueSequencialAtivo && this.ctx.obterPontosParaOrdenacao) {
      const pontosMat = this.ctx.obterPontosParaOrdenacao().filter((p: any) =>
        p && p.ignorar_poligono !== 1 && p.tipo_ponto !== 'B' && p.tipo !== 'B'
      );
      this.ctx.sequenciaCliqueProximoIndice = pontosMat.length + 1;
    }

    const btnSalvar = document.getElementById('btn-salvar-ordem-simplificada');
    if (btnSalvar) {
      btnSalvar.classList.remove('hidden');
      btnSalvar.classList.add('animate-pulse');
    }
  }

  public atualizarBotoesUI(): void {
    const btnUndo = document.getElementById('btn-historico-undo') as HTMLButtonElement | null;
    const btnRedo = document.getElementById('btn-historico-redo') as HTMLButtonElement | null;

    if (btnUndo) {
      btnUndo.disabled = this.undoStack.length === 0;
      btnUndo.classList.toggle('opacity-30', this.undoStack.length === 0);
      btnUndo.classList.toggle('cursor-not-allowed', this.undoStack.length === 0);
      const ultimo = this.undoStack[this.undoStack.length - 1];
      btnUndo.title = ultimo ? `Desfazer: ${ultimo.descricao} (Ctrl+Z)` : 'Desfazer (Ctrl+Z)';
    }

    if (btnRedo) {
      btnRedo.disabled = this.redoStack.length === 0;
      btnRedo.classList.toggle('opacity-30', this.redoStack.length === 0);
      btnRedo.classList.toggle('cursor-not-allowed', this.redoStack.length === 0);
      const proximo = this.redoStack[this.redoStack.length - 1];
      btnRedo.title = proximo ? `Refazer: ${proximo.descricao} (Ctrl+Y)` : 'Refazer (Ctrl+Y)';
    }
  }

  public inicializarAtalhosTeclado(): void {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      // Ignora atalhos se o foco estiver num input de texto ou textarea (exceto se for apenas input-ordem-manual com blur)
      const target = e.target as HTMLElement;
      const isTextInput = target && (
        (target.tagName === 'INPUT' && !target.classList.contains('chk-ponto-ordenador') && !target.classList.contains('chk-ignorar-poligono')) ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      );

      // Ctrl+Z ou Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (isTextInput && !target.classList.contains('input-ordem-manual')) return;
        e.preventDefault();
        this.desfazer();
      }

      // Ctrl+Y ou Ctrl+Shift+Z / Cmd+Shift+Z
      if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        if (isTextInput && !target.classList.contains('input-ordem-manual')) return;
        e.preventDefault();
        this.refazer();
      }
    });

    const btnUndo = document.getElementById('btn-historico-undo');
    if (btnUndo) {
      btnUndo.onclick = () => this.desfazer();
    }

    const btnRedo = document.getElementById('btn-historico-redo');
    if (btnRedo) {
      btnRedo.onclick = () => this.refazer();
    }

    this.atualizarBotoesUI();
  }

  public limpar(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.atualizarBotoesUI();
  }
}

export function setupMesaTrabalhoHistorico(ctx: MesaTrabalhoContext) {
  const gerenciador = new GerenciadorHistoricoMesa(ctx);
  ctx.gerenciadorHistorico = gerenciador;

  ctx.salvarEstadoHistorico = (descricao: string) => {
    gerenciador.salvarEstado(descricao);
  };

  ctx.desfazerHistorico = () => {
    return gerenciador.desfazer();
  };

  ctx.refazerHistorico = () => {
    return gerenciador.refazer();
  };

  gerenciador.inicializarAtalhosTeclado();
}
