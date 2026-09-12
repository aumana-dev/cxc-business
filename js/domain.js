export const monedas = {
  crc: 'CRC',
  usd: 'USD',
};

export function convertToCRC(amount, moneda, tipoCambio) {
  const value = Number(amount) || 0;
  if (moneda === monedas.usd) {
    return Math.round(value * (Number(tipoCambio) || 0));
  }
  return Math.round(value);
}

export function gananciaProducto(p) {
  const costoCRC = convertToCRC(p.costoCompra, p.monedaCosto, p.tipoCambioRegistro);
  const gastosAdicionalesCRC = convertToCRC(p.gastosAdicionales, p.monedaCosto, p.tipoCambioRegistro);
  const gastosImportacionCRC = Math.round(costoCRC * (Number(p.porcentajeImportacionChina) || 0) / 100);
  const gastosTotalCRC = gastosAdicionalesCRC + gastosImportacionCRC;
  const ventaCRC = Number(p.precio) || 0;
  return {
    costoCRC,
    gastosAdicionalesCRC,
    gastosImportacionCRC,
    gastosTotalCRC,
    ventaCRC,
    ganancia: ventaCRC - costoCRC - gastosTotalCRC,
  };
}

export function estadoVidaUtil(p, today = new Date()) {
  if (!p.fechaVidaUtil) return null;
  const dias = Math.round((p.fechaVidaUtil - today) / 86400000);
  if (dias < 0) return 'vencida';
  if (dias <= 30) return 'por_vencer';
  return 'vigente';
}

export function serieDuplicada(numeroSerie, excludeId, productos) {
  const value = (numeroSerie || '').trim().toLowerCase();
  if (!value) return false;
  return productos.some(p => p.id !== excludeId && (p.numeroSerie || '').trim().toLowerCase() === value);
}
