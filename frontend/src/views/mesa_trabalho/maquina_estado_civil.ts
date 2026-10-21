import {
  normalizarEstadoCivil,
  normalizarRegimeBens,
  formatarCpfCnpjDinamico
} from './validadores_documento';

export {
  normalizarEstadoCivil,
  normalizarRegimeBens,
  formatarCpfCnpjDinamico
};

/**
 * Máquina de Estados Reativa para a Qualificação de Cônjuge na aba de Cartório.
 * Alterna a visibilidade e obrigatoriedade de campos conforme o estado civil selecionado.
 */
export function configurarMaquinadeEstadosCivil(cardElement: HTMLElement): void {
  const selectEstadoCivil = cardElement.querySelector('#conf-estado-civil') as any;
  const selectRegime = cardElement.querySelector('#conf-regime-bens') as any;
  const groupConjuge = (cardElement.querySelector('#box-conjuge') || cardElement.querySelector('#group-dados-conjuge')) as HTMLElement;
  const inputConjugeNome = cardElement.querySelector('#input-conf-conjuge-nome') as any;
  const inputsCamposExtra = cardElement.querySelectorAll(
    '#input-conf-conjuge-cpf, #input-conf-conjuge-rg, #conf-conjuge-genero, #input-conf-conjuge-nacionalidade, #input-conf-conjuge-profissao'
  ) as NodeListOf<any>;

  const atualizarCampos = () => {
    if (!selectEstadoCivil || !groupConjuge) return;
    const estCivil = (selectEstadoCivil.value || '').toLowerCase().trim();

    const precisaConjuge =
      estCivil.includes('casad') || estCivil.includes('estav') || estCivil.includes('estáv') || estCivil === 'uniao_estavel';

    if (!precisaConjuge) {
      if (selectRegime) {
        selectRegime.setAttribute('disabled', '');
        selectRegime.value = '';
      }
      groupConjuge.classList.add('hidden');
    } else {
      if (selectRegime) {
        selectRegime.removeAttribute('disabled');
      }
      groupConjuge.classList.remove('hidden');

      if (inputConjugeNome) {
        inputConjugeNome.removeAttribute('disabled');
        if (inputConjugeNome.placeholder !== undefined) {
          inputConjugeNome.placeholder = 'Nome completo';
        }
      }

      inputsCamposExtra.forEach((input: any) => {
        if (input.removeAttribute) {
          input.removeAttribute('disabled');
        } else {
          input.disabled = false;
        }
        if (input.id?.includes('cpf') && input.placeholder !== undefined) {
          input.placeholder = '000.000.000-00';
        } else if (input.id?.includes('rg') && input.placeholder !== undefined) {
          input.placeholder = 'RG / Órgão';
        }
      });
    }
  };

  if (selectEstadoCivil) {
    selectEstadoCivil.addEventListener('change', atualizarCampos);
    selectEstadoCivil.addEventListener('ui-selecionar', atualizarCampos);
  }
  if (selectRegime) {
    selectRegime.addEventListener('change', atualizarCampos);
    selectRegime.addEventListener('ui-selecionar', atualizarCampos);
    selectRegime.addEventListener('input', atualizarCampos);
  }

  atualizarCampos();
}
