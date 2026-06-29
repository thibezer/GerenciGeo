# 🛰️ GerenciGeo — Manifesto do Motor Geodésico e Especificação de Georreferenciamento Avançado
**Padrão Metrológico:** Rigor Elipsoidal Científico e Automação de Campo (Field-to-Finish)
**Versão do Documento:** 2.3.0
**Status do Módulo:** Homologado e Consolidado

Este documento detalha a arquitetura lógica, as equações matemáticas, o fluxo físico de dados no Windows, as invariantes estruturais do banco de dados e a interface gráfica (UI) do motor de **Georreferenciamento** do **GerenciGeo**. Ele atua como guia de referência técnica absoluta para desenvolvedores e agentes de IA sobre as rotinas espaciais do sistema.

---

## 1. Princípios e Padrões Geodésicos do Ecossistema

Toda a infraestrutura matemática e cartográfica do GerenciGeo é construída sobre padrões internacionais de alta exatidão física e jurídica. O sistema atua de forma determinística, banindo aproximações planas simplistas que possam comprometer a homologação de plantas e planilhas no SIGEF / INCRA.

### A. Sistemas de Referência e Projeções Oficiais
* **Formato Plano de Trabalho (AutoCAD UTM Default):** Adota rigidamente a projeção **SIRGAS 2000 / UTM Zone 22S (EPSG:31982)** com elipsoide de referência GRS80 e Meridiano Central 51° W para compatibilidade direta e imediata com os templates de desenho técnico e tabelas do AutoCAD/TopoCAD 2000.
* **Formato Geográfico de Validação e Assinatura:** Utiliza o datum geocêntrico oficial **SIRGAS 2000 (EPSG:4674)** em coordenadas geodésicas (Latitude e Longitude em graus decimais), padrão estrito para plotagem Leaflet no frontend, laudos de faixa de fronteira e assinaturas eletrônicas do SIGEF.
* **Modelo de Altitude:** Altitudes Elipsoidais (h) em metros para processamento geométrico espacial, com suporte a translações ortométricas baseadas no modelo geoidal vigente.

---

## 2. Esteira de Ingestão e Conversão Híbrida

O primeiro estágio do georreferenciamento reside no recebimento dos arquivos brutos coletados em campo pelos receptores GNSS de rampa e sua preparação na esteira digital:
[ARQUIVOS BRUTOS DE CAMPO]

Receptor GNSS (.GNS)

Cadernetas RTK (.TXT)
|
v
[ESTEIRA DE INGESTÃO]
- business/gnss_worker.py (QC)
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

Cópia ativa (HGO Aberto)

Estabilização (5.0s)

Fechamento & Limpeza
### A. Filtro e Controle de Qualidade de Campo (QC)
No arquivo `business/gnss_worker.py` e `business/triagem_inteligente.py`, o sistema intercepta todos os carregamentos na pasta `/Brutos` aplicando a seguinte barreira:
* **Filesize QC:** Arquivos de tamanho inferior a **50KB** (51.200 bytes) são identificados como corrompidos ou insuficientes (tempo de rastreio nulo ou falha na gravação do receptor). O pipeline rejeita a conversão e sinaliza o arquivo como falho gravando o log com `sucesso = 0` na tabela `historico_rinex`, movendo-o para a lista de alertas para análise humana.

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
* **Geodésico para ECEF (`geodesic_to_ecef`):** Converte a coordenada geodésica $(\phi, \lambda, h)$ para coordenadas cartesianas geocêntricas $(X, Y, Z)$:
    $$N = \frac{a}{\sqrt{1 - e^2 \sin^2\phi}}$$
    $$X = (N + h) \cos\phi \cos\lambda$$
    $$Y = (N + h) \cos\phi \sin\lambda$$
    $$Z = \left(N(1 - e^2) + h\right) \sin\phi$$
* **ECEF para Geodésico (`ecef_to_geodesic`):** Converte $(X, Y, Z)$ tridimensionais de volta para $(\phi, \lambda, h)$ usando o consagrado **Algoritmo de Bowring**, garantindo precisão sub-milimétrica após apenas uma iteração em qualquer coordenada do território nacional.

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

