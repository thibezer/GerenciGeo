"""
business/confrontante_manager.py — Motor de Resolução e Gestão de Confrontantes
"""
import re
import unicodedata
import logging

logger = logging.getLogger(__name__)

def extrair_nome_confrontante_limpo(descritivo: str) -> str:
    """
    Extrai nome limpo do campo descritivo do confrontante (coluna L da planilha INCRA).
    Usado como FALLBACK quando não há número de matrícula (coluna K) preenchido.
    Exemplos de saída: 'ESTRADA MUNICIPAL YARA', 'RIO PARANÁ'
    """
    if not descritivo:
        return None

    match_prop = re.search(r'propriedade\s+de\s+([^,;\n\(\)]+)', descritivo, re.IGNORECASE)
    if match_prop:
        nome = match_prop.group(1).strip()
    else:
        match_posse = re.search(r'posse\s+de\s+([^,;\n\(\)]+)', descritivo, re.IGNORECASE)
        if match_posse:
            nome = match_posse.group(1).strip()
        else:
            parts = re.split(r'[,;\n\(\)]', descritivo)
            first_part = parts[0].strip() if parts else ""
            if first_part and len(first_part) < 60:
                nome = first_part
            else:
                nome = None

    if nome:
        nome = re.sub(r'\s+', ' ', nome).strip()
        if len(nome) >= 3:
            return nome
    return None

def normalizar_texto_busca(texto: str) -> str:
    """Remove acentos, espaços múltiplos e padroniza caixa para busca segura"""
    if not texto: return ""
    texto = "".join(ch for ch in unicodedata.normalize('NFKD', texto) if not unicodedata.combining(ch))
    return re.sub(r'\s+', ' ', texto.strip().upper())

def normalizar_matricula(matricula: str) -> str:
    """
    Normaliza o número de matrícula para fins de comparação e desduplicação.
    Remove acentos, converte para maiúsculas, remove termos comuns (Matrícula, Mat, etc.),
    remove caracteres não alfanuméricos e remove zeros à esquerda.
    """
    if not matricula:
        return ""
    # Converter para string e limpar espacos nas pontas
    texto = str(matricula).strip()
    
    # Remover termos comuns no início antes de normalizar Unicode (preservando caracteres como Nº)
    texto = re.sub(r'^(MATRICULA|MAT\.|MAT\b|Nº|N\.|M\-|\bM\b|REG\.|REG\b)\s*', '', texto, flags=re.IGNORECASE)
    
    # Converter para maiúsculas e remover acentos/decompor Unicode
    texto = "".join(ch for ch in unicodedata.normalize('NFKD', texto) if not unicodedata.combining(ch))
    texto = texto.upper().strip()
    
    # Caso venha grafado como "NO" (resultado da normalizacao de Nº) ou "N"
    texto = re.sub(r'^(MATRICULA|MAT\.|MAT\b|NO|N\.|M\-|\bM\b|REG\.|REG\b)\s*', '', texto)
    
    # Remover qualquer caractere não alfanumérico (pontos, barras, traços, espaços, etc.)
    texto = re.sub(r'[^A-Z0-9]', '', texto)
    
    # Remover zeros à esquerda
    texto = re.sub(r'^0+', '', texto)
    
    if not texto:
        return "0"
        
    return texto

