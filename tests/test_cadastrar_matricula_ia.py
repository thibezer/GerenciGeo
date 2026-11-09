"""
tests/test_cadastrar_matricula_ia.py — Testes unitários para o script de automação de matrículas e propriedades via IA.
"""

import os
import unittest
import tempfile
import json
from scripts.cadastrar_matricula_ia import (
    converter_area_para_hectares,
    processar_matricula_ia
)
from database.connection import execute_query


class TestCadastrarMatriculaIA(unittest.TestCase):

    def test_converter_area_para_hectares(self):
        # 1. Alqueire paulista (PR/SP) = 2,42 ha
        self.assertEqual(converter_area_para_hectares({"area_alqueires": 40.0, "tipo_alqueire": "paulista"}), 96.8)
        self.assertEqual(converter_area_para_hectares({"area_alqueires": 10.0}, uf="PR"), 24.2)
        
        # 2. Alqueire mineiro/goiano = 4,84 ha
        self.assertEqual(converter_area_para_hectares({"area_alqueires": 10.0, "tipo_alqueire": "mineiro"}), 48.4)
        
        # 3. Metros quadrados
        self.assertEqual(converter_area_para_hectares({"area_m2": 968000.0}), 96.8)
        
        # 4. Hectares direto
        self.assertEqual(converter_area_para_hectares({"area_ha": 150.55}), 150.55)

    def test_processar_matricula_nova_e_atualizacao(self):
        num_teste = "998877"
        
        # Limpa dados residuais se existirem
        m_antiga = execute_query("SELECT id, propriedade_id FROM matriculas WHERE numero_matricula = ?", params=(num_teste,), fetch_one=True)
        if m_antiga:
            execute_query("DELETE FROM matriculas WHERE id = ?", params=(m_antiga["id"],), commit=True)
            execute_query("DELETE FROM propriedades WHERE id = ?", params=(m_antiga["propriedade_id"],), commit=True)

        payload = {
            "numero_matricula": num_teste,
            "nome_propriedade": "Fazenda Teste Matrícula IA",
            "municipio": "Iporã",
            "uf": "PR",
            "area_alqueires": 20.0,
            "codigo_ccir": "718.092.999.000-1",
            "codigo_itr": "1.234.567-8",
            "livro_registro": "2",
            "folha_registro": "1",
            "cri_comarca": "Iporã",
            "georreferenciamento": "Inicia no marco M1... segue até M2...",
            "proprietarios": [
                {
                    "nome": "Proprietário Teste",
                    "cpf": "52998224725",
                    "percentual": 100.0
                }
            ]
        }

        # 1. Criação
        res = processar_matricula_ia(payload)
        self.assertTrue(res["sucesso"], f"Falha no processamento: {res}")
        self.assertIn(res["acao_propriedade"], ["CRIADA", "EXISTENTE"])
        self.assertEqual(res["acao_matricula"], "CRIADA")
        self.assertEqual(res["area_registrada_ha"], 48.4) # 20 alqueires paulistas = 48.4 ha

        prop_id = res["propriedade_id"]
        mat_id = res["matricula_id"]

        # 2. Atualização enriquecida com anexo de PDF
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(b"%PDF-1.4 Fake PDF Content")
            tmp_path = tmp.name

        try:
            payload_upd = {
                "numero_matricula": num_teste,
                "propriedade_id": prop_id,
                "denominacao": "Lotes 1 e 2 - Gleba Teste Atualizada",
                "codigo_car": "PR-4110607-CAR-TESTE-123"
            }
            res_upd = processar_matricula_ia(payload_upd, caminho_pdf=tmp_path)
            self.assertTrue(res_upd["sucesso"])
            self.assertEqual(res_upd["acao_matricula"], "ATUALIZADA")
            self.assertIsNotNone(res_upd["arquivo_pdf_salvo"])
            self.assertTrue(os.path.exists(res_upd["arquivo_pdf_salvo"]))
            
            # Limpeza do arquivo salvo
            if os.path.exists(res_upd["arquivo_pdf_salvo"]):
                os.remove(res_upd["arquivo_pdf_salvo"])
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    def test_cli_execution_matricula(self):
        import subprocess
        payload = json.dumps({
            "numero_matricula": "554433",
            "nome_propriedade": "Sítio Teste CLI",
            "municipio": "Cascavel",
            "uf": "PR",
            "area_ha": 35.5
        })
        cmd = [
            "python",
            "scripts/cadastrar_matricula_ia.py",
            "--json",
            payload
        ]
        p = subprocess.run(cmd, capture_output=True, text=True, cwd=os.path.dirname(os.path.dirname(__file__)))
        self.assertEqual(p.returncode, 0, f"Erro CLI: {p.stderr}")
        data = json.loads(p.stdout)
        self.assertTrue(data["sucesso"])
        self.assertEqual(data["numero_matricula"], "554433")
        self.assertEqual(data["area_registrada_ha"], 35.5)


if __name__ == "__main__":
    unittest.main()