### A. Algoritmo de Ordenação e Topologia Perimetral
1. **Identificação do Extremo Norte:** Varre todos os pontos da matrícula e identifica o vértice mais ao Norte (Maior Latitude). Em caso de empate absoluto de latitude, adota como desempate a maior longitude (ponto localizado mais a Leste/direita). Este vértice será forçado como o **Ponto de Partida ($P_1$)** da poligonal.
2. **Cálculo da Orientação de Gauss (Shoelace):** Projetará temporariamente os pontos em uma projeção UTM dinâmica baseada na longitude média da fazenda para evitar distorções de escala. Em seguida, calcula a área direcionada do polígono via polinômio de Shoelace:
   $$2 \times \text{Área} = \sum_{i=1}^{n} (E_i \times N_{i+1}) - (E_{i+1} \times N_i)$$
   - Se a área direcionada calculada for **positiva ($\text{Área} > 0$)**, a poligonal está orientada no sentido **anti-horário**. O sistema inverte automaticamente a ordem de toda a lista de pontos.
   - Se for **negativa**, a poligonal já se encontra no sentido **horário** correto e a ordem é preservada.
3. **Rotação Cíclica (Circular Shift):** Rotaciona ciclicamente os índices da lista de pontos para que o vértice extremo norte ($P_1$) passe a ocupar o índice `0` da lista.
4. **Preservação de Limites e Confrontantes Históricos:** Antes de purgar as divisas antigas, o sistema salva em cache um mapa contendo o `confrontante_id`, `tipo_limite_sigef` (muros, cercas, rios) e `metodo_posicionamento_sigef` vinculados a cada divisa.
5. **Reconstrução com Fechamento Estrito (Autorregeneração Constitucional):** Abre uma transação atômica protegida no SQLite, deleta todos os registros da tabela `segmentos` atrelados àquela matrícula e insere as novas divisas sequencialmente ligando $P_n \to P_{n+1}$. O último segmento do loop é obrigatoriamente fechado conectando o Ponto Final de volta ao Ponto Inicial ($P_{last} \to P_1$). Durante a inserção, o sistema cruza as IDs dos pontos inicial/final e reinsere de forma invisível as informações históricas de confrontantes e limites salvas no passo anterior, evitando retrabalho do topógrafo.

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

* **QC do Arquivo (< 50KB):** Alerta crítico se houver arquivos de rinex com tamanho abaixo de 50KB ou falhas de processamento registradas.
* **Fluxo Incompleto (Rinex sem PPP):** Alerta se houver vértice importado com arquivo RINEX associado na tabela `pontos` mas cuja coluna `arquivo_resultado_ppp` estiver nula (processamento pendente).
* **Divisa sem Confrontante:** Alerta se houver segmentos na matrícula sem confrontante (vizinho) atrelado.
* **Ponto Órfão:** Alerta se houver pontos cadastrados no levantamento que não foram incluídos em nenhuma divisa ou segmento de caminhamento (vértices soltos no mapa).
* **Arquivos Brutos Pendentes:** Alerta se existirem arquivos binários `.GNS` em `/Brutos` que ainda não possuam arquivo correspondente convertido em `/Rinex` (indicativo de que a esteira precisa ser acionada).

---

## 8. Interface Visual e Controle na UI

A operação diária, a gestão e a visualização do georreferenciamento avançado ocorrem de forma integrada no frontend Web através de uma interface baseada em carregamentos reativos e desacoplamento radical de views.

### A. Layout Global e Arquitetura do Painel Principal (principal.html)
- **Estruturação Física em Português (`principal.html`):** Para maior clareza e manutenção imediata no repositório, o arquivo de layout real do sistema foi nomeado como `principal.html`. O arquivo inicial `index.html` atua estritamente como um redirecionador invisível e instantâneo, mantendo compatibilidade nativa com o servidor de desenvolvimento do Vite.
- **Remoção Completa do Cabeçalho Superior (Headerless Experience):** O antigo `<header>` que exibia o breadcrumb e a barra de status do sistema foi fisicamente desativado e removido. Isso gerou um ganho de 64px verticais que foram integralmente devolvidos à área útil do aplicativo.
- **Barra Lateral Ultra-Compacta (`aside#sidebar`):** Modo aberto reduzido para `w-56` (224px) e Modo Colapsado para `60px` com paddings e alinhamento centralizado e simétrico a 60px de largura.

