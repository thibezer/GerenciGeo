# GerenciGeo Project Lifecycle (Memória Operacional)
**Pilar 3 — Consolidação do Protocolo V.L.A.E.G., Pesquisas, Invariantes, Planos de Fases e Progresso**
**Versão do Documento:** 2.8.0
**Status:** Homologado e Consolidado

---

## 1. O Protocolo V.L.A.E.G. (Diretrizes Operacionais)
Para mitigar a variabilidade probabilística inerente aos modelos de inteligência artificial e garantir que agentes autônomos operem com 100% de confiabilidade, todo o desenvolvimento do ecossistema do GerenciGeo adota o protocolo de conduta **V.L.A.E.G.** e a arquitetura de 3 camadas **A.N.T.** [166].

### 1.1 O Ciclo V.L.A.E.G. [176]
*   **V — Visão (Fase 1):** Antes que qualquer código seja escrito, o formato do payload e as regras de negócio devem ser estipulados e confirmados de forma explícita [168, 172].
*   **L — Link (Fase 2):** Testes de conectividade assíncronos e handshakes atômicos com APIs externas devem validar as conexões do arquivo `.env` [169].
*   **A — Arquitetura (Fase 3):** Construção baseada em divisões rígidas de responsabilidade em 3 camadas [170].
*   **E — Estilo (Fase 4):** Refinamento visual de payloads de entrega e interfaces para consistência de UI [171].
*   **G — Gatilho (Fase 5):** Deploy em produção na nuvem com configurações de cron-jobs e listeners de automação [172].

### 1.2 A Arquitetura de 3 Camadas A.N.T. [170]
1.  **Camada 1 — Arquitetura (`architecture/`):** POPs (Procedimentos Operacionais Padrão) escritos em Markdown definindo regras, entradas e tratamentos de borda. Se a lógica do software for alterada, o POP deve ser atualizado obrigatoriamente antes do código [170].
2.  **Camada 2 — Navegação:** O cérebro do agente que roteia e encaminha dados entre POPs e ferramentas sem tentar realizar tarefas pesadas diretamente [170].
3.  **Camada 3 — Ferramentas (`tools/`):** Scripts Python atômicos, determinísticos e totalmente testáveis off-line [170].

---

## 2. Invariantes do Sistema e Gaps de Engenharia
As invariantes de desenvolvimento representam regras que nunca podem ser violadas na codebase [41].

### 2.1 Tranca de Cold Storage (Read-Only Safety Lock)
*   **Regra:** Levantamentos que possuam seu status alterado para `'ARQUIVADO'` na tabela `levantamentos` tornam-se imutáveis [98].
*   **Mecanismo:** O middleware `verificar_propriedade_arquivada` em `api.py` intercepta rotas de escrita (POST, PUT, DELETE) direcionadas a pontos, segmentos ou confrontantes daquela propriedade [98]. Se houver tentativa de escrita, o servidor retorna instantaneamente o código **HTTP 403 Forbidden**, barrando alterações cadastrais ou geodésicas de projetos arquivados de forma definitiva [98, 122].

### 2.2 Propagação de Incerteza (M-Sigma)
*   **Regra:** Os desvios padrão (Sigmas) de Base e Rovers devem ser compostos de forma quadrática para determinar a incerteza final de cada marco do levantamento [41]:
    $$\sigma_{final} = \sqrt{\sigma_{rover}^2 + \sigma_{base}^2}$$ [41]

### 2.3 Fechamento Topológico Estrito
*   **Regra:** Toda topologia perimetral de matrícula cadastrada no sistema deve possuir obrigatoriamente um segmento de divisa que conecta o último vértice de volta ao primeiro vértice na cadeia de caminhamento ($P_{last} \to P_1$), impedindo poligonais abertas no mapa [41, 56, 107].

---

## 3. Histórico Evolutivo do Plano de Fases (Fases 0 a 6)
O projeto do GerenciGeo foi executado e homologado de forma linear através das seguintes fases do cronograma [164]:

