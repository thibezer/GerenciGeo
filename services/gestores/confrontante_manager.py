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
    # COALESCE: esquema novo usa c.nome; esquema legado usa pe.nome via pessoa_id
    cursor.execute(
        f"""SELECT c.id, COALESCE({sql_nome_confrontante('c', 'pe')}, '') as nome,
                  c.matricula_imovel, c.cns_confrontante
           FROM confrontantes c
           LEFT JOIN pessoas pe ON c.pessoa_id = pe.id
           WHERE c.levantamento_id = ?""",
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
            pessoa_id = criar_pessoa_basica(cursor, final_nome)

            cursor.execute(
                "INSERT INTO confrontantes (pessoa_id, levantamento_id, nome, matricula_imovel, cns_confrontante, origem) VALUES (?, ?, ?, ?, ?, 'auto')",
                (pessoa_id, levantamento_id, final_nome, matricula_conf if matricula_conf else None, cns_conf if cns_conf else None)
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
        f"""SELECT c.id, COALESCE({sql_nome_confrontante('c', 'pe')}, '') as nome, c.matricula_imovel
           FROM confrontantes c
           LEFT JOIN pessoas pe ON c.pessoa_id = pe.id
           WHERE c.levantamento_id = ?""",
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


# ── Núcleo de identidade/limpeza de confrontantes e pessoas ───────────────────
# Fonte única das regras usadas pelas rotas (formulário, vértice, sync CAD, importadores) para que um mesmo
# vizinho nunca vire dois registros e nenhuma operação apague ou sobrescreva dados de outra pessoa.

from utils.validadores import normalizar_nome  # noqa: E402


def sql_nome_confrontante(c: str = "c", p: str = "p") -> str:
    """Expressão SQL ÚNICA do nome do confrontante: o nome gravado no registro; se vazio, o da pessoa vinculada.
    `c` = alias de confrontantes, `p` = alias de pessoas (já unida por LEFT JOIN)."""
    return f"COALESCE(NULLIF(TRIM({c}.nome), ''), {p}.nome)"


SQL_NOME_CONFRONTANTE = sql_nome_confrontante()

ORIGENS_CONFRONTANTE = ("sigef", "manual", "auto")  # NULL = legado/desconhecido


def nome_padrao(nome) -> bool:
    """True para nomes gerados automaticamente (nada que o usuário tenha digitado como cadastro)."""
    n = normalizar_nome(nome)
    return n in ("", "CONFRONTANTE") or n.startswith("CONFRONTANTE DA MATRICULA") or n.startswith("VIZINHO SIGEF")


def criar_pessoa_basica(cursor, nome: str) -> int:
    """Pessoa só com o nome (vizinho ainda sem qualificação). Gênero fica NULL = não informado."""
    cursor.execute("INSERT INTO pessoas (nome, genero, genero_conjuge) VALUES (?, NULL, NULL)", (nome,))
    return cursor.lastrowid


def get_or_create_confrontante(cursor, levantamento_id: int, nome: str, matricula: str = None, cns: str = None,
                               tipo_relacao: str = "Divisa", origem: str = "auto"):
    """Devolve (confrontante_id, criado) reaproveitando o confrontante do levantamento com o mesmo nome
    (comparação normalizada: sem acento, caixa e espaços) e matrícula compatível.

    - mesma matrícula normalizada -> mesmo confrontante; matrículas diferentes -> registros diferentes;
    - candidato sem matrícula recebe a matrícula/CNS informadas (completa o cadastro);
    - nada existindo, cria pessoa + confrontante (uma pessoa por vizinho)."""
    nome_limpo = re.sub(r"\s+", " ", (nome or "").strip())
    matricula = (matricula or "").strip() or None
    cns = (cns or "").strip() or None
    if not nome_limpo:
        nome_limpo = f"Confrontante da Matrícula {matricula}" if matricula else "Confrontante"
    chave = normalizar_nome(nome_limpo)
    mat_norm = normalizar_matricula(matricula) if matricula else ""

    cursor.execute(
        f"""SELECT c.id, {SQL_NOME_CONFRONTANTE} AS nome, c.matricula_imovel, c.cns_confrontante
            FROM confrontantes c LEFT JOIN pessoas p ON p.id = c.pessoa_id
            WHERE c.levantamento_id = ? ORDER BY c.id""",
        (levantamento_id,),
    )
    candidatos = [tuple(r) for r in cursor.fetchall() if normalizar_nome(r[1]) == chave]

    escolhido = None
    for r in candidatos:
        mat_c = normalizar_matricula(r[2]) if (r[2] or "").strip() else ""
        if mat_norm and mat_c == mat_norm:
            escolhido = r
            break
        if not mat_norm and not mat_c and escolhido is None:
            escolhido = r
    if escolhido is None and mat_norm:
        # o informado tem matrícula: pode completar um candidato que ainda não tem nenhuma
        escolhido = next((r for r in candidatos if not (r[2] or "").strip()), None)
    if escolhido is None and not mat_norm and candidatos:
        escolhido = candidatos[0]

    if escolhido is not None:
        cid = escolhido[0]
        if matricula and not (escolhido[2] or "").strip():
            cursor.execute("UPDATE confrontantes SET matricula_imovel = ? WHERE id = ?", (matricula, cid))
        if cns and not (escolhido[3] or "").strip():
            cursor.execute("UPDATE confrontantes SET cns_confrontante = ? WHERE id = ?", (cns, cid))
        return cid, False

    pessoa_id = criar_pessoa_basica(cursor, nome_limpo)
    cursor.execute(
        """INSERT INTO confrontantes (pessoa_id, levantamento_id, nome, tipo_relacao, matricula_imovel, cns_confrontante, origem)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (pessoa_id, levantamento_id, nome_limpo, tipo_relacao, matricula, cns, origem),
    )
    return cursor.lastrowid, True


# Tabelas/colunas que apontam para pessoas: descobertas pelas FKs do esquema, mais colunas sem FK declarada.
_REFERENCIAS_EXTRAS_PESSOA = (("pessoas", "representante_legal_id"),)


def referencias_a_pessoa(cursor):
    refs = set(_REFERENCIAS_EXTRAS_PESSOA)
    cursor.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    for (tabela,) in cursor.fetchall():
        cursor.execute(f"PRAGMA foreign_key_list({tabela})")
        for fk in cursor.fetchall():
            if fk[2] == "pessoas":
                refs.add((tabela, fk[3]))
    return sorted(refs)


def contar_usos_pessoa(cursor, pessoa_id: int, ignorar_confrontante_id: int = None) -> int:
    """Quantos registros (clientes, confrontantes, coproprietários, documentos, representantes...) usam a pessoa.
    `ignorar_confrontante_id` desconta o próprio confrontante em edição (e os coproprietários dele)."""
    total = 0
    for tabela, coluna in referencias_a_pessoa(cursor):
        sql = f"SELECT COUNT(*) FROM {tabela} WHERE {coluna} = ?"
        params = [pessoa_id]
        if tabela == "confrontantes" and ignorar_confrontante_id is not None:
            sql += " AND id != ?"
            params.append(ignorar_confrontante_id)
        elif tabela == "confrontante_coproprietarios" and ignorar_confrontante_id is not None:
            sql += " AND confrontante_id != ?"
            params.append(ignorar_confrontante_id)
        elif tabela == "pessoas":
            sql += " AND id != ?"
            params.append(pessoa_id)
        cursor.execute(sql, params)
        total += cursor.fetchone()[0] or 0
    return total


def apagar_pessoa_se_orfa(cursor, pessoa_id) -> bool:
    """Apaga a pessoa apenas se NENHUMA outra tabela a referencia. Devolve True se apagou."""
    if not pessoa_id:
        return False
    if contar_usos_pessoa(cursor, pessoa_id) > 0:
        return False
    cursor.execute("DELETE FROM pessoas WHERE id = ?", (pessoa_id,))
    return cursor.rowcount > 0


_CAMPOS_PESSOA_CADASTRO = ("cpf_cnpj", "rg", "profissao", "estado_civil", "regime_bens", "endereco_completo",
                           "nome_conjuge", "cpf_conjuge", "rg_conjuge", "razao_social")


_CAMPOS_IMPORTACAO_SIGEF = ("nome_propriedade", "codigo_incra_imovel", "poligono_wkt", "confrontacoes_json")


def _tem_dados_cadastrais(cursor, cid: int, ignorar_importacao_sigef: bool = False) -> bool:
    """True se o confrontante guarda qualquer dado além de um nome gerado automaticamente.
    Com `ignorar_importacao_sigef`, o que a própria importação de vizinhos grava (polígono, INCRA, nome da
    propriedade) não conta como dado cadastrado: só o que alguém preencheu à mão."""
    cursor.execute("SELECT * FROM confrontantes WHERE id = ?", (cid,))
    linha = cursor.fetchone()
    if linha is None:
        return False
    c = dict(zip([d[0] for d in cursor.description], linha))
    for campo in ("cpf_cnpj", "rg", "profissao", "estado_civil", "regime_bens", "endereco_completo", "nome_conjuge",
                  "cpf_conjuge", "rg_conjuge", "matricula_imovel", "lote", "cns_confrontante", "caminho_matricula_pdf",
                  "nome_propriedade", "codigo_incra_imovel", "poligono_wkt", "confrontacoes_json", "coproprietarios_json"):
        if ignorar_importacao_sigef and campo in _CAMPOS_IMPORTACAO_SIGEF:
            continue
        valor = c.get(campo)
        if valor is not None and str(valor).strip() not in ("", "[]", "null"):
            return True
    if (c.get("tipo_relacao") or "") not in ("", "Divisa", "CONFRONTANTE"):
        return True
    if c.get("pessoa_id"):
        cursor.execute(f"SELECT {', '.join(_CAMPOS_PESSOA_CADASTRO)} FROM pessoas WHERE id = ?", (c["pessoa_id"],))
        p = cursor.fetchone()
        if p and any(v is not None and str(v).strip() for v in p):
            return True
    cursor.execute("SELECT 1 FROM confrontante_coproprietarios WHERE confrontante_id = ? LIMIT 1", (cid,))
    if cursor.fetchone():
        return True
    cursor.execute(
        "SELECT 1 FROM anuencias_confrontantes WHERE confrontante_id = ? AND "
        "(COALESCE(caminho_documento_assinado, '') != '' OR status_anuencia IN ('ASSINADO', 'DISPENSADO')) LIMIT 1",
        (cid,),
    )
    return cursor.fetchone() is not None


def limpar_confrontantes_orfaos(levantamento_id: int, cursor=None, ids: list = None) -> list:
    """Remove os confrontantes do levantamento que ficaram sem divisa E sem dados cadastrais.

    Só são candidatos os criados automaticamente (origem 'auto') ou com nome gerado ('Confrontante', 'Confrontante
    da Matrícula X'); registros 'manual'/'sigef' e qualquer um com CPF, matrícula, PDF, coproprietários, polígono,
    anuência assinada/dispensada etc. NUNCA são apagados. A pessoa vinculada só é apagada se mais nada a usa.
    `ids` restringe a verificação a esses confrontantes. Devolve os ids removidos."""
    if cursor is None:
        from database.connection import DatabaseManager
        with DatabaseManager() as conn:
            removidos = limpar_confrontantes_orfaos(levantamento_id, conn.cursor(), ids)
            conn.commit()
            return removidos

    sql = (
        f"""SELECT c.id, c.pessoa_id, c.origem, {SQL_NOME_CONFRONTANTE} AS nome
            FROM confrontantes c LEFT JOIN pessoas p ON p.id = c.pessoa_id
            WHERE c.levantamento_id = ?
              AND NOT EXISTS (SELECT 1 FROM segmentos s WHERE s.confrontante_id = c.id)
              AND NOT EXISTS (SELECT 1 FROM pontos pt WHERE pt.confrontante_id = c.id)"""
    )
    params = [levantamento_id]
    if ids:
        sql += f" AND c.id IN ({','.join('?' for _ in ids)})"
        params.extend(ids)
    cursor.execute(sql, params)
    removidos = []
    for cid, pessoa_id, origem, nome in cursor.fetchall():
        if origem in ("manual", "sigef"):
            continue
        if origem != "auto" and not nome_padrao(nome):
            continue
        if _tem_dados_cadastrais(cursor, cid):
            continue
        cursor.execute("DELETE FROM confrontantes WHERE id = ?", (cid,))
        removidos.append(cid)
        apagar_pessoa_se_orfa(cursor, pessoa_id)
    return removidos


def limpar_confrontantes_sigef(levantamento_id: int, cursor) -> list:
    """Remove os confrontantes criados pela importação de vizinhos (origem 'sigef') que não têm divisa e que
    ninguém qualificou à mão (CPF, matrícula, PDF, coproprietários...). Confrontantes cadastrados manualmente,
    mesmo com código INCRA, são preservados. Apaga também as pessoas 'Vizinho SIGEF...' que ficariam órfãs.
    Devolve os ids removidos."""
    cursor.execute(
        f"""SELECT c.id, c.pessoa_id, {SQL_NOME_CONFRONTANTE} FROM confrontantes c
           LEFT JOIN pessoas p ON p.id = c.pessoa_id
           WHERE c.levantamento_id = ? AND c.origem = 'sigef'
             AND NOT EXISTS (SELECT 1 FROM segmentos s WHERE s.confrontante_id = c.id)""",
        (levantamento_id,),
    )
    removidos = []
    for cid, pessoa_id, nome in cursor.fetchall():
        # nome que alguém digitou no lugar do 'Vizinho SIGEF - ...' gerado é dado cadastrado
        if not (nome_padrao(nome) or normalizar_nome(nome).startswith("PROPRIETARIO DE")):
            continue
        if _tem_dados_cadastrais(cursor, cid, ignorar_importacao_sigef=True):
            continue
        cursor.execute("UPDATE pontos SET confrontante_id = NULL WHERE confrontante_id = ?", (cid,))
        cursor.execute("DELETE FROM confrontantes WHERE id = ?", (cid,))
        removidos.append(cid)
        apagar_pessoa_se_orfa(cursor, pessoa_id)
    return removidos
