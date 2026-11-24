import io
import json
import shutil
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

import shapefile

from database.connection import DatabaseManager, execute_query
from services.documentacao.exportacao_service import ExportacaoService
from services.documentacao.shape_exporter import ShapefileExporter
from utils.transformer_cache import get_transformer


class TestExportacoesP0(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="gerencigeo_p0_")
        self.created_ids = {}

        with DatabaseManager() as conn:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO profissionais (nome, registro, codigo_credenciado) VALUES (?, ?, ?)",
                ("Engenheiro P0", "CREA-PR 99887", "P0CD"),
            )
            self.prof_id = cur.lastrowid

            cur.execute(
                """
                INSERT INTO pessoas (nome, cpf_cnpj, rg, estado_civil, endereco_completo)
                VALUES (?, ?, ?, ?, ?)
                """,
                ("João da Silva P0", "111.222.333-44", "12.345.678-9", "Casado(a)", "Rua Teste, 100"),
            )
            self.pessoa_cli_id = cur.lastrowid

            cur.execute(
                """
                INSERT INTO clientes (pessoa_id, profissional_id, email, senha_gov)
                VALUES (?, ?, ?, ?)
                """,
                (self.pessoa_cli_id, self.prof_id, "joao.p0@teste.com", "SENHA_SECRETA_NAO_VAZAR"),
            )
            self.cli_id = cur.lastrowid

            cur.execute(
                """
                INSERT INTO propriedades (nome_propriedade, codigo_ccir, municipio, uf)
                VALUES (?, ?, ?, ?)
                """,
                ("Fazenda P0 Exportacao", "999.888.777.666-0", "Douradina", "PR"),
            )
            self.prop_id = cur.lastrowid

            cur.execute(
                """
                INSERT INTO propriedade_clientes (propriedade_id, cliente_id, percentual_participacao)
                VALUES (?, ?, ?)
                """,
                (self.prop_id, self.cli_id, 100.0),
            )

            cur.execute(
                """
                INSERT INTO matriculas (propriedade_id, numero_matricula, ccir, itr, area_ha)
                VALUES (?, ?, ?, ?, ?)
                """,
                (self.prop_id, "12345-P0", None, "1.234.567-8", 42.5),
            )
            self.mat_id = cur.lastrowid

            cur.execute(
                """
                INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio, status, pasta_projeto)
                VALUES (?, ?, '2026-11-24', 'EM_ANDAMENTO', ?)
                """,
                (self.prop_id, self.prof_id, self.temp_dir),
            )
            self.lev_id = cur.lastrowid

            cur.execute(
                "INSERT INTO pessoas (nome, cpf_cnpj, rg, endereco_completo) VALUES (?, ?, ?, ?)",
                ("Maria Vizinha P0", "555.666.777-88", "98.765.432-1", "Estrada Rural km 5"),
            )
            self.pessoa_conf_id = cur.lastrowid

            cur.execute(
                "INSERT INTO confrontantes (pessoa_id, levantamento_id, matricula_imovel) VALUES (?, ?, ?)",
                (self.pessoa_conf_id, self.lev_id, "54321"),
            )
            self.conf_id = cur.lastrowid

            # 3 vértices não colineares formando triângulo válido em UTM 22S
            # Ponto 1 tem coordenada corrigida distinta da bruta
            pontos_seed = [
                ("M-0001", "M", -23.380000, -53.290000, 350.0, -23.381000, -53.291000, 355.5, 1),
                ("M-0002", "M", -23.381000, -53.285000, 352.0, None, None, None, 2),
                ("M-0003", "M", -23.385000, -53.288000, 351.0, None, None, None, 3),
            ]
            for nome, tipo, lat, lon, alt, lat_c, lon_c, alt_c, ordem in pontos_seed:
                cur.execute(
                    """
                    INSERT INTO pontos (
                        levantamento_id, matricula_id, nome_vertice, tipo_ponto,
                        lat, lon, alt, lat_corrigido, lon_corrigido, alt_corrigido,
                        ordem_caminhamento, status_ponto
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        self.lev_id, self.mat_id, nome, tipo,
                        lat, lon, alt, lat_c, lon_c, alt_c,
                        ordem, "CORRIGIDO" if lat_c is not None else "BRUTO",
                    ),
                )
            conn.commit()

    def tearDown(self):
        with DatabaseManager() as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM pontos WHERE levantamento_id = ?", (self.lev_id,))
            cur.execute("DELETE FROM confrontantes WHERE id = ?", (self.conf_id,))
            cur.execute("DELETE FROM levantamentos WHERE id = ?", (self.lev_id,))
            cur.execute("DELETE FROM matriculas WHERE id = ?", (self.mat_id,))
            cur.execute("DELETE FROM propriedade_clientes WHERE propriedade_id = ?", (self.prop_id,))
            cur.execute("DELETE FROM propriedades WHERE id = ?", (self.prop_id,))
            cur.execute("DELETE FROM clientes WHERE id = ?", (self.cli_id,))
            cur.execute("DELETE FROM pessoas WHERE id IN (?, ?)", (self.pessoa_cli_id, self.pessoa_conf_id))
            cur.execute("DELETE FROM profissionais WHERE id = ?", (self.prof_id,))
            conn.commit()
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_shapefile_exporter_join_pessoas_ccir_e_dbf_10_chars(self):
        zip_bytes = ShapefileExporter.exportar_matricula_zip(self.lev_id, self.mat_id)
        self.assertIsInstance(zip_bytes, bytes)
        self.assertGreater(len(zip_bytes), 0)

        with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
            nomes = set(zf.namelist())
            for arq in ("pontos.shp", "pontos.shx", "pontos.dbf", "pontos.prj",
                        "perimetro.shp", "perimetro.shx", "perimetro.dbf", "perimetro.prj"):
                self.assertIn(arq, nomes)

            self.assertIn('AUTHORITY["EPSG","31982"]', zf.read("perimetro.prj").decode("utf-8"))

            sf_poly = shapefile.Reader(
                shp=io.BytesIO(zf.read("perimetro.shp")),
                shx=io.BytesIO(zf.read("perimetro.shx")),
                dbf=io.BytesIO(zf.read("perimetro.dbf")),
            )
            field_names = [f[0] for f in sf_poly.fields[1:]]
            for fname in field_names:
                self.assertLessEqual(len(fname), 10, f"Campo DBF '{fname}' excede 10 caracteres")
            self.assertIn("PROFISSION", field_names)
            self.assertIn("RT_REGISTR", field_names)

            rec = sf_poly.record(0).as_dict()
            self.assertIn("João da Silva P0 (100%)", rec["PROPRIETAR"])
            self.assertEqual(rec["CCIR"], "999.888.777.666-0")

    def test_exportacao_service_usa_coordenadas_corrigidas(self):
        linhas, zona_utm = ExportacaoService._coletar_linhas_perimetro(self.lev_id)
        self.assertEqual(zona_utm, 22)
        self.assertEqual(len(linhas), 3)

        p1 = next(l for l in linhas if l["vertice"] == "M-0001")
        p2 = next(l for l in linhas if l["vertice"] == "M-0002")

        transformer = get_transformer("epsg:4674", "epsg:31982", always_xy=True)
        e_corr, n_corr = transformer.transform(-53.291000, -23.381000)
        e_bruto, n_bruto = transformer.transform(-53.290000, -23.380000)
        e_p2, n_p2 = transformer.transform(-53.285000, -23.381000)

        self.assertAlmostEqual(p1["e"], e_corr, places=2)
        self.assertAlmostEqual(p1["n"], n_corr, places=2)
        self.assertAlmostEqual(p1["z"], 355.5, places=2)
        self.assertGreater(abs(p1["e"] - e_bruto), 50.0)

        # Ponto sem lat_corrigido continua usando lat/lon brutos
        self.assertAlmostEqual(p2["e"], e_p2, places=2)
        self.assertAlmostEqual(p2["n"], n_p2, places=2)
        self.assertAlmostEqual(p2["z"], 352.0, places=2)

    def test_snapshot_arquivamento_inclui_dados_civis_sem_senha_gov(self):
        docs_dir = Path(self.temp_dir) / "Documentos"
        docs_dir.mkdir(parents=True, exist_ok=True)

        with patch(
            "services.documentacao.exportacao_service.WorkspaceManager.get_levantamento_folder",
            return_value=Path(self.temp_dir),
        ):
            caminho = ExportacaoService.gerar_snapshot_arquivamento(self.lev_id)

        self.assertTrue(caminho)
        with open(caminho, "r", encoding="utf-8") as f:
            snap = json.load(f)

        self.assertEqual(len(snap["clientes"]), 1)
        cli = snap["clientes"][0]
        self.assertEqual(cli["nome_completo"], "João da Silva P0")
        self.assertEqual(cli["cpf_cnpj"], "111.222.333-44")
        self.assertEqual(cli["rg_ie"], "12.345.678-9")
        self.assertNotIn("senha_gov", cli)

        self.assertEqual(len(snap["confrontantes"]), 1)
        conf = snap["confrontantes"][0]
        self.assertEqual(conf["nome_resolvido"], "Maria Vizinha P0")
        self.assertEqual(conf["cpf_cnpj_resolvido"], "555.666.777-88")


if __name__ == "__main__":
    unittest.main()
