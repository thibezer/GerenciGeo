"""Exceções de domínio dos geradores de documentos (peças de cartório, laudos, anuências).

As rotas HTTP mapeiam:
- `NaoEncontrado`   -> 404 (levantamento/matrícula/confrontante inexistente)
- `ErroDocumento`   -> 422 (dado ausente/inválido: a peça não pode ser gerada com o que foi informado)
- qualquer outra    -> 500 genérico (com log), sem vazar detalhes internos.

Ambas herdam de `ValueError` para manter compatibilidade com quem já capturava `ValueError`.
"""


class ErroDocumento(ValueError):
    """Dado ausente, ambíguo ou inválido: o usuário precisa corrigir algo para a peça ser gerada (HTTP 422)."""


class NaoEncontrado(ErroDocumento):
    """Registro referenciado não existe (ou não pertence ao contexto informado) (HTTP 404)."""
