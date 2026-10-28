/**
 * Splitter vertical mapa | painel da etapa Peças de Cartório. A largura do mapa vai em --cartorio-map-w
 * (o CSS limita a 320px de mapa e 420px de painel) e é lembrada entre sessões. Teclado: setas (Shift = passo maior).
 */
const CHAVE_LARGURA = 'gerencigeo_cartorio_mapa_w';
const MIN_MAPA = 320;
const MIN_PAINEL = 426;

export function configurarSplitterCartorio(aoRedimensionar: () => void): void {
  const splitter = document.getElementById('splitter-cartorio');
  const area = document.querySelector<HTMLElement>('.workspace-main-content');
  const mapa = document.getElementById('container-mapa-leaflet-parent');
  if (!splitter || !area || !mapa || splitter.dataset.ligado === '1') return;
  splitter.dataset.ligado = '1';

  const aplicar = (px: number) => {
    const largura = Math.round(Math.max(MIN_MAPA, Math.min(px, area.clientWidth - MIN_PAINEL)));
    area.style.setProperty('--cartorio-map-w', `${largura}px`);
  };
  const salvar = () => {
    try { localStorage.setItem(CHAVE_LARGURA, String(Math.round(mapa.getBoundingClientRect().width))); } catch { /* ignora */ }
  };

  try {
    const salvo = Number(localStorage.getItem(CHAVE_LARGURA));
    if (salvo > 0) area.style.setProperty('--cartorio-map-w', `${salvo}px`);
  } catch { /* storage indisponível */ }

  let quadro = 0;
  const redimensionarMapa = () => {
    if (quadro) return;
    quadro = requestAnimationFrame(() => { quadro = 0; aoRedimensionar(); });
  };

  splitter.addEventListener('pointerdown', (e: PointerEvent) => {
    e.preventDefault();
    splitter.setPointerCapture(e.pointerId);
    splitter.classList.add('arrastando');
    const esquerda = area.getBoundingClientRect().left;
    const mover = (ev: PointerEvent) => { aplicar(ev.clientX - esquerda); redimensionarMapa(); };
    const soltar = () => {
      splitter.classList.remove('arrastando');
      splitter.removeEventListener('pointermove', mover);
      splitter.removeEventListener('pointerup', soltar);
      splitter.removeEventListener('pointercancel', soltar);
      salvar();
      aoRedimensionar();
    };
    splitter.addEventListener('pointermove', mover);
    splitter.addEventListener('pointerup', soltar);
    splitter.addEventListener('pointercancel', soltar);
  });

  splitter.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const passo = (e.shiftKey ? 96 : 24) * (e.key === 'ArrowLeft' ? -1 : 1);
    aplicar(mapa.getBoundingClientRect().width + passo);
    salvar();
    aoRedimensionar();
  });
}
