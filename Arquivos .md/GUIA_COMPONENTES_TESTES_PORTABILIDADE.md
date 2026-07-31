# Guia de Componentes Isolados, Testes e Portabilidade Universal — GerenciGeo

> **Objetivo deste documento:** orientar a criação, teste e manutenção de componentes de UI de forma totalmente isolada (Sandbox / Playground Local), e detalhar como esses componentes Web Components (Custom Elements Nativos) podem ser integrados tanto ao GerenciGeo quanto a **qualquer outro site, sistema web ou framework externo** sem dependências de terceiros.

**Última atualização:** 30/07/2026  
**Tecnologia:** W3C Web Components Nativos (HTML5 + TypeScript/JavaScript + Vanilla CSS em Shadow DOM)

---

## 1. O Conceito de Portabilidade Universal

Os componentes criados neste projeto não são presos a uma biblioteca específica (como React, Vue ou Angular) nem dependem da infraestrutura do GerenciGeo para funcionar.

Eles utilizam a especificação oficial de **Web Components do W3C**, o que garante:

1. **Zero Dependências Runtimes:** funcionam diretamente nos navegadores modernos (Chrome, Edge, Firefox, Safari, pywebview) sem biblioteca externa de renderização.
2. **Encapsulamento Total de Estilo (Shadow DOM):** o CSS interno do componente nunca vaza para o site onde ele é instalado, e estilos globais do site hospedeiro não quebram o visual interno do componente.
3. **Customização via CSS Variables (Design Tokens):** o site hospedeiro pode alterar as cores, fontes e espaçamentos do componente simplesmente definindo variáveis CSS (ex: `--gg-cor-primaria: #ff6600;`).
4. **Interoperabilidade Total:** uma única tag como `<gg-lista-flutuante></gg-lista-flutuante>` pode ser usada em HTML puro, WordPress, PHP, Laravel, React, Vue, Svelte, Angular, Electron ou pywebview.

---

## 2. Estrutura do Ambiente de Testes Isolados (Sandbox)

Para desenvolver novos componentes ou aprimorar os existentes sem interferência do código de produção do GerenciGeo, utilize o diretório de testes isolados:

```
/frontend/src/testes_componentes
│
├── /gg-lista-flutuante/             # Cópia isolada do componente Lista Flutuante
│   ├── gg-lista-flutuante.ts
│   └── gg-lista-flutuante.css
│
├── /gg-botao-primario/              # Cópia isolada do componente Botão Primário
│   ├── gg-botao-primario.ts
│   └── gg-botao-primario.css
│
├── index.html                        # Página HTML de testes locais (Playground)
├── pagina_testes.ts                  # Controller de dados mockados e log de eventos
└── README.md                         # Instruções rápidas do ambiente
```

### Como Executar a Página de Testes Locais:
- **No Servidor Dev (Vite):** Acesse `http://localhost:5173/src/testes_componentes/index.html` enquanto o servidor Vite estiver rodando (`npm run dev`).
- **No Navegador Direto:** O arquivo `index.html` também pode ser aberto via bundler em qualquer ambiente local.

---

## 3. Passo a Passo: Criando e Testando um Novo Componente no Sandbox

Quando for criar um novo componente (ex: `<gg-input-texto>` ou `<gg-dialogo>`):

1. **Criar a pasta no Sandbox:** Crie `/src/testes_componentes/gg-nome-componente/`.
2. **Criar os arquivos base:**
   - `gg-nome-componente.css`: Defina as regras de estilo usando tokens CSS `var(--gg-*, fallback)`.
   - `gg-nome-componente.ts`: Implemente a classe estendendo `HTMLElement`, crie o `attachShadow({ mode: 'open' })` e defina `customElements.define('gg-nome-componente', Classe)`.
3. **Registrar na Página de Testes (`pagina_testes.ts`):**
   - Importe o componente: `import './gg-nome-componente/gg-nome-componente';`
   - Adicione mocks de dados ou ouvintes de eventos para testar o comportamento.
