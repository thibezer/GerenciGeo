import sys
import os
sys.path.insert(0, os.path.abspath('.'))

import sqlite3
import re
from database.connection import DatabaseManager
from database.models import create_tables

def restaurar():
    conn_backup = sqlite3.connect('gerencigeo.db.backup')
    conn_backup.row_factory = sqlite3.Row
    cur_b = conn_backup.cursor()
    
    with DatabaseManager() as conn:
        create_tables(conn)
        cur = conn.cursor()
        
        # 1. Restaurar Profissionais
        cur_b.execute("SELECT * FROM profissionais")
        for prof in cur_b.fetchall():
            cur.execute("SELECT id FROM profissionais WHERE id = ?", (prof['id'],))
            if not cur.fetchone():
                cur.execute("""
                    INSERT INTO profissionais (id, nome, registro, codigo_credenciado, contador_m, contador_p, contador_v, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (prof['id'], prof['nome'], prof['registro'], prof['codigo_credenciado'], prof['contador_m'], prof['contador_p'], prof['contador_v'], prof['created_at']))
            else:
                cur.execute("""
                    UPDATE profissionais SET nome = ?, registro = ?, codigo_credenciado = ? WHERE id = ?
                """, (prof['nome'], prof['registro'], prof['codigo_credenciado'], prof['id']))

        # 2. Restaurar Propriedades
        cur_b.execute("SELECT * FROM propriedades")
        for prop in cur_b.fetchall():
            cur.execute("SELECT id FROM propriedades WHERE id = ?", (prop['id'],))
            if not cur.fetchone():
                cur.execute("""
                    INSERT INTO propriedades (id, nome_propriedade, codigo_ccir, municipio, uf, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (prop['id'], prop['nome'], prop['codigo_sncr'], prop['municipio'], prop['uf'], prop['created_at']))

        # 3. Restaurar Pessoas e Clientes
        cur_b.execute("SELECT * FROM clientes")
        for cli in cur_b.fetchall():
            # Verifica se já existe pessoa com esse CPF
            cpf_raw = cli['cpf_cnpj']
            cpf_limpo = re.sub(r'\D', '', str(cpf_raw)) if cpf_raw else None
            
            cur.execute("SELECT id FROM pessoas WHERE cpf_cnpj = ? OR (REPLACE(REPLACE(REPLACE(cpf_cnpj, '.', ''), '-', ''), '/', '') = ? AND ? IS NOT NULL)", (cpf_raw, cpf_limpo, cpf_limpo))
            p_row = cur.fetchone()
            if not p_row:
                cur.execute("""
                    INSERT INTO pessoas (
                        nome, cpf_cnpj, rg, nacionalidade, profissao, estado_civil, regime_bens, 
                        endereco_completo, nome_conjuge, cpf_conjuge, rg_conjuge, genero
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    cli['nome_completo'],
                    cpf_raw,
                    cli['rg_ie'],
                    cli['nacionalidade'] or 'Brasileiro(a)',
                    cli['profissao'],
                    cli['estado_civil'],
                    cli['regime_bens'],
                    cli['endereco_completo'],
                    cli['nome_conjuge'],
                    cli['cpf_conjuge'],
                    cli['rg_conjuge'],
                    'F' if 'Feminina' in str(cli['nome_completo']) or str(cli['estado_civil']).lower().startswith('casada') else 'M'
                ))
                pessoa_id = cur.lastrowid
            else:
                pessoa_id = p_row[0]
            
            # Insere em clientes com o id original
            cur.execute("SELECT id FROM clientes WHERE id = ?", (cli['id'],))
            if not cur.fetchone():
                cur.execute("""
                    INSERT INTO clientes (
                        id, pessoa_id, profissional_id, data_nascimento_fundacao,
                        email, telefone, cidade, estado, cep, sexo, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    cli['id'],
                    pessoa_id,
                    1,
                    cli['data_nascimento_fundacao'],
                    cli['email'],
                    cli['telefone'],
                    cli['cidade'],
                    cli['estado'],
                    cli['cep'],
                    'F' if 'Feminina' in str(cli['nome_completo']) or str(cli['estado_civil']).lower().startswith('casada') else 'M',
                    cli['created_at']
                ))

        # 4. Restaurar propriedade_clientes
        cur_b.execute("SELECT * FROM propriedade_clientes")
        for pc in cur_b.fetchall():
            cur.execute("SELECT id FROM propriedade_clientes WHERE id = ?", (pc['id'],))
            if not cur.fetchone():
                cur.execute("""
                    INSERT INTO propriedade_clientes (id, propriedade_id, cliente_id, percentual_participacao, created_at)
                    VALUES (?, ?, ?, ?, ?)
                """, (pc['id'], pc['propriedade_id'], pc['cliente_id'], pc['percentual_participacao'], pc['created_at']))

        # 5. Restaurar pendencias
        cur_b.execute("SELECT * FROM pendencias")
        for pend in cur_b.fetchall():
            cur.execute("SELECT id FROM pendencias WHERE id = ?", (pend['id'],))
            if not cur.fetchone():
                cur.execute("""
                    INSERT INTO pendencias (id, titulo, descricao, status, prioridade, data_criacao)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (pend['id'], pend['titulo'], pend['descricao'], pend['status'], pend['prioridade'], pend['data_criacao']))

        # 6. Restaurar cliente_historico_logs
        cur_b.execute("SELECT * FROM cliente_historico_logs")
        for log in cur_b.fetchall():
            cur.execute("SELECT id FROM cliente_historico_logs WHERE id = ?", (log['id'],))
            if not cur.fetchone():
                cur.execute("""
                    INSERT INTO cliente_historico_logs (id, id_cliente, campo_alterado, valor_antigo, valor_novo, data_alteracao)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (log['id'], log['id_cliente'], log['campo_alterado'], log['valor_antigo'], log['valor_novo'], log['data_alteracao']))

        conn.commit()
    conn_backup.close()
    print("Restauração concluída com sucesso!")

if __name__ == '__main__':
    restaurar()
