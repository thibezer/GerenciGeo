/**
 * Motor de Cálculos Cartográficos e Geodésicos do GerenciGeo
 * Projeções SIRGAS 2000 UTM, azimutes, distâncias, área de Gauss (Shoelace)
 * e avaliação de conformidade segundo a Norma Técnica para Georreferenciamento de Imóveis Rurais (INCRA 3ª Edição).
 */

// Tolerâncias normativas do INCRA (NTGIR 3ª Edição) em metros
export const TOLERANCIA_INCRA = {
  M: 0.10, // Marco materializado (tipo M) - tolerância de até 0.10m
  V: 0.50, // Vértice não materializado / virtual (tipo V) - tolerância de até 0.50m
  P: 3.00, // Limite natural não materializado (tipo P) - tolerância de até 3.00m
  B: 0.10  // Base de apoio
} as const;

/**
 * Converte coordenadas Latitude/Longitude para UTM SIRGAS 2000 (elipsoide GRS80).
 * `zonaForcada` projeta no fuso UTM escolhido; se omitido, calcula o fuso natural a partir da longitude.
 */
export const latLonToUTM = (lat: number, lon: number, zonaForcada?: number): { e: number; n: number; zone: number } => {
  const sa = 6378137.0;
  const sb = 6356752.314245;
  const e2cuadrado = (sa * sa - sb * sb) / (sb * sb);
  const c = (sa * sa) / sb;

  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;

  const zone = zonaForcada && zonaForcada >= 1 && zonaForcada <= 60
    ? zonaForcada
    : Math.floor((lon + 180) / 6) + 1;
  const lonSMRad = (((zone - 1) * 6 - 180 + 3) * Math.PI) / 180;

  const deltaLon = lonRad - lonSMRad;

  const A = Math.cos(latRad) * Math.sin(deltaLon);
  const xi = 0.5 * Math.log((1 + A) / (1 - A));
  const eta = Math.atan(Math.tan(latRad) / Math.cos(deltaLon)) - latRad;

  const nu = c / Math.sqrt(1 + e2cuadrado * Math.cos(latRad) * Math.cos(latRad));
  const zeta = (e2cuadrado / 2) * xi * xi * Math.cos(latRad) * Math.cos(latRad);
  const A1 = Math.sin(2 * latRad);
  const A2 = A1 * Math.cos(latRad) * Math.cos(latRad);
  const J2 = latRad + A1 / 2;
  const J4 = (3 * J2 + A2) / 4;
  const J6 = (5 * J4 + A2 * Math.cos(latRad) * Math.cos(latRad)) / 3;

  const alpha = (3 / 4) * e2cuadrado;
  const beta = (5 / 3) * alpha * alpha;
  const gama = (35 / 27) * alpha * alpha * alpha;

  const Bm = 0.9996 * c * (latRad - alpha * J2 + beta * J4 - gama * J6);

  const e = xi * nu * 0.9996 * (1 + zeta / 3) + 500000;
  let n = eta * nu * 0.9996 * (1 + zeta) + Bm;

  if (n < 0) {
    n = n + 10000000;
  }

  return { e, n, zone };
};

/**
 * Calcula o erro horizontal bidimensional Sigma P: σP = √(σE² + σN²)
 */
export const calcularSigmaHorizontal = (sigmaE: number, sigmaN: number): number => {
  return Math.hypot(sigmaE || 0, sigmaN || 0);
};

/**
 * Calcula o erro linear tridimensional Sigma 3D: σ3D = √(σE² + σN² + σH²)
 */
export const calcularSigma3D = (sigmaE: number, sigmaN: number, sigmaH: number): number => {
  const e = sigmaE || 0;
  const n = sigmaN || 0;
  const h = sigmaH || 0;
  return Math.sqrt(e * e + n * n + h * h);
};

/**
 * Avalia a precisão horizontal do vértice perante a norma INCRA.
 */
export const avaliarToleranciaIncra = (
  tipoPonto: string,
  sigmaHorizontal: number
): { conforme: boolean; limite: number; diferenca: number } => {
  const tipoUpper = (tipoPonto || 'V').toUpperCase();
  const limite = TOLERANCIA_INCRA[tipoUpper as keyof typeof TOLERANCIA_INCRA] ?? 0.50;
  const conforme = sigmaHorizontal <= limite;
  const diferenca = sigmaHorizontal - limite;

  return { conforme, limite, diferenca };
};

/**
 * Formata um azimute em formato sexagesimal profissional: G° M' S.ss"
 */
export const formatarAzimuteDMS = (grausDecimais: number): string => {
  let gDec = grausDecimais % 360;
  if (gDec < 0) gDec += 360;

  const d = Math.floor(gDec);
  const minResto = (gDec - d) * 60;
  const m = Math.floor(minResto);
  const s = (minResto - m) * 60;

  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const sFormatado = s.toFixed(2).padStart(5, '0');

  return `${pad(d)}° ${pad(m)}' ${sFormatado}"`;
};

/**
 * Calcula distância euclidiana plana e azimute topográfico a partir de coordenadas UTM.
 */
export const calcularDistanciaAzimute = (
  p1: { e: number; n: number },
  p2: { e: number; n: number }
): { distancia: number; azimuteDec: number; azimuteFormatado: string } => {
  const de = p2.e - p1.e;
  const dn = p2.n - p1.n;

  const distancia = Math.hypot(de, dn);
  let rad = Math.atan2(de, dn);
  let deg = (rad * 180) / Math.PI;
  if (deg < 0) deg += 360;

  return {
    distancia: Math.round(distancia * 1000) / 1000,
    azimuteDec: Math.round(deg * 10000) / 10000,
    azimuteFormatado: formatarAzimuteDMS(deg)
  };
};

/**
 * Calcula a área e perímetro de uma poligonal fechada via Fórmulas de Gauss (Shoelace Algorithm).
 */
export const calcularAreaGaussShoelace = (
  pontos: Array<{ e: number; n: number }>
): { areaM2: number; areaHa: number; perimetroM: number } => {
  const n = pontos.length;
  if (n < 3) {
    return { areaM2: 0, areaHa: 0, perimetroM: 0 };
  }

  let somaGauss = 0;
  let perimetro = 0;

  for (let i = 0; i < n; i++) {
    const atual = pontos[i];
    const proximo = pontos[(i + 1) % n];

    somaGauss += atual.e * proximo.n - proximo.e * atual.n;
    perimetro += Math.hypot(proximo.e - atual.e, proximo.n - atual.n);
  }

  const areaM2 = Math.abs(somaGauss) / 2;
  const areaHa = areaM2 / 10000;

  return {
    areaM2: Math.round(areaM2 * 1000) / 1000,
    areaHa: Math.round(areaHa * 10000) / 10000,
    perimetroM: Math.round(perimetro * 1000) / 1000
  };
};
