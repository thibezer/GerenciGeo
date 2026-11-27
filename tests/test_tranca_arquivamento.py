"""
tests/test_tranca_arquivamento.py
Tranca de Segurança Read-Only: um levantamento ARQUIVADO trava a propriedade inteira (banco e disco).
"""
import io
import os
import stat
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from api import app
from database.connection import DatabaseManager, execute_query
from services.gestores.workspace_manager import WorkspaceManager

client = TestClient(app)


class TestTrancaArquivamentoRotas(unittest.TestCase):
    def setUp(self):
        with DatabaseManager() as conn:
            c = conn.cursor()
            c.execute("INSERT INTO profissionais (nome, registro, codigo_credenciado) VALUES ('Prof Tranca', 'CREA 0001', 'TRC')")
            self.prof_id = c.lastrowid
            c.execute("INSERT INTO propriedades (nome_propriedade, municipio, uf) VALUES ('Fazenda Tranca Teste', 'Maracaju', 'MS')")
            self.prop_id = c.lastrowid
            c.execute("INSERT INTO matriculas (propriedade_id, numero_matricula, area_ha) VALUES (?, '777', 10.0)", (self.prop_id,))
            self.mat_id = c.lastrowid
            c.execute(
                "INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio, status) VALUES (?, ?, '2025-01-10', 'ARQUIVADO')",
                (self.prop_id, self.prof_id))
            self.lev_arq = c.lastrowid
            c.execute(
                "INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio, status) VALUES (?, ?, '2026-01-10', 'EM_ANDAMENTO')",
                (self.prop_id, self.prof_id))
            self.lev_ativo = c.lastrowid
            c.execute("INSERT INTO confrontantes (levantamento_id, nome) VALUES (?, 'Vizinho Tranca')", (self.lev_arq,))
            self.conf_id = c.lastrowid
            conn.commit()

    def tearDown(self):
        levs = (self.lev_arq, self.lev_ativo)
        execute_query("DELETE FROM logs_auditoria_seguranca WHERE levantamento_id IN (?, ?)", params=levs, commit=True)
        execute_query("DELETE FROM confrontantes WHERE id = ?", params=(self.conf_id,), commit=True)
        execute_query("DELETE FROM matriculas WHERE propriedade_id = ?", params=(self.prop_id,), commit=True)
        execute_query("DELETE FROM levantamentos WHERE id IN (?, ?)", params=levs, commit=True)
        execute_query("DELETE FROM propriedades WHERE id = ?", params=(self.prop_id,), commit=True)
        execute_query("DELETE FROM profissionais WHERE id = ?", params=(self.prof_id,), commit=True)
        for uid in getattr(self, "_usuarios", []):
            execute_query("DELETE FROM users WHERE id = ?", params=(uid,), commit=True)

    def test_criar_matricula_pela_propriedade_bloqueada(self):
        res = client.post(f"/propriedades/{self.prop_id}/matriculas", json={"numero_matricula": "888"})
        self.assertEqual(res.status_code, 403, res.text)

    def test_criar_matricula_por_outro_levantamento_da_propriedade_bloqueada(self):
        res = client.post(f"/levantamentos/{self.lev_ativo}/matriculas", json={"numero_matricula": "889"})
        self.assertEqual(res.status_code, 403, res.text)
        row = execute_query("SELECT id FROM matriculas WHERE propriedade_id = ? AND numero_matricula = '889'",
                            params=(self.prop_id,), fetch_one=True)
        self.assertIsNone(row)

    def test_subrotas_de_matricula_bloqueadas(self):
        res = client.delete(f"/matriculas/{self.mat_id}/pdf")
        self.assertEqual(res.status_code, 403, res.text)
        res = client.post(f"/matriculas/{self.mat_id}/upload-pdf",
                          files={"file": ("cert.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")})
        self.assertEqual(res.status_code, 403, res.text)

    def test_subrota_de_confrontante_bloqueada(self):
        res = client.delete(f"/confrontantes/{self.conf_id}/matricula")
        self.assertEqual(res.status_code, 403, res.text)

    def test_erro_na_verificacao_falha_fechado(self):
        with patch("routes.deps.execute_query", side_effect=RuntimeError("banco indisponível")):
            res = client.put(f"/propriedades/{self.prop_id}", json={"nome_propriedade": "Alterada"})
        self.assertEqual(res.status_code, 503, res.text)
        row = execute_query("SELECT nome_propriedade FROM propriedades WHERE id = ?", params=(self.prop_id,), fetch_one=True)
        self.assertEqual(row["nome_propriedade"], "Fazenda Tranca Teste")

    def test_arquivamento_abortado_se_tranca_em_disco_falhar(self):
        with patch("routes.levantamento.crud.ExportacaoService.gerar_snapshot_arquivamento", return_value=str(Path(tempfile.gettempdir()) / "snap_tranca_teste.json")), \
             patch.object(WorkspaceManager, "travar_workspace_inteiro_readonly", return_value=["X:/arquivo_preso.txt"]), \
             patch.object(WorkspaceManager, "destravar_workspace_inteiro", return_value=[]) as destravar:
            res = client.post(f"/levantamentos/{self.lev_ativo}/arquivar")
        self.assertEqual(res.status_code, 500, res.text)
        destravar.assert_called_once()
        # Outro levantamento da propriedade segue arquivado: a pasta da propriedade não pode ser destravada
        self.assertFalse(destravar.call_args.kwargs["incluir_propriedade"])
        row = execute_query("SELECT status FROM levantamentos WHERE id = ?", params=(self.lev_ativo,), fetch_one=True)
        self.assertEqual(row["status"], "EM_ANDAMENTO")

    def test_arquivamento_abortado_se_tranca_em_disco_lancar_erro(self):
        with patch("routes.levantamento.crud.ExportacaoService.gerar_snapshot_arquivamento", return_value=str(Path(tempfile.gettempdir()) / "snap_tranca_teste.json")),              patch.object(WorkspaceManager, "travar_workspace_inteiro_readonly", side_effect=OSError("disco")),              patch.object(WorkspaceManager, "destravar_workspace_inteiro", return_value=[]) as destravar:
            res = client.post(f"/levantamentos/{self.lev_ativo}/arquivar")
        self.assertEqual(res.status_code, 500, res.text)
        destravar.assert_called_once()
        row = execute_query("SELECT status FROM levantamentos WHERE id = ?", params=(self.lev_ativo,), fetch_one=True)
        self.assertEqual(row["status"], "EM_ANDAMENTO")


    # ── Desarquivar: somente administradores, com usuário real na auditoria ──

    def _usuario(self, role: str) -> str:
        import secrets
        from routes.auth import active_sessions
        email = f"tranca_{role}_{secrets.token_hex(4)}@teste.local"
        with DatabaseManager() as conn:
            c = conn.cursor()
            c.execute("INSERT INTO users (name, email, password, role, is_blocked) VALUES (?, ?, 'x', ?, 0)",
                      (f"Usuario {role}", email, role))
            uid = c.lastrowid
            conn.commit()
        self._usuarios = getattr(self, "_usuarios", []) + [uid]
        token = secrets.token_hex(16)
        active_sessions[token] = uid
        return token

    def _desarquivar(self, token=None, justificativa="Retificação de memorial solicitada"):
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        return client.post(f"/levantamentos/{self.lev_arq}/desarquivar", json={"justificativa": justificativa}, headers=headers)

    def _status_arq(self):
        return execute_query("SELECT status FROM levantamentos WHERE id = ?", params=(self.lev_arq,), fetch_one=True)["status"]

    def test_desarquivar_sem_login_401(self):
        self.assertEqual(self._desarquivar().status_code, 401)
        self.assertEqual(self._status_arq(), "ARQUIVADO")

    def test_desarquivar_usuario_comum_403(self):
        self.assertEqual(self._desarquivar(self._usuario("user")).status_code, 403)
        self.assertEqual(self._status_arq(), "ARQUIVADO")

    def test_desarquivar_justificativa_curta_422(self):
        self.assertEqual(self._desarquivar(self._usuario("admin"), "ok").status_code, 422)
        self.assertEqual(self._status_arq(), "ARQUIVADO")

    def test_desarquivar_admin_grava_usuario_real(self):
        with patch.object(WorkspaceManager, "destravar_workspace_inteiro", return_value=[]):
            res = self._desarquivar(self._usuario("admin"))
        self.assertEqual(res.status_code, 200, res.text)
        self.assertEqual(self._status_arq(), "EM_ANDAMENTO")
        log = execute_query("SELECT usuario FROM logs_auditoria_seguranca WHERE levantamento_id = ? AND rota LIKE '/desarquivar%'",
                            params=(self.lev_arq,), fetch_one=True)
        self.assertIn("Usuario admin (id ", log["usuario"])

    def test_desarquivar_levantamento_nao_arquivado_409(self):
        res = client.post(f"/levantamentos/{self.lev_ativo}/desarquivar", json={"justificativa": "Justificativa qualquer longa"},
                          headers={"Authorization": f"Bearer {self._usuario('admin')}"})
        self.assertEqual(res.status_code, 409, res.text)


