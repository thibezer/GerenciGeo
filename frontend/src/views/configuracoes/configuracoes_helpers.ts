import { escapeHtml } from '../../utils';

// Lógica pura de Configurações > Responsáveis Técnicos (padrão: "Arquivos .md/PADRAO_TELA_LISTAGEM.md").
// Sem DOM: testável com `npm test`.

export interface Profissional {
  id: number;
  nome: string;
  formacao?: string | null;
  nacionalidade?: string | null;
  cpf?: string | null;
  rg?: string | null;
  conselho?: string | null;
  registro?: string | null;
  codigo_credenciado?: string | null;
  endereco?: string | null;
  endereco_residencial?: string | null;
  contador_m?: number | null;
  contador_p?: number | null;
  contador_v?: number | null;
}

const semAcento = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Máscara progressiva 000.000.000-00 (ignora o que não for dígito e corta em 11). */
export const aplicarMascaraCPF = (value: string): string => {
  const v = value.replace(/\D/g, '').substring(0, 11);
  if (v.length <= 3) return v;
  if (v.length <= 6) return `${v.substring(0, 3)}.${v.substring(3)}`;
  if (v.length <= 9) return `${v.substring(0, 3)}.${v.substring(3, 6)}.${v.substring(6)}`;
  return `${v.substring(0, 3)}.${v.substring(3, 6)}.${v.substring(6, 9)}-${v.substring(9)}`;
};

/** Valida os dois dígitos verificadores; rejeita sequências repetidas (111.111.111-11). */
export const validarCPF = (cpf: string): boolean => {
  const limpo = cpf.replace(/\D/g, '');
  if (limpo.length !== 11 || /^(\d)\1{10}$/.test(limpo)) return false;
  const digito = (tamanho: number): number => {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += parseInt(limpo.charAt(i), 10) * (tamanho + 1 - i);
    const resto = 11 - (soma % 11);
    return resto >= 10 ? 0 : resto;
  };
  return digito(9) === parseInt(limpo.charAt(9), 10) && digito(10) === parseInt(limpo.charAt(10), 10);
};

export const totalVertices = (p: Profissional): number =>
  (p.contador_m || 0) + (p.contador_p || 0) + (p.contador_v || 0);

/** Busca por nome, formação, CPF (com ou sem máscara), registro, conselho e código credenciado. */
export const filtrarProfissionais = <T extends Profissional>(lista: T[], termo: string): T[] => {
  const t = semAcento((termo || '').trim());
  if (!t) return lista;
  const digitos = t.replace(/\D/g, '');
  return lista.filter(p => {
    const texto = semAcento([p.nome, p.formacao, p.registro, p.conselho, p.codigo_credenciado].map(v => v || '').join('|'));
    if (texto.includes(t)) return true;
    return digitos.length >= 3 && (p.cpf || '').replace(/\D/g, '').includes(digitos);
  });
};

/** Linhas da tabela de profissionais; TODO texto vindo do cadastro é escapado. */
export const renderLinhasProfissionais = (lista: Profissional[]): string => lista.map(p => {
  const nome = escapeHtml(p.nome);
  const vertices = totalVertices(p);
  const registro = [p.conselho, p.registro].map(v => (v || '').trim()).filter(Boolean).join(' · ');
  return `
    <tr data-id="${p.id}" tabindex="0" aria-label="Editar ${nome}">
      <td>
        <div class="lp-id-txt">
          <div class="lp-id-nome"><span title="${nome}">${nome}</span></div>
          <span class="lp-sub">${p.formacao ? escapeHtml(p.formacao) : '<span class="lp-muted">Formação não informada</span>'}</span>
        </div>
      </td>
      <td class="lp-oculta-md"><span class="lp-mono" style="font-size:12.5px">${registro ? escapeHtml(registro) : '<span class="lp-muted">—</span>'}</span></td>
      <td class="lp-oculta-lg"><span class="lp-mono" style="font-size:12.5px;color:var(--lp-text-2)">${p.cpf ? escapeHtml(p.cpf) : '<span class="lp-muted">—</span>'}</span></td>
      <td><span class="lp-tag ${p.codigo_credenciado ? 'lp-tag-pf' : 'lp-tag-warn'}" title="Código credenciado INCRA">${p.codigo_credenciado ? escapeHtml(p.codigo_credenciado) : 'Sem código'}</span></td>
      <td class="lp-col-num lp-oculta-sm"><span class="lp-cnt ${vertices ? '' : 'is-zero'}" title="Vértices homologados"><i data-lucide="map-pin"></i>${vertices}</span></td>
      <td class="lp-col-acoes" style="width:120px">
        <div class="lp-acoes">
          <button type="button" class="lp-ico-btn btn-action" data-action="banco" data-id="${p.id}" title="Banco de pontos" aria-label="Banco de pontos de ${nome}" style="color:var(--lp-accent)"><i data-lucide="shield-check"></i></button>
          <button type="button" class="lp-ico-btn btn-action" data-action="editar" data-id="${p.id}" title="Editar" aria-label="Editar ${nome}"><i data-lucide="edit"></i></button>
          <button type="button" class="lp-ico-btn is-danger btn-action" data-action="excluir" data-id="${p.id}" title="Excluir" aria-label="Excluir ${nome}"><i data-lucide="trash-2"></i></button>
        </div>
      </td>
    </tr>`;
}).join('');

export interface PontoBanco {
  codigo_completo: string;
  tipo_ponto: string;
  numero: number | string;
  nome_propriedade?: string | null;
  created_at?: string | null;
}

/** Linhas do histórico do banco de pontos (modal); texto escapado. */
export const renderLinhasBancoPontos = (pontos: PontoBanco[]): string => pontos.map(pt => {
  const quando = pt.created_at ? new Date(pt.created_at) : null;
  const dataFmt = quando && !isNaN(quando.getTime())
    ? quando.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';
  return `
    <tr class="hover:bg-white/[0.01] transition-all font-mono text-[11px]">
      <td class="px-4 py-2 text-mint-vibrant font-bold">${escapeHtml(pt.codigo_completo)}</td>
      <td class="px-4 py-2">${escapeHtml(pt.tipo_ponto)}</td>
      <td class="px-4 py-2 text-right">${escapeHtml(String(pt.numero))}</td>
      <td class="px-4 py-2 font-sans font-medium text-white">${escapeHtml(pt.nome_propriedade || '[Arquivo Desvinculado]')}</td>
      <td class="px-4 py-2 text-white/40">${escapeHtml(dataFmt)}</td>
    </tr>`;
}).join('');
