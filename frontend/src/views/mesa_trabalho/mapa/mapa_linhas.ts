import L from 'leaflet';
import type { Segmento, Ponto, BancoPonto } from '../../../types';
import { escapeHtml } from '../../../utils';
import type { MapaCore } from './mapa_core';

export class MapaLinhas {
  public polylines: L.Polyline[] = [];
  public bancoPontosAtivo: boolean = false;
  private core: MapaCore;

  constructor(core: MapaCore, _controller: any) {
    this.core = core;
  }

  public setBancoPontosAtivo(ativo: boolean): void {
    this.bancoPontosAtivo = ativo;
  }

  public plotSegmentos(segmentos: Segmento[], pontos: Ponto[]): void {
    if (!this.core.map) return;

    segmentos.forEach(s => {
      const pIni = pontos.find(p => String(p.id) === String(s.ponto_inicio_id));
      const pFim = pontos.find(p => String(p.id) === String(s.ponto_fim_id));

      if (pIni && pFim && pIni.lat && pIni.lon && pFim.lat && pFim.lon) {
        const tipoLim = s.tipo_limite_sigef || (s as any).tipo_limite || '';
        const metodoPos = s.metodo_posicionamento_sigef || (s as any).metodo_posicionamento || '';
        const color = this.bancoPontosAtivo ? '#94a3b8' : (tipoLim === 'LA1' ? '#10b981' : '#3b82f6');
        const weight = this.core.config.perimetroWeight;
        const opacity = this.bancoPontosAtivo ? 0.4 : 1.0;
        const polyline = L.polyline([[pIni.lat, pIni.lon], [pFim.lat, pFim.lon]], {
          color: color,
          weight: weight,
          opacity: opacity,
          dashArray: tipoLim === 'LN1' ? '6, 6' : undefined,
          pane: 'perimetroPane'
        }).bindPopup(`
          <div style="font-family:var(--geo-font-sans),sans-serif; color:rgba(255, 255, 255, 0.9); line-height:1.3;">
            <div style="font-weight:700; font-size:12px; margin-bottom:3px; color:#ffffff;">${escapeHtml(pIni.nome_vertice)} ↔ ${escapeHtml(pFim.nome_vertice)}</div>
            <div style="font-size:11px; color:rgba(255, 255, 255, 0.65);">Limite: ${escapeHtml(tipoLim)} · ${escapeHtml(metodoPos)}</div>
          </div>
        `, {
          className: 'compact-popup',
          maxWidth: 220
        }).addTo(this.core.map!);

        this.polylines.push(polyline);
      }
    });
  }

  public plotPolilinhaTemporaria(pontos: Ponto[]): void {
    if (!this.core.map) return;

    const validPoints = pontos.filter(
      p => p.lat && p.lon && p.lat !== 0 && p.lon !== 0 && p.tipo_ponto !== 'B' && p.tipo !== 'B' && p.ignorar_poligono !== 1
    );

    if (validPoints.length < 2) return;

    // Agrupar pontos por matricula_id e arquivo_origem para traçar perímetros independentes (evita fechar polígonos entre planilhas/glebas distintas)
    const grupos: { [key: string]: Ponto[] } = {};
    validPoints.forEach(p => {
      const matKey = p.matricula_id != null ? `mat_${p.matricula_id}` : 'sem_mat';
      const origKey = p.arquivo_origem || (p as any).planilha_origem || 'default';
      const key = `${matKey}___${origKey}`;
      if (!grupos[key]) grupos[key] = [];
      grupos[key].push(p);
    });

    const color = this.bancoPontosAtivo ? '#94a3b8' : '#10b981';
    const weight = this.core.config.fechamentoWeight || 2;
    const opacity = this.bancoPontosAtivo ? 0.4 : 1.0;

    Object.values(grupos).forEach(grupoPontos => {
      // Ordena os pontos dentro de cada perímetro/planilha individualmente
      grupoPontos.sort((a, b) => Number(a.ordem_caminhamento ?? 999999) - Number(b.ordem_caminhamento ?? 999999));
      if (grupoPontos.length < 2) return;

      // Traça segmentos i -> i+1 do grupo
      for (let i = 0; i < grupoPontos.length - 1; i++) {
        const pIni = grupoPontos[i];
        const pFim = grupoPontos[i + 1];
        const polyline = L.polyline([[pIni.lat as number, pIni.lon as number], [pFim.lat as number, pFim.lon as number]], {
          color: color,
          weight: weight,
          opacity: opacity,
          pane: 'perimetroPane'
        }).addTo(this.core.map!);

        this.polylines.push(polyline);
      }

      // Fecha o perímetro do grupo: pLast -> pFirst
      const pLast = grupoPontos[grupoPontos.length - 1];
      const pFirst = grupoPontos[0];
      const polylineClose = L.polyline([[pLast.lat as number, pLast.lon as number], [pFirst.lat as number, pFirst.lon as number]], {
        color: color,
        weight: weight,
        opacity: opacity,
        dashArray: '4, 4',
        pane: 'perimetroPane'
      }).addTo(this.core.map!);

      this.polylines.push(polylineClose);
    });
  }

