import { createIcons, Crosshair, LayoutDashboard, Cpu, FolderTree, History, MapPin, ChevronRight, ChevronLeft, FolderOpen, RefreshCw, Bell, Settings, Plus, Play, X, Trash2, Download, Upload, Map as MapIcon, Terminal, Activity, Database, CheckCircle2, AlertCircle, ExternalLink, Users, Edit, Home } from 'lucide';

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
   v = v.replace(/\D/g, '').slice(0, 13);
   if (v.length > 12) {
      v = v.replace(/^(\d{3})(\d{3})(\d{3})(\d{3})(\d{1})$/, "$1.$2.$3.$4-$5");
   } else if (v.length > 9) {
      v = v.replace(/^(\d{3})(\d{3})(\d{3})(\d{1,3})$/, "$1.$2.$3.$4");
   } else if (v.length > 6) {
      v = v.replace(/^(\d{3})(\d{3})(\d{1,3})$/, "$1.$2.$3");
   } else if (v.length > 3) {
      v = v.replace(/^(\d{3})(\d{1,3})$/, "$1.$2");
   }
   return v;
};

// Initialize Icons
export const initIcons = () => {
  createIcons({
    icons: { Crosshair, LayoutDashboard, Cpu, FolderTree, History, MapPin, ChevronRight, ChevronLeft, FolderOpen, RefreshCw, Bell, Settings, Plus, Play, X, Trash2, Download, Upload, MapIcon, Terminal, Activity, Database, CheckCircle2, AlertCircle, ExternalLink, Users, Edit, Home }
  });
};

// --- CONTROLE DE TIMERS E INTERVALOS ---
let activeIntervals: number[] = [];

export const registerInterval = (id: number) => {
  activeIntervals.push(id);
};

export const clearTimeoutsAndIntervals = () => {
  activeIntervals.forEach(id => clearInterval(id));
  activeIntervals = [];
};

