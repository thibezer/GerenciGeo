# 🛰️ GerenciGeo — Manifesto de Especificação Técnica e Arquitetura
**Padrão Arquitetural:** Field-to-Finish Integrado (FastAPI + SQLite + Tailwind/TS + Toolchain Topografia)
**Versão do Documento:** 2.5.0
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
    FOREIGN KEY (confrontante_id) REFERENCES confrontantes(id) ON DELETE SET NULL
);

-- CCIR CADASTROS (Banco de Dados de Imóveis Rurais Importados para Consulta)
CREATE TABLE IF NOT EXISTS ccir_cadastros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_imovel TEXT NOT NULL,
    denominacao TEXT,
    codigo_municipio TEXT,
    municipio TEXT,
    uf TEXT,
    area_total REAL,
    titular TEXT,
    natureza_juridica TEXT,
    condicao_pessoa TEXT,
    percentual_detencao REAL,
    pais TEXT,
    arquivo_origem TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ccir_codigo ON ccir_cadastros(codigo_imovel);
CREATE INDEX IF NOT EXISTS idx_ccir_titular ON ccir_cadastros(titular);
CREATE INDEX IF NOT EXISTS idx_ccir_municipio ON ccir_cadastros(municipio);
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

### 2.5.1 Área de Triagem Espacial e Testador de Arquivos de Pontos (V2.5)
- O GerenciGeo fornece um painel temporário de triagem espacial de pontos que permite ao operador testar arquivos `.txt` (layouts Topcon ou RTK) e ver sua plotagem e topologia aproximada em um mapa Leaflet antes de associar permanentemente os dados a qualquer levantamento cadastrado.
- **Ingestão Volátil In-Memory**: O endpoint `POST /pontos/analisar-txt` recebe o arquivo, um fuso UTM e a opção de inversão (`inverter_ne`), realiza o parse in-memory e a conversão matemática UTM -> Lat/Lon geodésicas SIRGAS 2000, retornando a lista estruturada de pontos sem persistir qualquer informação no banco SQLite.
- **Inversão de Coordenadas N/E**: Para acomodar layouts de softwares que exportam na ordem Leste/Norte (X/Y) em vez de Norte/Leste (Y/X), tanto o endpoint temporário quanto a rota oficial de importação (`POST /levantamentos/{id}/importar-txt`) suportam o parâmetro booleano `inverter_ne` para realizar a troca de posição das colunas no ato da leitura.
- **Mapeamento e Confirmação de Destino**: O frontend exibe os pontos no mapa com markers estilizados baseados em suas funções e plota a polilinha perimetral tracejada de fechamento. O usuário escolhe o levantamento destino ativo, a matrícula e a base opcional e dispara a rota oficial de importação do levantamento (`POST /levantamentos/{id}/importar-txt`), garantindo a rastreabilidade e consistência relacional final.

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

#### E. Módulo Banco de Dados CCIR e Emissor INCRA (`ccir.ts`)
- **Acesso:** Pelo menu lateral clicando em **"Banco CCIR"**.
- **Painel de Controle e Ferramentas (Topo):** Grid de três colunas cobrindo a largura total da página:
  - **Sincronização de Pasta:** Executa a varredura e ingestão assíncrona de arquivos CSV presentes na pasta `Banco_CCIR`. Permite abrir o diretório local no gerenciador de arquivos do SO.
  - **Planilhas Importadas:** Lista os arquivos processados, quantidades de registros importados e data da carga, com opção para purgar os dados de um arquivo individualmente.
  - **Preenchimento INCRA (Bookmarklet):** Fornece um link arrastável do tipo `javascript:` que atua como Bookmarklet na barra de favoritos do navegador do usuário.
- **Busca Avançada de Imóveis:** Formulário unificado em grid para busca de cadastros importados por Código CCIR, Denominação do Imóvel, Titular, Município/UF, faixas numéricas de Área total (ha) e de % de Detenção.
- **Tabela de Resultados e Máscara Condicional:**
  - Exibe a lista paginada dos cadastros de imóveis do banco de dados CCIR.
  - **Máscara Condicional**: Aplica a máscara `999.997.970.476-3` apenas se o código CCIR contiver exatamente 13 dígitos; códigos menores são exibidos em formato bruto.
  - Corrige distorções numéricas de floats causadas por formatação de vírgula regional do Excel e Mojibake de acentuação (ex: `JOÃƒO` -> `JOÃO`) direto na ingestão via backend.
- **Modal de Emissão CCIR (`modal-ccir-emissao`):**
  - Abre ao clicar em emitir na listagem de resultados ou no rodapé do modal de coproprietários.
  - Solicita o CPF/CNPJ do declarante do imóvel e aplica a formatação adequada conforme o tamanho do dado.
  - **Sugestão Reativa**: Efetua varredura silenciosa na tabela `/clientes` buscando correspondências de nome para sugerir o CPF de forma automatizada com 1 clique.
  - **Persistência**: Grava o último CPF utilizado para o imóvel no `localStorage` para agilizar emissões futuras.
  - **Fluxo de Cópia e Navegação**: Copia o JSON formatado `{codigo, uf, municipio, cpf}` para a área de transferência do sistema e abre o portal oficial do INCRA (`https://sncr.serpro.gov.br/ccir/emissao`) em uma nova aba do navegador.
