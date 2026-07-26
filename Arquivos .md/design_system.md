# GerenciGeo UI Design System (Identidade Visual e Layout)
**Pilar 1 — Consolidação do Manual de Design UI, Guia Apple HIG, Fluent UI e Design Responsivo**
**Versão do Documento:** 3.0.0 (Fluent UI Ribbon Integration)
**Status:** Homologado e Consolidado


---

## 1. Filosofia de Interface e Modelo Mental
O GerenciGeo é uma **workstation geoespacial de alta precisão** projetada para geoprocessamento e regularização fundiária. Sua interface prioriza a eficiência técnica e legibilidade de dados sobre estética de marketing, comportando-se de forma semelhante a ferramentas consagradas como AutoCAD e ArcGIS Pro [19].

### 1.1 Princípios Fundamentais (Adaptados do Apple HIG) [3]
1. **Clareza (Clarity):** O usuário deve identificar instantaneamente qual imóvel está ativo, a etapa do fluxo de trabalho e quais pontos apresentam problemas de qualidade [3].
2. **Deferência (Deference):** A UI serve aos dados (coordenadas e mapas). Elementos visuais não devem competir com o conteúdo [4]. Ações secundárias devem recuar visualmente e o mapa não deve possuir molduras que limitem a área de visualização [4].
3. **Profundidade (Depth):** Camadas visuais determinam hierarquia através de luminância e espaçamento, dividindo-se em: Fundo (mapas e painéis), Conteúdo Primário (tabelas e dados) e Ações (botões, badges e filtros) [5].

---

## 2. Layout do Viewport Fixo e Cálculo de Alturas
Para comportar-se como uma aplicação desktop nativa, o sistema adota um layout rígido de **Viewport Fixo (100vh) sem scroll vertical global** [22, 34]. Toda rolagem é interna às zonas delimitadas [22].

### 2.1 Especificação de Alturas do Viewport (100vh)
O cálculo vertical do layout principal é estruturado rigidamente da seguinte forma [23, 24, 31]:

```
+------------------------------------------------------------------+  -- Viewport: 100vh (overflow: hidden)
| Camada 1: App Bar (Application Menu Bar)              [30px]     |  -- background: #0b0d0c
+------------------------------------------------------------------+
| Camada 2: Metadados do Projeto (Project Info Bar)     [32px]     |  -- background: #0d1410
+------------------------------------------------------------------+
| Camada 3: Abas de Ferramentas e Painéis (Ribbon)     [87px]     |  -- background: #111714 (Tabs: 32px | Painéis: 55px)
+------------------------------------------------------------------+
| Área Principal de Trabalho (Workspace) - Altura Dinâmica         |  -- height: calc(100vh - 149px - 24px)
|                                                                  |
|  +---------------------------+--------------------------------+  |
|  | Ingestão / Organizador    | Área de Visualização (Mapa)    |  |
|  | (Largura: 250px - 350px)  | (Altura Dinâmica)              |  |
|  |                           |                                |  |
|  +---------------------------+--------------------------------+  |
|  | Splitter Horizontal (Ajuste persistente no LocalStorage)   |  |
|  +------------------------------------------------------------+  |
|  | Tabela Inferior de Vértices Geodésicos             [~280px]  |  |  -- Altura padrão: --table-area-h: 280px
+------------------------------------------------------------------+
| Status Bar (Base do Viewport)                         [24px]     |  -- background: #000000 (Sempre visível)
+------------------------------------------------------------------+
```

### 2.2 CSS do Layout Raiz (Cálculo Estrutural)
```css
:root {
  --app-bar-h: 30px;
  --info-bar-h: 32px;
  --ribbon-h: 87px;
  --status-bar-h: 24px;
  --ribbon-total-h: calc(var(--app-bar-h) + var(--info-bar-h) + var(--ribbon-h)); /* 149px */
  --table-area-h: 280px; /* Recuperado dinamicamente do localStorage */
  --props-panel-w: 280px; /* Redimensionável entre 280px e 36px */
}

body {
  margin: 0;
  padding: 0;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background-color: #0d0f0e;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

#app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

#workspace-container {
  display: flex;
  flex-direction: row;
  height: calc(100vh - var(--ribbon-total-h) - var(--status-bar-h));
  width: 100vw;
  overflow: hidden;
}
```

---

