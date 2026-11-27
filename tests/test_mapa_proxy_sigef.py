import json
import re
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
from urllib.parse import quote

import requests
from fastapi.testclient import TestClient

from api import app
from routes import processamento

client = TestClient(app)

URL_OK = (
    "https://geoportal.incra.gov.br/geoserver/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo"
    "&LAYERS=geonode:sigef_geo&QUERY_LAYERS=geonode:sigef_geo&INFO_FORMAT=application/json&X=128&Y=128"
)

GEOJSON = {
    "type": "FeatureCollection",
    "features": [{
        "id": "sigef_geo.1648120",
        "properties": {"parcela_codigo": "e25c29f7-aafa-48c9-8ce4-8194cf02be85", "nome_area": "Fazenda Geoportal"},
    }],
}


def _resposta(corpo="", status=200, headers=None, redirect=False):
    texto = corpo if isinstance(corpo, str) else json.dumps(corpo)
    r = MagicMock()
    r.status_code = status
    r.text = texto
    r.content = texto.encode("utf-8")
    r.headers = headers or {"Content-Type": "application/json"}
    r.is_redirect = redirect
    r.json = lambda: json.loads(texto)
    return r


class TestProxySigef(unittest.TestCase):
    def _get(self, url):
        return client.get(f"/proxy/sigef?url={quote(url, safe='')}")

    def test_endpoint_nao_bloqueia_o_event_loop(self):
        import asyncio
        self.assertFalse(asyncio.iscoroutinefunction(processamento.proxy_sigef))

    def test_host_fora_da_allowlist_e_recusado_sem_chamar_a_rede(self):
        with patch.object(processamento.requests, "get") as mock_get:
            for url in (
                "https://example.com/x",
                "https://127.0.0.1:8000/levantamentos",
                "https://geoportal.incra.gov.br.evil.com/x",
                "https://user:senha@geoportal.incra.gov.br/x",
                # o i3Geo foi desativado e o portal do SIGEF não é mais consultado por este proxy
                "https://acervofundiario.incra.gov.br/i3geo/ogc.php",
                "https://sigef.incra.gov.br/geo/exportar/vertice/csv/abc",
            ):
                resp = self._get(url)
                self.assertIn(resp.status_code, (400, 403), url)
            mock_get.assert_not_called()

    def test_esquema_http_e_porta_estranha_sao_recusados(self):
        with patch.object(processamento.requests, "get") as mock_get:
            self.assertEqual(self._get("http://geoportal.incra.gov.br/x").status_code, 400)
            self.assertEqual(self._get("file:///etc/passwd").status_code, 400)
            self.assertEqual(self._get("https://geoportal.incra.gov.br:8443/x").status_code, 400)
            mock_get.assert_not_called()

    def test_timeout_vira_504(self):
        with patch.object(processamento.requests, "get", side_effect=requests.Timeout("lento")):
            self.assertEqual(self._get(URL_OK).status_code, 504)

    def test_falha_de_conexao_vira_502(self):
        with patch.object(processamento.requests, "get", side_effect=requests.ConnectionError("fora")):
            self.assertEqual(self._get(URL_OK).status_code, 502)

    def test_resposta_http_de_erro_do_incra_vira_502(self):
        with patch.object(processamento.requests, "get", return_value=_resposta("erro", status=500)):
            self.assertEqual(self._get(URL_OK).status_code, 502)

    def test_resposta_grande_demais_vira_502(self):
        grande = _resposta("x")
        grande.content = b"x" * (processamento.SIGEF_PROXY_MAX_BYTES + 1)
        with patch.object(processamento.requests, "get", return_value=grande):
            self.assertEqual(self._get(URL_OK).status_code, 502)

    def test_timeout_usado_e_menor_que_o_do_front(self):
        with patch.object(processamento.requests, "get", return_value=_resposta(GEOJSON)) as mock_get:
            self._get(URL_OK)
        kwargs = mock_get.call_args.kwargs
        self.assertLess(sum(kwargs["timeout"]), 12)
        self.assertFalse(kwargs["allow_redirects"])

    def test_mantem_application_json_e_normaliza_id_para_parcela_codigo(self):
        with patch.object(processamento.requests, "get", return_value=_resposta(GEOJSON)) as mock_get:
            resp = self._get(URL_OK)
        self.assertEqual(resp.status_code, 200)
        self.assertIn("INFO_FORMAT=application/json", mock_get.call_args.args[0])
        dados = resp.json()
        self.assertEqual(dados["features"][0]["properties"]["nome_area"], "Fazenda Geoportal")
        # O id interno do GeoServer ('sigef_geo.N') vira o UUID oficial do SIGEF
        self.assertEqual(dados["features"][0]["id"], "e25c29f7-aafa-48c9-8ce4-8194cf02be85")

    def test_acentos_utf8_sao_preservados(self):
        corpo = {"features": [{"properties": {"nome_area": "Fazenda São João – Matrícula Área"}}]}
        with patch.object(processamento.requests, "get", return_value=_resposta(corpo)):
            resp = self._get(URL_OK)
        self.assertEqual(resp.json()["features"][0]["properties"]["nome_area"], "Fazenda São João – Matrícula Área")

    def test_resposta_que_nao_e_json_devolve_erro_e_nao_features_vazias(self):
        with patch.object(processamento.requests, "get", return_value=_resposta("<html>erro</html>")):
            dados = self._get(URL_OK).json()
        self.assertIn("error", dados)
        self.assertNotIn("features", dados)

    def test_redirecionamento_para_host_nao_permitido_e_recusado(self):
        redir = _resposta("", status=302, headers={"Location": "https://interno.local/segredo"}, redirect=True)
        with patch.object(processamento.requests, "get", return_value=redir) as mock_get:
            resp = self._get(URL_OK)
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(mock_get.call_count, 1)

    def test_redirecionamento_para_host_permitido_e_seguido(self):
        redir = _resposta("", status=302, headers={"Location": "/geoserver/outro"}, redirect=True)
        with patch.object(processamento.requests, "get", side_effect=[redir, _resposta(GEOJSON)]) as mock_get:
            resp = self._get(URL_OK)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(mock_get.call_count, 2)
        self.assertTrue(mock_get.call_args.args[0].startswith("https://geoportal.incra.gov.br/geoserver/outro"))

    def test_redirecionamentos_demais_viram_502(self):
        redir = _resposta("", status=302, headers={"Location": "/geoserver/de-novo"}, redirect=True)
        with patch.object(processamento.requests, "get", return_value=redir):
            self.assertEqual(self._get(URL_OK).status_code, 502)


