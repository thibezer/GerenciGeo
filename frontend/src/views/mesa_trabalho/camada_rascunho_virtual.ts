import L from 'leaflet';
import type { MesaTrabalhoContext } from './mesa_trabalho_context';
import { coordenadaPonto } from './coordenadas_mapa';
import { ehVerticeVirtualRascunho } from './modal_promover_virtuais';

const camadas = new WeakMap<object, L.LayerGroup>();

/** Agrupa rascunhos criados juntos (ids consecutivos, mesma matrícula e mesmo instante de criação). */
export function agruparRascunhosVirtuais(pontos: any[]): any[][] {
  const ordenados = pontos.filter(ehVerticeVirtualRascunho).sort((a, b) => Number(a.id) - Number(b.id));
  const grupos: any[][] = [];
  for (const p of ordenados) {
    const grupo = grupos[grupos.length - 1];
    const anterior = grupo?.[grupo.length - 1];
    const mesmoLote =
      anterior &&
      Number(p.id) - Number(anterior.id) === 1 &&
      String(p.matricula_id) === String(anterior.matricula_id) &&
      Math.abs(Date.parse(String(p.created_at)) - Date.parse(String(anterior.created_at))) <= 3000;
    if (mesmoLote) grupo.push(p);
    else grupos.push([p]);
  }
  return grupos;
}

/** Desenha cada grupo de rascunhos como polilinha aberta tracejada, fora do polígono. */
export function atualizarCamadaRascunhoVirtual(ctx: MesaTrabalhoContext): void {
  const map = ctx.triagemMap;
  if (!map) return;

  let grupoCamada = camadas.get(map);
  if (!grupoCamada) {
    grupoCamada = L.layerGroup().addTo(map);
    camadas.set(map, grupoCamada);
  }
  grupoCamada.clearLayers();

  const matId = ctx.currentMatriculaId;
  const pontos = (ctx.pontosList || []).filter(p => !matId || String(p.matricula_id) === String(matId));
  for (const grupo of agruparRascunhosVirtuais(pontos)) {
    const latlngs: [number, number][] = [];
    for (const p of grupo) {
      const c = coordenadaPonto(p);
      if (c) latlngs.push([c.lat, c.lon]);
    }
    if (latlngs.length < 2) continue;
    L.polyline(latlngs, { color: '#10b981', weight: 2, dashArray: '4, 6', opacity: 0.85, interactive: false }).addTo(grupoCamada);
  }
}