## 3. Sistema de Espaçamento e Grade de 8px
### 3.1 A Regra Base
Todo o espaçamento do sistema (margens, preenchimentos e lacunas) deve ser estritamente múltiplo de **8px**, usando subdivisões de **4px** exclusivamente para ajustes finos e micro-paddings [5]. Esta proporção matemática garante alinhamento automático no motor de layout e elimina estimativas visuais arbitrárias [5, 15].

### 3.2 Regra do Interno > Externo
Para garantir clareza cognitiva sobre a delimitação e agrupamento de elementos (evitando a aglomeração de cards e tabelas), **o preenchimento interno (padding) de um container deve ser sempre maior que o espaçamento externo (gap/margin) entre containers adjacentes** [6, 15]. Se esta regra for invertida, o cérebro falhará em perceber onde os componentes terminam, causando saturação visual [6].

### 3.3 Densidade Tabular de Alta Performance
Tabelas normais exigem altura mínima de toque de 44px (padrão de usabilidade móvel) [15, 162]. No entanto, para maximizar a visualização de longas cadernetas UTM sem exigir rolagem excessiva de tela, a **Tabela de Vértices Geodésicos adota compactação extrema de 23px por linha**, minimizando paddings verticais (`py-0`) e otimizando o tamanho de fontes e badges contextuais [183].

---

## 4. Tokens de Design, Geometria e Cores
O ecossistema adota uma paleta escura semântica ("Dark Glass") inspirada no Apple WWDC 2025 (Liquid Glass), utilizando a cor estritamente como um sinal semântico de estado e função, e nunca como decoração [1, 8].

### 4.1 Tabela Unificada de Tokens CSS (Variáveis Raiz)
```css
:root {
  /* Cores de Fundo (Backgrounds) */
  --bg-app-bar: #0b0d0c;
  --bg-info-bar: #0d1410;
  --bg-ribbon: #111714;
  --bg-workspace: #0d0f0e;
  --bg-card: rgba(17, 23, 20, 0.8);
  --bg-card-hover: rgba(25, 33, 29, 0.9);
  --bg-glass-popup: rgba(11, 13, 12, 0.85);

  /* Elemento de Acento Único (Apple HIG Rule) */
  --accent: #30d158; /* Verde-Ação para caminhos principais e botões primários */
  --accent-pulse: rgba(48, 209, 88, 0.2);

  /* Cores Semânticas de Estado */
  --status-error: #ff453a;   /* Erros críticos, falha em precisão/QC, ações destrutivas */
  --status-warning: #ffd60a; /* Avisos de tolerância, dados dirty ou reordenação */
  --status-success: #30d158; /* OK, processado, aprovado */
  --data-highlight: #64d2ff; /* Destaque exclusivo de dados corrigidos (Ciano) */

  /* Cores de Texto */
  --text-primary: rgba(255, 255, 255, 0.92);   /* Dados principais, valores */
  --text-secondary: rgba(255, 255, 255, 0.55); /* Labels, subtítulos, metadados */
  --text-muted: rgba(255, 255, 255, 0.35);      /* Placeholders, elementos inativos */

  /* Divisores e Bordas */
  --border-subtle: rgba(255, 255, 255, 0.06);
  --border-medium: rgba(255, 255, 255, 0.12);
  --border-focus: rgba(48, 209, 88, 0.5);

  /* Fontes */
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: "SF Mono", SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
}
```

### 4.2 Sistema de Formas e Geometria Concêntrica
O arredondamento de cantos deve seguir um sistema proporcional exato, evitando cantos que pareçam visualmente "pinçados" (*pinched*) ou "alargados" (*flared*) [7].

| Tipo de Forma | Regra Matemática / Definição | Aplicação no GerenciGeo |
| :--- | :--- | :--- |
| **Fixed** | `border-radius: 8px` (ou constante de 6px a 12px) | Cards do Workspace, painéis e modais cadastrais [7] |
| **Capsule** | `border-radius: 9999px` (ou `height / 2`) | Badges de status, chips de filtro rápido e botões arredondados [7] |
| **Concentric** | $R_{filho} = R_{pai} - Padding$ | Ícones, thumbnails e elementos internos inseridos em containers [7] |

#### A Regra Concêntrica Prática
Se um card pai possui `border-radius` de 12px e um padding interno de 8px, qualquer elemento filho contido neste card deve possuir um arredondamento exato de:
$$R_{filho} = 12\text{px} - 8\text{px} = 4\text{px}$$

