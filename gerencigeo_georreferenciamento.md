# 🛰️ GerenciGeo — Manifesto do Motor Geodésico e Especificação de Georreferenciamento Avançado
**Padrão Metrológico:** Rigor Elipsoidal Científico e Automação de Campo (Field-to-Finish)
**Versão do Documento:** 1.0.0
**Status do Módulo:** Homologado e Consolidado

Este documento detalha a arquitetura lógica, as equações matemáticas, o fluxo físico de dados no Windows e a interface gráfica (UI) do motor de **Georreferenciamento** do **GerenciGeo**. Ele atua como guia de referência técnica absoluta para desenvolvedores e agentes de IA sobre as rotinas espaciais do sistema.

---

## 1. Princípios e Padrões Geodésicos do Ecossistema

Toda a infraestrutura matemática e cartográfica do GerenciGeo é construída sobre padrões internacionais de alta exatidão física e jurídica. O sistema atua de forma determinística, banindo aproximações planas simplistas que possam comprometer a homologação de plantas e planilhas no SIGEF / INCRA.

### A. Sistemas de Referência e Projeções Oficiais
*   **Formato Plano de Trabalho (AutoCAD UTM Default):** Adota rigidamente a projeção **SIRGAS 2000 / UTM Zone 22S (EPSG:31982)** com elipsoide de referência GRS80 e Meridiano Central 51° W para compatibilidade direta e imediata com os templates de desenho técnico e tabelas do AutoCAD/TopoCAD 2000.
*   **Formato Geográfico de Validação e Assinatura:** Utiliza o datum geocêntrico oficial **SIRGAS 2000 (EPSG:4674)** em coordenadas geodésicas (Latitude e Longitude em graus decimais), padrão estrito para plotagem Leaflet no frontend, laudos de faixa de fronteira e assinaturas eletrônicas do SIGEF.
*   **Modelo de Altitude:** Altitudes Elipsoidais (h) em metros para processamento geométrico espacial, com suporte a translações ortométricas baseadas no modelo geoidal vigente.

---

## 2. Esteira de Ingestão e Conversão Híbrida

O primeiro estágio do georreferenciamento reside no recebimento dos arquivos brutos coletados em campo pelos receptores GNSS de rampa e sua preparação na esteira digital:

```
[ARQUIVOS BRUTOS DE CAMPO]
   - Receptor GNSS (.GNS)
   - Cadernetas RTK (.TXT)
                 |
                 v
     [ESTEIRA DE INGESTÃO]
    - gnss_worker.py (QC)
           - < 50KB? (REJEITA)
           - >= 50KB? (ACEITA)
                 |
                 v
     [DEBOUNCE DE INGESTÃO (4s)]
    - DebouncedHGOConverter (Lote)
    - hgo_global_execution_lock
                 |
                 v
      [RPA CONVERTRINEX]
    - converterrinex.py (Auto)
    - set_clipboard_text (ctypes)
    - Hi-Target ConvertRinex.exe
                 |
                 v
   [ARQUIVOS RINEX GERADOS]
     - Cópia ativa (HGO Aberto)
     - Estabilização (5.0s)
     - Fechamento & Limpeza
```

### A. Filtro e Controle de Qualidade de Campo (QC)
No arquivo `business/gnss_worker.py` e `business/triagem_inteligente.py`, o sistema intercepta todos os carregamentos na pasta `/Brutos` aplicando a seguinte barreira:
*   **Filesize QC:** Arquivos de tamanho inferior a **50KB** (51.200 bytes) são identificados como corrompidos ou insuficientes (tempo de rastreio nulo ou falha na gravação do receptor). O pipeline rejeita a conversão e sinaliza o arquivo como falho gravando o log com `sucesso = 0` na tabela `historico_rinex`, movendo-o para a lista de alertas para análise humana.

### B. O RPA do Conversor Hi-Target (ConvertRinex.exe)
Gerenciado por `converterrinex.py`, o sistema orquestra a automação do utilitário `ConvertRinex.exe` (instalado por padrão sob `C:\Program Files (x86)\Hi-Target Geomatics Office\bin\ConvertRinex.exe`):
1. **Debounce e Agrupamento em Lote (`DebouncedHGOConverter`):** Para evitar que múltiplos arquivos GNS enviados em rajada pelo frontend abram várias instâncias concorrentes do HGO conflitando focos de tela no Windows, a API implementa uma fila com debounce de **4.0 segundos**. Os arquivos são acumulados em um set temporário por levantamento. Quando a ingestão cessa por 4.0 segundos, a fila dispara uma única automação do HGO contendo todos os arquivos acumulados, processando-os em lote.
2. **Fila de Exclusão Mútua Thread-Safe (`hgo_global_execution_lock`):** Uma trava do tipo `threading.Lock()` global envolve o processo de automação, enfileirando de forma segura requisições sequenciais do HGO e blindando o sistema contra quebras do pywinauto.
3. **Injeção de Área de Transferência via WinAPI Baixo Nível (`set_clipboard_text`):** Em vez de executar comandos do PowerShell (que sofrem com truncamento de texto, quebras de aspas simples e limitação de comprimento do CMD ao lidar com dezenas de arquivos), o robô usa a API nativa do Windows (`user32.dll` e `kernel32.dll` via `ctypes`) abrindo e inserindo os caminhos no clipboard em formato unicode de forma atômica e instantânea.
4. **Varredura Expandida em Subdiretórios (Anos Dinâmicos):** O localizador de arquivos convertidos varre a Área de Trabalho e todas as pastas de primeiro nível à procura de projetos temporários do HGO (suportando a pasta `Rinex` interna dos mesmos). A identificação de extensões Rinex utiliza expressões regulares (`re.match(r'^\.\d{2}[ong]$', ext)`) para suportar anos dinâmicos e variáveis sem ponto entre o ano e a letra (ex: `.25o`, `.26o`, `.25n`, `.26g`), superando a lista fixa legada que cobria apenas até o ano de 2024 (`.24o`).
5. **Inversão da Ordem de Encerramento (Cópia Precoce):** Para evitar que o HGO apague arquivos temporários de conversão ao se fechar, o robô realiza a cópia dos arquivos convertidos encontrados para a pasta `/Rinex` do workspace **enquanto o HGO permanece aberto e estável**.
6. **Espera de Gravação de Disco (Buffers de E/S):** O robô aguarda um delay técnico fixo de **5.0 segundos** (`time.sleep(5.0)`) mantendo a janela do HGO aberta para estabilização de buffers físicos no HD.
7. **Fechamento e Limpeza**: Somente após o delay o HGO é finalizado via `janela.close()` / `taskkill`, e as pastas de projeto e arquivos residuais da Área de Trabalho são eliminados de forma limpa.
8. **Desativação do Fluxo IBGE-PPP Automático**: A submissão automática da Base recém-convertida para o IBGE-PPP foi desativada temporariamente no backend (`run_ppp_task`) e no frontend (`mesa_trabalho.ts`), mantendo o código comentado para fins de auditoria histórica e permitindo que o operador decida quando disparar o PPP manualmente via aba dedicada.

