export interface MapaConfiguracoes {
  perimetroWeight: number;
  fechamentoWeight: number;
  vizinhoWeight: number;
  bancoWeight: number;
  markerSizeBase: number;
  markerStyleM?: string;
  markerSizeM?: number;
  markerStyleP?: string;
  markerSizeP?: number;
  markerStyleV?: string;
  markerSizeV?: number;
  enableAnimations: boolean;
  preferCanvas: boolean;
  crosshair?: boolean;
  satOpacity?: number;
  magnetSnap?: boolean;
}

const DEFAULT_CONFIG: MapaConfiguracoes = {
  perimetroWeight: 1,
  fechamentoWeight: 1,
  vizinhoWeight: 1,
  bancoWeight: 1,
  markerSizeBase: 10,
  markerStyleM: 'circle-dot',
  markerSizeM: 14,
  markerStyleP: 'circle',
  markerSizeP: 10,
  markerStyleV: 'cross',
  markerSizeV: 8,
  enableAnimations: false,
  preferCanvas: true,
  crosshair: false,
  satOpacity: 1.0,
  magnetSnap: false
};

export class MapaConfigManager {
  private static instance: MapaConfigManager;
  private config: MapaConfiguracoes;

  private constructor() {
    this.config = this.loadConfig();
  }

  public static getInstance(): MapaConfigManager {
    if (!MapaConfigManager.instance) {
      MapaConfigManager.instance = new MapaConfigManager();
    }
    return MapaConfigManager.instance;
  }

  private loadConfig(): MapaConfiguracoes {
    try {
      const saved = localStorage.getItem('gerencigeo_mapa_config');
      if (saved) {
        return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.error('Erro ao carregar configurações do mapa', e);
    }
    return { ...DEFAULT_CONFIG };
  }

  public saveConfig(newConfig: Partial<MapaConfiguracoes>) {
    this.config = { ...this.config, ...newConfig };
    localStorage.setItem('gerencigeo_mapa_config', JSON.stringify(this.config));
  }

  public getConfig(): MapaConfiguracoes {
    this.config = this.loadConfig();
    return { ...this.config };
  }
}
