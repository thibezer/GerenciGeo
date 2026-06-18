import { createIcons, Crosshair, LayoutDashboard, Cpu, FolderTree, History, MapPin, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, FolderOpen, RefreshCw, Bell, Settings, Plus, Play, X, Trash2, Download, Upload, Map as MapIcon, Terminal, Activity, Database, CheckCircle2, AlertCircle, ExternalLink, Users, Edit, Home, Lock, Unlock, Globe } from 'lucide';

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
   const d = v.replace(/\D/g, '').slice(0, 13);
   if (d.length === 13) {
      return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{3})(\d{1})$/, "$1.$2.$3.$4-$5");
   }
   return d;
};

// Initialize Icons
export const initIcons = () => {
  createIcons({
    icons: { Crosshair, LayoutDashboard, Cpu, FolderTree, History, MapPin, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, FolderOpen, RefreshCw, Bell, Settings, Plus, Play, X, Trash2, Download, Upload, MapIcon, Terminal, Activity, Database, CheckCircle2, AlertCircle, ExternalLink, Users, Edit, Home, Lock, Unlock, Globe }
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

