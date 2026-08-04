import { createIcons, Crosshair, LayoutDashboard, Cpu, FolderTree, History, MapPin, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, FolderOpen, RefreshCw, Bell, Settings, Plus, Play, X, Trash2, Download, Upload, Map as MapIcon, Terminal, Activity, Database, CheckCircle2, AlertCircle, HelpCircle, ExternalLink, Users, Edit, Home, Lock, Unlock, Globe, FileCheck, Folder, LayoutGrid, List, Filter, UploadCloud, CornerDownRight, Check, Map, Save, Pentagon, FileText, Archive, FileSpreadsheet, ArrowUpDown, ShieldAlert, ArchiveX, ShieldCheck, Lightbulb, Minimize2, Layers, Scan, Edit3, Eye, FileEdit, UserCheck, FileSignature, BookOpen, Calendar, Minus, Square, FileSymlink, SlidersHorizontal, Search, FileBox, FileDigit, CloudLightning, Pause, Copy, Share2, Info } from 'lucide';

// --- FUNÇÕES AUXILIARES GLOBAIS DE VALIDAÇÃO E MÁSCARAS ---
export const formatarCAR = (v: string): string => {
   v = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 41);
   let res = "";
   if (v.length > 0) res += v.slice(0, 2);
   if (v.length > 2) res += "-" + v.slice(2, 9);
   if (v.length > 9) {
      res += "-" + v.slice(9, 13);
      let idx = 13;
      while (idx < v.length) {
         res += "." + v.slice(idx, idx + 4);
         idx += 4;
      }
   }
   return res;
};

export const formatarCCIR = (v: string): string => {
   let d = v.replace(/\D/g, '').slice(0, 13);
   d = d.replace(/^(\d{3})(\d)/, "$1.$2");
   d = d.replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3");
   d = d.replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3.$4");
   d = d.replace(/^(\d{3})\.(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3.$4-$5");
   return d;
};

/**
 * Formata coordenada UTM para exibição na tabela
 * Ex: 7412345.123 → "7.412.345,123"
 */
export const formatUTM = (val: number | null | undefined, casas = 3): string => {
  if (val === null || val === undefined || isNaN(val)) return '—';
  return val.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
};

/**
 * Formata diferença de posição em mm com sinal
 * Ex: 0.033 → "+33mm"
 */
export const formatDelta = (meters: number | null | undefined): string => {
  if (meters === null || meters === undefined || isNaN(meters)) return '—';
  const mm = Math.round(meters * 1000);
  return (mm >= 0 ? '+' : '') + mm + 'mm';
};

/**
 * Retorna classe CSS conforme tolerância INCRA Classe 3 (≤500mm)
 * ≤30mm: verde (ok), ≤100mm: amarelo (warn), >100mm: vermelho (err)
 */
export const deltaClass = (meters: number | null | undefined): string => {
  if (meters === null || meters === undefined || isNaN(meters)) return '';
  const mm = Math.abs(meters * 1000);
  if (mm <= 30)  return 'ok';
  if (mm <= 100) return 'warn';
  return 'err';
};

// Initialize Icons
export const initIcons = () => {
  createIcons({
    icons: { Crosshair, LayoutDashboard, Cpu, FolderTree, History, MapPin, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, FolderOpen, RefreshCw, Bell, Settings, Plus, Play, X, Trash2, Download, Upload, MapIcon, Terminal, Activity, Database, CheckCircle2, AlertCircle, HelpCircle, ExternalLink, Users, Edit, Home, Lock, Unlock, Globe, FileCheck, Folder, LayoutGrid, List, Filter, UploadCloud, CornerDownRight, Check, Map, Save, Pentagon, FileText, Archive, FileSpreadsheet, ArrowUpDown, ShieldAlert, ArchiveX, ShieldCheck, Lightbulb, Minimize2, Layers, Scan, Edit3, Eye, FileEdit, UserCheck, FileSignature, BookOpen, Calendar, Minus, Square, FileSymlink, SlidersHorizontal, Search, FileBox, FileDigit, CloudLightning, Pause, Copy, Share2, Info }
  });
};

// --- CONTROLE DE TIMERS E INTERVALOS ---
let activeIntervals: number[] = [];
let activeTimeouts: number[] = [];

export const registerInterval = (id: number) => {
  activeIntervals.push(id);
};

export const registerTimeout = (id: number) => {
  activeTimeouts.push(id);
};

export const clearTimeoutsAndIntervals = () => {
  activeIntervals.forEach(id => clearInterval(id));
  activeTimeouts.forEach(id => clearTimeout(id));
  activeIntervals = [];
  activeTimeouts = [];
};


// --- SISTEMA DE DIALOGS E TOASTS CUSTOMIZADOS ---
export interface DialogOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isAlert?: boolean;
}

export const showDialog = (options: DialogOptions): Promise<boolean> => {
  return new Promise((resolve) => {
    // Cria o overlay do modal
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-200 opacity-0';
    overlay.style.zIndex = '999999';
    
    // Cria o container do modal
    const container = document.createElement('div');
    container.className = 'w-full max-w-md mx-4 bg-[#111113] border border-white/10 rounded-technical shadow-2xl p-6 transform scale-95 transition-transform duration-200';
    container.style.backgroundColor = 'var(--geo-bg-surface, #111113)';
    container.style.borderRadius = 'var(--geo-radius-modal, 14px)';
    container.style.borderColor = 'var(--geo-border-default, rgba(255, 255, 255, 0.11))';
    container.style.color = 'var(--geo-text-primary, rgba(255, 255, 255, 0.92))';
    
    // Define o conteúdo HTML
    container.innerHTML = `
      <div class="flex flex-col gap-4">
        <h3 class="text-lg font-semibold tracking-tight text-white flex items-center gap-2">
          ${options.isAlert ? '<i data-lucide="alert-circle" class="text-yellow-500 w-5 h-5 shrink-0"></i>' : '<i data-lucide="help-circle" class="text-mint-vibrant w-5 h-5 shrink-0"></i>'}
          ${options.title}
        </h3>
        <div class="text-sm text-white/70 leading-relaxed font-sans" style="font-family: var(--geo-font-sans), sans-serif;">
          ${options.message}
        </div>
        <div class="flex justify-end gap-3 mt-2">
          ${!options.isAlert ? `
            <button id="dialog-cancel" class="px-4 py-2 text-sm font-medium rounded-technical bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 transition-all cursor-pointer">
              ${options.cancelText || 'Cancelar'}
            </button>
          ` : ''}
          <button id="dialog-confirm" class="px-4 py-2 text-sm font-bold rounded-technical bg-mint-vibrant text-forest-deep hover:brightness-110 active:scale-95 transition-all cursor-pointer">
            ${options.confirmText || 'Confirmar'}
          </button>
        </div>
      </div>
    `;
    
    overlay.appendChild(container);
    document.body.appendChild(overlay);
    
    // Inicializa os ícones do Lucide no dialog recém criado
    createIcons({
      icons: { AlertCircle, HelpCircle },
      nameAttr: 'data-lucide'
    });
    
    // Animação de entrada
    setTimeout(() => {
      overlay.classList.remove('opacity-0');
      container.classList.remove('scale-95');
    }, 10);
    
    // Funções de fechamento
    const closeDialog = (result: boolean) => {
      overlay.classList.add('opacity-0');
      container.classList.add('scale-95');
      setTimeout(() => {
        if (overlay.parentNode) {
          document.body.removeChild(overlay);
        }
        resolve(result);
      }, 200);
    };
    
    container.querySelector('#dialog-confirm')?.addEventListener('click', () => closeDialog(true));
    container.querySelector('#dialog-cancel')?.addEventListener('click', () => closeDialog(false));
    
    // Fechar ao clicar fora (se não for alerta)
    if (!options.isAlert) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeDialog(false);
      });
    }
  });
};

