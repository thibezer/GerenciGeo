import logging

logger = logging.getLogger(__name__)

class CartorioReportGenerator:
    @staticmethod
    def gerar_requerimento_cartorio_html(lev_id: int, matricula_id: int, numero_trt: str = None, data_trt: str = "") -> str:
        from services.documentacao.cartorio.laudos_imovel import gerar_requerimento_cartorio_html
        return gerar_requerimento_cartorio_html(lev_id, matricula_id, numero_trt, data_trt)

    @staticmethod
    def gerar_declaracao_responsabilidade_html(lev_id: int, matricula_id: int) -> str:
        from services.documentacao.cartorio.laudos_imovel import gerar_declaracao_responsabilidade_html
        return gerar_declaracao_responsabilidade_html(lev_id, matricula_id)

    @staticmethod
    def gerar_laudo_tecnico_html(lev_id: int, matricula_id: int, numero_trt: str = None, data_trt: str = "", equipamento: str = "") -> str:
        from services.documentacao.cartorio.laudos_imovel import gerar_laudo_tecnico_html
        return gerar_laudo_tecnico_html(lev_id, matricula_id, numero_trt, data_trt, equipamento)

    @staticmethod
    def gerar_anexo_grafico_html(lev_id: int, matricula_id: int, confrontante_id: int, c_nome: str, c_matricula: str) -> tuple[str, dict]:
        from services.documentacao.cartorio.anuencias import gerar_anexo_grafico_html
        return gerar_anexo_grafico_html(lev_id, matricula_id, confrontante_id, c_nome, c_matricula)

    @staticmethod
    def gerar_js_inicializacao_mapas(lista_mapas_data: list[dict]) -> str:
        from services.documentacao.cartorio.laudos_imovel import gerar_js_inicializacao_mapas
        return gerar_js_inicializacao_mapas(lista_mapas_data)

    @staticmethod
    def gerar_declaracao_anuencia_html(lev_id: int, matricula_id: int, confrontante_id: int, apenas_corpo: bool = False) -> str:
        from services.documentacao.cartorio.anuencias import gerar_declaracao_anuencia_html
        return gerar_declaracao_anuencia_html(lev_id, matricula_id, confrontante_id, apenas_corpo)

    @staticmethod
    def gerar_declaracao_anuencia_lote_html(lev_id: int, matricula_id: int, confrontantes_ids: str = None) -> str:
        from services.documentacao.cartorio.anuencias import gerar_declaracao_anuencia_lote_html
        return gerar_declaracao_anuencia_lote_html(lev_id, matricula_id, confrontantes_ids)

    @staticmethod
    def gerar_termo_responsabilidade_sigef_html(lev_id: int, matricula_id: int, numero_trt: str = None, data_trt: str = "") -> str:
        from services.documentacao.cartorio.laudos_imovel import gerar_termo_responsabilidade_sigef_html
        return gerar_termo_responsabilidade_sigef_html(lev_id, matricula_id, numero_trt, data_trt)

    @staticmethod
    def gerar_manual_proprietario_html(lev_id: int, matricula_id: int) -> str:
        from services.documentacao.cartorio.laudos_imovel import gerar_manual_proprietario_html
        return gerar_manual_proprietario_html(lev_id, matricula_id)
