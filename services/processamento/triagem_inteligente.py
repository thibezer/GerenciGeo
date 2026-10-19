import os
import shutil
import time
import math
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

def xyz_to_llh(x, y, z):
    """Converte coordenadas XYZ (ECEF) para Latitude e Longitude (GRS80/SIRGAS 2000)"""
    if abs(x) < 1 or abs(y) < 1: return 0, 0
    a = 6378137.0
    f = 1 / 298.257222101
    b = a * (1 - f)
    e2 = (a**2 - b**2) / a**2
    ep2 = (a**2 - b**2) / b**2
    p = math.sqrt(x**2 + y**2)
    th = math.atan2(a * z, b * p)
    lon = math.atan2(y, x)
    lat = math.atan2(z + ep2 * b * (math.sin(th)**3), p - e2 * a * (math.cos(th)**3))
    return math.degrees(lat), math.degrees(lon)

def ler_metadados_rinex(caminho_arquivo):
    metadados = {
        'arquivo': caminho_arquivo, 
        'marcador': 'DESCONHECIDO', 
        'inicio': None, 
        'fim': None,
        'lat': 0.0,
        'lon': 0.0
    }
    
    # 0. Barreira de Segurança: Impede a leitura de arquivos binários
    if caminho_arquivo.upper().endswith(".GNS") or caminho_arquivo.upper().endswith(".ZHD"):
        return metadados

    try:
        # 1. Leitura do cabeçalho baseada nas colunas oficiais do formato RINEX
        with open(caminho_arquivo, 'r', encoding='utf-8', errors='ignore') as f:
            for linha in f:
                # Linhas válidas de cabeçalho RINEX devem ter no mínimo 60 caracteres
                if len(linha) < 60:
                    continue
                    
                conteudo = linha[:60].strip()
                rotulo = linha[60:].strip()
                
                if "END OF HEADER" in rotulo:
                    break
                    
                if "MARKER NAME" in rotulo and conteudo:
                    metadados['marcador'] = conteudo
                    
                elif "APPROX POSITION XYZ" in rotulo:
                    try:
                        partes = conteudo.split()
                        x, y, z = float(partes[0]), float(partes[1]), float(partes[2])
                        metadados['lat'], metadados['lon'] = xyz_to_llh(x, y, z)
                    except Exception as e:
                        logger.debug(f"Erro ao ler APPROX POSITION XYZ: {e}")
                        
                elif "TIME OF FIRST OBS" in rotulo:
                    try:
                        partes = conteudo.split()
                        metadados['inicio'] = datetime(int(partes[0]), int(partes[1]), int(partes[2]), int(partes[3]), int(partes[4]), int(float(partes[5])))
                    except Exception as e:
                        logger.debug(f"Erro ao ler TIME OF FIRST OBS: {e}")
                        
                elif "TIME OF LAST OBS" in rotulo:
                    try:
                        partes = conteudo.split()
                        metadados['fim'] = datetime(int(partes[0]), int(partes[1]), int(partes[2]), int(partes[3]), int(partes[4]), int(float(partes[5])))
                    except Exception as e:
                        logger.debug(f"Erro ao ler TIME OF LAST OBS: {e}")

        # 2. Fallback rigoroso para buscar o FIM do rastreio
        if not metadados['fim'] and metadados['inicio']:
            try:
                # Evita crash de IO limitando a leitura ao tamanho real do arquivo
                tamanho_arq = os.path.getsize(caminho_arquivo)
                offset = min(8000, tamanho_arq) 
                
                with open(caminho_arquivo, 'rb') as f:
                    f.seek(-offset, 2)
                    linhas_finais = f.read().decode('utf-8', errors='ignore').splitlines()
                    
                    for linha in reversed(linhas_finais):
                        # Padrão RINEX 3
                        if linha.startswith("> "):
                            p = linha[2:].split()
                            if len(p) >= 6:
                                try:
                                    metadados['fim'] = datetime(int(p[0]), int(p[1]), int(p[2]), int(p[3]), int(p[4]), int(float(p[5])))
                                    break
                                except Exception as e:
                                    logger.debug(f"Erro ao converter data fim fallback RINEX 3: {e}")
                        # Padrão RINEX 2: Busca garantida usando fatiamento da string
                        elif len(linha) >= 26:
                            ano_str = linha[0:3].strip()
                            mes_str = linha[3:6].strip()
                            dia_str = linha[6:9].strip()
                            hr_str  = linha[9:12].strip()
                            min_str = linha[12:15].strip()
                            seg_str = linha[15:26].strip()
                            
                            if ano_str.isdigit() and mes_str.isdigit() and dia_str.isdigit():
                                try:
                                    ano = int(ano_str)
                                    ano = ano + 2000 if ano < 80 else (ano + 1900 if ano < 100 else ano)
                                    # Validação temporal lógica
                                    mes, dia = int(mes_str), int(dia_str)
                                    if 1 <= mes <= 12 and 1 <= dia <= 31:
                                        metadados['fim'] = datetime(ano, mes, dia, int(hr_str), int(min_str), int(float(seg_str)))
                                        break
                                except Exception as e:
                                    logger.debug(f"Erro ao converter data fim fallback RINEX 2: {e}")
            except Exception as e:
                print(f"[TRIAGEM] Erro no Fallback: {e}")
                
            # Fallback do fallback
            if not metadados['fim']:
                metadados['fim'] = datetime.fromtimestamp(os.path.getmtime(caminho_arquivo))
                
        return metadados
        return metadados
    except Exception as e:
        print(f"[TRIAGEM] Erro de leitura em {caminho_arquivo}: {e}")
        return None