  public plotPoligonalHomologada(bancoPontos: BancoPonto[]): void {
    if (!this.core.map || !this.core.bancoPontosGroup) return;
    this.core.bancoPontosGroup.clearLayers();

    // Filtra pontos que possuam coordenadas de Lat/Lon válidas
    const validPoints = bancoPontos.filter(p => p.lat && p.lon && p.lat !== 0 && p.lon !== 0);
    if (validPoints.length === 0) return;

    this.bancoPontosAtivo = true;

    // 1. Plotar marcadores discretos para os pontos
    validPoints.forEach(p => {
      const markerHtml = `
        <div class="w-4.5 h-4.5 bg-amber-500 text-slate-950 border-2 border-slate-900 rounded-full flex items-center justify-center text-[7px] font-black font-mono shadow-md hover:scale-125 transition-transform" id="banco-marker-${p.id}">
          H
        </div>
      `;
      const customIcon = L.divIcon({
        html: markerHtml,
        className: 'banco-leaflet-marker',
        iconSize: [18, 18]
      });

      const popupContent = `
        <div style="font-family:var(--geo-font-sans),sans-serif; color:rgba(255, 255, 255, 0.9); line-height:1.35; min-width:180px;">
          <div style="font-weight:800; font-size:11px; color:#fbbf24; text-transform:uppercase; letter-spacing:0.5px; border-b:1px solid rgba(255, 255, 255, 0.1); padding-bottom:3px; margin-bottom:5px;">Vértice Homologado SIGEF</div>
          <div style="font-weight:700; font-size:13px; margin-bottom:3px; color:#ffffff;">${escapeHtml(p.codigo_completo)}</div>
          <div style="font-size:11px; color:rgba(255, 255, 255, 0.7); font-family:'JetBrains Mono',monospace;">Este (E): ${p.este ? p.este.toFixed(2) : 'N/A'} m</div>
          <div style="font-size:11px; color:rgba(255, 255, 255, 0.7); font-family:'JetBrains Mono',monospace; margin-bottom:3px;">Norte (N): ${p.norte ? p.norte.toFixed(2) : 'N/A'} m</div>
          <div style="font-size:11px; color:rgba(255, 255, 255, 0.7); margin-bottom:2px;">Alt (h): <strong>${p.altitude ? p.altitude.toFixed(2) : 'N/A'} m</strong></div>
          <div style="font-size:10px; color:rgba(255, 255, 255, 0.45);">Método: ${escapeHtml(p.metodo_posicionamento) || 'N/A'} · Limite: ${escapeHtml(p.tipo_limite) || 'N/A'}</div>
          ${p.confrontante_descritivo ? `<div style="font-size:10px; color:rgba(255, 255, 255, 0.65); border-top:1px solid rgba(255, 255, 255, 0.1); padding-top:4px; margin-top:4px; word-break:break-word;"><strong>Conf:</strong> ${escapeHtml(p.confrontante_descritivo)}</div>` : ''}
        </div>
      `;

      const marker = L.marker([p.lat as number, p.lon as number], {
        icon: customIcon,
        pane: 'verticesPane'
      }).bindPopup(popupContent, { className: 'compact-popup', maxWidth: 220 });

      marker.addTo(this.core.bancoPontosGroup!);
    });

    // 2. Agrupar pontos por matricula_id e planilha_origem e traçar a polilinha fechada para cada perímetro/planilha de forma independente
    const grupos: { [key: string]: BancoPonto[] } = {};
    validPoints.forEach(p => {
      const matKey = p.matricula_id != null ? `mat_${p.matricula_id}` : 'sem_mat';
      const origKey = p.planilha_origem || (p as any).arquivo_origem || 'default';
      const key = `${matKey}___${origKey}`;
      if (!grupos[key]) {
        grupos[key] = [];
      }
      grupos[key].push(p);
    });

    for (const key in grupos) {
      const pontosGrupo = grupos[key];
      // Ordena por ordem_caminhamento se disponível, ou por ID/posição
      pontosGrupo.sort((a, b) => {
        const ordA = a.ordem_caminhamento !== undefined && a.ordem_caminhamento !== null ? a.ordem_caminhamento : a.id;
        const ordB = b.ordem_caminhamento !== undefined && b.ordem_caminhamento !== null ? b.ordem_caminhamento : b.id;
        return ordA - ordB;
      });

      if (pontosGrupo.length >= 2) {
        const coords = pontosGrupo.map(p => L.latLng(p.lat as number, p.lon as number));
        coords.push(L.latLng(pontosGrupo[0].lat as number, pontosGrupo[0].lon as number));

        L.polyline(coords, {
          color: '#f59e0b', // Cor âmbar contrastante premium
          weight: this.core.config.bancoWeight,
          dashArray: '6, 8',
          pane: 'perimetroPane'
        }).addTo(this.core.bancoPontosGroup!);
      }
    }
  }

  public clearLinhas(): void {
    if (this.core.map) {
      this.polylines.forEach(pl => this.core.map!.removeLayer(pl));
    }
    if (this.core.bancoPontosGroup) {
      this.core.bancoPontosGroup.clearLayers();
    }
    this.polylines = [];
  }
}
