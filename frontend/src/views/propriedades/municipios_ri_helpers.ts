import { formatarCNS } from '../../utils';

export interface RiCartorio {
  cns: string;
  oficio: string;
}

export interface MunicipioCartorioItem {
  municipio: string;
  uf: string;
  ris: RiCartorio[];
  cartorio?: string | null;
}

export interface CnsCobertura {
  cns: string;
  oficio: string;
  municipios: string[];
}

export const MUNICIPIOS_PARANA: readonly string[] = [
  "Abatiá",
  "Adrianópolis",
  "Agudos do Sul",
  "Almirante Tamandaré",
  "Altamira do Paraná",
  "Alto Paraíso",
  "Alto Paraná",
  "Alto Piquiri",
  "Altônia",
  "Alvorada do Sul",
  "Amaporã",
  "Ampére",
  "Anahy",
  "Andirá",
  "Ângulo",
  "Antonina",
  "Antônio Olinto",
  "Apucarana",
  "Arapongas",
  "Arapoti",
  "Arapuã",
  "Araruna",
  "Araucária",
  "Ariranha do Ivaí",
  "Assaí",
  "Assis Chateaubriand",
  "Astorga",
  "Atalaia",
  "Balsa Nova",
  "Bandeirantes",
  "Barbosa Ferraz",
  "Barra do Jacaré",
  "Barracão",
  "Bela Vista da Caroba",
  "Bela Vista do Paraíso",
  "Bituruna",
  "Boa Esperança",
  "Boa Esperança do Iguaçu",
  "Boa Ventura de São Roque",
  "Boa Vista da Aparecida",
  "Bocaiúva do Sul",
  "Bom Jesus do Sul",
  "Bom Sucesso",
  "Bom Sucesso do Sul",
  "Borrazópolis",
  "Braganey",
  "Brasilândia do Sul",
  "Cafeara",
  "Cafelândia",
  "Cafezal do Sul",
  "Califórnia",
  "Cambará",
  "Cambé",
  "Cambira",
  "Campina da Lagoa",
  "Campina do Simão",
  "Campina Grande do Sul",
  "Campo Bonito",
  "Campo do Tenente",
  "Campo Largo",
  "Campo Magro",
  "Campo Mourão",
  "Cândido de Abreu",
  "Candói",
  "Cantagalo",
  "Capanema",
  "Capitão Leônidas Marques",
  "Carambeí",
  "Carlópolis",
  "Cascavel",
  "Castro",
  "Catanduvas",
  "Centenário do Sul",
  "Cerro Azul",
  "Céu Azul",
  "Chopinzinho",
  "Cianorte",
  "Cidade Gaúcha",
  "Clevelândia",
  "Colombo",
  "Colorado",
  "Congonhinhas",
  "Conselheiro Mairinck",
  "Contenda",
  "Corbélia",
  "Cornélio Procópio",
  "Coronel Domingos Soares",
  "Coronel Vivida",
  "Corumbataí do Sul",
  "Cruz Machado",
  "Cruzeiro do Iguaçu",
  "Cruzeiro do Oeste",
  "Cruzeiro do Sul",
  "Cruzmaltina",
  "Curitiba",
  "Curiúva",
  "Diamante do Norte",
  "Diamante do Sul",
  "Diamante D'Oeste",
  "Dois Vizinhos",
  "Douradina",
  "Doutor Camargo",
  "Doutor Ulysses",
  "Enéas Marques",
  "Engenheiro Beltrão",
  "Entre Rios do Oeste",
  "Esperança Nova",
  "Espigão Alto do Iguaçu",
  "Farol",
  "Faxinal",
  "Fazenda Rio Grande",
  "Fênix",
  "Fernandes Pinheiro",
  "Figueira",
  "Flor da Serra do Sul",
  "Floraí",
  "Floresta",
  "Florestópolis",
  "Flórida",
  "Formosa do Oeste",
  "Foz do Iguaçu",
  "Foz do Jordão",
  "Francisco Alves",
  "Francisco Beltrão",
  "General Carneiro",
  "Godoy Moreira",
  "Goioerê",
  "Goioxim",
  "Grandes Rios",
  "Guaíra",
  "Guairaçá",
  "Guamiranga",
  "Guapirama",
  "Guaporema",
  "Guaraci",
  "Guaraniaçu",
  "Guarapuava",
  "Guaraqueçaba",
  "Guaratuba",
  "Honório Serpa",
  "Ibaiti",
  "Ibema",
  "Ibiporã",
  "Icaraíma",
  "Iguaraçu",
  "Iguatu",
  "Imbaú",
  "Imbituva",
  "Inácio Martins",
  "Inajá",
  "Indianópolis",
  "Ipiranga",
  "Iporã",
  "Iracema do Oeste",
  "Irati",
  "Iretama",
  "Itaguajé",
  "Itaipulândia",
  "Itambaracá",
  "Itambé",
  "Itapejara d'Oeste",
  "Itaperuçu",
  "Itaúna do Sul",
  "Ivaí",
  "Ivaiporã",
  "Ivaté",
  "Ivatuba",
  "Jaboti",
  "Jacarezinho",
  "Jaguapitã",
  "Jaguariaíva",
  "Jandaia do Sul",
  "Janiópolis",
  "Japira",
  "Japurá",
  "Jardim Alegre",
  "Jardim Olinda",
  "Jataizinho",
  "Jesuítas",
  "Joaquim Távora",
  "Jundiaí do Sul",
  "Juranda",
  "Jussara",
  "Kaloré",
  "Lapa",
  "Laranjal",
  "Laranjeiras do Sul",
  "Leópolis",
  "Lidianópolis",
  "Lindoeste",
  "Loanda",
  "Lobato",
  "Londrina",
  "Luiziana",
  "Lunardelli",
  "Lupionópolis",
  "Mallet",
  "Mamborê",
  "Mandaguaçu",
  "Mandaguari",
  "Mandirituba",
  "Manfrinópolis",
  "Mangueirinha",
  "Manoel Ribas",
  "Marechal Cândido Rondon",
  "Maria Helena",
  "Marialva",
  "Marilândia do Sul",
  "Marilena",
  "Mariluz",
  "Maringá",
  "Mariópolis",
  "Maripá",
  "Marmeleiro",
  "Marquinho",
  "Marumbi",
  "Matelândia",
  "Matinhos",
  "Mato Rico",
  "Mauá da Serra",
  "Medianeira",
  "Mercedes",
  "Mirador",
  "Miraselva",
  "Missal",
  "Moreira Sales",
  "Morretes",
  "Munhoz de Melo",
  "Nossa Senhora das Graças",
  "Nova Aliança do Ivaí",
  "Nova América da Colina",
  "Nova Aurora",
  "Nova Cantu",
  "Nova Esperança",
  "Nova Esperança do Sudoeste",
  "Nova Fátima",
  "Nova Laranjeiras",
  "Nova Londrina",
  "Nova Olímpia",
  "Nova Prata do Iguaçu",
  "Nova Santa Bárbara",
  "Nova Santa Rosa",
  "Nova Tebas",
  "Novo Itacolomi",
  "Ortigueira",
  "Ourizona",
  "Ouro Verde do Oeste",
  "Paiçandu",
  "Palmas",
  "Palmeira",
  "Palmital",
  "Palotina",
  "Paraíso do Norte",
  "Paranacity",
  "Paranaguá",
  "Paranapoema",
  "Paranavaí",
  "Pato Bragado",
  "Pato Branco",
  "Paula Freitas",
  "Paulo Frontin",
  "Peabiru",
  "Perobal",
  "Pérola",
  "Pérola d'Oeste",
  "Piên",
  "Pinhais",
  "Pinhal de São Bento",
  "Pinhalão",
  "Pinhão",
  "Piraí do Sul",
  "Piraquara",
  "Pitanga",
  "Pitangueiras",
  "Planaltina do Paraná",
  "Planalto",
  "Ponta Grossa",
  "Pontal do Paraná",
  "Porecatu",
  "Porto Amazonas",
  "Porto Barreiro",
  "Porto Rico",
  "Porto Vitória",
  "Prado Ferreira",
  "Pranchita",
  "Presidente Castelo Branco",
  "Primeiro de Maio",
  "Prudentópolis",
  "Quarto Centenário",
  "Quatiguá",
  "Quatro Barras",
  "Quatro Pontes",
  "Quedas do Iguaçu",
  "Querência do Norte",
  "Quinta do Sol",
  "Quitandinha",
  "Ramilândia",
  "Rancho Alegre",
  "Rancho Alegre D'Oeste",
  "Realeza",
  "Rebouças",
  "Renascença",
  "Reserva",
  "Reserva do Iguaçu",
  "Ribeirão Claro",
  "Ribeirão do Pinhal",
  "Rio Azul",
  "Rio Bom",
  "Rio Bonito do Iguaçu",
  "Rio Branco do Ivaí",
  "Rio Branco do Sul",
  "Rio Negro",
  "Rolândia",
  "Roncador",
  "Rondon",
  "Rosário do Ivaí",
  "Sabáudia",
  "Salgado Filho",
  "Salto do Itararé",
  "Salto do Lontra",
  "Santa Amélia",
  "Santa Cecília do Pavão",
  "Santa Cruz de Monte Castelo",
  "Santa Fé",
  "Santa Helena",
  "Santa Inês",
  "Santa Isabel do Ivaí",
  "Santa Izabel do Oeste",
  "Santa Lúcia",
  "Santa Maria do Oeste",
  "Santa Mariana",
  "Santa Mônica",
  "Santa Tereza do Oeste",
  "Santa Terezinha de Itaipu",
  "Santana do Itararé",
  "Santo Antônio da Platina",
  "Santo Antônio do Caiuá",
  "Santo Antônio do Paraíso",
  "Santo Antônio do Sudoeste",
  "Santo Inácio",
  "São Carlos do Ivaí",
  "São Jerônimo da Serra",
  "São João",
  "São João do Caiuá",
  "São João do Ivaí",
  "São João do Triunfo",
  "São Jorge do Ivaí",
  "São Jorge do Patrocínio",
  "São Jorge d'Oeste",
  "São José da Boa Vista",
  "São José das Palmeiras",
  "São José dos Pinhais",
  "São Manoel do Paraná",
  "São Mateus do Sul",
  "São Miguel do Iguaçu",
  "São Pedro do Iguaçu",
  "São Pedro do Ivaí",
  "São Pedro do Paraná",
  "São Sebastião da Amoreira",
  "São Tomé",
  "Sapopema",
  "Sarandi",
  "Saudade do Iguaçu",
  "Sengés",
  "Serranópolis do Iguaçu",
  "Sertaneja",
  "Sertanópolis",
  "Siqueira Campos",
  "Sulina",
  "Tamarana",
  "Tamboara",
  "Tapejara",
  "Tapira",
  "Teixeira Soares",
  "Telêmaco Borba",
  "Terra Boa",
  "Terra Rica",
  "Terra Roxa",
  "Tibagi",
  "Tijucas do Sul",
  "Toledo",
  "Tomazina",
  "Três Barras do Paraná",
  "Tunas do Paraná",
  "Tuneiras do Oeste",
  "Tupãssi",
  "Turvo",
  "Ubiratã",
  "Umuarama",
  "União da Vitória",
  "Uniflor",
  "Uraí",
  "Ventania",
  "Vera Cruz do Oeste",
  "Verê",
  "Virmond",
  "Vitorino",
  "Wenceslau Braz",
  "Xambrê",
];