class TestRotasLiberadasNaTranca(unittest.TestCase):
    def test_somente_rotas_exatas(self):
        from routes.deps import _ROTAS_LIBERADAS_NA_TRANCA as r
        for ok in ("/levantamentos/5/compartilhar", "/api/levantamentos/5/compartilhar", "/levantamentos/5/desarquivar"):
            self.assertTrue(r.fullmatch(ok), ok)
        for nao in ("/levantamentos/5/pontos/compartilhar", "/confrontantes/3/compartilhar",
                    "/levantamentos/5/desarquivar/x", "/levantamentos/5/x/desarquivar", "/levantamentos/abc/compartilhar"):
            self.assertIsNone(r.fullmatch(nao), nao)


def _gravavel(p: Path) -> bool:
    return bool(os.stat(p).st_mode & stat.S_IWRITE)


class TestTrancaArquivamentoDisco(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        base = Path(self._tmp.name)
        self.wm = WorkspaceManager(base_folder=base)
        self.lev = base / "Projetos" / "Fazenda" / "Lev_1_2026"
        (self.lev / "Brutos").mkdir(parents=True)
        (self.lev / "Documentos").mkdir(parents=True)
        self.bruto = self.lev / "Brutos" / "campo.txt"
        self.doc = self.lev / "Documentos" / "memorial.txt"
        self.prop = self.wm.get_propriedade_folder(5)
        self.prop.mkdir(parents=True)
        self.car = self.prop / "CAR_x.pdf"
        (self.prop / "Confrontantes").mkdir()
        self.conf_deste = self.prop / "Confrontantes" / "Confrontante_1_Matricula.pdf"
        self.conf_outro = self.prop / "Confrontantes" / "Confrontante_2_Matricula.pdf"  # de outro levantamento ativo
        self.arquivos = (self.bruto, self.doc, self.car, self.conf_deste, self.conf_outro)
        for f in self.arquivos:
            f.write_text("x", encoding="utf-8")
        os.chmod(self.bruto, os.stat(self.bruto).st_mode & ~stat.S_IWRITE)  # Brutos já nascem blindados
        self._p1 = patch.object(WorkspaceManager, "get_levantamento_folder", return_value=self.lev)
        self._p2 = patch.object(WorkspaceManager, "_propriedade_do_levantamento", return_value=5)
        self._p3 = patch.object(WorkspaceManager, "_arquivos_confrontantes_do_levantamento", return_value=[self.conf_deste])
        self._p1.start(); self._p2.start(); self._p3.start()

    def tearDown(self):
        self._p1.stop(); self._p2.stop(); self._p3.stop()
        for f in self.arquivos:
            os.chmod(f, stat.S_IWRITE | stat.S_IREAD)
        self._tmp.cleanup()

    def test_travar_inclui_pasta_da_propriedade(self):
        self.assertEqual(self.wm.travar_workspace_inteiro_readonly(1), [])
        self.assertFalse(_gravavel(self.doc))
        self.assertFalse(_gravavel(self.car))
        self.assertFalse(_gravavel(self.conf_deste))
        # A pasta Confrontantes é compartilhada: o PDF de outro levantamento continua gravável
        self.assertTrue(_gravavel(self.conf_outro))

    def test_destravar_mantem_brutos_blindados(self):
        self.wm.travar_workspace_inteiro_readonly(1)
        self.assertEqual(self.wm.destravar_workspace_inteiro(1), [])
        self.assertTrue(_gravavel(self.doc))
        self.assertTrue(_gravavel(self.car))
        self.assertFalse(_gravavel(self.bruto))

    def test_destravar_sem_propriedade_mantem_propriedade_travada(self):
        self.wm.travar_workspace_inteiro_readonly(1)
        self.wm.destravar_workspace_inteiro(1, incluir_propriedade=False)
        self.assertTrue(_gravavel(self.doc))
        self.assertTrue(_gravavel(self.conf_deste))
        self.assertFalse(_gravavel(self.car))


if __name__ == "__main__":
    unittest.main()