export const customAlert = (message: string, title: string = 'Aviso'): Promise<boolean> => {
  return showDialog({
    title,
    message,
    isAlert: true,
    confirmText: 'OK'
  });
};

export const customConfirm = (message: string, title: string = 'Confirmação'): Promise<boolean> => {
  return showDialog({
    title,
    message,
    isAlert: false,
    confirmText: 'Confirmar',
    cancelText: 'Cancelar'
  });
};

export const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info', duration: number = 3000) => {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'fixed bottom-5 right-5 flex flex-col gap-2 pointer-events-none';
    container.style.zIndex = '9999999';
    document.body.appendChild(container);
  }
  
  const toast = document.createElement('div');
  toast.className = 'flex items-center gap-3 px-4 py-3 rounded-technical shadow-lg border backdrop-blur-md transform translate-y-2 opacity-0 transition-all duration-300 pointer-events-auto max-w-sm';
  toast.style.borderRadius = 'var(--geo-radius-card, 9px)';
  toast.style.zIndex = '99999999';
  
  // Cores semânticas do design-engine
  if (type === 'success') {
    toast.className += ' bg-[#0c1c13]/90 border-[rgba(48,209,88,0.2)] text-[rgba(48,209,88,0.95)]';
  } else if (type === 'error') {
    toast.className += ' bg-[#1c0c0c]/90 border-[rgba(255,69,58,0.2)] text-[rgba(255,69,58,0.95)]';
  } else {
    toast.className += ' bg-[#111113]/90 border-white/10 text-white/90';
  }
  
  const icon = type === 'success' ? '✓' : type === 'error' ? '⚠' : 'ℹ';
  toast.innerHTML = `
    <span class="flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold bg-current/10 shrink-0">${icon}</span>
    <span class="text-sm font-sans font-medium" style="font-family: var(--geo-font-sans), sans-serif;">${message}</span>
  `;
  
  container.appendChild(toast);
  
  // Animação de entrada
  setTimeout(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  }, 10);
  
  // Remoção
  const removeToast = () => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => {
      if (container && toast.parentNode === container) {
        container.removeChild(toast);
      }
    }, 300);
  };
  
  setTimeout(removeToast, duration);
  toast.addEventListener('click', removeToast);
};

export const escapeHtml = (unsafe: string | null | undefined): string => {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};


