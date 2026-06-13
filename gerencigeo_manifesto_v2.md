# 🛰️ GerenciGeo — Manifesto de Especificação Técnica e Arquitetura
**Padrão Arquitetural:** Field-to-Finish Integrado (FastAPI + SQLite + Tailwind/TS + Toolchain Topografia)
**Versão do Documento:** 2.2.0
**Status do Ecossistema:** Estrutura Estratégica Consolidada

Este documento estabelece as diretrizes arquiteturais, a modelagem de dados e as regras de negócio do ecossistema **GerenciGeo**. Ele atua como a única fonte de verdade para o desenvolvimento do sistema, devendo ser interpretado por agentes de IA (como o Antigravity) e desenvolvedores para garantir a consistência absoluta de código entre as camadas de persistência, negócio e interface.

---

## 1. Visão Geral do Fluxo de Trabalho (Toolchain Híbrido Completo)

O GerenciGeo não substitui as ferramentas consagradas de engenharia, mas atua como o **orquestrador central e gerenciador de dados** que elimina o retrabalho braçal, organiza os arquivos de forma invisível e garante a integridade jurídica/técnica exigida pelo INCRA/SIGEF.

```
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
```

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
-- PROFISSIONAIS (Responsáveis Técnicos INCRA)
CREATE TABLE IF NOT EXISTS profissionais (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    registro TEXT NOT NULL,          
    codigo_credenciado TEXT NOT NULL, 
    contador_m INTEGER DEFAULT 0,    
    contador_p INTEGER DEFAULT 0,    
    contador_v INTEGER DEFAULT 0,    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    endereco TEXT,
    nacionalidade TEXT DEFAULT 'brasileiro(a)',
    formacao TEXT,
    cpf TEXT,
    rg TEXT,
    conselho TEXT,
    endereco_residencial TEXT
);

-- CLIENTES (Proprietários de Imóveis Rurais)
CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome_completo TEXT NOT NULL,              
    cpf_cnpj TEXT UNIQUE NOT NULL,
    rg_ie TEXT,
    data_nascimento_fundacao DATE,
    estado_civil TEXT,               
    profissao TEXT,
    nacionalidade TEXT,
    nome_conjuge TEXT,
    cpf_conjuge TEXT,
    rg_conjuge TEXT,
    regime_bens TEXT,
    email TEXT,
    telefone TEXT,
    endereco_completo TEXT,
    cidade TEXT,
    estado TEXT,
    cep TEXT,
    sexo TEXT DEFAULT 'M',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- CLIENTE METADADOS (Extensibilidade Dinâmica)
CREATE TABLE IF NOT EXISTS cliente_metadados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_cliente INTEGER NOT NULL,
    chave TEXT NOT NULL,
    valor TEXT,
    FOREIGN KEY (id_cliente) REFERENCES clientes(id) ON DELETE CASCADE
);

-- CLIENTE HISTÓRICO LOGS (Auditoria de Alterações)
CREATE TABLE IF NOT EXISTS cliente_historico_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_cliente INTEGER NOT NULL,
    campo_alterado TEXT NOT NULL,
    valor_antigo TEXT,
    valor_novo TEXT,
    data_alteracao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_cliente) REFERENCES clientes(id) ON DELETE CASCADE
);

-- PROPRIEDADES (Escopo Global)
CREATE TABLE IF NOT EXISTS propriedades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome_propriedade TEXT NOT NULL,
    codigo_car TEXT,
    codigo_ccir TEXT,
    caminho_arquivo_car TEXT,
    caminho_arquivo_ccir TEXT,
    municipio TEXT NOT NULL,
    uf TEXT NOT NULL CHECK(length(uf) = 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- MATRÍCULAS (Individual do Lote)
CREATE TABLE IF NOT EXISTS matriculas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    propriedade_id INTEGER NOT NULL,
    numero_matricula TEXT NOT NULL,
    ccir TEXT,
    itr TEXT,
    area_ha REAL,
    cri_comarca TEXT,
    cri_circunscricao TEXT,
    livro_registro TEXT,
    folha_registro TEXT,
    valor_itr REAL,
    denominacao TEXT,
    georreferenciamento TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (propriedade_id) REFERENCES propriedades(id) ON DELETE CASCADE
);

-- LEVANTAMENTOS (Campanha de Campo)
CREATE TABLE IF NOT EXISTS levantamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    propriedade_id INTEGER NOT NULL,
    profissional_id INTEGER NOT NULL,
    data_inicio DATE NOT NULL,
    pasta_projeto TEXT,
    status TEXT DEFAULT 'EM_ANDAMENTO' CHECK(status IN ('EM_ANDAMENTO', 'CONCLUIDO', 'ARQUIVADO')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (propriedade_id) REFERENCES propriedades(id) ON DELETE CASCADE,
    FOREIGN KEY (profissional_id) REFERENCES profissionais(id) ON DELETE CASCADE
);

-- PONTOS (Dados Geodésicos Estruturados padrão SIGEF)
CREATE TABLE IF NOT EXISTS pontos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    levantamento_id INTEGER NOT NULL,
    matricula_id INTEGER,
    nome_vertice TEXT NOT NULL,       
    tipo_ponto TEXT NOT NULL CHECK(tipo_ponto IN ('M','P','V')),
    lat REAL,
    lon REAL,
    alt REAL,
    sigma_lat REAL,                   
    sigma_lon REAL,                
    sigma_alt REAL,                     
    ordem_caminhamento INTEGER,       
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    n_original REAL,
    e_original REAL,
    alt_original REAL,
    lat_corrigido REAL,
    lon_corrigido REAL,
    alt_corrigido REAL,
    sigma_n REAL,
    sigma_e REAL,
    sigma_z REAL,
    arquivo_rinex TEXT,
    arquivo_resultado_ppp TEXT,
    status_ponto TEXT DEFAULT 'BRUTO' CHECK(status_ponto IN ('BRUTO', 'CORRIGIDO')),
    ponto_base_id INTEGER,
    metodo_posicionamento TEXT DEFAULT 'PG1',
    arquivo_origem TEXT,
    status_correcao TEXT DEFAULT 'BRUTO' CHECK(status_correcao IN ('BRUTO', 'CORRIGIDO')),
    ignorar_poligono INTEGER DEFAULT 0 CHECK(ignorar_poligono IN (0, 1)),
    FOREIGN KEY (levantamento_id) REFERENCES levantamentos(id) ON DELETE CASCADE,
    FOREIGN KEY (matricula_id) REFERENCES matriculas(id) ON DELETE SET NULL,
    FOREIGN KEY (ponto_base_id) REFERENCES pontos(id) ON DELETE SET NULL,
    UNIQUE(levantamento_id, matricula_id, nome_vertice, tipo_ponto)
);