def copiar_original_gns(caminho_rinex, pasta_destino):
    """Tenta localizar o arquivo .GNS original na pasta pai e copia para o destino"""
    try:
        # A pasta_origem do rinex é 'Rinex_Temporario', a pasta raiz é o nível acima
        pasta_temp = os.path.dirname(caminho_rinex)
        pasta_raiz = os.path.dirname(pasta_temp)
        nome_base = os.path.splitext(os.path.basename(caminho_rinex))[0]
        
        # Remove sufixos comuns de rinex (ex: '24o' -> o '24' some)
        # Se o nome for 'PONTO1_24o', o nome base é 'PONTO1_24'
        # Vamos tentar um match aproximado
        for f in os.listdir(pasta_raiz):
            if f.lower().startswith(nome_base[:8].lower()) and f.lower().endswith(".gns"):
                origem_gns = os.path.join(pasta_raiz, f)
                shutil.copy2(origem_gns, pasta_destino)
                return True
    except Exception as e:
        logger.debug(f"Erro ao copiar arquivo GNS original: {e}")
    return False

def organizar_rastreios(pasta_origem, pasta_destino_hgo, msg_queue=None):
    time.sleep(2) 
    
    arquivos_obs = [a for a in os.listdir(pasta_origem) if a.lower().endswith("o") or a.lower().endswith(".obs")]
    
    if msg_queue:
        msg_queue.put({"tipo": "log", "mensagem": f"[TRIAGEM] Encontrados {len(arquivos_obs)} arquivos RINEX para análise."})

    rastreios = []
    
    for arquivo in arquivos_obs:
        caminho_completo = os.path.join(pasta_origem, arquivo)
        dados = ler_metadados_rinex(caminho_completo)
        
        if dados and dados['inicio'] and dados['fim']:
            dados['duracao'] = (dados['fim'] - dados['inicio']).total_seconds()
            dados['rovers'] = []
            rastreios.append(dados)
            
    if not rastreios:
        if msg_queue: msg_queue.put({"tipo": "log", "mensagem": "[TRIAGEM] AVISO: Nenhum metadado temporal válido encontrado."})
        return []

    rastreios.sort(key=lambda x: x['duracao'], reverse=True)
    
    bases = []
    rovers_orfaos = []
    
    for r in rastreios:
        foi_agrupado = False
        for b in bases:
            if b['inicio'] <= r['inicio'] and b['fim'] >= r['fim']:
                b['rovers'].append(r)
                foi_agrupado = True
                break
        
        if not foi_agrupado:
            # Eleição inteligente de base (Item 7)
            marcador_upper = str(r.get('marcador', '')).upper()
            contem_termo_base = "BASE" in marcador_upper or "PPP" in marcador_upper or marcador_upper.startswith("M-") or marcador_upper.startswith("M_") or marcador_upper == 'DESCONHECIDO'
            
            if len(bases) == 0:
                bases.append(r)
            elif r['duracao'] >= 7200 or (r['duracao'] >= 3600 and contem_termo_base):
                bases.append(r)
            else:
                rovers_orfaos.append(r)
            
    for base in bases:
        nome_pasta = f"Pronto_HGO_Base_{base['marcador']}_{base['inicio'].strftime('%Y%m%d')}"
        caminho_pasta_hgo = os.path.join(pasta_destino_hgo, nome_pasta)
        os.makedirs(caminho_pasta_hgo, exist_ok=True)
        
        try:
            shutil.copy2(base['arquivo'], caminho_pasta_hgo)
            copiar_original_gns(base['arquivo'], caminho_pasta_hgo)
        except shutil.SameFileError:
            pass
        except Exception as e:
            logger.error(f"Erro ao copiar arquivos base para HGO: {e}")
            
        for rover in base['rovers']:
            try:
                shutil.copy2(rover['arquivo'], caminho_pasta_hgo)
                copiar_original_gns(rover['arquivo'], caminho_pasta_hgo)
            except shutil.SameFileError:
                pass
            except Exception as e:
                logger.error(f"Erro ao copiar arquivos rover para HGO: {e}")
                
    if msg_queue:
        msg_queue.put({"tipo": "log", "mensagem": f"[TRIAGEM] Identificada(s) {len(bases)} Base(s) e alocados os Rovers."})