def resolver_confrontantes_planilha(levantamento_id: int, pontos_ordenados: list, cursor) -> dict:
    """
    Motor de Resolução de Confrontantes (Single-Pass Cache) refinado.
    Analisa os pontos detectados no ODS e associa ou insere os confrontantes de forma desduplicada,
    evitando mesclar confrontantes com o mesmo nome mas matrículas diferentes.
    """
    # 1. Carregar todos os confrontantes do levantamento
    cursor.execute(
        "SELECT id, nome, matricula_imovel, cns_confrontante FROM confrontantes WHERE levantamento_id = ?",
        (levantamento_id,)
    )
    confrontantes_existentes = cursor.fetchall()
    
    # Montar caches em memória para desduplicação rápida
    # Para buscas por matrícula normalizada:
    cache_por_matricula = {}
    # Para buscas por nome (pode ter múltiplos IDs se houver matrículas diferentes, então guardamos como lista)
    cache_por_nome = {}
    
    for c_row in confrontantes_existentes:
        c_id = c_row["id"]
        c_nome_norm = normalizar_texto_busca(c_row["nome"])
        c_mat = (c_row["matricula_imovel"] or "").strip().upper()
        c_mat_norm = normalizar_matricula(c_mat)
        
        if c_mat_norm:
            cache_por_matricula[c_mat_norm] = c_id
        if c_nome_norm:
            if c_nome_norm not in cache_por_nome:
                cache_por_nome[c_nome_norm] = []
            cache_por_nome[c_nome_norm].append({
                "id": c_id,
                "matricula": c_mat
            })

    mapa_vertices_confrontante_id = {}
    
    # 2. Resolver cada ponto
    for p in pontos_ordenados:
        matricula_conf = (p.get("matricula_confrontante") or "").strip().upper()
        matricula_conf_norm = normalizar_matricula(matricula_conf)
        cns_conf = (p.get("cns_confrontante") or "").strip()
        desc = (p.get("confrontante_descritivo") or "").strip()
        nome_conf = extrair_nome_confrontante_limpo(desc)
        nome_conf_norm = normalizar_texto_busca(nome_conf)
        
        if not matricula_conf and not nome_conf:
            continue
            
        confrontante_id_resolvido = None
        
        # A. 1ª Opção: Busca pela Matrícula Confrontante Normalizada
        if matricula_conf_norm and matricula_conf_norm in cache_por_matricula:
            confrontante_id_resolvido = cache_por_matricula[matricula_conf_norm]
            # Atualiza dados auxiliares (nome, cns) se preenchidos
            if nome_conf and nome_conf_norm != matricula_conf_norm:
                cursor.execute(
                    "UPDATE confrontantes SET nome = ?, cns_confrontante = COALESCE(cns_confrontante, ?) WHERE id = ?",
                    (nome_conf, cns_conf if cns_conf else None, confrontante_id_resolvido)
                )
            elif cns_conf:
                cursor.execute(
                    "UPDATE confrontantes SET cns_confrontante = COALESCE(cns_confrontante, ?) WHERE id = ?",
                    (cns_conf, confrontante_id_resolvido)
                )
        
        # B. 2ª Opção: Busca pelo nome com validação de matrícula
        elif nome_conf_norm and nome_conf_norm in cache_por_nome:
            # Temos confrontantes cadastrados com esse nome. Vamos analisar se algum serve.
            candidatos = cache_por_nome[nome_conf_norm]
            pode_usar_candidato = None
            
            for cand in candidatos:
                cand_mat = cand["matricula"]
                cand_mat_norm = normalizar_matricula(cand_mat)
                
                if not matricula_conf:
                    # Se na planilha a matrícula está vazia, preferimos o que também não tem matrícula
                    if not cand_mat:
                        pode_usar_candidato = cand["id"]
                        break
                    else:
                        # Se todos têm matrícula, mas a planilha não tem, podemos usar o primeiro
                        # como fallback, ou deixar para o final do loop
                        if pode_usar_candidato is None:
                            pode_usar_candidato = cand["id"]
                else:
                    # Se na planilha temos matrícula, mas o existente não tem matrícula
                    if not cand_mat:
                        pode_usar_candidato = cand["id"]
                        # Vamos atualizar a matrícula desse candidato existente para a nova informada
                        cursor.execute(
                            "UPDATE confrontantes SET matricula_imovel = ?, cns_confrontante = COALESCE(cns_confrontante, ?) WHERE id = ?",
                            (matricula_conf, cns_conf if cns_conf else None, cand["id"])
                        )
                        cand["matricula"] = matricula_conf
                        cache_por_matricula[matricula_conf_norm] = cand["id"]
                        break
                    elif cand_mat_norm == matricula_conf_norm:
                        pode_usar_candidato = cand["id"]
                        break
            
            if pode_usar_candidato:
                confrontante_id_resolvido = pode_usar_candidato
            else:
                # Se não puder usar nenhum existente (pois têm matrículas diferentes), força criação de um novo
                confrontante_id_resolvido = None
                
        # C. 3ª Opção: Inserir novo confrontante
        if not confrontante_id_resolvido:
            final_nome = nome_conf if nome_conf else f"Confrontante da Matrícula {matricula_conf}"
            cursor.execute(
                "INSERT INTO confrontantes (levantamento_id, nome, matricula_imovel, cns_confrontante) VALUES (?, ?, ?, ?)",
                (levantamento_id, final_nome, matricula_conf if matricula_conf else None, cns_conf if cns_conf else None)
            )
            confrontante_id_resolvido = cursor.lastrowid
            
            # Alimentar caches em tempo de execução
            if matricula_conf_norm:
                cache_por_matricula[matricula_conf_norm] = confrontante_id_resolvido
            if nome_conf_norm:
                if nome_conf_norm not in cache_por_nome:
                    cache_por_nome[nome_conf_norm] = []
                cache_por_nome[nome_conf_norm].append({
                    "id": confrontante_id_resolvido,
                    "matricula": matricula_conf
                })
                
        mapa_vertices_confrontante_id[p["codigo_completo"]] = confrontante_id_resolvido
        
    return mapa_vertices_confrontante_id

