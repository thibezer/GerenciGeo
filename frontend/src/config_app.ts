import { MapaConfigManager } from './views/mapa_config';

document.addEventListener('DOMContentLoaded', () => {
  const configManager = MapaConfigManager.getInstance();
  const config = configManager.getConfig();

  // Elementos
  const tabs = document.querySelectorAll('.tab-btn');
  const panes = document.querySelectorAll('.tab-pane');

  const chkCrosshair = document.getElementById('chk-crosshair') as HTMLInputElement;
  const sldSatOpacity = document.getElementById('sld-sat-opacity') as HTMLInputElement;
  const valSatOpacity = document.getElementById('val-sat-opacity') as HTMLElement;
  
  const chkMagnet = document.getElementById('chk-magnet') as HTMLInputElement;
  const sldMarkerSize = document.getElementById('sld-marker-size') as HTMLInputElement;
  const previewMarker = document.getElementById('preview-marker') as HTMLElement;

  const sldPerimetroWeight = document.getElementById('sld-perimetro-weight') as HTMLInputElement;
  const valPerimetroWeight = document.getElementById('val-perimetro-weight') as HTMLElement;
  const sldVizinhoWeight = document.getElementById('sld-vizinho-weight') as HTMLInputElement;
  const valVizinhoWeight = document.getElementById('val-vizinho-weight') as HTMLElement;

  const chkAnimations = document.getElementById('chk-animations') as HTMLInputElement;
  const chkCanvas = document.getElementById('chk-canvas') as HTMLInputElement;

  const selStyleM = document.getElementById('sel-style-m') as HTMLSelectElement;
  const sldSizeM = document.getElementById('sld-size-m') as HTMLInputElement;
  const valSizeM = document.getElementById('val-size-m') as HTMLElement;

  const selStyleP = document.getElementById('sel-style-p') as HTMLSelectElement;
  const sldSizeP = document.getElementById('sld-size-p') as HTMLInputElement;
  const valSizeP = document.getElementById('val-size-p') as HTMLElement;

  const selStyleV = document.getElementById('sel-style-v') as HTMLSelectElement;
  const sldSizeV = document.getElementById('sld-size-v') as HTMLInputElement;
  const valSizeV = document.getElementById('val-size-v') as HTMLElement;

  // Tabs Logic
  tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      const targetId = (e.target as HTMLElement).getAttribute('data-target');
      
      tabs.forEach(t => t.classList.remove('active'));
      panes.forEach(p => p.classList.remove('active'));
      
      tab.classList.add('active');
      if (targetId) {
        document.getElementById(targetId)?.classList.add('active');
      }
    });
  });

  // Init values
  const initForm = () => {
    chkCrosshair.checked = config.crosshair || false;
    
    const opacityVal = (config.satOpacity !== undefined ? config.satOpacity : 1.0) * 100;
    sldSatOpacity.value = opacityVal.toString();
    valSatOpacity.innerText = opacityVal.toString();

    chkMagnet.checked = config.magnetSnap !== undefined ? config.magnetSnap : false;
    
    sldMarkerSize.value = config.markerSizeBase.toString();
    previewMarker.style.width = `${config.markerSizeBase}px`;
    previewMarker.style.height = `${config.markerSizeBase}px`;

    sldPerimetroWeight.value = config.perimetroWeight.toString();
    valPerimetroWeight.innerText = config.perimetroWeight.toString();
    
    sldVizinhoWeight.value = config.vizinhoWeight.toString();
    valVizinhoWeight.innerText = config.vizinhoWeight.toString();

    chkAnimations.checked = config.enableAnimations;
    chkCanvas.checked = config.preferCanvas;

    selStyleM.value = config.markerStyleM || 'circle-dot';
    sldSizeM.value = (config.markerSizeM || 14).toString();
    valSizeM.innerText = sldSizeM.value;

    selStyleP.value = config.markerStyleP || 'circle';
    sldSizeP.value = (config.markerSizeP || 10).toString();
    valSizeP.innerText = sldSizeP.value;

    selStyleV.value = config.markerStyleV || 'cross';
    sldSizeV.value = (config.markerSizeV || 8).toString();
    valSizeV.innerText = sldSizeV.value;
  };

  // Listeners para visualização em tempo real na janela
  sldSatOpacity.addEventListener('input', (e) => {
    valSatOpacity.innerText = (e.target as HTMLInputElement).value;
  });
  sldMarkerSize.addEventListener('input', (e) => {
    const v = (e.target as HTMLInputElement).value;
    previewMarker.style.width = `${v}px`;
    previewMarker.style.height = `${v}px`;
  });
  sldPerimetroWeight.addEventListener('input', (e) => {
    valPerimetroWeight.innerText = (e.target as HTMLInputElement).value;
  });
  sldVizinhoWeight.addEventListener('input', (e) => {
    valVizinhoWeight.innerText = (e.target as HTMLInputElement).value;
  });
  sldSizeM.addEventListener('input', (e) => { valSizeM.innerText = (e.target as HTMLInputElement).value; });
  sldSizeP.addEventListener('input', (e) => { valSizeP.innerText = (e.target as HTMLInputElement).value; });
  sldSizeV.addEventListener('input', (e) => { valSizeV.innerText = (e.target as HTMLInputElement).value; });

  const saveToManager = () => {
    configManager.saveConfig({
      crosshair: chkCrosshair.checked,
      satOpacity: parseInt(sldSatOpacity.value) / 100.0,
      magnetSnap: chkMagnet.checked,
      markerSizeBase: parseInt(sldMarkerSize.value),
      perimetroWeight: parseFloat(sldPerimetroWeight.value),
      fechamentoWeight: parseFloat(sldPerimetroWeight.value), // sincronizado
      bancoWeight: parseFloat(sldPerimetroWeight.value), // sincronizado
      vizinhoWeight: parseFloat(sldVizinhoWeight.value),
      enableAnimations: chkAnimations.checked,
      preferCanvas: chkCanvas.checked,
      markerStyleM: selStyleM.value,
      markerSizeM: parseInt(sldSizeM.value),
      markerStyleP: selStyleP.value,
      markerSizeP: parseInt(sldSizeP.value),
      markerStyleV: selStyleV.value,
      markerSizeV: parseInt(sldSizeV.value)
    });
  };

  const broadcastChange = () => {
    const bc = new BroadcastChannel('gerencigeo_map_config');
    bc.postMessage('RELOAD_REQUIRED');
    bc.close();
  };

  const closeWindow = () => {
    try {
      if ((window as any).pywebview && (window as any).pywebview.api && typeof (window as any).pywebview.api.close === 'function') {
         (window as any).pywebview.api.close();
      } else {
         window.close();
      }
    } catch(e) {
      window.close();
    }
  };

  document.getElementById('btn-apply')?.addEventListener('click', () => {
    saveToManager();
    broadcastChange();
  });

  document.getElementById('btn-ok')?.addEventListener('click', () => {
    saveToManager();
    broadcastChange();
    closeWindow();
  });

  document.getElementById('btn-cancel')?.addEventListener('click', () => {
    closeWindow();
  });

  // Preenche dados iniciais
  initForm();
});