---

## 5. Ribbon de 3 Camadas — Especificação Estrutural
A Ribbon é a barra unificada superior de contexto e ferramentas da workstation [21, 22].

### 5.1 Camada 1 — App Bar (Application Menu Bar)
*   **Altura:** 30px [22]
*   **Fundo:** `#0b0d0c` [22]
*   **Borda Inferior:** `0.5px solid rgba(255,255,255,0.06)` [22]
*   **Regra de Altura de Componentes:** Nenhum elemento (botões ou seletores compactos) pode exceder a altura interna de **24px** para evitar desalinhamento da faixa [23].
*   **Estrutura Horizontal (Esquerda para Direita):**
    1. Nome do Software ("GerenciGeo") [23]
    2. Separador de 1px [23]
    3. Botão Voltar (Ghost, hash redireciona para `#levantamentos`) [23]
    4. Botão Salvar (Ghost, executa rascunho local e POST) [23]
    5. *(Espaçamento flexível flex-grow)* [23]
    6. Seletor de Fuso UTM (Compacto, altera contexto de visualização plano/geográfico) [23]
    7. Seletor de Matrícula Ativa (Compacto, manipula abas do SIGEF) [23]
    8. Avatar do Profissional (Circle 20px) [23]

### 5.2 Camada 2 — Metadados do Projeto (Project Info Bar)
*   **Altura:** 32px [24]
*   **Fundo:** `#0d1410` [24]
*   **Borda Inferior:** `0.5px solid rgba(255,255,255,0.04)` [24]
*   **Comportamento:** Exibe de forma estática e compacta as informações de identificação do projeto (Nome do Imóvel, Município/UF e RT responsável) [24]. **Nunca muda** quando o usuário altera as abas de ferramentas [24]. Adiciona um badge de aviso ("REORDENANDO") se o modo de reordenação estiver ativado [33].

### 5.3 Camada 3 — Abas de Ferramentas (Tool Tabs)
*   **Altura Total:** 87px (Sub-camada das abas: 32px | Sub-camada dos painéis: 55px) [24]
*   **Fundo:** `#111714` [24]
*   **Borda Inferior:** `1px solid rgba(255,255,255,0.08)` (linha divisória clara com o workspace) [24]
*   **Comportamento:** Alterna os painéis correspondentes às etapas de trabalho via classe `.hidden` (preservando listeners de eventos de UI ativos) [34]. A aba selecionada recebe um indicador horizontal de 2px na base [34].

---

## 6. Hierarquia de Botões, Badges e Chips
### 6.1 Níveis de Botões (Ribbon & Workstation) [25]
A importância visual dos botões é dividida em níveis estritos para direcionar a atenção do operador [25]:

1.  **Ação Primária (`rl3-btn-lg`):** Executa o fluxo principal do grupo (ex: "Ingestão", "Gerar Laudo"). **Apenas 1 por grupo** [25].
2.  **Ação Secundária (`rl3-tool-btn`):** Botões de ações frequentes de suporte [25].
3.  **Ação Crítica de Modificação (`rl3-btn-warn`):** Cor de alerta (amarelo), para operações que alteram ou recalculam dados de forma permanente [25].
4.  **Ação Destrutiva (`rl3-btn-danger`):** Cor vermelha, para ações destrutivas ou irreversíveis (ex: Excluir Vértice, Purgar Importação) [25].
5.  **Ação de Suporte/Limpeza (`btn-ghost`):** Ações raras ou de sistema (ex: "Atualizar Lista"), que recuam visualmente sem competir com as ações principais [13].

*Regra de Ouro:* Cada grupo de ferramentas na Ribbon deve conter no máximo **5 botões**. Ações adicionais devem ser encapsuladas em submenus expansíveis (indicados por ▾) [25].

### 6.2 Badges de Status — Outline vs. Filled
Badges de estado não devem ser preenchidos (*filled*) com cores altamente saturadas se puderem competir com dados chaves de visualização [11]. O badge de status "BRUTO" adota **outline (borda vazada)**, permitindo que o nome do vértice e as coordenadas corrigidas (dados de prioridade principal) mantenham a dominância de leitura na tabela de vértices [11, 16].

---