- **Funcionamento do Bookmarklet JavaScript:**
  - O script injetado lê os dados copiados na área de transferência através da Clipboard API do navegador, realiza o parsing e preenche de forma reativa os campos do formulário do Serpro/INCRA (Código do Imóvel, UF Sede, Município Sede, seleção do Tipo de Pessoa e CPF/CNPJ do Declarante), rolando e focando a janela no campo de validação do hCaptcha.

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

---

### 4.9 Refatoração Modular de Rotas, Auditoria de Pontos e Prevenção de Reimportação (v2.4.0)

O ecossistema evoluiu para suportar uma estrutura escalável de endpoints e uma camada rica de auditoria visual na mesa de trabalho, mitigando erros operacionais e garantindo o rastreamento dos dados brutos e homologados de forma precisa.

#### A. Arquitetura Modular de Rotas do Backend (routes/)
O arquivo centralizado `api.py` foi simplificado, atuando estritamente como inicializador do servidor FastAPI. Toda a lógica de rotas foi extraída e organizada em submódulos desacoplados:
*   `routes/deps.py`: Componente de middlewares globais (verificação de tranca em levantamento arquivado) e rotinas auxiliares de padronização (como tratamento de strings de confrontantes).
*   `routes/clientes.py`: Endpoints do CRUD de Clientes, Profissionais e logs associados.
*   `routes/propriedades.py`: Gerenciamento de Propriedades, Matrículas, upload e download do CAR/CCIR e checagem de isolamento em faixa de fronteira.
*   `routes/dashboard.py`: Roteamento de alertas (Action Center), logs globais de depuração e listagem de geometrias das matrículas.
*   `routes/ccir.py`: Mecanismos de busca e sincronização assíncrona com o Banco CCIR local.
*   `routes/processamento.py`: Ingestão GNSS, esteira HGO (triagem quadripolar), conversões Rinex e controle do motor geodésico do IBGE-PPP.
*   `routes/levantamento/`: Diretório dedicado para controle e ciclo de vida de levantamentos:
    *   `levantamento/crud.py`: Controle geral (criar, listar, arquivar e desarquivar levantamentos).
    *   `levantamento/pontos.py`: Ingestão de pontos de campo RTK, edição manual e salvamento da ordem de caminhamento perimetral.
    *   `levantamento/homologacao.py`: Importação de planilhas ODS/TXT do SIGEF, associação de abas a matrículas, auditoria do banco de pontos e exclusão de planilhas de origem.
    *   `levantamento/segmentos.py`: Definição de divisas, confrontantes em nível de segmento e integração com feições SIGEF.
    *   `levantamento/documentos.py`: Emissão sob demanda de relatórios de faixa de fronteira (HTML nativo), termos de anuência e shapefiles (.ZIP) dinâmicos.

#### B. Prevenção de Conflitos e Duplicatas na Reimportação de Planilhas
Durante o processamento do upload de arquivos ODS/TXT contendo vértices aprovados (SIGEF), o backend aplica as seguintes regras de segurança:
1.  **Checagem de Nome de Arquivo Existente:** Antes de iniciar a transação de banco de dados, é realizada uma contagem em `banco_pontos` baseada no `planilha_origem` (ex: `Norte Corre.ods`). Caso haja pontos associados àquela mesma planilha no levantamento, a operação é bloqueada e é retornado um código `HTTP 400 Bad Request` com instruções de que a versão anterior deve ser explicitamente excluída na tela de auditoria.
2.  **Expurgo Assistido e Cascade de Divisas:** Se o operador optar por excluir o arquivo importado na auditoria, a API purga atomicamente os registros correspondentes da tabela `banco_pontos`. Se o arquivo estivesse associado a uma matrícula (atualizando a tabela principal de `pontos` com `origem_homologada = 1` e `arquivo_origem = planilha_origem`), a remoção destes pontos exclui de forma síncrona todas as divisas correspondentes (`segmentos`) criadas para aquela matrícula, forçando o operador a rearquivar os novos dados de forma limpa.

#### C. Painel de Auditoria de Banco de Pontos no Frontend
A interface de Homologação expõe o painel **"🔍 Auditoria de Pontos no Banco"** (accordion colapsável controlado via CSS e transição suave) que realiza uma chamada ao endpoint `GET /levantamentos/{id}/banco-pontos/auditoria`:
*   **Métricas de Integridade:** Exibe cards compactos com o total de pontos inseridos, quantidade de arquivos de origem lidos e volume de códigos de vértice duplicados.
*   **Agrupamento e Destaques Visuais:** Os pontos são agrupados por arquivo (`planilha_origem`). Se um código de vértice for identificado em múltiplos arquivos de origem simultaneamente (duplicidade geodésica perigosa), a linha do ponto adquire a classe `bg-rose-500/10 text-rose-300` e a seção correspondente exibe uma badge de alerta.
*   **Exclusão de Lote Dinâmica:** Cada grupo possui um botão de remoção rápida que faz a chamada `DELETE /levantamentos/{id}/planilhas-homologadas?planilha_origem=...`, permitindo que o operador limpe importações incorretas e reorganize a mesa de trabalho sem comprometer a integridade referencial dos dados corretos.

