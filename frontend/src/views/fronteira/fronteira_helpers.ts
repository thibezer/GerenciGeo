/**
 * fronteira_helpers.ts — Constantes geodésicas e funções utilitárias puras do módulo Fronteira.
 * Nenhuma chamada de API aqui. Apenas cálculos, formatação e manipulação de DOM pontual.
 */
import { initIcons } from '../../utils';

// Coordenada do Paraguai/Fronteira estabelecida
export const BORDER_LAT = -24.0671222;
export const BORDER_LON = -54.2868778;

export const calcularHaversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; // Raio da Terra em km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const exibirDadosNoMonitor = (ref: string, status: string, lat: number, lon: number, dist: number) => {
  const monNome = document.getElementById('mon-vertice-nome');
  const monCoords = document.getElementById('mon-vertice-coords');
  const monDist = document.getElementById('mon-distancia');
  const monStatus = document.getElementById('mon-vertice-status');
  
  if (monNome) monNome.innerText = ref;
  if (monStatus) monStatus.innerText = status;
  if (monCoords) monCoords.innerText = lat === BORDER_LAT ? 'N/A' : `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  if (monDist) monDist.innerText = `${dist.toFixed(3)} km`;

  const alertaBox = document.getElementById('alerta-fronteira-legal');
  if (alertaBox) {
    if (dist <= 150) {
      alertaBox.className = "p-4 rounded-xl flex items-start gap-3 bg-red-500/10 border border-red-500/20 text-red-400 font-sans text-xs leading-relaxed";
      alertaBox.innerHTML = `
        <i data-lucide="shield-alert" class="w-5 h-5 shrink-0 mt-0.5 text-red-400"></i>
        <div>
          <p class="font-bold uppercase tracking-wider text-[10px]">Atenção: Imóvel dentro da Faixa de Fronteira</p>
          <p class="mt-1 text-white/70">O imóvel está situado a <strong>${dist.toFixed(3)} km</strong> da soberania nacional, enquadrando-se na Faixa de Segurança de 150 km. O processo de ratificação é <strong>obrigatório</strong>.</p>
        </div>
      `;
    } else {
      alertaBox.className = "p-4 rounded-xl flex items-start gap-3 bg-mint-vibrant/10 border border-mint-vibrant/20 text-mint-vibrant font-sans text-xs leading-relaxed";
      alertaBox.innerHTML = `
        <i data-lucide="shield-check" class="w-5 h-5 shrink-0 mt-0.5 text-mint-vibrant"></i>
        <div>
          <p class="font-bold uppercase tracking-wider text-[10px]">Imóvel fora da Faixa de Fronteira</p>
          <p class="mt-1 text-white/70">O imóvel está situado a <strong>${dist.toFixed(3)} km</strong> da divisa internacional. O processo de ratificação de fronteira da Lei 6.634/79 é <strong>dispensado</strong> de forma determinística.</p>
        </div>
      `;
    }
    initIcons();
  }
};

export const tratarExibicaoConjuge = (estadoCivil: string, modalConjugeRow: HTMLElement | null) => {
  if (!modalConjugeRow) return;
  const ec = String(estadoCivil).trim().toLowerCase();
  if (ec.includes("casado") || ec.includes("estável") || ec.includes("estavel")) {
    modalConjugeRow.classList.remove('hidden');
    (document.getElementById('modal-owner-conjuge-nome') as HTMLInputElement).required = true;
    (document.getElementById('modal-owner-conjuge-cpf') as HTMLInputElement).required = true;
    (document.getElementById('modal-owner-conjuge-rg') as HTMLInputElement).required = true;
  } else {
    modalConjugeRow.classList.add('hidden');
    (document.getElementById('modal-owner-conjuge-nome') as HTMLInputElement).required = false;
    (document.getElementById('modal-owner-conjuge-cpf') as HTMLInputElement).required = false;
    (document.getElementById('modal-owner-conjuge-rg') as HTMLInputElement).required = false;
  }
};

export const verificarInputsFaltantesModal = (modal: HTMLElement | null) => {
  const inputs = modal?.querySelectorAll('input[required]') as NodeListOf<HTMLInputElement>;
  inputs?.forEach(inp => {
    const lidarVal = () => {
      if (!inp.value.trim()) {
        inp.classList.add('border-red-500/50', 'bg-red-500/5', 'text-red-200');
        inp.classList.remove('border-white/10');
      } else {
        inp.classList.remove('border-red-500/50', 'bg-red-500/5', 'text-red-200');
        inp.classList.add('border-white/10');
      }
    };
    lidarVal();
    inp.addEventListener('input', lidarVal);
  });
};

export const verificarHabilitacaoBotao = (currentPropId: number | null, currentProfId: number | null, btnSubmit: HTMLButtonElement) => {
  const checkboxes = document.querySelectorAll('input[name="selected-matriculas"]:checked');
  if (currentPropId && checkboxes.length > 0 && currentProfId) {
    btnSubmit.disabled = false;
    btnSubmit.classList.remove('opacity-50', 'cursor-not-allowed');
  } else {
    btnSubmit.disabled = true;
    btnSubmit.classList.add('opacity-50', 'cursor-not-allowed');
  }
};
