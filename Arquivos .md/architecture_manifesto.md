# GerenciGeo Architecture Manifesto (Constituição e Código)
**Pilar 2 — Manifesto do Motor Geodésico, Ambiente Desktop Local Edge-First e Hub Web Cloud**
**Versão do Documento:** 2.8.0
**Status:** Homologado e Consolidado como a Constituição do Projeto (gemini.md) [88]

---

## 1. Topologia Distribuída Edge-First
O GerenciGeo v2.4+ adota uma arquitetura híbrida **Edge-First**, descentralizando o processamento matemático pesado de coordenadas, as manipulações de hardware local e as automações de interface de usuário no Windows (RPA) para rodar localmente na máquina do profissional, mantendo um Hub Web leve na nuvem exclusivamente para consultas rápidas e monitoramento corporativo [77, 140].

```
  +--------------------------------------------------+
  |              AMBIENTE DESKTOP LOCAL              |
  |  FastAPI + SQLite + Wrapper pywebview + Windows  |  -- Executa 100% autônomo e off-line [77, 80]
  |                                                  |
  |  - Ingestão GNSS de Campo (GNS / TXT / RINEX)    | [44]
  |  - RPA Hi-Target HGO (ConvertRinex.exe)          | [46]
  |  - Processador Científico IBGE-PPP (HTTP/Selenium)| [49, 51]
  |  - Motor de Translação 3D ECEF & Bowring          | [53, 54]
  |  - Topologia Perimetral Shoelace Horária         | [56]
  +--------------------------------------------------+
                           |
                           | Sincronização Unidirecional Atômica (httpx + X-API-KEY)
                           | Payload JSON + Perímetro GeoJSON / WKT em WGS84 [78, 143]
                           v
  +--------------------------------------------------+
  |               AMBIENTE WEB CLOUD                 |
  |         FastAPI + MySQL + Hostinger Hub          |  -- Executa sob Linux Compartilhado Enxuto [141, 149]
  |                                                  |
  |  - Bloqueio Estrito de Ingestão e Processamento   |  -- Retorna 403 Forbidden para RPA/GNSS [77, 141, 150]
  |  - Banco de Dados Cadastral Simplificado         | [142, 151]
  |  - Mapa de Visualização Rápida no Mobile         | [142]
  +--------------------------------------------------+
```

---

## 2. Modelagem e Esquemas de Dados (Databases)
O tripé geodésico-jurídico-rural exige restrições de integridade referencial estritas para evitar dados órfãos. A criação das tabelas no SQLite local segue uma ordem hierárquica atômica baseada em chaves estrangeiras (`FOREIGN KEY`) com propagação `ON DELETE CASCADE` [90].

### 2.1 Banco de Dados Local (SQLite - DDL Completo)
Abaixo está o script estruturado completo do banco de dados local `database/gerencigeo.db` [81, 92]:

