import os

content = """# 🛰️ GerenciGeo — Manifesto de Especificação Técnica e Arquitetura
**Padrão Arquitetural:** Field-to-Finish Integrado (FastAPI + SQLite + Tailwind/TS + Toolchain Topografia)
**Versão do Documento:** 2.2.0
**Status do Ecossistema:** Estrutura Estratégica Consolidada

Este documento estabelece as diretrizes arquiteturais, a modelagem de dados e as regras de negócio do ecossistema **GerenciGeo**. Ele atua como a única fonte de verdade para o desenvolvimento do sistema, devendo ser interpretado por agentes de IA (como o Antigravity) e desenvolvedores para garantir a consistência absoluta de código entre as camadas de persistência, negócio e interface.

---

## 1. Visão Geral do Fluxo de Trabalho (Toolchain Híbrido Completo)

O GerenciGeo não substitui as ferramentas consagradas de engenharia, mas atua como o **orquestrador central e gerenciador de dados** que elimina o retrabalho braçal, organiza os arquivos de forma invisível e garante a integridade jurídica/técnica exigida pelo INCRA/SIGEF.
+-----------------------------------------------------------------+
|                       CAMPO (Coleta de Dados)                   |
|              - Arquivos Brutos Base e Rovers (.GNS)             |
|              - Arquivos de Linhas de Divisa RTK (.TXT)          |
+-----------------------------------------------------------------+
|
v
+-----------------------------------------------------------------+
|                  GERENCIGEO: INGESTÃO E WORKSPACE               |
|      - Organização em Pastas por Propriedade / Matrícula        |
|      - RPA ConvertRinex (Modo Turbo Esteira: Conversão em Lote) |
|      - Geração Automatizada do arquivo 'DADOS_GERAIS.json'      |
+-----------------------------------------------------------------+
|                                       |
v                                       v
+-----------------------+               +-----------------------+
|   PROCESSAMENTO BASE  |               |  PROCESSAMENTO ROVER  |
| - API IBGE-PPP (Auto) |               |  - Topcon Tools (Man) |
| - Extração do .SUM    |               |  - Exportação de .TXT |
+-----------------------+               +-----------------------+
|                                       |
+-------------------+-------------------+
|
v
+-----------------------------------------------------------------+
|                  CONSOLIDAÇÃO GRÁFICA & AUTOMAÇÃO               |
|       - AutoCAD + TopoCAD 2000 (Geração de Desenhos e ODS)      |
|       - GerenciGeo: Central de Ações, Auditoria e Peças Extra  |
+-----------------------------------------------------------------+

### Divisão de Papéis no Ecossistema:
1. **GerenciGeo (Ingestão e Conversão):** Executa a triagem automatizada, organiza o diretório de arquivos físicos e realiza o processamento automatizado da Base via API do IBGE-PPP.
2. **Topcon Tools (Estático):** O operador utiliza para processar manualmente as baselines dos pontos estáticos (Rovers), exportando um relatório consolidado em formato de texto (`.TXT`).
3. **AutoCAD + TopoCAD 2000:** Centraliza a unificação geométrica (Base processada do PPP + Rovers do Topcon Tools + RTK vindo pronto do aparelho em `.TXT`). O TopoCAD 2000 lida com o desenho perimetral da planta, geração de tabelas e a exportação direta da planilha `.ODS` do SIGEF.
4. **GerenciGeo (Auditor e Gestor Relacional):** Atua como validador de consistência (M-Sigma), gerenciador de metadados das matrículas e confrontantes, emissor de termos de anuência complementares e central de alertas (Action Center).

---

## 2. Hierarquia de Escopo e Modelagem do Banco de Dados (SQLite)

O sistema adota um modelo estrito de restrição de integridade referencial baseado no tripé geodésico-jurídico rural. A criação das tabelas no arquivo `database/models.py` segue obrigatoriamente a ordem hierárquica abaixo para evitar violação de chaves estrangeiras (`FOREIGN KEY`), aplicando `ON DELETE CASCADE` para eliminar dados órfãos automaticamente.

### 2.1 Ordem de Criação do DDL Seguro
1. **`profissionais`**: Responsáveis técnicos pelo georreferenciamento (Credenciados INCRA).
2. **`clientes`**: Entidade jurídica pura (Proprietários/Confrontantes).
3. **`cliente_metadados`**: Extensibilidade dinâmica em formato Chave-Valor para o cliente.
4. **`cliente_historico_logs`**: Rastreabilidade e auditoria de alterações documentais.
5. **`propriedades`**: O escopo global do imóvel físico (equivalente ao perímetro do CAR / CCIR compartilhado).
6. **`propriedade_clientes`**: Tabela associativa M:N (Suporta múltiplos donos, condomínios ou casais).
7. **`matriculas`**: Frações jurídicas individuais da terra. Cada matrícula representa um lote/parcela independente que se tornará uma aba separada na planilha do SIGEF.
8. **`levantamentos`**: A campanha de campo que vincula a propriedade ao profissional técnico.
9. **`pontos`**: Vértices geodésicos medidos. **Vinculados obrigatoriamente a uma Matrícula e a um Levantamento.**
10. **`confrontantes`**: Vizinhos de divisa cadastrados no levantamento.
11. **`segmentos`**: As linhas divisórias (linhas entre dois pontos). **A confrontação ocorre no segmento e pertence a uma Matrícula específica.**
12. **`pendencias`**: Central de Alertas e Ações (Action Center).

### 2.2 Estrutura de Tabelas Corrigida (Amostra DDL SQL)

```sql
-- PROPRIEDADES (Escopo Global)
CREATE TABLE IF NOT EXISTS propriedades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome_propriedade TEXT NOT NULL,
    codigo_car TEXT,
    codigo_ccir TEXT,
    municipio TEXT NOT NULL,
    uf TEXT NOT NULL
);

-- MATRÍCULAS (Individual do Lote)
CREATE TABLE IF NOT EXISTS matriculas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    propriedade_id INTEGER NOT NULL,
    numero_matricula TEXT NOT NULL,
    ccir TEXT,
    itr TEXT,
    area_ha REAL,
    FOREIGN KEY (propriedade_id) REFERENCES propriedades(id) ON DELETE CASCADE
);

-- LEVANTAMENTOS (Campanha de Campo)
CREATE TABLE IF NOT EXISTS levantamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    propriedade_id INTEGER NOT NULL,
    profissional_id INTEGER NOT NULL,
    data_inicio TEXT NOT NULL,
    pasta_projeto TEXT,
    status TEXT DEFAULT 'EM_ANDAMENTO', -- EM_ANDAMENTO, CONCLUIDO, ARQUIVADO
    FOREIGN KEY (propriedade_id) REFERENCES propriedades(id) ON DELETE CASCADE,
    FOREIGN KEY (profissional_id) REFERENCES profissionais(id) ON DELETE CASCADE
);

-- PONTOS (Dados Geodésicos Estruturados padrão SIGEF)
CREATE TABLE IF NOT EXISTS pontos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    levantamento_id INTEGER NOT NULL,
    matricula_id INTEGER NOT NULL,
    nome_vertice TEXT NOT NULL,
    tipo_ponto TEXT NOT NULL, -- M, P, V
    lat REAL, -- Graus Decimais (Ajustado pelo PPP/Topcon)
    lon REAL, -- Graus Decimais (Ajustado pelo PPP/Topcon)
    alt REAL, -- Altitude Elipsoidal (m)
    sigma_lat REAL,
    sigma_lon REAL,
    sigma_alt REAL,
    ordem_caminhamento INTEGER,
    FOREIGN KEY (levantamento_id) REFERENCES levantamentos(id) ON DELETE CASCADE,
    FOREIGN KEY (matricula_id) REFERENCES matriculas(id) ON DELETE CASCADE
);

-- SEGMENTOS (Linhas de Divisa Oficiais)
CREATE TABLE IF NOT EXISTS segmentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    levantamento_id INTEGER NOT NULL,
    matricula_id INTEGER NOT NULL,
    ponto_inicio_id INTEGER NOT NULL,
    ponto_fim_id INTEGER NOT NULL,
    confrontante_id INTEGER,
    tipo_limite_sigef TEXT NOT NULL, -- LA1, LN1, LI1
    metodo_posicionamento_sigef TEXT NOT NULL, -- PG1, MC1, MC2, etc.
    FOREIGN KEY (levantamento_id) REFERENCES levantamentos(id) ON DELETE CASCADE,
    FOREIGN KEY (matricula_id) REFERENCES matriculas(id) ON DELETE CASCADE,
    FOREIGN KEY (ponto_inicio_id) REFERENCES pontos(id) ON DELETE CASCADE,
    FOREIGN KEY (ponto_fim_id) REFERENCES pontos(id) ON DELETE CASCADE,
    FOREIGN KEY (confrontante_id) REFERENCES confrontantes(id) ON DELETE SET NULL
);

3. Gestão Física de Arquivos (WorkspaceManager)
O módulo business/workspace_manager.py organiza os arquivos de forma padronizada e legível no sistema operacional Windows, eliminando a dispersão de dados.

3.1 Estrutura de Diretórios Gerada no Disco
Ao criar ou abrir um Levantamento, o manager extrai do banco o nome da propriedade e o ano do projeto, gerando a seguinte árvore:
[EXPORT_BASE_FOLDER] / Projetos / [Nome_da_Propriedade] / Lev_[ID]_[Ano] /
    ├── /Brutos              <-- Arquivos binários originais (.GNS) da coletora
    ├── /Rinex               <-- Arquivos .obs/.nav gerados pela esteira do ConvertRinex
    ├── /Documentos          <-- Matrículas escaneadas, PDFs de RG e o DADOS_GERAIS.json
    ├── /Processados         <-- Arquivos .sum, .pos do IBGE-PPP e TXTs do Topcon Tools / RTK
    └── /Exportacoes         <-- Peças técnicas complementares ao TopoCAD 2000

    3.2 O Sincronizador Ativo DADOS_GERAIS.json
Localizado na pasta /Documentos de cada projeto, este arquivo mantém os metadados dos clientes e suas respectivas matrículas estruturados para consumo ágil do sistema.

Gatilho de Atualização (Trigger): O arquivo é gerado no POST /levantamentos. No entanto, se o usuário alterar os dados do cliente em PUT /clientes ou adicionar uma nova matrícula em POST /matriculas, a API aciona o WorkspaceManager para sobrescrever e atualizar o JSON nas pastas de todos os projetos ativos daquele cliente, mitigando dados obsoletos.

4. Integração de Processamento e Interface com TopoCAD 2000
Como o processamento gráfico de desenho de plantas, cálculo de tabelas e parte da montagem da planilha ODS do SIGEF é executado com sucesso pelo TopoCAD 2000 dentro do AutoCAD, o GerenciGeo assume o papel de Auditor de Qualidade e Complementador de Dados.

4.1 O Papel do GerenciGeo na Auditoria e Pós-Processamento (Módulo 5)
Filtro de Qualidade de Campo (Filesize QC): Antes de mover dados para as pastas, bloqueia o processamento de arquivos menores que 50KB, enviando-os para a lista de "Pontos Insuficientes/Falhos" para checagem do operador.

Auditoria de Consistência (M-Sigma): Lê os arquivos de texto (.TXT) exportados pelo Topcon Tools e cruza com os dados do IBGE-PPP salvos no banco. O sistema valida se os desvios padrão (Sigmas) dos pontos estáticos e do RTK atendem aos limites regulamentares da 3ª Edição do INCRA (ex: < 0.10m para limites artificiais).

Action Center (Central de Ações Inteligente): O dashboard consome o endpoint /dashboard/alerts e avisa imediatamente o profissional caso:

O Meridiano Central (ex: 51 W para UTM Zone 22S) configurado na esteira do HGO divirja da posição de plotagem real no mapa Leaflet.

Haja falta de dados do cônjuge de um cliente casado (item obrigatório para as Cartas de Anuência e assinaturas de confrontantes).

Existam arquivos salvos na pasta /Brutos que ainda não passaram pelo pipeline de conversão e triagem na pasta /Rinex.

### 4.2 O Motor de Translação Geodésica e Fechamento de Polígono (M-Sigma)

Para integrar dados de campo que vêm com coordenadas relativas e erros acumulados, o GerenciGeo utiliza um motor geodésico inteligente que traduz a exatidão do pós-processamento científico da Base (IBGE-PPP) para os pontos Rovers levantados.

#### A. A Matemática da Translação Espacial (Vetor Delta)
1. **Conversão da Base PPP (Entrada: Geodésica Lat/Lon Decimais) para UTM:**
   Utilizando a projeção oficial **SIRGAS 2000 / UTM Zone 22S (EPSG:31982)** com o elipsoide GRS80 e Meridiano Central 51° W, o sistema projeta a coordenada da Base corrigida:
   $$(Lon_{PPP}, Lat_{PPP}) \xrightarrow{pyproj} (E_{PPP}, N_{PPP})$$

2. **Cálculo do Vetor Delta de Deslocamento:**
   O Delta é calculado subtraindo a coordenada bruta (de campo) da coordenada PPP (precisa pós-processada) no ponto definido como Base (onde a descrição é `'set_base'`):
   $$\Delta_N = N_{PPP} - N_{Base\_Bruta}$$
   $$\Delta_E = E_{PPP} - E_{Base\_Bruta}$$
   $$\Delta_H = H_{PPP} - H_{Base\_Bruta}$$

3. **Aplicação do Vetor em Bloco (Rovers):**
   Para cada Rover $i$ do levantamento, o sistema aplica o deslocamento constante em bloco:
   $$N_{Corrigido, i} = N_{Original, i} + \Delta_N$$
   $$E_{Corrigido, i} = E_{Original, i} + \Delta_E$$
   $$H_{Corrigido, i} = Alt_{Original, i} + \Delta_H$$

4. **Projeção Reversa (Saída: Geodésica Lat/Lon Decimais):**
   As coordenadas planas corrigidas do Rover são projetadas de volta ao elipsoide para visualização no Leaflet e validação jurídica:
   $$(E_{Corrigido, i}, N_{Corrigido, i}) \xrightarrow{pyproj} (Lon_{Corrigido, i}, Lat_{Corrigido, i})$$

#### B. A Topologia Perimetral e Fechamento Estrito de Polígono
Ao importar um arquivo `.TXT` com pontos ordenados sequencialmente (caderneta de caminhamento), o GerenciGeo automatiza a topologia do perímetro criando de forma invisível as divisas (tabela `segmentos`):
*   **Segmentos Sequenciais:** Para cada vértice $k$ importado a partir do segundo ($k \ge 2$), é criado um segmento conectando o Ponto $k-1$ ao Ponto $k$.
*   **Fechamento de Polígono (Regra Estrita):** Após processar o último ponto importado $N$, o sistema gera obrigatoriamente um segmento conectando o Ponto $N$ de volta ao Ponto $1$. Esta amarração topológica garante que a área da matrícula nasça fechada e pronta para a validação geométrica de precisão.

5. Próximas Fases do Ciclo de Vida do Software
Módulo 6: Registro em Cartório (CRI)
Automação de Requerimentos: Cruzamento automático de dados do proprietário com a descrição do perímetro certificado para emitir o PDF de requerimento de retificação/certificação pronto para o Cartório de Registro de Imóveis.

Dossiê de Confrontação: Emissão de termos de anuência individuais filtrados por vizinho cadastrado na tabela de segmentos.

Módulo 7: Arquivamento Seguro (Cold Storage)
Tranca de Segurança (Read-Only Lock): Ao mudar o status do levantamento para ARQUIVADO, as rotas PUT e DELETE da API para aquele ID são bloqueadas.

Movimentação de Backup: O WorkspaceManager move a pasta física do projeto para um diretório de histórico definitivo (HD Externo ou Nuvem Fria), limpando o espaço de trabalho ativo do dia a dia.
"""