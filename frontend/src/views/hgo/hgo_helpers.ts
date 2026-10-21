/**
 * hgo_helpers.ts — Lógica pura do Organizador HGO (sem DOM, testável com `npm test`).
 */

export type NivelLog = 'erro' | 'aviso' | 'sucesso' | 'info';

export interface ProgressoHgo {
  processados: number;
  total: number;
}

export type EstadoHgo = 'sem-pasta' | 'pronto' | 'processando' | 'concluido' | 'erro';

/** Classifica uma linha do log pela palavra-chave (a ordem importa: erro vence aviso, aviso vence sucesso). */
export const classificarLog = (log: string): NivelLog => {
  const u = log.toUpperCase();
  if (['ERROR', 'ERRO', 'FALHA', 'CRITICAL', 'REJEITADO'].some(k => u.includes(k))) return 'erro';
  if (['WARN', 'AVISO', 'ATENÇÃO'].some(k => u.includes(k))) return 'aviso';
  if (['SUCCESS', 'SUCESSO', 'CONCLUÍDO', 'CRIADA', 'OK'].some(k => u.includes(k))) return 'sucesso';
  return 'info';
};

/** Lê "[3/15]" ou "3 de 15" de uma linha; null se não houver. */
export const lerProgressoDaLinha = (log: string): ProgressoHgo | null => {
  const m = log.match(/\[(\d+)\/(\d+)\]/) || log.match(/(\d+)\s+de\s+(\d+)/);
  return m ? { processados: parseInt(m[1], 10), total: parseInt(m[2], 10) } : null;
};

/** O progresso vale o da ÚLTIMA linha que informa um; sem nenhuma (ou total 0) devolve null. */
export const extrairProgresso = (logs: string[]): ProgressoHgo | null => {
  let ultimo: ProgressoHgo | null = null;
  for (const log of logs) {
    const p = lerProgressoDaLinha(log);
    if (p) ultimo = p;
  }
  return ultimo && ultimo.total > 0 ? ultimo : null;
};

export const percentual = (p: ProgressoHgo): number =>
  Math.max(0, Math.min(100, Math.round((p.processados / p.total) * 100)));

/** Estado exibido no chip da faixa de pasta. */
export const estadoHgo = (pastaSelecionada: boolean, progresso: ProgressoHgo | null, ultimoLog?: string): EstadoHgo => {
  if (ultimoLog && classificarLog(ultimoLog) === 'erro') return 'erro';
  if (progresso) return progresso.processados >= progresso.total ? 'concluido' : 'processando';
  return pastaSelecionada ? 'pronto' : 'sem-pasta';
};

export const ROTULO_ESTADO: Record<EstadoHgo, string> = {
  'sem-pasta': 'Aguardando pasta',
  pronto: 'Pronto para converter',
  processando: 'Processando',
  concluido: 'Concluído',
  erro: 'Atenção: erro no log'
};
