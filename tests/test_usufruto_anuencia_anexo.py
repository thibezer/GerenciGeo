import html as html_lib
import sqlite3
import unittest

from database.connection import DatabaseManager
from services.documentacao.cartorio.usufruto_anuencia import (
    gerar_anexo_usufruto_drl_html,
    listar_envolvidos_usufruto,
    normalizar_papel,
    salvar_envolvidos_usufruto,
)
from services.documentacao.erros import ErroDocumento


class TestUsufrutoAnuenciaAnexo(unittest.TestCase):
    def setUp(self):
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            for tabela in (
                "confrontante_envolvidos_usufruto",
                "confrontante_coproprietarios",
                "segmentos",
                "confrontantes",
                "banco_pontos",
                "pontos",
                "matriculas",
                "levantamentos",
                "propriedade_clientes",
                "propriedades",
                "clientes",
                "pessoas",
                "profissionais",
            ):
                cursor.execute(f"DELETE FROM {tabela}")

            # Requerentes (Matrícula 10.189)
            cursor.execute(
                """
                INSERT INTO pessoas (
                    id, nome, cpf_cnpj, rg, genero, nacionalidade, profissao,
                    estado_civil, regime_bens, nome_conjuge, cpf_conjuge, rg_conjuge,
                    genero_conjuge, nacionalidade_conjuge, profissao_conjuge, endereco_completo
                ) VALUES (
                    1, 'Francisco Antonio Cripa', '188.864.429-04', '902.993-SSP/PR', 'M', 'brasileiro', 'agricultor',
                    'casado', 'comunhao_universal', 'Zilda Aparecida Cripa', '009.149.999-23', '8.693.644-5-SESP/PR',
                    'F', 'brasileira', 'do lar', 'Francisco Alves-PR'
                )
                """
            )
            cursor.execute("INSERT INTO clientes (id, pessoa_id) VALUES (1, 1)")
            cursor.execute(
                "INSERT INTO profissionais (id, nome, registro, codigo_credenciado, conselho) "
                "VALUES (1, 'Profissional Teste', '12345', 'XRXR', 'CFTA')"
            )
            cursor.execute(
                "INSERT INTO propriedades (id, nome_propriedade, municipio, uf) "
                "VALUES (1, 'Lotes 161-A, 162, 163, 163-P, 164 e 164-A', 'Iporã', 'PR')"
            )
            cursor.execute(
                "INSERT INTO propriedade_clientes (propriedade_id, cliente_id, percentual_participacao) VALUES (1, 1, 100.0)"
            )
            cursor.execute(
                "INSERT INTO levantamentos (id, propriedade_id, profissional_id, data_inicio) VALUES (1, 1, 1, '2026-11-01')"
            )
            cursor.execute(
                "INSERT INTO matriculas (id, propriedade_id, numero_matricula, denominacao, area_ha, cri_comarca) "
                "VALUES (10, 1, '10.189', 'Gleba Atlântida', 96.80, 'Iporã')"
            )

            # Confrontante Matrícula 6.622
            cursor.execute(
                """
                INSERT INTO confrontantes (
                    id, levantamento_id, nome, lote, matricula_imovel, endereco_completo
                ) VALUES (
                    22, 1, 'Vitor Shin Itiro Koyama', 'Lotes de terras nº 138 e 139', '6.622', 'Iporã-PR'
                )
                """
            )

            # Segmento XRXR-V-0001 -> XRXR-P-0002
            cursor.execute(
                "INSERT INTO pontos (id, levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, ordem_caminhamento, origem_homologada, ignorar_poligono) "
                "VALUES (1, 1, 10, 'XRXR-V-0001', 'V', -23.989859988144, -53.845282972940, 254.47, 1, 1, 0)"
            )
            cursor.execute(
                "INSERT INTO pontos (id, levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, ordem_caminhamento, origem_homologada, ignorar_poligono) "
                "VALUES (2, 1, 10, 'XRXR-P-0002', 'P', -23.990012400362, -53.845444276463, 257.10, 2, 1, 0)"
            )
            cursor.execute(
                "INSERT INTO pontos (id, levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, ordem_caminhamento, origem_homologada, ignorar_poligono) "
                "VALUES (3, 1, 10, 'XRXR-P-0007', 'P', -23.992348296134, -53.847392188685, 256.55, 3, 1, 0)"
            )
            cursor.execute(
                "INSERT INTO segmentos (levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, confrontante_id, tipo_limite_sigef, metodo_posicionamento_sigef) "
                "VALUES (1, 10, 1, 2, 22, 'LA1', 'PG1')"
            )
            cursor.execute(
                "INSERT INTO segmentos (levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, confrontante_id, tipo_limite_sigef, metodo_posicionamento_sigef) "
                "VALUES (1, 10, 2, 3, 22, 'LA1', 'PG1')"
            )

    def test_normalizar_papel_e_check_constraint_tabela(self):
        self.assertEqual(normalizar_papel("usufrutuária"), "USUFRUTUARIO")
        self.assertEqual(normalizar_papel("nu-proprietário"), "NU_PROPRIETARIO")
        self.assertEqual(normalizar_papel("donataria"), "DONATARIO")
        with self.assertRaises(ErroDocumento):
            normalizar_papel("PAPEL_INEXISTENTE")

        with DatabaseManager() as conn:
            with self.assertRaises(sqlite3.IntegrityError):
                conn.execute(
                    "INSERT INTO confrontante_envolvidos_usufruto (confrontante_id, papel, nome) VALUES (22, 'INVALIDO', 'Teste')"
                )

    def test_salvar_e_gerar_anexo_usufruto_completo(self):
        envolvidos_payload = [
            {
                "papel": "USUFRUTUARIO",
                "nome": "Vitor Shin Itiro Koyama",
                "cpf_cnpj": "143.403.309-06",
                "rg": "1.019.129-7",
                "rg_orgao": "SSP",
                "rg_uf": "PR",
                "genero": "M",
                "nacionalidade": "brasileiro",
                "profissao": "bancário",
                "estado_civil": "casado",
                "regime_bens": "comunhao_parcial",
                "endereco_completo": "Rua Gilio Furlaneto, Iporã-PR",
                "nome_conjuge": "Tereza Amália Volttani Koyama",
                "cpf_conjuge": "279.377.639-49",
                "rg_conjuge": "1.461.774-4",
                "rg_orgao_conjuge": "SSP",
                "rg_uf_conjuge": "PR",
                "genero_conjuge": "F",
                "nacionalidade_conjuge": "brasileira",
                "profissao_conjuge": "aposentada",
                "assina": True,
                "conjuge_assina": True,
            },
            {
                "papel": "DONATARIO",
                "nome": "Thais Volttani Koyama",
                "cpf_cnpj": "009.581.969-07",
                "rg": "8.433.694-7",
                "rg_orgao": "SSP",
                "rg_uf": "PR",
                "genero": "F",
                "nacionalidade": "brasileira",
                "profissao": "engenheira civil",
                "estado_civil": "casado",
                "regime_bens": "comunhao_parcial",
                "endereco_completo": "Rua Herval, nº 1351, Edifício Blues, Cristo Rei, Curitiba-PR",
                "nome_conjuge": "Fernando Antonio Willington Filho",
                "cpf_conjuge": "059.299.869-08",
                "rg_conjuge": "7.749.665-3",
                "rg_orgao_conjuge": "SSP",
                "rg_uf_conjuge": "PR",
                "genero_conjuge": "M",
                "nacionalidade_conjuge": "brasileiro",
                "profissao_conjuge": "engenheiro",
                "assina": True,
                "conjuge_assina": True,
            },
            {
                "papel": "DONATARIO",
                "nome": "Ligia Mayra Volttani Koyama",
                "cpf_cnpj": "047.273.279-02",
                "rg": "8.435.621-2",
                "rg_orgao": "SSP",
                "rg_uf": "PR",
                "genero": "F",
                "nacionalidade": "brasileira",
                "profissao": "serventuária da justiça",
                "estado_civil": "viuvo",
                "endereco_completo": "Avenida Gastão Vidigal, nº 2655, Maringá-PR",
                "assina": True,
            },
            {
                "papel": "DONATARIO",
                "nome": "Debora Fernanda Volttani Koyama",
                "cpf_cnpj": "046.943.799-50",
                "rg": "8.435.629-8",
                "rg_orgao": "SSP",
                "rg_uf": "PR",
                "genero": "F",
                "nacionalidade": "brasileira",
                "profissao": "funcionária pública",
                "estado_civil": "casado",
                "regime_bens": "comunhao_parcial",
                "endereco_completo": "Avenida Itororó, nº 1388, Ap. 1504, Zona 02, Maringá-PR",
                "nome_conjuge": "Fernando Aparecido Shigueto Barbosa Sassamoto",
                "cpf_conjuge": "297.809.018-92",
                "rg_conjuge": "35.293.745-2",
                "rg_orgao_conjuge": "SSP",
                "rg_uf_conjuge": "SP",
                "genero_conjuge": "M",
                "nacionalidade_conjuge": "brasileiro",
                "profissao_conjuge": "médico",
                "assina": True,
                "conjuge_assina": True,
            },
        ]

        salvos = salvar_envolvidos_usufruto(22, envolvidos_payload)
        self.assertEqual(len(salvos), 4)
        self.assertTrue(all(r["pessoa_id"] is not None for r in salvos))
        self.assertEqual(len(listar_envolvidos_usufruto(22)), 4)

        html = html_lib.unescape(gerar_anexo_usufruto_drl_html(1, 10, 22))
        self.assertIn("usufrutuários e donatários (nu-proprietários)", html)
        self.assertNotIn("representante legal dos demais", html)
        self.assertIn("Usufrutuário Anuente", html)
        self.assertIn("Usufrutuária Anuente", html)
        self.assertIn("Donatária (Nu-proprietária) Anuente", html)
        self.assertIn("Cônjuge da Donatária Anuente", html)
        self.assertIn("VITOR SHIN ITIRO KOYAMA".lower(), html.lower())
        self.assertIn("Tereza Amália Volttani Koyama", html)
        self.assertIn("Thais Volttani Koyama", html)
        self.assertIn("Ligia Mayra Volttani Koyama", html)
        self.assertIn("Debora Fernanda Volttani Koyama", html)
        self.assertIn("Vértice Final: XRXR-P-0007", html)

    def test_conjuge_dispensado_em_comunhao_parcial_incomunicavel(self):
        salvar_envolvidos_usufruto(
            22,
            [
                {
                    "papel": "DONATARIO",
                    "nome": "Thais Volttani Koyama",
                    "cpf_cnpj": "009.581.969-07",
                    "genero": "F",
                    "profissao": "engenheira civil",
                    "estado_civil": "casado",
                    "regime_bens": "comunhao_parcial",
                    "endereco_completo": "Curitiba-PR",
                    "nome_conjuge": "Fernando Antonio Willington Filho",
                    "cpf_conjuge": "059.299.869-08",
                    "genero_conjuge": "M",
                    "profissao_conjuge": "engenheiro",
                    "assina": True,
                    "conjuge_assina": False,
                }
            ],
        )
        html = html_lib.unescape(gerar_anexo_usufruto_drl_html(1, 10, 22))
        self.assertIn("Donatária (Nu-proprietária) Anuente", html)
        self.assertNotIn("Cônjuge da Donatária Anuente", html)


if __name__ == "__main__":
    unittest.main()