### B. Módulo de Levantamentos (levantamentos.ts)
- **Alternador de Modos de Visualização (Grid/List Toggle):** Permite ao usuário alternar a renderização da tela em tempo real entre cards ultra-compactos (Modo Grid) ou tabelas do tipo Windows Explorer (Modo Lista), persistindo a escolha do operador no `localStorage`.
- **Delegação de Eventos Centralizada (Resolução de Travamentos UI):** O gerenciamento de ações de clique (Auditoria, Edição e Exclusão) adota **Delegação de Eventos Centralizada** diretamente na propriedade `onclick` do contêiner estático pai `#grid-projetos` usando `closest()`. Isso previne o travamento e a perda crônica de ouvintes (listeners) decorrente da re-renderização dinâmica da lista de projetos durante buscas e alternâncias de layout.

### C. Módulo de Mesa de Trabalho e Triagem Geodésica (mesa_trabalho.ts)
A Mesa de Trabalho foi estruturalmente decomposta em 4 partes físicas na mesma pasta `src/views` para fins de estabilidade e legibilidade do código (V2.5):
* `mesa_trabalho.ts` (Orquestrador Central e Gestor de Estado).
* `mesa_trabalho_template.ts` (HTML Fixo Estrutural e Modais).
* `mesa_trabalho_tabela.ts` (HTML Dinâmico de Linhas de Células e Histórico de Auditoria).
* `mesa_trabalho_mapa.ts` (Controller Isolado do Mapa Leaflet, Overlays e Ajustes de Viewport).

- **Ocultação Absoluta na Etapa 1 (Mesa Geodésica):** Como a Etapa 1 processa os dados de campo em lote completo (Base e Rovers) sem segregação jurídica, ao alternar para a Etapa 1, o painel de abas de matrícula (`#container-abas-matriculas`) e o indicador de matrícula ativa no rodapé técnico (`#container-info-matricula-ativa`) são **totalmente ocultados** da tela. As matrículas e tabelas de divisas se tornam visíveis estritamente na Etapa 2 (`cartorio`).
- **Efeito Sticky Header Condensado (Compactação Extrema de 5px):** O cabeçalho principal `#mesa-trabalho-header` possui fixação reativa (`position: sticky; top: 0`). Ao rolar a tela (`scrollTop > 40`), a classe `.header-condensed` é aplicada, deslocando o container para `top: -19px !important` para compensar o padding e encostar a exatos **5px da borda física superior** da tela, ocultando metadados secundários e reduzindo a barra de seleção de etapas para exibir **apenas os ícones do Lucide** (`font-size: 0`).
- **Ingestão Dinâmica e Dropzone Compacta:** A zona de ingestão quadripolar inicia no estado colapsado (`130px`) para dar área útil máxima ao mapa Leaflet. Ela se expande suavemente com transição de 300ms via arrasto (*dragover*) ou clique. Quando arquivos estão na fila, a dropzone é encolhida reativamente para uma barra horizontal de altura `h-11`, ocultando o subtítulo longo para economizar espaço de exibição.
- **Destaque Visual de Precisão (M-Sigma):** As células correspondentes a desvios padrão (Sigmas) que apresentem precisão pior que a exigida na norma do INCRA (superior a **`0.10` metros** para limites artificiais) são pintadas automaticamente com texto em vermelho escuro e fundo vermelho suave. Linhas brutas pendentes de translação ganham coloração amarela clara.
- **Suporte a Super-Zoom (Zoom 21-24) e Grade Métrica:** Permite estender o nível de zoom até o fator 24 no mapa Leaflet. A partir do zoom `> 20`, a camada de satélite do Google é temporariamente ocultada (opacidade 0) para evitar desfoques, e uma grade métrica local desenhada a cada 1 metro com espessura fina (0.6px) em verde-menta é projetada no viewport para auditoria analítica fina.
- **Padrão de Exportação TXT (TOPOCAD):** A exportação de pontos em formato TXT segue rigidamente o padrão de colunas separado por vírgula `,` para integração imediata:
  `PT,X,Y,Z,SX,SY,SZ,CONFRONTANTE`
  Os desvios padrão são formatados em metros com 3 casas decimais e a string do confrontante é sanitizada em caixa alta e limpa de vírgulas internas para evitar quebras de colunas no CAD.

