import logging
from database.connection import execute_query, DatabaseManager

logger = logging.getLogger(__name__)

class GenericRepo:
    def __init__(self, table):
        self.table = table

    def get_all(self):
        query = f"SELECT * FROM {self.table}"
        return [dict(r) for r in execute_query(query, fetch_all=True)]

    def get_by_id(self, item_id):
        query = f"SELECT * FROM {self.table} WHERE id = ?"
        row = execute_query(query, params=(item_id,), fetch_all=False, fetch_one=True)
        return dict(row) if row else None

    def delete(self, item_id):
        query = f"DELETE FROM {self.table} WHERE id = ?"
        execute_query(query, params=(item_id,), fetch_all=False, commit=True)
        return True

class HistoricoRinexRepo(GenericRepo):
    def __init__(self):
        super().__init__("historico_rinex")
        
    def find_duplicate(self, nome, tamanho):
        """Verifica se existe um arquivo com mesmo nome e tamanho convertido com sucesso"""
        query = "SELECT * FROM historico_rinex WHERE arquivo_nome = ? AND arquivo_tamanho = ? AND sucesso = 1"
        return [dict(r) for r in execute_query(query, params=(nome, tamanho), fetch_all=True)]

    def get_by_filename_and_size(self, nome, tamanho):
        query = "SELECT * FROM historico_rinex WHERE arquivo_nome = ? AND arquivo_tamanho = ?"
        row = execute_query(query, params=(nome, tamanho), fetch_all=False, fetch_one=True)
        return dict(row) if row else None

    def insert(self, arquivo_nome, arquivo_tamanho, arquivo_path, ponto_nome=None, data_inicio=None, data_fim=None, latitude=None, longitude=None, sucesso=True):
        query = """INSERT INTO historico_rinex 
                   (arquivo_nome, arquivo_tamanho, arquivo_path, ponto_nome, data_inicio, data_fim, latitude, longitude, sucesso) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"""
        return execute_query(query, params=(
            arquivo_nome, arquivo_tamanho, arquivo_path, ponto_nome, 
            data_inicio, data_fim, latitude, longitude, sucesso
        ), fetch_all=False, commit=True)

    def update(self, item_id, data_dict):
        set_clause = ", ".join([f"{k} = ?" for k in data_dict.keys()])
        query = f"UPDATE historico_rinex SET {set_clause} WHERE id = ?"
        params = list(data_dict.values())
        params.append(item_id)
        return execute_query(query, params=tuple(params), fetch_all=False, commit=True)

    def get_all_ordered(self):
        query = "SELECT * FROM historico_rinex ORDER BY created_at DESC"
        return [dict(r) for r in execute_query(query, fetch_all=True)]

# Levantar, as classes para MatriculaRepo, LevantamentoRepo e PontoRepo seguem lógica análoga e bulk insert via loop ou execute_many

class PendenciaRepo(GenericRepo):
    def __init__(self):
        super().__init__("pendencias")

    def insert(self, titulo, descricao, status="PENDENTE", prioridade="MEDIA"):
        query = """INSERT INTO pendencias (titulo, descricao, status, prioridade) 
                   VALUES (?, ?, ?, ?)"""
        return execute_query(query, params=(titulo, descricao, status, prioridade), fetch_all=False, commit=True)

    def update_status(self, item_id, status):
        query = "UPDATE pendencias SET status = ? WHERE id = ?"
        return execute_query(query, params=(status, item_id), fetch_all=False, commit=True)
        
    def get_pendentes_alta(self, limit=3):
        query = "SELECT * FROM pendencias WHERE status = 'PENDENTE' AND prioridade = 'ALTA' ORDER BY data_criacao DESC LIMIT ?"
        return [dict(r) for r in execute_query(query, params=(limit,), fetch_all=True)]

    def get_pendentes(self, limit=10):
        query = """SELECT * FROM pendencias WHERE status = 'PENDENTE' 
                   ORDER BY CASE prioridade WHEN 'ALTA' THEN 1 WHEN 'MEDIA' THEN 2 ELSE 3 END ASC, 
                            data_criacao DESC LIMIT ?"""
        return [dict(r) for r in execute_query(query, params=(limit,), fetch_all=True)]


class CcirCadastroRepo(GenericRepo):
    def __init__(self):
        super().__init__("ccir_cadastros")

    def insert_bulk(self, rows):
        """Insere múltiplos registros de CCIR em lote"""
        query = """
            INSERT INTO ccir_cadastros (
                codigo_imovel, denominacao, codigo_municipio, municipio, uf,
                area_total, titular, natureza_juridica, condicao_pessoa,
                percentual_detencao, pais, arquivo_origem
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.executemany(query, rows)

    def substituir_registros_arquivo(self, arquivo_origem, rows):
        """Troca os registros de um arquivo de origem pelos novos numa única transação"""
        query = """
            INSERT INTO ccir_cadastros (
                codigo_imovel, denominacao, codigo_municipio, municipio, uf,
                area_total, titular, natureza_juridica, condicao_pessoa,
                percentual_detencao, pais, arquivo_origem
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM ccir_cadastros WHERE arquivo_origem = ?", (arquivo_origem,))
            cursor.executemany(query, rows)

    def delete_by_arquivo(self, arquivo_origem):
        """Remove todos os registros vindos de um arquivo de origem específico"""
        query = "DELETE FROM ccir_cadastros WHERE arquivo_origem = ?"
        execute_query(query, params=(arquivo_origem,), fetch_all=False, commit=True)

    def search_ccir_avancado(self, filters, limit=100):
        """
        Busca registros de CCIR usando múltiplos filtros dinâmicos de forma simultânea (AND).
        """
        sql = "SELECT * FROM ccir_cadastros WHERE 1=1"
        params = []

        if filters.get("codigo_imovel"):
            sql += " AND codigo_imovel LIKE ?"
            params.append(f"%{filters['codigo_imovel']}%")

        if filters.get("denominacao"):
            sql += " AND denominacao LIKE ?"
            params.append(f"%{filters['denominacao']}%")

        if filters.get("titular"):
            sql += " AND titular LIKE ?"
            params.append(f"%{filters['titular']}%")

        if filters.get("municipio"):
            sql += " AND municipio LIKE ?"
            params.append(f"%{filters['municipio']}%")

        if filters.get("area_min") is not None:
            sql += " AND area_total >= ?"
            params.append(filters["area_min"])

        if filters.get("area_max") is not None:
            sql += " AND area_total <= ?"
            params.append(filters["area_max"])

        if filters.get("pct_min") is not None:
            sql += " AND percentual_detencao >= ?"
            params.append(filters["pct_min"])

        if filters.get("pct_max") is not None:
            sql += " AND percentual_detencao <= ?"
            params.append(filters["pct_max"])

        sql += " ORDER BY id DESC LIMIT ?"
        params.append(limit)

        return [dict(r) for r in execute_query(sql, params=tuple(params), fetch_all=True)]

    def get_by_codigo_imovel(self, codigo_imovel):
        """Retorna todos os registros cadastrados para o mesmo código de imóvel (coproprietários)"""
        query = "SELECT * FROM ccir_cadastros WHERE codigo_imovel = ?"
        return [dict(r) for r in execute_query(query, params=(codigo_imovel,), fetch_all=True)]

    def get_imported_files(self):
        """Retorna os arquivos importados e a quantidade de registros cadastrados por eles"""
        query = """
            SELECT arquivo_origem, COUNT(*) as total_registros, MIN(created_at) as data_importacao 
            FROM ccir_cadastros 
            GROUP BY arquivo_origem
        """
        return [dict(r) for r in execute_query(query, fetch_all=True)]