-- SEGMENTOS (Linhas de Divisa Oficiais)
CREATE TABLE IF NOT EXISTS segmentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    levantamento_id INTEGER NOT NULL,
    matricula_id INTEGER NOT NULL,
    ponto_inicio_id INTEGER NOT NULL,
    ponto_fim_id INTEGER NOT NULL,
    confrontante_id INTEGER,
    tipo_limite_sigef TEXT NOT NULL,
    metodo_posicionamento_sigef TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (levantamento_id) REFERENCES levantamentos(id) ON DELETE CASCADE,
    FOREIGN KEY (matricula_id) REFERENCES matriculas(id) ON DELETE CASCADE,
    FOREIGN KEY (ponto_inicio_id) REFERENCES pontos(id) ON DELETE CASCADE,
    FOREIGN KEY (ponto_fim_id) REFERENCES pontos(id) ON DELETE CASCADE,
    FOREIGN KEY (confrontante_id) REFERENCES confrontantes(id) ON DELETE SET NULL
);
```

---

## 2.3 Especificações de Qualificação de Clientes e Responsáveis Técnicos

### A. Regras Lógicas de Geração Documental (Laudos e Requerimentos)
Para garantir a validade jurídica das peças técnicas destinadas ao Cartório de Registro de Imóveis (CRI) e Defesa Nacional (Faixa de Fronteira):
1. **Heurística de Gênero Inteligente**: O sistema traduz pronomes cadastrais baseados na coluna `sexo` do proprietário principal:
   - Se `sexo == 'F'`: "portadora do RG", "inscrita no CPF", "legítima proprietária".
   - Se `sexo == 'M'`: "portador do RG", "inscrito no CPF", "legítimo proprietário".
2. **Tratamento de Estado Civil e Cônjuge**:
   - **Caso Casado / União Estável**: O cônjuge é obrigatoriamente qualificado junto com o proprietário na mesma peça jurídica. O pronome do cônjuge é invertido inteligentemente com base no sexo do proprietário principal (ex: se proprietário é do sexo "M", cônjuge recebe "portadora" / "inscrita").
   - **Caso Solteiro / Divorciado / Viúvo**: O estado civil (ex: "solteiro" ou "solteira" ajustado pelo gênero) é explicitamente inserido na qualificação. Os dados de cônjuge são omitidos de forma absoluta da qualificação documental.
3. **Comportamento Dinâmico do Formulário (UI)**:
   - Para clientes cadastrados sob estado civil `'Solteiro(a)'`, `'Divorciado(a)'` ou `'Viúvo(a)'`, a interface oculta automaticamente os campos do grupo **CÔNJUGE** no formulário, limpando e desativando valores residuais para evitar poluição de dados e manter a mesa limpa de dados irrelevantes.

### B. Exemplos Práticos de Qualificação Gerada (Dados Fictícios)

#### Exemplo 1: Cliente Proprietário Casado (Regime de Comunhão Parcial de Bens)
> **Qualificação Gerada no Requerimento/Laudo:**
> "JOÃO DA SILVA, brasileiro, produtor rural, casado sob o regime de comunhão parcial de bens com MARIA APARECIDA DA SILVA, brasileira, do lar, portadora do RG nº 9.876.543-2 e inscrita no CPF sob o nº 987.654.321-00, ambos residentes e domiciliados na Linha Central, Km 10, Cascavel-PR, portador do RG nº 1.234.567-8 e inscrito no CPF nº 123.456.789-00..."

#### Exemplo 2: Cliente Proprietário Solteiro (Gênero Feminino)
> **Qualificação Gerada no Requerimento/Laudo:**
> "ANA BEATRIZ SOUZA, brasileira, engenheira agrónoma, solteira, portadora do RG nº 4.567.890-1 e inscrita no CPF sob o nº 456.789.012-34, residente e domiciliada na Avenida Brasil, 1500, Foz do Iguaçu-PR..."

### C. Diretrizes de Design, Usabilidade e Integrações da Tela de Clientes (UI/UX V2.0)
Para otimizar o fluxo de trabalho cadastral e garantir um design premium e responsivo, a interface de Clientes (`clientes.ts`) deve seguir as seguintes diretrizes:
1. **Listagem Tabular Compacta**:
   - A listagem principal de clientes deve ser apresentada em formato de tabela minimalista de alta fidelidade responsiva.
   - Para maximizar a densidade de informações e limpar o layout, as colunas **RG/IE**, **Estado Civil** e **Contato/Cidade** são removidas da visualização da tabela principal.
   - A tabela deve expor de forma direta: **Nome Completo** (com avatar gerado a partir das iniciais), **CPF/CNPJ** formatado, a nova coluna de contagem de **Propriedades** vinculadas, a contagem de **Projetos** (Levantamentos) vinculados e a coluna de **Ações** rápidas (Visualizar, Editar, Excluir).
2. **Ações em Lote Reativas**:
   - A listagem deve incluir checkboxes individuais e um checkbox master no cabeçalho.
   - Ao selecionar um ou mais registros, uma barra flutuante de ações em lote (`#batch-action-bar`) deve surgir de forma suave na parte inferior da tela, permitindo a exclusão em lote de múltiplos registros e exibindo a contagem atualizada de itens selecionados.
3. **Formulário de Cadastro Ultra Compacto**:
   - O formulário de cadastro no modal deve ser altamente condensado, agrupando os campos de forma lógica em poucas linhas para eliminar a rolagem vertical desnecessária. Todos os inputs principais devem utilizar fontes reduzidas e altura compacta (`text-xs h-8`).
   - O campo de **Regime de Bens** deve ser apresentado como um menu de seleção (`select`) contendo as opções válidas brasileiras (Comunhão Parcial, Comunhão Universal, Separação Total, Participação Final nos Aquestos, Separação Obrigatória).
4. **Máscaras de Digitação Dinâmicas**:
   - Devem ser aplicadas máscaras em tempo real nos inputs de **CPF/CNPJ** (detectando o comprimento para formatar `000.000.000-00` ou `00.000.000/0000-00`), de **Telefone** (formatando fixo `(00) 0000-0000` ou celular `(00) 00000-0000`) e de **CEP** (`00000-000`).