## 7. Componentes de Interface e Comportamentos Reativos
### 7.1 Painel de Propriedades AutoCAD-Style
O painel lateral de propriedades atua como o centralizador de visualização e edição de metadados do objeto ativo (matrícula selecionada ou vértice focado) [26].

*   **Alturas e Larguras:** Largura padrão de 280px (`--props-panel-w`) [190].
*   **Colapsibilidade:** O painel pode ser colapsado para uma largura de **36px/25px**, ocultando os inputs e rotacionando verticalmente a palavra "Propriedades" para aproveitamento imediato do mapa [27, 34].
*   **Dirty State:** Quando o usuário edita qualquer campo cadastral, a alteração permanece pendente de persistência de banco de dados [27]. O input recebe um fundo amarelo sutil de estado "dirty", e o botão "Salvar" só é ativado quando alterações pendentes forem identificadas [27, 36].
*   **Barras de Qualidade INCRA:** O painel renderiza barras horizontais de precisão linear (Sigmas) coloridas de forma reativa conforme as tolerâncias metrológicas do INCRA (Classe 1, 2 e 3) [27, 28, 36]:
    *   $0$ a $30\text{mm}$: Verde (`#30d158` - Aprovado) [28]
    *   $31$ a $100\text{mm}$: Amarelo (`#ffd60a` - Revisar) [28]
    *   $> 100\text{mm}$: Vermelho (`#ff453a` - Reprovar) [28]

### 7.2 Tabela de Vértices Geodésicos
A tabela inferior do workspace exibe os vértices cadastrados, adaptando-se reativamente ao modo de visualização plano ou geográfico [28, 29].

*   **Modo UTM (Padrão):** Exibe colunas de Ordem (drag-handle), Vértice, Tipo, Norte Corrigido, Este Corrigido, $\Delta N$ (mm), $\Delta E$ (mm), Altitude (m), Checkbox de inclusão na poligonal e Status de Correção [29].
*   **Dados Numéricos Monospace:** UTM e coordenadas geográficas possuem até 10+ dígitos numéricos [10]. Para evitar desalinhamentos de leitura causados por fontes proporcionais, **todos os dados numéricos de coordenadas devem usar fontes monoespaçadas** com a propriedade CSS `font-variant-numeric: tabular-nums` [10, 16].
*   **Deltas de Erros:** Células de $\Delta N$ e $\Delta E$ calculam a distância horizontal entre dados brutos e corrigidos [109]. Valores piores que **0.10m** (limites artificiais do INCRA) recebem realce visual automático com texto vermelho escuro e fundo vermelho suave [61]. Linhas sem translação aplicada recebem fundo amarelo claro de estado "bruto" [109].

### 7.3 Área de Visualização (Mapa Leaflet)
*   **Configuração Obrigatória:** Escala gráfica (`L.control.scale()`) adicionada ao mapa [36, 61]. Cursor com escuta ativa atualizando as coordenadas em tempo real na Status Bar inferior [36, 61].
*   **Popups Dark Glass:** Balões de informação sobre os vértices estilizados com fundo escuro semitransparente ("dark glass") em substituição ao fundo branco padrão do Leaflet [30, 36].
*   **Super-Zoom e Grade Métrica:** Suporte a níveis de zoom estendidos de **21 a 24** [61]. A partir de zoom > 20, a camada de satélite é ocultada (opacidade 0) para evitar distorções de renderização, e uma grade métrica local de verde-menta fina (0.6px) a cada 1 metro é projetada sobre o canvas para inspeção analítica [61].

### 7.4 Banimento Absoluto de Diálogos Nativos
Nenhuma ocorrência de `alert()`, `confirm()` ou `prompt()` do navegador é permitida na codebase [31, 35]. São implementados componentes customizados estilizados que respeitam a identidade visual:
*   `showToast(message, type)`: Toasts de feedback de sucesso, aviso ou erro [35].
*   `showConfirm(title, message, onConfirm)`: Modais de confirmação para ações destrutivas ou de recálculo [35].

---

## 8. Ocultação Dinâmica e Comportamento de Router Guard na Nuvem
O frontend compilado é idêntico para o app local e para o servidor Web Cloud (Hostinger) [153]. No entanto, a aplicação detecta o host de acesso para proteger operações administrativas e de hardware [144, 153].