```sql
-- Habilita restrição de chaves estrangeiras no SQLite
PRAGMA foreign_keys = ON;

-- 1. profissionais (Responsáveis Técnicos credenciados INCRA)
CREATE TABLE IF NOT EXISTS profissionais (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome_completo TEXT NOT NULL,
    cpf TEXT UNIQUE NOT NULL,
    rg TEXT NOT NULL,
    conselho_profissional TEXT NOT NULL, -- CFTA/CREA [133]
    registro_profissional TEXT NOT NULL, -- Número de registro no respectivo conselho [133]
    credencial_incra TEXT UNIQUE NOT NULL, -- Código credenciado no INCRA (ex: CRED-TIPO-NUMERO) [133]
    email TEXT NOT NULL,
    telefone TEXT NOT NULL,
    endereco_profissional TEXT NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. clientes (Proprietários de Imóveis ou Confrontantes)
CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome_completo TEXT NOT NULL,
    cpf_cnpj TEXT UNIQUE NOT NULL,
    rg_ie TEXT,
    sexo TEXT CHECK(sexo IN ('M', 'F')) NOT NULL, -- Utilizado para heurística de gênero [92]
    nacionalidade TEXT DEFAULT 'brasileiro(a)',
    profissao TEXT,
    estado_civil TEXT CHECK(estado_civil IN ('Solteiro(a)', 'Casado(a)', 'União Estável', 'Divorciado(a)', 'Viúvo(a)')) NOT NULL,
    regime_bens TEXT, -- Comunhão Parcial, Comunhão Universal, Separação Total, etc. [95]
    nome_conjuge TEXT,
    cpf_conjuge TEXT,
    rg_conjuge TEXT,
    endereco_completo TEXT NOT NULL, -- Salvo no formato "Rua, Número" na UI, concatenado [95]
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. cliente_metadados (Extensibilidade dinâmica Chave-Valor)
CREATE TABLE IF NOT EXISTS cliente_metadados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    chave TEXT NOT NULL,
    valor TEXT NOT NULL,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
    UNIQUE(cliente_id, chave)
);

-- 4. cliente_historico_logs (Auditoria e Rastreabilidade Documental)
CREATE TABLE IF NOT EXISTS cliente_historico_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    campo_alterado TEXT NOT NULL,
    valor_antigo TEXT,
    valor_novo TEXT,
    alterado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
);

-- 5. propriedades (Escopo Físico e Ambiental Global)
CREATE TABLE IF NOT EXISTS propriedades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome_propriedade TEXT NOT NULL,
    municipio TEXT NOT NULL,
    uf TEXT NOT NULL,
    codigo_car TEXT, -- Registro CAR [100]
    codigo_ccir TEXT, -- Código INCRA/CCIR [100]
    caminho_arquivo_car TEXT, -- Armazenamento seguro de PDFs [103]
    caminho_arquivo_ccir TEXT,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. propriedade_clientes (Associação M:N de Coproprietários / Condomínios)
CREATE TABLE IF NOT EXISTS propriedade_clientes (
    propriedade_id INTEGER NOT NULL,
    cliente_id INTEGER NOT NULL,
    quota_participacao DECIMAL(5,2) NOT NULL, -- Quota percentual de cada dono [96]
    PRIMARY KEY (propriedade_id, cliente_id),
    FOREIGN KEY (propriedade_id) REFERENCES propriedades(id) ON DELETE CASCADE,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
    -- Regra de consistência: A soma das quotas de uma propriedade é limitada a 100.00% (Verificada via Trigger/Backend) [96]
    CHECK (quota_participacao > 0 AND quota_participacao <= 100.00)
);

-- 7. matriculas (Escopo Jurídico CRI - Frações de Terra)
CREATE TABLE IF NOT EXISTS matriculas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    propriedade_id INTEGER NOT NULL,
    numero_matricula TEXT NOT NULL,
    denominacao TEXT NOT NULL, -- Lote / Gleba [96]
    cri_comarca TEXT NOT NULL, -- CRI Comarca [96]
    cri_circunscricao TEXT,
    livro_registro TEXT,
    folha_registro TEXT,
    ccir TEXT,
    itr_nirf TEXT,
    valor_itr DECIMAL(12,2),
    area_registrada_ha DECIMAL(12,4) NOT NULL, -- Área Registrada em Hectares [97]
    georreferenciamento_uuid TEXT, -- Certificação Digital SIGEF UUID [96]
    caminho_arquivo_pdf TEXT, -- Certidão da Matrícula [97]
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (propriedade_id) REFERENCES propriedades(id) ON DELETE CASCADE
);

-- 8. matricula_historico_logs (Auditoria de alterações jurídicas)
CREATE TABLE IF NOT EXISTS matricula_historico_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    matricula_id INTEGER NOT NULL,
    campo_alterado TEXT NOT NULL,
    valor_antigo TEXT,
    valor_novo TEXT,
    alterado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (matricula_id) REFERENCES matriculas(id) ON DELETE CASCADE
);

-- 9. levantamentos (Campanhas de Campo vinculando Profissional e Imóvel)
CREATE TABLE IF NOT EXISTS levantamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profissional_id INTEGER NOT NULL,
    propriedade_id INTEGER NOT NULL,
    status_levantamento TEXT CHECK(status_levantamento IN ('EM_ANDAMENTO', 'CONCLUIDO', 'ARQUIVADO')) DEFAULT 'EM_ANDAMENTO',
    data_inicio DATE NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (profissional_id) REFERENCES profissionais(id) ON DELETE CASCADE,
    FOREIGN KEY (propriedade_id) REFERENCES propriedades(id) ON DELETE CASCADE
);

-- 10. pontos (Vértices Geodésicos Medidos e Transladados)
CREATE TABLE IF NOT EXISTS pontos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    levantamento_id INTEGER NOT NULL,
    matricula_id INTEGER NOT NULL,
    nome_vertice TEXT NOT NULL,
    tipo_ponto TEXT NOT NULL, -- 'M' (Marco), 'P' (Ponto), 'V' (Vértice Virtual), 'B' (Base de Campo) [63, 136]
    status_ponto TEXT CHECK(status_ponto IN ('BRUTO', 'CORRIGIDO')) DEFAULT 'BRUTO', -- Estado de rover [86]
    status_correcao TEXT CHECK(status_correcao IN ('BRUTO', 'CORRIGIDO')) DEFAULT 'BRUTO', -- Controle de esteira [109]
    ponto_base_id INTEGER, -- Base de amarração geodésica associada [86]
    arquivo_origem TEXT NOT NULL, -- Chave de agrupamento lógico [109]
    ordem_caminhamento INTEGER, -- Ordem de plotagem da poligonal (Nulo para bases tipo 'B') [63, 64]
    
    -- Coordenadas Brutas de Campo
    n_original REAL NOT NULL,
    e_original REAL NOT NULL,
    alt_original REAL NOT NULL, -- Altitude original de campo
    
    -- Coordenadas Geodésicas e Planas Corrigidas Precisas (SIRGAS 2000)
    lat_corrigido REAL,
    lon_corrigido REAL,
    alt_corrigido REAL, -- Altitude precisa corrigida
    n_corrigido REAL,
    e_corrigido REAL,
    
    -- Sigmas de Precisão (Incertezas Métricas)
    sigma_n REAL,
    sigma_e REAL,
    sigma_alt REAL,
    
    arquivo_resultado_ppp TEXT, -- Nome do arquivo .sum retornado do IBGE-PPP [58]
    origem_homologada INTEGER DEFAULT 0, -- 1 se importado de ODS oficial do SIGEF [67]
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (levantamento_id) REFERENCES levantamentos(id) ON DELETE CASCADE,
    FOREIGN KEY (matricula_id) REFERENCES matriculas(id) ON DELETE CASCADE,
    FOREIGN KEY (ponto_base_id) REFERENCES pontos(id) ON DELETE SET NULL,
    
    -- Restrição de unicidade perimetral de matrícula [38]
    UNIQUE(levantamento_id, matricula_id, nome_vertice, tipo_ponto)
);

-- 11. banco_pontos (Vértices Homologados Importados via SIGEF ODS - Sem restrição única global)
CREATE TABLE IF NOT EXISTS banco_pontos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    levantamento_id INTEGER NOT NULL,
    matricula_id INTEGER NOT NULL,
    planilha_origem TEXT NOT NULL,
    codigo_completo TEXT NOT NULL, -- Ex: CRED-TIPO-NUMERO [136]
    tipo_ponto TEXT CHECK(tipo_ponto IN ('M', 'P', 'V')) NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    altitude REAL NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (levantamento_id) REFERENCES levantamentos(id) ON DELETE CASCADE,
    FOREIGN KEY (matricula_id) REFERENCES matriculas(id) ON DELETE CASCADE,
    -- Restrição unificada composta para suportar pontos compartilhados [136]
    UNIQUE(levantamento_id, planilha_origem, codigo_completo)
);

-- 12. confrontantes (Vizinhos Físicos Lindantes)
CREATE TABLE IF NOT EXISTS confrontantes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    levantamento_id INTEGER NOT NULL,
    nome TEXT NOT NULL,
    cpf_cnpj TEXT,
    cns_confrontante TEXT, -- Código Nacional de Serventias (Cartório CRI) [71, 72]
    nacionalidade TEXT,
    profissao TEXT,
    estado_civil TEXT,
    regime_bens TEXT,
    nome_conjuge TEXT,
    rg_conjuge TEXT,
    cpf_conjuge TEXT,
    endereco TEXT,
    matricula_imovel_confrontante TEXT, -- Isolação cadastral de glebas vizinhas [137]
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (levantamento_id) REFERENCES levantamentos(id) ON DELETE CASCADE
);

-- 13. segmentos (Divisas Físicas Perimetrais entre Vértices)
CREATE TABLE IF NOT EXISTS segmentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    matricula_id INTEGER NOT NULL,
    ponto_inicio_id INTEGER NOT NULL,
    ponto_fim_id INTEGER NOT NULL,
    confrontante_id INTEGER, -- Proprietário vizinho associado ao trecho [91]
    tipo_limite_sigef TEXT, -- cercas, muros, córregos [56]
    metodo_posicionamento_sigef TEXT, -- Ex: PG1, PG2, etc. [56]
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (matricula_id) REFERENCES matriculas(id) ON DELETE CASCADE,
    FOREIGN KEY (ponto_inicio_id) REFERENCES pontos(id) ON DELETE CASCADE,
    FOREIGN KEY (ponto_fim_id) REFERENCES pontos(id) ON DELETE CASCADE,
    FOREIGN KEY (confrontante_id) REFERENCES confrontantes(id) ON DELETE SET NULL
);

-- 14. pendencias (Action Center de Auditoria e Qualidade)
CREATE TABLE IF NOT EXISTS pendencias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    levantamento_id INTEGER NOT NULL,
    categoria TEXT CHECK(categoria IN ('CRÍTICO', 'AVISO')) NOT NULL,
    mensagem TEXT NOT NULL,
    resolvida INTEGER DEFAULT 0 CHECK(resolvida IN (0, 1)),
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (levantamento_id) REFERENCES levantamentos(id) ON DELETE CASCADE
);
```