5. **Autocompletar Inteligente de Endereço (ViaCEP)**:
   - Ao digitar um CEP válido de 8 dígitos no input correspondente, o frontend deve realizar uma busca assíncrona na API pública do ViaCEP.
   - Em caso de sucesso, deve preencher automaticamente os campos de **Endereço (Rua, Av, Bairro)**, **Cidade** e **Estado (UF)**, transferindo o foco do teclado (`.focus()`) automaticamente para o campo de **Número** para agilizar a entrada de dados.
   - *Nota de Compatibilidade de Banco:* Como o banco de dados armazena o endereço unificado na coluna `endereco_completo` (sem coluna física para número), na UI o endereço e o número são divididos em dois campos distintos. Ao salvar/editar, os valores são concatenados no formato `"Endereço, Número"`. Na edição, a string é desmembrada com `.split(', ')` para restaurar os respectivos inputs.
6. **Lista de Cidades Dinâmica (IBGE Localidades)**:
   - O campo de Cidade deve utilizar um elemento `datalist` associativo para sugestão e autocompletar.
   - A listagem de cidades deve ser carregada dinamicamente via requisição HTTP à API de Localidades do IBGE baseada no Estado (UF) selecionado no combobox.
   - Por padrão, ao abrir o modal para criação de novo cliente, o estado do **Paraná (PR)** deve vir pré-selecionado e as cidades do PR carregadas de forma prioritária.
7. **Modal de Detalhes Multitabs**:
   - A visualização detalhada de um cliente deve utilizar uma interface limpa com navegação por abas dividida em:
     - **Dados Cadastrais**: Exibe as informações civis estruturadas e o bloco do cônjuge reativo.
     - **Metadados**: Permite a visualização, exclusão direta e inserção ágil de pares de chave/valor adicionais na tabela `cliente_metadados`.
     - **Histórico de Alterações**: Tabela dinâmica que consome o endpoint `/clientes/{id}/historico` e exibe cronologicamente cada modificação de campo auditada pelo banco SQLite.

---

### 2.4 Especificações Técnicas de Propriedades e Matrículas

Para garantir o rigor técnico exigido na regularização fundiária nacional, o GerenciGeo divide conceitualmente o espaço territorial do imóvel rural em duas categorias complementares:

1. **Propriedades (Escopo Global / Físico):**
   - Corresponde à extensão territorial contínua unificada da fazenda (o perímetro físico global delimitado no Cadastro Ambiental Rural - CAR).
   - Armazena códigos ambientais e cadastrais globais (`codigo_car` e `codigo_ccir`) e os caminhos de armazenamento físico seguro dos seus respectivos documentos PDF (`caminho_arquivo_car`, `caminho_arquivo_ccir`).
   - Gerencia a copropriedade na tabela associativa `propriedade_clientes` (relação M:N), que permite o vínculo de múltiplos proprietários ou casais definindo quotas percentuais individuais.
   - **Regra de Consistência Absoluta das Quotas (100%):** A soma acumulada das quotas percentuais de todos os proprietários atrelados a uma mesma fazenda na tabela associativa nunca poderá exceder rigidamente `100.00%`. Tentativas de inserção ou atualização que quebrem esta restrição são interceptadas e abortadas de forma atômica no banco, retornando o saldo exato disponível para alocação.

2. **Matrículas (Escopo Jurídico / Parcelas SIGEF):**
   - Representa as subdivisões registradas em Cartório (as matrículas oficiais no Cartório de Registro de Imóveis - CRI).
   - Uma propriedade física pode conter uma ou mais matrículas vinculadas (relação 1:N). Cada matrícula atua como uma parcela independente que receberá uma aba individual no motor de exportação de dados geodésicos para o SIGEF.
   - Além do número e denominação (Lote/Gleba), ela persiste dados cartoriais precisos (`cri_comarca`, `cri_circunscricao`, `livro_registro`, `folha_registro`), metadados tributários e fiscais (`ccir`, `itr`, `valor_itr`, `area_ha`) e a certificação digital do georreferenciamento homologada (`georreferenciamento` - UUID do SIGEF).

### 2.4.1 Refinamento de Matrículas, Anexos e Histórico de Auditoria (V2.1)

Para garantir a transparência das operações e otimizar o fluxo de trabalho de regularização jurídica, o GerenciGeo implementa as seguintes regras operacionais:

1. **Gestão e Exclusão de CAR/CCIR (Dados Gerais):**
   - Os arquivos de CAR e CCIR atrelados à propriedade são exibidos na aba Dados Gerais. Clicar no nome do arquivo original dispara o download ou visualização direta (`GET /propriedades/{prop_id}/arquivo-car` ou `/arquivo-ccir`).
   - A exclusão física e lógica do anexo é acionada pelo ícone de lixeira, removendo o arquivo do disco do servidor (`DELETE /propriedades/{prop_id}/arquivo-car` ou `/arquivo-ccir`) e definindo a respectiva coluna de caminho como `NULL` no banco SQLite, reabilitando a dropzone de upload de forma instantânea na interface.

2. **Máscaras de Digitação em Tempo Real para Matrículas:**
   - O formulário de matrícula possui máscaras reativas aplicadas no evento `input` do navegador:
     - **CCIR**: `000.000.000.000-0` (13 dígitos numéricos).
     - **ITR/NIRF**: `0.000.000-0` (8 dígitos numéricos).
     - **SIGEF (UUID)**: `00000000-0000-0000-0000-000000000000` (32 caracteres hexadecimais formatados com hifens).
   - O campo **Área Registrada (ha)** aceita vírgula ou ponto como separadores decimais. O frontend normaliza vírgula para ponto antes do envio para a API (`parseFloat(area_raw.replace(',', '.'))`).

3. **Edição Integrada de Matrículas no Formulário:**
   - Ao clicar no ícone de lápis de uma matrícula, o formulário lateral da aba de Matrículas é preenchido com os dados existentes. O título é alterado para *"Editar Gleba / Matrícula"*, o botão de submit muda para *"Salvar Alterações"* e um botão *"Cancelar"* é exibido para limpar o formulário e restaurar o estado de cadastro inicial.

4. **Armazenamento e Gestão de PDFs de Matrícula (Certidões):**
   - Cada matrícula aceita a anexação de um arquivo PDF de certidão correspondente. O arquivo físico é salvo sob `[EXPORT_BASE_FOLDER]/Propriedades/Prop_[prop_id]/Matricula_[mid]_Certidao.pdf`.
   - O endpoint `POST /matriculas/{mid}/upload-pdf` executa o upload físico, salvando a referência na coluna `caminho_arquivo_pdf`. Clicar no link de download abre o PDF diretamente (`GET /matriculas/{mid}/download-pdf`), e o ícone de lixeira remove fisicamente o arquivo do disco (`DELETE /matriculas/{mid}/pdf`).

