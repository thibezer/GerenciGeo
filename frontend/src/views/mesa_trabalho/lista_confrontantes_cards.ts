import { escapeHtml } from '../../utils';
import {
  type ConfrontanteResumo,
  type ResumoConfrontante,
  rotuloLote,
  rotuloMatricula,
  mesmoTexto,
  pluralizar,
  fmtMetros,
  estadoDe,
  CHIP_ESTADO,
  CLS_LINK,
  CLS_BTN_PRIM,
  CLS_BTN_SEC
} from './lista_confrontantes_tipos';

export function htmlCard(
  c: ConfrontanteResumo,
  expandidos: Set<number>,
  ocupados: Set<number>,
  modoSelecao: boolean,
  selecionados: Set<number>,
  destacado: number | null
): string {
  const est = estadoDe(c);
  const chip = CHIP_ESTADO[est];
  const aberto = expandidos.has(c.id);
  const nome = escapeHtml(c.nome);
  const parcial = !c.dispensada && c.assinadas > 0 && c.assinadas < c.qtd_divisas;
  const completo = est === 'assinada';
  const ocupado = ocupados.has(c.id);

  const lote = rotuloLote(c.lote);
  const loteTxt = lote && !mesmoTexto(lote, c.nome) ? escapeHtml(lote) : '';
  const matTxt = c.matricula_imovel && !mesmoTexto(c.matricula_imovel, c.nome) ? escapeHtml(rotuloMatricula(c.matricula_imovel)) : '';
  const partesSub = [
    loteTxt,
    matTxt,
    pluralizar(c.qtd_divisas, 'divisa', 'divisas'),
    fmtMetros(c.comprimento_m),
    est === 'incompleto'
      ? `<button type="button" class="link-conf-completar ${CLS_LINK} !px-0 text-amber-300 hover:text-amber-200" data-id="${c.id}" aria-label="Completar cadastro de ${nome}: falta CPF/CNPJ" title="Completar qualificação (sem CPF/CNPJ)">sem CPF/CNPJ</button>`
      : '',
  ].filter(Boolean);

  const checkLote = modoSelecao
    ? `<label class="mt-0.5 inline-flex items-center justify-center w-7 h-7 shrink-0 cursor-pointer" title="Incluir no lote">
         <input type="checkbox" class="chk-conf-lote accent-emerald-400 w-4 h-4" data-id="${c.id}" aria-label="Incluir ${nome} no lote" ${selecionados.has(c.id) ? 'checked' : ''} />
       </label>`
    : '';

  const blocoAssinatura = c.dispensada
    ? `<span class="text-[11px] text-slate-300" title="${c.dispensa_inferida ? 'Dispensada automaticamente pelo nome (via ou curso de água público). Clique em Exigir se este confrontante for particular.' : 'Anuência dispensada (ente público).'}">${c.dispensa_inferida ? 'Ente público (pelo nome)' : 'Ente público'}</span>
       <button type="button" class="btn-conf-exigir ${CLS_LINK}" data-id="${c.id}" ${ocupado ? 'disabled' : ''} aria-label="Voltar a exigir a anuência de ${nome}" title="Voltar a exigir a anuência deste confrontante">Exigir</button>`
    : `<label class="inline-flex items-center gap-1.5 min-h-[28px] text-[11px] ${completo ? 'text-emerald-300' : 'text-white/70'} cursor-pointer select-none" title="Anuência assinada (todas as divisas deste confrontante)">
         <input type="checkbox" class="chk-conf-assinada accent-emerald-400 w-4 h-4" data-id="${c.id}" ${parcial ? 'data-parcial="1"' : ''} ${completo ? 'checked' : ''} ${ocupado ? 'disabled' : ''}
                aria-label="Anuência assinada de ${nome}${parcial ? ` (${c.assinadas} de ${c.qtd_divisas} divisas)` : ''}" />
         <span>${parcial ? `${c.assinadas}/${c.qtd_divisas} divisas` : 'Assinada'}</span>
       </label>
       <button type="button" class="btn-conf-dispensar ${CLS_LINK}" data-id="${c.id}" ${ocupado ? 'disabled' : ''} aria-label="Dispensar a anuência de ${nome}" title="Ente público (estrada, rio, ferrovia): dispensa a anuência e tira da contagem">Dispensar</button>`;

  const btnEditar = (primario: boolean) => primario
    ? `<button type="button" class="btn-conf-editar ${CLS_BTN_PRIM}" data-id="${c.id}" aria-label="Completar cadastro de ${nome}" title="Completar a qualificação (CPF/CNPJ, RG, cônjuge, matrícula...)"><i data-lucide="edit-3" class="w-3 h-3"></i>Completar cadastro</button>`
    : `<button type="button" class="btn-conf-editar ${CLS_BTN_SEC}" data-id="${c.id}" aria-label="Editar ${nome}" title="Editar qualificação completa do confrontante (CPF, RG, cônjuge, matrícula...)"><i data-lucide="edit-3" class="w-3 h-3 text-mint-vibrant"></i>Editar</button>`;
  const btnTrecho = `<button type="button" class="btn-conf-ver ${CLS_BTN_SEC}" data-id="${c.id}" aria-label="Pré-visualizar divisa de ${nome}" title="Pré-visualizar divisa"><i data-lucide="eye" class="w-3 h-3"></i>Divisa</button>`;
  const btnGerar = (primario: boolean) => `<button type="button" class="btn-conf-gerar ${primario ? CLS_BTN_PRIM : CLS_BTN_SEC}" data-id="${c.id}" aria-label="Gerar anuência de ${nome}" title="${est === 'incompleto' ? 'Gerar anuência (cadastro incompleto)' : 'Gerar anuência'}"><i data-lucide="file-down" class="w-3 h-3"></i>${primario ? 'Gerar anuência' : 'Gerar'}</button>`;

  let acoes: string;
  if (est === 'incompleto') acoes = `${btnEditar(true)}${btnTrecho}${btnGerar(false)}`;
  else if (est === 'pendente') acoes = `${btnGerar(true)}${btnEditar(false)}${btnTrecho}`;
  else if (est === 'assinada') acoes = `${btnEditar(false)}${btnTrecho}${btnGerar(false)}`;
  else acoes = `${btnEditar(false)}${btnTrecho}`;

  const trechos = c.trechos.map(t => `
    <div class="flex items-center justify-between gap-2 text-[11px] font-mono text-white/70 pt-1">
      <span class="truncate">${escapeHtml(t.de)} ➔ ${escapeHtml(t.para)}</span>
      <span class="shrink-0 text-white/60">${pluralizar(t.qtd_divisas, 'divisa', 'divisas')} · ${fmtMetros(t.comprimento_m)}${t.tipo_limite ? ` · ${escapeHtml(t.tipo_limite)}` : ''}</span>
    </div>`).join('');

  return `
    <div role="listitem" class="bg-white/[0.025] border border-white/[0.09] rounded-lg" data-conf-id="${c.id}">
      <div class="px-2.5 pt-2 pb-2 space-y-1.5">
        <div class="flex items-start gap-1.5">
          ${checkLote}
          <button type="button" class="btn-conf-expandir inline-flex items-center justify-center w-7 h-7 shrink-0 rounded text-white/70 hover:text-white hover:bg-white/10"
                  data-id="${c.id}" aria-expanded="${aberto}" aria-controls="conf-trechos-${c.id}"
                  aria-label="${aberto ? 'Ocultar' : 'Mostrar'} trechos de ${nome}" title="${aberto ? 'Ocultar trechos' : 'Mostrar trechos'}">
            <i data-lucide="${aberto ? 'chevron-down' : 'chevron-right'}" class="w-3.5 h-3.5"></i>
          </button>
          <button type="button" class="btn-conf-focar group min-w-0 flex-1 text-left rounded px-1 py-1 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-mint-vibrant"
                  data-id="${c.id}" aria-pressed="${destacado === c.id}" aria-label="Enquadrar ${nome} no mapa" title="Enquadrar no mapa">
            <span class="flex items-start gap-1.5 text-[13px] font-semibold leading-snug">
              <i data-lucide="map-pin" class="w-3.5 h-3.5 mt-0.5 shrink-0 text-mint-vibrant/80 group-hover:text-mint-vibrant"></i>
              <span class="break-words underline-offset-2 group-hover:underline">${nome}</span>
            </span>
          </button>
        </div>
        <div class="pl-9 text-[11px] text-white/60 leading-snug flex flex-wrap items-center gap-x-1.5">${partesSub.map((p, i) => (i > 0 ? `<span aria-hidden="true">·</span>` : '') + `<span>${p}</span>`).join('')}</div>
        <div class="pl-9 flex items-center gap-2 flex-wrap">
          <span class="inline-flex items-center gap-1 px-2 min-h-[22px] text-[11px] font-semibold rounded-full border ${chip.cls}"><i data-lucide="${chip.icone}" class="w-3 h-3"></i>${chip.texto}</span>
          ${blocoAssinatura}
        </div>
        <div class="pl-9 flex items-center gap-1.5 flex-wrap">${acoes}</div>
      </div>
      <div id="conf-trechos-${c.id}" class="px-3 pb-2.5 pt-0.5 space-y-1 border-t border-white/5" ${aberto ? '' : 'hidden'}>
        ${aberto ? `${trechos}<button type="button" class="btn-conf-filtrar ${CLS_LINK} text-mint-vibrant/90 hover:text-mint-vibrant" data-id="${c.id}">Filtrar a tabela por este confrontante</button>` : ''}
      </div>
    </div>`;
}

export function htmlSemConfrontante(sem?: ResumoConfrontante): string {
  if (!sem || sem.qtd_divisas <= 0) return '';
  return `
    <div class="col-span-all flex items-center justify-between gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2" style="grid-column:1/-1" role="listitem">
      <div class="text-[11px] text-amber-200"><strong>${pluralizar(sem.qtd_divisas, 'divisa', 'divisas')}</strong> sem confrontante · ${fmtMetros(sem.comprimento_m)}</div>
      <button type="button" class="btn-conf-filtrar-sem ${CLS_LINK} text-amber-300 hover:text-amber-100 font-bold">Ver na tabela</button>
    </div>`;
}

export function caixaEstado(conteudo: string): string {
  return `<div class="text-center py-5 px-2 space-y-3" style="grid-column:1/-1">${conteudo}</div>`;
}
