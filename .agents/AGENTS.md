# Regras do Projeto (GerenciGeo)

## Organização de Arquivos no Workspace

1. **Arquivos Markdown (.md)**:
   - Todos os arquivos `.md` que servem como documentação técnica livre, manifestos técnicos de arquitetura, guias de design e relatórios conceituais (como `GerenciGeo_Design_UI.md`, `gerencigeo_georreferenciamento.md`, `gerencigeo_manifesto_v2.md`, `progress.md`, `task_plan.md`, `findings.md`, `protocolo_vlaeg.md`, etc.) devem ser organizados e mantidos estritamente na pasta `Arquivos .md`.
   - **Exceções Críticas**:
     - `gemini.md` (na raiz do projeto): deve permanecer obrigatoriamente na raiz do workspace, pois atua como a constituição ativa e as regras do projeto lidas de forma programática pelo agente de IA.
     - `.agents/workflows/*.md`: guias de workflow do agente de IA devem permanecer sob a respectiva subpasta no diretório `.agents/` para que o sistema de triggers do agente os identifique corretamente.
     - `.aider.chat.history.md` (na raiz): histórico de chat do terminal gerado pelo Aider deve permanecer na raiz para o correto funcionamento da ferramenta.

2. **Arquivos de Teste e Logs**:
   - Arquivos temporários gerados por testes, cadernetas brutas de teste, saídas de logs de erro manuais e logs residuais (como `test_log.txt`, `test_out.txt`, `saida.txt`, `err.txt`, `100`, etc.) devem ser movidos e mantidos no diretório `Arquivos de teste` criado na raiz do workspace para manter a raiz limpa.
   - **Exceção**: Arquivos de log gerados dinamicamente em tempo de execução pelos servidores (`gerencigeo.log`, `api_debug.log`) que são recriados na raiz podem ser mantidos ou excluídos, mas não devem obstruir o fluxo de desenvolvimento principal.

3. **Arquivos e Scripts de Código Fonte do Backend**:
   - Os arquivos Python de execução na raiz (`api.py`, `buscador_rinex.py`, `config.py`, `converterrinex.py`, `main.py`, `requirements.txt`) e configurações globais (`tsconfig.json`, `.gitignore`) não devem ser movidos ou reestruturados sem o devido ajuste nas diretivas de importação (`sys.path` ou imports do backend), pois o backend depende de sua presença na raiz.
   - O banco de dados SQLite (`gerencigeo.db` e backups) deve permanecer na raiz conforme configurado no `config.py`.

## Automações de Workflow

4. **Comando/Gatilho "PR do jules"**:
   - Sempre que o usuário mencionar ou disser "PR do jules", o agente deve automaticamente:
     1. Executar `git fetch --all` para obter todas as branches remotas do repositório.
     2. Identificar e importar/fazer merge de todas as branches pendentes contendo alterações ou testes criados pelo Jules (branches que iniciam ou contêm `jules`, `fix/`, `feat/`, `test-` não unificadas na `main`).
     3. Resolver quaisquer conflitos promovendo as implementações mais recentes e robustas.
     4. Executar a suíte de testes unitários (`python -m unittest discover -s tests -p "test_*.py"`) para validar a integridade.
     5. Apresentar um resumo detalhado e organizado de todas as branches unificadas e validações realizadas.

## Memória de Aprendizado e Estabilidade (Jules & Antigravity)

5. **Registro Obrigatório e Consulta de Aprendizados (.jules/)**:
   - Toda e qualquer correção de bugs críticos ou regressões de estabilidade (como erros de navegação SPA por desanexação de DOM/`invalidateSize`, comparações de IDs `String(id) === String(id)` e fallbacks de polilhas nos mapas) deve ser **obrigatoriamente documentada e mantida** nos arquivos da pasta `.jules/` ([.jules/bolt.md](file:///d:/OneDrive_Thiago/OneDrive/Desenvolvimento/GerenciGeo/.jules/bolt.md) e [.jules/learnings.md](file:///d:/OneDrive_Thiago/OneDrive/Desenvolvimento/GerenciGeo/.jules/learnings.md)).
   - Os agentes de IA (Antigravity e Jules) **devem obrigatoriamente consultar e respeitar essas diretrizes de aprendizado** antes e durante qualquer alteração ou integração de código, assegurando que funcionalidades básicas e fundamentais não parem de funcionar.
