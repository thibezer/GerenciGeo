"""
routes/levantamento/pontos.py — Gestão de Pontos de Campo, Matrículas e Ordenação
"""
import os
import re
import tempfile
import logging
from typing import List, Optional, Literal
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from utils.transformer_cache import get_transformer

from database.connection import DatabaseManager, execute_query
from services.gestores.workspace_manager import WorkspaceManager
from services.documentacao.exportacao_service import ExportacaoService
from services.parsers.txt_parser import TxtGeodesicParser
from services.gestores.levantamento_manager import (
    salvar_ordem_caminhamento,
    atualizar_ponto_geodesico,
    analisar_duplicatas_e_sobreposicoes,
    vincular_ponto_matricula,
)
from routes.deps import verificar_levantamento_arquivado
from services.gestores.vertices_virtuais_manager import (
    VerticeVirtualErro,
    inserir_lote_vertices_virtuais,
    inserir_vertice_virtual,
    nome_virtual_livre,
    nomes_existentes_para_offset,
    obter_ponto_apoio_db,
    obter_pontos_apoio_db_lote,
    promover_vertices_virtuais,
    validar_escopo_pontos_apoio,
)
from services.gestores.pontos_manager import (
    PontoErro,
    criar_ponto,
    excluir_ponto,
    listar_pontos,
    sanitizar_ordens_duplicadas,
)
from services.gestores.matricula_manager import (
    MatriculaErro,
    atualizar_matricula,
    criar_matricula,
    definir_caminho_pdf,
    excluir_matricula,
    listar_historico,
    listar_levantamentos_ativos,
    listar_matriculas_do_levantamento,
    obter_caminho_pdf,
    obter_propriedade_e_numero,
    vincular_desenho,
)

router = APIRouter(tags=["Pontos de Campo & Matrículas do Levantamento"])

# Fusos UTM que cobrem o território brasileiro (SIRGAS 2000 / UTM 18S a 25S)
FUSO_UTM_MIN, FUSO_UTM_MAX = 18, 25

# ── Modelos ────────────────────────────────────────────────────────────────────

class PontoCreate(BaseModel):
    matricula_id: int
    nome_vertice: str
    tipo_ponto: Literal['M', 'P', 'V', 'B']
    lat: float
    lon: float
    alt: float
    sigma_lat: float = 0.0
    sigma_lon: float = 0.0
    sigma_alt: float = 0.0
    ordem_caminhamento: Optional[int] = None
    status_ponto: str = "BRUTO"
    ponto_base_id: Optional[int] = None

class MatriculaCreate(BaseModel):
    numero_matricula: str
    ccir: Optional[str] = None
    codigo_ccir: Optional[str] = None
    itr: Optional[str] = None
    codigo_itr: Optional[str] = None
    area_ha: Optional[float] = None
    area_registrada_ha: Optional[float] = None
    area_sigef_ha: Optional[float] = None
    valor_itr: Optional[float] = None
    denominacao: Optional[str] = None
    denominacao_gleba: Optional[str] = None
    georreferenciamento: Optional[str] = None
    matricula_origem_desenho_id: Optional[int] = None

class PayloadAssociarBase(BaseModel):
    ponto_id_selecionado: int
    base_ppp_id: int

class PayloadOverrideManual(BaseModel):
    arquivo_origem: str
    dados_brutos: dict
    dados_corrigidos: dict

class ItemOrdemPonto(BaseModel):
    id: int
    ordem: int

class PayloadSalvarOrdem(BaseModel):
    pontos_ordem: List[ItemOrdemPonto]

# ── Funções Auxiliares ──────────────────────────────────────────────────────────

# ── Rotas de Matrículas do Levantamento ────────────────────────────────────────
# A persistência e as regras ficam em services/gestores/matricula_manager.py; aqui só HTTP.

def _regerar_documentos_ativos(propriedade_id: int) -> None:
    for lev_id in listar_levantamentos_ativos(propriedade_id):
        ExportacaoService.gerar_documento_cliente_workspace(lev_id)


def _http_erro(e: Exception) -> HTTPException:
    if isinstance(e, MatriculaErro):
        return HTTPException(status_code=e.status, detail=e.mensagem)
    return HTTPException(status_code=500, detail=str(e))


@router.get("/levantamentos/{id}/matriculas")
def get_matriculas_do_levantamento(id: int):
    try:
        return listar_matriculas_do_levantamento(id)
    except Exception as e:
        raise _http_erro(e)

@router.post("/levantamentos/{id}/matriculas")
def create_matricula(id: int, m: MatriculaCreate):
    verificar_levantamento_arquivado(id)
    try:
        propriedade_id = criar_matricula(id, m.model_dump(exclude_unset=True))
        _regerar_documentos_ativos(propriedade_id)
        return {"message": "Matrícula adicionada com sucesso"}
    except Exception as e:
        raise _http_erro(e)

@router.put("/matriculas/{mid}")
def update_matricula(mid: int, m: MatriculaCreate):
    try:
        propriedade_id = atualizar_matricula(mid, m.model_dump(exclude_unset=True))
        _regerar_documentos_ativos(propriedade_id)
        return {"message": "Matrícula atualizada e sincronizada com sucesso"}
    except Exception as e:
        raise _http_erro(e)

@router.post("/matriculas/{mid}/vincular-desenho")
def vincular_desenho_matricula(mid: int, payload: dict):
    try:
        _, origem_id = vincular_desenho(mid, payload.get("matricula_origem_desenho_id"))
        return {"message": "Vínculo de desenho territorial atualizado com sucesso", "matricula_id": mid, "matricula_origem_desenho_id": origem_id}
    except Exception as e:
        raise _http_erro(e)

@router.delete("/matriculas/{mid}")
def delete_matricula(mid: int):
    try:
        propriedade_id = excluir_matricula(mid)
        if propriedade_id is not None:
            _regerar_documentos_ativos(propriedade_id)
        return {"message": "Matrícula removida"}
    except Exception as e:
        raise _http_erro(e)

@router.post("/matriculas/{mid}/upload-pdf")
async def upload_matricula_pdf(mid: int, file: UploadFile = File(...)):
    try:
        row = obter_propriedade_e_numero(mid)
        if not row:
            raise HTTPException(status_code=404, detail="Matrícula não encontrada")

        prop_id = row["propriedade_id"]
        from config import EXPORT_BASE_FOLDER
        prop_folder = os.path.join(EXPORT_BASE_FOLDER, "Propriedades", f"Prop_{prop_id}")
        os.makedirs(prop_folder, exist_ok=True)

        ext = os.path.splitext(file.filename)[1]
        if not ext:
            ext = ".pdf"

        filename = f"Matricula_{mid}_Certidao{ext}"
        filepath = os.path.join(prop_folder, filename)

        with open(filepath, "wb") as buffer:
            content = await file.read()
            buffer.write(content)

        definir_caminho_pdf(mid, filepath)
        return {"message": "PDF da matrícula anexado com sucesso", "caminho": filepath}
    except Exception as e:
        raise _http_erro(e) if not isinstance(e, HTTPException) else e

@router.get("/matriculas/{mid}/download-pdf")
def download_matricula_pdf(mid: int, download: bool = False):
    try:
        path = obter_caminho_pdf(mid)
        if not path:
            raise HTTPException(status_code=404, detail="PDF da matrícula não encontrado")
        if not os.path.exists(path):
            raise HTTPException(status_code=404, detail="Arquivo físico não encontrado no servidor")

        disposition = "attachment" if download else "inline"
        return FileResponse(path, filename=os.path.basename(path), content_disposition_type=disposition)
    except Exception as e:
        raise _http_erro(e) if not isinstance(e, HTTPException) else e

