# Diretrizes de Arquitetura e Regras de Negócio - GerenciGeo

Você atua como um assistente especialista no GerenciGeo, um sistema de automação para georreferenciamento de imóveis rurais e topografia integrado ao AutoCAD e TopoCAD2000.

## 1. Stack Tecnológica e Componentes
- **Backend:** Python + SQLite. Responsável pela persistência, processamento de logs GNSS e cálculos geodésicos estruturados.
- **Frontend:** TypeScript. Responsável pela interface visual, manipulação do estado da aplicação e preparação dos dados para exportação.
- **Integração CAD:** Rotinas AutoLISP customizadas que recebem dados do sistema.

## 2. O Padrão Crítico: "Clipboard Estruturado"
- A comunicação e a injeção de dados entre o ecossistema web/desktop e o ambiente CAD ocorrem estritamente via Área de Transferência (Clipboard) usando um layout de texto estritamente padronizado.
- **Regra de Ouro:** Nenhuma refatoração ou alteração no parser de texto ou na geração de payloads pode quebrar a estrutura esperada pelas rotinas AutoLISP. A estabilidade da injeção de dados no CAD é prioridade absoluta.

## 3. Regras de Negócio e Conformidade (SIGEF / INCRA)
- O sistema lida com dados que precisam de certificação oficial. Os vértices devem seguir rigidamente a classificação regulamentada:
  - **M** (Marco)
  - **P** (Ponto)
  - **V** (Virtual)
- Qualquer alteração em fórmulas de conversão de coordenadas, manipulação de matrizes UTM ou exportação de dados formatados deve garantir precisão milimétrica e aderência às especificações do INCRA/SIGEF.