class TestProxySigefPhpEspelho(unittest.TestCase):
    """O proxy PHP (Hostinger) não roda aqui: garante por leitura do fonte que ele segue as mesmas regras do Python."""

    @classmethod
    def setUpClass(cls):
        fonte = (Path(__file__).resolve().parent.parent / "frontend" / "public" / "api.php").read_text(encoding="utf-8")
        ini = fonte.index("// 5. Proxy SIGEF")
        fim = fonte.index("// 6. Leitura e Gravação de Levantamento Compartilhado")
        cls.bloco = fonte[ini:fim]

    def test_verifica_certificado_tls(self):
        self.assertIn("CURLOPT_SSL_VERIFYPEER, true", self.bloco)
        self.assertNotRegex(self.bloco, r"CURLOPT_SSL_VERIFYPEER,\s*false")

    def test_allowlist_so_geoportal(self):
        hosts = re.search(r"SIGEF_PROXY_HOSTS\s*=\s*\[(.*?)\]", self.bloco, re.S).group(1)
        self.assertEqual(re.findall(r"'([^']+)'", hosts), ["geoportal.incra.gov.br"])
        self.assertNotIn("acervofundiario", self.bloco)

    def test_nao_converte_encoding_as_cegas(self):
        self.assertNotIn("ISO-8859-1, UTF-8", self.bloco)

    def test_segue_redirecionamento_revalidando_destino_e_limita_tamanho(self):
        self.assertIn("SIGEF_PROXY_MAX_REDIRECTS", self.bloco)
        self.assertIn("sigefProxyValidarUrl(sigefProxyResolverLocation", self.bloco)
        self.assertIn("SIGEF_PROXY_MAX_BYTES", self.bloco)
        self.assertIn("CURLOPT_WRITEFUNCTION", self.bloco)


if __name__ == "__main__":
    unittest.main()
