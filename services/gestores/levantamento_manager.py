import re
import math
import logging
from database.connection import DatabaseManager, execute_query
from services.gestores.cliente_manager import ClienteManager, validar_cpf_cnpj
from services.gestores.workspace_manager import WorkspaceManager
from services.documentacao.exportacao_service import ExportacaoService
from services.processamento.geoprocessamento import geodesic_to_ecef, ecef_to_geodesic, calcular_zona_utm_segura
from pyproj import Transformer

logger = logging.getLogger(__name__)

def cadastrar_cliente(cli_data: dict) -> dict:
    """
    Sanitiza e valida os dados de um novo cliente.
    Efetua o cadastro no banco de dados e metadados.
    Retorna dicionário com sucesso ou erro.
    """
    nome_completo = cli_data.get("nome_completo")
    cpf_cnpj = cli_data.get("cpf_cnpj")
    rg_ie = cli_data.get("rg_ie")
    data_nascimento_fundacao = cli_data.get("data_nascimento_fundacao")
    estado_civil = cli_data.get("estado_civil")
    profissao = cli_data.get("profissao")
    nacionalidade = cli_data.get("nacionalidade")
    nome_conjuge = cli_data.get("nome_conjuge")
    cpf_conjuge = cli_data.get("cpf_conjuge")
    rg_conjuge = cli_data.get("rg_conjuge")
    regime_bens = cli_data.get("regime_bens")
    email = cli_data.get("email")
    telefone = cli_data.get("telefone")
    endereco_completo = cli_data.get("endereco_completo")
    cidade = cli_data.get("cidade")
    estado = cli_data.get("estado")
    cep = cli_data.get("cep")
    sexo = cli_data.get("sexo", "M")
    metadados = cli_data.get("metadados", {})

    # Sanitização de CPF/CNPJ
    cpf_cnpj = re.sub(r'\D', '', cpf_cnpj) if cpf_cnpj else ""
    if cpf_conjuge:
        cpf_conjuge = re.sub(r'\D', '', cpf_conjuge)

    if not validar_cpf_cnpj(cpf_cnpj):
        return {"error": "CPF/CNPJ inválido"}

    try:
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            
            # 1. Verifica se já existe uma pessoa com esse CPF/CNPJ
            pessoa_id = None
            if cpf_cnpj:
                cursor.execute("""
                    SELECT id FROM pessoas 
                    WHERE REPLACE(REPLACE(REPLACE(cpf_cnpj, '.', ''), '-', ''), '/', '') = ?
                """, (cpf_cnpj,))
                row_p = cursor.fetchone()
                if row_p:
                    pessoa_id = row_p[0]
                    # Verifica se essa pessoa já possui papel de cliente comercial
                    cursor.execute("SELECT id FROM clientes WHERE pessoa_id = ?", (pessoa_id,))
                    if cursor.fetchone():
                        return {"error": "CPF/CNPJ já cadastrado"}
            
            # 2. Se não existir, insere os dados da pessoa
            if not pessoa_id:
                cursor.execute("""
                    INSERT INTO pessoas (
                        nome, cpf_cnpj, rg, nacionalidade, profissao, estado_civil, regime_bens, 
                        endereco_completo, nome_conjuge, cpf_conjuge, rg_conjuge
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (nome_completo, cli_data.get("cpf_cnpj"), rg_ie, nacionalidade, profissao, estado_civil, regime_bens, endereco_completo, nome_conjuge, cpf_conjuge, rg_conjuge))
                pessoa_id = cursor.lastrowid
                
            # 3. Insere a associação do cliente apontando para a pessoa
            cursor.execute("""
                INSERT INTO clientes (pessoa_id, profissional_id, email, telefone, cidade, estado, cep, sexo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (pessoa_id, cli_data.get("profissional_id") or 1, email, telefone, cidade, estado, cep, sexo))
            cliente_id = cursor.lastrowid
            
            if metadados:
                for k, v in metadados.items():
                    cursor.execute("INSERT INTO cliente_metadados (id_cliente, chave, valor) VALUES (?, ?, ?)", (cliente_id, k, v))
            conn.commit()
            
        mgr = ClienteManager()
        mgr.verificar_dados_conjuge(cliente_id)
        
        return {"id": cliente_id, "message": "Cliente cadastrado com sucesso"}
    except Exception as e:
        logger.error(f"Erro no cadastro de cliente: {e}")
        return {"error": str(e)}

def atualizar_cliente(cliente_id: int, cli_data: dict) -> dict:
    """
    Sanitiza, valida e atualiza os dados do cliente no banco.
    Registra histórico de auditoria comparativo e sincroniza workspaces de levantamentos ativos.
    """
    nome_completo = cli_data.get("nome_completo")
    cpf_cnpj = cli_data.get("cpf_cnpj")
    rg_ie = cli_data.get("rg_ie")
    data_nascimento_fundacao = cli_data.get("data_nascimento_fundacao")
    estado_civil = cli_data.get("estado_civil")
    profissao = cli_data.get("profissao")
    nacionalidade = cli_data.get("nacionalidade")
    nome_conjuge = cli_data.get("nome_conjuge")
    cpf_conjuge = cli_data.get("cpf_conjuge")
    rg_conjuge = cli_data.get("rg_conjuge")
    regime_bens = cli_data.get("regime_bens")
    email = cli_data.get("email")
    telefone = cli_data.get("telefone")
    endereco_completo = cli_data.get("endereco_completo")
    cidade = cli_data.get("cidade")
    estado = cli_data.get("estado")
    cep = cli_data.get("cep")
    sexo = cli_data.get("sexo", "M")
    metadados = cli_data.get("metadados", {})

    # Sanitização de CPF/CNPJ
    cpf_cnpj = re.sub(r'\D', '', cpf_cnpj) if cpf_cnpj else ""
    if cpf_conjuge:
        cpf_conjuge = re.sub(r'\D', '', cpf_conjuge)

    if not validar_cpf_cnpj(cpf_cnpj):
        return {"error": "CPF/CNPJ inválido"}
        
    try:
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            
            # 1. Pega dados antigos da pessoa mesclados para histórico de auditoria
            query_old = """
                SELECT c.id, p.nome as nome_completo, p.cpf_cnpj, p.rg as rg_ie, p.nacionalidade,
                       p.profissao, p.estado_civil, p.regime_bens, p.endereco_completo,
                       p.nome_conjuge, p.cpf_conjuge, p.rg_conjuge, c.email, c.telefone,
                       c.cidade, c.estado, c.cep, c.sexo, c.created_at, c.pessoa_id
                FROM clientes c
                JOIN pessoas p ON c.pessoa_id = p.id
                WHERE c.id = ?
            """
            cursor.execute(query_old, (cliente_id,))
            row = cursor.fetchone()
            if not row:
                return {"error": "Cliente não encontrado."}
            old_data = dict(row)
            pessoa_id = old_data["pessoa_id"]
            
            # 2. Valida se o CPF já pertence a outro cliente comercial
            if cpf_cnpj:
                cursor.execute("""
                    SELECT c.id FROM clientes c
                    JOIN pessoas p ON c.pessoa_id = p.id
                    WHERE REPLACE(REPLACE(REPLACE(p.cpf_cnpj, '.', ''), '-', ''), '/', '') = ? AND c.id != ?
                """, (cpf_cnpj, cliente_id))
                if cursor.fetchone():
                    return {"error": "CPF/CNPJ já cadastrado para outro cliente"}
            
            # 3. Atualiza os dados civis da pessoa
            cursor.execute("""
                UPDATE pessoas
                SET nome = ?, cpf_cnpj = ?, rg = ?, nacionalidade = ?, profissao = ?,
                    estado_civil = ?, regime_bens = ?, endereco_completo = ?,
                    nome_conjuge = ?, cpf_conjuge = ?, rg_conjuge = ?
                WHERE id = ?
            """, (nome_completo, cli_data.get("cpf_cnpj"), rg_ie, nacionalidade, profissao, estado_civil, regime_bens, endereco_completo, nome_conjuge, cpf_conjuge, rg_conjuge, pessoa_id))
            
            # 4. Atualiza os dados de relacionamento na tabela clientes
            cursor.execute("""
                UPDATE clientes 
                SET email = ?, telefone = ?, cidade = ?, estado = ?, cep = ?, sexo = ?
                WHERE id = ?
            """, (email, telefone, cidade, estado, cep, sexo, cliente_id))
            
            # Atualiza metadados (limpa e insere novos)
            cursor.execute("DELETE FROM cliente_metadados WHERE id_cliente = ?", (cliente_id,))
            if metadados:
                for k, v in metadados.items():
                    cursor.execute("INSERT INTO cliente_metadados (id_cliente, chave, valor) VALUES (?, ?, ?)", (cliente_id, k, v))
            
            conn.commit()
            
        # AUDITORIA COMPLETA: Itera sobre todos os campos para registrar mudanças
        mgr = ClienteManager()
        for campo, valor_novo in cli_data.items():
            if campo == 'metadados': continue
            valor_antigo = old_data.get(campo)
            if str(valor_antigo) != str(valor_novo) and valor_novo is not None:
                mgr.registrar_historico(cliente_id, campo, valor_antigo, valor_novo)
        
        # SINCRONIZAÇÃO DE WORKSPACE: Atualiza JSON em todos os levantamentos ATIVOS vinculados
        query_ativos = """
            SELECT l.id 
            FROM propriedade_clientes pc 
            JOIN propriedades p ON pc.propriedade_id = p.id 
            JOIN levantamentos l ON p.id = l.propriedade_id 
            WHERE pc.cliente_id = ? AND l.status = 'EM_ANDAMENTO'
        """
        levs_vinculados = execute_query(query_ativos, params=(cliente_id,), fetch_all=True)
        wm = WorkspaceManager()
        for lev in levs_vinculados:
            ExportacaoService.gerar_documento_cliente_workspace(lev['id'])
        
        mgr.verificar_dados_conjuge(cliente_id)
            
        return {"message": "Cliente atualizado e sincronizado com sucesso"}
    except Exception as e:
        logger.error(f"Erro na atualização do cliente {cliente_id}: {e}")
        return {"error": str(e)}

def vincular_cliente_propriedade(prop_id: int, cliente_id: int, percentual_participacao: float) -> dict:
    """
    Vincula ou atualiza a participação do proprietário na fazenda com limite estrito de 100% no total.
    """
    try:
        # Validação estrita de 100% de participação
        # 1. Pega a soma das participações dos OUTROS clientes vinculados
        soma_outros_row = execute_query(
            "SELECT SUM(percentual_participacao) as soma FROM propriedade_clientes WHERE propriedade_id = ? AND cliente_id != ?",
            params=(prop_id, cliente_id),
            fetch_one=True
        )
        soma_outros = float(soma_outros_row['soma']) if (soma_outros_row and soma_outros_row['soma'] is not None) else 0.0
        
        if soma_outros + percentual_participacao > 100.0:
            restante = max(0.0, 100.0 - soma_outros)
            return {"error": f"Participação inválida. A soma das participações não pode exceder 100%. Restante disponível: {restante:.2f}%"}

        # 2. Verifica se o vínculo já existe para atualizar ou se deve criar
        exists = execute_query(
            "SELECT id FROM propriedade_clientes WHERE propriedade_id = ? AND cliente_id = ?",
            params=(prop_id, cliente_id),
            fetch_one=True
        )
        if exists:
            execute_query(
                "UPDATE propriedade_clientes SET percentual_participacao = ? WHERE propriedade_id = ? AND cliente_id = ?",
                params=(percentual_participacao, prop_id, cliente_id),
                commit=True
            )
            return {"message": "Participação do proprietário atualizada com sucesso"}
        else:
            execute_query(
                "INSERT INTO propriedade_clientes (propriedade_id, cliente_id, percentual_participacao) VALUES (?, ?, ?)",
                params=(prop_id, cliente_id, percentual_participacao),
                commit=True
            )
            return {"message": "Proprietário vinculado com sucesso"}
    except Exception as e:
        logger.error(f"Erro na vinculação cliente-propriedade: {e}")
        return {"error": str(e)}

def salvar_ordem_caminhamento(levantamento_id: int, matricula_id: int, pontos_ordem: list) -> dict:
    """
    Salva a ordem personalizada de caminhamento perimetral e reconstrói as divisas/segmentos
    sequencialmente, aplicando a regra de fechamento obrigatório P_last -> P_1.
    """
    try:
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            
            try:

                # A. Atualiza a ordem_caminhamento de cada ponto de forma atômica
                if matricula_id is None or matricula_id == 0:
                    query_update = "UPDATE pontos SET ordem_caminhamento = ? WHERE id = ? AND levantamento_id = ? AND matricula_id IS NULL"
                    params_base = lambda o, pid: (o, pid, levantamento_id)
                else:
                    query_update = "UPDATE pontos SET ordem_caminhamento = ?, matricula_id = ? WHERE id = ? AND levantamento_id = ? AND (matricula_id = ? OR matricula_id IS NULL)"
                    params_base = lambda o, pid: (o, matricula_id, pid, levantamento_id, matricula_id)

                params_list = [params_base(item.get("ordem"), item.get("id")) for item in pontos_ordem]
                cursor.executemany(query_update, params_list)

                if matricula_id is None or matricula_id == 0:
                    conn.commit()
                    return {"sucesso": True, "segmentos_gerados": 0, "mensagem": "Ordem dos pontos avulsos salva com sucesso."}

                # B. Obter metadados dos limites dos segmentos anteriores para preservá-los
                query_preservar_limites = """
                    SELECT ponto_inicio_id, ponto_fim_id, confrontante_id, tipo_limite_sigef, metodo_posicionamento_sigef
                    FROM segmentos
                    WHERE levantamento_id = ? AND matricula_id = ?
                """
                cursor.execute(query_preservar_limites, (levantamento_id, matricula_id))
                segmentos_antigos = cursor.fetchall()

                mapa_segmento_info = {}
                for seg in segmentos_antigos:
                    chave = (seg["ponto_inicio_id"], seg["ponto_fim_id"])
                    mapa_segmento_info[chave] = {
                        "confrontante_id": seg["confrontante_id"],
                        "tipo_limite_sigef": seg["tipo_limite_sigef"],
                        "metodo_posicionamento_sigef": seg["metodo_posicionamento_sigef"]
                    }

                # C. Remove toda a topologia/segmentos de divisa existentes daquela matrícula
                cursor.execute(
                    "DELETE FROM segmentos WHERE levantamento_id = ? AND matricula_id = ?",
                    (levantamento_id, matricula_id)
                )

                # D. Resgata a nova lista de pontos na ordem atualizada (filtrando pontos extras marcados para ignorar no polígono)
                cursor.execute(
                    "SELECT id, sigma_lat FROM pontos WHERE levantamento_id = ? AND matricula_id = ? AND (ignorar_poligono IS NULL OR ignorar_poligono = 0) ORDER BY ordem_caminhamento ASC",
                    (levantamento_id, matricula_id)
                )
                rows = cursor.fetchall()
                if len(rows) < 2:
                    conn.commit()
                    return {"sucesso": True, "segmentos_gerados": 0, "mensagem": "Ordem salva. Menos de 2 pontos ativos."}

                pts_ordenados_ids = [r["id"] for r in rows]
                primeiro_pt_sigma = rows[0]["sigma_lat"] or 0.0
                metodo_padrao = "PG1" if primeiro_pt_sigma > 0.0 else "MC1"

                # E. Recria de forma sequencial as polilinhas (ligando o de cima com o de baixo e o fechamento)
                query_seg = """
                    INSERT INTO segmentos (
                        levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id,
                        confrontante_id, tipo_limite_sigef, metodo_posicionamento_sigef
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """

                def obter_info_segmento(pt_ini_id, pt_fim_id):
                    chave_original = (pt_ini_id, pt_fim_id)
                    chave_inversa = (pt_fim_id, pt_ini_id)
                    if chave_original in mapa_segmento_info:
                        return mapa_segmento_info[chave_original]
                    elif chave_inversa in mapa_segmento_info:
                        return mapa_segmento_info[chave_inversa]
                    else:
                        return {
                            "confrontante_id": None,
                            "tipo_limite_sigef": "LN1",
                            "metodo_posicionamento_sigef": metodo_padrao
                        }

                for i in range(len(pts_ordenados_ids) - 1):
                    pt_ini_id = pts_ordenados_ids[i]
                    pt_fim_id = pts_ordenados_ids[i+1]
                    info = obter_info_segmento(pt_ini_id, pt_fim_id)
                    cursor.execute(query_seg, (
                        levantamento_id, matricula_id,
                        pt_ini_id, pt_fim_id,
                        info["confrontante_id"], info["tipo_limite_sigef"], info["metodo_posicionamento_sigef"]
                    ))

                pt_ini_id = pts_ordenados_ids[-1]
                pt_fim_id = pts_ordenados_ids[0]
                info = obter_info_segmento(pt_ini_id, pt_fim_id)
                cursor.execute(query_seg, (
                    levantamento_id, matricula_id, 
                    pt_ini_id, pt_fim_id,
                    info["confrontante_id"], info["tipo_limite_sigef"], info["metodo_posicionamento_sigef"]
                ))
                
                conn.commit()
            except Exception as e:
                conn.rollback()
                raise e
            
        # Sincroniza metadados no workspace físico
        wm = WorkspaceManager()
        ExportacaoService.gerar_documento_cliente_workspace(levantamento_id)
        
        return {
            "sucesso": True, 
            "segmentos_gerados": len(pts_ordenados_ids), 
            "mensagem": f"Ordem de caminhamento salva com sucesso e {len(pts_ordenados_ids)} segmentos perimetrais recalculados!"
        }
    except Exception as e:
        logger.error(f"Erro ao salvar ordem de caminhamento personalizada: {e}")
        return {"sucesso": False, "erro": str(e)}

def recomputar_rover_apos_vinculo_base(ponto_id: int, novo_base_id: int, pt_antigo: dict) -> None:
    """
    Executa a translação instantânea plana rigorosa em UTM + Altitude do Rover quando sua base de amarração é alterada.
    """
    if novo_base_id:
        row_new_base = execute_query(
            "SELECT lat, lon, alt, e_original, n_original, alt_original, sigma_lat, sigma_lon, sigma_alt, status_ponto, nome_vertice FROM pontos WHERE id = ?",
            params=(novo_base_id,),
            fetch_one=True
        )
        if row_new_base and row_new_base["status_ponto"] == "CORRIGIDO":
            base = dict(row_new_base)
            
            # 1. Determina a projeção UTM com base na longitude corrigida da base
            zona_utm = calcular_zona_utm_segura(base["lon"])
            epsg_utm = f"319{60 + zona_utm}"
            
            transformer_to_utm = Transformer.from_crs("epsg:4674", f"epsg:{epsg_utm}", always_xy=True)
            transformer_to_latlon = Transformer.from_crs(f"epsg:{epsg_utm}", "epsg:4674", always_xy=True)
            
            # Conversão para ECEF requer geodesic_to_ecef / ecef_to_geodesic
            
            # Ajuste preventivo contra valores nulos nas coordenadas originais da base
            e_base_orig = base["e_original"]
            n_base_orig = base["n_original"]
            alt_base_orig = base["alt_original"]
            if e_base_orig is None or n_base_orig is None:
                lat_base_orig = base["lat"] or 0.0
                lon_base_orig = base["lon"] or 0.0
            else:
                lon_base_orig, lat_base_orig = transformer_to_latlon.transform(e_base_orig, n_base_orig)
            if alt_base_orig is None:
                alt_base_orig = base["alt"] or 0.0
                
            # 2. Calcula o Vetor de Translação ECEF 3D constante
            x_base_corr, y_base_corr, z_base_corr = geodesic_to_ecef(base["lat"], base["lon"], base["alt"] or 0.0)
            x_base_orig, y_base_orig, z_base_orig = geodesic_to_ecef(lat_base_orig, lon_base_orig, alt_base_orig)

            delta_x = x_base_corr - x_base_orig
            delta_y = y_base_corr - y_base_orig
            delta_z = z_base_corr - z_base_orig
            
            # Ajuste preventivo contra valores nulos nas coordenadas originais do rover
            e_rover_orig = pt_antigo["e_original"]
            n_rover_orig = pt_antigo["n_original"]
            alt_rover_orig = pt_antigo["alt_original"]
            if e_rover_orig is None or n_rover_orig is None:
                lat_rover_orig = pt_antigo["lat"] or 0.0
                lon_rover_orig = pt_antigo["lon"] or 0.0
            else:
                lon_rover_orig, lat_rover_orig = transformer_to_latlon.transform(e_rover_orig, n_rover_orig)
            if alt_rover_orig is None:
                alt_rover_orig = pt_antigo["alt"] or 0.0
                
            # 3. Aplica a translação no espaço ECEF 3D do Rover
            x_rover_orig, y_rover_orig, z_rover_orig = geodesic_to_ecef(lat_rover_orig, lon_rover_orig, alt_rover_orig)

            x_rover_corr = x_rover_orig + delta_x
            y_rover_corr = y_rover_orig + delta_y
            z_rover_corr = z_rover_orig + delta_z
            
            # 4. Retroprojeta a coordenada ECEF corrigida para Geodésica no SIRGAS 2000
            lat_c, lon_c, alt_c = ecef_to_geodesic(x_rover_corr, y_rover_corr, z_rover_corr)
            
            sig_lat_prop = pt_antigo["sigma_lat"] if pt_antigo.get("sigma_lat") is not None else (pt_antigo["sigma_n"] or 0.0)
            sig_lon_prop = pt_antigo["sigma_lon"] if pt_antigo.get("sigma_lon") is not None else (pt_antigo["sigma_e"] or 0.0)
            sig_alt_prop = pt_antigo["sigma_alt"] if pt_antigo.get("sigma_alt") is not None else (pt_antigo["sigma_z"] or 0.0)
            
            execute_query(
                """
                UPDATE pontos 
                SET lat = ?, lon = ?, alt = ?, 
                    lat_corrigido = ?, lon_corrigido = ?, alt_corrigido = ?,
                    sigma_lat = ?, sigma_lon = ?, sigma_alt = ?,
                    status_ponto = 'CORRIGIDO' 
                WHERE id = ?
                """,
                (lat_c, lon_c, alt_c, lat_c, lon_c, alt_c, sig_lat_prop, sig_lon_prop, sig_alt_prop, ponto_id),
                commit=True
            )
        else:
            zona_utm = 22 # Fallback
            transformer_to_latlon = Transformer.from_crs(f"epsg:319{60 + zona_utm}", "epsg:4674", always_xy=True)
            e_orig = pt_antigo["e_original"]
            n_orig = pt_antigo["n_original"]
            if e_orig is None or n_orig is None:
                if pt_antigo["lat"] is not None and pt_antigo["lon"] is not None:
                    lon_bruto, lat_bruto = pt_antigo["lon"], pt_antigo["lat"]
                else:
                    lon_bruto, lat_bruto = 0.0, 0.0
            else:
                lon_bruto, lat_bruto = transformer_to_latlon.transform(e_orig, n_orig)
            
            execute_query(
                """
                UPDATE pontos 
                SET lat = ?, lon = ?, alt = ?, 
                    lat_corrigido = NULL, lon_corrigido = NULL, alt_corrigido = NULL,
                    status_ponto = 'BRUTO' 
                WHERE id = ?
                """,
                (lat_bruto, lon_bruto, pt_antigo["alt_original"] if pt_antigo["alt_original"] is not None else pt_antigo["alt"], ponto_id),
                commit=True
            )
    else:
        zona_utm = 22 # Fallback
        transformer_to_latlon = Transformer.from_crs(f"epsg:319{60 + zona_utm}", "epsg:4674", always_xy=True)
        e_orig = pt_antigo["e_original"]
        n_orig = pt_antigo["n_original"]
        if e_orig is None or n_orig is None:
            if pt_antigo["lat"] is not None and pt_antigo["lon"] is not None:
                lon_bruto, lat_bruto = pt_antigo["lon"], pt_antigo["lat"]
            else:
                lon_bruto, lat_bruto = 0.0, 0.0
        else:
            lon_bruto, lat_bruto = transformer_to_latlon.transform(e_orig, n_orig)
        
        execute_query(
            """
            UPDATE pontos 
            SET lat = ?, lon = ?, alt = ?, 
                lat_corrigido = NULL, lon_corrigido = NULL, alt_corrigido = NULL,
                status_ponto = 'BRUTO' 
            WHERE id = ?
            """,
            (lat_bruto, lon_bruto, pt_antigo["alt_original"] if pt_antigo["alt_original"] is not None else pt_antigo["alt"], ponto_id),
            commit=True
        )

def atualizar_pontos_geodesicos_batch(levantamento_id: int, data: dict) -> dict:
    """
    Atualiza múltiplos pontos em lote.
    """
    try:
        from database.connection import DatabaseManager

        pontos = data.get('pontos', [])
        if not pontos:
            return {"success": True}

        # Filtra os pontos_vizinhos (não podem ser alterados) e garante que pertençam ao levantamento
        pontos_ids = [p['id'] for p in pontos]
        if not pontos_ids:
             return {"success": True}

        # Monta placeholders ?, ?, ? ...
        placeholders = ', '.join(['?'] * len(pontos_ids))

        rows = execute_query(f"SELECT id, ponto_vizinho, matricula_id FROM pontos WHERE levantamento_id = ? AND id IN ({placeholders})", params=(levantamento_id, *pontos_ids), fetch_all=True)
        valid_ids = {row['id']: dict(row) for row in rows if row['ponto_vizinho'] != 1}

        if not valid_ids:
            return {"success": True}

        with DatabaseManager() as conn:
            cursor = conn.cursor()

            # Para manter o controle se reordenar será necessário (se ignorar_poligono mudou)
            matriculas_afetadas = set()

            for p_update in pontos:
                pid = p_update['id']
                if pid not in valid_ids:
                    continue

                update_fields = []
                update_values = []

                if 'tipo_ponto' in p_update and p_update['tipo_ponto'] is not None:
                    tipo_ponto = p_update['tipo_ponto']
                    if tipo_ponto not in ['M', 'P', 'V', 'B']:
                        return {"error": f"Tipo de ponto inválido '{tipo_ponto}' no ponto ID {pid}. Deve ser 'M', 'P', 'V' ou 'B'.", "status_code": 400}

                    # Uniqueness constraint check
                    # We need the current vertex name to check uniqueness if only tipo_ponto is updated
                    cursor.execute("SELECT nome_vertice, matricula_id FROM pontos WHERE id = ?", (pid,))
                    pt_current = cursor.fetchone()
                    if pt_current:
                        pt_nome = pt_current['nome_vertice']
                        pt_mat = valid_ids[pid]['matricula_id']

                        cursor.execute(
                            "SELECT id FROM pontos WHERE levantamento_id = ? AND matricula_id IS ? AND nome_vertice = ? AND tipo_ponto = ? AND id != ?",
                            (levantamento_id, pt_mat, pt_nome, tipo_ponto, pid)
                        )
                        exists = cursor.fetchone()
                        if exists:
                             return {"error": f"Conflito de unicidade: já existe um vértice com nome '{pt_nome}' do tipo '{tipo_ponto}' nesta matrícula.", "status_code": 400}

                    update_fields.append("tipo_ponto = ?")
                    update_values.append(tipo_ponto)

                if 'ignorar_poligono' in p_update and p_update['ignorar_poligono'] is not None:
                    update_fields.append("ignorar_poligono = ?")
                    update_values.append(p_update['ignorar_poligono'])
                    mat_id = valid_ids[pid]['matricula_id']
                    if mat_id:
                        matriculas_afetadas.add(mat_id)

                if update_fields:
                    update_values.append(pid)
                    cursor.execute(f"UPDATE pontos SET {', '.join(update_fields)} WHERE id = ?", update_values)

                # Tratar confrontante
                conf_data = p_update.get('confrontante')
                if conf_data:
                    # Encontrar segmentos que iniciam com esse ponto
                    cursor.execute("SELECT id, confrontante_id, matricula_id, ponto_fim_id, tipo_limite_sigef, metodo_posicionamento_sigef FROM segmentos WHERE ponto_inicio_id = ?", (pid,))
                    segmento = cursor.fetchone()

                    if segmento:
                        conf_id = segmento['confrontante_id']
                        if conf_id:
                            # Update existing
                            conf_fields = []
                            conf_values = []

                            if conf_data.get('nome') is not None:
                                conf_fields.append("nome = ?")
                                conf_values.append(conf_data['nome'])
                            if conf_data.get('matricula_imovel') is not None:
                                conf_fields.append("matricula_imovel = ?")
                                conf_values.append(conf_data['matricula_imovel'])
                            if conf_data.get('cns_confrontante') is not None:
                                conf_fields.append("cns_confrontante = ?")
                                conf_values.append(conf_data['cns_confrontante'])

                            if conf_fields:
                                conf_values.append(conf_id)
                                cursor.execute(f"UPDATE confrontantes SET {', '.join(conf_fields)} WHERE id = ?", conf_values)
                        elif conf_data.get('nome') or conf_data.get('matricula_imovel') or conf_data.get('cns_confrontante'):
                            # Create new
                            nome = conf_data.get('nome') or conf_data.get('matricula_imovel') or 'Confrontante'
                            mat = conf_data.get('matricula_imovel')
                            cns = conf_data.get('cns_confrontante')
                            cursor.execute("""
                                INSERT INTO confrontantes (levantamento_id, tipo_relacao, nome, matricula_imovel, cns_confrontante)
                                VALUES (?, 'Divisa', ?, ?, ?)
                            """, (levantamento_id, nome, mat, cns))
                            new_conf_id = cursor.lastrowid

                            cursor.execute("UPDATE segmentos SET confrontante_id = ? WHERE id = ?", (new_conf_id, segmento['id']))
            conn.commit()

        # Reflete nas malhas se poligono foi alterado
        if matriculas_afetadas:
             from services.processamento.geoprocessamento import reordenar_perimetro_matricula
             for mat_id in matriculas_afetadas:
                 reordenar_perimetro_matricula(levantamento_id, mat_id)

        return {"success": True}
    except Exception as e:
        print(f"Erro em atualizar_pontos_geodesicos_batch: {e}")
        import traceback
        traceback.print_exc()
        return {"error": str(e), "status_code": 500}

def atualizar_ponto_geodesico(pid: int, data: dict) -> dict:
    """
    Atualiza as propriedades geodésicas de um ponto e coordena de forma atômica
    todas as propagações necessárias (como re-translação espacial 3D ECEF de rovers
    ou recalculamento de divisas).
    """
    try:
        from services.processamento.historico_campo import HistoricoCampoLogger
        from services.processamento.geoprocessamento import corrigir_rovers_em_bloco, reordenar_perimetro_matricula

        # 1. Recupera o ponto atual antes de alterar
        row = execute_query("SELECT * FROM pontos WHERE id = ?", params=(pid,), fetch_one=True)
        if not row:
            return {"error": "Ponto não encontrado.", "status_code": 404}
            
        pt_antigo = dict(row)
        levantamento_id = pt_antigo["levantamento_id"]

        # Variáveis de controle para disparo posterior de lógicas de domínio
        reordenar_poligono_reativo = False
        recalcular_rover = False
        propagar_base_bloco = False
        corrigir_lote_rtk = False
        
        # Estruturas para acumular updates dinâmicos em um único UPDATE SQL
        campos_update = []
        valores_update = []

        # A.0. Valida e Prepara Nome do Vértice (Garante consistência geodésica)
        nome_vertice = data.get("nome_vertice")
        if nome_vertice is not None and nome_vertice.strip() != pt_antigo["nome_vertice"]:
            nome_novo = nome_vertice.strip()
            if not nome_novo:
                return {"error": "O nome do vértice não pode ser vazio.", "status_code": 400}
            
            exists = execute_query(
                "SELECT id FROM pontos WHERE levantamento_id = ? AND matricula_id = ? AND nome_vertice = ? AND tipo_ponto = ? AND id != ?",
                params=(levantamento_id, pt_antigo["matricula_id"], nome_novo, data.get("tipo_ponto") or pt_antigo["tipo_ponto"], pid),
                fetch_one=True
            )
            if exists:
                return {"error": "Conflito de unicidade de nome para o mesmo tipo/matrícula.", "status_code": 400}
                
            campos_update.append("nome_vertice = ?")
            valores_update.append(nome_novo)
            
            HistoricoCampoLogger.registrar_evento(
                levantamento_id=levantamento_id,
                tipo_evento="EDICAO_PONTO",
                descricao=f"Nome do vértice ID {pid} alterado de '{pt_antigo['nome_vertice']}' para '{nome_novo}'.",
                dados_detalhados={"ponto_id": pid, "anterior": pt_antigo["nome_vertice"], "novo": nome_novo}
            )
            pt_antigo["nome_vertice"] = nome_novo

        # Interceptador da Nova Lógica de Ponto de Controle (Base) para Lotes RTK
        n_corr = data.get("n_corrigido")
        e_corr = data.get("e_corrigido")
        alt_corr = data.get("alt_corrigido")
        fuso_corr = data.get("fuso")
        
        tipo_atual = data.get("tipo_ponto") or pt_antigo["tipo_ponto"]
        
        if (tipo_atual == 'M' or tipo_atual == 'B') and n_corr is not None and e_corr is not None and alt_corr is not None:
            # 1. Caso o ponto base possua arquivo_origem (Lote de RTK / Caderneta importada)
            if pt_antigo.get("arquivo_origem"):
                corrigir_lote_rtk = True
            else:
                # 2. Caso seja uma base isolada sem arquivo_origem (Ingestão Manual)
                zona = int(''.join(filter(str.isdigit, fuso_corr or "22S")))
                epsg_utm = f"319{60 + zona}"
                
                transformer_to_latlon = Transformer.from_crs(f"epsg:{epsg_utm}", "epsg:4674", always_xy=True)
                lon_val, lat_val = transformer_to_latlon.transform(e_corr, n_corr)
                
                data["lat"] = lat_val
                data["lon"] = lon_val
                data["alt"] = alt_corr
                data["status_ponto"] = "CORRIGIDO"
                data["status_correcao"] = "CORRIGIDO"

        elif (tipo_atual in ('P', 'V')) and n_corr is not None and e_corr is not None:
            # Para pontos de detalhe (P/V): converte UTM → Geodésico e salva lat/lon
            zona = int(''.join(filter(str.isdigit, fuso_corr or "22S")))
            epsg_utm = f"319{60 + zona}"
            transformer_to_latlon = Transformer.from_crs(f"epsg:{epsg_utm}", "epsg:4674", always_xy=True)
            lon_val, lat_val = transformer_to_latlon.transform(e_corr, n_corr)
            data["lat"] = float(lat_val)
            data["lon"] = float(lon_val)
            if alt_corr is not None:
                data["alt"] = alt_corr


        if corrigir_lote_rtk:
            from services.processamento.geoprocessamento import aplicar_correcao_manual_lote
            dados_brutos = {
                "nome_base": pt_antigo["nome_vertice"],
                "e_bruto": pt_antigo["e_original"] or e_corr,
                "n_bruto": pt_antigo["n_original"] or n_corr,
                "alt_bruta": pt_antigo["alt_original"] or alt_corr
            }
            dados_corrigidos = {
                "tipo_entrada": "utm",
                "e_corrigido": e_corr,
                "n_corrigido": n_corr,
                "alt_corrigida": alt_corr,
                "fuso": fuso_corr or "22S"
            }
            
            aplicar_correcao_manual_lote(
                levantamento_id=levantamento_id,
                matricula_id=pt_antigo["matricula_id"],
                arquivo_origem=pt_antigo["arquivo_origem"],
                dados_brutos=dados_brutos,
                dados_corrigidos=dados_corrigidos,
                base_id=pid,
                tipo_ponto_base=tipo_atual
            )
            return {"success": True, "message": "Coordenadas oficiais salvas e translação reativa aplicada com sucesso em todos os rovers do arquivo."}

        # A.1. Valida e Prepara Tipo de Ponto ('M', 'P', 'V', 'B')
        tipo_ponto = data.get("tipo_ponto")
        if tipo_ponto is not None and tipo_ponto != pt_antigo["tipo_ponto"]:
            if tipo_ponto not in ['M', 'P', 'V', 'B']:
                return {"error": "Tipo de ponto inválido. Deve ser 'M', 'P', 'V' ou 'B'.", "status_code": 400}
                
            exists = execute_query(
                "SELECT id FROM pontos WHERE levantamento_id = ? AND matricula_id = ? AND nome_vertice = ? AND tipo_ponto = ? AND id != ?",
                params=(levantamento_id, pt_antigo["matricula_id"], pt_antigo["nome_vertice"], tipo_ponto, pid),
                fetch_one=True
            )
            if exists:
                return {"error": f"Conflito de unicidade: já existe um vértice com nome '{pt_antigo['nome_vertice']}' do tipo '{tipo_ponto}' nesta matrícula.", "status_code": 400}
                
            campos_update.append("tipo_ponto = ?")
            valores_update.append(tipo_ponto)
            
            if tipo_ponto in ['M', 'B']:
                # Usa placeholder seguro em vez de NULL literal para evitar mismatch de parâmetros
                campos_update.append("ponto_base_id = ?")
                valores_update.append(None)
                pt_antigo["ponto_base_id"] = None
                
            HistoricoCampoLogger.registrar_evento(
                levantamento_id=levantamento_id,
                tipo_evento="EDICAO_PONTO",
                descricao=f"Tipo do vértice '{pt_antigo['nome_vertice']}' alterado de '{pt_antigo['tipo_ponto']}' para '{tipo_ponto}'.",
                dados_detalhados={"ponto_id": pid, "nome_vertice": pt_antigo["nome_vertice"], "anterior": pt_antigo["tipo_ponto"], "novo": tipo_ponto}
            )
            pt_antigo["tipo_ponto"] = tipo_ponto

        # A.2. Valida e Prepara Método de Posicionamento
        metodo_posicionamento = data.get("metodo_posicionamento")
        if metodo_posicionamento is not None and metodo_posicionamento != pt_antigo["metodo_posicionamento"]:
            campos_update.append("metodo_posicionamento = ?")
            valores_update.append(metodo_posicionamento)
            
            HistoricoCampoLogger.registrar_evento(
                levantamento_id=levantamento_id,
                tipo_evento="EDICAO_METODO",
                descricao=f"Método de posicionamento do vértice {pt_antigo['nome_vertice']} alterado de {pt_antigo['metodo_posicionamento']} para {metodo_posicionamento}.",
                dados_detalhados={"ponto_id": pid, "nome_vertice": pt_antigo["nome_vertice"], "anterior": pt_antigo["metodo_posicionamento"], "novo": metodo_posicionamento}
            )
            pt_antigo["metodo_posicionamento"] = metodo_posicionamento
            
        # B. Valida e Prepara Matrícula
        matricula_id = data.get("matricula_id")
        if matricula_id is not None and matricula_id != pt_antigo["matricula_id"]:
            m_id = matricula_id if matricula_id > 0 else None
            campos_update.append("matricula_id = ?")
            valores_update.append(m_id)
            
            desc_mat = f"Vértice {pt_antigo['nome_vertice']} atrelado à matrícula ID {m_id} (anteriormente ID {pt_antigo['matricula_id']})."
            HistoricoCampoLogger.registrar_evento(
                levantamento_id=levantamento_id,
                tipo_evento="ALTERACAO_MATRICULA",
                descricao=desc_mat,
                dados_detalhados={"ponto_id": pid, "nome_vertice": pt_antigo["nome_vertice"], "anterior_matricula_id": pt_antigo["matricula_id"], "nova_matricula_id": m_id}
            )
            pt_antigo["matricula_id"] = m_id

        # C. Valida e Prepara Vínculo de Base de Campo (ponto_base_id) - EXCLUSIVO ROVERS
        ponto_base_id = data.get("ponto_base_id")
        if ponto_base_id is not None and ponto_base_id != pt_antigo["ponto_base_id"]:
            new_base_id = ponto_base_id if ponto_base_id > 0 else None
            campos_update.append("ponto_base_id = ?")
            valores_update.append(new_base_id)
            
            desc_base = f"Amarração de campo do vértice {pt_antigo['nome_vertice']} alterada de Base ID {pt_antigo['ponto_base_id']} para Base ID {new_base_id}."
            HistoricoCampoLogger.registrar_evento(
                levantamento_id=levantamento_id,
                tipo_evento="ALTERACAO_BASE",
                descricao=desc_base,
                dados_detalhados={"ponto_id": pid, "nome_vertice": pt_antigo["nome_vertice"], "anterior_base_id": pt_antigo["ponto_base_id"], "nova_base_id": new_base_id}
            )
            recalcular_rover = True
            pt_antigo["ponto_base_id"] = new_base_id
            
        # D. Coordenadas Espaciais e Status
        atualizar_coordenadas = False
        
        for campo in ["lat", "lon", "alt", "sigma_lat", "sigma_lon", "sigma_alt", "status_ponto", "status_correcao", "ignorar_poligono", "sequencia_travada_id"]:
            val = data.get(campo)
            # Usa .get() para tolerância a colunas ausentes em bancos de dados antigos
            val_antigo = pt_antigo.get(campo)
            if val is not None and val != val_antigo:
                campos_update.append(f"{campo} = ?")
                valores_update.append(val)
                atualizar_coordenadas = True
                
        if atualizar_coordenadas:
            lat_val = data.get("lat")
            lon_val = data.get("lon")
            alt_val = data.get("alt")
            status_val = data.get("status_ponto")
            ignorar_val = data.get("ignorar_poligono")

            if lat_val is not None:
                campos_update.append("lat_corrigido = ?")
                valores_update.append(lat_val)
            if lon_val is not None:
                campos_update.append("lon_corrigido = ?")
                valores_update.append(lon_val)
            if alt_val is not None:
                campos_update.append("alt_corrigido = ?")
                valores_update.append(alt_val)
                
            if ignorar_val is not None and ignorar_val != pt_antigo["ignorar_poligono"] and pt_antigo["matricula_id"]:
                reordenar_poligono_reativo = True
            
            desc_spatial = f"Coordenadas espaciais do vértice {pt_antigo['nome_vertice']} atualizadas com sucesso."
            HistoricoCampoLogger.registrar_evento(
                levantamento_id=levantamento_id,
                tipo_evento="CORRECAO_PONTO",
                descricao=desc_spatial,
                dados_detalhados={
                    "ponto_id": pid,
                    "nome_vertice": pt_antigo["nome_vertice"],
                    "anterior": {"lat": pt_antigo["lat"], "lon": pt_antigo["lon"], "alt": pt_antigo["alt"], "status": pt_antigo["status_ponto"]},
                    "novo": {"lat": lat_val or pt_antigo["lat"], "lon": lon_val or pt_antigo["lon"], "alt": alt_val or pt_antigo["alt"], "status": status_val or pt_antigo["status_ponto"]}
                }
            )
            
            novo_status = status_val or pt_antigo["status_ponto"]
            if pt_antigo["tipo_ponto"] == "M" and novo_status == "CORRIGIDO":
                propagar_base_bloco = True

        # E. Executa o UPDATE acumulado sob uma única transação no SQLite
        if campos_update:
            query_update = f"UPDATE pontos SET {', '.join(campos_update)} WHERE id = ?"
            valores_update.append(pid)
            
            with DatabaseManager() as conn:
                cursor = conn.cursor()
                cursor.execute(query_update, tuple(valores_update))

        # F. Lógicas pós-atualização reativas de geoprocessamento
        if reordenar_poligono_reativo:
            try:
                reordenar_perimetro_matricula(levantamento_id, pt_antigo["matricula_id"])
                logger.info(f"Divisas da matrícula ID {pt_antigo['matricula_id']} autorregeneradas devido à alteração de ignorar_poligono do ponto ID {pid}.")
            except Exception as ex_reorder:
                logger.warning(f"Falha ao regenerar divisas reativamente: {ex_reorder}")

        # BUGFIX: esses blocos estavam indevidamente dentro do if reordenar_poligono_reativo,
        # causando que a função retornasse None implicitamente quando o flag era False.
        if propagar_base_bloco:
            rovers_corrigidos = corrigir_rovers_em_bloco(levantamento_id, pid)
            logger.info(f"Translação reativa em bloco concluída. {rovers_corrigidos} rovers corrigidos com base em {pt_antigo['nome_vertice']}.")

        if recalcular_rover and pt_antigo.get("tipo_ponto") in ["P", "V"]:
            new_base_id = pt_antigo.get("ponto_base_id")
            recomputar_rover_apos_vinculo_base(pid, new_base_id, pt_antigo)

        # Sempre retorna sucesso após executar todas as lógicas reativas
        return {"success": True, "message": "Ponto atualizado e sincronizado geodésicamente com sucesso."}
    except Exception as e:
        logger.error(f"Erro ao atualizar ponto {pid}: {e}", exc_info=True)
        return {"error": str(e), "status_code": 400}

def gerar_requerimento_html(levantamento_id: int, matricula_id: int) -> str:
    """Gera um requerimento em HTML formatado para retificação de registro endereçado ao CRI"""
    lev_row = execute_query(
        "SELECT l.*, p.nome as nome_profissional, p.registro as registro_profissional, p.codigo_credenciado FROM levantamentos l JOIN profissionais p ON l.profissional_id = p.id WHERE l.id = ?",
        params=(levantamento_id,), fetch_one=True
    )
    if not lev_row: 
        raise ValueError("Levantamento não localizado.")
    lev_data = dict(lev_row)
    
    prop_row = execute_query("SELECT * FROM propriedades WHERE id = ?", params=(lev_data["propriedade_id"],), fetch_one=True)
    prop_data = dict(prop_row) if prop_row else {}
    
    mat_row = execute_query("SELECT * FROM matriculas WHERE id = ?", params=(matricula_id,), fetch_one=True)
    if not mat_row: 
        raise ValueError("Matrícula não localizada.")
    mat_data = dict(mat_row)
    
    cli_rows = execute_query(
        "SELECT c.*, pc.percentual_participacao FROM propriedade_clientes pc JOIN clientes c ON pc.cliente_id = c.id WHERE pc.propriedade_id = ?",
        params=(lev_data["propriedade_id"],), fetch_all=True
    )
    clientes = [dict(c) for c in cli_rows]
    
    cli_html = ""
    for c in clientes:
        civil_info = f", {c['estado_civil']}" if c['estado_civil'] else ""
        prof_info = f", {c['profissao']}" if c['profissao'] else ""
        conj_info = ""
        if c['estado_civil'] and c['estado_civil'].upper() == "CASADO":
            conj_info = f" casado sob o regime de {c['regime_bens']} com {c['nome_conjuge']}, portador(a) do CPF nº {c['cpf_conjuge']} e RG nº {c['rg_conjuge']}"
        
        cli_html += f"<p><b>{c['nome_completo']}</b>, nacionalidade {c['nacionalidade']}{civil_info}{prof_info}{conj_info}, portador(a) do CPF/CNPJ nº {c['cpf_cnpj']} e RG nº {c['rg_ie']}, residente e domiciliado(a) em {c['endereco_completo']}, {c['cidade']}-{c['estado']}.</p>"

    html_content = f"""
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>Requerimento de Retificação de Área - {prop_data.get('nome_propriedade', 'Imóvel')}</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
            body {{ font-family: 'Inter', 'Segoe UI', 'Tahoma', sans-serif; color: #2d3748; line-height: 1.6; padding: 40px; background-color: #fff; }}
            .page {{ max-width: 800px; margin: 0 auto; }}
            .header {{ text-align: center; margin-bottom: 40px; border-bottom: 2px solid #00f5a0; padding-bottom: 20px; }}
            .logo {{ font-size: 24px; font-weight: 700; color: #0c1510; text-transform: uppercase; letter-spacing: 2px; }}
            .logo span {{ color: #00f5a0; }}
            .document-title {{ font-size: 18px; font-weight: 700; text-transform: uppercase; margin-top: 15px; color: #1a202c; }}
            .address {{ font-weight: 700; margin-top: 30px; margin-bottom: 30px; }}
            .content {{ text-align: justify; font-size: 15px; }}
            .footer-signature {{ margin-top: 60px; page-break-inside: avoid; }}
            .sig-line {{ width: 320px; border-top: 1px solid #4a5568; margin: 50px auto 10px auto; text-align: center; }}
            .sig-title {{ text-align: center; font-size: 13px; color: #718096; font-weight: 600; }}
            .btn-print {{ background-color: #00f5a0; color: #0c1510; padding: 10px 20px; font-weight: 700; border-radius: 4px; border: none; cursor: pointer; font-family: inherit; transition: opacity 0.2s; }}
            .btn-print:hover {{ opacity: 0.8; }}
            @media print {{ body {{ padding: 0; }} .no-print {{ display: none; }} }}
        </style>
    </head>
    <body>
        <div class="page">
            <div class="no-print" style="text-align: right; margin-bottom: 20px;">
                <button class="btn-print" onclick="window.print()">Imprimir / Salvar PDF</button>
            </div>
            <div class="header">
                <div class="logo">Gerenci<span>Geo</span></div>
                <div class="document-title">Requerimento de Retificação de Registro de Imóvel Rural</div>
            </div>
            <div class="address">
                AO ILUSTRÍSSIMO OFICIAL DO CARTÓRIO DE REGISTRO DE IMÓVEIS DE {str(mat_data.get('cri_comarca') or prop_data.get('municipio', '')).upper()}/{prop_data.get('uf', '').upper()}
            </div>
            <div class="content">
                <p>Senhor Oficial,</p>
                {cli_html}
                <p>Proprietários do imóvel rural denominado <b>{prop_data.get('nome_propriedade')}</b>, localizado no município de {prop_data.get('municipio')}-{prop_data.get('uf')}, com área registrada de <b>{mat_data.get('area_ha')} ha</b>, sob a Matrícula nº <b>{mat_data.get('numero_matricula')}</b> do {mat_data.get('cri_circunscricao') or 'CRI local'}, registrada no {mat_data.get('livro_registro') or 'Livro 2-RG'}, {mat_data.get('folha_registro') or 'Folha correspondente'}, vêm respeitosamente requerer a Vossa Senhoria, com fundamento no Artigo 213, Inciso II da Lei Federal nº 6.015 de 31 de dezembro de 1973 (Lei dos Registros Públicos), com as alterações introduzidas pela Lei nº 10.267 de 28 de agosto de 2001, a <b>RETIFICAÇÃO DE REGISTRO</b> de seu imóvel rural.</p>
                
                <p>O presente pedido justifica-se por haver divergência nas dimensões perimetrais e na área do imóvel, estando a realidade de divisa consolidada de campo descrita nos trabalhos técnicos de georreferenciamento elaborados pelo Engenheiro/Responsável Técnico <b>{lev_data.get('nome_profissional')}</b>, credenciado perante o INCRA sob o código <b>{lev_data.get('codigo_credenciado')}</b>, conforme planta, memorial descritivo e anexo de confrontações anexados à presente.</p>
                
                <p>Os confrontantes anuíram expressamente aos limites e divisas retificados, tendo assinado individualmente as respectivas cartas de anuência anexadas, com firmas reconhecidas in cartório.</p>
                
                <p>Nestes termos, pede e espera deferimento.</p>
                
                <p style="margin-top: 40px; text-align: right;">{prop_data.get('municipio')}-{prop_data.get('uf')}, _____ de ____________________ de 20___.</p>
            </div>
            
            <div class="footer-signature">
                <div class="sig-line"></div>
                <div class="sig-title">Requerente Proprietário</div>
            </div>
        </div>
    </body>
    </html>
    """
    return html_content

def gerar_termo_anuencia_html(levantamento_id: int, confrontante_id: int) -> str:
    """Gera Carta de Anuência preenchida com a ordenação perimetral dos segmentos lindeiros daquele confrontante em HTML"""
    conf_row = execute_query("SELECT * FROM confrontantes WHERE id = ?", params=(confrontante_id,), fetch_one=True)
    if not conf_row: 
        raise ValueError("Confrontante não localizado.")
    conf = dict(conf_row)
    
    lev_row = execute_query(
        "SELECT l.*, p.nome as nome_profissional, p.registro as registro_profissional, p.codigo_credenciado FROM levantamentos l JOIN profissionais p ON l.profissional_id = p.id WHERE l.id = ?",
        params=(levantamento_id,), fetch_one=True
    )
    if not lev_row: 
        raise ValueError("Levantamento não localizado.")
    lev_data = dict(lev_row)
    
    prop_row = execute_query("SELECT * FROM propriedades WHERE id = ?", params=(lev_data["propriedade_id"],), fetch_one=True)
    prop_data = dict(prop_row) if prop_row else {}
    
    cli_rows = execute_query(
        "SELECT c.* FROM propriedade_clientes pc JOIN clientes c ON pc.cliente_id = c.id WHERE pc.propriedade_id = ?",
        params=(lev_data["propriedade_id"],), fetch_all=True
    )
    clientes = [dict(c) for c in cli_rows]
    
    # Busca segmentos lindeiros
    seg_rows = execute_query(
        """
        SELECT s.*, p_ini.nome_vertice as nome_p_ini, p_ini.lat as lat_ini, p_ini.lon as lon_ini,
                    p_fim.nome_vertice as nome_p_fim, p_fim.lat as lat_fim, p_fim.lon as lon_fim
        FROM segmentos s
        JOIN pontos p_ini ON s.ponto_inicio_id = p_ini.id
        JOIN pontos p_fim ON s.ponto_fim_id = p_fim.id
        WHERE s.levantamento_id = ? AND s.confrontante_id = ?
        """,
        params=(levantamento_id, confrontante_id), fetch_all=True
    )
    
    if not seg_rows:
        raise ValueError("Nenhum segmento de divisa associado a este confrontante para este levantamento.")
        
    segmentos = [dict(s) for s in seg_rows]
    
    divisas_html = ""
    total_dist = 0.0
    
    lon0 = segmentos[0]["lon_ini"]
    zona_utm = int((lon0 + 180) / 6) + 1
    
    transformer = Transformer.from_crs("epsg:4674", f"epsg:319{60 + zona_utm}", always_xy=True)
    
    for s in segmentos:
        e_ini, n_ini = transformer.transform(s["lon_ini"], s["lat_ini"])
        e_fim, n_fim = transformer.transform(s["lon_fim"], s["lat_fim"])
        
        de = e_fim - e_ini
        dn = n_fim - n_ini
        dist = math.sqrt(de**2 + dn**2)
        total_dist += dist
        
        az = math.degrees(math.atan2(de, dn)) % 360.0
        
        graus = int(az)
        minutos_dec = (az - graus) * 60.0
        minutos = int(minutos_dec)
        segundos = (minutos_dec - minutos) * 60.0
        az_format = f"{graus}° {minutos:02d}' {segundos:04.1f}\""
        
        divisas_html += f"<tr><td>{s['nome_p_ini']}</td><td>{s['nome_p_fim']}</td><td>{az_format}</td><td>{dist:.2f} m</td><td>{s['tipo_limite_sigef']}</td><td>{s['metodo_posicionamento_sigef']}</td></tr>"
    
    proprietarios_nomes = ", ".join([c["nome_completo"] for c in clientes])
    
    conj_info = ""
    if conf.get("estado_civil") and conf.get("estado_civil").upper() == "CASADO":
        conj_info = f" e seu cônjuge <b>{conf.get('nome_conjuge')}</b>, nacionalidade {conf.get('nacionalidade') or 'brasileiro(a)'}, portador(a) do CPF nº {conf.get('cpf_conjuge')} e RG nº {conf.get('rg_conjuge')},"
        
    html_content = f"""
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>Termo de Anuência de Confrontante - {conf['nome']}</title>
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
            body {{ font-family: 'Inter', 'Segoe UI', 'Tahoma', sans-serif; color: #2d3748; line-height: 1.6; padding: 40px; }}
            .page {{ max-width: 800px; margin: 0 auto; }}
            .header {{ text-align: center; margin-bottom: 40px; border-bottom: 2px solid #00f5a0; padding-bottom: 20px; }}
            .logo {{ font-size: 24px; font-weight: 700; color: #0c1510; text-transform: uppercase; }}
            .logo span {{ color: #00f5a0; }}
            .document-title {{ font-size: 18px; font-weight: 700; text-transform: uppercase; margin-top: 15px; color: #1a202c; }}
            .content {{ text-align: justify; font-size: 14px; margin-bottom: 30px; }}
            table {{ width: 100%; border-collapse: collapse; margin-top: 20px; margin-bottom: 20px; font-size: 13px; }}
            th, td {{ border: 1px solid #cbd5e0; padding: 10px; text-align: center; }}
            th {{ background-color: #f7fafc; font-weight: 700; }}
            .signatures {{ display: flex; justify-content: space-between; margin-top: 60px; page-break-inside: avoid; }}
            .sig-block {{ width: 45%; text-align: center; }}
            .sig-line {{ border-top: 1px solid #4a5568; margin-top: 40px; margin-bottom: 10px; }}
            .sig-title {{ font-size: 12px; color: #718096; font-weight: 600; }}
            .btn-print {{ background-color: #00f5a0; color: #0c1510; padding: 10px 20px; font-weight: 700; border-radius: 4px; border: none; cursor: pointer; font-family: inherit; }}
            @media print {{ body {{ padding: 0; }} .no-print {{ display: none; }} }}
        </style>
    </head>
    <body>
        <div class="page">
            <div class="no-print" style="text-align: right; margin-bottom: 20px;">
                <button class="btn-print" onclick="window.print()">Imprimir / Salvar PDF</button>
            </div>
            <div class="header">
                <div class="logo">Gerenci<span>Geo</span></div>
                <div class="document-title">Carta de Anuência de Limites de Confrontação</div>
            </div>
            <div class="content">
                <p>Pelo presente instrumento particular de anuência e reconhecimento de divisas, eu <b>{conf['nome']}</b>, nacionalidade {conf.get('nacionalidade') or 'brasileiro(a)'}, {conf.get('estado_civil') or 'estado civil não informado'}, {conf.get('profissao') or 'profissão não informada'}, portador(a) do CPF nº {conf.get('cpf_cnpj')} e RG nº {conf.get('rg') or 'não informado'}, residente e domiciliado(a) em {conf.get('endereco_completo') or 'endereço não informado'}{conj_info} na qualidade de confrontante e proprietário legal de área lindeira à propriedade denominada <b>{prop_data.get('nome_propriedade')}</b>, declaro expressamente e sob responsabilidade jurídica:</p>
                
                <p>1. Que **ANUO E CONCORDOS** de forma irrestrita com as novas divisas, marcos e coordenadas levantadas e descritas no perímetro da propriedade de <b>{proprietarios_nomes}</b>, referente ao perímetro delimitado pelos segmentos de divisa listados na tabela abaixo, cujo trabalho de demarcação de campo foi executado em conformidade com as normas do INCRA/SIGEF.</p>
                
                <table>
                    <thead>
                        <tr>
                            <th>De Vértice</th>
                            <th>Para Vértice</th>
                            <th>Azimute</th>
                            <th>Distância</th>
                            <th>Tipo Limite</th>
                            <th>Método Pos.</th>
                        </tr>
                    </thead>
                    <tbody>
                        {divisas_html}
                    </tbody>
                </table>
                
                <p>2. A soma linear de confrontação corresponde a uma extensão perimetral total de <b>{total_dist:.2f} metros</b> de divisa retificada.</p>
                <p>3. Reconheço e atesto que as cercas ou marcos instalados neste trecho representam fielmente os limites históricos consolidados da posse e propriedade, não havendo invasões, sobreposições ou litígios de divisa de qualquer natureza.</p>
                
                <p style="margin-top: 40px; text-align: right;">{prop_data.get('municipio')}-{prop_data.get('uf')}, _____ de ____________________ de 20___.</p>
            </div>
            
            <div class="signatures">
                <div class="sig-block">
                    <div class="sig-line"></div>
                    <div class="sig-title">Confrontante Proprietário</div>
                    <div class="sig-title">{conf['nome']}</div>
                </div>
                {"<div class='sig-block'><div class='sig-line'></div><div class='sig-title'>Cônjuge do Confrontante</div><div class='sig-title'>" + conf.get('nome_conjuge', '') + "</div></div>" if conj_info else ""}
            </div>
        </div>
    </body>
    </html>
    """
    return html_content


def ordenar_vizinho_mais_proximo(levantamento_id: int, matricula_id: int) -> dict:
    """
    Ordena automaticamente os pontos da matrícula utilizando o algoritmo Nearest Neighbor.
    """
    try:
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            
            # Seleciona campos adicionais para fazer a deduplicação por nome e tipo
            cursor.execute(
                """
                SELECT id, nome_vertice, tipo_ponto, lat, lon, status_ponto, matricula_id, sequencia_travada_id, ordem_caminhamento
                FROM pontos
                WHERE levantamento_id = ? AND (ignorar_poligono IS NULL OR ignorar_poligono = 0)
                """,
                (levantamento_id,)
            )
            todos_rows = [dict(r) for r in cursor.fetchall()]

            if matricula_id is None or matricula_id == 0:
                pontos_filtrados = [p for p in todos_rows if p["matricula_id"] is None]
            else:
                pontos_filtrados = [p for p in todos_rows if p["matricula_id"] == matricula_id]
                if not pontos_filtrados:
                    # Fallback para avulsos
                    pontos_filtrados = [p for p in todos_rows if p["matricula_id"] is None]

            # Deduplica por (nome_vertice, tipo_ponto)
            # Prioriza: status_ponto == 'CORRIGIDO', depois maior id
            dict_dedup = {}
            for p in pontos_filtrados:
                key = (p["nome_vertice"], p["tipo_ponto"])
                if key not in dict_dedup:
                    dict_dedup[key] = p
                else:
                    p_existente = dict_dedup[key]
                    if p["status_ponto"] == 'CORRIGIDO' and p_existente["status_ponto"] != 'CORRIGIDO':
                        dict_dedup[key] = p
                    elif p["status_ponto"] == p_existente["status_ponto"] and p["id"] > p_existente["id"]:
                        dict_dedup[key] = p

            pontos = list(dict_dedup.values())
            
            if len(pontos) < 3:
                return {"sucesso": False, "erro": "Necessário pelo menos 3 pontos para ordenar."}
            
            # Agrupa os blocos travados
            from collections import defaultdict
            dict_blocos = defaultdict(list)
            pontos_soltos = []
            
            for p in pontos:
                seq_id = p.get("sequencia_travada_id")
                if seq_id and str(seq_id).strip():
                    dict_blocos[str(seq_id).strip()].append(p)
                else:
                    pontos_soltos.append(p)
                    
            # Valida e ordena internamente cada bloco
            blocos_ativos = []
            for seq_id, pts_bloco in list(dict_blocos.items()):
                # Ordena pelo caminhamento original (e por id como fallback)
                pts_bloco.sort(key=lambda x: (x["ordem_caminhamento"] or 999999, x["id"]))
                if len(pts_bloco) >= 2:
                    blocos_ativos.append({
                        "id": seq_id,
                        "pontos": pts_bloco,
                        "pontas": [pts_bloco[0], pts_bloco[-1]]
                    })
                else:
                    # Bloco com apenas 1 ponto vira solto
                    pontos_soltos.extend(pts_bloco)

            # Algoritmo de busca com restrições
            pontos_ordenados = []
            
            # Determina o ponto de partida mais ao Norte entre pontos soltos e pontas de blocos
            possiveis_partidas = []
            for p in pontos_soltos:
                possiveis_partidas.append((p["lat"] or -90.0, p, None, None)) # (lat, ponto, bloco, ponta_idx)
            for b in blocos_ativos:
                possiveis_partidas.append((b["pontas"][0]["lat"] or -90.0, b["pontas"][0], b, 0))
                possiveis_partidas.append((b["pontas"][1]["lat"] or -90.0, b["pontas"][1], b, 1))
                
            if not possiveis_partidas:
                return {"sucesso": False, "erro": "Nenhum ponto com coordenadas válidas para iniciar."}
                
            # Seleciona o que está mais ao Norte
            _, pt_atual, bloco_atual, ponta_idx = max(possiveis_partidas, key=lambda x: x[0])
            
            # Consome o ponto de partida/bloco inicial
            if bloco_atual:
                pts_bloco = bloco_atual["pontos"]
                if ponta_idx == 0:
                    pontos_ordenados.extend(pts_bloco)
                else:
                    pontos_ordenados.extend(reversed(pts_bloco))
                blocos_ativos.remove(bloco_atual)
                pt_atual = pontos_ordenados[-1]
            else:
                pontos_ordenados.append(pt_atual)
                pontos_soltos.remove(pt_atual)
                
            # Loop principal
            while pontos_soltos or blocos_ativos:
                candidatos = []
                
                # Opções de pontos soltos
                for p in pontos_soltos:
                    d = math.hypot(
                        (p["lat"] or 0.0) - (pt_atual["lat"] or 0.0),
                        (p["lon"] or 0.0) - (pt_atual["lon"] or 0.0)
                    )
                    candidatos.append((d, p, None, None))
                    
                # Opções de pontas de blocos ativos
                for b in blocos_ativos:
                    d0 = math.hypot(
                        (b["pontas"][0]["lat"] or 0.0) - (pt_atual["lat"] or 0.0),
                        (b["pontas"][0]["lon"] or 0.0) - (pt_atual["lon"] or 0.0)
                    )
                    candidatos.append((d0, b["pontas"][0], b, 0))
                    
                    d1 = math.hypot(
                        (b["pontas"][1]["lat"] or 0.0) - (pt_atual["lat"] or 0.0),
                        (b["pontas"][1]["lon"] or 0.0) - (pt_atual["lon"] or 0.0)
                    )
                    candidatos.append((d1, b["pontas"][1], b, 1))
                    
                if not candidatos:
                    break
                    
                # Escolhe o mais próximo
                _, proximo_pt, proximo_bloco, ponta_idx = min(candidatos, key=lambda x: x[0])
                
                if proximo_bloco:
                    pts_bloco = proximo_bloco["pontos"]
                    if ponta_idx == 0:
                        pontos_ordenados.extend(pts_bloco)
                    else:
                        pontos_ordenados.extend(reversed(pts_bloco))
                    blocos_ativos.remove(proximo_bloco)
                    pt_atual = pontos_ordenados[-1]
                else:
                    pontos_ordenados.append(proximo_pt)
                    pontos_soltos.remove(proximo_pt)
                    pt_atual = proximo_pt
                    
            # Prepara a lista de objetos no formato aceito por salvar_ordem_caminhamento
            pontos_ordem = [{"id": pt["id"], "ordem": idx + 1} for idx, pt in enumerate(pontos_ordenados)]
            
        # Salva a nova ordem e reconstrói as divisas usando a lógica já consolidada
        return salvar_ordem_caminhamento(levantamento_id, matricula_id, pontos_ordem)
        
    except Exception as e:
        logger.error(f"Erro ao ordenar pontos: {e}", exc_info=True)
        return {"sucesso": False, "erro": str(e)}