### 2.2 Banco de Dados Cloud (MySQL - Hostinger Hub)
A tabela simplificada na nuvem, livre de covariâncias pesadas de rampa e dados cadastrais complexos de herdeiros, atua estritamente como um Hub de Consulta Rápida [142, 151]:

```sql
CREATE TABLE imovel_cloud (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome_propriedade VARCHAR(150) NOT NULL,
    municipio VARCHAR(100) NOT NULL,
    uf VARCHAR(2) NOT NULL,
    area_ha DOUBLE NOT NULL,
    status_levantamento VARCHAR(30) DEFAULT 'EM_ANDAMENTO',
    numero_matricula VARCHAR(50) NOT NULL,
    ccir VARCHAR(30),
    limite_perimetral LONGTEXT NOT NULL, -- Polígono formatado em GeoJSON ou WKT em coordenadas WGS84 (EPSG:4326) [142, 151]
    sincronizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

## 3. Esteira de Processamento Geodésico
A esteira digital converte os dados brutos recebidos em campo de forma determinística e precisa [44].

### 3.1 RPA de Conversão GNSS Hi-Target (`ConvertRinex.exe`)
Orquestrado por `converterrinex.py` no ambiente local do Windows, realiza a conversão automática de binários `.GNS` de receptores de campo para o padrão textual internacional RINEX [44, 46].

1.  **Filtro Filesize QC:** Arquivos de tamanho inferior a **50KB** (51.200 bytes) são classificados imediatamente como falhos ou insuficientes (tempo de rastreio nulo), abortando o RPA, gravando o log com status `sucesso = 0` na tabela `historico_rinex` e enviando um alerta crítico ao Action Center [45, 46].
2.  **Fila com Debounce em Lote (`DebouncedHGOConverter`):** Arquivos enviados simultaneamente são acumulados por **4.0 segundos** antes do disparo do robô [46, 82]. Isso previne a abertura de múltiplas janelas concorrentes do HGO e conflitos de foco no Windows OS [46].
3.  **Trava Thread-Safe (`hgo_global_execution_lock`):** Uma trava mútua baseada em `threading.Lock()` blinda o pywinauto contra colisões de execução [46].
4.  **Clipboard de Baixo Nível (`set_clipboard_text`):** Caminhos longos de rede são inseridos na área de transferência usando a WinAPI nativa (`user32.dll` e `kernel32.dll` via `ctypes`) em formato Unicode, evitando quebras de aspas ou limites de tamanho de comandos de console [46].
5.  **Anos Dinâmicos:** A varredura de arquivos convertidos utiliza a expressão regular:
    `re.match(r'^\.\d{2}[ong]$', ext)`
    Isso possibilita o suporte dinâmico a arquivos de anos futuros (ex: `.25o`, `.26o`) superando limites de listas estáticas [46].
6.  **Cópia Precoce (Inversão de Ordem):** O sistema copia os arquivos gerados para a pasta `/Rinex` de destino **enquanto o HGO permanece aberto e estável**, impedindo que o software destrua os dados temporários ao finalizar [46].
7.  **Espera de Buffer:** O robô aguarda um delay fixo de **5.0 segundos** para garantir a estabilização física do buffer de gravação no HD antes do encerramento forçado do HGO (`window.close()` / `taskkill`) [46].

### 3.2 Extração de Metadados RINEX e Fallback de Fim de Rastreio
O módulo `business/triagem_inteligente.py` intercepta arquivos RINEX e extrai seus metadados sem processar binários pesados de campo [47].

*   **Leitura de Cabeçalho:** Lê sequencialmente até a flag `END OF HEADER`, extraindo: `MARKER NAME` (identificação de vértice de campo), `APPROX POSITION XYZ` e `TIME OF FIRST OBS` [47].
*   **Algoritmo Fallback `TIME_OF_LAST_OBS` (Seek Reverso):** Para arquivos que não gravam a data final no cabeçalho, o sistema calcula o tamanho físico do arquivo e salta o ponteiro de leitura (`seek`) para os **últimos 8KB de dados**, prevenindo crash de I/O em arquivos pesados [47].
    *   No **RINEX 3**, busca as linhas que iniciam com o caractere especial `>`.
    *   No **RINEX 2**, aplica fatiamento fixo de strings: `linha[0:3]`, `linha[3:6]`, etc., localizando o último registro de satélite registrado [47].

### 3.3 Agrupamento Temporal Dinâmico (Organizador HGO)
O método `organizar_rastreios` categoriza as coletas para importação em lote [48]:
1. Ordena os arquivos pela duração calculada em segundos de forma decrescente [48].
2. Arquivos com duração igual ou superior a **3.600 segundos (1 hora)** são eleitos como **Bases Estáticas de Apoio** [48].
3. Associa Rovers Estáticos ($R$) à sua respectiva Base ($B$) se, e somente se, o intervalo do Rover estiver contido inteiramente no período da Base:
   $$\text{Inicio}_{Base} \le \text{Inicio}_{Rover} \quad \text{e} \quad \text{Fim}_{Base} \ge \text{Fim}_{Rover}$$ [48]
4. Exporta uma pasta unificada organizada `Pronto_HGO_Base_[marcador]_[AAAAMMDD]/` contendo arquivos RINEX de Base, Rovers vinculados e binários originais `.GNS` [48].

### 3.4 Pós-Processamento IBGE-PPP
O processamento científico automatizado é executado por `business/ppp_processor.py` [49].

*   **Submissão API HTTP:** Envia requisição HTTP POST Multipart contendo o arquivo RINEX compactado para o IBGE com desativação de SSL e timeout expandido de **120 segundos** [50]. Retorna o arquivo `.ZIP` de processamento e inicia o parsing do relatório `.sum` para ler coordenadas SIRGAS 2000 precisas e desvios padrão (Sigmas) [50, 52].
*   **Robô de Contingência (Selenium Webbot):** Se a API governamental falhar, aciona um Selenium WebDriver instanciando Chrome Headless com download automático direcionado para a pasta física do projeto [51]. Injeta caminhos de arquivo, e-mail comercial, modelo de antena de tripé e aciona o processamento estático, varrendo a pasta física em loop por até **10 minutos** à procura da conclusão de novos arquivos `.crdownload` ou do pacote `.ZIP` concluído [51].
*   **Aviso de Decomissionamento Temporário:** Por questões de estabilidade do servidor governamental, o acionamento assíncrono automático durante a ingestão (`run_ppp_task`) foi desativado reativamente, mantendo o código comentado para permitir o disparo manual por demanda do operador na aba dedicada da Ribbon [46].

---

## 4. O Motor Geodésico Matemático
O núcleo geométrico calcula translações tridimensionais elipsoidais e espaciais no elipsoide de referência oficial **SIRGAS 2000 / GRS80** ($a = 6378137.0\text{ m}$, $f = 1/298.257222101$) [43, 53].

### 4.1 Conversão Geocêntrica Tridimensional ECEF $\leftrightarrow$ Geodésica
*   **Geodésico para ECEF (`geodesic_to_ecef`):** Converte a coordenada angular $(\phi, \lambda, h)$ para coordenadas cartesianas tridimensionais $(X, Y, Z)$ [54]:
    $$N = \frac{a}{\sqrt{1 - e^2 \sin^2\phi}}$$
    $$X = (N + h) \cos\phi \cos\lambda$$
    $$Y = (N + h) \cos\phi \sin\lambda$$
    $$Z = \left(N(1 - e^2) + h\right) \sin\phi$$

*   **ECEF para Geodésico (`ecef_to_geodesic`):** Converte $(X, Y, Z)$ de volta ao elipsoide utilizando o **Algoritmo de Bowring**, garantindo precisão sub-milimétrica em apenas uma iteração ao redor do território nacional [54].

### 4.2 Translação Plana UTM (Método do Vetor Delta)
Para garantir coerência estrita de campo e preservar as distâncias planas de desenho técnico medidas pelas antenas em campo (essencial para posterior desenho no AutoCAD/TopoCAD 2000), a translação é propagada através do vetor Delta projetado [55, 89]:

1.  Projeta as coordenadas da Base processadas no IBGE-PPP de Geodésica SIRGAS 2000 para coordenadas planas UTM Zone 22S (EPSG:31982) via `pyproj` [55]:
    $$(\text{Lon}_{Base\_Corr}, \text{Lat}_{Base\_Corr}) \xrightarrow{\text{pyproj}} (E_{Base\_Corr}, N_{Base\_Corr})$$
2.  Calcula o vetor Delta de deslocamento linear do marco [55]:
    $$\Delta_E = E_{Base\_Corr} - E_{Original\_Base}$$
    $$\Delta_N = N_{Base\_Corr} - N_{Original\_Base}$$
    $$\Delta_H = H_{Base\_Corr\_PPP} - H_{Original\_Base}$$
3.  Propaga e translada em bloco todos os pontos Rovers ($i$) que apontem seu `ponto_base_id` para a Base [55]:
    $$E_{Corrigido, i} = E_{Original\_Rover, i} + \Delta_E$$
    $$N_{Corrigido, i} = N_{Original\_Rover, i} + \Delta_N$$
    $$H_{Corrigido, i} = Alt_{Original\_Rover, i} + \Delta_H$$
4.  Realiza a projeção reversa tridimensional das coordenadas planas transladadas de volta para coordenadas geodésicas SIRGAS 2000 $(\phi, \lambda)$ persistindo no SQLite com `status_correcao = 'CORRIGIDO'` e calculando a composição quadrática dos desvios padrão (Sigmas) [55]:
    $$\sigma_{final} = \sqrt{\sigma_{rover}^2 + \sigma_{base}^2}$$ [41]

---

## 5. Algoritmo de Topologia Perimetral e Fechamento
A poligonal do perímetro da matrícula é gerada de forma puramente determinística pelo método `reordenar_perimetro_matricula` no sentido horário exigido na norma do INCRA [56].

1.  **Identificação do Extremo Norte:** Varre os pontos e elege o vértice com a **Maior Latitude (Norte)**. Se houver empate absoluto, adota o vértice localizado mais a **Leste (Maior Longitude)**. Elege-lo-á como o Ponto de Partida ($P_1$) da poligonal [56].
2.  **Cálculo da Orientação de Gauss (Shoelace):** Projeta temporariamente as coordenadas em UTM local baseada na longitude média e computa a área direcionada [56]:
    $$2 \times \text{Área} = \sum_{i=1}^{n} (E_i \times N_{i+1}) - (E_{i+1} \times N_i)$$
    *   Se a $\text{Área} > 0$, a poligonal está orientada no sentido anti-horário. O motor inverte a lista inteira de pontos [56].
    *   Se a $\text{Área} \le 0$, a poligonal já se encontra orientada no sentido horário correto [56].
3.  **Rotação Cíclica:** Rotaciona ciclicamente os índices da lista para que $P_1$ ocupe a posição inicial `index = 0` [56].
4.  **Preservação das Divisas Históricas:** Salva temporariamente em cache na memória (`confrontante_manager.py`) os confrontantes, limites e métodos de posicionamento associados a cada segmento daquela matrícula [56].
5.  **Reconstrução Atômica:** Abre uma transação isolada no SQLite, limpa a tabela `segmentos` da matrícula e insere as novas divisas sequencialmente de $P_n \to P_{n+1}$ [56]. O segmento de encerramento fecha a poligonal conectando o último ponto de volta ao ponto inicial ($P_{last} \to P_1$) [56]. Cruza as IDs físicas e restaura os confrontantes salvos em cache de forma invisível [56].

---

## 6. Algoritmos de Integração Avançados
### 6.1 Integração de Shapefiles e Cálculo de Faixa de Fronteira (Módulo 8)
*   **Descompactação In-Memory:** Arquivos `.ZIP` enviados para o endpoint de fronteira da matrícula são extraídos em memória (`io.BytesIO` e `zipfile`) limpando componentes residuais anteriores no disco antes de gravar os arquivos `.shp`, `.shx`, `.dbf`, `.prj` [104].
*   **Projeção Reversa:** Lê as feições espaciais com `pyshp`. Se os valores de coordenadas absolutos excederem $10000.0$, assume coordenadas Planas UTM Zone 22S (EPSG:31982) e executa a projeção reversa via `pyproj` para Geodésica SIRGAS 2000 (EPSG:4674) [104].
*   **Fórmula do Inverso Elipsoidal (pyproj.Geod):** Utiliza o elipsoide GRS80 para calcular a menor distância elipsoidal rigorosa a partir de cada coordenada geométrica até a divisa internacional (Brasil-Paraguai) na coordenada de divisa fixa:
    $$\text{Latitude Fixo: } -24.0671222 \quad \text{e} \quad \text{Longitude Fixo: } -54.2868778$$ [104]
    Elege a menor distância absoluta em quilômetros com 3 casas decimais [104].
*   **Fallback Determinístico de Banco:** Se não houver Shapefile, varre todos os pontos com estado `CORRIGIDO` dos levantamentos ativos daquela propriedade no banco de dados SQLite, calculando a menor distância de cada ponto até a coordenada fixa [104].

### 6.2 Parsing Nativo de Relatórios ODS SIGEF / INCRA
*   **Extrator XML In-Memory:** Abre o arquivo `.ods` utilizando o pacote nativo `zipfile` para extrair e decodificar o arquivo estruturado interno `content.xml` em UTF-8 [66].
*   **Regex Geodésica:** Captura códigos credenciados aprovados correspondentes ao credenciamento do profissional cadastrado [66]:
    $$\text{Regex: } \text{re.compile(rf"\b(\{re.escape(codigo\_credenciado)\})-(M|P|V)-(\backslash d+)\backslash b", re.IGNORECASE)}$$ [66]
    Desduplica os registros e os persiste transacionalmente na tabela `banco_pontos` associando à matrícula e levantamento ativos [66, 67].

### 6.3 Resolução O(1) de Confrontantes e Normalização Fonética
Para mitigar duplicidades causadas por caracteres acentuados (como "João da Silva" vs "JOAO DA SILVA") [72]:
1.  **Normalização Fonética:** Remove acentuações e converte strings em caixa alta [73]:
    `unicodedata.normalize('NFKD', texto).encode('ASCII', 'ignore').decode().upper().strip()`
2.  **Passo Único com Cache:** Carrega em dicionários de memória todos os confrontantes do levantamento [73]. A amarração de novas divisas consome o dicionário na memória de forma direta, garantindo desempenho constante de complexidade temporal $O(1)$ sem redundância de I/O em SQL [73].
3.  **Isolamento por Matrícula:** Se a matrícula confrontante for diferente (ex: "Matrícula 1234" e "Matrícula 5678"), mantém registros separados de confrontante no banco, evitando fusão incorreta de proprietários limítrofes lindeiros distintos que compartilhem o mesmo nome fonético [137].