5. **Histórico de Auditoria de Matrículas (`matricula_historico_logs`):**
   - Alterações de matrículas via endpoint `PUT /matriculas/{mid}` são auditadas. O backend compara os dados novos com os antigos registrando os deltas na tabela `matricula_historico_logs`.
   - **Normalização de Comparação**: Valores numéricos (Área e Valor do ITR) são convertidos para `float` antes da comparação para evitar logs redundantes decorrentes de conversão de tipos de dados (`float` vs `str`).
   - O histórico de logs é consultado pelo endpoint `GET /matriculas/{mid}/historico` e renderizado em tempo real no modal flutuante `#modal-historico-matricula` (composto de cabeçalho dinâmico e tabela detalhada) acionado pelo botão de relógio na linha de cada matrícula.

6. **Formatação de Valores na Tabela:**
   - A coluna de Área Registrada da tabela de matrículas formata o valor utilizando o padrão brasileiro (separador de milhar por ponto e decimais por vírgula) com precisão fixa de 4 casas decimais (ex: `1.234,5678 ha`).

### 2.5 Módulo de Levantamentos e Controle de Campanhas de Campo

O georreferenciamento de um imóvel rural é estruturado operacionalmente no GerenciGeo através de **Campanhas de Levantamento** (tabela `levantamentos`), estabelecendo o vínculo relacional e cronológico entre a propriedade e o profissional credenciado no INCRA.

1. **Estrutura de Relações e Integridade:**
   - Vincula obrigatoriamente um profissional credenciado (`profissional_id`) e uma propriedade (`propriedade_id`), contendo a data de início da campanha de campo.
   - **Geração Automática do Windows Workspace:** A criação ou abertura de um levantamento dispara de forma invisível no servidor o acionamento do `WorkspaceManager`. Este lê os metadados do banco e cria no sistema de arquivos do usuário a árvore de pastas padronizada do projeto (Brutos, Rinex, Documentos, Processados, Exportacoes) sob `Projetos/[Nome_Propriedade]/Lev_[ID]_[Ano]/`.
   - **Geração Reativa do Arquivo `DADOS_GERAIS.json`:** Ao criar o levantamento, o `WorkspaceManager` compila os dados cadastrais completos dos proprietários e das matrículas atreladas e grava na subpasta `/Documentos` o arquivo físico de sincronização `DADOS_GERAIS.json`. Este atua como a única fonte de dados em disco do levantamento, sendo automaticamente atualizado caso ocorra qualquer modificação no banco global de clientes ou matrículas.

2. **Travas e Estados do Ciclo de Vida (Tranca Read-Only):**
   - Um levantamento no sistema navega estritamente por três estados sequenciais: `'EM_ANDAMENTO'`, `'CONCLUIDO'` e `'ARQUIVADO'`.
   - **Tranca de Segurança de Cold Storage (Read-Only Lock):** Projetos que possuam seu status alterado para `'ARQUIVADO'` tornam-se imediatamente imutáveis na camada de negócio. A API do servidor implementa um middleware (`verificar_propriedade_arquivada` in `api.py`) que intercepta rotas de escrita (`POST`, `PUT`, `DELETE`) para pontos, segmentos e confrontantes daquela propriedade. Se houver tentativa de escrita, o servidor retorna instantaneamente um código de status `HTTP 403 Forbidden` informando que a operação está bloqueada devido à trava jurídica de segurança de cold storage.

### 2.6 Módulo de Faixa de Fronteira e Ratificação Jurídica

Como o imóvel rural localiza-se na faixa de fronteira internacional (fronteira Brasil-Paraguai), sua retificação exige a anuência e ratificação dos órgãos de Defesa Nacional. O GerenciGeo automatiza a emissão destas peças jurídicas com rigor determinístico.

1. **Geração Dinâmica de Documentos em Memória:**
   - Todos os laudos e requerimentos de faixa de fronteira são gerados dinamicamente sob demanda em formato HTML estruturado a partir de endpoints baseados em requisições HTTP GET (`/laudo-fronteira-html` e `/requerimento-ratificacao-html`).
   - O processo ocorre estritamente na memória volátil do servidor, eliminando a gravação de arquivos temporários lixo ou PDFs estáticos em disco, simplificando auditorias de segurança e liberando espaço no HD do operador.

2. **Injeção de Metadados nos Templates HTML:**
   - O gerador de relatórios (`business/report_generator.py`) consome os dados do levantamento e injeta de forma contextual e automatizada as seguintes tags de metadados:
     - `NOME_PROFISSIONAL` / `REGISTRO_CFTA` / `ENDERECO_PROFISSIONAL`: Extraídos do cadastro do Responsável Técnico.
     - `NOME_PROPRIETARIO` / `CPF_PROPRIETARIO` / `RG_PROPRIETARIO` / `ESTADO_CIVIL` / `REGIME_BENS` / `NOME_CONJUGE` / `CPF_CONJUGE` / `RG_CONJUGE`: Qualificação jurídica subjetiva dinâmica tratada sob a heurística de gênero inteligente (e ocultando dados de cônjuges para clientes de estado civil solteiro(a)).
     - `NOME_PROPRIEDADE` / `MATRICULA_NUM` / `COMARCA_CRI` / `REGISTRO_CAR` / `CODIGO_INCRA`: Metadados cadastrais do imóvel.
     - `NUMERO_TRT` / `DATA_QUITACAO_TRT`: Informações do documento profissional CFTA injetados sob demanda no ato da visualização.
     - `DISTANCIA_FRONTEIRA_KM`: A menor distância geodésica determinística elipsoidal calculada a partir do Shapefile do perímetro ou fallback em banco (Módulo 8) impressa com precisão de 3 casas decimais.

3. **Folha de Estilos e Layout de Impressão Nativa (Tailwind CSS):**
   - O documento retornado é estruturado semanticamente em HTML5 e estilizado nativamente com a biblioteca de design Tailwind CSS, garantindo uma renderização visual moderna e premium diretamente no navegador web do cliente.
   - **Mapeamento de Mídia de Impressão (`@media print`):** A estrutura estilizada inclui regras de impressão no cliente (`window.print()`). O template adiciona controles e botões de ação que recebem a classe CSS `.no-print` (ou regras `@media print { .no-print { display: none !important; } }`), ocultando painéis laterais de configuração, botões de impressão e cabeçalhos residuais do navegador na folha de papel física gerada para o Cartório.

