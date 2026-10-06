import L from 'leaflet';

/** Trecho contínuo do perímetro que pertence a um mesmo confrontante (ou a nenhum). */
export interface TrechoMapa {
  confrontante_id: number | null;
  nome?: string | null;
  de: string;
  para: string;
  qtd_divisas: number;
  comprimento_m: number;
  coords: [number, number][];
}

const PANE = 'confrontantesPane';
const PRETO = '#000000';
const BRANCO = '#ffffff';
const CINZA = '#9ca3af';      // desempate quando o nº de confrontantes é ímpar (último encosta no primeiro)
const SEM_CONFRONTANTE = '#ef4444';

/**
 * Desenha o perímetro colorindo cada confrontante alternadamente em preto e branco, cada linha com um
 * contorno da cor oposta para continuar legível sobre o satélite.
 */
export class CamadaConfrontantes {
  private map: L.Map | null = null;
  private grupo = L.layerGroup();
  private linhasPorConfrontante = new Map<number, L.Polyline[]>();
  private trechos: TrechoMapa[] = [];
  private visivel = true;

  /** Associa ao mapa (idempotente). Retorna false se o mapa ainda não existe. */
  anexar(map: L.Map | null): boolean {
    if (!map) return false;
    if (this.map !== map) {
      this.remover();
      this.map = map;
      if (!map.getPane(PANE)) {
        const pane = map.createPane(PANE);
        pane.style.zIndex = '470';
      }
      this.desenhar();
    }
    return true;
  }

  setDados(trechos: TrechoMapa[]) {
    this.trechos = trechos;
    this.desenhar();
  }

  setVisivel(visivel: boolean) {
    this.visivel = visivel;
    this.sincronizar();
  }

  /** Remove do mapa (ex.: ao sair da aba), mantendo os dados. */
  remover() {
    if (this.map && this.map.hasLayer(this.grupo)) this.map.removeLayer(this.grupo);
    this.map = null;
  }

  limites(): L.LatLngBounds | null {
    const pts = this.trechos.flatMap(t => t.coords);
    return pts.length ? L.latLngBounds(pts) : null;
  }

  enquadrar(padding = 40) {
    const b = this.limites();
    // animate:false — o Leaflet ignora fitBounds animado enquanto outra animação de zoom está em curso
    if (this.map && b && b.isValid()) this.map.fitBounds(b, { padding: [padding, padding], maxZoom: 19, animate: false });
  }

  /** Enquadra os trechos de um confrontante e pisca as linhas. */
  focar(confrontanteId: number) {
    const linhas = this.linhasPorConfrontante.get(confrontanteId);
    if (!this.map || !linhas?.length) return;
    const b = L.latLngBounds(linhas.flatMap(l => l.getLatLngs() as L.LatLng[]));
    if (b.isValid()) this.map.fitBounds(b, { padding: [60, 60], maxZoom: 19, animate: false });
    linhas.forEach(l => l.setStyle({ weight: 7 }));
    setTimeout(() => linhas.forEach(l => l.setStyle({ weight: 4 })), 900);
  }

  private sincronizar() {
    if (!this.map) return;
    const naTela = this.map.hasLayer(this.grupo);
    if (this.visivel && !naTela) this.grupo.addTo(this.map);
    else if (!this.visivel && naTela) this.map.removeLayer(this.grupo);
  }

  private desenhar() {
    this.grupo.clearLayers();
    this.linhasPorConfrontante.clear();
    if (!this.map) return;

    // Índice de cor por ordem de primeira aparição no perímetro
    const ordem: number[] = [];
    this.trechos.forEach(t => {
      if (t.confrontante_id !== null && !ordem.includes(t.confrontante_id)) ordem.push(t.confrontante_id);
    });

    const corDe = (id: number) => {
      const i = ordem.indexOf(id);
      if (ordem.length > 1 && ordem.length % 2 === 1 && i === ordem.length - 1) return CINZA;
      return i % 2 === 0 ? PRETO : BRANCO;
    };

    this.trechos.forEach(t => {
      if (t.coords.length < 2) return;
      const semConf = t.confrontante_id === null;
      const cor = semConf ? SEM_CONFRONTANTE : corDe(t.confrontante_id!);
      const contorno = cor === PRETO ? BRANCO : PRETO;
      const rotulo = semConf
        ? `Sem confrontante · ${t.de} ➔ ${t.para}`
        : `${t.nome || 'Confrontante'} · ${t.de} ➔ ${t.para}`;

      // Contorno + linha: o contorno garante contraste do branco no fundo claro e do preto no escuro
      L.polyline(t.coords, { pane: PANE, color: contorno, weight: 7, opacity: 0.85, interactive: false, lineCap: 'butt' }).addTo(this.grupo);
      const linha = L.polyline(t.coords, {
        pane: PANE, color: cor, weight: 4, opacity: 1, lineCap: 'butt',
        dashArray: semConf ? '8 8' : undefined,
      }).bindTooltip(rotulo, { sticky: true, direction: 'top' }).addTo(this.grupo);

      if (!semConf) {
        const lista = this.linhasPorConfrontante.get(t.confrontante_id!) || [];
        lista.push(linha);
        this.linhasPorConfrontante.set(t.confrontante_id!, lista);
      }
    });

    this.sincronizar();
  }
}
