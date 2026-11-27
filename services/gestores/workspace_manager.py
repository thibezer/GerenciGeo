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

    def get_propriedade_folder(self, propriedade_id: int) -> Path:
        """Pasta dos arquivos da propriedade (CAR, CCIR, certidões de matrícula, shapefile de fronteira)."""
        return self.base_folder / "Propriedades" / f"Prop_{propriedade_id}"

    def _propriedade_do_levantamento(self, levantamento_id: int):
        row = execute_query("SELECT propriedade_id FROM levantamentos WHERE id = ?", params=(levantamento_id,), fetch_one=True)
        return row["propriedade_id"] if row else None

    def _arquivos_confrontantes_do_levantamento(self, levantamento_id: int) -> list[Path]:
        """PDFs de matrícula dos confrontantes DESTE levantamento (ficam em Prop_X/Confrontantes, junto dos de outros levantamentos)."""
        rows = execute_query(
            "SELECT caminho_matricula_pdf FROM confrontantes WHERE levantamento_id = ? AND caminho_matricula_pdf IS NOT NULL AND caminho_matricula_pdf != ''",
            params=(levantamento_id,), fetch_all=True
        )
        return [Path(r["caminho_matricula_pdf"]) for r in rows or []]

    @staticmethod
    def _alterar_arquivo(path_f: Path, permitir: bool, falhas: list[str]) -> None:
        import stat
        import logging
        try:
            permissao = os.stat(path_f).st_mode
            os.chmod(path_f, (permissao | stat.S_IWRITE) if permitir else (permissao & ~stat.S_IWRITE))
        except Exception as e:
            logging.getLogger(__name__).error(f"[WORKSPACE] Erro ao {'destravar' if permitir else 'travar'} arquivo {path_f}: {e}")
            falhas.append(str(path_f))

    @classmethod
    def _alterar_escrita(cls, folder: Path, permitir: bool, ignorar_subpastas: tuple[str, ...] = ()) -> list[str]:
        """Liga/desliga a escrita de todos os arquivos da pasta (exceto as subpastas ignoradas). Retorna os que falharam."""
        falhas = []
        if not folder.exists():
            return falhas
        for root, _dirs, files in os.walk(folder):
            if any(sub in Path(root).relative_to(folder).parts for sub in ignorar_subpastas):
                continue
            for f in files:
                cls._alterar_arquivo(Path(root) / f, permitir, falhas)
        return falhas

    def _alterar_confrontantes(self, levantamento_id: int, permitir: bool) -> list[str]:
        falhas = []
        for path_f in self._arquivos_confrontantes_do_levantamento(levantamento_id):
            if path_f.is_file():
                self._alterar_arquivo(path_f, permitir, falhas)
        return falhas

    def travar_workspace_inteiro_readonly(self, levantamento_id: int) -> list[str]:
        """
        Trava como Read-Only a pasta do levantamento, a pasta da propriedade (o arquivamento trava a propriedade
        inteira) e os PDFs dos confrontantes deste levantamento. A subpasta Confrontantes da propriedade é
        compartilhada com outros levantamentos, por isso só os arquivos deste são travados.
        Retorna os arquivos que não puderam ser travados.
        """
        falhas = self._alterar_escrita(self.get_levantamento_folder(levantamento_id), permitir=False)
        prop_id = self._propriedade_do_levantamento(levantamento_id)
        if prop_id is not None:
            falhas += self._alterar_escrita(self.get_propriedade_folder(prop_id), permitir=False, ignorar_subpastas=("Confrontantes",))
        falhas += self._alterar_confrontantes(levantamento_id, permitir=False)
        return falhas

    def destravar_workspace_inteiro(self, levantamento_id: int, incluir_propriedade: bool = True) -> list[str]:
        """
        Restabelece a escrita na pasta do levantamento (mantendo os Brutos blindados, Read-Only desde a importação)
        e nos PDFs dos confrontantes deste levantamento.
        `incluir_propriedade=False` mantém a pasta da propriedade travada (ainda há outro levantamento arquivado).
        """
        falhas = self._alterar_escrita(self.get_levantamento_folder(levantamento_id), permitir=True, ignorar_subpastas=("Brutos",))
        falhas += self._alterar_confrontantes(levantamento_id, permitir=True)
        prop_id = self._propriedade_do_levantamento(levantamento_id)
        if incluir_propriedade and prop_id is not None:
            # Sem levantamento arquivado na propriedade, nada nela deve ficar travado (inclui Confrontantes inteira)
            falhas += self._alterar_escrita(self.get_propriedade_folder(prop_id), permitir=True)
        return falhas

