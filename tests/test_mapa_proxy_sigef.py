import unittest
from unittest.mock import MagicMock, patch
from urllib.parse import quote

import requests
from fastapi.testclient import TestClient

from api import app
from routes import processamento

client = TestClient(app)

URL_OK = (
    "https://acervofundiario.incra.gov.br/i3geo/ogc.php?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo"
    "&INFO_FORMAT=text/plain&X=10&Y=10"
)

TEXTO_MAPSERVER = (
    "GetFeatureInfo results:\n\n"
    "Layer 'certificada_sigef_particular_pr'\n"
    "  Feature 0:\n"
    "    parcela_codigo = 'abc-123'\n"
    "    nome_area = 'Fazenda Teste'\n"
)


def _resposta(texto="", status=200, headers=None, redirect=False):
    r = MagicMock()
    r.status_code = status
    r.text = texto
    r.content = texto.encode("latin-1", errors="replace")
    r.headers = headers or {}
    r.is_redirect = redirect
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
                "https://acervofundiario.incra.gov.br.evil.com/x",
                "https://user:senha@acervofundiario.incra.gov.br/x",
            ):
                resp = self._get(url)
                self.assertIn(resp.status_code, (400, 403), url)
            mock_get.assert_not_called()

    def test_esquema_http_e_porta_estranha_sao_recusados(self):
        with patch.object(processamento.requests, "get") as mock_get:
            self.assertEqual(self._get("http://acervofundiario.incra.gov.br/x").status_code, 400)
            self.assertEqual(self._get("file:///etc/passwd").status_code, 400)
            self.assertEqual(self._get("https://acervofundiario.incra.gov.br:8443/x").status_code, 400)
            mock_get.assert_not_called()

    def test_timeout_vira_504(self):
        with patch.object(processamento.requests, "get", side_effect=requests.Timeout("lento")):
            resp = self._get(URL_OK)
        self.assertEqual(resp.status_code, 504)

    def test_falha_de_conexao_vira_502(self):
        with patch.object(processamento.requests, "get", side_effect=requests.ConnectionError("fora")):
            resp = self._get(URL_OK)
        self.assertEqual(resp.status_code, 502)

    def test_resposta_http_de_erro_do_incra_vira_502(self):
        with patch.object(processamento.requests, "get", return_value=_resposta("erro", status=500)):
            resp = self._get(URL_OK)
        self.assertEqual(resp.status_code, 502)

    def test_timeout_usado_e_menor_que_o_do_front(self):
        with patch.object(processamento.requests, "get", return_value=_resposta(TEXTO_MAPSERVER)) as mock_get:
            self._get(URL_OK)
        kwargs = mock_get.call_args.kwargs
        self.assertLess(sum(kwargs["timeout"]), 12)
        self.assertFalse(kwargs["allow_redirects"])

    def test_resposta_text_plain_e_convertida_em_features(self):
        with patch.object(processamento.requests, "get", return_value=_resposta(TEXTO_MAPSERVER)):
            resp = self._get(URL_OK)
        self.assertEqual(resp.status_code, 200)
        features = resp.json()["features"]
        self.assertEqual(len(features), 1)
        self.assertEqual(features[0]["id"], "abc-123")
        self.assertEqual(features[0]["properties"]["nome_area"], "Fazenda Teste")

    def test_info_format_json_e_forcado_para_text_plain(self):
        url = URL_OK.replace("INFO_FORMAT=text/plain", "INFO_FORMAT=application/json")
        with patch.object(processamento.requests, "get", return_value=_resposta(TEXTO_MAPSERVER)) as mock_get:
            self._get(url)
        self.assertIn("INFO_FORMAT=text/plain", mock_get.call_args.args[0])

    def test_redirecionamento_para_host_nao_permitido_e_recusado(self):
        redir = _resposta("", status=302, headers={"Location": "https://interno.local/segredo"}, redirect=True)
        with patch.object(processamento.requests, "get", return_value=redir) as mock_get:
            resp = self._get(URL_OK)
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(mock_get.call_count, 1)

    def test_redirecionamento_para_host_permitido_e_seguido(self):
        redir = _resposta("", status=302, headers={"Location": "/i3geo/outro.php"}, redirect=True)
        with patch.object(processamento.requests, "get", side_effect=[redir, _resposta(TEXTO_MAPSERVER)]) as mock_get:
            resp = self._get(URL_OK)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(mock_get.call_count, 2)
        self.assertTrue(mock_get.call_args.args[0].startswith("https://acervofundiario.incra.gov.br/i3geo/outro.php"))


if __name__ == "__main__":
    unittest.main()