---

## 3. Mesa de Triagem Espacial e Organizador HGO

Uma vez gerados os arquivos RINEX temporários, o módulo `business/triagem_inteligente.py` atua como um triador automatizado, organizando os rastreios com base em metadados cronológicos reais contidos nos cabeçalhos de observação.

### A. Algoritmo de Extração de Metadados RINEX (`ler_metadados_rinex`)
1. **Barreira de Segurança:** Bloqueia a leitura direta de binários pesados (`.GNS`, `.ZHD`), forçando o parsing estritamente em arquivos textuais RINEX.
2. **Leitura de Cabeçalho:** O parser lê as colunas oficiais do formato de forma sequencial até atingir a linha `END OF HEADER`, extraindo:
   - `MARKER NAME`: Identificação nominal dada ao marco em campo.
   - `APPROX POSITION XYZ`: Coordenadas cartesianas geocêntricas aproximadas da coleta. O sistema converte essas coordenadas em tempo de execução para Latitude e Longitude geodésicas (SIRGAS 2000) por meio da função `xyz_to_llh` para plotagem provisória no mapa.
   - `TIME OF FIRST OBS`: Data e hora inicial exata do rastreio.
3. **Algoritmo Fallback de Fim de Rastreio (`TIME OF LAST OBS`):** Muitos receptores não gravam a data final no cabeçalho. Para resolver isso, o sistema implementa um leitor reverso de alta performance:
   - Abre o arquivo, calcula seu tamanho físico e salta o ponteiro de leitura (`seek`) para os últimos **8KB** de dados para evitar estouro de memória (crash de I/O) em arquivos pesados.
   - Para arquivos **RINEX 3**, busca as linhas iniciadas com o caractere especial `> `.
   - Para arquivos **RINEX 2**, aplica um fatiamento rígido de strings (`linha[0:3]`, `linha[3:6]`, etc.) garantindo o resgate preciso do último registro temporal de satélite gravado.

### B. Algoritmo de Agrupamento Temporal Dinâmico (Organizador HGO)
O método principal `organizar_rastreios` analisa e categoriza em lote os arquivos observados segundo a heurística de proximidade temporal de campo:
1. **Ordenação de Duração:** Todos os arquivos analisados são ordenados de forma decrescente pela sua duração total calculada em segundos (`duracao = fim - inicio`).
2. **Eleição de Bases:** Arquivos que possuam duração igual ou superior a **3.600 segundos (1 hora)** são qualificados automaticamente como **Bases Estáticas de Apoio** do levantamento. Na ausência de arquivos longos, o arquivo com a maior duração absoluta do lote é eleito como a Base provisória.
3. **Associação Ativa dos Rovers:** O sistema varre os arquivos de menor duração (Rovers Estáticos) e os associa de forma inteligente à Base correspondente. Um arquivo Rover $R$ é vinculado a uma Base $B$ se, e somente se, o seu intervalo de tempo de coleta estiver inteiramente contido dentro do período operacional daquela Base:
   $$Inicio_{Base} \le Inicio_{Rover} \quad \text{e} \quad Fim_{Base} \ge Fim_{Rover}$$
4. **Exportação HGO Limpa:** Para cada grupo "Base + Rovers Vinculados", o sistema gera uma pasta física unificada sob `/Processados` chamada `Pronto_HGO_Base_[marcador]_[AAAAMMDD]/`. O triador copia fisicamente o arquivo RINEX da Base, seus respectivos arquivos Rovers associados, e localiza e copia os arquivos binários originais `.GNS` de campo correspondentes a partir do diretório raiz. Isso prepara o lote perfeito para que o operador simplesmente arraste a pasta para dentro do software Topcon Tools / HGO sem necessidade de triagem manual.

---

## 4. O Pipeline Científico IBGE-PPP

Para obter a precisão centimétrica exigida por lei nos marcos de apoio (vértices tipo 'M'), o GerenciGeo possui um automatizador integrado com o serviço científico de pós-processamento geodésico do IBGE (IBGE-PPP). O processador está estruturado sob `business/ppp_processor.py`.

```
[ARQUIVO RINEX BASE (.obs)]
            |
            +------------> [TENTATIVA 1: API HTTP MULTIPART]
            |              Submete POST com e-mail e antena
            |              Sucesso? Salva resultado .zip e extrai .sum
            |
            v (FALHA?)
  [TENTATIVA 2: CONTINGÊNCIA SELENIUM]
    - Abre WebDriver Chrome (Headless opcional)
    - Navega na URL do IBGE-PPP
    - Injeta arquivo, seleciona Antena "HITV60 NONE"
    - Clica em Processar e monitora pasta de downloads
    - Aguarda .zip e finaliza processo de forma transparente
```