@router.delete("/matriculas/{mid}/pdf")
def delete_matricula_pdf(mid: int):
    try:
        path = obter_caminho_pdf(mid)
        if path and os.path.exists(path):
            os.remove(path)
        definir_caminho_pdf(mid, None)
        return {"message": "PDF da matrícula excluído com sucesso"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/matriculas/{mid}/historico")
def get_matricula_historico(mid: int):
    try:
        return listar_historico(mid)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/levantamentos/{id}/pontos")
def get_pontos(id: int, camada: Optional[str] = None):
    try:
        return listar_pontos(id, camada)
    except PontoErro as e:
        raise HTTPException(status_code=e.status, detail=e.mensagem)
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao buscar pontos: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro interno de banco de dados: {str(e)}")

@router.post("/levantamentos/{id}/pontos")
def create_ponto(id: int, p: PontoCreate):
    verificar_levantamento_arquivado(id)
    try:
        criar_ponto(id, p.model_dump())
        return {"message": "Ponto cadastrado com sucesso"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/pontos/{pid}")
def delete_ponto(pid: int):
    try:
        excluir_ponto(pid)
        return {"message": "Ponto removido com sucesso"}
    except PontoErro as e:
        raise HTTPException(status_code=e.status, detail=e.mensagem)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Importação de TXT/RTK ──────────────────────────────────────────────────────

@router.post("/levantamentos/{id}/importar-txt")
async def importar_caderneta_txt(
    id: int, 
    matricula_id: int = Form(None), 
    base_escolhida_id: int = Form(None), 
    inverter_ne: bool = Form(False),
    fuso_utm: Optional[int] = Form(None),
    file: Optional[UploadFile] = File(None),
    arquivos: Optional[List[UploadFile]] = File(None)
):
    """
    Importa uma caderneta (campo `file`) ou várias de uma vez (campo `arquivos`).
    Vários arquivos formam UM caminhamento contínuo (uma única divisa de fechamento) e são gravados
    numa única transação: se um deles falhar, nenhum ponto é importado.
    """
    verificar_levantamento_arquivado(id)
    if fuso_utm is not None and not (FUSO_UTM_MIN <= fuso_utm <= FUSO_UTM_MAX):
        raise HTTPException(status_code=400, detail=f"Fuso UTM inválido: {fuso_utm}. Use um fuso entre {FUSO_UTM_MIN} e {FUSO_UTM_MAX}.")
    uploads = ([file] if file else []) + (arquivos or [])
    if not uploads:
        raise HTTPException(status_code=400, detail="Nenhum arquivo enviado para importação.")
    try:
        wm = WorkspaceManager()
        folder = wm.get_levantamento_folder(id)
        pasta_processados = folder / "Processados"
        pasta_processados.mkdir(parents=True, exist_ok=True)

        parser = TxtGeodesicParser(id, matricula_id, base_escolhida_id, inverter_ne=inverter_ne, fuso_utm=fuso_utm)
        lotes = []
        layouts = []
        for up in uploads:
            caminho_salvo = pasta_processados / up.filename
            with open(caminho_salvo, "wb") as buffer:
                buffer.write(await up.read())

            pontos_arquivo = parser.processar_arquivo(str(caminho_salvo))
            if not pontos_arquivo:
                raise HTTPException(status_code=400, detail=f"Nenhum vértice válido encontrado ou processado no arquivo '{up.filename}'.")
            lotes.append(pontos_arquivo)
            rotulo = "RTK" if parser.layout_detectado == "rtk" else "Topcon Estático"
            if rotulo not in layouts:
                layouts.append(rotulo)

        pontos_processados = TxtGeodesicParser.unir_lotes(lotes)
        ids_pontos, total_segmentos = parser.persistir_com_topologia(pontos_processados)
        ExportacaoService.gerar_documento_cliente_workspace(id)

        layout = " + ".join(layouts)
        nomes_arquivos = [up.filename for up in uploads]
        
        from services.processamento.historico_campo import HistoricoCampoLogger
        pontos_nomes = [pt["nome_vertice"] for pt in pontos_processados]
        desc = f"Importação de caderneta no layout '{layout}' do(s) arquivo(s) '{', '.join(nomes_arquivos)}' com {len(ids_pontos)} ponto(s)."
        if base_escolhida_id:
            row_base_nome = execute_query("SELECT nome_vertice FROM pontos WHERE id = ?", params=(base_escolhida_id,), fetch_one=True)
            if row_base_nome:
                desc += f" Vinculado à Base de Campo: {row_base_nome['nome_vertice']}."
                
        HistoricoCampoLogger.registrar_evento(
            levantamento_id=id,
            tipo_evento="IMPORTACAO_TXT",
            descricao=desc,
            dados_detalhados={
                "arquivo_nome": ", ".join(nomes_arquivos),
                "arquivos": nomes_arquivos,
                "layout_detectado": layout,
                "total_pontos_importados": len(ids_pontos),
                "pontos": pontos_nomes,
                "base_escolhida_id": base_escolhida_id,
                "matricula_id": matricula_id
            }
        )
        return {
            "message": f"Sucesso: {len(ids_pontos)} pontos importados e {total_segmentos} segmentos perimetrais gerados automaticamente.",
            "pontos_importados": len(ids_pontos),
            "arquivos_importados": len(uploads),
            "layout_detectado": layout
        }
    except HTTPException:
        raise
    except ValueError as val_err:
        logging.getLogger(__name__).warning(f"Tentativa de importação inválida: {val_err}")
        raise HTTPException(
            status_code=400,
            detail={
                "erro": "VIOLACAO_REGRA_NEGOCIO",
                "mensagem": str(val_err)
            }
        )
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro na importação de caderneta TXT: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "erro": "ERRO_INTERNO_PROCESSAMENTO",
                "mensagem": f"Falha no processamento: {str(e)}"
            }
        )

# ── Translação e Correção de Lotes ─────────────────────────────────────────────