### Fase 0: Inicialização e Planejamento Multi-Agente [CONCLUÍDO] [193]
*   Criação dos arquivos de persistência de memória do projeto (`task_plan.md`, `findings.md`, `progress.md`) [193].
*   Definição e estruturação da constituição original no arquivo `gemini.md` [193].

### Fase 1: DB & Persistência [CONCLUÍDO] [193]
*   Injeção das colunas `status_ponto` e `ponto_base_id` em `database/models.py` [193].
*   Implementação de rotina transacional de migração atômica usando PRAGMAs do SQLite (`PRAGMA table_info`), tolerando execuções recorrentes sem quebra do banco [38, 193].

### Fase 2: Engenharia Geodésica e Translação [CONCLUÍDO] [194]
*   Injeção do parâmetro `base_escolhida_id` no `TxtGeodesicParser` [194].
*   Ajuste do motor de translação espacial 3D ECEF de rampa combinando os sigmas de propagação de erro de bases e rovers [39, 194].

### Fase 3: Exposição Backend da API [CONCLUÍDO] [194]
*   Disponibilização do parâmetro `base_escolhida_id` no endpoint `/importar-txt` [194].
*   Criação do endpoint transacional POST `/salvar-ordem` para salvar caminhamentos e reconstruir divisas sequencialmente de forma automática [40, 194].

### Fase 4: Refinamento Frontend UI/UX [CONCLUÍDO] [195]
*   Desacoplamento físico e modularização da Mesa de Trabalho no Vite entre as Etapas de Trabalho (Mesa Geodésica, Organizador de Perímetro, Emissor de Documentos e Histórico de Auditoria) para ganho de área útil [195].
*   Habilitação padrão da visualização de coordenadas em UTM (Norte/Este) com destaque de precisão pior que 0.10m em vermelho suave [61, 195, 196].

### Fase 5: Exportação e Download de Shapefile (.ZIP) [CONCLUÍDO] [197]
*   Acoplamento da biblioteca `pyshp` no requirements local [197].
*   Desenvolvimento do gerador in-memory de Shapefiles de dupla camada (pontos e contornos poligonais na Projeção UTM Zone 22S / EPSG:31982) transmitidos em streaming direto para o navegador [70, 197].
*   Plotagem dinâmica das parcelas no mapa do Dashboard com estilo *Mint-vibrant* [197].

### Fase 6: Laudos de Faixa de Fronteira (Módulo 8) [CONCLUÍDO] [198]
*   Cálculo determinístico de distância de isolamento elipsoidal de 150 km até a fronteira do Paraguai usando `pyproj.Geod` [198].
*   **Pivotagem Tecnológica:** Exclusão completa de dependências pesadas do Microsoft Word (`python-docx` e arquivos `.docx`) em favor de templates HTML nativos estilizados via Tailwind CSS de alta performance, prontos para impressão física no cliente por meio de `window.print()` e CSS `@media print` [198].

---

## 4. Log de Manutenção e Saneamento de Especificações Obsoletas
Ao longo das atualizações lógicas das versões v2.4 e v2.5, as seguintes rotinas de engenharia foram descontinuadas ou ajustadas para evitar falhas de interpretação e retrocompatibilidade [126]:

### 4.1 Decomissionamento de Geração do Word (.docx) no Módulo 8
*   **Estado Anterior:** O Módulo 8 (Fronteira) realizava a injeção de dados cadastrais em templates de extensão `.docx` copiados para a pasta técnica `G:` e manipulados por bibliotecas locais de automação de documentos [165].
*   **Saneamento:** A geração de arquivos `.docx` e a biblioteca `python-docx` foram **completamente removidas e limpas do repositório** [198]. Toda emissão de laudos de faixa de fronteira e requerimentos de ratificação foi migrada para **HTML nativo premium carregado em memória volátil** de servidor por meio de requisições GET, acionando de forma atômica o seletor de impressão do cliente (`window.print()`) [69]. Painéis laterais e botões de controle são limpos da folha A4 final através da classe de ocultação `.no-print` [69].