def vincular_confrontantes_pontos(levantamento_id: int, pontos_inseridos: list, cursor) -> dict:
    """
    Resolve e vincula os confrontantes aos pontos que foram reassociados a uma matrícula.
    Retorna um mapeamento de codigo_completo para o confrontante_id correto.
    """
    cursor.execute(
        "SELECT id, nome, matricula_imovel FROM confrontantes WHERE levantamento_id = ?",
        (levantamento_id,)
    )
    confs_db = [dict(r) for r in cursor.fetchall()]
    
    mapa_vertices_conf = {}
    for p in pontos_inseridos:
        matricula_conf = (p.get("matricula_confrontante") or "").strip().upper()
        matricula_conf_norm = normalizar_matricula(matricula_conf)
        desc = (p.get("confrontante_descritivo") or "").strip()
        nome_conf = extrair_nome_confrontante_limpo(desc)
        nome_conf_norm = normalizar_texto_busca(nome_conf)
        
        conf_id = None
        
        # 1. Tentar encontrar por matrícula
        if matricula_conf_norm:
            for c in confs_db:
                c_mat = (c["matricula_imovel"] or "").strip().upper()
                if normalizar_matricula(c_mat) == matricula_conf_norm:
                    conf_id = c["id"]
                    break
                    
        # 2. Se não achou por matrícula (ou se a matrícula for vazia), tenta por nome
        if not conf_id and nome_conf_norm:
            candidato_sem_mat = None
            candidato_com_mat = None
            for c in confs_db:
                c_nome_norm = normalizar_texto_busca(c["nome"])
                if c_nome_norm == nome_conf_norm:
                    c_mat = (c["matricula_imovel"] or "").strip().upper()
                    c_mat_norm = normalizar_matricula(c_mat)
                    if not c_mat:
                        candidato_sem_mat = c["id"]
                    elif matricula_conf_norm and c_mat_norm == matricula_conf_norm:
                        conf_id = c["id"]
                        break
                    else:
                        if candidato_com_mat is None:
                            candidato_com_mat = c["id"]
            
            if not conf_id:
                conf_id = candidato_sem_mat or candidato_com_mat
                
        mapa_vertices_conf[p["codigo_completo"]] = conf_id
        
    return mapa_vertices_conf