### A. Submissão Automatizada via API HTTP
O processador faz uma requisição HTTP POST multi-part enviando o arquivo RINEX (`.o` ou `.obs`) comprimido ou íntegro para o endpoint oficial do IBGE (`IBGE_PPP_URL`), passando os parâmetros configurados em `config.py`:
- `email`: e-mail comercial do profissional técnico.
- `modelo_antena`: antena cadastrada padrão (ex: `HITV60 NONE`).
- `altura_antena`: `0.000` metros (coleta em tripé centrado de altura calibrada).
- `tipo_lev`: `estatico`.

Para tolerar conexões instáveis e a oscilação do servidor governamental, a chamada HTTP possui desativação ativa de verificação SSL corporativa e um timeout expandido de **120 segundos**. Ao retornar sucesso (`200 OK`), o sistema captura o binário retornado, salva o arquivo `.ZIP` na pasta `/Processados` correspondente e inicia a extração de dados.

### B. Robô de Contingência Avançada (Selenium Webbot)
Se a API direta do IBGE estiver indisponível ou retornar erro, o sistema aciona de forma reativa a contingência ativa por automação de navegador (`_enviar_via_selenium`):
1. **Configuração do Driver:** Instancia um driver Selenium Chrome (`webdriver.Chrome`) configurando um perfil de download seguro automático direcionado para a pasta física de processamento do projeto (`prefs = {"download.default_directory": abs_pasta_saida}`).
2. **Navegação e Input:** Acessa a interface web oficial do IBGE-PPP (`IBGE_PPP_WEB_URL`), localiza a tag de upload (`By.ID, "arquivo"`) e injeta o caminho absoluto do arquivo RINEX. Preenche o e-mail, seleciona o tipo de processamento "estático" e seleciona o modelo de antena no combobox.
3. **Comportamento Humano Simulador:** Clica no botão "Processar".
4. **Monitorador de Downloads Ativo:** O robô inicia uma rotina de escuta em loop (timeout de **10 minutos**) varrendo a pasta física de destino à procura de novos arquivos temporários de download do Chrome (`.crdownload`) ou arquivos `.zip` concluídos. Ao detectar a conclusão do arquivo compactado, o driver é destruído de forma segura (`driver.quit()`) e o fluxo de extração é retomado sem que o usuário perceba a falha na API.

### C. Parser do Relatório PPP Científico (`business/result_parser.py`)
Ao extrair o pacote `.ZIP` enviado pelo IBGE, o sistema localiza o relatório científico de processamento de extensão `.sum`. O parser abre este arquivo e realiza uma varredura nominal por expressões regulares para ler e persistir no SQLite:
- Latitude, Longitude e Altitude precisas corrigidas (Datum SIRGAS 2000).
- Desvios Padrão calculados (Sigma Latitude, Sigma Longitude, Sigma Altitude) em metros.
- Período de rastreio processado e número de satélites utilizados.

---

## 5. Motor Geodésico de Translação e Vetor Delta

Para propagar a exatidão centimétrica da Base (pós-processada cientificamente via IBGE-PPP) para todos os pontos coletados pelos Rovers em campo, o GerenciGeo aplica uma translação espacial tridimensional contida em `business/geoprocessamento.py`.

### A. Conversão Rigorosa ECEF $\leftrightarrow$ Geodésica (Bowring e Elipsoide GRS80)
Para transladar coordenadas no espaço tridimensional sem introduzir distorções angulares em grandes distâncias, o sistema realiza conversões geométricas no elipsoide oficial **GRS80 / SIRGAS 2000** ($a = 6378137.0$m, $f = 1/298.257222101$):
*   **Geodésico para ECEF (`geodesic_to_ecef`):** Converte a coordenada geodésica $(\phi, \lambda, h)$ para coordenadas cartesianas geocêntricas $(X, Y, Z)$:
    $$N = \frac{a}{\sqrt{1 - e^2 \sin^2\phi}}$$
    $$X = (N + h) \cos\phi \cos\lambda$$
    $$Y = (N + h) \cos\phi \sin\lambda$$
    $$Z = \left(N(1 - e^2) + h\right) \sin\phi$$
*   **ECEF para Geodésico (`ecef_to_geodesic`):** Converte $(X, Y, Z)$ tridimensionais de volta para $(\phi, \lambda, h)$ usando o consagrado **Algoritmo de Bowring**, garantindo precisão sub-milimétrica após apenas uma iteração em qualquer coordenada do território nacional.

### B. Translação Plana Rigorosa UTM (Método do Vetor Delta)
Para manter a coerência estrita de campo e preservar as distâncias planas medidas pelos aparelhos (essencial para posterior aprovação no SIGEF), o motor geodésico propaga a correção através do vetor Delta projetado em UTM (`corrigir_rovers_em_bloco`):
1. **UTM da Base Corrigida:** Projetará a coordenada precisa da Base (Lat/Lon processada do PPP) em coordenadas Planas UTM Zone 22S:
   $$(Lon_{Base\_Corr}, Lat_{Base\_Corr}) \xrightarrow{pyproj} (E_{Base\_Corr}, N_{Base\_Corr})$$
2. **Cálculo do Vetor Delta Plano:** Subtrai as coordenadas originais brutas (de campo) da Base das coordenadas precisas convertidas:
   $$\Delta_E = E_{Base\_Corr} - E_{Original\_Base}$$
   $$\Delta_N = N_{Base\_Corr} - N_{Original\_Base}$$
   $$\Delta_H = H_{Base\_Corr\_PPP} - H_{Original\_Base}$$
3. **Propagação em Lote para os Rovers:** Varre todos os Rovers que possuam o campo `ponto_base_id` apontado para a Base correspondente e aplica a translação constante:
   $$E_{Corrigido} = E_{Original\_Rover} + \Delta_E$$
   $$N_{Corrigido} = N_{Original\_Rover} + \Delta_N$$
   $$H_{Corrigido} = Alt_{Original\_Rover} + \Delta_H$$