@router.post("/levantamentos/{id}/pontos/associar-base")
def post_associar_base_lote(id: int, payload: PayloadAssociarBase):
    verificar_levantamento_arquivado(id)
    try:
        from services.processamento.geoprocessamento import associar_base_ao_lote
        qtd = associar_base_ao_lote(payload.ponto_id_selecionado, payload.base_ppp_id)
        ExportacaoService.gerar_documento_cliente_workspace(id)
        return {"sucesso": True, "pontos_corrigidos": qtd, "mensagem": "Vínculo tardio e translação em bloco aplicados com sucesso."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/levantamentos/{id}/pontos/corrigir-manual")
def post_corrigir_manual_lote(id: int, payload: PayloadOverrideManual):
    verificar_levantamento_arquivado(id)
    try:
        from services.processamento.geoprocessamento import aplicar_correcao_manual_lote
        qtd = aplicar_correcao_manual_lote(
            id, 
            None, 
            payload.arquivo_origem, 
            payload.dados_brutos, 
            payload.dados_corrigidos
        )
        ExportacaoService.gerar_documento_cliente_workspace(id)
        return {"sucesso": True, "pontos_corrigidos": qtd, "mensagem": "Override manual e translação ECEF 3D aplicados com sucesso."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ── Ordenação e Reordenação de Perímetros ──────────────────────────────────────

@router.post("/levantamentos/{id}/matriculas/{matricula_id}/salvar-ordem")
def post_salvar_ordem_perimetro(id: int, matricula_id: int, payload: PayloadSalvarOrdem):
    verificar_levantamento_arquivado(id)
    pontos_ordem = [item.dict() for item in payload.pontos_ordem]
    res = salvar_ordem_caminhamento(id, matricula_id, pontos_ordem)
    if not res.get("sucesso"):
        raise HTTPException(status_code=400, detail=res.get("erro", "Erro ao salvar ordem"))
    return res

@router.post("/levantamentos/{id}/matriculas/{matricula_id}/reordenar")
def post_reordenar_perimetro(id: int, matricula_id: int):
    verificar_levantamento_arquivado(id)
    from services.processamento.geoprocessamento import reordenar_perimetro_matricula
    resultado = reordenar_perimetro_matricula(id, matricula_id)
    if not resultado["sucesso"]:
        raise HTTPException(status_code=400, detail=resultado["erro"])
    ExportacaoService.gerar_documento_cliente_workspace(id)
    return resultado

@router.post("/levantamentos/{id}/matriculas/{matricula_id}/ordenar-vizinhos")
def post_ordenar_vizinhos_perimetro(id: int, matricula_id: int):
    verificar_levantamento_arquivado(id)
    from services.gestores.levantamento_manager import ordenar_vizinho_mais_proximo
    resultado = ordenar_vizinho_mais_proximo(id, matricula_id)
    if not resultado.get("sucesso"):
        raise HTTPException(status_code=400, detail=resultado.get("erro", "Erro ao ordenar"))
    ExportacaoService.gerar_documento_cliente_workspace(id)
    return resultado

@router.post("/levantamentos/{id}/salvar-ordem")
def post_salvar_ordem_global(id: int, payload: PayloadSalvarOrdem):
    verificar_levantamento_arquivado(id)
    pontos_ordem = [item.dict() for item in payload.pontos_ordem]
    res = salvar_ordem_caminhamento(id, None, pontos_ordem)
    if not res.get("sucesso"):
        raise HTTPException(status_code=400, detail=res.get("erro", "Erro ao salvar ordem"))
    return res

@router.post("/levantamentos/{id}/reordenar")
def post_reordenar_global(id: int):
    verificar_levantamento_arquivado(id)
    from services.processamento.geoprocessamento import reordenar_perimetro_matricula
    resultado = reordenar_perimetro_matricula(id, None)
    if not resultado["sucesso"]:
        raise HTTPException(status_code=400, detail=resultado["erro"])
    ExportacaoService.gerar_documento_cliente_workspace(id)
    return resultado

@router.post("/levantamentos/{id}/ordenar-vizinhos")
def post_ordenar_vizinhos_global(id: int):
    verificar_levantamento_arquivado(id)
    from services.gestores.levantamento_manager import ordenar_vizinho_mais_proximo
    resultado = ordenar_vizinho_mais_proximo(id, None)
    if not resultado.get("sucesso"):
        raise HTTPException(status_code=400, detail=resultado.get("erro", "Erro ao ordenar"))
    ExportacaoService.gerar_documento_cliente_workspace(id)
    return resultado

# ── Atualização Manual e Auditoria Topológica ──────────────────────────────────

class ConfrontanteUpdateBatch(BaseModel):
    id: Optional[int] = None
    nome: Optional[str] = None
    matricula_imovel: Optional[str] = None
    cns_confrontante: Optional[str] = None
    tipo_relacao: Optional[str] = "Divisa"

class SegmentoUpdateBatch(BaseModel):
    id: Optional[int] = None
    tipo_limite_sigef: Optional[str] = None
    tipo_limite: Optional[str] = None
    metodo_posicionamento_sigef: Optional[str] = None
    metodo_posicionamento: Optional[str] = None
    anuencia_assinada: Optional[int] = None
    confrontante_id: Optional[int] = None

class PontoUpdateBatchItem(BaseModel):
    id: int
    tipo_ponto: Optional[Literal['M', 'P', 'V', 'B']] = None
    metodo_posicionamento: Optional[str] = None
    ignorar_poligono: Optional[int] = None
    sequencia_travada_id: Optional[str] = None
    matricula_id: Optional[int] = None
    confrontante: Optional[ConfrontanteUpdateBatch] = None
    segmento: Optional[SegmentoUpdateBatch] = None

class PontoBatchUpdatePayload(BaseModel):
    pontos: List[PontoUpdateBatchItem]

class PontoUpdate(BaseModel):
    nome_vertice: Optional[str] = None
    tipo_ponto: Optional[Literal['M', 'P', 'V', 'B']] = None
    camada_ciclo_vida: Optional[Literal['CAMPO', 'PERIMETRO', 'HOMOLOGADO', 'VIZINHO']] = None
    metodo_posicionamento: Optional[str] = None
    matricula_id: Optional[int] = None
    ponto_base_id: Optional[int] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    alt: Optional[float] = None
    sigma_lat: Optional[float] = None
    sigma_lon: Optional[float] = None
    sigma_alt: Optional[float] = None
    status_ponto: Optional[str] = None
    ignorar_poligono: Optional[int] = None
    n_corrigido: Optional[float] = None
    e_corrigido: Optional[float] = None
    alt_corrigido: Optional[float] = None
    fuso_utm: Optional[int] = None
    hemisferio: Optional[Literal['N', 'S']] = None
    fuso: Optional[str] = None
    codigo_sigef: Optional[str] = None
    ponto_origem_id: Optional[int] = None
    sequencia_travada_id: Optional[str] = None
    confrontante: Optional[ConfrontanteUpdateBatch] = None
    segmento: Optional[SegmentoUpdateBatch] = None

class PontoPatchPayload(BaseModel):
    nome_vertice: Optional[str] = None
    tipo_ponto: Optional[Literal['M', 'P', 'V', 'B']] = None
    camada_ciclo_vida: Optional[Literal['CAMPO', 'PERIMETRO', 'HOMOLOGADO', 'VIZINHO']] = None
    metodo_posicionamento: Optional[str] = None
    matricula_id: Optional[int] = None
    ponto_base_id: Optional[int] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    alt: Optional[float] = None
    lat_corrigido: Optional[float] = None
    lon_corrigido: Optional[float] = None
    alt_corrigido: Optional[float] = None
    n_corrigido: Optional[float] = None
    e_corrigido: Optional[float] = None
    fuso_utm: Optional[int] = None
    hemisferio: Optional[Literal['N', 'S']] = None
    fuso: Optional[str] = None
    delta_n: Optional[float] = None
    delta_e: Optional[float] = None
    delta_h: Optional[float] = None
    delta_3d: Optional[float] = None
    codigo_sigef: Optional[str] = None
    ponto_origem_id: Optional[int] = None
    sigma_lat: Optional[float] = None
    sigma_lon: Optional[float] = None
    sigma_alt: Optional[float] = None
    status_ponto: Optional[str] = None
    ignorar_poligono: Optional[int] = None
    ordem_caminhamento: Optional[int] = None
    confrontante: Optional[ConfrontanteUpdateBatch] = None
    segmento: Optional[SegmentoUpdateBatch] = None

class PontoVincularMatriculaPayload(BaseModel):
    ponto_id: int
    matricula_id: Optional[int] = None
    modo: Literal['mover', 'compartilhar'] = 'mover'

@router.put("/levantamentos/{id}/pontos/batch")
def update_pontos_batch(id: int, payload: PontoBatchUpdatePayload):
    try:
        verificar_levantamento_arquivado(id)
        from services.gestores.levantamento_manager import atualizar_pontos_geodesicos_batch
        res = atualizar_pontos_geodesicos_batch(id, payload.model_dump(exclude_unset=True))
        if "error" in res:
            status = res.get("status_code", 400)
            raise HTTPException(status_code=status, detail=res["error"])
        return {"success": True}
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Erro ao atualizar pontos em lote: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/pontos/{pid}")
@router.put("/pontos/{pid}/transacional")
def update_ponto(pid: int, payload: PontoUpdate):
    try:
        row = execute_query("SELECT levantamento_id, ponto_vizinho FROM pontos WHERE id = ?", params=(pid,), fetch_one=True)
        if not row:
            raise HTTPException(status_code=404, detail="Ponto não encontrado.")
            
        if row["ponto_vizinho"] == 1:
            raise HTTPException(status_code=403, detail="Pontos de confrontantes/vizinhos são imutáveis e não podem ser alterados.")
            
        verificar_levantamento_arquivado(row["levantamento_id"])
        
        res = atualizar_ponto_geodesico(pid, payload.model_dump(exclude_unset=True))
        if "error" in res:
            status = res.get("status_code", 400)
            raise HTTPException(status_code=status, detail=res["error"])
            
        sanitizar_ordens_duplicadas(row["levantamento_id"])
        return res
    except HTTPException:
        raise
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao atualizar ponto: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))

