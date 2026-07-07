# GerenciGeo — Manual de Design UI: Workstation Geoespacial

**Versão 1.0 | Documento de referência para implementação da interface estilo CAD/GIS**

---

## Sumário

1. [Filosofia e Princípios Fundamentais](#1-filosofia-e-princípios-fundamentais)
2. [Arquitetura da Interface: Zonas e Hierarquia](#2-arquitetura-da-interface-zonas-e-hierarquia)
3. [Ribbon de 3 Camadas — Especificação Completa](#3-ribbon-de-3-camadas--especificação-completa)
4. [Painel de Propriedades](#4-painel-de-propriedades)
5. [Tabela de Vértices Geodésicos](#5-tabela-de-vértices-geodésicos)
6. [Área de Visualização (Mapa Leaflet)](#6-área-de-visualização-mapa-leaflet)
7. [Sistema de Notificações e Feedback](#7-sistema-de-notificações-e-feedback)
8. [Tokens de Design e CSS](#8-tokens-de-design-e-css)
9. [Comportamentos de Interação](#9-comportamentos-de-interação)
10. [Layout Geral e Cálculo de Viewport](#10-layout-geral-e-cálculo-de-viewport)
11. [Guia de Implementação por Componente](#11-guia-de-implementação-por-componente)
12. [Checklist de Qualidade](#12-checklist-de-qualidade)

---

## 1. Filosofia e Princípios Fundamentais

### 1.1 Prioridade: Usabilidade sobre Estética

O GerenciGeo é uma **ferramenta de trabalho técnico**, não um painel de marketing. A interface deve se comportar como o AutoCAD ou o ArcGIS Pro: invisível quando tudo vai bem, precisa quando o técnico precisa de informação.

**Hierarquia de decisão de design (em ordem):**

1. **Eficiência de tarefa** — a ação mais comum deve exigir o menor número de cliques e movimentos de mouse.
2. **Legibilidade de dados** — coordenadas UTM, diferenças de posição (ΔN, ΔE), status de pontos devem ser imediatamente legíveis sem esforço visual.
3. **Prevenção de erros** — confirmações para ações destrutivas, estados de seleção sempre visíveis, feedback imediato de operações.
4. **Consistência** — um componente com a mesma função deve ter a mesma aparência em todos os contextos.
5. **Estética** — o visual escuro, técnico e limpo serve à legibilidade; não é um fim em si mesmo.

### 1.2 O Modelo Mental do Técnico de Campo

O técnico de georreferenciamento usa o GerenciGeo **após** o trabalho de campo. Ele tem:
- Dezenas de arquivos `.GNS` ou `.TXT` para processar
- Coordenadas brutas para auditar contra o padrão PPP
- Uma sequência de caminhamento para ordenar e verificar
- Documentos para gerar (laudo técnico, requerimento CRI, declaração de anuência)

A interface deve respeitar esse **fluxo de trabalho linear** (ingestão → auditoria → organização → documentação) e tornar cada etapa óbvia e sem ambiguidade.

### 1.3 Referências de Mercado

| Software | O que adotar |
|----------|-------------|
| **AutoCAD 2025** | Ribbon de 3 camadas, Quick Access Toolbar (QAT), painéis expansíveis com pin |
| **ArcGIS Pro 3.4** | Abas contextuais, painel de propriedades dockável, tabela de atributos abaixo do mapa |
| **QGIS** | Barra de status com coordenadas em tempo real, escala gráfica sempre visível |
| **Topcon Tools** | Organização por levantamento > matrícula > ponto, importação em lote com triagem |

---

## 2. Arquitetura da Interface: Zonas e Hierarquia

### 2.1 Layout Fixo de Viewport (Sem Scroll de Página)

O GerenciGeo na Mesa de Trabalho deve se comportar como um aplicativo desktop nativo. **A página inteira não rola.** Apenas as zonas internas têm scroll próprio.

```
┌─────────────────────────────────────────────────────────────┐
│  RIBBON — CAMADA 1: App Bar (altura fixa: 30px)             │
├─────────────────────────────────────────────────────────────┤
│  RIBBON — CAMADA 2: Metadados do Projeto (altura fixa: 32px) │
├─────────────────────────────────────────────────────────────┤
│  RIBBON — CAMADA 3: Abas de Ferramentas (altura fixa: 87px) │
│  [Tabs: Mesa Geodésica | Org. Perímetro | Cartório | Audit] │
│  [Painéis de tools dentro da aba ativa]                     │
├───────────────────┬─────────────────────────────────────────┤
│  PAINEL DE        │  ÁREA DE VISUALIZAÇÃO (Mapa Leaflet)     │
│  PROPRIEDADES     │  Altura: calc(100vh - 149px - 280px)     │
│  (largura: 280px) │  Scroll: não                            │
│  Scroll: sim      │                                         │
│                   ├─────────────────────────────────────────┤
│                   │  TABELA DE VÉRTICES GEODÉSICOS           │
│                   │  Altura fixa: ~280px                    │
│                   │  Scroll: sim (overflow-y: auto)         │
└───────────────────┴─────────────────────────────────────────┘
│  STATUS BAR (altura fixa: 24px)                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Cálculo de Alturas

```css
/* Alturas fixas da Ribbon */
--ribbon-layer1-h: 30px;
--ribbon-layer2-h: 32px;
--ribbon-layer3-h: 87px;  /* 32px tabs + 55px painéis */
--ribbon-total-h: 149px;  /* soma das 3 camadas */

/* Status bar */
--statusbar-h: 24px;

/* Área de trabalho disponível */
--workspace-h: calc(100vh - var(--ribbon-total-h) - var(--statusbar-h));

/* Divisão vertical interna */
--map-area-h: calc(var(--workspace-h) - 280px);  /* mapa */
--table-area-h: 280px;                            /* tabela vértices */

/* Painel de propriedades */
--props-panel-w: 280px;  /* colapsável para 36px */
```

### 2.3 Grid de Conteúdo

```css
.workspace-body {
  display: grid;
  grid-template-columns: var(--props-panel-w) 1fr;
  grid-template-rows: var(--map-area-h) var(--table-area-h);
  height: var(--workspace-h);
  overflow: hidden;
}

.props-panel  { grid-row: 1 / 3; grid-column: 1; overflow-y: auto; }
.map-area     { grid-row: 1;     grid-column: 2; }
.table-area   { grid-row: 2;     grid-column: 2; overflow: hidden; }
```

---

## 3. Ribbon de 3 Camadas — Especificação Completa

### 3.1 Camada 1 — App Bar (Application Menu Bar)

**Altura:** 30px  
**Cor de fundo:** `#0b0d0c` (mais escuro que o workspace, cria hierarquia visual)  
**Borda inferior:** `0.5px solid rgba(255,255,255,0.06)`

#### Elementos da Camada 1 (da esquerda para direita):

```
[GerenciGeo] | [← Voltar] [💾 Salvar] | ... espaço flex ... | [Fuso: 22S ▾] [Mat: 001/002 ▾] [👤 Admin]
```

| Elemento | Tipo | Largura | Comportamento |
|----------|------|---------|---------------|
| Nome | Static | 120px | Nenhum |
| Separador | `1px solid rgba(255,255,255,0.08)` | 1px | — |
| ← Voltar | Ghost button | 72px | `window.location.hash = '#levantamentos'` |
| 💾 Salvar | Ghost button | 72px | Salva rascunho local + POST API |
| (flex-1 espaço) | — | auto | — |
| Fuso UTM | Select compacto | 90px | Altera `ctx.modoCoordenadas` e fuso |
| Matrícula ativa | Select compacto | 120px | `ctx.switchMatriculaTab()` |
| Avatar Admin | Circle 20px | 30px | Abre configurações |

**Regra crítica:** Nenhum elemento na App Bar deve ter altura visual maior que 24px. Ela é uma banda estreita de contexto, não de ação primária.

```html
<!-- Estrutura HTML da Camada 1 -->
<div id="ribbon-layer1" class="ribbon-layer1">
  <div class="rl1-brand">
    <span class="rl1-logo-text">Gerenci<span class="accent">Geo</span></span>
  </div>
  <div class="rl1-separator"></div>
  <div class="rl1-qat">
    <button class="rl1-btn" id="btn-voltar-lista" title="Voltar para levantamentos (Esc)">
      <i data-lucide="chevron-left"></i><span>Voltar</span>
    </button>
    <button class="rl1-btn" id="btn-salvar-rascunho" title="Salvar rascunho (Ctrl+S)">
      <i data-lucide="save"></i><span>Salvar</span>
    </button>
  </div>
  <div class="rl1-spacer"></div>
  <div class="rl1-context">
    <label class="rl1-select-label">Fuso</label>
    <select id="select-fuso-ribbon" class="rl1-select">
      <option value="22">22S</option>
      <option value="23">23S</option>
    </select>
    <label class="rl1-select-label">Matrícula</label>
    <select id="select-matricula-ribbon" class="rl1-select" style="min-width:110px">
      <!-- Preenchido dinamicamente -->
    </select>
  </div>
  <div class="rl1-separator"></div>
  <div class="rl1-user">
    <div class="rl1-avatar">AD</div>
  </div>
</div>
```

### 3.2 Camada 2 — Metadados do Projeto (Project Info Bar)

**Altura:** 32px  
**Cor de fundo:** `#0d1410`  
**Borda inferior:** `0.5px solid rgba(255,255,255,0.04)`

Esta camada exibe dados do projeto ativo de forma compacta e **nunca muda** com a aba selecionada. É persistente.

```
[Nome da propriedade] [• badge status •] [|] [Cliente: João da Silva (100%)] [|] [CAR: PR-0000...] [|] [TRT: 2026123456]
```

```html
<!-- Estrutura HTML da Camada 2 -->
<div id="ribbon-layer2" class="ribbon-layer2">
  <span class="rl2-prop-name" id="txt-nome-propriedade">Carregando...</span>
  <span class="rl2-badge" id="badge-status-lev">—</span>
  <div class="rl2-sep"></div>
  <span class="rl2-meta-item">
    <span class="rl2-meta-label">Cliente:</span>
    <span class="rl2-meta-value" id="txt-nome-cliente">—</span>
  </span>
  <div class="rl2-sep"></div>
  <span class="rl2-meta-item">
    <span class="rl2-meta-label">CAR:</span>
    <span class="rl2-meta-value font-mono" id="txt-codigo-car">—</span>
  </span>
  <div class="rl2-sep"></div>
  <span class="rl2-meta-item">
    <span class="rl2-meta-label">TRT:</span>
    <span class="rl2-meta-value font-mono" id="txt-numero-trt">—</span>
  </span>
</div>
```

### 3.3 Camada 3 — Abas de Ferramentas (Tool Tabs)

**Altura total:** 87px  
- Sub-camada das tabs: 32px  
- Sub-camada dos painéis: 55px  
**Cor de fundo:** `#111714`  
**Borda inferior:** `1px solid rgba(255,255,255,0.08)` (divisória com o workspace)

#### 3.3.1 Estrutura de Tabs

```html
<div id="ribbon-layer3" class="ribbon-layer3">
  <!-- Sub-camada 3a: Abas de navegação -->
  <div class="rl3-tabs" role="tablist">
    <button class="rl3-tab active" id="tab-geoprocessamento" role="tab" aria-selected="true"
            aria-controls="panel-geoprocessamento">
      <i data-lucide="cpu" aria-hidden="true"></i>
      Mesa Geodésica
    </button>
    <button class="rl3-tab" id="tab-perimetro" role="tab" aria-selected="false"
            aria-controls="panel-perimetro">
      <i data-lucide="pentagon" aria-hidden="true"></i>
      Org. de Perímetro
    </button>
    <button class="rl3-tab" id="tab-cartorio" role="tab" aria-selected="false"
            aria-controls="panel-cartorio">
      <i data-lucide="file-text" aria-hidden="true"></i>
      Peças de Cartório
    </button>
    <button class="rl3-tab" id="tab-auditoria" role="tab" aria-selected="false"
            aria-controls="panel-auditoria">
      <i data-lucide="history" aria-hidden="true"></i>
      Histórico de Auditoria
    </button>
  </div>

  <!-- Sub-camada 3b: Painéis de ferramentas (um por aba) -->
  <div class="rl3-panels">

    <!-- PAINEL: Mesa Geodésica -->
    <div class="rl3-panel" id="panel-geoprocessamento" role="tabpanel">
      
      <!-- Grupo: Ingestão -->
      <div class="rl3-group">
        <div class="rl3-group-tools">
          <button class="rl3-tool-btn rl3-btn-lg" id="btn-drop-arquivos" title="Arraste ou selecione arquivos .GNS/.TXT">
            <i data-lucide="upload-cloud"></i>
            <span>Ingestão</span>
          </button>
          <button class="rl3-tool-btn" id="btn-processar-lote" title="Processar todos os arquivos na fila (F5)">
            <i data-lucide="play"></i>
            <span>Processar Lote</span>
          </button>
        </div>
        <div class="rl3-group-label">Ingestão</div>
      </div>
      <div class="rl3-divider"></div>

      <!-- Grupo: Coordenadas -->
      <div class="rl3-group">
        <div class="rl3-group-tools">
          <div class="rl3-toggle-row">
            <span class="rl3-toggle-label">Modo:</span>
            <button class="rl3-toggle-btn active" id="btn-modo-utm" data-mode="utm">UTM</button>
            <button class="rl3-toggle-btn" id="btn-modo-geo" data-mode="geodesico">Geodésico</button>
          </div>
          <button class="rl3-tool-btn" id="btn-download-rinex-zip" title="Baixar todos os RINEX do workspace como ZIP">
            <i data-lucide="archive"></i>
            <span>RINEX .ZIP</span>
          </button>
        </div>
        <div class="rl3-group-label">Coordenadas</div>
      </div>
      <div class="rl3-divider"></div>

      <!-- Grupo: Exportar -->
      <div class="rl3-group">
        <div class="rl3-group-tools">
          <button class="rl3-tool-btn" id="btn-exportar-kml">
            <i data-lucide="map-pin"></i>
            <span>KML</span>
          </button>
          <button class="rl3-tool-btn" id="btn-unificar-sigef">
            <i data-lucide="file-spreadsheet"></i>
            <span>Unificar SIGEF</span>
          </button>
          <button class="rl3-tool-btn" id="btn-consolidar-pontos-utm">
            <i data-lucide="download"></i>
            <span>Exportar CSV</span>
          </button>
        </div>
        <div class="rl3-group-label">Exportar</div>
      </div>
      <div class="rl3-divider"></div>

      <!-- Grupo: Edição -->
      <div class="rl3-group">
        <div class="rl3-group-tools">
          <button class="rl3-tool-btn" id="btn-reordenar-caminhamento" title="Ativar modo de reordenação manual do caminhamento">
            <i data-lucide="arrow-up-down"></i>
            <span>Reordenar</span>
          </button>
          <button class="rl3-tool-btn rl3-btn-warn" id="btn-override-base-manual" title="Sobrescrever ponto base manualmente">
            <i data-lucide="shield-alert"></i>
            <span>Base Manual</span>
          </button>
        </div>
        <div class="rl3-group-label">Edição</div>
      </div>
      <div class="rl3-divider"></div>

      <!-- Grupo: Sincronizar -->
      <div class="rl3-group">
        <div class="rl3-group-tools">
          <button class="rl3-tool-btn" id="btn-sincronizar-nuvem">
            <i data-lucide="cloud-lightning"></i>
            <span>Nuvem</span>
          </button>
          <button class="rl3-tool-btn rl3-btn-danger" id="btn-arquivar-projeto-seguro" title="Arquivar este levantamento (ação irreversível)">
            <i data-lucide="archive-x"></i>
            <span>Arquivar</span>
          </button>
        </div>
        <div class="rl3-group-label">Projeto</div>
      </div>
    </div>

    <!-- PAINEL: Organizador de Perímetro (hidden por padrão) -->
    <div class="rl3-panel hidden" id="panel-perimetro" role="tabpanel">
      <!-- ... ferramentas específicas de reordenação e topologia ... -->
    </div>

    <!-- PAINEL: Peças de Cartório (hidden por padrão) -->
    <div class="rl3-panel hidden" id="panel-cartorio" role="tabpanel">
      <!-- ... ferramentas de geração de documentos ... -->
    </div>

    <!-- PAINEL: Histórico de Auditoria (hidden por padrão) -->
    <div class="rl3-panel hidden" id="panel-auditoria" role="tabpanel">
      <!-- ... ferramentas de auditoria e histórico ... -->
    </div>

  </div>
</div>
```

#### 3.3.2 CSS da Ribbon Completa

```css
/* ===================================================
   RIBBON — SISTEMA COMPLETO
   =================================================== */

/* Camada 1 */
.ribbon-layer1 {
  height: var(--ribbon-layer1-h, 36px);
  background: #0b0d0c;
  border-bottom: 0.5px solid rgba(255,255,255,0.06);
  display: flex;
  align-items: center;
  padding: 0 8px;
  gap: 0;
  user-select: none;
  flex-shrink: 0;
}

.rl1-brand {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  min-width: 140px;
}
.rl1-logo-icon { width: 18px; height: 18px; color: var(--geo-accent); }
.rl1-logo-text { font-size: 13px; font-weight: 700; color: rgba(255,255,255,0.9); }
.rl1-logo-text .accent { color: var(--geo-accent); }

.rl1-separator {
  width: 1px;
  height: 20px;
  background: rgba(255,255,255,0.08);
  margin: 0 4px;
  flex-shrink: 0;
}

.rl1-qat {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 4px;
}

.rl1-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  font-size: 11px;
  color: rgba(255,255,255,0.6);
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background 100ms, color 100ms;
  white-space: nowrap;
}
.rl1-btn:hover { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.9); }
.rl1-btn i { width: 13px; height: 13px; }

.rl1-spacer { flex: 1; }

.rl1-context {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
}

.rl1-select-label {
  font-size: 10px;
  color: rgba(255,255,255,0.35);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.rl1-select {
  height: 22px;
  padding: 0 6px;
  font-size: 11px;
  background: rgba(255,255,255,0.06);
  border: 0.5px solid rgba(255,255,255,0.12);
  border-radius: 3px;
  color: rgba(255,255,255,0.85);
  cursor: pointer;
  font-family: var(--geo-font-mono);
}
.rl1-select:focus { border-color: var(--geo-accent-border); outline: none; }

.rl1-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--geo-accent-bg);
  border: 1px solid var(--geo-accent-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 700;
  color: var(--geo-accent-text);
  cursor: pointer;
  margin: 0 4px;
}

/* Camada 2 */
.ribbon-layer2 {
  height: var(--ribbon-layer2-h, 32px);
  background: #0d1410;
  border-bottom: 0.5px solid rgba(255,255,255,0.04);
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 0;
  overflow: hidden;
  flex-shrink: 0;
}

.rl2-prop-name {
  font-size: 12px;
  font-weight: 600;
  color: rgba(255,255,255,0.88);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 240px;
}

.rl2-badge {
  font-size: 9px;
  font-weight: 700;
  font-family: var(--geo-font-mono);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 2px 7px;
  border-radius: 99px;
  margin-left: 8px;
  white-space: nowrap;
}
/* Variantes do badge de status */
.rl2-badge.status-ativo    { background: var(--geo-accent-bg); color: var(--geo-accent-text); border: 0.5px solid var(--geo-accent-border); }
.rl2-badge.status-arquivo  { background: rgba(255,255,255,0.04); color: rgba(255,255,255,0.35); border: 0.5px solid rgba(255,255,255,0.08); }
.rl2-badge.status-concluido{ background: rgba(48,209,88,0.10); color: #30d158; border: 0.5px solid rgba(48,209,88,0.22); }

.rl2-sep {
  width: 1px;
  height: 14px;
  background: rgba(255,255,255,0.06);
  margin: 0 10px;
  flex-shrink: 0;
}

.rl2-meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  overflow: hidden;
}

.rl2-meta-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(255,255,255,0.28);
  font-weight: 600;
}

.rl2-meta-value {
  font-size: 11px;
  color: rgba(255,255,255,0.65);
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rl2-meta-value.font-mono { font-family: var(--geo-font-mono); font-size: 10px; }

/* Camada 3 */
.ribbon-layer3 {
  background: #111714;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  flex-shrink: 0;
}

/* Sub-camada 3a: Tabs */
.rl3-tabs {
  display: flex;
  align-items: flex-end;
  padding: 0 8px;
  gap: 2px;
  height: 32px;
  border-bottom: 0.5px solid rgba(255,255,255,0.06);
}

.rl3-tab {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 12px;
  height: 28px;
  font-size: 11px;
  font-weight: 500;
  color: rgba(255,255,255,0.45);
  background: transparent;
  border: none;
  border-radius: 4px 4px 0 0;
  cursor: pointer;
  transition: color 120ms, background 120ms;
  position: relative;
  white-space: nowrap;
}
.rl3-tab i { width: 13px; height: 13px; flex-shrink: 0; }

.rl3-tab:hover {
  color: rgba(255,255,255,0.75);
  background: rgba(255,255,255,0.04);
}

.rl3-tab.active {
  color: var(--geo-accent-text);
  background: rgba(0,224,138,0.08);
}

/* Linha indicadora na tab ativa */
.rl3-tab.active::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 4px;
  right: 4px;
  height: 2px;
  background: var(--geo-accent);
  border-radius: 1px 1px 0 0;
}

/* Sub-camada 3b: Painéis */
.rl3-panels {
  height: 55px;
  overflow: hidden;
}

.rl3-panel {
  display: flex;
  align-items: stretch;
  height: 55px;
  padding: 4px 8px;
  gap: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
}
.rl3-panel::-webkit-scrollbar { display: none; }
.rl3-panel.hidden { display: none; }

/* Grupos de ferramentas dentro dos painéis */
.rl3-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: fit-content;
  padding: 0 4px;
}

.rl3-group-tools {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1;
}

.rl3-group-label {
  font-size: 9px;
  color: rgba(255,255,255,0.22);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  margin-top: 2px;
  white-space: nowrap;
}

.rl3-divider {
  width: 1px;
  height: 44px;
  background: rgba(255,255,255,0.06);
  margin: 0 6px;
  align-self: center;
  flex-shrink: 0;
}

/* Botões de ferramenta */
.rl3-tool-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 42px;
  height: 38px;
  padding: 3px 6px;
  font-size: 9px;
  color: rgba(255,255,255,0.65);
  background: transparent;
  border: 0.5px solid transparent;
  border-radius: 5px;
  cursor: pointer;
  transition: background 100ms, color 100ms, border-color 100ms;
  white-space: nowrap;
}
.rl3-tool-btn i { width: 16px; height: 16px; }
.rl3-tool-btn:hover {
  background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.9);
  border-color: rgba(255,255,255,0.08);
}
.rl3-tool-btn:active { transform: scale(0.96); }

/* Botão grande (ação principal do grupo) */
.rl3-tool-btn.rl3-btn-lg {
  min-width: 52px;
  height: 38px;
  font-size: 10px;
  font-weight: 600;
  color: var(--geo-accent-text);
  border-color: var(--geo-accent-border);
  background: var(--geo-accent-bg);
}
.rl3-tool-btn.rl3-btn-lg:hover { background: rgba(0,224,138,0.15); }

/* Botão de aviso (ação potencialmente perigosa) */
.rl3-tool-btn.rl3-btn-warn {
  color: var(--geo-status-warn);
  border-color: var(--geo-status-warn-border);
  background: var(--geo-status-warn-bg);
}

/* Botão destrutivo */
.rl3-tool-btn.rl3-btn-danger {
  color: var(--geo-status-error);
  border-color: var(--geo-status-error-border);
  background: var(--geo-status-error-bg);
}

/* Toggle row (UTM / Geodésico) */
.rl3-toggle-row {
  display: flex;
  align-items: center;
  gap: 2px;
  background: rgba(255,255,255,0.04);
  border: 0.5px solid rgba(255,255,255,0.08);
  border-radius: 4px;
  padding: 2px;
}
.rl3-toggle-label {
  font-size: 9px;
  color: rgba(255,255,255,0.3);
  padding: 0 4px;
}
.rl3-toggle-btn {
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 600;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: rgba(255,255,255,0.4);
  cursor: pointer;
  transition: all 100ms;
}
.rl3-toggle-btn.active {
  background: var(--geo-accent-bg);
  color: var(--geo-accent-text);
}
```

#### 3.3.3 Regras de Conteúdo dos Painéis

**Hierarquia de botões dentro de um painel (da maior para menor importância visual):**

1. **`rl3-btn-lg`** — ação primária do grupo (ex.: "Ingestão", "Gerar Laudo"). Apenas **um por grupo**.
2. **`rl3-tool-btn`** padrão — ações secundárias frequentes.
3. **`rl3-tool-btn rl3-btn-warn`** — ações que alteram dados permanentemente.
4. **`rl3-tool-btn rl3-btn-danger`** — ações destrutivas (arquivar, excluir em lote).

**Regra:** Cada grupo deve ter no máximo **5 botões**. Se precisar de mais, criar um sub-menu expansível com `▾`.

---

## 4. Painel de Propriedades

### 4.1 Propósito e Função

O painel de propriedades é o equivalente ao *Properties Panel* do AutoCAD ou do *Symbology Pane* do ArcGIS Pro. Ele exibe e permite editar as propriedades do **objeto selecionado** na tabela de vértices ou no mapa.

**Estados:**
- **Sem seleção:** Exibe dados gerais da matrícula ativa (área, código INCRA, observações)
- **Um ponto selecionado:** Exibe e edita as propriedades daquele vértice
- **Múltiplos selecionados:** Exibe operações em lote disponíveis

### 4.2 Estrutura do Painel

```
┌─────────────────────────────────┐
│ 📐 Propriedades          [←] [X]│  ← header: nome + colapsar + close
├─────────────────────────────────┤
│ ▼ Identidade do Vértice         │  ← seção expansível
│   Nome    [M-001        ]       │
│   Tipo    [Rover ▾      ]       │
│   Arquivo [ROVER001.GNS ]       │
├─────────────────────────────────┤
│ ▼ Coordenadas Brutas            │
│   Norte   [7.412.345,123]       │
│   Este    [  492.123,456]       │
│   Altitude[    421,350m ]       │
├─────────────────────────────────┤
│ ▼ Coordenadas Corrigidas        │
│   Norte   [7.412.345,456]       │  ← editável
│   Este    [  492.123,789]       │  ← editável
│   Altitude[    421,380m ]       │  ← editável
├─────────────────────────────────┤
│ ▼ Qualidade e Status            │
│   ΔN  [+333mm] ████░░ 🟡       │  ← barra visual de precisão
│   ΔE  [ +333mm] ████░░ 🟡       │
│   ΔH  [+030mm] ██████ 🟢       │
│   Status: [BRUTO ▾     ]       │
│   [✓ Participar do Polígono]   │
├─────────────────────────────────┤
│ ▼ Confrontante desta Divisa     │
│   [Seleção rápida ▾    ]       │
├─────────────────────────────────┤
│   [Salvar Alterações   ]       │  ← btn-primary
│   [Descartar           ]       │  ← btn-secondary
└─────────────────────────────────┘
```

### 4.3 Regras de Comportamento

1. **Seleção de linha na tabela** → painel atualiza instantaneamente (sem botão de "confirmar seleção")
2. **Clique no mapa** → seleciona ponto correspondente na tabela E atualiza painel
3. **Edição de campo** → mudanças ficam pendentes (fundo amarelo sutil no campo editado) até "Salvar Alterações"
4. **Colapsar painel** → largura muda para 36px mostrando apenas um ícone vertical rotacionado "Propriedades"

### 4.4 CSS do Painel de Propriedades

```css
/* ===================================================
   PAINEL DE PROPRIEDADES
   =================================================== */

.props-panel {
  width: var(--props-panel-w, 280px);
  background: var(--geo-bg-surface);
  border-right: 0.5px solid var(--geo-border-subtle);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 200ms cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
}

.props-panel.collapsed {
  width: 36px;
}

/* Header do painel */
.props-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 0.5px solid var(--geo-border-faint);
  background: var(--geo-bg-elevated);
  flex-shrink: 0;
}

.props-panel-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: rgba(255,255,255,0.45);
  white-space: nowrap;
  overflow: hidden;
}

.props-panel-toggle {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: rgba(255,255,255,0.3);
  cursor: pointer;
  border-radius: 3px;
  flex-shrink: 0;
  transition: color 100ms, background 100ms;
}
.props-panel-toggle:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.7); }

/* Conteúdo scrollável */
.props-panel-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.08) transparent;
}

/* Seções expansíveis */
.props-section {
  border-bottom: 0.5px solid var(--geo-border-faint);
}

.props-section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  cursor: pointer;
  user-select: none;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: rgba(255,255,255,0.38);
  transition: color 100ms;
}
.props-section-header:hover { color: rgba(255,255,255,0.6); }
.props-section-header i { width: 12px; height: 12px; transition: transform 200ms; }
.props-section-header.collapsed i { transform: rotate(-90deg); }

.props-section-body {
  padding: 4px 10px 10px;
}
.props-section-body.hidden { display: none; }

/* Campos do painel */
.props-field {
  display: grid;
  grid-template-columns: 68px 1fr;
  align-items: center;
  gap: 6px;
  margin-bottom: 5px;
}

.props-field-label {
  font-size: 10px;
  color: rgba(255,255,255,0.35);
  text-align: right;
  white-space: nowrap;
}

.props-field-value {
  font-size: 11px;
  font-family: var(--geo-font-mono);
  color: rgba(255,255,255,0.82);
  background: rgba(255,255,255,0.04);
  border: 0.5px solid var(--geo-border-subtle);
  border-radius: var(--geo-radius-input);
  padding: 3px 6px;
  width: 100%;
}

.props-field-value:focus {
  border-color: var(--geo-accent-border);
  background: rgba(255,255,255,0.06);
  outline: none;
  box-shadow: 0 0 0 2px rgba(0,224,138,0.08);
}

/* Campo com alteração pendente */
.props-field-value.dirty {
  border-color: rgba(255,214,10,0.4);
  background: rgba(255,214,10,0.04);
}

/* Barra de qualidade geodésica */
.props-quality-bar {
  display: grid;
  grid-template-columns: 68px 1fr 36px 20px;
  align-items: center;
  gap: 6px;
  margin-bottom: 5px;
}

.props-quality-track {
  height: 4px;
  background: rgba(255,255,255,0.08);
  border-radius: 2px;
  overflow: hidden;
}

.props-quality-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 300ms ease;
}
/* Cores da barra conforme tolerância INCRA */
.props-quality-fill.ok   { background: #30d158; }  /* ≤ 3mm */
.props-quality-fill.warn { background: #ffd60a; }  /* 3–10mm */
.props-quality-fill.err  { background: #ff453a; }  /* > 10mm */

.props-quality-value {
  font-size: 10px;
  font-family: var(--geo-font-mono);
  color: rgba(255,255,255,0.65);
  text-align: right;
}

/* Rodapé com ações */
.props-panel-footer {
  padding: 8px 10px;
  border-top: 0.5px solid var(--geo-border-faint);
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
  background: var(--geo-bg-elevated);
}
```

### 4.5 Tolerâncias de Precisão INCRA (para as barras de qualidade)

| Diferença (mm) | Cor da barra | Status |
|---------------|-------------|--------|
| 0 – 30mm | Verde `#30d158` | APROVADO |
| 31 – 100mm | Amarelo `#ffd60a` | REVISAR |
| > 100mm | Vermelho `#ff453a` | REPROVAR |

> **Nota:** Os limites acima são baseados nas tolerâncias da Norma Técnica de Georreferenciamento do INCRA (Portaria INCRA nº 62/2010 — Classe 3: σ ≤ 0,50m). Ajuste conforme a classe do imóvel (Classe 1: ≤0,07m, Classe 2: ≤0,30m).

---

## 5. Tabela de Vértices Geodésicos

### 5.1 Estrutura e Layout

A tabela fica na **parte inferior do workspace**, abaixo do mapa. Ela tem altura fixa de ~280px com scroll vertical interno. **Não deve usar scroll horizontal se possível** — colunas ocultas ficam disponíveis via toggle na ribbon.

```
┌──────────────────────────────────────────────────────────────────┐
│ Barra de filtros e busca (32px)                                  │
│ [Todos(24)] [Bases(2)] [Rovers(22)] [Brutos(18)] [Corr.(6)] [🔍]│
├──────────────────────────────────────────────────────────────────┤
│  Ord │ Vértice  │ Tipo │ Norte Corr.    │ Este Corr.    │ Alt. │…│ ← thead sticky
├──────┼──────────┼──────┼────────────────┼───────────────┼──────┤
│    1 │ M-001    │  M   │ 7.412.345,123  │  492.123,456  │ 421,3│…│ ← base PPP (azul)
│    2 │ P-001    │  P   │ 7.412.346,789  │  492.124,012  │ 421,4│…│
│    3 │ P-002    │  P   │ 7.412.350,234  │  492.127,901  │ 421,5│…│
│      │ ...      │      │                │               │      │ │
└──────────────────────────────────────────────────────────────────┘
```

### 5.2 Colunas por Modo

**Modo UTM (padrão):**

| Col | ID | Largura | Alinhamento | Tipo |
|-----|----|---------|-------------|------|
| Ord. | ordem | 52px | centro | Número / drag handle |
| Vértice | nome_vertice | 100px | esquerda | Texto |
| Tipo | tipo_ponto | 52px | centro | Badge |
| Norte Corr. | n_corrigido | 130px | direita | Monospace numérico |
| Este Corr. | e_corrigido | 130px | direita | Monospace numérico |
| Δ N (mm) | delta_n | 72px | direita | Colorido por tolerância |
| Δ E (mm) | delta_e | 72px | direita | Colorido por tolerância |
| Alt. (m) | altitude | 72px | direita | Monospace numérico |
| Políg. | ignorar_poligono | 44px | centro | Checkbox |
| Status | status_correcao | 90px | centro | Badge |
| ⋮ | — | 32px | centro | Menu de contexto |

**Modo Geodésico:**
Substitui "Norte/Este Corr." por "Lat Corr./Lon Corr." e "Lat Bruta/Lon Bruta", com 8 casas decimais.

### 5.3 CSS da Tabela

```css
/* ===================================================
   TABELA DE VÉRTICES
   =================================================== */

.table-area {
  display: flex;
  flex-direction: column;
  height: var(--table-area-h, 280px);
  border-top: 1px solid rgba(255,255,255,0.08);
  overflow: hidden;
  background: var(--geo-bg-base);
}

/* Barra de filtros */
.vtx-filter-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-bottom: 0.5px solid var(--geo-border-faint);
  background: var(--geo-bg-surface);
  flex-shrink: 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.vtx-filter-bar::-webkit-scrollbar { display: none; }

.vtx-filter-chip {
  padding: 2px 9px;
  font-size: 10px;
  font-weight: 500;
  border-radius: 99px;
  border: 0.5px solid transparent;
  cursor: pointer;
  white-space: nowrap;
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.45);
  transition: all 100ms;
}
.vtx-filter-chip:hover { color: rgba(255,255,255,0.75); background: rgba(255,255,255,0.07); }
.vtx-filter-chip.active {
  background: var(--geo-accent-bg);
  color: var(--geo-accent-text);
  border-color: var(--geo-accent-border);
  font-weight: 600;
}

.vtx-filter-spacer { flex: 1; }

/* Campo de busca inline */
.vtx-search {
  position: relative;
  width: 160px;
  flex-shrink: 0;
}
.vtx-search input {
  width: 100%;
  height: 22px;
  padding: 0 8px 0 26px;
  font-size: 11px;
  background: rgba(255,255,255,0.04);
  border: 0.5px solid var(--geo-border-default);
  border-radius: var(--geo-radius-input);
  color: var(--geo-text-primary);
  font-family: var(--geo-font-mono);
}
.vtx-search i {
  position: absolute;
  left: 7px;
  top: 50%;
  transform: translateY(-50%);
  width: 12px;
  height: 12px;
  color: rgba(255,255,255,0.25);
  pointer-events: none;
}

/* Contêiner da tabela */
.vtx-table-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.10) transparent;
}

/* Tabela */
.vtx-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  table-layout: fixed;  /* CRÍTICO: evita expansão de colunas */
}

/* Cabeçalho fixo */
.vtx-table thead th {
  position: sticky;
  top: 0;
  z-index: 10;
  background: #0b130e;  /* valor opaco, não transparente */
  padding: 6px 8px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--geo-text-tertiary);
  white-space: nowrap;
  border-bottom: 0.5px solid var(--geo-border-subtle);
  user-select: none;
  cursor: pointer;
}

.vtx-table thead th:hover { color: var(--geo-text-secondary); }
.vtx-table thead th.sorted { color: var(--geo-accent-text); }

/* Linhas do corpo */
.vtx-table tbody tr {
  border-bottom: 0.5px solid var(--geo-border-faint);
  transition: background 80ms;
  cursor: pointer;
  height: 38px;  /* altura mais compacta que 44px, ainda clicável */
}

.vtx-table tbody tr:hover { background: var(--geo-bg-overlay); }
.vtx-table tbody tr.selected { background: rgba(0,224,138,0.07); }
.vtx-table tbody tr.selected td { color: var(--geo-text-primary); }

/* Tipos de linha por classe do vértice */
.vtx-table tbody tr.tipo-base-ppp { background: rgba(88,86,214,0.06); }
.vtx-table tbody tr.tipo-base-ppp:hover { background: rgba(88,86,214,0.10); }

.vtx-table tbody tr.tipo-base-fisica { background: rgba(255,69,58,0.06); }
.vtx-table tbody tr.tipo-base-fisica:hover { background: rgba(255,69,58,0.10); }

/* Células */
.vtx-table tbody td {
  padding: 0 8px;
  vertical-align: middle;
  color: var(--geo-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Célula de coordenada — SEMPRE monospace, SEMPRE alinhada à direita */
.vtx-table td.col-coord {
  font-family: var(--geo-font-mono);
  font-size: 11px;
  text-align: right;
  letter-spacing: 0.01em;
  color: rgba(255,255,255,0.82);
}

/* Célula de delta — colorida por tolerância */
.vtx-table td.col-delta {
  font-family: var(--geo-font-mono);
  font-size: 11px;
  text-align: right;
  font-weight: 600;
}
.vtx-table td.col-delta.ok   { color: #30d158; }
.vtx-table td.col-delta.warn { color: #ffd60a; }
.vtx-table td.col-delta.err  { color: #ff453a; }

/* Ordem (número de sequência) */
.vtx-table td.col-ordem {
  font-family: var(--geo-font-mono);
  font-size: 11px;
  text-align: center;
  color: rgba(255,255,255,0.45);
  font-weight: 600;
}

/* Badges de tipo e status */
.vtx-badge {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 99px;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.vtx-badge.tipo-m { background: rgba(88,86,214,0.2); color: #a78bfa; border: 0.5px solid rgba(88,86,214,0.3); }
.vtx-badge.tipo-b { background: rgba(255,69,58,0.2); color: #f87171; border: 0.5px solid rgba(255,69,58,0.3); }
.vtx-badge.tipo-p { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.5); border: 0.5px solid rgba(255,255,255,0.1); }
.vtx-badge.tipo-v { background: rgba(90,200,250,0.1); color: #5ac8fa; border: 0.5px solid rgba(90,200,250,0.25); }

.vtx-badge.status-bruto     { background: var(--geo-status-raw-bg); color: var(--geo-status-raw); border: 0.5px solid var(--geo-status-raw-border); }
.vtx-badge.status-corrigido { background: var(--geo-status-ok-bg); color: var(--geo-status-ok); }

/* Barra de ações de seleção múltipla (flutuante na tabela) */
.vtx-batch-bar {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 16px;
  background: rgba(12,21,16,0.95);
  backdrop-filter: blur(8px);
  border: 0.5px solid var(--geo-accent-border);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  z-index: 50;
  white-space: nowrap;
}
.vtx-batch-bar.hidden { display: none; }
```

### 5.4 Formatação de Números Geoespaciais

```typescript
/**
 * Formata coordenada UTM para exibição na tabela
 * Ex: 7412345.123 → "7.412.345,123"
 */
export const formatUTM = (val: number | null | undefined, casas = 3): string => {
  if (val === null || val === undefined) return '—';
  return val.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
};

/**
 * Formata diferença de posição em mm com sinal
 * Ex: 0.333 → "+333mm"
 */
export const formatDelta = (meters: number | null | undefined): string => {
  if (meters === null || meters === undefined) return '—';
  const mm = Math.round(meters * 1000);
  return (mm >= 0 ? '+' : '') + mm + 'mm';
};

/**
 * Retorna classe CSS conforme tolerância INCRA Classe 3 (≤500mm)
 */
export const deltaClass = (meters: number | null | undefined): string => {
  if (meters === null || meters === undefined) return '';
  const mm = Math.abs(meters * 1000);
  if (mm <= 30)  return 'ok';
  if (mm <= 100) return 'warn';
  return 'err';
};
```

---

## 6. Área de Visualização (Mapa Leaflet)

### 6.1 Configuração Mínima Obrigatória

```typescript
const map = L.map('map-view', {
  maxZoom: 24,
  zoomControl: true,
  attributionControl: false,  // customizar posição
});

// Escala gráfica — OBRIGATÓRIO em sistema de georreferenciamento
L.control.scale({
  position: 'bottomright',
  imperial: false,           // apenas métrico
  maxWidth: 100,
}).addTo(map);

// Coordenadas do cursor na status bar (ver §7)
map.on('mousemove', (e) => {
  updateStatusBarCoords(e.latlng.lat, e.latlng.lng);
});
```

### 6.2 Camadas Base

```typescript
// Camada preferencial: Google Satellite Hybrid
const googleHybrid = L.tileLayer(
  'https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}',
  { maxZoom: 24, maxNativeZoom: 20, subdomains: ['mt0','mt1','mt2','mt3'] }
);

// SIGEF/INCRA WMS
const sigefWMS = L.tileLayer.wms(
  'https://acervofundiario.incra.gov.br/i3geo/ogc.php',
  {
    layers: 'certificada_sigef_particular_pr',
    format: 'image/png',
    transparent: true,
    className: 'sigef-wms-layer',
  }
);
```

### 6.3 Popups Consistentes com o Design Dark

```css
/* REGRA: Popups do Leaflet devem usar o mesmo dark glass da interface */
.geo-popup .leaflet-popup-content-wrapper {
  background: rgba(12, 21, 16, 0.95) !important;
  backdrop-filter: blur(12px);
  border: 0.5px solid rgba(255,255,255,0.1) !important;
  border-radius: 8px !important;
  color: rgba(255,255,255,0.85) !important;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5) !important;
}
.geo-popup .leaflet-popup-tip {
  background: rgba(12, 21, 16, 0.95) !important;
}
```

---

## 7. Sistema de Notificações e Feedback

### 7.1 Substituição dos alert() / confirm() Nativos

**REGRA ABSOLUTA:** Nenhum `alert()`, `confirm()` ou `prompt()` pode existir na aplicação. Eles são substituídos pelos componentes abaixo.

#### 7.1.1 Sistema de Toast

```typescript
type ToastType = 'success' | 'error' | 'warn' | 'info';

interface ToastOptions {
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;  // ms, padrão 4000; 0 = persistente
}

export const showToast = (opts: ToastOptions): void => {
  const container = document.getElementById('toast-container') 
    ?? createToastContainer();
  
  const toast = document.createElement('div');
  toast.className = `geo-toast geo-toast-${opts.type}`;
  toast.innerHTML = `
    <i data-lucide="${iconForType(opts.type)}" class="geo-toast-icon"></i>
    <div class="geo-toast-body">
      <strong class="geo-toast-title">${opts.title}</strong>
      ${opts.message ? `<span class="geo-toast-msg">${opts.message}</span>` : ''}
    </div>
    <button class="geo-toast-close" onclick="this.parentElement.remove()">×</button>
  `;
  
  container.appendChild(toast);
  initIcons();
  
  if (opts.duration !== 0) {
    setTimeout(() => toast.remove(), opts.duration ?? 4000);
  }
};

// Uso:
// Antes:  alert("Vértice salvo com sucesso!");
// Depois: showToast({ type: 'success', title: 'Vértice salvo', message: 'P-001 atualizado.' });

// Antes:  alert("Erro ao salvar: " + err.message);
// Depois: showToast({ type: 'error', title: 'Erro ao salvar', message: err.message });
```

#### 7.1.2 Modal de Confirmação

```typescript
export const showConfirm = (opts: {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}): Promise<boolean> => {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'geo-confirm-overlay';
    overlay.innerHTML = `
      <div class="geo-confirm-dialog">
        <div class="geo-confirm-header">
          <i data-lucide="${opts.danger ? 'alert-triangle' : 'help-circle'}" 
             class="geo-confirm-icon ${opts.danger ? 'icon-danger' : ''}"></i>
          <h4>${opts.title}</h4>
        </div>
        <p class="geo-confirm-msg">${opts.message}</p>
        <div class="geo-confirm-actions">
          <button class="btn-secondary" id="geo-confirm-cancel">${opts.cancelText ?? 'Cancelar'}</button>
          <button class="${opts.danger ? 'btn-danger' : 'btn-primary'}" id="geo-confirm-ok">
            ${opts.confirmText ?? 'Confirmar'}
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    initIcons();
    
    overlay.querySelector('#geo-confirm-ok')!.addEventListener('click', () => {
      overlay.remove(); resolve(true);
    });
    overlay.querySelector('#geo-confirm-cancel')!.addEventListener('click', () => {
      overlay.remove(); resolve(false);
    });
  });
};

// Uso:
// Antes:  if (!confirm('Excluir vértice?')) return;
// Depois: if (!await showConfirm({ title: 'Excluir vértice', message: `Excluir P-001?`, danger: true })) return;
```

#### 7.1.3 CSS das Notificações

```css
/* Toast Container */
#toast-container {
  position: fixed;
  bottom: 32px;  /* acima da status bar */
  right: 16px;
  z-index: 9000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
  width: 320px;
}

.geo-toast {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(17, 24, 20, 0.96);
  backdrop-filter: blur(12px);
  border: 0.5px solid rgba(255,255,255,0.1);
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  pointer-events: auto;
  animation: toast-in 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes toast-in {
  from { opacity: 0; transform: translateX(20px) scale(0.95); }
  to   { opacity: 1; transform: translateX(0) scale(1); }
}

.geo-toast-success { border-left: 3px solid var(--geo-status-ok); }
.geo-toast-error   { border-left: 3px solid var(--geo-status-error); }
.geo-toast-warn    { border-left: 3px solid var(--geo-status-warn); }
.geo-toast-info    { border-left: 3px solid var(--geo-data-highlight); }

.geo-toast-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  margin-top: 1px;
}
.geo-toast-success .geo-toast-icon { color: var(--geo-status-ok); }
.geo-toast-error   .geo-toast-icon { color: var(--geo-status-error); }
.geo-toast-warn    .geo-toast-icon { color: var(--geo-status-warn); }

.geo-toast-body { flex: 1; }
.geo-toast-title { display: block; font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.9); }
.geo-toast-msg   { display: block; font-size: 11px; color: rgba(255,255,255,0.55); margin-top: 2px; }
.geo-toast-close { background: none; border: none; color: rgba(255,255,255,0.3); cursor: pointer; font-size: 16px; line-height: 1; padding: 0 2px; }

/* Overlay de confirmação */
.geo-confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.65);
  backdrop-filter: blur(4px);
  z-index: 8000;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: overlay-in 150ms ease;
}
@keyframes overlay-in { from { opacity: 0; } to { opacity: 1; } }

.geo-confirm-dialog {
  background: var(--geo-bg-elevated);
  border: 0.5px solid var(--geo-border-default);
  border-radius: var(--geo-radius-modal);
  padding: 24px;
  width: 380px;
  max-width: calc(100vw - 32px);
  box-shadow: 0 16px 48px rgba(0,0,0,0.5);
  animation: dialog-in 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes dialog-in { from { transform: scale(0.94); } to { transform: scale(1); } }

.geo-confirm-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.geo-confirm-header h4 { font-size: 15px; font-weight: 700; }
.geo-confirm-icon.icon-danger { color: var(--geo-status-error); }

.geo-confirm-msg {
  font-size: 13px;
  color: var(--geo-text-secondary);
  line-height: 1.5;
  margin-bottom: 20px;
}

.geo-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
```

### 7.2 Status Bar (Barra de Status)

Barra de 24px na base absoluta do viewport. Permanece sempre visível.

```html
<div id="status-bar" class="status-bar">
  <span class="sb-item" id="sb-coords">
    <i data-lucide="crosshair" class="sb-icon"></i>
    <span id="sb-lat">—</span>° / <span id="sb-lon">—</span>°
  </span>
  <span class="sb-sep"></span>
  <span class="sb-item" id="sb-utm">
    <i data-lucide="map-pin" class="sb-icon"></i>
    N: <span id="sb-n" class="sb-mono">—</span>
    E: <span id="sb-e" class="sb-mono">—</span>
    Fuso: <span id="sb-fuso" class="sb-mono">22S</span>
  </span>
  <span class="sb-sep"></span>
  <span class="sb-item" id="sb-selection">
    <span id="sb-sel-count">0</span> vértices selecionados
  </span>
  <div class="sb-spacer"></div>
  <span class="sb-item sb-right" id="sb-pontos-info">
    <span id="sb-total-pontos">0</span> vértices |
    <span id="sb-corrigidos">0</span> corrigidos |
    <span id="sb-brutos">0</span> brutos
  </span>
  <span class="sb-sep"></span>
  <span class="sb-item sb-right" id="sb-api">
    <span class="sb-dot" id="sb-api-dot"></span>
    <span id="sb-api-status">Conectando...</span>
  </span>
</div>
```

```css
.status-bar {
  height: var(--statusbar-h, 24px);
  background: #080b09;
  border-top: 0.5px solid rgba(255,255,255,0.05);
  display: flex;
  align-items: center;
  padding: 0 8px;
  gap: 0;
  flex-shrink: 0;
  overflow: hidden;
}

.sb-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: rgba(255,255,255,0.38);
  white-space: nowrap;
  padding: 0 6px;
}
.sb-item.sb-right { margin-left: auto; }

.sb-mono { font-family: var(--geo-font-mono); color: rgba(255,255,255,0.55); }
.sb-sep  { width: 1px; height: 12px; background: rgba(255,255,255,0.06); }
.sb-spacer { flex: 1; }
.sb-icon { width: 11px; height: 11px; }

.sb-dot { width: 6px; height: 6px; border-radius: 50%; }
.sb-dot.online  { background: var(--geo-status-ok); }
.sb-dot.offline { background: var(--geo-status-error); }
```

---

## 8. Tokens de Design e CSS

### 8.1 Variáveis Raiz (consolidadas)

```css
:root {
  /* --- Superfícies --- */
  --geo-bg-base:        #09090B;
  --geo-bg-surface:     #0d1410;  /* superfície principal (mais verde que #111113) */
  --geo-bg-elevated:    #141a11;
  --geo-bg-overlay:     #1c2319;

  /* --- Bordas --- */
  --geo-border-faint:   rgba(255,255,255,0.04);
  --geo-border-subtle:  rgba(255,255,255,0.07);
  --geo-border-default: rgba(255,255,255,0.11);
  --geo-border-strong:  rgba(255,255,255,0.20);

  /* --- Texto --- */
  --geo-text-primary:   rgba(255,255,255,0.92);
  --geo-text-secondary: rgba(255,255,255,0.52);
  --geo-text-tertiary:  rgba(255,255,255,0.28);
  --geo-text-disabled:  rgba(255,255,255,0.18);

  /* --- Acento único (verde) --- */
  --geo-accent:         #00E08A;
  --geo-accent-text:    #00C97C;
  --geo-accent-bg:      rgba(0,224,138,0.10);
  --geo-accent-border:  rgba(0,224,138,0.22);

  /* --- Status Semântico --- */
  --geo-status-raw:         #FF9F0A;
  --geo-status-raw-bg:      rgba(255,159,10,0.10);
  --geo-status-raw-border:  rgba(255,159,10,0.22);

  --geo-status-ok:          #30D158;
  --geo-status-ok-bg:       rgba(48,209,88,0.10);

  --geo-status-error:       #FF453A;
  --geo-status-error-bg:    rgba(255,69,58,0.10);
  --geo-status-error-border:rgba(255,69,58,0.22);

  --geo-status-warn:        #FFD60A;
  --geo-status-warn-bg:     rgba(255,214,10,0.10);
  --geo-status-warn-border: rgba(255,214,10,0.22);

  /* --- Dados geodésicos --- */
  --geo-data-highlight: #5AC8FA;

  /* --- Formas --- */
  --geo-radius-modal:  14px;
  --geo-radius-panel:  10px;
  --geo-radius-card:    8px;
  --geo-radius-input:   6px;
  --geo-radius-btn-sm:  5px;
  --geo-radius-chip:    9999px;

  /* --- Espaçamento (múltiplos de 4px) --- */
  --geo-sp-1:  4px;
  --geo-sp-2:  8px;
  --geo-sp-3:  12px;
  --geo-sp-4:  16px;
  --geo-sp-5:  20px;
  --geo-sp-6:  24px;

  /* --- Tipografia --- */
  --geo-font-sans: 'Inter', 'Segoe UI Variable', system-ui, sans-serif;
  --geo-font-mono: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace;

  /* --- Transições --- */
  --geo-transition-fast: 100ms ease;
  --geo-transition-base: 180ms ease;

  /* --- Alturas de layout --- */
  --ribbon-layer1-h: 36px;
  --ribbon-layer2-h: 32px;
  --ribbon-layer3-h: 87px;
  --ribbon-total-h:  155px;
  --statusbar-h:     24px;
  --props-panel-w:   280px;
  --table-area-h:    280px;
}
```

---

## 9. Comportamentos de Interação

### 9.1 Seleção de Vértices

```
Clique simples na tabela:
  → Seleciona o ponto (estado "selecionado", fundo verde claro)
  → Painel de propriedades carrega os dados do ponto
  → Mapa faz pan para o ponto e abre popup compacto

Shift+Clique:
  → Seleção em intervalo (do último selecionado até o clicado)

Ctrl+Clique:
  → Adiciona/remove da seleção múltipla

Clique no mapa (marcador):
  → Mesmo efeito que clique na linha da tabela
  → Tabela faz scroll para a linha correspondente

Escape:
  → Limpa seleção
  → Fecha painel de propriedades se estava editando
```

### 9.2 Atalhos de Teclado

| Atalho | Ação |
|--------|------|
| `Ctrl+S` | Salvar rascunho |
| `F5` | Processar lote de ingestão |
| `Delete` | Excluir vértice(s) selecionado(s) (com confirmação) |
| `Escape` | Limpar seleção / fechar modal |
| `Ctrl+A` | Selecionar todos os vértices visíveis |
| `Tab` / `Shift+Tab` | Navegar entre campos do painel de propriedades |
| `Enter` no painel | Salvar alterações do campo ativo |
| `↑` / `↓` | Navegar linhas da tabela |

### 9.3 Estados da Ribbon (Abas Contextuais)

Quando o usuário está **em modo de reordenação manual** (`modoReordenarAtivo === true`):
- A aba "Mesa Geodésica" recebe uma borda de acento pulsante
- Um badge "REORDENANDO" aparece na Camada 2
- Os botões de exportação ficam desabilitados (`pointer-events: none; opacity: 0.35`)

---

## 10. Layout Geral e Cálculo de Viewport

### 10.1 HTML Raiz da Mesa de Trabalho

```html
<!-- Container raiz — substitui o <div class="space-y-6"> original -->
<div id="workstation-root" class="workstation-root">

  <!-- Ribbon completa -->
  <header class="ribbon-container" id="ribbon-container">
    <!-- Camada 1, 2 e 3 aqui -->
  </header>

  <!-- Corpo principal -->
  <div class="workspace-body" id="workspace-body">
    <!-- Painel de Propriedades -->
    <aside class="props-panel" id="props-panel">
      <!-- conteúdo do painel -->
    </aside>

    <!-- Área de visualização: mapa + tabela empilhados -->
    <div class="workspace-right" id="workspace-right">
      <!-- Mapa -->
      <div class="map-area" id="map-area">
        <div id="mapa-triagem" class="w-full h-full"></div>
      </div>
      <!-- Tabela de vértices -->
      <div class="table-area" id="table-area">
        <!-- filtros + tabela -->
      </div>
    </div>
  </div>

  <!-- Status bar -->
  <footer class="status-bar" id="status-bar">
    <!-- coordenadas, contagens, status API -->
  </footer>

</div>
```

### 10.2 CSS do Layout Raiz

```css
.workstation-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--geo-bg-base);
  font-family: var(--geo-font-sans);
}

.ribbon-container {
  flex-shrink: 0;
  /* Camadas 1+2+3 são filhos diretos aqui */
}

.workspace-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  /* height é calculada automaticamente pelo flex */
}

.workspace-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.map-area {
  flex: 1;
  overflow: hidden;
  min-height: 200px;  /* mínimo para o mapa ser utilizável */
}

.table-area {
  height: var(--table-area-h, 280px);
  flex-shrink: 0;
  position: relative;  /* para o vtx-batch-bar flutuante */
}

/* Splitter redimensionável entre mapa e tabela */
.workspace-splitter-h {
  height: 4px;
  background: transparent;
  cursor: row-resize;
  flex-shrink: 0;
  transition: background 100ms;
}
.workspace-splitter-h:hover { background: var(--geo-accent-border); }
```

---

## 11. Guia de Implementação por Componente

### 11.1 Ordem de Implementação Recomendada

```
Fase 1 — Estrutura (sem lógica)
  1. HTML do workstation-root com todas as zonas
  2. CSS das variáveis globais e layout
  3. Ribbon Camadas 1 e 2 (apenas visual, sem eventos)

Fase 2 — Ribbon interativa
  4. Lógica de alternância de abas (Camada 3)
  5. Sincronização bidirecional com ctx.alternarEtapa()
  6. Select de matrícula na Camada 1 → ctx.switchMatriculaTab()
  7. Select de fuso na Camada 1 → ctx.modoCoordenadas

Fase 3 — Painel de Propriedades
  8. Renderização estática do painel (modo "sem seleção")
  9. Lógica de seleção de ponto: tabela ↔ mapa ↔ painel
  10. Edição e salvamento de campos

Fase 4 — Tabela de Vértices
  11. Migração da tabela existente para a nova estrutura
  12. Filtros com contagem dinâmica
  13. Seleção múltipla + batch bar
  14. Formatação de coordenadas com formatUTM() e formatDelta()

Fase 5 — Notificações
  15. Implementar showToast() e showConfirm()
  16. Substituir todos os alert() e confirm()

Fase 6 — Status Bar
  17. Coordenadas do cursor em tempo real
  18. Contadores de vértices

Fase 7 — Polimentos
  19. Persistência de estado no localStorage (modo fuso, largura painel)
  20. Atalhos de teclado
  21. Escala gráfica no mapa
```

### 11.2 Persistência de Estado do Workspace

```typescript
// Salvar estado do workspace no localStorage
const WORKSPACE_STATE_KEY = 'gerencigeo_workspace_state';

interface WorkspaceState {
  propsPanelCollapsed: boolean;
  propsPanelWidth: number;
  tableAreaHeight: number;
  mapBaseLayer: 'google' | 'osm';
  modoCoordenadas: 'utm' | 'geodesico';
  fusoUTM: number;
}

export const saveWorkspaceState = (state: Partial<WorkspaceState>) => {
  const current = loadWorkspaceState();
  localStorage.setItem(WORKSPACE_STATE_KEY, JSON.stringify({ ...current, ...state }));
};

export const loadWorkspaceState = (): WorkspaceState => {
  try {
    return JSON.parse(localStorage.getItem(WORKSPACE_STATE_KEY) ?? '{}');
  } catch {
    return {} as WorkspaceState;
  }
};
```

---

## 12. Checklist de Qualidade

### Antes de considerar a interface "completa", verificar:

#### Estrutura
- [ ] `100vh` sem scroll vertical da página inteira
- [ ] Ribbon com exatamente 3 camadas, alturas fixas conforme especificado
- [ ] Painel de propriedades colapsável (280px ↔ 36px)
- [ ] Tabela com altura fixa e scroll interno
- [ ] Status bar sempre visível na base

#### Ribbon
- [ ] Abas da Camada 3 alternam painéis via classe `.hidden` (preserva event listeners)
- [ ] Tab ativa tem indicador de 2px na base
- [ ] Fuso UTM e matrícula ativa no Camada 1 sincronizados com ctx
- [ ] Nome da propriedade e badge de status atualizados na Camada 2

#### Tabela de Vértices
- [ ] Cabeçalho `sticky` com fundo opaco (não transparente)
- [ ] Coordenadas formatadas com `toLocaleString('pt-BR')`
- [ ] Colunas ΔN/ΔE/ΔH coloridas por tolerância INCRA
- [ ] Seleção múltipla com Shift/Ctrl
- [ ] Batch bar aparece com ≥ 2 vértices selecionados
- [ ] Scroll da tabela não afeta o mapa

#### Notificações
- [ ] Zero ocorrências de `alert()` em toda a codebase
- [ ] Zero ocorrências de `confirm()` em toda a codebase
- [ ] `showToast()` implementado e usado para feedback de sucesso/erro
- [ ] `showConfirm()` implementado e usado para confirmações destrutivas

#### Mapa
- [ ] Escala gráfica `L.control.scale()` adicionada
- [ ] Coordenadas do cursor atualizando a status bar em tempo real
- [ ] Popups usando dark glass (não fundo branco)
- [ ] Centro inicial do mapa configurável (não hardcoded)

#### Painel de Propriedades
- [ ] Atualiza ao selecionar linha na tabela
- [ ] Atualiza ao clicar em marcador no mapa
- [ ] Campos editados marcados com estado "dirty"
- [ ] Barras de qualidade coloridas por tolerância INCRA
- [ ] Botão "Salvar" ativo apenas quando há mudanças pendentes

#### Geral
- [ ] Nenhum texto misturando PT-BR e EN
- [ ] Sidebar principal do app colapsando e persistindo estado no localStorage
- [ ] Atalhos `Ctrl+S`, `Delete`, `Escape`, `↑↓` funcionando na tabela

---

*GerenciGeo Workstation Design Manual v1.0*  
*Mantido por: Thiago A. Silva*  
*Baseado em: AutoCAD 2025 UX Guidelines, ArcGIS Pro 3.4 Interface Principles, Topcon Tools UI Patterns*