#### D. Refatoração Modular e Divisão em Submódulos da Mesa de Trabalho (Frontend) (v2.4.0)

Para melhorar a legibilidade e escalabilidade do frontend da Mesa de Trabalho, o arquivo monolítico de mais de 4.100 linhas (`mesa_trabalho.ts`) foi desacoplado de forma modular em submódulos distintos baseados no padrão de **Contexto Compartilhado** sob o diretório `frontend/src/views/mesa_trabalho/`:
1.  **Interface de Contexto (`mesa_trabalho_context.ts`):** Estabelece a interface `MesaTrabalhoContext`, contendo o estado unificado (IDs selecionados, lista de pontos, flags de visualização) e as funções de callbacks centrais (carregar detalhes do levantamento, alternar etapas de UI, gerenciar abas de matrículas), prevenindo dependências circulares de imports no Vite.
2.  **Mesa Geodésica (`mesa_geodesica.ts`):** Centraliza a lógica de triagem e ingestão GNSS da primeira etapa de UI (`'geoprocessamento'`), englobando a tabela de pontos de campo brutos/corrigidos, o motor linear/ECEF de translação manual de bases e a fila de arquivos de uploads.
3.  **Organizador de Perímetro (`organizador_perimetro.ts`):** Contém a lógica relacional e de divisas perimetrais da aba `'cartorio'`. Lida com a ordenação perimetral de vértices, reordenação simplificada por arraste/clique no mapa e a tabela lateral de segmentos de divisa com adicionador rápido de confrontante.
4.  **Gerador de Documentos (`gerador_documentos.ts`):** Controlador dedicado para a nova Etapa 3 (`'documentos'`). Centraliza as lógicas do painel de homologação do SIGEF (upload de planilhas aprovadas, lista de vértices homologados), auditoria de duplicatas no banco de pontos, qualificação detalhada de confrontantes (relação civil e máquina de estados conjugais) e botões de emissão de peças técnicas (Requerimento, Declaração, Laudo e Termo de Anuência).
5.  **Histórico de Auditoria (`auditoria_historico.ts`):** Responsável por exibir a timeline de logs de campo, auditorias de translações geodésicas aplicadas, e deleção física de arquivos GNSS no Windows Workspace (aba `'auditoria'`).

---

### 4.10 Preenchimento Reativo de Confrontantes por CPF e Prevenção de Mesclagem de Nomes Repetidos (v2.4.1)

Para melhorar a produtividade de cadastro e evitar erros cadastrais ao qualificar proprietários de imóveis lindeiros, foram introduzidos os seguintes mecanismos reativos e correções de agrupamento na Mesa de Trabalho:

#### A. Ajuste de Agrupamento de Confrontantes Ativos
A query que seleciona a lista de confrontantes ativos para anuência e qualificação de uma matrícula (`GET /levantamentos/{id}/matriculas/{matricula_id}/confrontantes-ativos`) foi corrigida para agrupar as correspondências por ID físico do banco de dados (`GROUP BY c.id`) em vez de agrupar por nome normatizado (`GROUP BY UPPER(TRIM(c.nome))`). Isto garante que:
- Múltiplos confrontantes com nomes idênticos associados a segmentos distintos da divisa sejam preservados independentemente no banco de dados e na interface do usuário.
- O select de anuência/qualificação exponha opções individuais para cada proprietário confrontante lindeiro, sem mesclagens ou desaparecimentos indesejados.

#### B. Endpoint Global de Busca por CPF/CNPJ
Foi adicionada a rota `GET /confrontantes/buscar-por-cpf` que aceita um parâmetro de consulta `cpf`. O backend executa a limpeza de pontuações e traços, localizando o registro de confrontante mais recente na tabela `confrontantes` que possua dados preenchidos válidos e retornando suas qualificações completas (nome, nacionalidade, profissão, estado civil, regime de bens, dados do cônjuge e endereço).

#### C. Preenchimento Automático Reativo no Frontend
No formulário de edição de confrontante (`gerador_documentos.ts`), foi acoplado um listener ao evento `blur` do campo de CPF (`#input-conf-cpf`). Ao preencher um CPF/CNPJ válido e sair do campo, o sistema:
1. Consulta assincronamente a rota de busca por CPF.
2. Se dados preenchidos forem localizados, auto-preenche todos os campos cadastrais do formulário, incluindo opcionalmente a matrícula do imóvel (apenas se esta estiver em branco no formulário para evitar sobrescrever a designação de um lote vizinho específico).
3. Aciona reativamente a máquina de estados civis (`configurarMaquinadeEstadosCivil`) para sincronizar a interface e visibilidade dos campos de cônjuge e regime de bens.
4. Exibe uma notificação visual animada de sucesso abaixo do campo do CPF por 5 segundos.

---

