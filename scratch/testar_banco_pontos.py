import sqlite3
import re
import os

db_path = "gerencigeo.db"

def testar_fluxo():
    print("--- INICIANDO TESTE DO BANCO DE PONTOS ---")
    
    # 1. Conectar ao banco e garantir tabelas
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    try:
        # Inserir profissional de teste
        print("[TESTE] Criando profissional de teste...")
        cursor.execute("SELECT id FROM profissionais WHERE codigo_credenciado = 'TEST'")
        prof_row = cursor.fetchone()
        
        if prof_row:
            prof_id = prof_row["id"]
        else:
            cursor.execute("""
                INSERT INTO profissionais (nome, registro, codigo_credenciado, endereco)
                VALUES ('Profissional Teste', 'CREA-TEST-123', 'TEST', 'Rua Teste, 100')
            """)
            prof_id = cursor.lastrowid
            
        print(f"[TESTE] Profissional ID: {prof_id}")
        
        # Inserir propriedade de teste (se não houver)
        cursor.execute("SELECT id FROM propriedades WHERE nome_propriedade = 'Fazenda Teste'")
        prop_row = cursor.fetchone()
        if prop_row:
            prop_id = prop_row["id"]
        else:
            cursor.execute("""
                INSERT INTO propriedades (nome_propriedade, municipio, uf)
                VALUES ('Fazenda Teste', 'Paranavaí', 'PR')
            """)
            prop_id = cursor.lastrowid
            
        # Inserir levantamento de teste
        print("[TESTE] Criando levantamento de teste...")
        cursor.execute("""
            INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio, status)
            VALUES (?, ?, '2026-06-09', 'EM_ANDAMENTO')
        """)
        lev_id = cursor.lastrowid
        print(f"[TESTE] Levantamento ID: {lev_id}")
        
        # Simular upload de arquivo final homologado do INCRA
        conteudo_arquivo = """
        Este é um arquivo do SIGEF contendo vértices homologados do credenciado TEST:
        Vértice 1: TEST-M-0001
        Vértice 2: TEST-M-0002
        Vértice 3: TEST-M-0004 (pulando o 3 de propósito para testar lacunas)
        Vértice 4: TEST-P-0010 (pulando de 1 a 9 para testar lacunas)
        Vértice 5: TEST-V-0001
        Vértice 6: TEST-M-0005
        """
        
        # Executar a lógica de parsing diretamente
        print("[TESTE] Simulando parsing do arquivo de homologação...")
        pattern = re.compile(rf"\b(TEST)-(M|P|V)-(\d+)\b", re.IGNORECASE)
        matches = pattern.findall(conteudo_arquivo)
        
        print(f"[TESTE] Matches encontrados: {matches}")
        assert len(matches) == 6, "Deveria ter encontrado 6 matches de vértices"
        
        pontos_unicos = {}
        for match in matches:
            tipo = match[1].upper()
            num = int(match[2])
            pontos_unicos[(tipo, num)] = f"TEST-{tipo}-{num:04d}"
            
        print(f"[TESTE] Pontos únicos a inserir: {pontos_unicos}")
        assert len(pontos_unicos) == 5, "Deveria ter desduplicado para 5 pontos únicos"
        
        # Inserir no banco de pontos
        print("[TESTE] Gravando pontos homologados no banco...")
        cursor.execute("DELETE FROM banco_pontos WHERE levantamento_id = ?", (lev_id,))
        
        pontos_inseridos = 0
        for (tipo, num), cod_completo in pontos_unicos.items():
            cursor.execute("""
                INSERT OR IGNORE INTO banco_pontos 
                (profissional_id, levantamento_id, tipo_ponto, numero, codigo_completo) 
                VALUES (?, ?, ?, ?, ?)
            """, (prof_id, lev_id, tipo, num, cod_completo))
            if cursor.rowcount > 0:
                pontos_inseridos += 1
                
        print(f"[TESTE] Pontos gravados com sucesso: {pontos_inseridos}")
        assert pontos_inseridos == 5, "Deveria ter inserido exatamente 5 pontos"
        
        # Recalcular contadores
        for t in ['M', 'P', 'V']:
            cursor.execute("SELECT MAX(numero) as max_num FROM banco_pontos WHERE profissional_id = ? AND tipo_ponto = ?", (prof_id, t))
            row_max = cursor.fetchone()
            max_num = row_max["max_num"] if row_max and row_max["max_num"] is not None else 0
            col_name = f"contador_{t.lower()}"
            cursor.execute(f"UPDATE profissionais SET {col_name} = ? WHERE id = ?", (max_num, prof_id))
            
        conn.commit()
        
        # Validar as estatísticas e lacunas
        print("[TESTE] Buscando estatísticas de numeração e lacunas...")
        cursor.execute("SELECT * FROM banco_pontos WHERE profissional_id = ? ORDER BY tipo_ponto, numero", (prof_id,))
        pontos_usados = [dict(r) for r in cursor.fetchall()]
        
        estatisticas = {}
        for t in ['M', 'P', 'V']:
            nums_tipo = [p['numero'] for p in pontos_usados if p['tipo_ponto'] == t]
            if nums_tipo:
                max_num = max(nums_tipo)
                proximo = max_num + 1
                set_usados = set(nums_tipo)
                lacunas = [n for n in range(1, max_num) if n not in set_usados]
            else:
                max_num = 0
                proximo = 1
                lacunas = []
                
            estatisticas[t] = {
                "ultimo_usado": max_num,
                "proximo_recomendado": proximo,
                "total_usados": len(nums_tipo),
                "lacunas": lacunas
            }
            
        print(f"[TESTE] Estatísticas processadas: {estatisticas}")
        
        # Validações dos resultados
        assert estatisticas['M']['ultimo_usado'] == 5, "Último marco deveria ser o 5"
        assert estatisticas['M']['proximo_recomendado'] == 6, "Próximo marco sugerido deveria ser o 6"
        assert estatisticas['M']['lacunas'] == [3], "A lacuna de marco deveria ser o número 3"
        
        assert estatisticas['P']['ultimo_usado'] == 10, "Último ponto deveria ser o 10"
        assert estatisticas['P']['proximo_recomendado'] == 11, "Próximo ponto sugerido deveria ser o 11"
        assert estatisticas['P']['lacunas'] == [1, 2, 3, 4, 5, 6, 7, 8, 9], "As lacunas de pontos deveriam ser de 1 a 9"
        
        assert estatisticas['V']['ultimo_usado'] == 1, "Último virtual deveria ser o 1"
        assert estatisticas['V']['proximo_recomendado'] == 2, "Próximo virtual sugerido deveria ser o 2"
        assert estatisticas['V']['lacunas'] == [], "Não deveria haver lacunas para virtual"
        
        print("[TESTE] SUCESSO: Todos os testes lógicos do banco de pontos passaram!")
        
    except Exception as e:
        print(f"[TESTE] ERRO CRÍTICO: {e}")
        conn.rollback()
        raise e
    finally:
        # Cleanup
        print("[TESTE] Limpando banco de dados de teste...")
        try:
            cursor.execute("DELETE FROM banco_pontos WHERE levantamento_id = ?", (lev_id,))
            cursor.execute("DELETE FROM levantamentos WHERE id = ?", (lev_id,))
            cursor.execute("DELETE FROM profissionais WHERE id = ?", (prof_id,))
            conn.commit()
        except Exception as e_clean:
            print(f"[TESTE] Erro no cleanup: {e_clean}")
        conn.close()

if __name__ == "__main__":
    testar_fluxo()