### 4.2 Desativação do Fluxo IBGE-PPP Automático (Transição Ativa)
*   **Estado Anterior:** A esteira de ingestão e triagem espacial submetia automaticamente o arquivo RINEX da Base recém-convertida no HGO para o portal IBGE-PPP via tarefa assíncrona (`run_ppp_task`) e renderizava o carregamento no frontend [46].
*   **Saneamento:** O fluxo automático foi **temporariamente desativado e desabilitado** tanto no backend quanto no frontend (`mesa_trabalho.ts`) [46]. Os blocos lógicos foram mantidos exclusivamente em formato comentado no código para fins de auditoria histórica de engenharia [46]. A submissão científica de pós-processamento de bases passa a ser disparada manualmente pelo operador técnico na aba dedicada da Ribbon, poupando concorrências de janelas e consumo desnecessário de buffers [46].

### 4.3 Exclusão do Bloco de Assinatura Física nos Templates (V2.5.3)
*   **Estado Anterior:** O template oficial do Laudo Técnico (`laudo_tecnico.html`) incluía um bloco visual final destinado para assinaturas à caneta do Responsável Técnico do projeto [145].
*   **Saneamento:** O bloco físico de assinatura do RT foi **completamente expurgado e excluído** do template [145]. O fechamento agora finaliza de forma limpa na data e local estruturados [145]. Isso libera área vertical valiosa e previne a ocorrência de páginas órfãs na folha impressa (onde apenas o bloco de assinatura ocupava uma folha extra ao final do memorial justificativo) [145]. As assinaturas são certificadas de forma 100% digital e eletrônica pelo portal de certificação [145].

### 4.4 Exclusão da Constraint de Unicidade Global de Vértices (SQLite)
*   **Estado Anterior:** A tabela `banco_pontos` local possuía uma restrição única estrita baseada na coluna `codigo_completo UNIQUE` [136].
*   **Saneamento:** A restrição única global foi **removida e descontinuada** por meio de migração de banco transacional corretiva [136]. A unicidade passou a ser composta por:
    `UNIQUE(levantamento_id, planilha_origem, codigo_completo)` [136]
    Esta mudança foi necessária para prevenir colisões físicas de banco de dados e perda de vértices de divisa lindeira compartilhados comuns quando múltiplas planilhas ODS (diferentes matrículas do mesmo levantamento) eram importadas [136].

### 4.5 Descontinuação do Campo de Descrição Textual de Divisas (`divisa_descricao_texto`)
*   **Estado Anterior:** A Declaração de Anuência do Confrontante (`declaracao_anuencia.html`) utilizava uma variável do tipo string longa (`divisa_descricao_texto`) contendo uma descrição textual e redigida manualmente sobre o caminhamento perimetral [132].
*   **Saneamento:** A descrição textual livre foi **completamente eliminada e extinta do motor de geração de relatórios** [132]. Foi substituída pela injeção dinâmica de uma **tabela topográfica estruturada de divisas** [132]. A tabela calcula de forma rigorosa em tempo real os azimutes (GMS), distâncias planas de campo, as coordenadas geográficas (Lat/Lon) iniciais e finais dos vértices correspondentes de cada trecho lindeiro do confrontante [62, 132].

### 4.6 Eliminação Completa de Métodos Nativos de Alerta (`alert` / `confirm`)
*   **Estado Anterior:** Rotinas de validação de dados e exclusão de cadastros de clientes acionavam funções nativas do JavaScript como `alert()` e `confirm()` [31].
*   **Saneamento:** O acionamento de diálogos nativos do browser foi **estritamente proibido e banido de toda a codebase** [31, 35]. A exibição de feedbacks e a solicitação de confirmações para exclusões em cascata (ON DELETE CASCADE) foram inteiramente migradas para os componentes customizados `showToast()` e `showConfirm()` desenvolvidos para manter a consistência de design [35].