4. **Projeção Reversa:** Converte as coordenadas planas corrigidas e a altitude transladada de volta para coordenadas geodésicas SIRGAS 2000 decodificadas $(\phi, \lambda)$ e atualiza as colunas `lat_corrigido`, `lon_corrigido` e `alt_corrigido` no SQLite. Salva também o vetor aplicado e os novos sigmas de precisão calculados.

---

## 6. Algoritmo de Topologia Perimetral e Fechamento de Polígono

A geração da poligonal do imóvel fundiário no GerenciGeo é controlada de forma puramente determinística pelo método `reordenar_perimetro_matricula`. O algoritmo reconstrói a topologia perimetral aplicando as normas técnicas do INCRA de caminhamento no sentido horário.

```
                  [VÉRTICES DA MATRÍCULA NO SQLite]
                                 |
                                 v
                 [1. IDENTIFICA EXTREMO NORTE (P1)]
             Maior Latitude (Desempate mais a Leste)
                                 |
                                 v
                [2. CALCULA ORIENTAÇÃO SHOELACE]
            UTM Dinâmico -> Área com Sinal (Gauss)
                                 |
           +---------------------+---------------------+
           v                                           v
    [ÁREA COM SINAL > 0]                        [ÁREA COM SINAL < 0]
      (Sentido Anti-horário)                      (Sentido Horário)
           |                                           |
           v                                           v
   [INVERTE LISTA DE PONTOS]                   [MANTÉM ORIENTAÇÃO]
           |                                           |
           +---------------------+---------------------+
                                 |
                                 v
                   [3. ROTAÇÃO CÍCLICA CIRCULAR]
             Garante P1 (Extremo Norte) no índice 0
                                 |
                                 v
                  [4. PRESERVAÇÃO DE DADOS DE VIZINHOS]
           Mapeia confrontantes e limites preexistentes
                                 |
                                 v
                 [5. RECONSTRUÇÃO EM TRANSAÇÃO ATÔMICA]
            - Limpa tabela 'segmentos' da matrícula
            - Insere novos segmentos ligando P_i -> P_{i+1}
            - Fechamento obrigatório: P_last -> P_1
```

### A. Algoritmo de Ordenação e Topologia Perimetral
1. **Identificação do Extremo Norte:** Varre todos os pontos da matrícula e identifica o vértice mais ao Norte (Maior Latitude). Em caso de empate absoluto de latitude, adota como desempate a maior longitude (ponto localizado mais a Leste/direita). Este vértice será forçado como o **Ponto de Partida ($P_1$)** da poligonal.
2. **Cálculo da Orientação de Gauss (Shoelace):** Projetará temporariamente os pontos em uma projeção UTM dinâmica baseada na longitude média da fazenda para evitar distorções de escala. Em seguida, calcula a área direcionada do polígono via polinômio de Shoelace:
   $$2 \times \text{Área} = \sum_{i=1}^{n} (E_i \times N_{i+1}) - (E_{i+1} \times N_i)$$
   - Se a área direcionada calculada for **positiva ($\text{Área} > 0$)**, a poligonal está orientada no sentido **anti-horário**. O sistema inverte automaticamente a ordem de toda a lista de pontos.
   - Se for **negativa**, a poligonal já se encontra no sentido **horário** correto e a ordem é preservada.
3. **Rotação Cíclica (Circular Shift):** Rotaciona ciclicamente os índices da lista de pontos para que o vértice extremo norte ($P_1$) passe a ocupar o índice `0` da lista.
4. **Preservação de Limites e Confrontantes Históricos:** Antes de purgar as divisas antigas, o sistema salva em cache um mapa contendo o `confrontante_id`, `tipo_limite_sigef` (muros, cercas, rios) e `metodo_posicionamento_sigef` vinculados a cada divisa.
5. **Reconstrução com Fechamento Estrito:** Abre uma transação atômica protegida no SQLite, deleta todos os registros da tabela `segmentos` atrelados àquela matrícula e insere as novas divisas sequencialmente ligando $P_n \to P_{n+1}$. O último segmento do loop é obrigatoriamente fechado conectando o Ponto Final de volta ao Ponto Inicial ($P_{last} \to P_1$). Durante a inserção, o sistema cruza as IDs dos pontos inicial/final e reinsere de forma invisível as informações históricas de confrontantes e limites salvas no passo anterior, evitando retrabalho do topógrafo.

---

## 7. Action Center (Alertas de Integridade e Fuso UTM)

A inteligência de validação em tempo real reside em `business/triagem_inteligente.py` (`gerar_alertas_integridade`), atuando como um auditor ativo de qualidade e alertando o profissional técnico sobre erros de campo ou cadastrais.

### A. Auditoria Ativa de Fuso UTM Geográfico
Para evitar o erro clássico de plotação onde a esteira do receptor de campo é configurada em um Meridiano Central incorreto, o sistema realiza um cálculo determinístico de integridade espacial:
1. O sistema obtém as coordenadas geodésicas de todos os pontos cadastrados e calcula a **Longitude Média** do levantamento:
   $$\lambda_{media} = \frac{1}{m} \sum_{k=1}^{m} \lambda_k$$
2. A partir da longitude média derivada, calcula o Fuso UTM Geográfico Real correspondente ao imóvel no globo:
   $$\text{Fuso Derivado} = \text{int}\left( \frac{\lambda_{media} + 180}{6} \right) + 1$$
3. Em seguida, deriva a coordenada do Meridiano Central correspondente:
   $$MC_{\text{Derivado}} = (\text{Fuso Derivado} \times 6) - 183$$
4. O sistema cruza este fuso derivado com o fuso geográfico padrão local configurado no projeto (Zone 22S / MC 51 W). Se houver divergência (ex: a fazenda está localizada na Zona 21S mas o projeto está setado na Zona 22S), o Action Center emite um alerta de integridade crítico com o ícone de bússola (`compass`):
   `"Levantamento [ID]: Fuso UTM derivado (21 - MC 57 W) difere do fuso configurado no HGO (22 - MC 51 W)."`