4. **Adicionar ao Playground (`index.html`):**
   - Adicione uma seção de teste no `index.html` com variações de estados (ex: normal, hover, desabilitado, erro).
5. **Validar no Console de Eventos:**
   - Verifique se os cliques, digitações ou seleções disparam eventos customizados com `composed: true`.
6. **Promover para Produção:**
   - Quando o componente estiver validado e aprovado no Sandbox, copie a pasta para `/src/components/gg-nome-componente/` para consumo pela aplicação principal do GerenciGeo.

---

## 4. Padrão Universal de Contrato (API do Componente)

Para que qualquer sistema consiga conversar com seu componente sem problemas, siga rigorosamente a API de 3 vias:

```
          ┌───────────────────────────────────────────────┐
          │               Aplicação Hospedeira            │
          │         (GerenciGeo / React / Site Externo)   │
          └───────┬───────────────────────────────▲───────┘
                  │                               │
       Atributos / Propriedades              Eventos Customizados
   (Entrada: String/Num ou Objetos)        (Saída: detail + composed)
                  │                               │
                  ▼                               │
          ┌───────────────────────────────────────────────┐
          │             <gg-nome-componente>              │
          │               (Web Component)                 │
          └───────────────────────────────────────────────┘
```

### 1. Entrada de Dados Simples (Atributos HTML)
Para strings, booleans ou números:
```html
<gg-botao-primario variante="destaque" disabled>Salvar</gg-botao-primario>
```
No TypeScript do componente:
```ts
static get observedAttributes() {
  return ['variante', 'disabled'];
}
attributeChangedCallback(name: string, oldValue: string, newValue: string) {
  // Reage a mudanças dinâmicas no atributo
}
```

### 2. Entrada de Dados Complexos (Propriedades JS)
Para arrays ou objetos JavaScript:
```ts
const lista = document.querySelector('gg-lista-flutuante');
lista.itens = [
  { id: '1', label: 'Item A' },
  { id: '2', label: 'Item B' }
];
```
No TypeScript do componente:
```ts
set itens(valor: ItemLista[]) {
  this._itens = valor || [];
  this.render();
}
get itens(): ItemLista[] {
  return this._itens;
}
```

### 3. Saída de Eventos (Eventos Customizados)
O componente **nunca** chama funções globais. Ele emite um `CustomEvent` nativo com `bubbles: true` e `composed: true` (para que o evento consiga atravessar o Shadow DOM):
```ts
this.dispatchEvent(
  new CustomEvent('gg-selecionar', {
    detail: { id: '123', valor: 'Lote 01' },
    bubbles: true,
    composed: true // ESSENCIAL para atravessar o Shadow DOM
  })
);
```

---

## 5. Como Integrar os Componentes em Outros Sites e Sistemas

Como os componentes seguem a especificação oficial de Web Components, a integração em outros ambientes é imediata e sem atrito.

### Exemplo 1: HTML Estático / Site Vanilla JS
Basta carregar o script JavaScript do componente e usar a tag diretamente no HTML:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <!-- Opcional: Definir os tokens de tema do site hospedeiro -->
  <style>
    :root {
      --gg-cor-primaria: #0066cc; /* Customiza a cor principal do componente */
      --gg-raio-borda: 8px;
    }
  </style>

  <!-- Carrega o bundle do componente -->
  <script type="module" src="./gg-lista-flutuante.js"></script>
</head>
<body>

  <!-- Usa o componente exatamente como uma tag HTML nativa -->
  <gg-lista-flutuante id="meu-menu" texto-padrao="Escolha uma opção"></gg-lista-flutuante>

  <script>
    const menu = document.getElementById('meu-menu');
    
    // Passa dados complexos via propriedade
    menu.itens = [
      { id: 'a', label: 'Opção 1' },
      { id: 'b', label: 'Opção 2' }
    ];

    // Escuta o evento emitido pelo componente
    menu.addEventListener('gg-selecionar', (event) => {
      console.log('Item escolhido no site externo:', event.detail);
    });
  </script>