export const semAcentoTexto = (texto?: string | null): string =>
  (texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

export const cnsEhCompleto = (valor?: string | null): boolean =>
  (valor || '').replace(/\D/g, '').length === 6;

export const normalizarCns = (valor?: string | null): string => {
  const digitos = (valor || '').replace(/\D/g, '');
  if (digitos.length !== 6) return '';
  return formatarCNS(digitos);
};

/**
 * Mescla os 399 municípios oficiais do Paraná com o catálogo retornado pela API,
 * preservando nomes oficiais com acento e todos os RIs (CNS + Ofício) já vinculados.
 */
export const mesclarCatalogoMunicipios = (
  remoto: Array<Partial<MunicipioCartorioItem>> = []
): MunicipioCartorioItem[] => {
  const mapa = new Map<string, { municipio: string; uf: string; risMap: Map<string, RiCartorio>; cartorio?: string | null }>();

  const garantir = (municipio: string, uf: string, preferirNome = false) => {
    const mun = (municipio || '').trim();
    const ufNorm = (uf || '').trim().toUpperCase();
    const chave = `${semAcentoTexto(mun)}|${ufNorm}`;
    let entry = mapa.get(chave);
    if (!entry) {
      entry = { municipio: mun, uf: ufNorm, risMap: new Map(), cartorio: null };
      mapa.set(chave, entry);
    } else if (preferirNome && mun) {
      entry.municipio = mun;
    }
    return entry;
  };

  for (const nome of MUNICIPIOS_PARANA) {
    garantir(nome, 'PR', true);
  }

  for (const item of remoto) {
    const mun = (item.municipio || '').trim();
    const uf = (item.uf || '').trim().toUpperCase();
    if (!mun || uf.length !== 2) continue;
    const entry = garantir(mun, uf, false);
    if (Array.isArray(item.ris)) {
      for (const r of item.ris) {
        const cns = normalizarCns(r?.cns);
        const oficio = (r?.oficio || '').trim();
        if (!cns) continue;
        const atual = entry.risMap.get(cns);
        if (!atual || (oficio && !atual.oficio)) {
          entry.risMap.set(cns, { cns, oficio });
        }
      }
    }
    if (!entry.cartorio && item.cartorio) {
      entry.cartorio = item.cartorio;
    }
  }

  return Array.from(mapa.values())
    .map(entry => {
      const ris = Array.from(entry.risMap.values()).sort(
        (a, b) => semAcentoTexto(a.oficio).localeCompare(semAcentoTexto(b.oficio)) || a.cns.localeCompare(b.cns)
      );
      let resumo: string | null = entry.cartorio || null;
      if (ris.length === 1) {
        resumo = ris[0].oficio ? `${ris[0].oficio} · CNS ${ris[0].cns}` : `CNS ${ris[0].cns}`;
      } else if (ris.length > 1) {
        resumo = `${ris.length} RIs (${ris.map(r => r.cns).join(', ')})`;
      }
      return { municipio: entry.municipio, uf: entry.uf, ris, cartorio: resumo };
    })
    .sort((a, b) => semAcentoTexto(a.municipio).localeCompare(semAcentoTexto(b.municipio)) || a.uf.localeCompare(b.uf));
};

export const acharMunicipioCatalogo = (
  lista: MunicipioCartorioItem[],
  municipio: string,
  uf?: string | null
): MunicipioCartorioItem | undefined => {
  const alvo = semAcentoTexto(municipio);
  if (!alvo) return undefined;
  const ufNorm = (uf || '').trim().toUpperCase();
  if (ufNorm) {
    const exato = lista.find(m => semAcentoTexto(m.municipio) === alvo && m.uf === ufNorm);
    if (exato) return exato;
  }
  return lista.find(m => semAcentoTexto(m.municipio) === alvo);
};

/**
 * Índice reverso CNS -> Ofício + lista de municípios atendidos por aquele mesmo cartório.
 */
export const mapearCnsParaMunicipios = (lista: MunicipioCartorioItem[]): Map<string, CnsCobertura> => {
  const porCns = new Map<string, { oficio: string; municipios: Set<string> }>();
  for (const item of lista) {
    const labelMun = `${item.municipio}/${item.uf}`;
    for (const ri of item.ris || []) {
      const cns = normalizarCns(ri.cns);
      if (!cns) continue;
      let reg = porCns.get(cns);
      if (!reg) {
        reg = { oficio: (ri.oficio || '').trim(), municipios: new Set() };
        porCns.set(cns, reg);
      } else if (ri.oficio && !reg.oficio) {
        reg.oficio = ri.oficio.trim();
      }
      reg.municipios.add(labelMun);
    }
  }
  const saida = new Map<string, CnsCobertura>();
  for (const [cns, dados] of porCns.entries()) {
    saida.set(cns, {
      cns,
      oficio: dados.oficio,
      municipios: Array.from(dados.municipios).sort((a, b) => semAcentoTexto(a).localeCompare(semAcentoTexto(b))),
    });
  }
  return saida;
};

export const formatarRotuloMunicipioDatalist = (item: MunicipioCartorioItem): string => {
  if (item.ris && item.ris.length === 1) {
    const r = item.ris[0];
    return `${item.uf} — ${r.oficio ? `${r.oficio} · ` : ''}CNS ${r.cns}`;
  }
  if (item.ris && item.ris.length > 1) {
    return `${item.uf} — ${item.ris.length} RIs (${item.ris.map(r => r.cns).join(', ')})`;
  }
  return item.cartorio ? `${item.uf} — ${item.cartorio}` : item.uf;
};