*   **QC do Arquivo (< 50KB):** Alerta crítico se houver arquivos de rinex com tamanho abaixo de 50KB ou falhas de processamento registradas.
*   **Fluxo Incompleto (Rinex sem PPP):** Alerta se houver vértice importado com arquivo RINEX associado na tabela `pontos` mas cuja coluna `arquivo_resultado_ppp` estiver nula (processamento pendente).
*   **Divisa sem Confrontante:** Alerta se houver segmentos na matrícula sem confrontante (vizinho) atrelado.
*   **Ponto Órfão:** Alerta se houver pontos cadastrados no levantamento que não foram incluídos em nenhuma divisa ou segmento de caminhamento (vértices soltos no mapa).
*   **Arquivos Brutos Pendentes:** Alerta se existirem arquivos binários `.GNS` em `/Brutos` que ainda não possuam arquivo correspondente convertido em `/Rinex` (indicativo de que a esteira precisa ser acionada).

## 8. Interface Visual e Controle na UI

A operação diária, a gestão e a visualização do georreferenciamento avançado ocorrem de forma integrada no frontend Web através de uma interface de alto padrão baseada em Glassmorphism, carregamentos reativos e desacoplamento radical de views.

### A. Layout Global e Arquitetura do Painel Principal (principal.html)
- **Estruturação Física em Português (`principal.html`):** Para maior clareza e manutenção imediata no repositório, o arquivo de layout real do sistema foi nomeado como `principal.html`. O arquivo inicial `index.html` atua estritamente como um redirecionador invisível e instantâneo via tags `<meta refresh>` e scripts de redirecionamento, mantendo compatibilidade nativa com o servidor de desenvolvimento do Vite.
- **Remoção Completa do Cabeçalho Superior (Headerless Experience):** O antigo `<header>` que exibia o breadcrumb e a barra de status do sistema foi fisicamente desativado e removido. Isso gerou um ganho de 64px verticais que foram integralmente devolvidos à área útil do aplicativo (especialmente benéfico para a visualização dos mapas Leaflet e as tabelas na mesa de trabalho).
- **Roteamento Desacoplado Robustecido (`main.ts`):** O método de roteamento `navigate` no frontend foi reconfigurado para tratar o elemento de breadcrumb de forma opcional (`if (breadcrumbCurrent)`), evitando quebras na execução das views na ausência física do cabeçalho.
- **Barra Lateral Ultra-Compacta (`aside#sidebar`):**
  - **Modo Aberto:** Largura reduzida de `w-64` (256px) para `w-56` (224px).
  - **Modo Colapsado:** Largura de repouso reduzida de `76px` para `60px` com paddings laterais ajustados de `12px` para `8px` (`p-4` a `px-2`).
  - **Alinhamento Simétrico:** Todos os ícones e elementos como o logo, avatares (`AD`) e o botão de engrenagem de configurações são perfeitamente centralizados a 60px de largura.
- **Aproveitamento de Área Útil:** O padding geral do contêiner flexível principal `#view-container` foi reduzido de `p-8` para `p-6`, aumentando expressivamente a área livre para visualização de dados nas laterais e topo.

### B. Módulo de Levantamentos (levantamentos.ts)
- **Painel de Campanhas:** Acessado clicando em **"Levantamentos"** no menu principal. Apresenta controles de visualização híbridos e uma barra de busca dinâmica unificada.
- **Alternador de Modos de Visualização (Grid/List Toggle):** Permite ao usuário alternar a renderização da tela em tempo real por meio de botões estilizados de layout, persistindo a escolha do operador de forma permanente no `localStorage` do navegador:
  - **Visualização em Cards (Modo Grid Redesenhado & Ultra-Compacto):**
    - Padding geral otimizado e reduzido de `p-6` para `p-4` para máxima economia de espaço vertical.
    - Remove a tag nominal de ID (`LEV_ID`).
    - Posiciona o Título da Fazenda e o Badge de Status alinhados de forma flexível no topo superior do cartão.
    - O badge de status exibe o texto sanitizado substituindo o caractere `_` por espaço (ex: `'EM ANDAMENTO'`).
    - **Barra de Metadados Condensada:** Exibe de forma agrupada na mesma linha horizontal (flex entre extremidades) a **Data de Início** (ao lado de um ícone de calendário) e as **Estatísticas Rápidas de Vértices** (Pts/Divisas), economizando linhas e espaços valiosos na vertical.
    - **Bloco Estruturado de Dados Físicos:** O rodapé do card expõe o **CAR**, o **CCIR** e o **MUNICÍPIO / UF** em linhas próprias e exclusivas com espaçamento super compacto (`space-y-0.5`), resolvendo qualquer truncagem e facilitando a leitura direta sem sobreposição.
    - **Botões e Margens Compactas:** Margem superior e interna do rodapé reduzidas (`mt-3.5 pt-2.5`) para compactar o card na altura sem perder o design moderno de vidro.
  - **Visualização em Tabela (Modo Lista Windows Explorer):**
    - Renderiza uma grade de alto padrão estético inspirada no design clássico do Windows Explorer.
    - Exibe as colunas: **Nome / Localidade**, **Status**, **Data de início**, **Proprietários** e **Tamanho / Medições**, com ações rápidas de auditoria, edição e exclusão.
    - Renderiza ícones de pastas em tom âmbar premium para cada levantamento da tabela.
    - O clique funcional no nome da propriedade aciona diretamente a rota de auditoria de campo.
  - **Lógica Invariante de Eventos (Resolução de Travamentos):**
    - O gerenciamento de ações de clique (Auditoria, Edição e Exclusão) adota **Delegação de Eventos Centralizada** diretamente na propriedade `onclick` do contêiner estático pai `#grid-projetos` usando `closest()`. Isso previne o travamento e a perda crônica de ouvintes (listeners) que ocorria devido à re-renderização dinâmica da lista de projetos durante buscas e alternâncias de layout.
