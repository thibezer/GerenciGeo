# Playground de Testes Isolados de Componentes UI (Sandbox)

Este diretório contém o ambiente isolado de testes e desenvolvimento dos **Web Components Nativos** do GerenciGeo.

---

## 🎯 Objetivo

Permitir a criação, testes visuais e aprimoramento contínuo dos componentes de UI em ambiente 100% isolado, sem dependência do banco de dados, rotas ou código de produção do GerenciGeo.

---

## 📁 Conteúdo

- **`index.html`**: Página de testes e demonstração ao vivo dos componentes.
- **`pagina_testes.ts`**: Controller de testes, mock de dados e console de log em tempo real.
- **`/gg-lista-flutuante/`**: Cópia isolada do componente `<gg-lista-flutuante>`.
- **`/gg-botao-primario/`**: Cópia isolada do componente `<gg-botao-primario>`.

---

## 🚀 Como Executar

Enquanto o servidor de desenvolvimento Vite estiver rodando (`npm run dev` na pasta `frontend`):

Abra no seu navegador:  
`http://localhost:5173/src/testes_componentes/index.html`

---

## 📖 Documentação Completa e Guia de Portabilidade

Para aprender a criar novos componentes, testá-los e integrá-los em outros sites (HTML puro, React, Vue, WordPress, PHP, etc.), consulte o guia oficial:

👉 **[GUIA_COMPONENTES_TESTES_PORTABILIDADE.md](../../../Arquivos%20.md/GUIA_COMPONENTES_TESTES_PORTABILIDADE.md)**
