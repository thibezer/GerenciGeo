import type { MesaTrabalhoContext } from '../mesa_trabalho_context';

export function setupOrdenadorContext(ctx: MesaTrabalhoContext) {
  ctx.obterPontosParaOrdenacao = () => {
    const todosPontos = ctx.pontosList || [];

    // Inclui todos os pontos válidos do levantamento (inclusive bases e fora do polígono)
    const filtroValidos = (p: any) => p != null;

    let pontosFiltrados: any[] = todosPontos.filter(p => p && filtroValidos(p));

    if (ctx.arquivosDesativadosList && ctx.arquivosDesativadosList.length > 0) {
      pontosFiltrados = pontosFiltrados.filter(p => p && !ctx.arquivosDesativadosList!.includes(p.arquivo_origem));
    }

    // Deduplica por (nome_vertice, tipo_ponto)
    // Prioriza status_ponto === 'CORRIGIDO' e maior id
    const dedupMap = new Map<string, any>();
    pontosFiltrados.forEach((p) => {
      if (!p) return;
      
      // Se o ponto não tiver nome, não podemos deduplicá-lo cegamente com outros pontos sem nome, 
      // caso contrário todos os pontos brutos sumirão da tela e virarão 1 só (bug da Fazenda Serra dos Dourados).
      const nome = p.nome_vertice || '';
      const tipo = p.tipo_ponto || p.tipo || '';
      const key = nome ? `${nome}_${tipo}` : `UNNAMED_${p.id}`;
      
      if (!dedupMap.has(key)) {
        dedupMap.set(key, p);
      } else {
        const existente = dedupMap.get(key);
        const novoStatus = p.status_ponto || p.status || '';
        const exStatus = existente.status_ponto || existente.status || '';

        if (novoStatus === 'CORRIGIDO' && exStatus !== 'CORRIGIDO') {
          dedupMap.set(key, p);
        } else if (novoStatus === exStatus && p.id > existente.id) {
          dedupMap.set(key, p);
        }
      }
    });

    return Array.from(dedupMap.values());
  };

  ctx.subirPonto = (pontoId: number) => {
    const todosPontos = ctx.obterPontosParaOrdenacao();
    const pontosMat = todosPontos.filter(p => p.ignorar_poligono !== 1 && p.tipo_ponto !== 'B' && p.tipo !== 'B');
    pontosMat.sort((a, b) => (a.ordem_caminhamento ?? 999999) - (b.ordem_caminhamento ?? 999999));

    const idx = pontosMat.findIndex(p => p.id === pontoId);
    if (idx === -1) return;

    const pontoClicado = pontosMat[idx];
    const seqIdClicado = pontoClicado.sequencia_travada_id;

    let blocoParaMover: any[];
    let primeiroIdxBloco: number;

    if (seqIdClicado) {
      blocoParaMover = pontosMat.filter(p => p.sequencia_travada_id === seqIdClicado);
      primeiroIdxBloco = pontosMat.findIndex(p => p.sequencia_travada_id === seqIdClicado);
    } else {
      blocoParaMover = [pontoClicado];
      primeiroIdxBloco = idx;
    }

    if (primeiroIdxBloco <= 0) return;

    const pontoAcima = pontosMat[primeiroIdxBloco - 1];
    const seqIdAcima = pontoAcima.sequencia_travada_id;

    let blocoAcima: any[];
    let primeiroIdxBlocoAcima: number;

    if (seqIdAcima) {
      blocoAcima = pontosMat.filter(p => p.sequencia_travada_id === seqIdAcima);
      primeiroIdxBlocoAcima = pontosMat.findIndex(p => p.sequencia_travada_id === seqIdAcima);
    } else {
      blocoAcima = [pontoAcima];
      primeiroIdxBlocoAcima = primeiroIdxBloco - 1;
    }

    const pontosRestantes = pontosMat.filter(p =>
      !blocoParaMover.includes(p) && !blocoAcima.includes(p)
    );
    pontosRestantes.splice(primeiroIdxBlocoAcima, 0, ...blocoParaMover, ...blocoAcima);

    pontosRestantes.forEach((p, index) => {
      p.ordem_caminhamento = index + 1;
    });

    const btnSalvar = document.getElementById('btn-salvar-ordem-simplificada');
    if (btnSalvar) {
      btnSalvar.classList.remove('hidden');
      btnSalvar.classList.add('animate-pulse');
    }

    ctx.renderListaReordenarSimplificada();
    ctx.atualizarPolilinhaMapaTemp();
    ctx.salvarRascunhoLocal();
  };

  ctx.descerPonto = (pontoId: number) => {
    const todosPontos = ctx.obterPontosParaOrdenacao();
    const pontosMat = todosPontos.filter(p => p.ignorar_poligono !== 1 && p.tipo_ponto !== 'B' && p.tipo !== 'B');
    pontosMat.sort((a, b) => (a.ordem_caminhamento ?? 999999) - (b.ordem_caminhamento ?? 999999));

    const idx = pontosMat.findIndex(p => p.id === pontoId);
    if (idx === -1) return;

    const pontoClicado = pontosMat[idx];
    const seqIdClicado = pontoClicado.sequencia_travada_id;

    let blocoParaMover: any[];
    let primeiroIdxBloco: number;
    let ultimoIdxBloco: number;

    if (seqIdClicado) {
      blocoParaMover = pontosMat.filter(p => p.sequencia_travada_id === seqIdClicado);
      primeiroIdxBloco = pontosMat.findIndex(p => p.sequencia_travada_id === seqIdClicado);
      ultimoIdxBloco = pontosMat.reduce((lastIdx, p, i) =>
        p.sequencia_travada_id === seqIdClicado ? i : lastIdx, -1
      );
    } else {
      blocoParaMover = [pontoClicado];
      primeiroIdxBloco = idx;
      ultimoIdxBloco = idx;
    }

    if (ultimoIdxBloco >= pontosMat.length - 1) return;

    const pontoAbaixo = pontosMat[ultimoIdxBloco + 1];
    const seqIdAbaixo = pontoAbaixo.sequencia_travada_id;

    let blocoAbaixo: any[];

    if (seqIdAbaixo) {
      blocoAbaixo = pontosMat.filter(p => p.sequencia_travada_id === seqIdAbaixo);
    } else {
      blocoAbaixo = [pontoAbaixo];
    }

    const pontosRestantes = pontosMat.filter(p =>
      !blocoParaMover.includes(p) && !blocoAbaixo.includes(p)
    );
    pontosRestantes.splice(primeiroIdxBloco, 0, ...blocoAbaixo, ...blocoParaMover);

    pontosRestantes.forEach((p, index) => {
      p.ordem_caminhamento = index + 1;
    });

    const btnSalvar = document.getElementById('btn-salvar-ordem-simplificada');
    if (btnSalvar) {
      btnSalvar.classList.remove('hidden');
      btnSalvar.classList.add('animate-pulse');
    }

    ctx.renderListaReordenarSimplificada();
    ctx.atualizarPolilinhaMapaTemp();
    ctx.salvarRascunhoLocal();
  };

  ctx.moverPontoPosicao = (pontoId: number, novaPosicao: number) => {
    const todosPontos = ctx.obterPontosParaOrdenacao();
    const pontosMat = todosPontos.filter(p => p.ignorar_poligono !== 1 && p.tipo_ponto !== 'B' && p.tipo !== 'B');
    pontosMat.sort((a, b) => (a.ordem_caminhamento ?? 999999) - (b.ordem_caminhamento ?? 999999));

    const oldIdx = pontosMat.findIndex(p => p.id === pontoId);
    if (oldIdx === -1) return;

    const pontoQueMoveu = pontosMat[oldIdx];
    const seqIdMoveu = pontoQueMoveu.sequencia_travada_id;

    let pontosParaMover: any[];
    if (seqIdMoveu) {
      pontosParaMover = pontosMat.filter(p => p.sequencia_travada_id === seqIdMoveu);
    } else {
      pontosParaMover = [pontoQueMoveu];
    }

    const pontosRestantes = pontosMat.filter(p => !pontosParaMover.includes(p));

    let targetIdx = novaPosicao - 1;
    if (targetIdx < 0) targetIdx = 0;
    if (targetIdx > pontosRestantes.length) targetIdx = pontosRestantes.length;

    if (targetIdx > 0 && targetIdx < pontosRestantes.length) {
      const pontoAntes = pontosRestantes[targetIdx - 1];
      const pontoDepois = pontosRestantes[targetIdx];

      if (
        pontoAntes.sequencia_travada_id &&
        pontoDepois.sequencia_travada_id &&
        pontoAntes.sequencia_travada_id === pontoDepois.sequencia_travada_id &&
        pontoAntes.sequencia_travada_id !== seqIdMoveu
      ) {
        const seqIdDestino = pontoDepois.sequencia_travada_id;
        if (oldIdx < targetIdx) {
          while (
            targetIdx < pontosRestantes.length &&
            pontosRestantes[targetIdx].sequencia_travada_id === seqIdDestino
          ) {
            targetIdx++;
          }
        } else {
          while (
            targetIdx > 0 &&
            pontosRestantes[targetIdx - 1].sequencia_travada_id === seqIdDestino
          ) {
            targetIdx--;
          }
        }
      }
    }

    pontosRestantes.splice(targetIdx, 0, ...pontosParaMover);

    pontosRestantes.forEach((p, index) => {
      p.ordem_caminhamento = index + 1;
    });

    const btnSalvar = document.getElementById('btn-salvar-ordem-simplificada');
    if (btnSalvar) {
      btnSalvar.classList.remove('hidden');
      btnSalvar.classList.add('animate-pulse');
    }

    ctx.renderListaReordenarSimplificada();
    ctx.atualizarPolilinhaMapaTemp();
    ctx.salvarRascunhoLocal();
  };

  ctx.inverterOrdemPerimetral = () => {
    const todosPontos = ctx.obterPontosParaOrdenacao();
    const pontosMat = todosPontos.filter(p => p.ignorar_poligono !== 1 && p.tipo_ponto !== 'B' && p.tipo !== 'B');
    if (pontosMat.length < 2) return;

    pontosMat.sort((a, b) => (a.ordem_caminhamento ?? 999999) - (b.ordem_caminhamento ?? 999999));
    const total = pontosMat.length;

    pontosMat.forEach((p, idx) => {
      p.ordem_caminhamento = total - idx;
    });

    const btnSalvar = document.getElementById('btn-salvar-ordem-simplificada');
    if (btnSalvar) {
      btnSalvar.classList.remove('hidden');
      btnSalvar.classList.add('animate-pulse');
    }

    ctx.renderListaReordenarSimplificada();
    ctx.atualizarPolilinhaMapaTemp();
    ctx.salvarRascunhoLocal();
  };

  ctx.lidarCliqueMarcadorSequencial = (pontoId: number) => {
    const todosPontos = ctx.obterPontosParaOrdenacao();
    const pontosMat = todosPontos.filter(p => p.ignorar_poligono !== 1 && p.tipo_ponto !== 'B' && p.tipo !== 'B');
    const maxOrdem = pontosMat.length;

    if (ctx.sequenciaCliqueProximoIndice === null || ctx.sequenciaCliqueProximoIndice > maxOrdem) {
      ctx.sequenciaCliqueProximoIndice = 1;
    }

    ctx.moverPontoPosicao(pontoId, ctx.sequenciaCliqueProximoIndice);
    ctx.sequenciaCliqueProximoIndice++;
  };
}