---

## 3. Gestão Física de Arquivos (WorkspaceManager)

O módulo `business/workspace_manager.py` organiza os arquivos de forma padronizada e legível no sistema operacional Windows, eliminando a dispersão de dados.

### 3.1 Estrutura de Diretórios Gerada no Disco
Ao criar ou abrir um Levantamento, o manager extrai do banco o nome da propriedade e o ano do projeto, gerando a seguinte árvore:
```
[EXPORT_BASE_FOLDER] / Projetos / [Nome_da_Propriedade] / Lev_[ID]_[Ano] /
    ├── /Brutos              <-- Arquivos binários originais (.GNS) da coletora
    ├── /Rinex               <-- Arquivos .obs/.nav gerados pela esteira do ConvertRinex
    ├── /Documentos          <-- Matrículas escaneadas, PDFs de RG e o DADOS_GERAIS.json
    ├── /Processados         <-- Arquivos .sum, .pos do IBGE-PPP e TXTs do Topcon Tools / RTK
    └── /Exportacoes         <-- Peças técnicas complementares ao TopoCAD 2000
```

### 3.2 O Sincronizador Ativo DADOS_GERAIS.json
Localizado na pasta `/Documentos` de cada projeto, este arquivo mantém os metadados dos clientes e suas respectivas matrículas estruturados para consumo ágil do sistema.

**Gatilho de Atualização (Trigger):** O arquivo é gerado no `POST /levantamentos`. No entanto, se o usuário alterar os dados do cliente em `PUT /clientes` ou adicionar uma nova matrícula em `POST /matriculas`, a API aciona o `WorkspaceManager` para sobrescrever e atualizar o JSON nas pastas de todos os projetos ativos daquele cliente, mitigando dados obsoletos.

---

### 3.3 Estrutura Física de Pastas e Uploads de Anexos Técnicos

A organização dos arquivos físicos no Windows Explorer segue um padrão rigoroso gerenciado de forma reativa pelo servidor na subpasta de propriedades:

#### A. Organização Física no Disco (Windows Workspace)
A pasta raiz de cada propriedade é estruturada dinamicamente sob:
```
[EXPORT_BASE_FOLDER] / Propriedades / Prop_[ID] /
    ├── /Shapefile_Fronteira               <-- Shapefile geral do perímetro fundiário
    │   ├── /Matricula_[ID]                <-- Shapefiles específicos de cada matrícula
    │   │   ├── perimetro.shp / pontos.shp <-- Arquivos descompactados
    │   │   └── perimetro.zip              <-- Zip original enviado
    │   └── perimetro_geral.shp
    ├── CAR_[Nome_do_Arquivo].pdf          <-- Arquivo de anexo do CAR
    └── CCIR_[Nome_do_Arquivo].pdf         <-- Arquivo de anexo do CCIR
```

#### B. Fluxo de Ingestão de Anexos Físicos (CAR & CCIR)
No upload do arquivo do CAR ou CCIR (`POST /propriedades/{prop_id}/upload-car` e `/upload-ccir`), o sistema sanitiza o nome original removendo caracteres especiais do SO, armazena o binário fisicamente sob `[EXPORT_BASE_FOLDER]/Propriedades/Prop_[prop_id]/` sob os prefixos `CAR_` ou `CCIR_`, e registra o caminho completo correspondente no banco SQLite nas colunas `caminho_arquivo_car` ou `caminho_arquivo_ccir`. Downloads posteriores do arquivo original ocorrem via caminhos dedicados (`/arquivo-car`, `/arquivo-ccir`) que resgatam e transmitem o arquivo físico correspondente.

#### C. Ingestão de Shapefiles de Divisa e Cálculo de Faixa de Fronteira (Módulo 8)
Ao enviar uma pasta compactada `.ZIP` ou arquivos isolados de Shapefile para o contorno de uma matrícula (`POST /propriedades/{prop_id}/upload-shapefile-fronteira?matricula_id={id}`):
1. **Purgagem Física Ativa:** Para evitar acúmulo de arquivos residuais, o sistema varre e deleta de forma absoluta todos os arquivos existentes dentro do diretório específico (`f.unlink()`) antes de salvar os novos arquivos.
2. **Descompactação Automatizada:** Se um arquivo `.zip` for detectado, o sistema executa a extração in-memory dos componentes geográficos (`.shp`, `.shx`, `.dbf`, `.prj`) salvando-os no diretório físico.
3. **Leitura e Conversão de Projeção:** O sistema lê os vértices do Shapefile utilizando a biblioteca `pyshp` (`shapefile.Reader`). Ele verifica as coordenadas das geometrias:
   - Se os valores absolutos forem maiores que `10000.0`, identifica automaticamente as coordenadas como projetadas Planas (UTM).
   - Aplica o transformador `pyproj.Transformer` para realizar a projeção reversa de UTM Zone 22S (EPSG:31982) para o formato elipsoidal Geodésico SIRGAS 2000 (EPSG:4674).
   - Caso os valores sejam pequenos, assume as coordenadas diretamente como geodésicas.
4. **Cálculo Determinístico de Fronteira:** O motor matemático utiliza a biblioteca `pyproj.Geod(ellps="GRS80")` para executar o cálculo geodésico rigoroso através da fórmula do inverso (`geod.inv`) a partir de cada coordenada geométrica do perímetro até o limite fixo internacional Brasil-Paraguai estabelecido na coordenada exata Lat `-24.0671222`, Lon `-54.2868778`. Ele elege o ponto com a **menor distância absoluta** (em quilômetros com 3 casas decimais) para ser registrado como a menor distância de isolamento da fazenda até a divisa internacional.
5. **Fallback de Ponto Geodésico:** Se nenhum Shapefile físico estiver disponível para a matrícula ou propriedade, o motor executa uma busca secundária na tabela `pontos` do banco SQLite, resgatando **todos os pontos geodésicos** (independentemente de seu tipo: 'M', 'P' ou 'V') associados a levantamentos cadastrados para aquela propriedade. O sistema prioriza pontos de levantamentos ativos (`EM_ANDAMENTO`) e com estado pós-processado (`CORRIGIDO`), calcula a menor distância individual de cada ponto até o limite internacional (Lat `-24.0671222`, Lon `-54.2868778`) e retorna o menor valor de distância obtido.

---

## 4. Integração de Processamento e Interface com TopoCAD 2000

Como o processamento gráfico de desenho de plantas, cálculo de tabelas e parte da montagem da planilha ODS do SIGEF é executado com sucesso pelo TopoCAD 2000 dentro do AutoCAD, o GerenciGeo assume o papel de Auditor de Qualidade e Complementador de Dados.