### 4.11 Sincronização e Modularização do Motor de Anuências e RT (v2.4.2)

O motor de geração de relatórios de cartório foi atualizado em `business/cartorio_generator.py` para sincronizar o arquivo de anuência física com as novas chaves estruturadas de design e metadados:

#### A. Adoção da Tabela Topográfica de Divisas
- Foi eliminada a antiga variável descritiva textual `{divisa_descricao_texto}`.
- Foi implementado o motor de tabelas topográficas nativas (`gerar_tabela_divisas_html` e `obter_segmentos_detalhados_confrontante`) na Declaração de Anuência do Confrontante (`declaracao_anuencia.html`), que gera dinamicamente uma tabela estruturada contendo os pontos de divisa (De/Para), o Azimute e a Distância calculados dinamicamente entre os vértices, além das Coordenadas Geográficas (Lat/Lon) iniciais de cada trecho.

#### B. Injeção de Dados do Responsável Técnico
O método `gerar_declaracao_anuencia_html` extrai dinamicamente as chaves de cadastro do profissional técnico de dentro de `dados["lev"]` e as injeta no template:
- `{nome_profissional}`: Nome completo do profissional técnico.
- `{conselho_profissional}`: Conselho profissional de classe (CFTA/CREA).
- `{registro_profissional}`: Número de registro no respectivo conselho.
- `{credencial_incra}`: Código de credenciamento do profissional junto ao INCRA.
- `{final_trt}`: Número da TRT/ART do projeto.

#### C. Proteção do Motor CSS (Tailwind)
O motor de renderização da anuência foi migrado de formatação f-string direta para substituições de strings lineares atômicas via `.replace()`, protegendo as declarações de regras CSS com chaves `{}` do Tailwind CSS presentes no cabeçalho do template `templates/declaracao_anuencia.html`.

---

### 4.12 Ajuste de Qualificação e Outorga Conjugal na Anuência do Confrontante (v2.4.3)

Para atender às exigências cartoriais de validade jurídica das declarações de anuência de confrontação de imóveis rurais (Lei 6.015/73):
- **Qualificação Completa de Cônjuge no Regime Parcial/Outros**: Quando o confrontante lindeiro for casado sob o regime de Comunhão Parcial de Bens ou outro regime comum (como Comunhão Universal), seu cônjuge também é qualificado de forma completa na peça jurídica (incluindo o nome, RG e CPF).
- **Tratamento Simplificado de Casamento sob Separação de Bens**: Quando o confrontante for casado sob o regime de Separação de Bens (seja convencional ou obrigatória), o cônjuge é apenas citado no corpo da qualificação do declarante (ex: "casado sob o regime de separação de bens com Fulano"), sem a exigência de qualificação documental complementar (RG e CPF).
- **Outorga Conjugal (Assinaturas)**: O cônjuge do confrontante assina o termo de anuência em conjunto com ele (outorga conjugal) na mesa de assinaturas apenas se o casamento for sob regimes de comunhão de bens (como parcial, universal, etc.). Se o casamento for sob o regime de **Separação de Bens**, a outorga conjugal é dispensada e a assinatura do cônjuge é omitida do bloco de assinaturas final.
- **Interface Reativa no Frontend (`gerador_documentos.ts`)**: A máquina de estados de visibilidade e desativação dos campos (`configurarMaquinadeEstadosCivil`) foi atualizada para que os campos de CPF e RG do cônjuge do confrontante lindeiro fiquem habilitados e disponíveis para edição por padrão. Eles passam a ser limpos e desabilitados (`disabled = true`) apenas se o usuário selecionar o regime de **Separação de Bens** (total ou obrigatória). No regime de **Comunhão Parcial de Bens** ou outros, os campos permanecem ativos, permitindo o cadastro completo necessário para a qualificação judicial.
- **Propagação Automática de Dados Cadastrais por CPF/CNPJ**: Na rota de atualização do confrontante (`PUT /confrontantes/{cid}`), implementou-se a sincronização atômica de dados cadastrais. Ao salvar alterações nas qualificações de um confrontante (nome, rg, nacionalidade, profissão, estado civil, regime de bens, endereço e dados do cônjuge), o sistema propaga automaticamente essas atualizações para todos os outros registros do banco de dados que compartilham do mesmo CPF/CNPJ, poupando redigitação. A propagação respeita a trava de segurança ignorando levantamentos no status `'ARQUIVADO'`.

### 4.13 Multi-Perímetro Simultâneo, Vértices de Terceiros e Suporte a Pontos Compartilhados (v2.4.5)

