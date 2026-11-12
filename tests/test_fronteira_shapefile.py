"""Faixa de fronteira: upload seguro de shapefile e escolha do ponto mais próximo (qualquer tipo)."""
import io
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

import shapefile
from fastapi import HTTPException

from services.documentacao import report_generator as rg
from services.documentacao.erros import ErroDocumento


def _criar_shp(pasta: Path, nome: str, pontos, prj: str | None = None) -> Path:
    base = pasta / nome
    with shapefile.Writer(str(base), shapeType=shapefile.POINT) as w:
        w.field("ID", "N")
        for i, (x, y) in enumerate(pontos):
            w.point(x, y)
            w.record(i)
    if prj:
        base.with_suffix(".prj").write_text(prj, encoding="utf-8")
    return base.with_suffix(".shp")


class TestMedirShapefile(unittest.TestCase):
    def test_escolhe_ponto_mais_proximo_em_graus(self):
        with tempfile.TemporaryDirectory() as d:
            shp = _criar_shp(Path(d), "a", [[-54.0, -24.0], [-54.28, -24.06]])
            dist, lat, lon = rg.medir_shapefile(shp)
            self.assertAlmostEqual(lon, -54.28)
            self.assertAlmostEqual(lat, -24.06)
            self.assertLess(dist, 2.0)

    def test_pasta_usa_menor_entre_varios_shp(self):
        with tempfile.TemporaryDirectory() as d:
            _criar_shp(Path(d), "longe", [[-52.0, -24.0]])
            _criar_shp(Path(d), "perto", [[-54.2, -24.06]])
            dist, _, lon = rg._medir_pasta_shapefile(Path(d))
            self.assertAlmostEqual(lon, -54.2)
            self.assertLess(dist, 20.0)

    def test_pasta_inexistente_ou_vazia(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertIsNone(rg._medir_pasta_shapefile(Path(d)))
            self.assertIsNone(rg._medir_pasta_shapefile(Path(d) / "nao_existe"))


class TestUploadShapefile(unittest.IsolatedAsyncioTestCase):
    async def _upload(self, base, nome, conteudo, prop_id=987001):
        from fastapi import UploadFile
        from routes.levantamento import documentos as doc
        up = UploadFile(filename=nome, file=io.BytesIO(conteudo))
        with patch.object(doc, "EXPORT_BASE_FOLDER", str(base)), \
             patch.object(rg, "EXPORT_BASE_FOLDER", str(base)), \
             patch.object(doc, "verificar_propriedade_arquivada", lambda _id: None):
            return await doc.upload_shapefile_fronteira(prop_id, None, up)

    async def test_extensao_invalida_422_sem_apagar_antigo(self):
        with tempfile.TemporaryDirectory() as d:
            base = Path(d)
            pasta = base / "Propriedades" / "Prop_987001" / "Shapefile_Fronteira"
            _criar_shp(pasta, "antigo", [[-54.2, -24.06]])
            with self.assertRaises(HTTPException) as cm:
                await self._upload(base, "x.exe", b"MZ")
            self.assertEqual(cm.exception.status_code, 422)
            self.assertTrue((pasta / "antigo.shp").exists())

    async def test_zip_corrompido_422_preserva_antigo(self):
        with tempfile.TemporaryDirectory() as d:
            base = Path(d)
            pasta = base / "Propriedades" / "Prop_987001" / "Shapefile_Fronteira"
            _criar_shp(pasta, "antigo", [[-54.2, -24.06]])
            with self.assertRaises(HTTPException) as cm:
                await self._upload(base, "x.zip", b"nao e zip")
            self.assertEqual(cm.exception.status_code, 422)
            self.assertTrue((pasta / "antigo.shp").exists())

    async def test_zip_valido_substitui_e_mede(self):
        with tempfile.TemporaryDirectory() as d, tempfile.TemporaryDirectory() as src:
            base = Path(d)
            pasta = base / "Propriedades" / "Prop_987001" / "Shapefile_Fronteira"
            _criar_shp(pasta, "antigo", [[-50.0, -24.0]])
            shp = _criar_shp(Path(src), "novo", [[-54.2, -24.06]])
            buf = io.BytesIO()
            with zipfile.ZipFile(buf, "w") as zf:
                for ext in (".shp", ".shx", ".dbf"):
                    zf.write(shp.with_suffix(ext), "novo" + ext)
            r = await self._upload(base, "novo.zip", buf.getvalue())
            self.assertTrue(r["sucesso"])
            self.assertLess(r["distancia_fronteira_km"], 20.0)
            self.assertFalse((pasta / "antigo.shp").exists())
            self.assertTrue((pasta / "novo.shp").exists())
            self.assertEqual([p.name for p in pasta.iterdir() if p.name.startswith(".")], [])


class TestFallbackBanco(unittest.TestCase):
    def test_qualquer_tipo_mais_proximo_e_corrigido(self):
        rows = [
            {"lat": -24.0, "lon": -54.0, "lat_corrigido": None, "lon_corrigido": None, "nome_vertice": "B1"},
            {"lat": -24.5, "lon": -54.5, "lat_corrigido": -24.0672, "lon_corrigido": -54.2869, "nome_vertice": "V9"},
        ]
        with tempfile.TemporaryDirectory() as d, \
             patch.object(rg, "EXPORT_BASE_FOLDER", d), \
             patch.object(rg, "execute_query", return_value=rows):
            dist, lat, lon = rg.calcular_menor_distancia_fronteira(1)
            self.assertAlmostEqual(lat, -24.0672)
            self.assertLess(dist, 0.1)

    def test_sem_nada_levanta_erro(self):
        with tempfile.TemporaryDirectory() as d, \
             patch.object(rg, "EXPORT_BASE_FOLDER", d), \
             patch.object(rg, "execute_query", return_value=[]):
            with self.assertRaises(ErroDocumento):
                rg.calcular_menor_distancia_fronteira(1)


if __name__ == "__main__":
    unittest.main()
