# task_plan.md — Plano de Tarefas (Protocolo V.L.A.E.G.)

Este arquivo serve como o mapa de memória de longo prazo para as fases, objetivos e checklists de engenharia do sistema.

---

## 🎯 Objetivo Geral
Implementar o suporte a Múltiplas Bases Geodésicas, Estados de Rover ('BRUTO', 'CORRIGIDO') e o Ajuste Interativo de Caminhamento perimetral com recálculo automático de poligonais.

---

## 🗺️ Fases do Projeto

### Fase 0: Inicialização e Planejamento Multi-Agente [CONCLUÍDO]
- [x] Criar os arquivos de memória do projeto (`task_plan.md`, `findings.md`, `progress.md`).
- [x] Definir a Constituição do Projeto em `gemini.md` com os novos esquemas de dados.
- [x] Apresentar o Blueprint técnico detalhado e obter aprovação do Piloto do Sistema.

### Fase 1: DB & Persistência (Agente 1) [CONCLUÍDO]
- [x] Modificar a DDL da tabela `pontos` em `database/models.py`.
- [x] Implementar a migração automática segura em `create_tables` usando PRAGMAs do SQLite.
- [x] Validar a criação física das colunas no banco de dados local.

### Fase 2: Engenharia Geodésica e Translação (Agente 2) [CONCLUÍDO]
- [x] Injetar o parâmetro opcional `base_escolhida_id` no `TxtGeodesicParser`.
- [x] Refatorar `obter_base_ppp` para busca específica por ID ou fallback tradicional.
- [x] Ajustar o cálculo ECEF 3D para usar o ponto geodésico no banco e o correspondente UTM no arquivo (por tag ou nome).
- [x] Propagar incertezas e salvar com `status_ponto = 'CORRIGIDO'` e linkar `ponto_base_id`.

### Fase 3: Exposição Backend da API (Agente 3) [CONCLUÍDO]
- [x] Expor `base_escolhida_id` no endpoint `/importar-txt` da `api.py`.
- [x] Construir o novo endpoint `POST /levantamentos/{id}/matriculas/{matricula_id}/salvar-ordem`.
- [x] Implementar a lógica transacional: salvar a ordem dos pontos, expurgar segmentos antigos e reconstruir a cadeia sequencial de divisas perimetrais com fechamento automático.

### Fase 4: Refinamento Frontend UI/UX (Agente 4) [CONCLUÍDO]
- [x] Separar a interface de levantamentos em duas etapas no Tailwind/Vite (Mesa Geodésica vs Organizador de Perímetro) para máximo aproveitamento do espaço útil de tela.
- [x] **Etapa 1 (Mesa Geodésica)**: Focar no upload de arquivos com combobox dinâmico e triagem quadripolar, exibição padrão de coordenadas UTM de vértices e sigmas com realce em vermelho $> 0.10$m. Ocultar confrontantes e divisas.
- [x] **Etapa 2 (Organizador de Perímetro)**: Listar os pontos de caminhamento verticalmente com botões de realinhamento reativos ("Subir"/"Descer"), integrando com o botão "Salvar Perímetro & Recomputar" para invocar a API de ordenação, além de expor a tabela de divisas e confrontantes para qualificação técnica real-time.

---

## 🛠️ Diretriz de Arquitetura V2.3 (Ajuste Fino de Escopo)
- **Ingestão Quadripolar**: Exibir as 4 opções explícitas e corretas de destinação de arquivos na Mesa de Ingestão:
  - `"[Base - Enviar ao PPP]"` (valor: `base`)
  - `"[Rover Estático - Relatório de Coordenadas Corrigidas]"` (valor: `rover_estatico_corrigido`)
  - `"[Rover Estático - Arquivo Bruto (Aguardando Baseline)]"` (valor: `rover_estatico_bruto`)
  - `"[RTK - Ingestão de Pontos (Vincular à Base Selecionada)]"` (valor: `rover_rtk`)
- **AutoCAD UTM Workspace**: Coordenadas planas UTM (Norte, Este, Altitude em Metros) definidas como o formato de exibição padrão nativo inicial ao carregar qualquer levantamento.
- **Isolação Física de Telas**: Ocultação estrita e alternância completa dos blocos HTML correspondentes entre a Etapa 1 (Processamento Geodésico) e a Etapa 2 (Perímetro & Cartório) para máximo aproveitamento do espaço útil de tela.