Para possibilitar a correta visualização da planta integrada de divisas do imóvel e garantir a consistência das poligonais levantadas em campo que compartilham confrontações comuns:
- **Remoção da Constraint UNIQUE Global em Vértices**: A restrição única da tabela `banco_pontos` no SQLite (`codigo_completo UNIQUE`) causava a perda de vértices de divisa comuns quando múltiplos arquivos ODS (diferentes glebas/matrículas) eram importados para o mesmo levantamento. O ponto compartilhado era ignorado por causa da restrição e ficava atrelado apenas à primeira planilha importada. Implementou-se uma migração transacional (função `migrar_restricao_unicidade_banco_pontos` no `database/models.py`) que alterou a unicidade para composta `UNIQUE(levantamento_id, planilha_origem, codigo_completo)`. Isso permite a coexistência de um mesmo vértice compartilhado em planilhas/matrículas diferentes.
- **Plotagem Multi-Perímetro no Mapa por Matrícula**: A renderização do mapa Leaflet foi readequada para consumir o novo endpoint de backend `GET /levantamentos/{id}/pontos-homologados` (que lê e retorna todas as coordenadas e respectivas ordens de caminhamento diretamente da tabela `pontos` filtrada por `origem_homologada = 1`). A função `plotPoligonalHomologada` em `mesa_trabalho_mapa.ts` foi modificada para agrupar as coordenadas estritamente pela chave `matricula_id` e ordená-las por `ordem_caminhamento`, desenhando perfeitamente os contornos de cada matrícula de forma fechada e independente (eliminando linhas cruzadas em "leque/zigue-zague" mesmo em divisas sobrepostas compartilhadas).
- **Mapeamento de Vértices de Outros Profissionais**: Ajustou-se o algoritmo de classificação de tipo de vértice (`M`, `P` ou `V`) na importação de cadernetas de campo (`TxtGeodesicParser.processar_arquivo` em `business/txt_parser.py`) e na rotina de reversão de bases (`reverter_rovers_para_bruto` in `business/geoprocessamento.py`). Em vez da validação simplificada por letra inicial (`startswith`), utiliza-se busca por expressão regular com base nos padrões do SIGEF (`([A-Z]{3,4})-(M|P|V)-(\d+)` e `(M|P|V)-(\d+)`). Isso assegura que marcos já homologados e implantados por outros profissionais (ex: `DDK-M-1534`) ou do próprio levantamento contendo prefixos sejam classificados corretamente de acordo com seu tipo real, prevenindo falhas de topologia e poligonais abertas.
- **Sincronização de Banco de Dados**: A integridade das tabelas físicas `pontos` e `segmentos` foi restabelecida no levantamento atual através de script de migração corretivo (`scratch/fix_database_associations.py`), que alinhou pontos importados com suas respectivas matrículas associadas conforme o `banco_pontos`.

---

### 4.14 Isolamento e Resolução Inteligente de Confrontantes para Múltiplas Matrículas (v2.4.6)

Para aprimorar a consistência cadastral de levantamentos contendo múltiplos perímetros (glebas/matrículas) e otimizar a experiência do topógrafo na organização de divisas:
- **Criação do Módulo Dedicado (`confrontante_manager.py`)**: Centralizou-se toda a lógica de processamento, desduplicação fonética e vinculação geométrica de confrontantes em `business/confrontante_manager.py`. Isso removeu a lógica de negócios misturada em rotas de API (`homologacao.py`) e delegou a extração de nomes em `routes/deps.py` para o novo módulo.
- **Motor de Resolução de Confrontantes Refinado**: O motor de importação (`resolver_confrontantes_planilha`) e de vinculação (`vincular_confrontantes_pontos`) agora realizam busca exata baseada na matrícula do imóvel confrontante. Se a matrícula confrontante for diferente no banco (ex: "5893" e "6622"), registros separados de confrontante são criados, mesmo que possuam o mesmo nome de proprietário. A desduplicação por nome é executada apenas se a matrícula estiver vazia ou coincidente, evitando que lindeiros distintos sejam mesclados incorretamente no mesmo ID físico do levantamento.
- **Preservação de Dados de Divisas na Ordenação Manual**: Ajustou-se a rotina `salvar_ordem_caminhamento` em `business/levantamento_manager.py`. Antes de purgar os segmentos antigos para reconstrução sequencial das polilinhas (fechamento $P_n \to P_1$), o sistema lê as amarrações anteriores (ID do confrontante, tipo de limite e método de posicionamento de cada segmento). Ao inserir os novos segmentos, a rota checa se a conexão (ou sua inversa) existia anteriormente e copia de volta essas informações, evitando que o usuário perca suas amarrações ao reordenar vértices manualmente na interface.

---

### 4.15 Importação Multilha/Multi-aba em Lote com Mapeamento Interativo de Matrículas (v2.5.0)

Para agilizar o fluxo de homologação regulatória de múltiplos imóveis rurais/glebas cadastrados sob o mesmo levantamento técnico georreferenciado e eliminar a necessidade de uploads sucessivos e demorados:
- **Novos Endpoints de Ingestão e Processamento em Lote**:
  - `POST /levantamentos/{id}/analisar-planilha-abas`: Inspeciona a estrutura interna de um único arquivo físico. Se ODS, descompacta-o em memória e extrai as abas da planilha (`content.xml`), listando apenas aquelas que contêm pelo menos um marco compatível com a expressão regular de marcos regulamentares (`M`, `P` ou `V`). Se for arquivo plano (TXT/CSV), retorna uma aba virtual. O resultado indica o nome de cada aba e a quantidade de vértices geodésicos encontrados.
  - `POST /levantamentos/{id}/importar-pontos-aprovados-lote`: Recebe múltiplos arquivos físicos e uma string JSON mapeando cada chave `NomeArquivo#NomeAba` para o `matricula_id` correspondente. Executa em lote sob uma única transação no SQLite: purga os pontos de origem antigos apenas das matrículas que estão mapeadas no lote, desduplica os pontos mantendo a ordem de caminhamento perimetral, grava as coordenadas na tabela `pontos` marcando o status como `'BRUTO'` (para texto) ou `'CORRIGIDO'` (para planilhas georreferenciadas), calcula as distâncias geodésicas e azimutes gerando os segmentos de divisa, resolve e desduplica as confrontações e atualiza de forma incremental e atômica os contadores de marcos dos profissionais responsáveis técnicos.
