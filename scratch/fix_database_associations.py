import sqlite3
import re
import unicodedata

def fix():
    db_path = "gerencigeo.db"
    print(f"Lendo banco de dados em: {db_path}")
    conn = sqlite3.connect(db_path)
    # Habilitar row_factory para dicionários
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # 1. Pega todas as planilhas do levantamento (ou de todos os levantamentos)
    cursor.execute("SELECT DISTINCT levantamento_id, planilha_origem, matricula_id FROM banco_pontos WHERE planilha_origem IS NOT NULL")
    planilhas = [dict(r) for r in cursor.fetchall()]
    
    for row in planilhas:
        lev_id = row["levantamento_id"]
        planilha = row["planilha_origem"]
        mat_id = row["matricula_id"]
        
        if not mat_id:
            print(f"Planilha '{planilha}' do levantamento {lev_id} não possui matricula associada. Ignorando.")
            continue
            
        print(f"Sincronizando planilha '{planilha}' do levantamento {lev_id} com matricula {mat_id}...")
        
        # Deleta os pontos homologados anteriores desta planilha
        cursor.execute("SELECT id FROM pontos WHERE levantamento_id = ? AND arquivo_origem = ? AND origem_homologada = 1", (lev_id, planilha))
        ponto_ids = [r["id"] for r in cursor.fetchall()]
        
        if ponto_ids:
            placeholders = ",".join("?" for _ in ponto_ids)
            cursor.execute(f"DELETE FROM segmentos WHERE ponto_inicio_id IN ({placeholders}) OR ponto_fim_id IN ({placeholders})", ponto_ids + ponto_ids)
            cursor.execute("DELETE FROM pontos WHERE levantamento_id = ? AND arquivo_origem = ? AND origem_homologada = 1", (lev_id, planilha))
        
        # Busca os pontos salvos em banco_pontos
        cursor.execute(
            """
            SELECT codigo_completo, tipo_ponto, numero, lat, lon, altitude,
                   sigma_n, sigma_e, sigma_z, metodo_posicionamento, tipo_limite,
                   cns_confrontante, matricula_confrontante, confrontante_descritivo
            FROM banco_pontos
            WHERE levantamento_id = ? AND planilha_origem = ?
            ORDER BY id ASC
            """,
            (lev_id, planilha)
        )
        pontos_banco = [dict(r) for r in cursor.fetchall()]
        
        pontos_inseridos = []
        for idx, p in enumerate(pontos_banco):
            idx_ordem = idx + 1
            cursor.execute(
                """
                INSERT INTO pontos 
                (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, 
                 sigma_lat, sigma_lon, sigma_alt, ordem_caminhamento, status_ponto, metodo_posicionamento, arquivo_origem, origem_homologada)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                """,
                (
                    lev_id, mat_id, p["codigo_completo"], p["tipo_ponto"], p["lat"], p["lon"], p["altitude"],
                    p["sigma_e"], p["sigma_n"], p["sigma_z"], idx_ordem, 'CORRIGIDO', p["metodo_posicionamento"], planilha
                )
            )
            p["db_ponto_id"] = cursor.lastrowid
            pontos_inseridos.append(p)
            
        # Re-gerar segmentos
        if len(pontos_inseridos) >= 2:
            # Confrontantes do levantamento
            cursor.execute("SELECT id, nome, matricula_imovel FROM confrontantes WHERE levantamento_id = ?", (lev_id,))
            confs = [dict(r) for r in cursor.fetchall()]
            
            def normalizar_texto(texto: str) -> str:
                if not texto: return ""
                texto = "".join(ch for ch in unicodedata.normalize('NFKD', texto) if not unicodedata.combining(ch))
                return re.sub(r'\s+', ' ', texto.strip().upper())
                
            cache_confs = {}
            for c in confs:
                c_nome = normalizar_texto(c["nome"])
                c_mat = (c["matricula_imovel"] or "").strip().upper()
                if c_mat: cache_confs[c_mat] = c["id"]
                if c_nome: cache_confs[c_nome] = c["id"]
            
            mapa_vertices_conf = {}
            for p in pontos_inseridos:
                matricula_conf = (p.get("matricula_confrontante") or "").strip().upper()
                desc = (p.get("confrontante_descritivo") or "").strip()
                # Extrair nome confrontante limpo
                nome_conf = desc.split("CONFRONTANTE:")[-1].split("MATRICULA:")[0].split("CNS:")[0].strip() if "CONFRONTANTE:" in desc else desc
                nome_conf_norm = normalizar_texto(nome_conf)
                
                conf_id = None
                if matricula_conf and matricula_conf in cache_confs:
                    conf_id = cache_confs[matricula_conf]
                elif nome_conf_norm and nome_conf_norm in cache_confs:
                    conf_id = cache_confs[nome_conf_norm]
                    
                mapa_vertices_conf[p["codigo_completo"]] = conf_id
            
            N = len(pontos_inseridos)
            for i in range(N):
                p_ini = pontos_inseridos[i]
                p_fim = pontos_inseridos[(i + 1) % N]
                
                conf_id = mapa_vertices_conf.get(p_ini["codigo_completo"])
                
                cursor.execute(
                    """
                    INSERT INTO segmentos
                    (levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, confrontante_id,
                     tipo_limite_sigef, metodo_posicionamento_sigef, origem_homologada)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
                    """,
                    (
                        lev_id, mat_id, p_ini["db_ponto_id"], p_fim["db_ponto_id"], conf_id,
                        p_ini["tipo_limite"] or "Limite Não Definido", p_ini["metodo_posicionamento"] or "PG1"
                    )
                )
    
    conn.commit()
    conn.close()
    print("Banco de dados sincronizado com sucesso!")

if __name__ == "__main__":
    fix()