- **Painel de Ações de Status (Travas de Segurança):** Na tela de detalhes do levantamento, o operador conta com botões para transicionar o status. Mudar o status para `'ARQUIVADO'` aplica a trava visual e de banco (Read-Only Lock).

### C. Módulo de Mesa de Trabalho e Triagem Geodésica (mesa_trabalho.ts)
Acessada pelo menu lateral principal clicando em **"Mesa de Trabalho"** (ou `/mesa-trabalho`), é a central de comando de engenharia e triagem:

- **Isolação e Ocultação Absoluta de Matrículas na Etapa 1 (Mesa Geodésica):** A Etapa 1 processa os dados de campo em lote completo (Base e Rovers) sem segregação jurídica. Por isso, ao alternar para a Etapa 1 (`geoprocessamento`), o painel de abas de matrícula (`#container-abas-matriculas`) e o indicador de matrícula ativa no rodapé técnico (`#container-info-matricula-ativa`) são **totalmente ocultados**. As matrículas e suas divisas perimetrais se tornam visíveis estritamente na Etapa 2 (`cartorio`) para a montagem de confrontações.
- **Efeito Sticky Header Condensado no Scroll (Cabeçalho Reativo de 5px):**
  - O cabeçalho de ação principal `#mesa-trabalho-header` é fixado no topo (`position: sticky; top: 0; z-index: 45`) com fundo desfocado translúcido (`backdrop-filter: blur(12px)`).
  - Ao rolar a tela principal para baixo (`scrollTop > 40`), uma escuta de evento de scroll no contêiner principal `#view-container` aplica a classe `.header-condensed`.
  - **Compactação Extrema de 5px:** No estado condensado, o cabeçalho tem seu padding reduzido para `4px 12px !important` e aplica um `gap: 6px !important`, encolhendo também o botão Voltar (`#btn-voltar-lista` recebe padding `4px 8px` e ícone menor) para preservar espaço. O cabeçalho é deslocado para `top: -19px !important` para compensar exatamente os `24px` de padding do container `#view-container`, encostando a exatos **5px da borda física superior** da tela. Os metadados secundários de Proprietário/CAR/CCIR são ocultados, o título do levantamento e badges de status são encolhidos suavemente em pixels, e a **barra de seleção de etapas se comprime**, exibindo **apenas os ícones** do Lucide (definindo `font-size: 0`), e migra de sua posição inferior horizontal para se acomodar discretamente na ponta direita superior do cabeçalho condensado (no espaço livre da matrícula). Ao retornar ao topo, o cabeçalho se expande com todos os textos longos e metadados.
- **Mesa de Ingestão e Área de Mapa Vertical Ampliada (480px):**
  - O contêiner de visualização espacial (`#container-mapa-leaflet-parent`) e o contêiner de ingestão (`#container-ingestao-arquivos`), juntamente com a regra estrutural do grid superior (`#grid-superior-detalhe`), são configurados com uma **altura física ampliada de 480px** (um ganho de 60px na vertical) para melhor visualização cartográfica e análise de auditoria.
  - Por padrão, a ingestão inicia no estado **colapsado (`.ingestao-collapsed`)**, medindo apenas `130px` de largura e exibindo uma mini view limpa de upload de arquivos.
  - Isso permite que o contêiner do mapa Leaflet (`#container-mapa-leaflet-parent`) se expanda horizontalmente e ocupe todo o restante da tela útil disponível no grid.
  - O operador pode expandir a Ingestão clicando sobre ela ou simplesmente **arrastando um arquivo sobre sua área (dragover/dragenter)**. O card de ingestão se expande suavemente com transição de 300ms, disparando reativamente `triagemMap.invalidateSize()` após 310ms para reajustar a viewport geométrica do mapa perfeitamente.
  - **Botão Recolher Premium:** Disponibiliza um botão de colapso manual altamente contrastante no cabeçalho expandido (`#btn-colapsar-ingestao`) estilizado in vermelho técnico suave (`bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/25` e ícone `minimize-2` de colapso) para fácil visualização e retorno ágil ao estado colapsado, com interrupção de propagação de clique (`stopPropagation`).
  - **Botão Temporário de Teste de Ingestão ("Testar Busca HGO"):** Para fins de auditoria e teste de I/O em tempo de execução, foi incorporado ao cabeçalho do painel de Workspace GNSS o botão `#btn-testar-busca-rinex`. O clique aciona o endpoint `POST /levantamentos/{lev_id}/testar-busca-rinex` que varre de forma síncrona a Área de Trabalho do Windows (`D:\OneDrive_Thiago\OneDrive\Arquivos de Microsoft Copilot Chat\Área de Trabalho`) e subdiretórios de projeto à procura de arquivos Rinex convertidos correspondentes aos `.GNS` importados (suportando anos dinâmicos e extensões como `.25o`, `.26o` de observação, navegação e glonass). Ao localizá-los, o sistema realiza a cópia direta para o workspace do levantamento e registra seus metadados espaciais no histórico do banco, exibindo um relatório minucioso com a listagem dos arquivos movidos e erros encontrados.
  - **Condensação de Arquivos Rinex no Workspace (Filtro de Observação):** Para evitar a poluição visual na coluna "2. Rinex" do painel de arquivos (uma vez que cada conversão gera múltiplos arquivos redundantes como `.nav`, `.g`, `.25n`, `.26g`), o renderizador do frontend em `loadWorkspaceArquivos` filtra dinamicamente os itens listados. A interface exibe estritamente o arquivo de observação principal do receptor (extensões `.obs`, `.o` ou correspondente `.XXo` via regex), ocultando os arquivos de navegação sem excluí-los do disco, otimizando o aproveitamento vertical da tela.