- **Interface e Mapeamento Prévio Interativo no Frontend**:
  - A entrada de homologação (`mesa_trabalho_template.ts`) foi atualizada com o atributo `multiple` para permitir a seleção múltipla de arquivos por meio do dropzone.
  - Foi criado o painel de mapeamento de abas para matrículas (`#container-mapeamento-abas-homologacao`). Ao arrastar ou selecionar arquivos, o sistema dispara requisições assíncronas concorrentes (`Promise.all` em `gerador_documentos.ts`) ao endpoint de análise e renderiza na UI as abas detectadas agrupadas por arquivo de origem.
  - Cada linha de aba/arquivo exibe sua contagem de pontos e um seletor `<select>` contendo todas as matrículas cadastradas no levantamento. O motor possui pré-seleção inteligente baseada na busca pelo número do lote/matrícula no nome do arquivo ou da aba correspondente, além de pré-selecionar a matrícula se houver apenas um registro cadastrado para o levantamento.
  - O processamento de lote ocorre em uma única etapa, enviando todos os arquivos físicos e a query string JSON de mapeamento, garantindo que o mapa e a tabela de dados sejam atualizados imediatamente.

---

### 4.16 Customização do Nome de Anuências e Emissão em Lote (v2.5.1)

Para otimizar a organização e a produtividade no processamento de peças técnicas destinadas ao Registro de Imóveis:
- **Inclusão da Matrícula no Nome do PDF**:
  - **Física (Servidor)**: A rota de upload de termo assinado (`POST /levantamentos/{id}/documentos/anuencias/{confrontante_id}/upload`) consulta a matrícula associada à divisa do confrontante e salva o arquivo fisicamente sob o padrão `anuencia_matricula_{numero_matricula}_{confrontante_id}_assinado.pdf`.
  - **Digital (Navegador)**: A tag `<title>` do template `declaracao_anuencia.html` foi parametrizada para incluir `{numero_matricula}`. Assim, quando o usuário imprime e salva a anuência individual ou o lote como PDF no navegador via `window.print()`, o nome padrão sugerido para o arquivo inclui o número da matrícula.
- **Emissão de Anuências em Lote (PDF Único)**:
  - **Nova Rota no Backend**: Criou-se o endpoint `GET /levantamentos/{id}/matriculas/{matricula_id}/anuencia-lote-html` que busca todos os confrontantes lindeiros atrelados a divisas daquela matrícula e monta um documento HTML consolidado unindo as declarações.
  - **Quebras de Página Estritas**: Adicionou-se propriedades de controle de quebra de página no CSS `@media print` para a classe `.page` (`page-break-after: always` e `break-after: page`), definindo uma exceção para o último elemento (`.page:last-child { page-break-after: avoid }`). Isso permite que, na impressão de lote, cada anuência ocupe exatamente uma folha A4 sem gerar páginas em branco extras ao final do documento PDF.
  - **Integração no Frontend**: O dropdown de anuências (`select-confrontante-anuencia`) recebeu a opção `"✨ Gerar Todas em Lote (PDF Único)"`. Ao selecioná-la e clicar em gerar, o sistema detecta o valor `"lote"`, abre a rota de lote em uma nova aba do navegador para visualização/impressão e oculta reativamente o formulário de qualificação do confrontante.

---

### 4.17 Arquitetura Híbrida Edge-First e Especificação do Hub Web (v2.5.2)

Com a migração do ecossistema do processamento centralizado na nuvem para o modelo **Edge-First (Desktop Local)**, a especificação técnica do ambiente em nuvem e a integração local-nuvem passam a seguir as regras descritas abaixo:

#### A. O Módulo Web Leve (`cloud_api.py` na Nuvem)
O servidor online na Hostinger executa o arquivo `cloud_api.py` sob FastAPI de forma enxuta e isolada:
- **Exclusão de Dependências Pesadas:** É proibido importar e utilizar bibliotecas espaciais pesadas (como `pyproj` ou `pyshp`) ou bibliotecas de automação do Windows (como `pywinauto` ou `pythonnet`) na nuvem para garantir compatibilidade com ambientes compartilhados Linux modestos.
- **Desativação de Ingestão de Campo:** Todas as rotas de ingestão GNSS, conversão RPA e submissão PPP são bloqueadas. O backend online valida que `RUNNING_LOCAL == False` e recusa qualquer requisição a esses endpoints com erro **HTTP 403 Forbidden** e a mensagem `"Operação restrita ao Software Desktop Local"`.

