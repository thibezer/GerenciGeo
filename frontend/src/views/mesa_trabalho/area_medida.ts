import { API_BASE } from '../../config';

/** Resultado resumido da auditoria topológica da matrícula (área calculada pelos vértices). */
export interface AreaMedida {
  area_ha: number;
  area_m2: number;
  perimetro_m: number;
  area_declarada_ha: number;
  discrepancia_area_ha: number;
  discrepancia_area_perc: number;
  autointersecta: boolean;
}

/** Limite (%) de diferença entre área medida e da matrícula a partir do qual a UI sinaliza atenção. */
const LIMITE_ALERTA_PERC = 1;

const sequenciaPorMatricula = new Map<number, number>();

export function formatarHa(valor: number | null | undefined): string {
  if (valor == null || isNaN(valor)) return '-';
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

export function textoDiferencaArea(a: AreaMedida): string {
  const sinal = a.area_ha >= a.area_declarada_ha ? '+' : '-';
  return `${sinal}${formatarHa(a.discrepancia_area_ha)} ha (${a.discrepancia_area_perc.toFixed(2).replace('.', ',')}%)`;
}

/** Busca a área medida da matrícula ativa, guarda no contexto e atualiza ribbon e painel. */
export async function atualizarAreaMedida(ctx: any): Promise<void> {
  const matId = Number(ctx.currentMatriculaId);
  if (!matId) {
    ctx.areaMedida = null;
    renderizarAreaMedidaRibbon(ctx);
    ctx.atualizarPainelPropriedades?.();
    return;
  }

  // Descarta respostas antigas quando a matrícula troca durante a requisição
  const seq = (sequenciaPorMatricula.get(matId) ?? 0) + 1;
  sequenciaPorMatricula.set(matId, seq);

  let resultado: AreaMedida | null = null;
  try {
    const res = await fetch(`${API_BASE}/matriculas/${matId}/auditoria`);
    if (res.ok) {
      const d = await res.json();
      if (d && typeof d.area_ha === 'number') {
        resultado = {
          area_ha: d.area_ha,
          area_m2: d.area_m2,
          perimetro_m: d.perimetro_m,
          area_declarada_ha: Number(d.area_declarada_ha) || 0,
          discrepancia_area_ha: d.discrepancia_area_ha ?? 0,
          discrepancia_area_perc: d.discrepancia_area_perc ?? 0,
          autointersecta: d.conforme_topologia_perimetral === false
        };
      }
    }
  } catch (err) {
    console.warn('Erro ao obter área medida da matrícula:', err);
  }

  if (sequenciaPorMatricula.get(matId) !== seq || Number(ctx.currentMatriculaId) !== matId) return;
  ctx.areaMedida = resultado;
  renderizarAreaMedidaRibbon(ctx);
  ctx.atualizarPainelPropriedades?.();
}

function renderizarAreaMedidaRibbon(ctx: any): void {
  const el = document.getElementById('txt-area-medida');
  if (!el) return;
  const a: AreaMedida | null = ctx.areaMedida ?? null;
  if (!a) {
    el.textContent = '—';
    el.removeAttribute('title');
    el.style.color = '';
    return;
  }
  let texto = `${formatarHa(a.area_ha)} ha`;
  if (a.area_declarada_ha > 0) texto += ` (${textoDiferencaArea(a)})`;
  el.textContent = texto;
  el.title = a.autointersecta
    ? 'Atenção: a poligonal se autointersecta, a área pode estar incorreta.'
    : `Área calculada pelos vértices da matrícula. Matrícula: ${formatarHa(a.area_declarada_ha)} ha`;
  const alerta = a.autointersecta || (a.area_declarada_ha > 0 && a.discrepancia_area_perc > LIMITE_ALERTA_PERC);
  el.style.color = alerta ? '#fbbf24' : '';
}
