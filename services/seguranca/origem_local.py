"""
Proteção da API local contra uso por sites de terceiros abertos no mesmo navegador.

A API escuta só em 127.0.0.1, mas qualquer página da web consegue fazer o navegador do usuário chamá-la
(CORS aberto) ou, via DNS rebinding, até ler as respostas como se fossem da mesma origem. Dois controles:

* Origin: se o navegador informa uma origem, ela precisa ser uma das origens do próprio app;
* Host: só nomes de loopback — barra o DNS rebinding, que chega com o Host do site atacante.

Origens extras (ex.: outro proxy de desenvolvimento) entram por GERENCIGEO_ORIGENS_EXTRAS, separadas por vírgula.
"""
import os
from urllib.parse import urlsplit

_HOSTS_LOOPBACK = {"127.0.0.1", "localhost", "::1", "[::1]", "testserver"}
_PORTAS_APP = (8000, 5173, 3000)


def origens_permitidas() -> list[str]:
    origens = [f"http://{host}:{porta}" for host in ("127.0.0.1", "localhost") for porta in _PORTAS_APP]
    extras = os.environ.get("GERENCIGEO_ORIGENS_EXTRAS", "")
    origens.extend(o.strip().rstrip("/") for o in extras.split(",") if o.strip())
    return origens


def origem_permitida(origin: str | None) -> bool:
    """Requisições sem Origin (navegação, curl, app desktop, testes) não são cross-site: passam."""
    if not origin:
        return True
    return origin.rstrip("/") in origens_permitidas()


def host_permitido(host_header: str | None) -> bool:
    if not host_header:
        return True
    nome = urlsplit(f"//{host_header}").hostname or ""
    return nome in _HOSTS_LOOPBACK