#### B. Modelo de Dados Simplificado na Nuvem (MySQL)
O banco de dados na Hostinger armazena apenas dados cadastrais simplificados para fins de consulta móvel rápida e monitoramento corporativo, estruturado nas seguintes colunas físicas:
- `id` (INTEGER PRIMARY KEY)
- `nome_propriedade` (VARCHAR)
- `municipio` (VARCHAR)
- `uf` (VARCHAR)
- `area_ha` (DOUBLE/FLOAT)
- `status_levantamento` (VARCHAR)
- `numero_matricula` (VARCHAR)
- `ccir` (VARCHAR)
- `limite_perimetral` (LONGTEXT - String contendo a geometria simplificada no formato **Polígono GeoJSON** ou **WKT (Well-Known Text)** projetada em WGS84 para renderização direta em mapas mobile Leaflet/Google Maps).

#### C. Endpoint de Sincronização Unidirecional (`POST /api/v1/sync/imovel`)
Disponibilizado na Hostinger para escuta de pacotes de dados enviados pelas instâncias locais autorizadas:
1. **Validação de Segurança:** Exige o cabeçalho `X-API-KEY` contendo o token estático configurado (`G4G2_SECURE_SYNC_TOKEN_7D8E2B9A1C`). Requisições sem chave ou com chaves divergentes são rejeitadas imediatamente com **HTTP 401 Unauthorized**.
2. **Gravação Transacional:** Recebe o payload JSON contendo os dados cadastrais da propriedade e a string do polígono perimetral. Efetua um `INSERT OR UPDATE` (Upsert) na tabela simplificada do MySQL na nuvem, garantindo a atualização instantânea do Hub de Consulta.

#### D. Ocultação Dinâmica no Frontend Cloud (Mesa de Trabalho Ocultada)
Para evitar que operadores tentem carregar arquivos ou emitir relatórios locais pesados quando acessam o sistema pelo link da web:
1. **Detecção de Contexto:** O frontend lê a URL de acesso (`window.location.origin`). Se a URL indicar o host da nuvem Hostinger (não contiver `127.0.0.1`, `localhost` ou `::1`), o sistema assume modo **Cloud Hub**.
2. **Ocultação Reativa de Elementos:**
   - Desativa e oculta visualmente as dropzones de upload de arquivos RINEX/GNS (`#triagem-dropzone` e `#homologacao-dropzone`).
   - Remove ou esconde a seção inteira do Workspace GNSS local (`#painel-workspace-gnss`).
   - Oculta botões de geração de peças técnicas locais pesadas (como o testador HGO e geradores de lote) e insere uma mensagem informativa elegante na barra de status superior: `"Modo de Consulta Hub Web Ativo. Operações de Ingestão Restritas ao App Desktop."`

---

### 4.18 Remoção do Bloco de Assinatura Física do RT nos Templates (v2.5.3)

Para otimizar o layout de impressão das peças técnicas e adequar o sistema ao fluxo moderno de assinaturas digitais/eletrônicas (como via certificado ICP-Brasil ou portais de assinatura):
- **Otimização de Espaço de Página e Prevenção de Páginas Órfãs**: O bloco de assinatura visual do Responsável Técnico foi inteiramente removido do template do Laudo Técnico (`laudo_tecnico.html`). O fechamento do documento agora é finalizado de forma limpa na data e local formatados (`{municipio}-{uf}, {data_extenso}.`), liberando espaço vertical e evitando quebras de página inadequadas (que geravam uma folha extra contendo apenas o bloco de assinatura físico).

---

### 4.19 Consolidação Automática de Múltiplas Matrículas/Glebas em Peça Única (v2.5.4)

Para otimizar e unificar o processo de averbação e retificação imobiliária nos Cartórios de Registro de Imóveis (CRI) e reduzir o volume de assinaturas e impressões redundantes:
- **Detecção e Agrupamento no Backend**: A lógica de geração dos métodos `gerar_requerimento_cartorio_html`, `gerar_declaracao_responsabilidade_html` e `gerar_laudo_tecnico_html` em `business/cartorio_generator.py` foi atualizada para consultar todas as matrículas atreladas à propriedade do levantamento.
- **Layout Tabular Dinâmico**: 
  - Se a propriedade possuir múltiplas matrículas, os documentos são gerados de forma consolidada no plural, contendo uma tabela HTML detalhando cada gleba (denominação, matrícula, área individual e UUID de certificação SIGEF).
  - No **Requerimento de Cartório**, os itens iniciais (1, 2, 3 e 4) são substituídos dinamicamente pelo formato consolidado com a área total somada, e o item de encerramento é pluralizado (solicitando o encerramento em lote de todas as matrículas originárias).
  - Na **Declaração de Responsabilidade**, a qualificação inicial é reescrita e aponta para a tabela estruturada com todas as glebas sob responsabilidade declarada dos proprietários.
  - No **Laudo Técnico**, a introdução é adaptada no plural e exibe a tabela de resumo de glebas. Adicionalmente, a tabela de coordenadas dos vértices é estruturada de forma dinâmica para incluir uma **coluna extra à direita ("Gleba / Matrícula")** que mapeia a origem física de cada ponto cadastrado no levantamento.