### 4.1 O Papel do GerenciGeo na Auditoria e Pós-Processamento (Módulo 5)

*   **Filtro de Qualidade de Campo (Filesize QC):** Antes de mover dados para as pastas, bloqueia o processamento de arquivos menores que 50KB, enviando-os para a lista de "Pontos Insuficientes/Falhos" para checagem do operador.
*   **Auditoria de Consistência (M-Sigma):** Lê os arquivos de texto (`.TXT`) exportados pelo Topcon Tools e cruza com os dados do IBGE-PPP salvos no banco. O sistema valida se os desvios padrão (Sigmas) dos pontos estáticos e do RTK atendem aos limites regulamentares da 3ª Edição do INCRA (ex: < 0.10m para limites artificiais).
*   **Action Center (Central de Ações Inteligente):** O dashboard consome o endpoint `/dashboard/alerts` e avisa imediatamente o profissional caso:
    *   O Meridiano Central (ex: 51 W para UTM Zone 22S) configurado na esteira do HGO divirja da posição de plotagem real no mapa Leaflet.
    *   Haja falta de dados do cônjuge de um cliente casado (item obrigatório para as Cartas de Anuência e assinaturas de confrontantes).
    *   Existam arquivos salvos na pasta `/Brutos` que ainda não passaram pelo pipeline de conversão e triagem na pasta `/Rinex`.

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

### 4.3 Protocolo V.L.A.E.G. (Ingestão Desacoplada e Vínculo Tardio)

O ecossistema GerenciGeo adota um modelo de ingestão de dados assíncrono e resiliente a falhas de rede ou indisponibilidade do serviço IBGE-PPP. Os pontos de rampa (Rovers) importados via arquivos de caderneta de campo (.TXT) devem ser processados e visíveis de forma imediata na interface, permitindo correções geométricas posteriores.

#### A. Evolução do Modelo de Persistência (database/models.py)
A tabela `pontos` passa a rastrear o ciclo de processamento e a origem física dos dados através de duas novas colunas estruturais:
*   **`arquivo_origem TEXT NOT NULL`**: Armazena o `os.path.basename` do arquivo carregado (ex: `RTK_GNS_27052026.txt`), servindo como chave de agrupamento lógico para translações em bloco.
*   **`status_correcao TEXT DEFAULT 'BRUTO'`**: Controla o estado metrológico do ponto, aceitando estritamente os estados `CHECK(status_correcao IN ('BRUTO', 'CORRIGIDO'))`.

#### B. Mecanismo de Ingestão e Feedback Visual ("Antes e Depois")
*   **Fase Inicial (Upload do Arquivo):** O `TxtGeodesicParser` realiza o parsing e projeta os pontos brutos de UTM para Lat/Lon SIRGAS 2000 usando os parâmetros padrão locais. Os pontos são gravados com `status_correcao = 'BRUTO'`.
*   **Exibição na UI (ui/levantamento_view.py):** A tabela de listagem de pontos (`PaginatedTreeview`) deve expor o confronto direto dos dados brutos contra os corrigidos através de colunas dedicadas:
    $$\text{Colunas obrigatórias: } [\text{ID}, \text{Vértice}, \text{Tipo}, \text{Norte Bruto (m)}, \text{Este Bruto (m)}, \text{Lat Corrigida}, \text{Lon Corrigida}, \Delta N \text{ (m)}, \Delta E \text{ (m)}, \text{Status}]$$
*   **Regra de Cálculo dos Deltas:** Os deltas horizontais lineares são computados dinamicamente na renderização da grid:
    $$\Delta N = N_{\text{Atual (Projetado do Corrigido)}} - N_{\text{Original}}$$
    $$\Delta E = E_{\text{Atual (Projetado do Corrigido)}} - E_{\text{Original}}$$
*   **Regra de Destaque Visual:** Se `status_correcao == 'BRUTO'`, as células de $\Delta N$ e $\Delta E$ devem exibir `0.000` e a linha inteira da Treeview deve ser pintada com fundo amarelo claro através da tag `'bruto'`, indicando que o vetor de adjustment geocêntrico ainda não foi aplicado.

### 4.4 Painel de Inserção Híbrida e Contingência Manual (FrameOverrideBase)

Como contingência ativa para falhas no processamento automático do pipeline do IBGE-PPP, o sistema implementa uma interface de override manual em lote. O topógrafo pode inserir os dados de calibração da base utilizando duas modalidades de entrada no painel de controle.

#### A. Arquitetura do Formulário de Entrada (Camada de Interface)
O componente deve aceitar dois blocos de dados distintos para alimentar o motor matemático:
*   **Bloco A (Origem Bruta de Campo):** Campos numéricos para Norte Bruto (m), Este Bruto (m) e Altitude Bruta (m) capturados pelo receptor GNSS em campo.
*   **Bloco B (Alvo Homologado/Corrigido):** Deve possuir um controle de abas (Notebook) permitindo a escolha da entrada:
    *   **Aba 1 (Geodésica):** Caixas de texto para Latitude Corrigida e Longitude Corrigida (em graus decimais).
    *   **Aba 2 (Plana UTM):** Caixas de texto para Norte Corrigido (N), Este Corrigido (E) e um combobox seletor de fuso/zona UTM (ex: `22S / EPSG:31982`).
*   **Componentes Verticais e Incertezas Comuns:** Entrada obrigatória de Altitude Elipsoidal Corrigida (h), Sigma Norte/Lat (m), Sigma Este/Lon (m) e Sigma Alt (m) extraídos do cabeçalho do relatório `.sum` do IBGE.

#### B. Fluxo Matemático com Inserção em UTM
Caso o operador opte por inserir o Bloco B via coordenadas Planas UTM, o motor lógico contido em `business/geoprocessamento.py` deve interceptar o fluxo e executar a projeção reversa antes de disparar a translação tridimensional:
1.  **Projeção Reversa da Base Corrigida (UTM para Geodésica):**
    $$(E_{\text{Corrigido}}, N_{\text{Corrigido}}) \xrightarrow[\text{Fuso Selecionado}]{\text{pyproj / Transformer}} (Lon_{\text{Corrigido}}, Lat_{\text{Corrigido}})$$
2.  **Conversão Espacial da Base Corrigida para ECEF:**
    $$(Lat_{\text{Corrigido}}, Lon_{\text{Corrigido}}, Alt_{\text{Elipsoidal\_Corrigida}}) \xrightarrow{\text{geodesic\_to\_ecef}} (X_{\text{Alvo}}, Y_{\text{Alvo}}, Z_{\text{Alvo}})$$