### D. Refinamento do Organizador de Perímetro (Etapa 2 - Cartório) (V2.6)
- **Máquina de Estados de Passo Único para Cônjuge:** A função `configurarMaquinadeEstadosCivil` controla dinamicamente a visibilidade e o bloqueio do bloco de dados do cônjuge (`#group-dados-conjuge`) e seus inputs extras (`.campos-extra-conjuge`). Se o estado civil selecionado exigir cônjuge (casado/união estável), o select de Regime de Bens (`#conf-regime-bens`) é habilitado; caso contrário, é desabilitado e limpo, ocultando o container de cônjuge. Caso o regime selecionado contenha "parcial", os inputs extras do cônjuge são desabilitados com o placeholder "Omitido no Laudo (Parcial)". A função escuta reativamente os eventos `change` no Estado Civil e `change`/`input` no Regime de Bens para atualizações instantâneas em tempo real.
- **Cálculo de Geometria Plana Real na Tabela de Divisas:** As colunas de Distância e Azimute da tabela de confrontações são computadas dinamicamente no frontend com base nas coordenadas UTM planas (ou geodésicas convertidas) dos vértices inicial e final da divisa. O azimute é formatado no padrão de Graus, Minutos e Segundos (GMS) com arredondamento seguro contra overflow (se os segundos $\ge 59.5$, zeram e incrementam minutos/graus).
- **Atalhos Rápidos de Emissão de Peças Técnicas com Delegação de Eventos:** A tabela de divisas incorpora um grupo de botões de ações com ícones Lucide (📄 Anuência, ✍️ Requerimento, 🔬 Laudo) permitindo a emissão de documentos direcionados diretamente do grid. O clique é capturado via delegação de eventos centralizada no contêiner da tabela. Caso a TRT não esteja gravada no levantamento, um prompt reativo solicitará o preenchimento, persistindo essas informações no banco antes de abrir as abas de impressão.

---

## 9. Especificação de Base Física de Campo (B) e Regras de Ordenação Estritas

### A. O Novo Tipo de Ponto B (Base Física de Campo)
Como evolução do ecossistema de georreferenciamento, foi consolidado o suporte ao tipo de ponto `'B'`, exclusivo para **Bases Físicas de Campo**.
* **Isolação do Traçado Perimetral:** Pontos do tipo `'B'` são mantidos rigorosamente com `ordem_caminhamento = NULL` no banco de dados e são omitidos da montagem de polígonos/divisas perimetrais de matrículas (Etapa 2) e do desenho de polilinhas temporárias de fechamento (Mesa Geodésica).
* **Hierarquia de Amparos Geodésicos:** Rovers (tipo `'P'`) podem se amparar em bases homologadas tipo `'M'` ou bases de campo tipo `'B'`. Bases de campo (tipo `'B'`) se amparam exclusivamente em bases homologadas tipo `'M'`.
* **Translação Reativa de Rovers em Lote:** A alteração de coordenadas de uma base do tipo `'B'` dispara atomicamente a translação tridimensional de todos os rovers a ela vinculados no banco de dados.

### B. Sanitização e Eliminação de Ordens Repetidas
Para garantir que o caminhamento perimetral de cada matrícula seja único e linear:
1.  **Sanitizador em Lote no Backend (`sanitizar_ordens_duplicadas`):** Uma rotina atômica sanitiza reativamente no banco de dados todas as ordens de caminhamento duplicadas, re-sequenciando os pontos de 1 a N por matrícula.
2.  **Eliminação de Duplicidades Visuais na Mesa Geodésica (Etapa 1):** Como a Mesa Geodésica exibe a listagem global de todos os pontos de todas as matrículas misturados, a exibição de suas ordens causava confusão visual. O renderizador da Etapa 1 (`renderLinhaPontoGeoprocessamentoHtml`) foi modificado para exibir a coluna `ORD.` de forma estritamente consecutiva e única com base em seu índice na tabela (`idx + 1`), enquanto exibe `-` para bases do tipo `'B'`, preservando a integridade das ordens perimetrais de cada matrícula individual e eliminando as colisões visuais.

---

## 10. Homologação de Pontos Aprovados no INCRA / SIGEF (Suporte ODS)

O sistema oferece suporte à importação de relatórios de homologação de pontos oficiais aprovados no INCRA / SIGEF para sincronização automática com o banco de dados do profissional.