- **Retrocompatibilidade Preservada**: Caso a propriedade possua apenas uma matrícula cadastrada, os templates continuam renderizando o texto original corrido no singular e com tabelas em formato clássico (5 colunas para o Laudo), preservando 100% o comportamento padrão do ecossistema.

### 4.20 Termo de Responsabilidade Técnica para Certificação INCRA/SIGEF (v2.5.5)

Para simplificar e otimizar os fluxos de certificação de imóveis rurais perante o INCRA e o SIGEF, foi integrado ao GerenciGeo o Termo de Responsabilidade Técnica (TRT/ART) descritivo do agrimensor:
- **Novo Template Dedicado (`termo_responsabilidade_sigef.html`)**: Estruturado sob Tailwind CSS com cabeçalho padrão corporativo da COMPLETA Agrimensura, contendo todas as declarações legais fundamentadas na Lei Federal 6.015/73 (Art. 213, § 14 e Art. 176, § 5º), Lei 10.267/01 e decretos 4.449/02 e 5.570/05. A página A4 é projetada com recursos de `@media print` para evitar quebras órfãs de linhas e otimizar o bloco de assinatura técnica final.
- **Preenchimento Dinâmico Unificado (`business/cartorio_generator.py`)**: O método estático `gerar_termo_responsabilidade_sigef_html` consome dados unificados de profissional e imóvel da função `obter_dados_comuns`. Ele realiza a injeção determinística de variáveis como nome do profissional, formação, conselho profissional, CPF, RG, credencial do INCRA, denominação e comarca do imóvel, área certificada (com duas casas decimais), número de registro do SIGEF (parcela/georreferenciamento), além da data por extenso de forma independente do locale do SO.
- **Roteamento Exposto via API FastAPI (`routes/levantamento/documentos.py`)**: Registrou-se o endpoint `GET /levantamentos/{id}/matriculas/{matricula_id}/termo-responsabilidade-sigef-html` com injeção opcional do número de TRT/ART, que delega o preenchimento ao gerador e retorna o HTMLResponse correspondente ao navegador.
- **Ação Integrada na Mesa de Trabalho (`mesa_trabalho_template.ts` e `gerador_documentos.ts`)**:
  - Foi criado o botão `#btn-emitir-termo-sigef` ("Termo Resp. SIGEF") estilizado com ícone Lucide correspondente.
  - O painel de botões de emissão de peças técnicas foi expandido de 4 para 5 colunas responsivas (`lg:grid-cols-5`) para acomodar a nova ação sem prejudicar o design.
  - O evento do clique do botão no frontend realiza a verificação de existência da matrícula, solicita interativamente as informações de TRT/ART caso ausentes e atualiza o banco de dados antes de abrir a aba de impressão do navegador.

### 4.21 Manual do Proprietário Pós-Georreferenciamento Digital (v2.5.6)

Para facilitar a comunicação e orientar o cliente proprietário do imóvel sobre a destinação e a finalidade jurídica de cada documento gerado durante o georreferenciamento, implementou-se o Manual Digital do Proprietário:
- **Template Dinâmico e Responsivo (`manual_proprietario.html`)**: Desenvolvido sob Tailwind CSS com cabeçalho corporativo personalizado e ícones Lucide. Contém a explicação das levas de documentos (gerais e específicos), passo a passo detalhado para assinatura e averbação no CRI, alertas deNota de Exigência e rodapé dinâmico contendo dados de suporte técnico da agrimensura (Dimas, Thiago e o Responsável Técnico do projeto).
- **Mockups de Documentos A4 em CSS Puro**: Para eliminar a dependência de arquivos de imagens estáticos pesados, foram desenvolvidas miniprévias vetorizadas de alta performance em CSS representando a folha A4 de cada documento do processo. Ao clicar em cada card de documento, aciona-se um modal interativo que exibe a miniprévia ampliada com explicações detalhadas sobre sua finalidade jurídica e instruções de quem deve assinar.
- **Acesso Público via Rota Pública FastAPI (`routes/levantamento/documentos.py`)**: A rota `GET /levantamentos/{id}/matriculas/{matricula_id}/manual-proprietario-html` foi projetada livre de travas de autenticação ou token de profissional. Ela permite o carregamento público do HTML sob demanda por parte de qualquer usuário do celular que faça a leitura de um QR Code impresso contendo a URL correspondente, apontando diretamente para o mesmo domínio público do backend online.
- **Botão na Mesa de Trabalho (`mesa_trabalho_template.ts` e `gerador_documentos.ts`)**: Adicionou-se o botão `#btn-emitir-manual-proprietario` ("Manual Proprietário"). Para comportar todos os 6 botões técnicos do bloco de cartório sem quebra indesejada, o grid de visualização do frontend foi atualizado para `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3`. O clique no botão abre o manual digital correspondente em uma nova aba do navegador (`_blank`).