3.  **Projeção Reversa e Conversão da Base Bruta de Campo para ECEF:**
    $$(E_{\text{Bruto}}, N_{\text{Bruto}}) \xrightarrow{\text{pyproj}} (Lon_{\text{Bruto}}, Lat_{\text{Bruto}})$$
    $$(Lat_{\text{Bruto}}, Lon_{\text{Bruto}}, Alt_{\text{Bruta}}) \xrightarrow{\text{geodesic\_to\_ecef}} (X_{\text{Bruto}}, Y_{\text{Bruto}}, Z_{\text{Bruto}})$$
4.  **Determinação do Vetor Delta Geocêntrico Espacial:**
    $$\Delta_X = X_{\text{Alvo}} - X_{\text{Bruto}}$$
    $$\Delta_Y = Y_{\text{Alvo}} - Y_{\text{Bruto}}$$
    $$\Delta_Z = Z_{\text{Alvo}} - Z_{\text{Bruto}}$$
5.  **Translação e Atualização em Bloco:** O sistema abre uma transação atômica no SQLite e varre todos os pontos pertencentes ao `arquivo_origem` selecionado. Para cada ponto, converte suas coordenadas brutas originais para ECEF, soma o vetor $(\Delta_X, \Delta_Y, \Delta_Z)$, reconverte para Geodésica final SIRGAS 2000, calcula a composição quadrática dos sigmas e salva os dados atualizando o estado do registro para `status_correcao = 'CORRIGIDO'`.

---

### 4.5 Acesso e Controle de Propriedades e Matrículas na Interface do Usuário (UI V2.0)

O controle e a gestão física/relacional desses módulos fundiários ocorrem de forma integrada e consistente com a tela de Clientes, utilizando tabelas de tela cheia e modais de detalhes multitabs:

#### A. Listagem Tabular Geral de Propriedades
- **Acesso**: Clicando na aba **"Propriedades"** na barra lateral.
- **Tabela de Alta Fidelidade**: Exibe todas as propriedades cadastradas em uma tabela de largura total, removendo o antigo painel de lista lateral de 1/4.
- **Filtros e Ordenação Multi-Critério**:
  - Caixa de busca para filtragem instantânea por nome da propriedade, município ou UF.
  - Seletor de ordenação permitindo reordenar os dados por: *Nome da Propriedade (A-Z)*, *Nome da Propriedade (Z-A)*, *Mais Recentes (Cadastro)* ou *Mais Antigas (Cadastro)*.
- **Coluna de Proprietário Principal (Eleição e Abreviação)**:
  - Exibe o nome do proprietário que possui a **maior quota de participação** da propriedade.
  - Em caso de empate exato nas quotas, o desempate ocorre por **ordem alfabética**.
  - O nome do proprietário é abreviado para exibir **apenas os dois primeiros nomes** (ex: "Thiago Bezerra").
  - Caso a propriedade possua múltiplos proprietários vinculados, é concatenado o sufixo indicativo de volume: `"e mais X"` (ex: "Thiago Bezerra e mais 2").
- **Ações em Lote**: Checkboxes integrados na tabela que acionam a barra de ações flutuante inferior (`#batch-action-bar`) para exclusão múltipla de propriedades, obedecendo às restrições em cascata.

#### B. Modal de Detalhes Multitabs (`#modal-detalhes-propriedade`)
Ao clicar no ícone de visualização (olho) de uma propriedade, abre-se um modal unificado de detalhes com três abas:

1. **Aba "Dados Gerais & Anexos"**:
   - Exibe os códigos do CAR e CCIR formatados.
   - **Mesa de Ingestão de Documentos (CAR & CCIR)**: Dropzones dedicadas com suporte a drag-and-drop ativo de arquivos ou clique. Durante o upload, adquire uma animação de pulsação e cursor de espera. Uma vez anexado, exibe o nome do arquivo físico correspondente e um botão para download direto via REST.

2. **Aba "Proprietários" (Vínculos e Quotas)**:
   - **Autocomplete de Busca Dinâmica**: Caixa de texto com busca reativa de clientes do banco global por nome ou CPF/CNPJ com menu flutuante.
   - **Quota Fundiária**: Mostra o percentual restante disponível para alocação (bloqueando de forma reativa e no backend a inserção caso a soma das quotas de copropriedade ultrapasse `100.00%`).
   - Tabela de proprietários atuais com a quota respectiva e botão de desassociação imediata.

3. **Aba "Matrículas" (Gestão Jurídica de Lotes)**:
   - Formulário de cadastro de matrículas configurando Área em Hectares (4 casas decimais), códigos fiscais, valor de ITR (formatado como moeda na grid) e o código SIGEF (UUID).
   - Tabela de matrículas vinculadas com botão de exclusão que dispara um alerta de exclusão em cascata (`ON DELETE CASCADE`) para destruir pontos (vértices) e divisas (segmentos) associados à gleba.

#### C. Integração e Foco Inteligente (Redirecionamento)
- A tela de propriedades escuta a chave `gerencigeo_foco_propriedade_id` no `localStorage`.
- Se o operador clicar em *"Ver Propriedade"* nos detalhes de um cliente na tela de clientes, o sistema fecha o modal, armazena o ID no `localStorage`, navega para `#propriedades` e, ao carregar a listagem, abre automaticamente o modal de detalhes da propriedade focada, limpando o storage.

### 4.6 Manual e Motor de Georreferenciamento Avançado

Devido à alta complexidade matemática, física e instrumental do motor geodésico do ecossistema, toda a especificação técnica e modelagem computacional espacial do GerenciGeo foi centralizada em uma documentação apartada oficial:

