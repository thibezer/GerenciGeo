import '../design-engine.css';
import './gg-lista-flutuante/gg-lista-flutuante';
import './gg-botao-primario/gg-botao-primario';
import type { GGListaFlutuante } from './gg-lista-flutuante/gg-lista-flutuante';

document.addEventListener('DOMContentLoaded', () => {
  const logBox = document.getElementById('log-console') as HTMLPreElement;

  function registrarLog(mensagem: string) {
    const timestamp = new Date().toLocaleTimeString();
    if (logBox) {
      logBox.textContent = `[${timestamp}] ${mensagem}\n` + logBox.textContent;
    }
    console.log(`[Teste UI Kit] ${mensagem}`);
  }

  // Configuração da Lista Flutuante 1 (Lotes)
  const listaLotes = document.getElementById('demo-lista-lotes') as GGListaFlutuante | null;
  if (listaLotes) {
    listaLotes.itens = [
      { id: '1', label: 'Gleba A - Lote 01' },
      { id: '2', label: 'Gleba A - Lote 02' },
      { id: '3', label: 'Gleba B - Fazenda Esperança' },
      { id: '4', label: 'Gleba C - Reserva Legal' }
    ];
    listaLotes.value = '1';

    listaLotes.addEventListener('gg-selecionar', (e: Event) => {
      const customEvent = e as CustomEvent;
      registrarLog(`gg-lista-flutuante (Lotes) -> Selecionado: ${JSON.stringify(customEvent.detail)}`);
    });
  }

  // Configuração da Lista Flutuante 2 (Sistemas de Coordenadas)
  const listaCrs = document.getElementById('demo-lista-crs') as GGListaFlutuante | null;
  if (listaCrs) {
    listaCrs.itens = [
      { id: 'SIRGAS2000_22S', label: 'SIRGAS 2000 / UTM 22S (EPSG:31982)' },
      { id: 'SIRGAS2000_21S', label: 'SIRGAS 2000 / UTM 21S (EPSG:31981)' },
      { id: 'SAD69_22S', label: 'SAD69 / UTM 22S (EPSG:29192)' },
      { id: 'WGS84_GEO', label: 'WGS 84 (Geográficas)' }
    ];
    listaCrs.value = 'SIRGAS2000_22S';

    listaCrs.addEventListener('gg-selecionar', (e: Event) => {
      const customEvent = e as CustomEvent;
      registrarLog(`gg-lista-flutuante (CRS) -> Selecionado: ${JSON.stringify(customEvent.detail)}`);
    });
  }

  // Event Listeners dos Botões
  const btnSalvar = document.getElementById('btn-salvar');
  if (btnSalvar) {
    btnSalvar.addEventListener('gg-click', () => {
      registrarLog('gg-botao-primario (Salvar) -> Clique recebido!');
    });
  }

  const btnDestaque = document.getElementById('btn-destaque');
  if (btnDestaque) {
    btnDestaque.addEventListener('gg-click', () => {
      registrarLog('gg-botao-primario (Processar RTK) -> Clique em destaque recebido!');
    });
  }

  const btnDesabilitado = document.getElementById('btn-desabilitado');
  if (btnDesabilitado) {
    btnDesabilitado.addEventListener('gg-click', () => {
      registrarLog('ERRO: Botão desabilitado disparou clique!');
    });
  }

  registrarLog('Página de testes locais de componentes UI inicializada com sucesso.');
});