@router.patch("/pontos/{pid}")
def patch_ponto(pid: int, payload: PontoPatchPayload):
    """
    Atualização atômica e ágil para auto-save contínuo do Painel de Propriedades.
    Salva sem perda de foco e calcula deltas milimétricos instantaneamente.
    """
    try:
        row = execute_query("SELECT levantamento_id, ponto_vizinho, matricula_id, ordem_caminhamento FROM pontos WHERE id = ?", params=(pid,), fetch_one=True)
        if not row:
            raise HTTPException(status_code=404, detail="Ponto não encontrado.")
            
        if row["ponto_vizinho"] == 1 and payload.camada_ciclo_vida != "VIZINHO":
            raise HTTPException(status_code=403, detail="Pontos de confrontantes/vizinhos são imutáveis.")
            
        verificar_levantamento_arquivado(row["levantamento_id"])
        
        dados = payload.dict(exclude_unset=True)
        if not dados:
            return {"success": True, "message": "Nenhum campo fornecido para atualização."}

        res = atualizar_ponto_geodesico(pid, dados)
        if "error" in res:
            status = res.get("status_code", 400)
            raise HTTPException(status_code=status, detail=res["error"])
            
        # Só executa sanitização pesada se alterou explicitamente matrícula ou ordem
        if "ordem_caminhamento" in dados or "matricula_id" in dados:
            sanitizar_ordens_duplicadas(row["levantamento_id"])
            
        return res
    except HTTPException:
        raise
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro no PATCH do ponto {pid}: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/levantamentos/{id}/pontos/analise-duplicatas")
def get_analise_duplicatas(id: int, tolerancia_metros: float = 0.05):
    """
    Analisa espacialmente e semanticamente os pontos de um levantamento para identificar:
    1. Sobreposições espaciais (distância <= tolerância em metros).
    2. Conflitos de nomenclatura em vértices.
    """
    try:
        verificar_levantamento_arquivado(id)
        resultado = analisar_duplicatas_e_sobreposicoes(id, tolerancia_metros=tolerancia_metros)
        if not resultado.get("sucesso"):
            raise HTTPException(status_code=400, detail=resultado.get("erro", "Erro ao analisar duplicatas"))
        return resultado
    except HTTPException:
        raise
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao analisar duplicatas do levantamento {id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/levantamentos/{id}/pontos/vincular-matricula")
def post_vincular_ponto_matricula(id: int, payload: PontoVincularMatriculaPayload):
    """
    Vincula um ponto a uma matrícula com suporte a mover ou compartilhar vértices entre glebas/matrículas.
    """
    try:
        verificar_levantamento_arquivado(id)
        resultado = vincular_ponto_matricula(id, payload.ponto_id, payload.matricula_id, payload.modo)
        if not resultado.get("sucesso"):
            raise HTTPException(status_code=400, detail=resultado.get("erro", "Erro ao vincular ponto à matrícula"))
            
        sanitizar_ordens_duplicadas(id)
        return resultado
    except HTTPException:
        raise
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao vincular ponto à matrícula no levantamento {id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/matriculas/{mid}/auditoria")
def auditar_perimetro_matricula(mid: int):
    """Efetua a auditoria topológica completa de caminhamento e área real da matrícula rústica"""
    mat_row = execute_query("SELECT * FROM matriculas WHERE id = ?", params=(mid,), fetch_one=True)
    if not mat_row: 
        raise HTTPException(status_code=404, detail="Matrícula não cadastrada.")
    mat = dict(mat_row)
    
    pontos_rows = execute_query(
        "SELECT id, nome_vertice, lat, lon, alt, ordem_caminhamento FROM pontos WHERE matricula_id = ? AND (ignorar_poligono IS NULL OR ignorar_poligono = 0) AND (tipo_ponto IS NULL OR tipo_ponto != 'B') ORDER BY CASE WHEN ordem_caminhamento IS NULL OR ordem_caminhamento = 0 THEN 999999 ELSE ordem_caminhamento END ASC, id ASC",
        params=(mid,), fetch_all=True
    )
    if not pontos_rows:
        return {"sucesso": False, "erro": "Nenhum ponto geodésico cadastrado para esta matrícula."}
        
    pontos = [dict(p) for p in pontos_rows]
    
    from services.processamento.sigef_validator import SigefValidator
    res_auditoria = SigefValidator.auditar_poligonal_matricula(pontos, area_declarada_ha=mat.get("area_ha") or 0.0)
    res_auditoria["area_sigef_ha"] = mat.get("area_sigef_ha")
    return res_auditoria


@router.post("/pontos/analisar-txt")
async def analisar_arquivo_txt_temporario(
    fuso_utm: int = Form(22),
    inverter_ne: bool = Form(False),
    file: UploadFile = File(...)
):
    """
    Pré-visualização da Área de Triagem: lê o arquivo com o MESMO parser da importação oficial
    (delimitador, layout e inversão N/E idênticos) e converte de UTM para lat/lon, sem gravar nada.
    """
    if not (FUSO_UTM_MIN <= fuso_utm <= FUSO_UTM_MAX):
        raise HTTPException(status_code=400, detail=f"Fuso UTM inválido: {fuso_utm}. Use um fuso entre {FUSO_UTM_MIN} e {FUSO_UTM_MAX}.")

    sufixo = os.path.splitext(file.filename or "")[1].lower() or ".txt"
    caminho_tmp = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=sufixo) as tmp:
            tmp.write(await file.read())
            caminho_tmp = tmp.name

        parser = TxtGeodesicParser(None, inverter_ne=inverter_ne, fuso_utm=fuso_utm)
        layout, pontos_brutos = parser.ler_arquivo(caminho_tmp)

        if not pontos_brutos:
            raise HTTPException(status_code=400, detail="Nenhum ponto válido encontrado no arquivo.")

        transformer_to_latlon = get_transformer(f"epsg:319{60 + fuso_utm}", "epsg:4674", always_xy=True)

        pontos_convertidos = []
        for p in pontos_brutos:
            try:
                lon, lat = transformer_to_latlon.transform(p["e_original"], p["n_original"])
                pontos_convertidos.append({
                    "nome": p["nome"],
                    "lat": lat,
                    "lon": lon,
                    "alt": p["alt_original"],
                    "norte": p["n_original"],
                    "este": p["e_original"],
                    "sigma_n": p["sigma_n"],
                    "sigma_e": p["sigma_e"],
                    "sigma_z": p["sigma_z"],
                    "descricao": p["descricao"]
                })
            except Exception as e_trans:
                logging.getLogger(__name__).warning(f"Erro ao converter ponto {p['nome']}: {e_trans}")

        return {
            "layout_detectado": layout.upper(),
            "fuso_utm": fuso_utm,
            "pontos": pontos_convertidos
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao processar arquivo: {str(e)}")
    finally:
        if caminho_tmp and os.path.exists(caminho_tmp):
            os.remove(caminho_tmp)

@router.post("/levantamentos/{id}/pontos/integrar-vizinho/{pid}")
def integrar_ponto_vizinho(id: int, pid: int, matricula_id: Optional[int] = None):
    verificar_levantamento_arquivado(id)
    try:
        p_viz = execute_query(
            "SELECT * FROM pontos WHERE id = ? AND levantamento_id = ? AND ponto_vizinho = 1",
            params=(pid, id),
            fetch_one=True
        )
        if not p_viz:
            raise HTTPException(status_code=404, detail="Ponto de vizinho não encontrado neste levantamento.")
            
        if matricula_id:
            row_max = execute_query(
                "SELECT MAX(ordem_caminhamento) as max_ord FROM pontos WHERE levantamento_id = ? AND matricula_id = ?",
                params=(id, matricula_id),
                fetch_one=True
            )
        else:
            row_max = execute_query(
                "SELECT MAX(ordem_caminhamento) as max_ord FROM pontos WHERE levantamento_id = ?",
                params=(id,),
                fetch_one=True
            )
        max_ord = row_max["max_ord"] if row_max and row_max["max_ord"] is not None else 0
        nova_ordem = max_ord + 1
        
        with DatabaseManager() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO pontos (
                    levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt,
                    n_original, e_original, alt_original, sigma_n, sigma_e, sigma_z,
                    sigma_lat, sigma_lon, sigma_alt, status_ponto, status_correcao, metodo_posicionamento,
                    arquivo_origem, origem_homologada, confrontante_id, ponto_vizinho, ordem_caminhamento
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    id, matricula_id, p_viz["nome_vertice"], p_viz["tipo_ponto"], p_viz["lat"], p_viz["lon"], p_viz["alt"],
                    p_viz["n_original"], p_viz["e_original"], p_viz["alt_original"], p_viz["sigma_n"], p_viz["sigma_e"], p_viz["sigma_z"],
                    p_viz["sigma_lat"], p_viz["sigma_lon"], p_viz["sigma_alt"], "CORRIGIDO", "CORRIGIDO", p_viz["metodo_posicionamento"],
                    p_viz["arquivo_origem"], 0, p_viz["confrontante_id"], 0, nova_ordem
                )
            )
            novo_ponto_id = cursor.lastrowid
            conn.commit()
            
        return {
            "success": True, 
            "novo_ponto_id": novo_ponto_id, 
            "mensagem": f"Vértice '{p_viz['nome_vertice']}' integrado com sucesso!"
        }
    except Exception as e:
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))