> [!IMPORTANT]
> **Manual e Especificações do Motor Geodésico:**
> Para conferir as rotinas completas de ingestão de satélites, conversão HGO / RPA, algoritmo de triagem quadripolar, processador científica IBGE-PPP (API e Selenium), motor geodésico de translação tridimensional (Bowring/GRS80 e Vetor Delta) e algoritmo de topologia perimetral (Shoelace horária e fechamento estrito), consulte o arquivo de especificação dedicado:
> 
> 👉 **[gerencigeo_georreferenciamento.md](file:///d:/OneDrive_Thiago/OneDrive/Desenvolvimento/GerenciGeo/gerencigeo_georreferenciamento.md)**

### 4.7 Especificações Visuais dos Módulos Auxiliares (UI/UX)

> [!IMPORTANT]
> **Especificações de UI/UX, Design e Modularização:**
> Para conferir o detalhamento completo sobre o Layout Principal Headerless (`principal.html`), o Módulo de Levantamentos (`levantamentos.ts`), o Módulo de Mesa de Trabalho (`mesa_trabalho.ts`), a Mesa de Ingestão Dinâmica, o cabeçalho sticky condensado a 5px e a **Modularização Arquitetural em Submódulos (V2.5)**, consulte o arquivo de georreferenciamento dedicado:
> 
> 👉 **[gerencigeo_georreferenciamento.md](file:///d:/OneDrive_Thiago/OneDrive/Desenvolvimento/GerenciGeo/gerencigeo_georreferenciamento.md)**


#### B. Módulo de Faixa de Fronteira (fronteira.ts)
- **Acesso:** Pela tela de controle de faixa de fronteira e emissão de laudos.
- **Painel Técnico de Ratificação:** Exibe o mapa Leaflet interativo focado na divisa internacional Brasil-Paraguai e o contorno da matrícula rural.
- **Formulário de Metadados Profissionais:** Painel lateral contendo entradas textuais para:
  - Número do documento TRT (obrigatório).
  - Data de quitação da TRT (caixa de calendário).
  - Seleção e upload em dropzone do arquivo Shapefile compactado `.ZIP` da matrícula.
- **Botões "Gerar Laudo de Fronteira (HTML)" e "Gerar Requerimento de Ratificação (HTML)":**
  - Ao clicar, o frontend dispara uma requisição GET enviando os parâmetros da TRT. A resposta HTML retornada pelo servidor é injetada instantaneamente em uma nova janela limpa do navegador (`window.open`), acionando de forma automatizada o seletor nativo de impressão do cliente (`window.print()`). Os botões de impressão e controle laterais do template desaparecem fisicamente no PDF gerado devido à classe de exclusão `.no-print`.

#### C. Módulo de Alertas (Action Center - `pendencias.ts`)
- **Acesso:** Pelo item **"Pendências"** na barra lateral.
- **Painel de Controle de Qualidade:** Consome reativamente o endpoint de auditoria de metadados do servidor (`/dashboard/alerts`).
- **Cards de Pendência Estilizados:** Renderiza os avisos de integridade em duas categorias de impacto visual:
  - **CRÍTICO (Borda vermelha e pulsação CSS ativa):** Exibidos para arquivos GNSS falhos ou menores que 50KB.
  - **AVISO (Borda amarela):** Exibidos para divisas sem confrontantes, pontos órfãos, arquivos brutos pendentes de conversão ou discrepância de Fuso UTM derivado (compass alert).
- **Ação Rápida de Resolução ("Ir para a Tela"):** Cada card possui um botão rápido (ícone de seta direcional) que intercepta a rota do frontend e redireciona o operador diretamente para o formulário, campo ou mapa onde o erro cadastral foi detectado, acelerando o fluxo de correção técnica de campo.

#### D. Módulo de Histórico de Logs e Auditoria (`historico.ts`)
- **Acesso:** Pelo menu lateral clicando em **"Histórico"**.
- **Painel de Rastreabilidade Total:** Exibe de forma tabular e cronológica todos os registros de alteração e logs de importação física:
  - **Grid de Auditoria Cadastral:** Tabela detalhada consumindo `cliente_historico_logs`, expondo a ID do cliente, o campo que foi alterado, o valor antigo, o valor novo inserido e o carimbo de data/hora preciso.
  - **Grid de Histórico de Arquivos RINEX:** Tabela técnica rica listando os arquivos que entraram na esteira de ingestão, seu tamanho em bytes, status de sucesso e os detalhes de logs gerados no processamento.

---

## 5. Próximas Fases do Ciclo de Vida do Software

### Módulo 6: Registro em Cartório (CRI)
*   **Automação de Requerimentos:** Cruzamento automático de dados do proprietário com a descrição do perímetro certificado para emitir o PDF de requerimento de retificação/certificação pronto para o Cartório de Registro de Imóveis.
*   **Dossiê de Confrontação:** Emissão de termos de anuência individuais filtrados por vizinho cadastrado na tabela de segmentos.

### Módulo 7: Arquivamento Seguro (Cold Storage)
*   **Tranca de Segurança (Read-Only Lock):** Ao mudar o status do levantamento para ARQUIVADO, as rotas PUT e DELETE da API para aquele ID são bloqueadas.
*   **Movimentação de Backup:** O WorkspaceManager move a pasta física do projeto para um diretório de histórico definitivo (HD Externo ou Nuvem Fria), limpando o espaço de trabalho ativo do dia a dia.

---

### 4.8 Diretrizes de Design e Responsividade do Dashboard (Panorama Operacional)
Para garantir a otimização de espaço e a visualização correta do painel principal (Panorama Operacional) em qualquer tamanho de tela, as seguintes especificações devem ser seguidas:
1. **Cabeçalho Ultra Compacto (Altura Max ~60px)**: Em telas desktop e mobile, o título principal da tela e o status de conexão da API devem compartilhar a mesma linha horizontal através do flexbox. Detalhes secundários de texto devem ser ocultados no mobile (`hidden sm:block`) para poupar altura útil.
2. **Cards de KPI Horizontais (Altura Max ~70px)**: Para evitar o empilhamento vertical e extensas áreas vazias na interface, os cards de KPI (Total de Clientes, Propriedades, Profissionais) devem adotar um layout horizontal em todas as resoluções de tela (`flex items-center gap-3`).
3. **Mapa e Painéis de Altura Dinâmica (Viewport Spacing)**: No desktop, o contêiner de grid pai que agrupa o Mapa e o Action Center deve se estender dinamicamente até a base inferior do viewport utilizando a classe de cálculo de altura `lg:h-[calc(100vh-220px)] lg:min-h-[450px]`, mantendo o mapa com `lg:h-full`.
4. **Simplificação e Omissão de Elementos Estáticos**: Elementos de indicação puramente estáticos sobre o mapa (como letreiros de WMS conectado) devem ser omitidos. O controle de camadas do Leaflet deve omitir o radio button do satélite Google, mantendo apenas os controles ativáveis funcionais (`overlayMaps`), evitando redundância visual.
5. **SIGEF Link Direto por UUID**: O link de detalhamento da parcela no modal retornado pelo GetFeatureInfo deve encaminhar o operador diretamente para o endereço de visualização individual da parcela (`/geo/parcela/detalhe/{uuid}/`) sempre que o UUID da feição estiver presente.