### A. Parsing Nativo e In-Memory de Arquivos ODS
Para evitar dependências pesadas externas na leitura do formato OpenDocument Spreadsheet (`.ODS`), a extração é feita nativamente usando a biblioteca padrão do Python:
1.  **Detecção de Formato:** O arquivo recebido é identificado pelo sufixo do nome `.ods` ou pela assinatura ZIP mágica.
2.  **Leitura do XML de Conteúdo:** O contêiner ZIP é aberto via `zipfile.ZipFile` em memória por meio de `io.BytesIO`, extraindo e decodificando em UTF-8 o arquivo estruturado interno `content.xml`.
3.  **Varredura Geodésica com Regex:** Aplica-se uma expressão regular para capturar os códigos credenciados que correspondam ao padrão oficial do INCRA (`CRED-TIPO-NUMERO`), filtrados especificamente pelo código credenciado do profissional associado ao levantamento:
    $$\text{Regex: } \text{re.compile(rf"\b(\{re.escape(codigo\_credenciado)\})-(M|P|V)-(\backslash d+)\backslash b", re.IGNORECASE)}$$
4.  **Desduplicação e Persistência:** Os códigos encontrados são desduplicados por tipo de ponto e número (ex: `XRXR-M-0001`), e salvos transacionalmente no banco de dados do SQLite na tabela `banco_pontos`.

### B. Isolamento por Matrícula e Exibição em Dupla Camada
1.  **Vínculo com Matrícula (`matricula_id`):** A tabela `banco_pontos` inclui a coluna física `matricula_id` referenciando `matriculas(id) ON DELETE CASCADE`. A deleção física anterior e inserção dos novos pontos ocorrem restritas à matrícula ativa informada no parâmetro, impedindo o apagamento acidental de dados de parcelas vizinhas do mesmo levantamento.
2.  **Visualização e Traçado Consecutivo da Poligonal:** Para garantir a exatidão geométrica e evitar o cruzamento de linhas decorrentes de ordenações aleatórias, o frontend consome a rota dedicada `GET /levantamentos/{id}/matriculas/{matricula_id}/pontos-homologados`. Esse endpoint lê diretamente os registros da tabela `pontos` com `origem_homologada = 1` e os retorna ordenados rigidamente por `ordem_caminhamento ASC` (sequência original do arquivo ODS). Se a matrícula ativa possuir pontos homologados, o mapa Leaflet desenha a poligonal (linha tracejada âmbar e marcadores âmbar nítidos) respeitando essa ordem linear. A poligonal e os pontos originais de campo (camada original) são esmaecidos de forma discreta para segundo plano (opacidade reduzida para 40% e linhas cinzas `#94a3b8`), mas mantêm total interatividade e popups no hover.


---

## 11. Módulo 8 (Área de Fronteira) e Motor de Exportação Shapefile

Dois grandes motores foram acoplados na versão 2.3 para dar vazão à finalização jurídica e cartográfica do processo técnico fundiário:

### A. Invariante Matemática de Faixa de Fronteira (`report_generator.py`)
O cálculo de distância de isolamento da faixa de fronteira internacional (Brasil-Paraguai) para processos de ratificação de imóveis no estado do Paraná ocorre de forma determinística e rigorosa no espaço bidimensional elipsoidal. É terminantemente proibido qualquer aproximação plana simples em escala de grandes distâncias.
* **O Algoritmo Rigoroso:** A distância deve ser calculada utilizando a classe `pyproj.Geod(ellps="GRS80")` a partir da base do levantamento (ponto tipo `'M'` ativo prioritariamente corrigido) até o limite fixo internacional Brasil-Paraguai estabelecido na coordenada oficial:
    $$\text{Latitude Fixo: } -24.0671222 \quad \text{e} \quad \text{Longitude Fixo: } -54.2868778$$