- **Modularização Arquitetural em Submódulos (V2.5):** Para evitar o crescimento insustentável do arquivo `mesa_trabalho.ts` (originalmente com mais de 3000 linhas), a Mesa de Trabalho foi decomposta em 4 partes acopladas de forma limpa na mesma pasta `src/views`:
  * `mesa_trabalho.ts` (Orquestrador Central e Gestor de Estado): Mantém a declaração de estados (`pontosList`, `confrontantesList`, etc.) no closure de `setup()` para preservar a reatividade, gerencia a escuta de eventos delegados e chamadas à API, e atua como a rota de integração no frontend.
  * `mesa_trabalho_template.ts` (HTML Estático): Centraliza a estrutura fixa de visualização, modais e dropzones.
  * `mesa_trabalho_tabela.ts` (HTML Dinâmico de Tabelas): Expõe geradores puros de strings HTML para renderização rápida de linhas de vértices (Etapa 1 e Etapa 2), segmentos/confrontantes e histórico de auditoria (`renderHistoricoTimelineHtml`).
  * `mesa_trabalho_mapa.ts` (Controller do Mapa): Encapsula a inicialização, limpeza de overlays, injeção de WMS do SIGEF e plotagem de marcadores customizados, polilinhas de segmentos e foco reativo (`selectPonto`).

*   **Aba "Mapa do Imóvel Rural" (Visualizador Leaflet):**
    - Renderiza dinamicamente o mapa interativo centrado nas coordenadas do levantamento.
    - Consome as coordenadas geodésicas (`lat_corrigido`, `lon_corrigido`) desenhando os vértices com ícones customizados segundo o padrão INCRA (Marcos 'M' em azul escuro, Pontos 'P' em verde, Vértices Virtuais 'V' em cinza).
    - Desenha as polilinhas conectando os segmentos em tempo real. Se o segmento possuir confrontante associado, a linha adquire cor sólida verde-menta; caso não possua confrontante, a linha é plotada tracejada em amarelo/vermelho indicando inconformidade.
    - **Suporte a Super-Zoom (Zoom 21-24) e Grade Dinâmica**: Permite estender o nível de zoom até o fator 24. A partir do zoom `> 20`, a camada de satélite do Google é temporariamente ocultada (opacidade 0) para evitar exibição de erros de imagem em alta aproximação, e uma grade métrica local desenhada a cada 1 metro com espessura fina (0.6px) em verde-menta com pointer events desativados é projetada no viewport.
    - **Prioridade de Clique (Empilhamento Z-Index)**: Polilinhas e polígonos são desenhados abaixo dos marcadores através do método `.bringToBack()`, enquanto os marcadores de vértice recebem `.setZIndexOffset(1000)` para empilhamento frontal completo, eliminando a interceptação de cliques pelas linhas.
*   **Dropzone de Ingestão de Lote GNSS:**
    - Localizada na lateral do mapa. Permite o arrasto de múltiplos arquivos binários brutos (`.GNS`) ou cadernetas RTK (`.TXT`) simultaneamente.
    - **Feedback Visual:** Durante o processamento em background da esteira no servidor, a dropzone ganha a classe CSS `.animate-pulse` pulsando com brilho verde-menta e o cursor do mouse exibe o estado de ocupado (`wait`), notificando o usuário do andamento.
*   **Aba "Vértices Importados" (Grid Paginada):**
    - Exibe uma tabela técnica rica listando os pontos com suas colunas planificadas:
      `[Vértice, Tipo, Norte Bruto (m), Este Bruto (m), Norte Corrigido (m), Este Corrigido (m), Lat Corrigida, Lon Corrigida, Altura (m), Sigma N (m), Sigma E (m), Sigma Z (m), Status]`
    - **Destaque Visual de Precisão (M-Sigma):** As células correspondentes a desvios padrão (Sigmas) que apresentem precisão pior que a exigida na 3ª edição da norma técnica do INCRA (superior a **`0.10` metros** para limites artificiais) são pintadas automaticamente com texto em vermelho escuro e fundo vermelho suave. Pontos ainda no estado bruto (`status_correcao = 'BRUTO'`) pintam a linha inteira da treeview de amarelo claro, sinalizando que a translação em bloco ainda não foi aplicada.
    - **Botão "Ocultar Fora da Poligonal"**: Alternador de visualização que, quando ativo, limpa a listagem de geoprocessamento e cartório de todos os pontos auxiliares e de base que possuem a flag `ignorar_poligono = 1`, isolando visualmente apenas o encadeamento poligonal do imóvel.
*   **Botão "Aplicar Ajuste Geocêntrico (Translação)":**
    - Localizado no cabeçalho da grid de pontos. Abre o modal de seleção da Base. O usuário seleciona qual ponto pós-processado do PPP será a Base, e o sistema dispara o cálculo do Vetor Delta UTM no servidor, recalculando instantaneamente todos os rovers associados e atualizando a grid e o mapa com fundo verde-menta de sucesso.
*   **Botão "Exportar Shapefile (.ZIP)":**
    - Localizado na barra de controle de exportações da matrícula. Dispara a compilação in-memory gerando em tempo de execução um único arquivo comprimido contendo as camadas `pontos.shp` e `perimetro.shp` devidamente projetadas em UTM SIRGAS 2000 Zona 22S (EPSG:31982) com arquivo de projeção `.prj` com WKT injetado estrito (conforme gemini.md).
*   **Botão "Gerar KML" e "Consolidar Pontos UTM" (Exportação TOPOCAD):**
    - Botões rápidos de exportação que baixam os dados estruturados e prontos para o AutoCAD / TopoCAD.
    - **Padrão de Exportação TXT (TOPOCAD)**: A exportação de pontos em formato TXT (gerada pela consolidação de pontos no workspace do levantamento ou exportação de geometria no desktop) segue rigidamente o padrão de colunas do TOPOCAD separado por vírgula `,`:
      `PT,X,Y,Z,SX,SY,SZ,CONFRONTANTE`
      onde `SX`, `SY` e `SZ` são os desvios padrão correspondentes em metros (com 3 casas decimais) e `CONFRONTANTE` é o nome do confrontante em caixa alta, sanitizado sem vírgulas para evitar a quebra do layout de colunas na importação do software CAD.