def gerar_alertas_integridade():
    from database.connection import execute_query
    
    alertas = []

    # 0. Mapeia levantamentos ativos com pasta física existente no disco
    # Blindagem: se um projeto foi excluído ou arquivado/concluído, seus alertas NÃO devem ser exibidos
    levs_query = "SELECT id, pasta_projeto FROM levantamentos WHERE status = 'EM_ANDAMENTO' AND pasta_projeto IS NOT NULL"
    try:
        levs_ativos = [dict(r) for r in execute_query(levs_query, fetch_all=True)]
    except Exception as e:
        logger.error(f"Erro ao buscar levantamentos ativos: {e}")
        levs_ativos = []

    pastas_ativas_map = {}
    for l in levs_ativos:
        pasta = l.get('pasta_projeto')
        if pasta and os.path.exists(pasta):
            pastas_ativas_map[l['id']] = os.path.normpath(pasta).lower()

    lev_ids = list(pastas_ativas_map.keys())
    if not lev_ids:
        # Se não há levantamentos em andamento com pasta ativa, não gera alertas
        return []

    placeholders = ", ".join(["?"] * len(lev_ids))

    # 1. Arquivos Críticos: Apenas arquivos que ainda existem fisicamente no disco e pertencem a levantamentos ativos
    criticos_query = """
        SELECT id, arquivo_nome, arquivo_tamanho, sucesso, arquivo_path 
        FROM historico_rinex 
        WHERE sucesso = 0 OR arquivo_tamanho < 51200
    """
    try:
        criticos = [dict(r) for r in execute_query(criticos_query, fetch_all=True)]
    except Exception as e:
        logger.error(f"Erro ao buscar alertas criticos: {e}")
        criticos = []
        
    for c in criticos:
        p = c.get('arquivo_path')
        # Ignora arquivos inexistentes (de projetos ou diretórios que foram excluídos)
        if not p or not os.path.exists(p):
            continue
        p_norm = os.path.normpath(p).lower()
        lev_id_pertence = next((lid for lid, pasta in pastas_ativas_map.items() if p_norm.startswith(pasta)), None)
        if not lev_id_pertence:
            continue
        # Se o arquivo foi convertido com sucesso posteriormente, ignora o log de falha antigo
        sucesso_posterior = execute_query(
            "SELECT id FROM historico_rinex WHERE arquivo_nome = ? AND sucesso = 1 AND id > ?",
            params=(c['arquivo_nome'], c['id']), fetch_one=True
        )
        if sucesso_posterior:
            continue

        motivo = "Falha no processamento" if not c.get('sucesso') else "Arquivo < 50KB"
        alertas.append({
            "tipo": "CRITICO",
            "icone": "alert-circle",
            "titulo": f"RINEX Crítico: {c['arquivo_nome']}",
            "mensagem": f"Arquivo {c['arquivo_nome']}: {motivo}",
            "acao": {
                "tipo": "rota",
                "destino": "#hgo",
                "rotulo": "Abrir HGO",
                "levantamento_id": lev_id_pertence
            }
        })
        
    # 2. Fluxo Incompleto: Vértices com RINEX mas sem resultado PPP associado (estritamente de levantamentos ativos)
    incompletos_query = f"""
        SELECT p.nome_vertice, p.arquivo_rinex, p.levantamento_id 
        FROM pontos p
        JOIN levantamentos l ON p.levantamento_id = l.id
        WHERE l.status = 'EM_ANDAMENTO'
          AND p.levantamento_id IN ({placeholders})
          AND p.arquivo_rinex IS NOT NULL 
          AND p.arquivo_resultado_ppp IS NULL
    """
    try:
        incompletos = [dict(r) for r in execute_query(incompletos_query, params=tuple(lev_ids), fetch_all=True)]
    except Exception as e:
        logger.error(f"Erro ao buscar alertas incompletos: {e}")
        incompletos = []
        
    for inc in incompletos:
        alertas.append({
            "tipo": "ALERTA",
            "icone": "alert-circle",
            "titulo": f"Vértice {inc['nome_vertice']} sem PPP",
            "mensagem": f"Levantamento #{inc['levantamento_id']}: Ponto {inc['nome_vertice']} tem RINEX mas sem resultado PPP.",
            "acao": {
                "tipo": "rota",
                "destino": "#levantamentos",
                "rotulo": "Ir ao Levantamento",
                "levantamento_id": inc.get('levantamento_id')
            }
        })

    # 2.1. Validação de Tempo Mínimo de Rastreio da Base (Item 12 - INCRA exige min 2h / 7200s)
    try:
        query_bases_duracao = f"""
            SELECT p.nome_vertice, p.arquivo_rinex, p.levantamento_id, l.pasta_projeto
            FROM pontos p
            JOIN levantamentos l ON p.levantamento_id = l.id
            WHERE (p.tipo_ponto = 'M' OR p.tipo_ponto = 'B') 
              AND p.arquivo_rinex IS NOT NULL 
              AND l.status = 'EM_ANDAMENTO'
              AND p.levantamento_id IN ({placeholders})
        """
        bases_ativas = [dict(r) for r in execute_query(query_bases_duracao, params=tuple(lev_ids), fetch_all=True)]
        for b in bases_ativas:
            if b['pasta_projeto']:
                caminho_rinex = os.path.join(b['pasta_projeto'], "Rinex", b['arquivo_rinex'])
                if os.path.exists(caminho_rinex):
                    meta = ler_metadados_rinex(caminho_rinex)
                    if meta and meta['inicio'] and meta['fim']:
                        duracao = (meta['fim'] - meta['inicio']).total_seconds()
                        if duracao < 7200:
                            alertas.append({
                                "tipo": "ALERTA",
                                "icone": "clock",
                                "titulo": f"Rastreio Insuficiente: {b['nome_vertice']}",
                                "mensagem": f"Levantamento #{b['levantamento_id']}: Base '{b['nome_vertice']}' com rastreio de {duracao/3600:.2f}h (mínimo exigido: 2h).",
                                "acao": {
                                    "tipo": "rota",
                                    "destino": "#levantamentos",
                                    "rotulo": "Ir ao Levantamento",
                                    "levantamento_id": b.get('levantamento_id')
                                }
                            })
    except Exception as e_rastreio:
        logger.error(f"Erro na validação de tempo mínimo de rastreio: {e_rastreio}")
        
    # 3. Segmentos sem confrontantes vinculados (agrupados por levantamento ativo para evitar poluição visual)
    segmentos_sem_confrontante_query = f"""
        SELECT s.levantamento_id, COUNT(*) as total_sem_conf,
               MIN(p_ini.nome_vertice) as exemplo_ini, MIN(p_fim.nome_vertice) as exemplo_fim
        FROM segmentos s
        JOIN levantamentos l ON s.levantamento_id = l.id
        JOIN pontos p_ini ON s.ponto_inicio_id = p_ini.id
        JOIN pontos p_fim ON s.ponto_fim_id = p_fim.id
        WHERE l.status = 'EM_ANDAMENTO'
          AND s.levantamento_id IN ({placeholders})
          AND s.confrontante_id IS NULL
        GROUP BY s.levantamento_id
    """
    try:
        seg_sem_conf = [dict(r) for r in execute_query(segmentos_sem_confrontante_query, params=tuple(lev_ids), fetch_all=True)]
    except Exception as e:
        logger.error(f"Erro ao buscar segmentos sem confrontante: {e}")
        seg_sem_conf = []
        
    for seg in seg_sem_conf:
        total = seg['total_sem_conf']
        alertas.append({
            "tipo": "ALERTA",
            "icone": "user-x",
            "titulo": f"{total} Divisa(s) sem Confrontante",
            "mensagem": f"Levantamento #{seg['levantamento_id']}: {total} divisa(s) sem confrontante vinculado (ex: {seg['exemplo_ini']} a {seg['exemplo_fim']}).",
            "acao": {
                "tipo": "rota",
                "destino": "#levantamentos",
                "rotulo": "Ir ao Levantamento",
                "levantamento_id": seg.get('levantamento_id')
            }
        })

    # 4. Pontos órfãos (vértices de perímetro que não compõem nenhuma divisa, agrupados por levantamento ativo)
    pontos_orfaos_query = f"""
        SELECT p.levantamento_id, COUNT(*) as total_orfaos, MIN(p.nome_vertice) as exemplo_vertice
        FROM pontos p
        JOIN levantamentos l ON p.levantamento_id = l.id
        WHERE l.status = 'EM_ANDAMENTO'
          AND p.levantamento_id IN ({placeholders})
          AND (p.ignorar_poligono IS NULL OR p.ignorar_poligono = 0)
          AND (p.tipo_ponto NOT IN ('M', 'B') OR p.tipo_ponto IS NULL)
          AND NOT EXISTS (
            SELECT 1 FROM segmentos s
            WHERE s.levantamento_id = p.levantamento_id
              AND (s.ponto_inicio_id = p.id OR s.ponto_fim_id = p.id)
          )
        GROUP BY p.levantamento_id
    """
    try:
        pts_orfaos = [dict(r) for r in execute_query(pontos_orfaos_query, params=tuple(lev_ids), fetch_all=True)]
    except Exception as e:
        logger.error(f"Erro ao buscar pontos orfaos: {e}")
        pts_orfaos = []

    for pt in pts_orfaos:
        total = pt['total_orfaos']
        alertas.append({
            "tipo": "ALERTA",
            "icone": "map-pin",
            "titulo": f"{total} Vértice(s) sem Perímetro",
            "mensagem": f"Levantamento #{pt['levantamento_id']}: {total} vértice(s) não compõem nenhuma divisa (ex: {pt['exemplo_vertice']}).",
            "acao": {
                "tipo": "rota",
                "destino": "#levantamentos",
                "rotulo": "Ir ao Levantamento",
                "levantamento_id": pt.get('levantamento_id')
            }
        })

    # 5. Arquivos Brutos não convertidos (apenas de levantamentos ativos)
    try:
        for lev in levs_ativos:
            if lev['id'] not in lev_ids:
                continue
            pasta_brutos = os.path.join(lev['pasta_projeto'], "Brutos")
            pasta_rinex = os.path.join(lev['pasta_projeto'], "Rinex")
            
            if os.path.exists(pasta_brutos):
                arquivos_brutos = [f for f in os.listdir(pasta_brutos) if f.upper().endswith('.GNS') or f.upper().endswith('.ZHD')]
                arquivos_rinex = []
                if os.path.exists(pasta_rinex):
                    arquivos_rinex = [f for f in os.listdir(pasta_rinex) if f.upper().endswith('.OBS') or f.lower().endswith('o')]
                
                brutos_nao_convertidos = []
                for bruto in arquivos_brutos:
                    nome_base_bruto = os.path.splitext(bruto)[0].lower()
                    tem_correspondente = any(
                        r.lower().startswith(nome_base_bruto) and (r.lower().endswith('.obs') or r.lower().endswith('o'))
                        for r in arquivos_rinex
                    )
                    if not tem_correspondente:
                        brutos_nao_convertidos.append(bruto)
                
                if brutos_nao_convertidos:
                    alertas.append({
                        "tipo": "ALERTA",
                        "icone": "folder",
                        "titulo": f"{len(brutos_nao_convertidos)} Bruto(s) Pendente(s)",
                        "mensagem": f"Levantamento #{lev['id']}: Arquivos brutos sem correspondente RINEX: {', '.join(brutos_nao_convertidos[:3])}{'...' if len(brutos_nao_convertidos) > 3 else ''}.",
                        "acao": {
                            "tipo": "rota",
                            "destino": "#hgo",
                            "rotulo": "Abrir HGO",
                            "levantamento_id": lev.get('id')
                        }
                    })
    except Exception as e:
        logger.error(f"Erro ao buscar arquivos brutos nao convertidos: {e}")

    # 6. Alerta dinâmico de fuso UTM (Meridiano Central - apenas levantamentos ativos)
    try:
        pontos_query = f"SELECT levantamento_id, lon FROM pontos WHERE levantamento_id IN ({placeholders}) AND lon IS NOT NULL"
        pts = execute_query(pontos_query, params=tuple(lev_ids), fetch_all=True)

        from collections import defaultdict
        pts_by_lev = defaultdict(list)
        for p in pts:
            pts_by_lev[str(p['levantamento_id'])].append(p['lon'])
            
        for lev_id in lev_ids:
            lons = pts_by_lev.get(str(lev_id))
            if lons:
                lon_media = sum(lons) / len(lons)
                fuso_derivado = int((lon_media + 180) / 6) + 1
                mc_derivado = fuso_derivado * 6 - 183
                fuso_configurado = 22

                if fuso_derivado != fuso_configurado:
                    mc_derivado_str = f"{abs(mc_derivado)} W" if mc_derivado < 0 else f"{mc_derivado} E"
                    alertas.append({
                        "tipo": "ALERTA",
                        "icone": "compass",
                        "titulo": f"Divergência de Fuso UTM",
                        "mensagem": f"Levantamento #{lev_id}: Fuso UTM derivado ({fuso_derivado} - MC {mc_derivado_str}) difere do fuso 22 (MC 51 W).",
                        "acao": {
                            "tipo": "rota",
                            "destino": "#levantamentos",
                            "rotulo": "Ir ao Levantamento",
                            "levantamento_id": lev_id
                        }
                    })
    except Exception as e:
        logger.error(f"Erro na checagem de fuso UTM: {e}")

    return alertas