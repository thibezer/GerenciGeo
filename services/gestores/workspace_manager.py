import os
import shutil
import re
from pathlib import Path
from config import EXPORT_BASE_FOLDER
from database.connection import execute_query

def sanitizar_nome_pasta(nome: str) -> str:
    """Remove caracteres invÃ¡lidos para nomes de pastas no Windows"""
    nome_limpo = re.sub(r'[\\/*?:"<>|]', "", nome)
    return nome_limpo.strip()

class WorkspaceManager:
    def __init__(self, base_folder=None):
        self.base_folder = Path(base_folder) if base_folder else Path(EXPORT_BASE_FOLDER)
        self.base_folder.mkdir(parents=True, exist_ok=True)

    def get_levantamento_folder(self, levantamento_id: int) -> Path:
        """Retorna o caminho estruturado: EXPORT_BASE_FOLDER/Projetos/[Nome_da_Propriedade]/Lev_[ID]_[Ano]"""
        query = """
            SELECT l.id, l.data_inicio, p.nome_propriedade 
            FROM levantamentos l 
            JOIN propriedades p ON l.propriedade_id = p.id 
            WHERE l.id = ?
        """
        try:
            res = execute_query(query, params=(levantamento_id,), fetch_one=True)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"[WORKSPACE] Erro ao buscar levantamento: {e}")
            res = None

        if not res:
            # Fallback seguro caso o registro ainda não esteja persistido por completo ou sem propriedade
            return self.montar_caminho(levantamento_id, None, None)

        res = dict(res)
        return self.montar_caminho(levantamento_id, res.get("nome_propriedade"), res.get("data_inicio"))

    def montar_caminho(self, levantamento_id: int, nome_propriedade, data_inicio) -> Path:
        """
        Calcula o caminho da pasta a partir do nome da propriedade e da data de início, sem consultar o banco.
        Permite saber o destino de uma alteração ANTES de gravá-la (ver mover_workspace).
        """
        nome_prop_limpo = sanitizar_nome_pasta(nome_propriedade or "Sem_Nome") if nome_propriedade is not None else "Propriedade_Desconhecida"
        ano = "Sem_Ano"
        if data_inicio:
            try:
                if isinstance(data_inicio, str):
                    if "-" in data_inicio:
                        ano = data_inicio.split("-")[0]
                    elif "/" in data_inicio:
                        parts = data_inicio.split("/")
                        if len(parts[0]) == 4:
                            ano = parts[0]
                        else:
                            ano = parts[2]
                else:
                    ano = str(data_inicio.year)
            except Exception as e:
                import logging
                logging.getLogger(__name__).error(f"[WORKSPACE] Erro ao extrair ano: {e}")

        return self.base_folder / "Projetos" / nome_prop_limpo / f"Lev_{levantamento_id}_{ano}"

    @staticmethod
    def pasta_tem_arquivos(folder: Path) -> bool:
        return folder.exists() and any(p.is_file() for p in folder.rglob("*"))

    def mover_workspace(self, origem: Path, destino: Path):
        """
        Move a pasta do levantamento quando o caminho calculado muda (troca de propriedade ou do ano
        da data de início). Um destino que exista mas sem arquivos (só a árvore vazia) é substituído;
        um destino com arquivos é conflito e deve ser barrado antes pelo chamador.
        """
        if origem == destino or not origem.exists():
            return
        if destino.exists():
            if self.pasta_tem_arquivos(destino):
                raise FileExistsError(f"A pasta de destino já contém arquivos: {destino}")
            shutil.rmtree(destino)
        destino.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(origem), str(destino))

    def create_workspace(self, levantamento_id: int) -> str:
        """Cria fisicamente a Ã¡rvore de diretÃ³rios exigida no Windows"""
        folder = self.get_levantamento_folder(levantamento_id)
        
        # CriaÃ§Ã£o das pastas estruturadas (Brutos, Rinex, Processados, Documentos, Exportacoes)
        (folder / "Brutos").mkdir(parents=True, exist_ok=True)
        (folder / "Rinex").mkdir(parents=True, exist_ok=True)
        (folder / "Processados").mkdir(parents=True, exist_ok=True)
        (folder / "Documentos").mkdir(parents=True, exist_ok=True)
        (folder / "Exportacoes").mkdir(parents=True, exist_ok=True)
        
        return str(folder)

    def move_file_to_workspace(self, levantamento_id: int, file_path: str, category: str) -> str:
        """
        Move um arquivo processado para a subpasta correta.
        Categorias: 'Brutos', 'Rinex', 'Processados', 'Documentos', 'Exportacoes'
        """
        import stat
        source_path = Path(file_path)
        if not source_path.exists():
            raise FileNotFoundError(f"Arquivo nÃ£o encontrado: {file_path}")
            
        dest_folder = self.get_levantamento_folder(levantamento_id) / category
        if not dest_folder.exists():
            self.create_workspace(levantamento_id)
            
        dest_path = dest_folder / source_path.name
        
        # Evitar sobrescrita: adiciona sufixo numÃ©rico em caso de duplicidade
        if dest_path.exists():
            counter = 1
            while True:
                new_name = f"{source_path.stem}_{counter}{source_path.suffix}"
                dest_path = dest_folder / new_name
                if not dest_path.exists():
                    break
                counter += 1
                
        shutil.move(str(source_path), str(dest_path))

        # Blindagem fÃ­sica: se for Brutos, define como Somente Leitura (Read-Only)
        if category == "Brutos":
            try:
                permissao_atual = os.stat(dest_path).st_mode
                os.chmod(dest_path, permissao_atual & ~stat.S_IWRITE)
                import logging
                logging.getLogger(__name__).info(f"[WORKSPACE] Arquivo bruto blindado como Read-Only: {dest_path.name}")
            except Exception as e_ch:
                import logging
                logging.getLogger(__name__).warning(f"[WORKSPACE] NÃ£o foi possÃ­vel definir Read-Only para {dest_path.name}: {e_ch}")

        return str(dest_path)
        
    def delete_workspace(self, levantamento_id: int, folder: Path = None):
        """
        Remove a pasta física do levantamento. O caminho deve ser resolvido ANTES de apagar o
        registro do banco (get_levantamento_folder depende dele); passe-o em `folder` nesse caso.
        Arquivos Read-Only (Brutos, workspace travado) são destravados antes da remoção no Windows.
        """
        import stat
        import sys

        if folder is None:
            folder = self.get_levantamento_folder(levantamento_id)
        if not folder.exists():
            return

        def _forcar_remocao(func, path, _exc):
            os.chmod(path, stat.S_IWRITE)
            func(path)

        if sys.version_info >= (3, 12):
            shutil.rmtree(folder, onexc=_forcar_remocao)
        else:
            shutil.rmtree(folder, onerror=_forcar_remocao)

    def travar_workspace_inteiro_readonly(self, levantamento_id: int):
        """Trava todos os arquivos da pasta do levantamento como Read-Only no Windows"""
        folder = self.get_levantamento_folder(levantamento_id)
        if folder.exists():
            import stat
            for root, dirs, files in os.walk(folder):
                for f in files:
                    path_f = Path(root) / f
                    try:
                        permissao = os.stat(path_f).st_mode
                        os.chmod(path_f, permissao & ~stat.S_IWRITE)
                    except Exception as e:
                        import logging
                        logging.getLogger(__name__).error(f"[WORKSPACE] Erro ao travar arquivo {path_f}: {e}")

    def destravar_workspace_inteiro(self, levantamento_id: int):
        """Restabelece permissão de escrita em todos os arquivos da pasta do levantamento no Windows"""
        folder = self.get_levantamento_folder(levantamento_id)
        if folder.exists():
            import stat
            for root, dirs, files in os.walk(folder):
                for f in files:
                    path_f = Path(root) / f
                    try:
                        permissao = os.stat(path_f).st_mode
                        os.chmod(path_f, permissao | stat.S_IWRITE)
                    except Exception as e:
                        import logging
                        logging.getLogger(__name__).error(f"[WORKSPACE] Erro ao destravar arquivo {path_f}: {e}")