### D. Módulo e Painel HGO / Triagem (`hgo.ts`)
Acessado pela aba **"Organizador HGO / Triagem"** no menu de processamento:
- Apresenta a fila de arquivos GNSS brutos e RINEX importados.
- Contém o botão **"CONVERTER E ORGANIZAR PARA HGO"**, que inicia a esteira RPA silenciosa do `ConvertRinex.exe`.
- Contém o botão **"RE-PROCESSAR TRIAGEM (SKIP RPA)"**, útil para reavaliar os metadados temporais de agrupamento de Rovers e Bases caso novos arquivos sejam adicionados manualmente à pasta pelo Windows Explorer.
- Exibe o log detalhado em tempo real da alocação dos rovers.

### E. Módulo e Painel de Integração PPP (`ppp.ts`)
Acessado pela aba **"Pós-Processamento IBGE-PPP"**:
- Apresenta uma tabela listando os arquivos observados (`.obs`) identificados como Bases operacionais.
- Exibe o status de pós-processamento de cada Base (`Pendente`, `Enviado ao IBGE`, `Processado`, `Falhou`).
- Contém o botão **"PROCESSAR SELECIONADOS NO IBGE-PPP"**, que inicia a rotina paralela de submissão do lote de bases pela API ou pelo robô automatizado Selenium.
- Contém o botão **"VISUALIZAR RELATÓRIO PPP (.SUM)"**, que abre o arquivo textual de retorno do IBGE formatado para o usuário conferir as precisões de órbita e sigmas de pós-processamento científico.
- **Painel Contingencial Manual (`FrameOverrideBase`):** Implementado no formulário lateral do processador. Possibilita ao topógrafo forçar a calibração da base manualmente em caso de falha de conexão prolongada do portal do IBGE.
  - Oferece abas de entrada (Notebook) permitindo digitar a coordenada corrigida nas formas **Geodésica** (Latitude/Longitude em graus decimais e Altitude elipsoidal) ou **Plana UTM** (Norte, Este, Fuso selecionado).
  - Possui botões dedicados de salvar e aplicar o vetor de override, calculando a projeção reversa no servidor e executando a translação de Rovers de forma atômica no SQLite.

---

## 9. Especificação de Base Física de Campo (B) e Regras de Ordenação Estritas

### A. O Novo Tipo de Ponto B (Base Física de Campo)
Como evolução do ecossistema de georreferenciamento e para atender à especificação do protocolo V.L.A.E.G., foi adicionado o tipo de ponto `'B'`, exclusivo para **Bases Físicas de Campo**.
*   **Isolação do Traçado Perimetral:** Pontos do tipo `'B'` são mantidos rigorosamente com `ordem_caminhamento = NULL` no banco de dados e são omitidos da montagem de polígonos/divisas perimetrais de matrículas (Etapa 2) e do desenho de polilinhas temporárias de fechamento (Mesa Geodésica).
*   **Hierarquia de Amparos Geodésicos:**
    - Rovers (tipo `'P'`) podem se amparar em bases homologadas tipo `'M'` ou bases físicas de campo tipo `'B'`.
    - Bases de campo (tipo `'B'`) se amparam exclusivamente em bases homologadas tipo `'M'`.
*   **Translação Reativa de Rovers em Lote:** A alteração de coordenadas de uma base do tipo `'B'` dispara atomicamente a translação tridimensional de todos os rovers a ela vinculados no banco de dados.

### B. Sanitização e Eliminação de Ordens Repetidas
Para garantir que o caminhamento perimetral de cada matrícula seja único e linear:
1.  **Sanitizador em Lote no Backend (`sanitizar_ordens_duplicadas`):** Uma rotina atômica sanitiza reativamente no banco de dados todas as ordens de caminhamento duplicadas, re-sequenciando os pontos de 1 a N por matrícula (para pontos com matrícula associada) e reordenando os pontos avulsos de forma contínua para evitar colisões.
2.  **Eliminação de Duplicidades Visuais na Mesa Geodésica (Etapa 1):** Como a Mesa Geodésica (Geoprocessamento) exibe a listagem global de todos os pontos de todas as matrículas misturados, a exibição de suas ordens perimetrais individuais causava a repetição de números. Para solucionar isso de forma definitiva e elegante, o renderizador da Etapa 1 (`renderLinhaPontoGeoprocessamentoHtml`) foi modificado para exibir a coluna `ORD.` de forma estritamente consecutiva e única com base em seu índice na tabela (`idx + 1`), enquanto exibe `-` para bases do tipo `'B'`, preservando a integridade das ordens perimetrais de cada matrícula individual e eliminando as colisões visuais.

### C. Identificação Visual de Origem de Arquivo GNSS
Com a finalidade de auditar o levantamento e identificar rapidamente pontos intrusos ou que não pertençam àquela sessão, implementou-se:
1. **Badges Coloridos por Hash de Arquivo:** O renderizador das tabelas de pontos (`renderLinhaPontoGeoprocessamentoHtml` e `renderLinhaPontoCartorioHtml`) gera um badge colorido determinístico a partir do hash do nome do arquivo em `arquivo_origem`.
2. **Identificador de Criação Manual:** Pontos que não possuem `arquivo_origem` no banco (inseridos de forma avulsa pela interface) exibem o badge cinza `Inserido Manual`.
3. **Filtro de Pesquisa Ampliado:** O input de busca rápida na tabela de pontos (`input-search-ponto`) estende o filtro textual para incluir a coluna `arquivo_origem`, permitindo isolar instantaneamente os vértices de um arquivo específico na visualização.