### 8.1 Detecção de Ambiente (Host Detection)
O frontend analisa a origem da requisição durante o bootstrap [144, 153]:
```typescript
const isLocalEnvironment = (): boolean => {
  const host = window.location.origin;
  return host.includes('localhost') || host.includes('127.0.0.1') || host.includes('[::1]');
};
```

### 8.2 Ocultação Dinâmica de Elementos (Web Cloud Hub)
Se o ambiente for detectado como **Web Cloud (Hostinger)**, as seguintes modificações de UI são aplicadas reativamente para prevenir erros de I/O locais [144, 154]:

1.  **Bloqueio e Ocultação de Dropzones:** As dropzones de arrastar arquivos brutos (`#triagem-dropzone` e `#homologacao-dropzone`) são completamente ocultadas e desativadas [144, 154].
2.  **Ocultação de Seções Locais:** O painel físico do workspace do Windows (`#painel-workspace-gnss`) e as ferramentas de automação pesada do robô HGO são escondidos da visualização [144, 154].
3.  **Remoção de Itens da Sidebar:** Os botões de menu da sidebar correspondentes às páginas "Organizador HGO", "Área de Fronteira", "Banco CCIR" e "Levantamentos" recebem a classe CSS `.local-only-route` e são ocultados via `display: none !important` [154].
4.  **Injeção de Badge Contextual:** O cabeçalho superior ou a sidebar recebe o badge visual "Hub Web Cloud", informando que o sistema opera em modo de consulta de dados [154].
5.  **Mensagem de Status:** Uma mensagem de rodapé é injetada na status bar: *"Modo de Consulta Hub Web Ativo. Operações de Ingestão Restritas ao App Desktop."* [144].

### 8.3 Guarda de Rotas (Router Guard)
Caso o operador tente acessar rotas de processamento local digitando o hash diretamente no navegador (ex: `https://gerencigeo-seu-site.com.br/#mesa_trabalho`), o roteador central (`main.ts`) bloqueia a navegação [154]:

```typescript
const localOnlyRoutes = ['#levantamentos', '#hgo', '#fronteira', '#ccir', '#mesa_trabalho'];

router.beforeEach((toHash) => {
  if (!isLocalEnvironment() && localOnlyRoutes.includes(toHash)) {
    showToast("Operação restrita ao Software Desktop Local.", "error");
    return '#dashboard'; // Redireciona imediatamente
  }
  return toHash;
});
```

---

## 9. Diretrizes de Responsividade e Breakpoints
Para garantir a visualização correta da workstation e do Panorama Operacional (Dashboard) em qualquer tela, adota-se a filosofia Mobile-First progressiva [156, 157].

### 9.1 Breakpoints de Visualização [157]
| Largura de Tela | Breakpoint CSS | Equivalente Tailwind | Comportamento UI Esperado |
| :--- | :--- | :--- | :--- |
| **0px – 479px** | Base (Sem MQ) | Base | Coluna única, menu recolhido, KPIs horizontais compactos, ocultação de textos secundários [123, 157]. |
| **480px – 767px** | `min-width: 480px` | `sm:` | Transição para 2 colunas nos formulários, inputs em XS e altura h-8 [95, 157]. |
| **768px – 1024px** | `min-width: 768px` | `md:` / `lg:` | Sidebar em modo compacto (60px), mapa e tabela inferiores divididos [59, 157]. |
| **1025px – 1440px** | `min-width: 1025px` | `xl:` | Layout completo da workstation, grids de 6 colunas ativados, splitters ativos [148, 157]. |
| **Acima de 1440px** | `min-width: 1441px` | `2xl:` | Max-width aplicado nos containers flutuantes de configuração para evitar distorções [157]. |

### 9.2 Toque e Interação de Elementos Clicáveis
*   **Área de Toque Mínima:** Elementos interativos em dispositivos móveis ou coletores de campo devem possuir área mínima de toque de **44x44px** (padrão WCAG 2.2) [162, 163].
*   **Espaçamento de Botões:** Botões adjacentes devem manter distância mínima de **8px** (definidos via padding ou margin de grade) para evitar cliques acidentais em campo [162].
*   **Estados de Interação:** Todo botão deve possuir estilização visualmente distinta para os estados `:hover` (foco do ponteiro), `:focus` (navegação física por teclado, sem remover o outline padrão de acessibilidade) e `:active` (momento exato do clique) [162, 163].