</body>
</html>
```

### Exemplo 2: Integração com React / Next.js
No React, Web Components podem ser renderizados diretamente no JSX:

```tsx
import React, { useEffect, useRef } from 'react';
import './gg-lista-flutuante.js'; // Import de registro do Custom Element

export function MeuComponenteReact() {
  const listaRef = useRef<any>(null);

  useEffect(() => {
    if (listaRef.current) {
      // Passa a lista de dados por propriedade JS
      listaRef.current.itens = [
        { id: '10', label: 'Cliente A' },
        { id: '20', label: 'Cliente B' }
      ];

      // Adiciona o ouvinte do evento customizado
      const escutarSelecao = (e: CustomEvent) => {
        console.log('Selecionado no React:', e.detail);
      };

      const el = listaRef.current;
      el.addEventListener('gg-selecionar', escutarSelecao);
      return () => el.removeEventListener('gg-selecionar', escutarSelecao);
    }
  }, []);

  return (
    <div>
      <h3>Componente Web dentro do React</h3>
      <gg-lista-flutuante ref={listaRef} texto-padrao="Selecione..."></gg-lista-flutuante>
    </div>
  );
}
```

### Exemplo 3: Integração com Vue.js (Vue 3)
No Vue, o suporte a Custom Elements é nativo:

```vue
<template>
  <div>
    <gg-lista-flutuante 
      ref="lista" 
      texto-padrao="Selecione..." 
      @gg-selecionar="aoSelecionar"
    ></gg-lista-flutuante>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import './gg-lista-flutuante.js';

const lista = ref(null);

onMounted(() => {
  if (lista.value) {
    lista.value.itens = [
      { id: '1', label: 'Fazenda Santa Maria' },
      { id: '2', label: 'Sítio Ipê' }
    ];
  }
});

function aoSelecionar(event) {
  console.log('Selecionado no Vue:', event.detail);
}
</script>
```

---

## 6. Personalização de Temas Visuais em Sites Externos

Como todo o estilo do componente é parametrizado via **CSS Custom Properties** (Variáveis CSS), o site que hospeda o componente pode alterar a aparência dele sem precisar alterar o código do componente:

```css
/* No CSS do site parceiro / cliente */
:root {
  /* Altera a cor primária global de todos os componentes GG */
  --gg-cor-primaria: #e63946;
  --gg-cor-texto-sobre-primaria: #ffffff;
  
  /* Altera os fundos dos menus flutuantes */
  --gg-cor-fundo: #1d3557;
  --gg-cor-fundo-menu: #457b9d;
  --gg-cor-hover-menu: #a8dadc;
  
  /* Altera o arredondamento de bordas */
  --gg-raio-borda: 12px;
  --gg-fonte-base: 'Roboto', sans-serif;
}
```

---

## 7. Checklist de Qualidade antes de Publicar/Integrar

Antes de liberar um componente criado no Sandbox para produção ou uso externo:

- [ ] **Testado isoladamente no `index.html`** da pasta `/src/testes_componentes/`.
- [ ] **Sem vazamento de CSS:** Todos os seletores estão encapsulados no Shadow DOM.
- [ ] **Variáveis de fallback CSS:** Todo `var(--gg-*)` tem um valor de fallback seguro.
- [ ] **Comunicação por `CustomEvent`:** Eventos disparam com `bubbles: true` e `composed: true`.
- [ ] **Gerenciamento de memória:** Listener de eventos adicionados no `connectedCallback` são devidamente removidos no `disconnectedCallback`.
- [ ] **Navegação por Teclado e ARIA:** Testado com atributos como `role="listbox"`, `aria-expanded` e navegação funcional.