* **Geração Dinâmica Premium e Sem Persistência:** Todos os laudos de faixa de fronteira e requerimentos de ratificação são gerados dinamicamente em formato HTML estruturado sob demanda via endpoints GET e enviados diretamente para o navegador do usuário (`HTMLResponse`). A impressão/conversão em PDF é acionada nativamente pelo cliente via `window.print()` e a classe CSS `.no-print` oculta botões e painéis de controle durante a impressão em folha A4. Não há persistência no disco rígido do servidor para evitar desperdício de espaço e simplificar a auditoria.
* **Lógica de Estado Civil Inteligente:** O motor possui inteligência para injetar máscaras de documentos de CPF/RG, além de remover dinamicamente todas as tags e dados de cônjuge caso as colunas de estado civil do proprietário apontem o status de solteiro.

### B. Invariante de Projeção (.PRJ) e Empacotamento Shapefile In-Memory
A exportação de Shapefiles pelo dashboard do sistema compila os dados geométricos e tabulares direto do banco físico de dados sem gerar arquivos lixo temporários no disco rígido do servidor.
* **Empacotamento In-Memory e Dupla Camada:** O processo de empacotamento ocorre estritamente na memória do servidor via `zipfile` e biblioteca `pyshp`. É gerado um único arquivo `.ZIP` contendo duas camadas vetoriais independentes: uma de pontos (`pontos.shp` para os vértices do perímetro) e uma de polígono (`perimetro.shp` para o contorno fechado da matrícula) projetadas na Zona UTM 22S.
* **Invariante de Projeção (.PRJ):** O arquivo de projeção (`.prj`) injetado obrigatoriamente dentro do pacote Shapefile deve conter estritamente a string WKT oficial da nossa EPSG padrão do motor matemático: SIRGAS 2000 / UTM Zone 22S (EPSG:31982), definida por:
    `PROJCS["SIRGAS 2000 / UTM zone 22S",GEOGCS["SIRGAS 2000",DATUM["Sistema_de_Referencia_Geocentrico_para_las_AmericaS_2000",SPHEROID["GRS 1980",6378137,298.257222101],TOWGS84[0,0,0,0,0,0,0]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4674"]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",-51],PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],PARAMETER["false_northing",10000000],UNIT["metre",1,AUTHORITY["EPSG","9001"]],AXIS["Easting",EAST],AXIS["Northing",NORTH],AUTHORITY["EPSG","31982"]]`

---

## 12. Motor de Resolução de Confrontantes O(1) Cached Single-Pass e coluna `cns_confrontante`

Como evolução do ecossistema de gestão de limites fundiários no GerenciGeo, foi adicionado suporte estrito e otimizado ao fluxo de confrontação de parcelas.