class PayloadSincronizarCAD(BaseModel):
    payload_cad: str
    matricula_id: Optional[int] = None
    reconstruir_poligonal: Optional[bool] = True

@router.post("/levantamentos/{id}/pontos/sincronizar-cad")
def sincronizar_cad_clipboard(id: int, payload: PayloadSincronizarCAD):
    """
    Sincroniza os vértices recebidos do CAD via Clipboard (comando GCOPIAR).
    Aplica lógica inteligente de Upsert:
    - Se o nome_vertice já existir no levantamento: atualiza coordenadas, tipo e metadados.
    - Se for um vértice novo (ex: Vértice Virtual 'V'): insere no banco, calcula Lat/Lon geodésica e vincula à poligonal.
    - Integra confrontantes automaticamente caso especificados no bloco CAD.
    - Reconstrói a poligonal e sequência de caminhamento da matrícula caso haja polilinha associada.
    """
    verificar_levantamento_arquivado(id)
    if not payload.payload_cad or not payload.payload_cad.strip():
        raise HTTPException(status_code=400, detail="Payload do CAD está vazio ou inválido.")

    try:
        lines = [l.strip() for l in payload.payload_cad.strip().split("\n") if l.strip()]
        if not lines:
            raise HTTPException(status_code=400, detail="Nenhum vértice encontrado no payload informando.")

        transformer = get_transformer("epsg:31982", "epsg:4674", always_xy=True)
        count_atualizados = 0
        count_inseridos = 0
        confrontantes_criados = 0
        pontos_processados = []
        target_mat_id = payload.matricula_id

        with DatabaseManager() as conn:
            cursor = conn.cursor()

            # Se não veio matrícula no payload, descobre a matrícula padrão do levantamento
            if not target_mat_id:
                cursor.execute("SELECT id FROM matriculas WHERE propriedade_id = (SELECT propriedade_id FROM levantamentos WHERE id = ?) LIMIT 1", (id,))
                mat_row = cursor.fetchone()
                if mat_row:
                    target_mat_id = mat_row["id"]

            for line in lines:
                parts = line.split(";")
                x, y, z = None, None, 0.0
                id_vertice, tipo, sigma, metpos, tiplim, cns, matr, confro = "", "", "0.000", "", "", "", "", ""
                bloco = ""
                poligono_str = "1"
                ordem_str = "0"

                for part in parts:
                    if "=" in part and not part.startswith("ATRIB("):
                        param, val = part.split("=", 1)
                        param = param.strip().upper()
                        val = val.strip()
                        if param == "BLOCO":
                            bloco = val
                        elif param == "X":
                            try: x = float(val)
                            except ValueError: pass
                        elif param == "Y":
                            try: y = float(val)
                            except ValueError: pass
                        elif param == "Z":
                            try: z = float(val)
                            except ValueError: pass
                        elif param == "POLIGONO":
                            poligono_str = val
                        elif param == "ORDEM":
                            ordem_str = val

                    if part.startswith("ATRIB(") and part.endswith(")"):
                        attr_str = part[6:-1]
                        matches = re.findall(
                            r'(ID|TIPO|SIGMA|METPOS|TIPLIM|CNS|MATR|CONFRO)\s*:\s*(.*?)(?=(?:,\s*(?:ID|TIPO|SIGMA|METPOS|TIPLIM|CNS|MATR|CONFRO)\s*:)|$)',
                            attr_str,
                            re.IGNORECASE
                        )
                        for k, v in matches:
                            k = k.strip().upper()
                            v = v.strip()
                            if k == "ID": id_vertice = v
                            elif k == "TIPO": tipo = v.upper() if v else ""
                            elif k == "SIGMA": sigma = v
                            elif k == "METPOS": metpos = v
                            elif k == "TIPLIM": tiplim = v
                            elif k == "CNS": cns = v
                            elif k == "MATR": matr = v
                            elif k == "CONFRO": confro = v

                if not id_vertice or x is None or y is None:
                    continue

                # Converte UTM Zone 22S para SIRGAS 2000 Geodésico (Lat, Lon)
                lon, lat = transformer.transform(x, y)
                
                # Determina tipo inteligente caso não venha explícito ou seja default 'V'
                tipo_final = tipo.upper() if tipo and tipo.upper() in ['M', 'P', 'V', 'B'] else ''
                if not tipo_final or tipo_final == 'V':
                    if "MEMOVEM" in bloco.upper() or "-M-" in id_vertice.upper():
                        tipo_final = "M"
                    elif "MEMOVEP" in bloco.upper() or "-P-" in id_vertice.upper():
                        tipo_final = "P"
                    elif "MEMOVEB" in bloco.upper() or "-B-" in id_vertice.upper() or id_vertice.upper().startswith("BASE"):
                        tipo_final = "B"
                    else:
                        tipo_final = tipo_final or "V"

                try:
                    sig_val = float(sigma) if sigma else 0.0
                except ValueError:
                    sig_val = 0.0

                ignorar_poligono_val = 0 if poligono_str == "1" else 1
                try:
                    ord_num = int(ordem_str)
                except ValueError:
                    ord_num = 0

                # Gerencia auto-criação e amarração de Confrontantes
                confrontante_id = None
                if confro and confro.strip():
                    conf_nome = confro.strip()
                    cursor.execute(
                        "SELECT id FROM confrontantes WHERE levantamento_id = ? AND LOWER(TRIM(nome)) = LOWER(?)",
                        (id, conf_nome)
                    )
                    c_row = cursor.fetchone()
                    if c_row:
                        confrontante_id = c_row["id"]
                        if matr or cns:
                            cursor.execute(
                                """
                                UPDATE confrontantes
                                SET matricula_imovel = CASE WHEN ? != '' THEN ? ELSE matricula_imovel END,
                                    cns_confrontante = CASE WHEN ? != '' THEN ? ELSE cns_confrontante END
                                WHERE id = ?
                                """,
                                (matr, matr, cns, cns, confrontante_id)
                            )
                    else:
                        cursor.execute("INSERT INTO pessoas (nome) VALUES (?)", (conf_nome,))
                        pessoa_id = cursor.lastrowid
                        cursor.execute(
                            """
                            INSERT INTO confrontantes (pessoa_id, levantamento_id, nome, matricula_imovel, cns_confrontante, tipo_relacao)
                            VALUES (?, ?, ?, ?, ?, 'CONFRONTANTE')
                            """,
                            (pessoa_id, id, conf_nome, matr or "", cns or "")
                        )
                        confrontante_id = cursor.lastrowid
                        confrontantes_criados += 1

                # Verifica existência prévia do vértice pelo nome
                cursor.execute(
                    "SELECT id, matricula_id FROM pontos WHERE levantamento_id = ? AND nome_vertice = ? AND (ponto_vizinho IS NULL OR ponto_vizinho = 0)",
                    (id, id_vertice)
                )
                existente = cursor.fetchone()

                if existente:
                    pid = existente["id"]
                    cursor.execute(
                        """
                        UPDATE pontos
                        SET lat = ?, lon = ?, alt = ?,
                            lat_corrigido = ?, lon_corrigido = ?, alt_corrigido = ?,
                            tipo_ponto = ?,
                            sigma_lat = CASE WHEN ? > 0 THEN ? ELSE sigma_lat END,
                            sigma_lon = CASE WHEN ? > 0 THEN ? ELSE sigma_lon END,
                            sigma_alt = CASE WHEN ? > 0 THEN ? ELSE sigma_alt END,
                            status_ponto = 'CORRIGIDO', status_correcao = 'CORRIGIDO',
                            metodo_posicionamento = CASE WHEN ? != '' THEN ? ELSE metodo_posicionamento END,
                            confrontante_id = CASE WHEN ? IS NOT NULL THEN ? ELSE confrontante_id END,
                            ignorar_poligono = ?,
                            ordem_caminhamento = CASE WHEN ? > 0 THEN ? ELSE ordem_caminhamento END,
                            matricula_id = CASE WHEN ? IS NOT NULL THEN ? ELSE matricula_id END
                        WHERE id = ?
                        """,
                        (lat, lon, z, lat, lon, z, tipo_final, sig_val, sig_val, sig_val, sig_val, sig_val, sig_val,
                         metpos, metpos, confrontante_id, confrontante_id, ignorar_poligono_val,
                         ord_num, ord_num, target_mat_id, target_mat_id, pid)
                    )
                    count_atualizados += 1
                    pontos_processados.append({
                        "id": pid,
                        "nome": id_vertice,
                        "ordem": ord_num,
                        "ignorar_poligono": ignorar_poligono_val,
                        "matricula_id": target_mat_id or existente["matricula_id"],
                        "confrontante_id": confrontante_id,
                        "tipo_limite": tiplim,
                        "metodo": metpos
                    })
                else:
                    cursor.execute(
                        "SELECT MAX(ordem_caminhamento) as max_ord FROM pontos WHERE levantamento_id = ? AND (matricula_id = ? OR (? IS NULL AND matricula_id IS NULL)) AND tipo_ponto != 'B'",
                        (id, target_mat_id, target_mat_id)
                    )
                    max_row = cursor.fetchone()
                    nova_ordem = ord_num if ord_num > 0 else ((max_row["max_ord"] + 1) if max_row and max_row["max_ord"] is not None else 1)

                    cursor.execute(
                        """
                        INSERT INTO pontos (
                            levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt,
                            lat_corrigido, lon_corrigido, alt_corrigido,
                            sigma_lat, sigma_lon, sigma_alt, ordem_caminhamento, status_ponto, status_correcao,
                            metodo_posicionamento, confrontante_id, ignorar_poligono
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CORRIGIDO', 'CORRIGIDO', ?, ?, ?)
                        """,
                        (id, target_mat_id, id_vertice, tipo_final, lat, lon, z, lat, lon, z,
                         sig_val, sig_val, sig_val, nova_ordem, metpos, confrontante_id, ignorar_poligono_val)
                    )
                    pid = cursor.lastrowid
                    count_inseridos += 1
                    pontos_processados.append({
                        "id": pid,
                        "nome": id_vertice,
                        "ordem": nova_ordem,
                        "ignorar_poligono": ignorar_poligono_val,
                        "matricula_id": target_mat_id,
                        "confrontante_id": confrontante_id,
                        "tipo_limite": tiplim,
                        "metodo": metpos
                    })

            conn.commit()

        # Reconstrução da poligonal perimetral caso solicitado
        segmentos_gerados = 0
        if payload.reconstruir_poligonal and target_mat_id:
            pontos_na_poligonal = [p for p in pontos_processados if p["ignorar_poligono"] == 0 and p.get("ordem", 0) > 0 and p.get("matricula_id") == target_mat_id]
            if len(pontos_na_poligonal) >= 3:
                pontos_na_poligonal.sort(key=lambda x: x["ordem"])
                pontos_ordem_payload = [{"id": p["id"], "ordem": idx + 1} for idx, p in enumerate(pontos_na_poligonal)]
                res_ord = salvar_ordem_caminhamento(id, target_mat_id, pontos_ordem_payload)
                segmentos_gerados = res_ord.get("segmentos_gerados", 0)

                # Atualiza tipos de limite e confrontantes nos segmentos com base no vértice inicial
                with DatabaseManager() as conn_seg:
                    cur_seg = conn_seg.cursor()
                    for p_info in pontos_na_poligonal:
                        if p_info.get("tipo_limite") or p_info.get("confrontante_id"):
                            cur_seg.execute(
                                """
                                UPDATE segmentos
                                SET tipo_limite_sigef = CASE WHEN ? != '' THEN ? ELSE tipo_limite_sigef END,
                                    confrontante_id = CASE WHEN ? IS NOT NULL THEN ? ELSE confrontante_id END,
                                    metodo_posicionamento_sigef = CASE WHEN ? != '' THEN ? ELSE metodo_posicionamento_sigef END
                                WHERE levantamento_id = ? AND matricula_id = ? AND ponto_inicio_id = ?
                                """,
                                (p_info.get("tipo_limite", ""), p_info.get("tipo_limite", ""),
                                 p_info.get("confrontante_id"), p_info.get("confrontante_id"),
                                 p_info.get("metodo", ""), p_info.get("metodo", ""),
                                 id, target_mat_id, p_info["id"])
                            )
                    conn_seg.commit()

        sanitizar_ordens_duplicadas(id)
        ExportacaoService.gerar_documento_cliente_workspace(id)

        from services.processamento.historico_campo import HistoricoCampoLogger
        HistoricoCampoLogger.registrar_evento(
            levantamento_id=id,
            tipo_evento="SINCRONIZACAO_CAD",
            descricao=f"Sincronização via Clipboard do CAD realizada com sucesso: {count_atualizados} atualizados, {count_inseridos} inseridos, {confrontantes_criados} confrontantes criados.",
            dados_detalhados={"atualizados": count_atualizados, "inseridos": count_inseridos, "confrontantes_criados": confrontantes_criados}
        )

        return {
            "sucesso": True,
            "atualizados": count_atualizados,
            "inseridos": count_inseridos,
            "confrontantes_criados": confrontantes_criados,
            "segmentos_gerados": segmentos_gerados,
            "mensagem": f"Sincronização CAD concluída: {count_atualizados} vértice(s) atualizado(s), {count_inseridos} novo(s) inserido(s) e {confrontantes_criados} confrontante(s) vinculado(s)."
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro na sincronização CAD: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro interno durante a sincronização CAD: {str(e)}")





# ── Motor de Vértices Virtuais (PA1 / PA2 - INCRA/SIGEF) ───────────────────────

class PayloadCalcularComboPA1PA2(BaseModel):
    eixo_inicio_id: int
    eixo_fim_id: int
    divisa_inicio_id: int
    divisa_fim_id: int
    largura_faixa: float
    lado: Literal["DIREITA", "ESQUERDA"]
    nome_vertice: Optional[str] = "V01"


class PayloadCalcularPA2Puro(BaseModel):
    alinhamento1_inicio_id: int
    alinhamento1_fim_id: int
    alinhamento2_inicio_id: int
    alinhamento2_fim_id: int
    nome_vertice: Optional[str] = "V01"


class PayloadInserirVerticeVirtual(BaseModel):
    nome_vertice: str
    este: float
    norte: float
    altitude: float
    sigma_este: float
    sigma_norte: float
    sigma_altitude: float
    sigma_planimetrico: float
    metodo: str = "PA1+PA2"
    fuso_utm: Optional[int] = 22
    ordem_caminhamento: Optional[int] = None
    confrontante_id: Optional[int] = None


class PayloadCalcularOffsetLote(BaseModel):
    ponto_ids: List[int]
    distancia: float
    lado: Literal["DIREITA", "ESQUERDA"]
    prefixo_nome: Optional[str] = "V"
    indice_inicial: Optional[int] = None


class VerticeVirtualLoteItem(BaseModel):
    nome_vertice: str
    este: float
    norte: float
    altitude: float
    sigma_este: float
    sigma_norte: float
    sigma_altitude: float
    sigma_planimetrico: float
    metodo: str = "PA1"
    ordem_caminhamento: Optional[int] = None


class PayloadConfirmarOffsetLote(BaseModel):
    fuso_utm: Optional[int] = 22
    confrontante_id: Optional[int] = None
    vertices: List[VerticeVirtualLoteItem]


class PayloadSimularDivisaoOffset(BaseModel):
    ponto_base_1_id: int
    ponto_base_2_id: int
    modo: Literal['AREAS_IGUAIS', 'AREA_DEFINIDA', 'SEPARAR_MATRICULAS'] = 'AREAS_IGUAIS'
    alvo: Literal['BASE', 'REMANESCENTE'] = 'BASE'
    area_alvo_m2: Optional[float] = None
    area_alvo_ha: Optional[float] = None
    matricula_base_id: Optional[int] = None


class PayloadExecutarDivisaoOffset(BaseModel):
    ponto_base_1_id: int
    ponto_base_2_id: int
    modo: Literal['AREAS_IGUAIS', 'AREA_DEFINIDA', 'SEPARAR_MATRICULAS'] = 'AREAS_IGUAIS'
    alvo: Literal['BASE', 'REMANESCENTE'] = 'BASE'
    area_alvo_m2: Optional[float] = None
    area_alvo_ha: Optional[float] = None
    nome_gleba_a: Optional[str] = None
    nome_gleba_b: Optional[str] = None
    matricula_base_id: Optional[int] = None


@router.post("/levantamentos/{id}/matriculas/{matricula_id}/vertices-virtuais/calcular-combo-pa1-pa2")
def calcular_combo_pa1_pa2_endpoint(id: int, matricula_id: int, payload: PayloadCalcularComboPA1PA2):
    """
    Calcula analiticamente o vértice virtual conjugado PA1 (Paralela/Faixa de Domínio) + PA2 (Interseção).
    Aplica LPV estocástica para determinação das incertezas SIGEF/INCRA.
    """
    from services.processamento.vertices_virtuais import MotorVerticesVirtuais, LadoOffset

    try:
        validar_escopo_pontos_apoio(
            id, matricula_id,
            [payload.eixo_inicio_id, payload.eixo_fim_id, payload.divisa_inicio_id, payload.divisa_fim_id],
        )
        e1 = obter_ponto_apoio_db(payload.eixo_inicio_id)
        e2 = obter_ponto_apoio_db(payload.eixo_fim_id)
        d1 = obter_ponto_apoio_db(payload.divisa_inicio_id)
        d2 = obter_ponto_apoio_db(payload.divisa_fim_id)

        lado_enum = LadoOffset.DIREITA if payload.lado == "DIREITA" else LadoOffset.ESQUERDA

        resultado = MotorVerticesVirtuais.calcular_combo_pa1_pa2(
            eixo_1=e1,
            eixo_2=e2,
            divisa_1=d1,
            divisa_2=d2,
            largura_faixa=payload.largura_faixa,
            lado=lado_enum,
            nome_vertice=nome_virtual_livre(id, matricula_id, payload.nome_vertice),
        )

        return {
            "sucesso": True,
            "resultado": {
                "nome": resultado.nome,
                "este": resultado.este,
                "norte": resultado.norte,
                "altitude": resultado.altitude,
                "sigma_este": resultado.sigma_este,
                "sigma_norte": resultado.sigma_norte,
                "sigma_altitude": resultado.sigma_altitude,
                "sigma_planimetrico": resultado.sigma_planimetrico,
                "tipo_ponto": resultado.tipo_ponto,
                "metodo": resultado.metodo,
                "conforme_norma_incra": resultado.conforme_norma_incra,
                "alerta": resultado.alerta,
                "angulo_intersecao_graus": resultado.angulo_intersecao_graus,
            }
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except HTTPException:
        raise
    except VerticeVirtualErro as ve_erro:
        raise HTTPException(status_code=ve_erro.status, detail=ve_erro.mensagem)
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro no cálculo do combo PA1+PA2: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Falha interna no motor de cálculo: {str(e)}")


@router.post("/levantamentos/{id}/matriculas/{matricula_id}/vertices-virtuais/calcular-pa2-puro")
def calcular_pa2_puro_endpoint(id: int, matricula_id: int, payload: PayloadCalcularPA2Puro):
    """
    Calcula o vértice virtual por interseção analítica pura de dois alinhamentos (PA2).
    """
    from services.processamento.vertices_virtuais import MotorVerticesVirtuais

    try:
        validar_escopo_pontos_apoio(
            id, matricula_id,
            [
                payload.alinhamento1_inicio_id, payload.alinhamento1_fim_id,
                payload.alinhamento2_inicio_id, payload.alinhamento2_fim_id,
            ],
        )
        r1_p1 = obter_ponto_apoio_db(payload.alinhamento1_inicio_id)
        r1_p2 = obter_ponto_apoio_db(payload.alinhamento1_fim_id)
        r2_p1 = obter_ponto_apoio_db(payload.alinhamento2_inicio_id)
        r2_p2 = obter_ponto_apoio_db(payload.alinhamento2_fim_id)

        resultado = MotorVerticesVirtuais.calcular_pa2_puro(
            alinhamento1_p1=r1_p1,
            alinhamento1_p2=r1_p2,
            alinhamento2_p1=r2_p1,
            alinhamento2_p2=r2_p2,
            nome_vertice=nome_virtual_livre(id, matricula_id, payload.nome_vertice),
        )

        return {
            "sucesso": True,
            "resultado": {
                "nome": resultado.nome,
                "este": resultado.este,
                "norte": resultado.norte,
                "altitude": resultado.altitude,
                "sigma_este": resultado.sigma_este,
                "sigma_norte": resultado.sigma_norte,
                "sigma_altitude": resultado.sigma_altitude,
                "sigma_planimetrico": resultado.sigma_planimetrico,
                "tipo_ponto": resultado.tipo_ponto,
                "metodo": resultado.metodo,
                "conforme_norma_incra": resultado.conforme_norma_incra,
                "alerta": resultado.alerta,
                "angulo_intersecao_graus": resultado.angulo_intersecao_graus,
            }
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except HTTPException:
        raise
    except VerticeVirtualErro as ve_erro:
        raise HTTPException(status_code=ve_erro.status, detail=ve_erro.mensagem)
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro no cálculo do PA2 puro: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Falha interna no motor de cálculo: {str(e)}")


@router.post("/levantamentos/{id}/matriculas/{matricula_id}/vertices-virtuais/confirmar")
def confirmar_vertice_virtual_endpoint(id: int, matricula_id: int, payload: PayloadInserirVerticeVirtual):
    """
    Insere o vértice virtual calculado atomicamente no banco de dados, convertendo coordenadas
    UTM para Geográficas SIRGAS 2000 (regras em vertices_virtuais_manager).
    """
    verificar_levantamento_arquivado(id)
    try:
        r = inserir_vertice_virtual(id, matricula_id, payload.model_dump())
        return {
            "sucesso": True,
            "id": r["id"],
            "mensagem": f"Vértice virtual '{r['nome']}' cadastrado com sucesso.",
            "coordenadas": {
                "este": payload.este,
                "norte": payload.norte,
                "altitude": payload.altitude,
                "lat": r["lat"],
                "lon": r["lon"],
            }
        }
    except VerticeVirtualErro as ve:
        raise HTTPException(status_code=ve.status, detail=ve.mensagem)
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao inserir vértice virtual: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro ao persistir vértice virtual: {str(e)}")


@router.post("/levantamentos/{id}/matriculas/{matricula_id}/vertices-virtuais/calcular-offset-lote")
def calcular_offset_lote_endpoint(id: int, matricula_id: int, payload: PayloadCalcularOffsetLote):
    """
    Calcula analiticamente o deslocamento (offset estilo CAD) para uma sequência de pontos de apoio,
    retornando a cadeia de vértices virtuais com cantos interceptados e incertezas propagadas.
    """
    from services.processamento.vertices_virtuais import MotorVerticesVirtuais, LadoOffset

    try:
        if len(payload.ponto_ids) < 2:
            raise HTTPException(status_code=400, detail="São necessários pelo menos 2 pontos para o deslocamento.")

        if payload.distancia <= 0:
            raise HTTPException(status_code=400, detail="A distância de offset deve ser maior que zero.")

        validar_escopo_pontos_apoio(id, matricula_id, payload.ponto_ids)

        pontos_apoio = obter_pontos_apoio_db_lote(payload.ponto_ids)
        lado_enum = LadoOffset.DIREITA if payload.lado == "DIREITA" else LadoOffset.ESQUERDA

        nomes_existentes = nomes_existentes_para_offset(id, matricula_id)

        resultados = MotorVerticesVirtuais.calcular_offset_polilinha(
            pontos=pontos_apoio,
            distancia=payload.distancia,
            lado=lado_enum,
            prefixo_nome=payload.prefixo_nome or "V",
            indice_inicial=payload.indice_inicial or 1,
            nomes_existentes=nomes_existentes,
        )

        return {
            "sucesso": True,
            "total": len(resultados),
            "resultados": [
                {
                    "nome": r.nome,
                    "este": r.este,
                    "norte": r.norte,
                    "altitude": r.altitude,
                    "sigma_este": r.sigma_este,
                    "sigma_norte": r.sigma_norte,
                    "sigma_altitude": r.sigma_altitude,
                    "sigma_planimetrico": r.sigma_planimetrico,
                    "tipo_ponto": r.tipo_ponto,
                    "metodo": r.metodo,
                    "conforme_norma_incra": r.conforme_norma_incra,
                    "alerta": r.alerta,
                    "angulo_intersecao_graus": r.angulo_intersecao_graus,
                }
                for r in resultados
            ]
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except HTTPException:
        raise
    except VerticeVirtualErro as ve_erro:
        raise HTTPException(status_code=ve_erro.status, detail=ve_erro.mensagem)
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro no cálculo de offset em lote: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Falha interna no motor de offset: {str(e)}")


@router.post("/levantamentos/{id}/matriculas/{matricula_id}/vertices-virtuais/confirmar-lote")
def confirmar_offset_lote_endpoint(id: int, matricula_id: int, payload: PayloadConfirmarOffsetLote):
    """
    Insere atomicamente um lote de vértices virtuais no banco de dados,
    convertendo coordenadas UTM para Geográficas SIRGAS 2000 (rascunho, fora do perímetro).
    """
    verificar_levantamento_arquivado(id)
    try:
        r = inserir_lote_vertices_virtuais(
            id, matricula_id, payload.fuso_utm, payload.confrontante_id,
            [v.model_dump() for v in payload.vertices],
        )
        return {
            "sucesso": True,
            "total_inseridos": len(r["ids"]),
            "ids": r["ids"],
            "renomeados": r["renomeados"],
            "mensagem": f"{len(r['ids'])} vértice(s) virtual(is) criado(s) como rascunho, fora do perímetro."
        }
    except VerticeVirtualErro as ve:
        raise HTTPException(status_code=ve.status, detail=ve.mensagem)
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao inserir lote de vértices virtuais: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro ao persistir vértices virtuais em lote: {str(e)}")


class PayloadPromoverVirtuais(BaseModel):
    ponto_ids: List[int]
    apos_ponto_id: Optional[int] = None  # None => depois do último ponto do perímetro


@router.post("/levantamentos/{id}/matriculas/{matricula_id}/vertices-virtuais/promover")
def promover_vertices_virtuais_endpoint(id: int, matricula_id: int, payload: PayloadPromoverVirtuais):
    """
    Insere vértices virtuais em rascunho (CAMPO, fora do polígono) no perímetro da matrícula,
    logo após o ponto indicado, e regenera as divisas.
    """
    verificar_levantamento_arquivado(id)
    try:
        ids_promover = promover_vertices_virtuais(id, matricula_id, payload.ponto_ids, payload.apos_ponto_id)
        return {
            "sucesso": True,
            "total_promovidos": len(ids_promover),
            "ids": ids_promover,
            "mensagem": f"{len(ids_promover)} vértice(s) virtual(is) inserido(s) no perímetro.",
        }
    except VerticeVirtualErro as ve:
        raise HTTPException(status_code=ve.status, detail=ve.mensagem)
    except Exception as e:
        logging.getLogger(__name__).error(f"Erro ao promover vértices virtuais: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro ao inserir vértices virtuais no perímetro: {str(e)}")



# ── Divisão e Desmembramento de Lotes por Offset Paralelo ─────────────────────

@router.post('/levantamentos/{id}/matriculas/{matricula_id}/divisao-offset/simular')
def post_simular_divisao_offset(id: int, matricula_id: int, payload: PayloadSimularDivisaoOffset):
    verificar_levantamento_arquivado(id)
    area_m2 = payload.area_alvo_m2
    if area_m2 is None and payload.area_alvo_ha is not None:
        area_m2 = payload.area_alvo_ha * 10000.0
    try:
        from services.processamento.divisao_lotes import simular_divisao_offset
        return simular_divisao_offset(
            levantamento_id=id,
            matricula_id=matricula_id,
            ponto_base_1_id=payload.ponto_base_1_id,
            ponto_base_2_id=payload.ponto_base_2_id,
            modo=payload.modo,
            alvo=payload.alvo,
            area_alvo_m2=area_m2,
            matricula_base_id=payload.matricula_base_id
        )
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        logging.getLogger(__name__).error(f'Erro na simulacao de divisao de lote: {e}', exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post('/levantamentos/{id}/matriculas/{matricula_id}/divisao-offset/executar')
def post_executar_divisao_offset(id: int, matricula_id: int, payload: PayloadExecutarDivisaoOffset):
    verificar_levantamento_arquivado(id)
    area_m2 = payload.area_alvo_m2
    if area_m2 is None and payload.area_alvo_ha is not None:
        area_m2 = payload.area_alvo_ha * 10000.0
    try:
        from services.processamento.divisao_lotes import executar_divisao_offset
        res = executar_divisao_offset(
            levantamento_id=id,
            matricula_id=matricula_id,
            ponto_base_1_id=payload.ponto_base_1_id,
            ponto_base_2_id=payload.ponto_base_2_id,
            modo=payload.modo,
            alvo=payload.alvo,
            area_alvo_m2=area_m2,
            nome_gleba_a=payload.nome_gleba_a,
            nome_gleba_b=payload.nome_gleba_b,
            matricula_base_id=payload.matricula_base_id
        )

        # A divisão já foi gravada: falha no log de auditoria não pode virar erro para o usuário
        try:
            from services.processamento.historico_campo import HistoricoCampoLogger
            tipo_evento = 'MATRICULAS_SEPARADAS' if res.get('tipo_operacao') == 'SEPARACAO' else 'LOTE_DESMEMBRADO'
            HistoricoCampoLogger.registrar_evento(
                levantamento_id=id,
                tipo_evento=tipo_evento,
                descricao=res.get('mensagem') or f'Divisao da matricula {matricula_id} por offset.',
                dados_detalhados=res,
            )
        except Exception as e_log:
            logging.getLogger(__name__).warning(f'Divisao salva, mas o historico falhou: {e_log}')

        return res
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        logging.getLogger(__name__).error(f'Erro ao executar desmembramento de lote: {e}', exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get('/levantamentos/{id}/divisao-offset/ultima')
def get_ultima_divisao_offset(id: int):
    try:
        from services.processamento.divisao_lotes import obter_ultima_divisao
        return obter_ultima_divisao(id)
    except Exception as e:
        logging.getLogger(__name__).error(f'Erro ao consultar ultima divisao: {e}', exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post('/levantamentos/{id}/divisao-offset/{snapshot_id}/desfazer')
def post_desfazer_divisao_offset(id: int, snapshot_id: int):
    verificar_levantamento_arquivado(id)
    try:
        from services.processamento.divisao_lotes import desfazer_divisao
        res = desfazer_divisao(id, snapshot_id)
        try:
            from services.processamento.historico_campo import HistoricoCampoLogger
            HistoricoCampoLogger.registrar_evento(
                levantamento_id=id,
                tipo_evento='DIVISAO_DESFEITA',
                descricao=res.get('mensagem') or 'Divisao de lote desfeita.',
                dados_detalhados={'snapshot_id': snapshot_id, 'tipo': res.get('tipo')},
            )
        except Exception as e_log:
            logging.getLogger(__name__).warning(f'Divisao desfeita, mas o historico falhou: {e_log}')
        return res
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        logging.getLogger(__name__).error(f'Erro ao desfazer divisao: {e}', exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
