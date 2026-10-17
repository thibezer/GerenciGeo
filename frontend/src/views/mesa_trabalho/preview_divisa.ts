import L from 'leaflet';
import { API_BASE } from '../../config';
import { escapeHtml, initIcons, showToast } from '../../utils';
import type { MesaTrabalhoContext } from './mesa_trabalho_context';
import { extrairDetalhe } from './emissao_pecas';

const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const CLS_TILE_ATIVO = 'px-2 py-1 text-[11px] font-bold rounded bg-mint-vibrant text-slate-900 transition-all shadow-sm';
const CLS_TILE_INATIVO = 'px-2 py-1 text-[11px] font-bold rounded text-white/70 hover:text-white transition-all';

export interface PreviewDivisa {
  abrir: (confrontanteId: string | number, gatilho?: HTMLElement | null) => Promise<void>;
  fechar: () => void;
  destruir: () => void;
}

export interface PreviewDivisaDeps {
  ctx: MesaTrabalhoContext;
  signal: AbortSignal;
  /** Emite a anuência oficial do confrontante exibido (cuida de pré-requisitos, avisos e emissão). */
  gerarAnuencia: (confrontanteId: string | number, botao: HTMLElement | null) => void;
}

/** Modal "Pré-visualizar divisa": mapa (Leaflet) + croqui + dados técnicos do trecho de um confrontante. */
export function criarPreviewDivisa(deps: PreviewDivisaDeps): PreviewDivisa {
  const { ctx, signal } = deps;
  const modal = document.getElementById('modal-preview-divisa-anuencia') as HTMLElement | null;

  let mapa: L.Map | null = null;
  let confAtual: string | number | null = null;
  let seq = 0;
  let aberto = false;
  let gatilhoAnterior: HTMLElement | null = null;
  let timerAjuste: ReturnType<typeof setTimeout> | null = null;

  const el = (id: string) => document.getElementById(id);
  const texto = (id: string, valor: string) => { const e = el(id); if (e) e.innerText = valor; };

  const destruirMapa = () => {
    if (timerAjuste) { clearTimeout(timerAjuste); timerAjuste = null; }
    if (mapa) {
      try { mapa.remove(); } catch { /* mapa já destruído */ }
      mapa = null;
    }
  };

  const aoTeclar = (e: KeyboardEvent) => {
    if (!aberto || !modal) return;
    if (e.key === 'Escape') {
      // Um diálogo de confirmação por cima (showDialog) trata o próprio fechamento
      if (Array.from(document.body.children).some(c => (c as HTMLElement).style?.zIndex === '999999')) return;
      e.preventDefault();
      e.stopPropagation();
      fechar();
      return;
    }
    if (e.key !== 'Tab') return;
    const itens = Array.from(modal.querySelectorAll<HTMLElement>(FOCAVEIS)).filter(x => x.offsetParent !== null);
    if (itens.length === 0) return;
    const primeiro = itens[0];
    const ultimo = itens[itens.length - 1];
    const ativo = document.activeElement;
    if (e.shiftKey && (ativo === primeiro || !modal.contains(ativo))) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && (ativo === ultimo || !modal.contains(ativo))) {
      e.preventDefault();
      primeiro.focus();
    }
  };

  function fechar(restaurarFoco = true) {
    if (!modal) return;
    seq++; // invalida respostas em andamento
    modal.classList.add('hidden');
    destruirMapa();
    confAtual = null;
    if (aberto) document.removeEventListener('keydown', aoTeclar, true);
    aberto = false;
    if (restaurarFoco && gatilhoAnterior && gatilhoAnterior.isConnected) {
      try { gatilhoAnterior.focus(); } catch { /* sem foco */ }
    }
    gatilhoAnterior = null;
  }

  // Semântica de diálogo (o template pode já trazer; só completa o que faltar)
  if (modal) {
    if (!modal.hasAttribute('role')) modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    const titulo = modal.querySelector('h3');
    if (titulo) {
      if (!titulo.id) titulo.id = 'titulo-preview-divisa-anuencia';
      if (!modal.hasAttribute('aria-labelledby')) modal.setAttribute('aria-labelledby', titulo.id);
    }
    el('btn-fechar-modal-preview-anuencia')?.setAttribute('aria-label', 'Fechar pré-visualização da divisa');
  }

  const btnFechar = el('btn-fechar-modal-preview-anuencia');
  const btnCancelar = el('btn-preview-cancelar');
  if (btnFechar) btnFechar.onclick = () => fechar();
  if (btnCancelar) btnCancelar.onclick = () => fechar();
  modal?.addEventListener('mousedown', (e) => { if (e.target === modal) fechar(); }, { signal });

  const btnGerar = el('btn-preview-gerar-anuencia');
  if (btnGerar) {
    btnGerar.onclick = () => {
      if (confAtual === null) return;
      deps.gerarAnuencia(confAtual, btnGerar);
    };
  }

  const btnFocarCad = el('btn-preview-focar-cad');
  if (btnFocarCad) {
    btnFocarCad.onclick = () => {
      fechar(false);
      // As abas reais são geoprocessamento | cartorio | documentos | auditoria
      const aba = (document.querySelector('.rl3-tab[data-tab="geoprocessamento"]')
        || document.querySelector('[data-tab="geoprocessamento"]')) as HTMLElement | null;
      if (aba) aba.click();
      else ctx.alternarEtapa('geoprocessamento');
      showToast('Perímetro exibido no Canvas CAD.', 'info');
    };
  }

  async function abrir(confrontanteId: string | number, gatilho?: HTMLElement | null) {
    if (!ctx.currentLevId || !ctx.currentMatriculaId) {
      showToast('Selecione um levantamento e uma matrícula válidos.', 'info');
      return;
    }
    if (!confrontanteId || confrontanteId === 'lote') {
      showToast('Selecione um confrontante individual para pré-visualizar a divisa.', 'info');
      return;
    }
    if (!modal) return;

    const meuSeq = ++seq;
    confAtual = confrontanteId;
    if (!aberto) {
      gatilhoAnterior = gatilho || (document.activeElement as HTMLElement | null);
      document.addEventListener('keydown', aoTeclar, true);
      aberto = true;
    }
    destruirMapa();
    modal.classList.remove('hidden');
    el('loader-mapa-preview-anuencia')?.classList.remove('hidden');
    // Foco inicial no botão de fechar (primeiro elemento interativo do diálogo)
    setTimeout(() => (btnFechar as HTMLElement | null)?.focus(), 0);

    texto('preview-anuencia-badge-conf', 'CARREGANDO...');
    const tbodySegs = el('preview-anuencia-tbody-segmentos');
    if (tbodySegs) tbodySegs.innerHTML = `<tr><td colspan="3" class="py-4 text-center text-white/60 italic">Buscando dados da divisa...</td></tr>`;

    try {
      const url = `${API_BASE}/levantamentos/${ctx.currentLevId}/matriculas/${ctx.currentMatriculaId}/confrontantes/${confrontanteId}/preview-divisa`;
      const res = await fetch(url, { signal });
      if (meuSeq !== seq) return;
      if (!res.ok) throw new Error(await extrairDetalhe(res, 'Falha ao obter os dados do trecho da divisa.'));
      const data = await res.json();
      if (meuSeq !== seq) return;

      texto('preview-anuencia-badge-conf', data.confrontante?.nome || 'CONFRONTANTE');
      texto('preview-anuencia-subtitulo',
        `Confrontação com ${data.imovel?.nome ?? ''} (${data.imovel?.matricula ? `Matrícula ${data.imovel.matricula}` : 'Área do Projeto'})`);
      texto('preview-anuencia-nome-conf', data.confrontante?.nome || '-');
      texto('preview-anuencia-cpf-conf', data.confrontante?.cpf_cnpj || 'Não informado');
      const rotuloLote = data.confrontante?.lote ? (/^\s*lote\b/i.test(data.confrontante.lote) ? data.confrontante.lote : `Lote ${data.confrontante.lote}`) : '';
      const partes = [
        rotuloLote,
        data.confrontante?.matricula_imovel && data.confrontante.matricula_imovel !== 'Não informada' ? `Mat. ${data.confrontante.matricula_imovel}` : '',
      ].filter(Boolean);
      texto('preview-anuencia-mat-conf', partes.length > 0 ? partes.join(' - ') : (data.confrontante?.matricula_imovel || 'Não informada'));
      texto('preview-anuencia-imovel-req', `${data.imovel?.nome ?? ''} - Matrícula ${data.imovel?.matricula || 'S/N'}`);

      const metricas = data.metricas || {};
      texto('preview-anuencia-extensao', metricas.extensao_total_str || '0.00 m');
      texto('preview-anuencia-caminhamento',
        (metricas.vertice_inicial && metricas.vertice_final && metricas.vertice_inicial !== '-')
          ? `${metricas.vertice_inicial} ➔ ${metricas.vertice_final}` : 'Não encadeado');
      texto('preview-anuencia-qtd-vertices', `${metricas.qtd_vertices || 0} vértices`);
      texto('preview-anuencia-qtd-segmentos', `${metricas.qtd_segmentos || 0} segmentos`);

      const statusGeo = el('preview-anuencia-status-geo');
      if (statusGeo) {
        const valido = (metricas.qtd_segmentos || 0) > 0;
        statusGeo.innerText = valido ? 'TRECHO VÁLIDO' : 'SEM SEGMENTOS';
        statusGeo.className = valido
          ? 'text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold'
          : 'text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold';
      }

      if (tbodySegs) {
        if (Array.isArray(data.segmentos) && data.segmentos.length > 0) {
          tbodySegs.innerHTML = data.segmentos.map((s: any) => `
            <tr class="border-b border-white/5 hover:bg-white/[0.03] transition-colors font-mono">
              <td class="py-1.5 px-1.5 font-bold text-white">${escapeHtml(s.de)} <span class="text-mint-vibrant">➔</span> ${escapeHtml(s.para)}</td>
              <td class="py-1.5 px-1.5 text-right text-white/80">${escapeHtml(s.azimute)}</td>
              <td class="py-1.5 px-1.5 text-right font-bold text-mint-vibrant">${escapeHtml(s.distancia_str)}</td>
            </tr>`).join('');
        } else {
          tbodySegs.innerHTML = `
            <tr><td colspan="3" class="py-4 text-center text-amber-400/80 italic">
              Nenhum segmento da matrícula foi vinculado a este confrontante na Etapa 2 de Definição de Limites.
            </td></tr>`;
        }
      }

      const container = el('mapa-preview-anuencia-divisa');
      if (container) {
        const instancia = L.map(container, { attributionControl: true, zoomControl: true, maxZoom: 22 });
        mapa = instancia;
        L.control.scale({ imperial: false, position: 'bottomright' }).addTo(instancia);

        const satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
          maxZoom: 20,
          attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
        });
        const escuro = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          maxZoom: 20,
          subdomains: 'abcd',
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        });
        satelite.addTo(instancia);

        const btnSat = el('btn-preview-tile-satelite');
        const btnDark = el('btn-preview-tile-escuro');
        if (btnSat && btnDark) {
          btnSat.setAttribute('aria-pressed', 'true');
          btnDark.setAttribute('aria-pressed', 'false');
          btnSat.className = CLS_TILE_ATIVO;
          btnDark.className = CLS_TILE_INATIVO;
          btnSat.onclick = () => {
            if (instancia.hasLayer(escuro)) instancia.removeLayer(escuro);
            if (!instancia.hasLayer(satelite)) satelite.addTo(instancia);
            btnSat.className = CLS_TILE_ATIVO; btnDark.className = CLS_TILE_INATIVO;
            btnSat.setAttribute('aria-pressed', 'true'); btnDark.setAttribute('aria-pressed', 'false');
          };
          btnDark.onclick = () => {
            if (instancia.hasLayer(satelite)) instancia.removeLayer(satelite);
            if (!instancia.hasLayer(escuro)) escuro.addTo(instancia);
            btnDark.className = CLS_TILE_ATIVO; btnSat.className = CLS_TILE_INATIVO;
            btnDark.setAttribute('aria-pressed', 'true'); btnSat.setAttribute('aria-pressed', 'false');
          };
        }

        const grupo = L.featureGroup();
        if (Array.isArray(data.poligono_imovel) && data.poligono_imovel.length >= 3) {
          const poligono = L.polygon(data.poligono_imovel, { color: '#94a3b8', weight: 2, dashArray: '5, 5', fillColor: '#00f5a0', fillOpacity: 0.04 }).addTo(instancia);
          poligono.bindTooltip('Limite Geral do Imóvel', { sticky: true });
          grupo.addLayer(poligono);
        }
        if (Array.isArray(data.lindeira_coords) && data.lindeira_coords.length > 0) {
          const linha = L.polyline(data.lindeira_coords, { color: '#00f5a0', weight: 6, opacity: 0.95 }).addTo(instancia);
          linha.bindTooltip(`Divisa: ${escapeHtml(data.confrontante?.nome)} (${escapeHtml(metricas.extensao_total_str || '')})`, {
            sticky: true,
            className: 'bg-[#0c1510] text-mint-vibrant font-bold font-mono text-[11px] border border-mint-vibrant/30 rounded px-2 py-1 shadow-xl',
          });
          grupo.addLayer(linha);
        }
        if (Array.isArray(data.lindeira_pontos)) {
          data.lindeira_pontos.forEach((p: any) => {
            if (p.coords && p.coords.length === 2) {
              const marcador = L.circleMarker(p.coords, {
                radius: p.is_extremo ? 6 : 4,
                color: '#00f5a0',
                fillColor: p.is_extremo ? '#ffffff' : '#0c1510',
                fillOpacity: 1,
                weight: 2,
              }).addTo(instancia);
              marcador.bindTooltip(`Vértice ${escapeHtml(p.nome)}`, {
                permanent: !!p.is_extremo,
                direction: 'top',
                className: 'bg-[#0c1510] text-white font-bold font-mono text-[11px] border border-white/20 rounded px-1.5 py-0.5',
              });
              grupo.addLayer(marcador);
            }
          });
        }

        timerAjuste = setTimeout(() => {
          timerAjuste = null;
          if (meuSeq !== seq || mapa !== instancia) return;
          instancia.invalidateSize();
          if (grupo.getLayers().length > 0) instancia.fitBounds(grupo.getBounds(), { padding: [40, 40], maxZoom: 19 });
          el('loader-mapa-preview-anuencia')?.classList.add('hidden');
        }, 250);
      } else {
        el('loader-mapa-preview-anuencia')?.classList.add('hidden');
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || meuSeq !== seq) return;
      console.error('Erro ao carregar pré-visualização da divisa:', err);
      const msg = err?.message || 'Não foi possível carregar a pré-visualização da divisa. Tente novamente.';
      texto('preview-anuencia-badge-conf', 'ERRO');
      if (tbodySegs) tbodySegs.innerHTML = `<tr><td colspan="3" class="py-4 text-center text-rose-300 italic">${escapeHtml(msg)}</td></tr>`;
      showToast(escapeHtml(msg), 'error');
      el('loader-mapa-preview-anuencia')?.classList.add('hidden');
    }
    initIcons();
  }

  const destruir = () => {
    fechar(false);
    document.removeEventListener('keydown', aoTeclar, true);
    if (btnFechar) btnFechar.onclick = null;
    if (btnCancelar) btnCancelar.onclick = null;
    if (btnGerar) btnGerar.onclick = null;
    if (btnFocarCad) btnFocarCad.onclick = null;
  };

  return { abrir, fechar: () => fechar(), destruir };
}