### A. Novo Campo Físico e Integração Pydantic
A tabela `confrontantes` do banco de dados e as estruturas de entrada/saída passaram a persistir o metadado **`cns_confrontante`** (Código Nacional de Serventias do Cartório de Registro de Imóveis), extraído de forma nativa dos relatórios ODS do SIGEF.
* **Modelo Físico:** Coluna `cns_confrontante TEXT` incluída no DDL e no vetor de migração dinâmica ativa em tempo de execução de [models.py](file:///d:/OneDrive_Thiago/OneDrive/Desenvolvimento/GerenciGeo/database/models.py).
* **Entrada/Edição Manual:** Campo incorporado ao payload `ConfrontanteCreate` e às rotas POST e PUT em [segmentos.py](file:///d:/OneDrive_Thiago/OneDrive/Desenvolvimento/GerenciGeo/routes/levantamento/segmentos.py).

### B. Algoritmo Anti-duplicidade e Otimização I/O em Memória
Para evitar a redundância crônica de inserções e contornar a limitação da função `UPPER` do SQLite com caracteres acentuados (como "João" vs "JOAO"), a esteira de importação no arquivo [homologacao.py](file:///d:/OneDrive_Thiago/OneDrive/Desenvolvimento/GerenciGeo/routes/levantamento/homologacao.py) foi refatorada:
1. **Normalização Fonética:** Uma função auxiliar de normalização de strings em Python (`normalizar_texto_busca`) baseada em `unicodedata.normalize('NFKD', ...)` remove acentos e caracteres especiais das strings de confrontação antes de testar equivalências de nomes.
2. **Resolução em Passo Único com Cache:** Carrega em memória todos os confrontantes históricos do levantamento técnico em dicionários com busca rápida $O(1)$.
3. **Amarração de Segmentos Sem Consultas:** A associação e amarração final de divisas físicas e a geração de segmentos na tabela `segmentos` utilizam o dicionário resolvido em memória, eliminando blocos redundantes de consultas SQL.

---

## 13. Gestão Separada de Templates HTML de Peças Técnicas (V2.7)

Os templates HTML das peças técnicas geradas dinamicamente pelo sistema foram totalmente extraídos das strings internas do Python para arquivos dedicados de forma a separar a apresentação da lógica de negócio.

### A. Estrutura de Diretórios de Templates
Todos os templates HTML nativos são agora armazenados de forma limpa na pasta física `/templates` na raiz do projeto:
* `requerimento_cartorio.html` (Requerimento de Averbação/Retificação de Cartório)
* `declaracao_responsabilidade.html` (Declaração de Responsabilidade de Limites e Posse)
* `laudo_tecnico.html` (Laudo Técnico e Memorial Justificativo - Cartório)
* `declaracao_anuencia.html` (Declaração de Anuência e Respeito de Limites do Confrontante)
* `laudo_fronteira.html` (Laudo de Localização em Faixa de Fronteira)
* `requerimento_ratificacao.html` (Requerimento de Ratificação de Fronteira)

### B. Mecanismo de Carregamento e Injeção
Para evitar conflito de análise (*parsing*) entre chaves `{}` do Python e as chaves nativas utilizadas por folhas de estilo (CSS/Tailwind) e lógica em tempo de execução de cliente (JavaScript), o motor de renderização adota:
1. **Carregamento Independente de I/O em UTF-8:** A função utilitária `carregar_template(nome_arquivo)` mapeia o arquivo absoluto e o lê utilizando codificação estrita em UTF-8.
2. **Substituição Linear de Placeholders:** O preenchimento das variáveis dinâmicas ocorre de forma explícita via chamada consecutiva do método `.replace("{PLACEHOLDER}", valor_calculado)` em vez do método `.format()`, preservando a integridade das folhas de estilo e funções dinâmicas do frontend no navegador.

---

## 14. Arquitetura Distribuidora Edge-First e Sincronização em Nuvem (v2.4)

O GerenciGeo v2.4 adota a arquitetura de Software Desktop Híbrido (**Edge-First**), descentralizando o processamento pesado de coordenadas e a manipulação de hardware local do servidor em nuvem (Hostinger) para rodar localmente no Windows.

### A. Divisão de Topologias
1. **Ambiente Desktop Local (100% Autônomo):** Executa o backend FastAPI local (`api.py`), monitoramento GNSS (`business/gnss_worker.py`), integração RPA do HGO (`converterrinex.py`) e persistência física em SQLite de alta fidelidade (`database/gerencigeo.db`). A interface gráfica é envelopada no Windows usando a biblioteca `pywebview` (iniciada por `main.py` -> `ui/app.py`) apontando para a porta local `8000`.
2. **Ambiente Web Cloud (Hostinger Hub):** Servidor leve rodando o FastAPI em modo restrito (com a flag `RUNNING_LOCAL = False`). Todas as operações de ingestão RINEX, processamento do robô HGO e uploads são desativados (retornando HTTP 403 Forbidden). O banco de dados MySQL armazena apenas dados cadastrais simplificados e a geometria perimetral dissolvida em formato GeoJSON/WKT para visualização móvel rápida.

### B. Protocolo de Sincronização Unidirecional (Atômico)
Para atualizar o Hub na nuvem, o backend local serializa os dados cadastrais da matrícula ativa e dissolve a geometria dos segmentos perimetrais válidos (com o fechamento obrigatório $P_{last} \to P_1$) em uma string GeoJSON válida.
O envio do payload é assíncrono via biblioteca `httpx` para o endpoint `https://gerencigeo-seu-site.com.br/api/v1/sync/imovel` exigindo autenticação através do header `X-API-KEY` com o token de segurança `G4G2_SECURE_SYNC_TOKEN_7D8E2B9A1C` estabelecido em `config.py`.

### C. Elevação de Privilégios de Administrador (UAC)
Como a esteira de georreferenciamento precisa ler portas seriais (RTK USB/COM) e comandar o robô HGO de automação de interface no Windows, o wrapper `ui/app.py` exige de forma nativa e automática direitos administrativos via WinAPI (`ctypes.windll.shell32.IsUserAnAdmin`), re-executando a chamada com privilégios elevados se necessário antes de subir a interface desktop e o servidor local.