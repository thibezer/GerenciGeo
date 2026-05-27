import os
import json
import logging
from datetime import datetime
from database.connection import execute_query

logger = logging.getLogger(__name__)

class HistoricoCampoLogger:
    @staticmethod
    def registrar_evento(levantamento_id: int, tipo_evento: str, descricao: str, dados_detalhados: dict = None) -> int:
        """
        Registra um evento de auditoria no banco de dados SQLite e também de forma síncrona
        em um arquivo físico HISTORICO_CAMPO.json localizado na pasta do levantamento.
        """
        # 1. Persiste no SQLite
        dados_json = json.dumps(dados_detalhados, ensure_ascii=False) if dados_detalhados else "{}"
        query = """
            INSERT INTO historico_alteracoes_campo (levantamento_id, tipo_evento, descricao, dados_detalhados)
            VALUES (?, ?, ?, ?)
        """
        inserted_id = None
        try:
            execute_query(query, params=(levantamento_id, tipo_evento, descricao, dados_json), commit=True)
            # Busca o último ID inserido
            row = execute_query("SELECT last_insert_rowid() as last_id", fetch_one=True)
            if row:
                inserted_id = row["last_id"]
        except Exception as e:
            logger.error(f"[HISTORICO] Erro ao registrar evento no SQLite: {e}")

        # 2. Persiste fisicamente no arquivo do Workspace do Levantamento
        try:
            from business.workspace_manager import WorkspaceManager
            wm = WorkspaceManager()
            folder = wm.get_levantamento_folder(levantamento_id)
            folder_historico = folder / "Historico"
            folder_historico.mkdir(parents=True, exist_ok=True)
            
            filepath = folder_historico / "HISTORICO_CAMPO.json"
            
            # Carrega histórico existente
            historico = []
            if filepath.exists():
                try:
                    with open(filepath, "r", encoding="utf-8") as f:
                        historico = json.load(f)
                except Exception as ex_read:
                    logger.warning(f"[HISTORICO] Erro ao ler arquivo físico existente, recriando: {ex_read}")
            
            # Monta o novo item
            novo_item = {
                "id": inserted_id,
                "levantamento_id": levantamento_id,
                "timestamp": datetime.now().isoformat(),
                "tipo_evento": tipo_evento,
                "descricao": descricao,
                "dados_detalhados": dados_detalhados or {}
            }
            historico.insert(0, novo_item) # Adiciona no início (mais recente primeiro)
            
            # Grava no arquivo
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(historico, f, indent=3, ensure_ascii=False)
                
            logger.info(f"[HISTORICO] Evento '{tipo_evento}' logado com sucesso no workspace físico de Lev_{levantamento_id}.")
        except Exception as e:
            logger.error(f"[HISTORICO] Erro crítico ao gravar histórico no arquivo físico do levantamento {levantamento_id}: {e}")

        return inserted_id
