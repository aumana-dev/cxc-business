import {
  state,
  fmt,
  isoDays,
  diasMora,
  estadoFactura,
  clienteById,
  productoById,
  invoicePaymentLabel,
  gananciaProducto,
  estadoVidaUtil,
  monedas,
  convertToCRC,
  paymentTypes,
  today,
  toDateInputValue,
  parseDateInputValue,
} from './state.js';

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function exportHtmlTableToExcel(filename, htmlTable, sheetTitle = 'Reporte Ebizu') {
  const workbook = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHtml(sheetTitle)}</title><style>
    body { font-family: Calibri, Arial, sans-serif; }
    h2 { color: #14161A; font-size: 16pt; margin-bottom: 4px; }
    p { color: #666666; font-size: 10pt; margin-top: 0; margin-bottom: 14px; }
    table { border-collapse: collapse; width: 100%; font-size: 10.5pt; margin-bottom: 20px; }
    th { background: #1C1F25; color: #FFFFFF; font-weight: bold; border: 1px solid #333333; padding: 7px 10px; text-align: left; }
    td { border: 1px solid #D0D4DC; padding: 6px 9px; }
    .num { text-align: right; mso-number-format: "\\#\\,\\#\\#0"; }
    .curr { text-align: right; mso-number-format: "\\\"₡\\\"\\#\\,\\#\\#0"; }
    .pct { text-align: right; mso-number-format: "0\\.0%"; }
    .highlight { background: #F3F4F6; font-weight: bold; }
    .total-row { background: #E5E7EB; font-weight: bold; border-top: 2px solid #1C1F25; }
    .status-ok { color: #1E7E34; font-weight: bold; }
    .status-warn { color: #B45309; font-weight: bold; }
    .status-danger { color: #B91C1C; font-weight: bold; }
  </style></head><body>
    <h2>${escapeHtml(sheetTitle)}</h2>
    <p>Generado el ${new Date().toLocaleDateString('es-CR')} a las ${new Date().toLocaleTimeString('es-CR')} · Sistema Ebizu</p>
    ${htmlTable}
  </body></html>`;

  const blob = new Blob([`\ufeff${workbook}`], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

export function getDateRangeLimits(rangeType, customStart, customEnd) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (rangeType === 'hoy') {
    return { start, end };
  }
  if (rangeType === 'este_mes') {
    start.setDate(1);
    end.setMonth(end.getMonth() + 1, 0);
    return { start, end };
  }
  if (rangeType === 'mes_anterior') {
    start.setMonth(start.getMonth() - 1, 1);
    end.setDate(0);
    return { start, end };
  }
  if (rangeType === 'este_ano') {
    start.setMonth(0, 1);
    end.setMonth(11, 31);
    return { start, end };
  }
  if (rangeType === 'personalizado') {
    const s = customStart ? new Date(`${customStart}T00:00:00`) : new Date(2000, 0, 1);
    const e = customEnd ? new Date(`${customEnd}T23:59:59`) : new Date(2099, 11, 31);
    return { start: s, end: e };
  }
  // 'todo'
  return { start: new Date(2000, 0, 1), end: new Date(2099, 11, 31) };
}

export function filterFacturas(facturas, filterState) {
  const { start, end } = getDateRangeLimits(filterState.periodo, filterState.fechaDesde, filterState.fechaHasta);

  return facturas.filter(f => {
    // Fecha filtro por emision
    const fechaEmision = f.emision instanceof Date ? f.emision : new Date(f.emision);
    if (fechaEmision < start || fechaEmision > end) {
      return false;
    }
    // Cliente
    if (filterState.clienteId && filterState.clienteId !== 'todos' && f.clienteId !== filterState.clienteId) {
      return false;
    }
    // Tipo de pago
    if (filterState.tipoPago && filterState.tipoPago !== 'todos' && f.tipoPago !== filterState.tipoPago) {
      return false;
    }
    // Estado
    if (filterState.estado && filterState.estado !== 'todos') {
      if (filterState.estado === 'pendientes' && f.estadoPago !== 'pendiente') return false;
      if (filterState.estado === 'pagadas' && f.estadoPago !== 'pagado') return false;
      if (filterState.estado === 'vencidas' && (f.estadoPago === 'pagado' || estadoFactura(f) !== 'vencido')) return false;
      if (filterState.estado === 'al_dia' && (f.estadoPago === 'pagado' || estadoFactura(f) !== 'al_dia')) return false;
      if (filterState.estado === 'por_vencer' && (f.estadoPago === 'pagado' || estadoFactura(f) !== 'por_vencer')) return false;
    }
    return true;
  });
}

export function calculateExecutiveSummary(facturasFiltradas, allFacturas, filterState) {
  const { start, end } = getDateRangeLimits(filterState.periodo, filterState.fechaDesde, filterState.fechaHasta);

  const totalFacturado = facturasFiltradas.reduce((s, f) => s + (Number(f.montoOriginal || f.monto) || 0), 0);
  const facturasPendientes = facturasFiltradas.filter(f => f.estadoPago === 'pendiente');
  const saldoPendiente = facturasPendientes.reduce((s, f) => s + (Number(f.monto) || 0), 0);
  const facturasVencidas = facturasPendientes.filter(f => estadoFactura(f) === 'vencido');
  const saldoVencido = facturasVencidas.reduce((s, f) => s + (Number(f.monto) || 0), 0);
  const facturasPorVencer = facturasPendientes.filter(f => estadoFactura(f) === 'por_vencer');
  const saldoPorVencer = facturasPorVencer.reduce((s, f) => s + (Number(f.monto) || 0), 0);

  // Pagos dentro del periodo (considerando pagos individuales filtrados por fecha de pago)
  const todosLosPagos = allFacturas.flatMap(f => (f.pagos || []).map(p => ({
    ...p,
    facturaId: f.id,
    clienteId: f.clienteId,
    fechaObj: p.fecha instanceof Date ? p.fecha : new Date(p.fecha),
  }))).filter(p => {
    if (p.fechaObj < start || p.fechaObj > end) return false;
    if (filterState.clienteId && filterState.clienteId !== 'todos' && p.clienteId !== filterState.clienteId) return false;
    return true;
  });

  const totalCobrado = todosLosPagos.reduce((s, p) => s + (Number(p.monto) || 0), 0);

  // Rentabilidad estimada de facturas del periodo
  let totalCostoArticulos = 0;
  let totalGastosAdicionales = 0;
  let totalGastosImportacionChina = 0;

  facturasFiltradas.forEach(f => {
    const p = productoById(f.productoId);
    if (p) {
      const g = gananciaProducto(p);
      const qty = Number(f.cantidad) || 1;
      totalCostoArticulos += g.costoCRC * qty;
      totalGastosAdicionales += g.gastosAdicionalesCRC * qty;
      totalGastosImportacionChina += g.gastosImportacionCRC * qty;
    }
  });

  const totalGastosGenerales = totalGastosAdicionales + totalGastosImportacionChina;
  const gananciaNetaEstimada = totalFacturado - totalCostoArticulos - totalGastosGenerales;
  const margenGananciaPct = totalFacturado > 0 ? (gananciaNetaEstimada / totalFacturado) * 100 : 0;
  const efectividadCobroPct = (totalFacturado > 0) ? (totalCobrado / totalFacturado) * 100 : 0;
  const tasaMoraPct = (saldoPendiente > 0) ? (saldoVencido / saldoPendiente) * 100 : 0;

  // Valor de bodega total actual
  const valorInventarioVenta = state.productos.reduce((s, p) => s + (p.precio * p.stock), 0);
  const valorInventarioCosto = state.productos.reduce((s, p) => {
    const g = gananciaProducto(p);
    return s + (g.costoCRC * p.stock);
  }, 0);

  return {
    totalFacturado,
    totalFacturasCount: facturasFiltradas.length,
    totalCobrado,
    totalPagosCount: todosLosPagos.length,
    saldoPendiente,
    facturasPendientesCount: facturasPendientes.length,
    saldoVencido,
    facturasVencidasCount: facturasVencidas.length,
    saldoPorVencer,
    facturasPorVencerCount: facturasPorVencer.length,
    totalCostoArticulos,
    totalGastosAdicionales,
    totalGastosImportacionChina,
    totalGastosGenerales,
    gananciaNetaEstimada,
    margenGananciaPct,
    efectividadCobroPct,
    tasaMoraPct,
    valorInventarioVenta,
    valorInventarioCosto,
    pagosList: todosLosPagos,
  };
}

export function calculateAgingReport() {
  const facturasPendientes = state.facturas.filter(f => f.estadoPago === 'pendiente');

  const buckets = {
    corriente: { label: 'Al día (Corriente)', total: 0, count: 0, cls: 'status-ok' },
    dias1_30: { label: '1 a 30 días mora', total: 0, count: 0, cls: 'status-warn' },
    dias31_60: { label: '31 a 60 días mora', total: 0, count: 0, cls: 'status-warn' },
    dias61_90: { label: '61 a 90 días mora', total: 0, count: 0, cls: 'status-danger' },
    dias90plus: { label: '+90 días mora', total: 0, count: 0, cls: 'status-danger' },
  };

  const clientMap = {};

  state.clientes.forEach(c => {
    clientMap[c.id] = {
      cliente: c,
      corriente: 0,
      dias1_30: 0,
      dias31_60: 0,
      dias61_90: 0,
      dias90plus: 0,
      totalSaldo: 0,
      facturasCount: 0,
      maxMora: 0,
    };
  });

  facturasPendientes.forEach(f => {
    const monto = Number(f.monto) || 0;
    const dias = diasMora(f);
    const cId = f.clienteId;

    if (!clientMap[cId]) {
      clientMap[cId] = {
        cliente: { id: cId, nombre: 'Cliente no asignado', contacto: '' },
        corriente: 0,
        dias1_30: 0,
        dias31_60: 0,
        dias61_90: 0,
        dias90plus: 0,
        totalSaldo: 0,
        facturasCount: 0,
        maxMora: 0,
      };
    }

    const row = clientMap[cId];
    row.totalSaldo += monto;
    row.facturasCount += 1;
    if (dias > row.maxMora) row.maxMora = dias;

    if (dias === 0) {
      buckets.corriente.total += monto;
      buckets.corriente.count += 1;
      row.corriente += monto;
    } else if (dias <= 30) {
      buckets.dias1_30.total += monto;
      buckets.dias1_30.count += 1;
      row.dias1_30 += monto;
    } else if (dias <= 60) {
      buckets.dias31_60.total += monto;
      buckets.dias31_60.count += 1;
      row.dias31_60 += monto;
    } else if (dias <= 90) {
      buckets.dias61_90.total += monto;
      buckets.dias61_90.count += 1;
      row.dias61_90 += monto;
    } else {
      buckets.dias90plus.total += monto;
      buckets.dias90plus.count += 1;
      row.dias90plus += monto;
    }
  });

  const totalCartera = Object.values(buckets).reduce((s, b) => s + b.total, 0);

  const clientRows = Object.values(clientMap)
    .filter(r => r.totalSaldo > 0)
    .sort((a, b) => b.totalSaldo - a.totalSaldo)
    .map(r => {
      let riesgo = 'Bajo (Al día)';
      let riesgoCls = 'status-ok';
      if (r.dias90plus > 0 || r.dias61_90 > 0) {
        riesgo = 'Crítico (Alta mora)';
        riesgoCls = 'status-danger';
      } else if (r.dias31_60 > 0 || r.dias1_30 > 0) {
        riesgo = 'Medio (En seguimiento)';
        riesgoCls = 'status-warn';
      }
      const pctCartera = totalCartera > 0 ? (r.totalSaldo / totalCartera) * 100 : 0;
      return { ...r, riesgo, riesgoCls, pctCartera };
    });

  return { buckets, totalCartera, clientRows };
}

export function calculateInventoryIntelligence() {
  const rows = state.productos.map(p => {
    const ganancia = gananciaProducto(p);
    const vidaUtil = estadoVidaUtil(p, today);
    const diasRestantesVidaUtil = p.fechaVidaUtil ? isoDays(p.fechaVidaUtil) : null;

    // Calcular unidades vendidas históricas
    const facturasDelProducto = state.facturas.filter(f => f.productoId === p.id);
    const unidadesVendidas = facturasDelProducto.reduce((s, f) => s + (Number(f.cantidad) || 0), 0);
    const totalVendidoCRC = facturasDelProducto.reduce((s, f) => s + (Number(f.montoOriginal || f.monto) || 0), 0);

    const valorStockVenta = p.precio * p.stock;
    const valorStockCosto = ganancia.costoCRC * p.stock;
    const gananciaPotencialBodega = valorStockVenta - valorStockCosto - (ganancia.gastosTotalCRC * p.stock);
    const margenUnitarioPct = p.precio > 0 ? (ganancia.ganancia / p.precio) * 100 : 0;

    let stockStatus = 'En stock';
    let stockCls = 'status-ok';
    if (p.stock === 0) {
      stockStatus = 'Agotado';
      stockCls = 'status-danger';
    } else if (p.stock <= p.min) {
      stockStatus = 'Stock bajo';
      stockCls = 'status-warn';
    }

    return {
      producto: p,
      ganancia,
      vidaUtil,
      diasRestantesVidaUtil,
      unidadesVendidas,
      totalVendidoCRC,
      valorStockVenta,
      valorStockCosto,
      gananciaPotencialBodega,
      margenUnitarioPct,
      stockStatus,
      stockCls,
    };
  }).sort((a, b) => b.totalVendidoCRC - a.totalVendidoCRC);

  const totalStockUnidades = rows.reduce((s, r) => s + r.producto.stock, 0);
  const totalValorBodegaVenta = rows.reduce((s, r) => s + r.valorStockVenta, 0);
  const totalValorBodegaCosto = rows.reduce((s, r) => s + r.valorStockCosto, 0);
  const totalGananciaPotencial = rows.reduce((s, r) => s + r.gananciaPotencialBodega, 0);
  const maquinasConVidaUtil = rows.filter(r => r.producto.fechaVidaUtil);
  const maquinasVencidas = rows.filter(r => r.vidaUtil === 'vencida');
  const maquinasPorVencer = rows.filter(r => r.vidaUtil === 'por_vencer');

  return {
    rows,
    totalStockUnidades,
    totalValorBodegaVenta,
    totalValorBodegaCosto,
    totalGananciaPotencial,
    maquinasConVidaUtilCount: maquinasConVidaUtil.length,
    maquinasVencidasCount: maquinasVencidas.length,
    maquinasPorVencerCount: maquinasPorVencer.length,
  };
}

export function calculateClientAnalytics() {
  const rows = state.clientes.map(c => {
    const facturas = state.facturas.filter(f => f.clienteId === c.id);
    const totalCompras = facturas.reduce((s, f) => s + (Number(f.montoOriginal || f.monto) || 0), 0);
    const facturasPendientes = facturas.filter(f => f.estadoPago === 'pendiente');
    const saldoPendiente = facturasPendientes.reduce((s, f) => s + (Number(f.monto) || 0), 0);
    const totalPagado = facturas.reduce((s, f) => {
      return s + (f.pagos || []).reduce((ps, p) => ps + (Number(p.monto) || 0), 0);
    }, 0);
    const facturasVencidas = facturasPendientes.filter(f => estadoFactura(f) === 'vencido');
    const saldoVencido = facturasVencidas.reduce((s, f) => s + (Number(f.monto) || 0), 0);

    const cumplimientoPct = (totalCompras > 0) ? Math.min(100, Math.round((totalPagado / totalCompras) * 100)) : (saldoPendiente === 0 ? 100 : 0);

    let score = 'AAA Excelente';
    let scoreCls = 'status-ok';
    if (saldoVencido > 0 && cumplimientoPct < 50) {
      score = 'C - Moroso Crítico';
      scoreCls = 'status-danger';
    } else if (saldoVencido > 0 || cumplimientoPct < 75) {
      score = 'B - Riesgo Medio';
      scoreCls = 'status-warn';
    } else if (cumplimientoPct < 95 && saldoPendiente > 0) {
      score = 'AA - Buen Cliente';
      scoreCls = 'status-ok';
    }

    return {
      cliente: c,
      facturasCount: facturas.length,
      facturasPendientesCount: facturasPendientes.length,
      facturasVencidasCount: facturasVencidas.length,
      totalCompras,
      totalPagado,
      saldoPendiente,
      saldoVencido,
      cumplimientoPct,
      score,
      scoreCls,
    };
  }).sort((a, b) => b.totalCompras - a.totalCompras);

  return rows;
}

export function calculatePaymentAuditLog(filterState) {
  const { start, end } = getDateRangeLimits(filterState.periodo, filterState.fechaDesde, filterState.fechaHasta);

  const pagos = state.facturas.flatMap(f => (f.pagos || []).map(p => {
    const c = clienteById(f.clienteId);
    const pr = productoById(f.productoId);
    const fecha = p.fecha instanceof Date ? p.fecha : new Date(p.fecha);
    return {
      pagoId: p.id,
      facturaId: f.id,
      clienteNombre: c ? c.nombre : 'Cliente no asignado',
      clienteContacto: c ? c.contacto : '',
      productoNombre: pr ? pr.nombre : 'Producto',
      monto: Number(p.monto) || 0,
      fecha,
      nota: p.nota || 'Pago registrado',
      estadoFactura: f.estadoPago === 'pagado' ? 'Pagada / Cerrada' : 'Saldo pendiente',
      saldoActualFactura: Number(f.monto) || 0,
    };
  })).filter(p => {
    if (p.fecha < start || p.fecha > end) return false;
    return true;
  }).sort((a, b) => b.fecha - a.fecha);

  const totalCobradoAudit = pagos.reduce((s, p) => s + p.monto, 0);

  return { pagos, totalCobradoAudit };
}

export function initReportsUI({ query, state }) {
  let activeSubTab = 'resumen';
  let filterState = {
    periodo: 'todo',
    fechaDesde: '',
    fechaHasta: '',
    clienteId: 'todos',
    tipoPago: 'todos',
    estado: 'todos',
  };

  function updateFilterControls() {
    const isCustom = filterState.periodo === 'personalizado';
    const customDatesWrap = query('reportCustomDatesWrap');
    if (customDatesWrap) {
      customDatesWrap.style.display = isCustom ? 'flex' : 'none';
    }

    const selectCliente = query('repFilterCliente');
    if (selectCliente && selectCliente.options.length <= 1) {
      selectCliente.innerHTML = '<option value="todos">Todos los clientes</option>' +
        state.clientes.map(c => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
    }
  }

  function renderReportContent() {
    updateFilterControls();
    const facturasFiltradas = filterFacturas(state.facturas, filterState);
    const exec = calculateExecutiveSummary(facturasFiltradas, state.facturas, filterState);
    const aging = calculateAgingReport();
    const invIntel = calculateInventoryIntelligence();
    const clientAnalytics = calculateClientAnalytics();
    const auditLog = calculatePaymentAuditLog(filterState);

    // Update subtab buttons
    document.querySelectorAll('.report-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === activeSubTab);
    });

    const container = query('reportContentArea');
    if (!container) return;

    if (activeSubTab === 'resumen') {
      container.innerHTML = `
        <div class="kpi-row report-kpi-grid">
          <div class="kpi">
            <div class="kpi-label">Ventas Facturadas</div>
            <div class="kpi-value mono">${fmt(exec.totalFacturado)}</div>
            <div class="kpi-meta">${exec.totalFacturasCount} factura${exec.totalFacturasCount === 1 ? '' : 's'} en período</div>
          </div>
          <div class="kpi ok">
            <div class="kpi-label">Total Recaudado (Cobranza)</div>
            <div class="kpi-value mono">${fmt(exec.totalCobrado)}</div>
            <div class="kpi-meta">${exec.totalPagosCount} pago${exec.totalPagosCount === 1 ? '' : 's'} registrado${exec.totalPagosCount === 1 ? '' : 's'}</div>
          </div>
          <div class="kpi warn">
            <div class="kpi-label">Saldo por Cobrar</div>
            <div class="kpi-value mono">${fmt(exec.saldoPendiente)}</div>
            <div class="kpi-meta">${exec.facturasPendientesCount} factura${exec.facturasPendientesCount === 1 ? '' : 's'} pendiente${exec.facturasPendientesCount === 1 ? '' : 's'}</div>
          </div>
          <div class="kpi danger">
            <div class="kpi-label">Cartera Vencida (Mora)</div>
            <div class="kpi-value mono">${fmt(exec.saldoVencido)}</div>
            <div class="kpi-meta">${exec.tasaMoraPct.toFixed(1)}% de la cartera en mora</div>
          </div>
          <div class="kpi ${exec.gananciaNetaEstimada >= 0 ? 'ok' : 'danger'}">
            <div class="kpi-label">Ganancia Real Estimada</div>
            <div class="kpi-value mono">${fmt(exec.gananciaNetaEstimada)}</div>
            <div class="kpi-meta">Margen estimado: ${exec.margenGananciaPct.toFixed(1)}%</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Valor en Bodega (Venta / Costo)</div>
            <div class="kpi-value mono">${fmt(exec.valorInventarioVenta)}</div>
            <div class="kpi-meta">Costo reposición: ${fmt(exec.valorInventarioCosto)}</div>
          </div>
        </div>

        <div class="report-two-col">
          <div class="report-box">
            <h3 class="report-box-title">Desglose Financiero &amp; Costos de Importación</h3>
            <div class="report-cost-breakdown">
              <div class="cost-row">
                <span>Ventas Brutas Totales:</span>
                <strong class="mono">${fmt(exec.totalFacturado)}</strong>
              </div>
              <div class="cost-row">
                <span>(-) Costo de Mercadería Vendida (Compra real):</span>
                <span class="mono" style="color:var(--danger-bright)">-${fmt(exec.totalCostoArticulos)}</span>
              </div>
              <div class="cost-row">
                <span>(-) Gastos de Importación China (% arancel/flete):</span>
                <span class="mono" style="color:var(--warn)">-${fmt(exec.totalGastosImportacionChina)}</span>
              </div>
              <div class="cost-row">
                <span>(-) Gastos Adicionales / Logísticos:</span>
                <span class="mono" style="color:var(--warn)">-${fmt(exec.totalGastosAdicionales)}</span>
              </div>
              <div class="cost-row total">
                <span>(=) Ganancia Neta Real Estimada:</span>
                <strong class="mono" style="color:${exec.gananciaNetaEstimada >= 0 ? 'var(--ok)' : 'var(--danger-bright)'}">${fmt(exec.gananciaNetaEstimada)}</strong>
              </div>
            </div>
          </div>

          <div class="report-box">
            <h3 class="report-box-title">Eficiencia de Cobranza &amp; Salud de Cartera</h3>
            <div class="report-gauge-list">
              <div class="gauge-item">
                <div class="gauge-label">
                  <span>Tasa de Cobro sobre Ventas</span>
                  <span class="mono font-bold">${exec.efectividadCobroPct.toFixed(1)}%</span>
                </div>
                <div class="inv-bar-track">
                  <div class="inv-bar-fill" style="width:${Math.min(100, exec.efectividadCobroPct)}%; background:var(--ok);"></div>
                </div>
              </div>
              <div class="gauge-item" style="margin-top:14px;">
                <div class="gauge-label">
                  <span>Índice de Cartera Vencida (Riesgo)</span>
                  <span class="mono font-bold" style="color:${exec.tasaMoraPct > 25 ? 'var(--danger-bright)' : 'var(--warn)'}">${exec.tasaMoraPct.toFixed(1)}%</span>
                </div>
                <div class="inv-bar-track">
                  <div class="inv-bar-fill" style="width:${Math.min(100, exec.tasaMoraPct)}%; background:${exec.tasaMoraPct > 25 ? 'var(--danger-bright)' : 'var(--warn)'};"></div>
                </div>
              </div>
              <div class="gauge-summary" style="margin-top:16px; font-size:12.5px; color:var(--bone-dim); line-height:1.5;">
                Actualmente hay <strong>${exec.facturasVencidasCount}</strong> facturas vencidas por un monto de <strong style="color:var(--danger-bright)">${fmt(exec.saldoVencido)}</strong> y <strong>${exec.facturasPorVencerCount}</strong> facturas por vencer en los próximos 7 días (<strong style="color:var(--warn)">${fmt(exec.saldoPorVencer)}</strong>).
              </div>
            </div>
          </div>
        </div>

        <div class="section" style="margin-top:20px;">
          <div class="section-head">
            <h2><span class="dash"></span>Detalle de Facturas del Período (${facturasFiltradas.length})</h2>
          </div>
          <div class="report-table-wrap">
            ${facturasFiltradas.length === 0 ? '<div class="empty-state"><div class="dash"></div><h3>Sin facturas en este rango</h3><p>Modificá los filtros de período o cliente.</p></div>' : `
            <table>
              <thead>
                <tr>
                  <th>Factura</th>
                  <th>Cliente</th>
                  <th>Producto</th>
                  <th>Cant.</th>
                  <th>Tipo</th>
                  <th>Monto Original</th>
                  <th>Saldo Pendiente</th>
                  <th>Emisión</th>
                  <th>Vencimiento</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                ${facturasFiltradas.map(f => {
                  const c = clienteById(f.clienteId);
                  const p = productoById(f.productoId);
                  const estado = estadoFactura(f);
                  return `<tr>
                    <td class="mono font-bold">${escapeHtml(f.id)}</td>
                    <td>${escapeHtml(c ? c.nombre : '—')}</td>
                    <td>${escapeHtml(p ? p.nombre : '—')}</td>
                    <td class="mono">${f.cantidad}</td>
                    <td>${invoicePaymentLabel(f.tipoPago)}</td>
                    <td class="mono amount">${fmt(f.montoOriginal || f.monto)}</td>
                    <td class="mono amount" style="color:${f.monto > 0 ? 'var(--rust-bright)' : 'var(--ok)'}">${fmt(f.monto)}</td>
                    <td class="mono">${f.emision instanceof Date ? f.emision.toLocaleDateString('es-CR') : new Date(f.emision).toLocaleDateString('es-CR')}</td>
                    <td class="mono">${f.vencimiento instanceof Date ? f.vencimiento.toLocaleDateString('es-CR') : new Date(f.vencimiento).toLocaleDateString('es-CR')}</td>
                    <td><span class="status-pill status-${estado === 'al_dia' || estado === 'pagado' ? 'ok' : (estado === 'por_vencer' ? 'warn' : 'danger')}"><span class="dot"></span>${estado === 'pagado' ? 'Pagada' : (estado === 'por_vencer' ? 'Por vencer' : (estado === 'vencido' ? 'Vencida' : 'Al día'))}</span></td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
            `}
          </div>
        </div>
      `;
    } else if (activeSubTab === 'aging') {
      const buckets = aging.buckets;
      container.innerHTML = `
        <div class="report-aging-overview">
          <div class="aging-card ok">
            <div class="aging-title">Al día (Corriente)</div>
            <div class="aging-amount mono">${fmt(buckets.corriente.total)}</div>
            <div class="aging-count">${buckets.corriente.count} facturas</div>
          </div>
          <div class="aging-card warn">
            <div class="aging-title">1 a 30 días</div>
            <div class="aging-amount mono">${fmt(buckets.dias1_30.total)}</div>
            <div class="aging-count">${buckets.dias1_30.count} facturas</div>
          </div>
          <div class="aging-card warn-dark">
            <div class="aging-title">31 a 60 días</div>
            <div class="aging-amount mono">${fmt(buckets.dias31_60.total)}</div>
            <div class="aging-count">${buckets.dias31_60.count} facturas</div>
          </div>
          <div class="aging-card danger">
            <div class="aging-title">61 a 90 días</div>
            <div class="aging-amount mono">${fmt(buckets.dias61_90.total)}</div>
            <div class="aging-count">${buckets.dias61_90.count} facturas</div>
          </div>
          <div class="aging-card danger-dark">
            <div class="aging-title">+90 días (Crítico)</div>
            <div class="aging-amount mono">${fmt(buckets.dias90plus.total)}</div>
            <div class="aging-count">${buckets.dias90plus.count} facturas</div>
          </div>
        </div>

        <div class="section" style="margin-top:24px;">
          <div class="section-head">
            <h2><span class="dash"></span>Matriz de Antigüedad de Saldos por Cliente (Cartera Total: ${fmt(aging.totalCartera)})</h2>
          </div>
          <div class="report-table-wrap">
            ${aging.clientRows.length === 0 ? '<div class="empty-state"><div class="dash"></div><h3>No hay cuentas por cobrar activas</h3><p>Todas las facturas están al día o canceladas.</p></div>' : `
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Contacto</th>
                  <th style="text-align:right;">Al día</th>
                  <th style="text-align:right;">1-30 días</th>
                  <th style="text-align:right;">31-60 días</th>
                  <th style="text-align:right;">61-90 días</th>
                  <th style="text-align:right;">+90 días</th>
                  <th style="text-align:right;">Saldo Total</th>
                  <th style="text-align:right;">% Cartera</th>
                  <th>Nivel de Riesgo</th>
                </tr>
              </thead>
              <tbody>
                ${aging.clientRows.map(r => `
                  <tr>
                    <td class="client-name font-bold">${escapeHtml(r.cliente.nombre)}</td>
                    <td class="mono">${escapeHtml(r.cliente.contacto || '—')}</td>
                    <td class="mono amount" style="color:${r.corriente > 0 ? 'var(--ok)' : 'var(--bone-dim)'}">${fmt(r.corriente)}</td>
                    <td class="mono amount" style="color:${r.dias1_30 > 0 ? 'var(--warn)' : 'var(--bone-dim)'}">${fmt(r.dias1_30)}</td>
                    <td class="mono amount" style="color:${r.dias31_60 > 0 ? 'var(--warn)' : 'var(--bone-dim)'}">${fmt(r.dias31_60)}</td>
                    <td class="mono amount" style="color:${r.dias61_90 > 0 ? 'var(--danger-bright)' : 'var(--bone-dim)'}">${fmt(r.dias61_90)}</td>
                    <td class="mono amount" style="color:${r.dias90plus > 0 ? 'var(--danger-bright)' : 'var(--bone-dim)'}; font-weight:bold;">${fmt(r.dias90plus)}</td>
                    <td class="mono amount font-bold" style="color:var(--rust-bright);">${fmt(r.totalSaldo)}</td>
                    <td class="mono" style="text-align:right;">${r.pctCartera.toFixed(1)}%</td>
                    <td><span class="${r.riesgoCls}">${r.riesgo}</span></td>
                  </tr>
                `).join('')}
                <tr class="total-row" style="background:var(--surface-2); font-weight:bold;">
                  <td colspan="2">TOTAL CARTERA:</td>
                  <td class="mono amount" style="color:var(--ok);">${fmt(buckets.corriente.total)}</td>
                  <td class="mono amount" style="color:var(--warn);">${fmt(buckets.dias1_30.total)}</td>
                  <td class="mono amount" style="color:var(--warn);">${fmt(buckets.dias31_60.total)}</td>
                  <td class="mono amount" style="color:var(--danger-bright);">${fmt(buckets.dias61_90.total)}</td>
                  <td class="mono amount" style="color:var(--danger-bright);">${fmt(buckets.dias90plus.total)}</td>
                  <td class="mono amount" style="color:var(--rust-bright);">${fmt(aging.totalCartera)}</td>
                  <td class="mono" style="text-align:right;">100.0%</td>
                  <td>—</td>
                </tr>
              </tbody>
            </table>
            `}
          </div>
        </div>
      `;
    } else if (activeSubTab === 'inventario') {
      container.innerHTML = `
        <div class="kpi-row">
          <div class="kpi">
            <div class="kpi-label">Valor Venta Bodega</div>
            <div class="kpi-value mono">${fmt(invIntel.totalValorBodegaVenta)}</div>
            <div class="kpi-meta">${invIntel.totalStockUnidades} unidades en bodega</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Costo Reposición Bodega</div>
            <div class="kpi-value mono">${fmt(invIntel.totalValorBodegaCosto)}</div>
            <div class="kpi-meta">Costo real de compra</div>
          </div>
          <div class="kpi ok">
            <div class="kpi-label">Ganancia Potencial en Bodega</div>
            <div class="kpi-value mono">${fmt(invIntel.totalGananciaPotencial)}</div>
            <div class="kpi-meta">Margen neto de stock actual</div>
          </div>
          <div class="kpi ${invIntel.maquinasVencidasCount > 0 ? 'danger' : (invIntel.maquinasPorVencerCount > 0 ? 'warn' : 'ok')}">
            <div class="kpi-label">Alertas de Vida Útil</div>
            <div class="kpi-value mono">${invIntel.maquinasVencidasCount + invIntel.maquinasPorVencerCount}</div>
            <div class="kpi-meta">${invIntel.maquinasVencidasCount} vencida${invIntel.maquinasVencidasCount === 1 ? '' : 's'} · ${invIntel.maquinasPorVencerCount} por vencer</div>
          </div>
        </div>

        <div class="section" style="margin-top:20px;">
          <div class="section-head">
            <h2><span class="dash"></span>Inteligencia de Producto, Rentabilidad &amp; Vida Útil</h2>
          </div>
          <div class="report-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Producto &amp; S/N</th>
                  <th>SKU</th>
                  <th style="text-align:right;">Precio Venta</th>
                  <th style="text-align:right;">Costo Compra</th>
                  <th style="text-align:right;">Imp. China</th>
                  <th style="text-align:right;">Gastos Adic.</th>
                  <th style="text-align:right;">Ganancia Unit.</th>
                  <th style="text-align:right;">Margen %</th>
                  <th style="text-align:center;">Stock</th>
                  <th style="text-align:center;">Vendidos</th>
                  <th style="text-align:right;">Total Ventas</th>
                  <th>Vida Útil</th>
                </tr>
              </thead>
              <tbody>
                ${invIntel.rows.map(r => {
                  const p = r.producto;
                  const g = r.ganancia;
                  const vidaUtilBadge = r.vidaUtil === 'vencida'
                    ? '<span class="status-pill status-danger"><span class="dot"></span>Vencida</span>'
                    : (r.vidaUtil === 'por_vencer' ? `<span class="status-pill status-warn"><span class="dot"></span>${r.diasRestantesVidaUtil}d restantes</span>` : (p.fechaVidaUtil ? '<span class="status-pill status-ok"><span class="dot"></span>Vigente</span>' : '—'));

                  return `<tr>
                    <td>
                      <div class="font-bold">${escapeHtml(p.nombre)}</div>
                      <div class="client-sub">${p.numeroSerie ? 'S/N: ' + escapeHtml(p.numeroSerie) : 'Sin serie'}</div>
                    </td>
                    <td class="mono">${escapeHtml(p.sku)}</td>
                    <td class="mono amount">${fmt(p.precio)}</td>
                    <td class="mono amount">${fmt(g.costoCRC)}<div class="client-sub">${p.monedaCosto === 'USD' ? `$${p.costoCompra} (TC ${p.tipoCambioRegistro})` : ''}</div></td>
                    <td class="mono" style="text-align:right;">${p.porcentajeImportacionChina}%<div class="client-sub">${fmt(g.gastosImportacionCRC)}</div></td>
                    <td class="mono amount">${fmt(g.gastosAdicionalesCRC)}</td>
                    <td class="mono amount font-bold" style="color:${g.ganancia >= 0 ? 'var(--ok)' : 'var(--danger-bright)'}">${fmt(g.ganancia)}</td>
                    <td class="mono" style="text-align:right; color:${r.margenUnitarioPct >= 0 ? 'var(--ok)' : 'var(--danger-bright)'}">${r.margenUnitarioPct.toFixed(1)}%</td>
                    <td class="mono" style="text-align:center;"><span class="inv-stock-badge ${r.stockCls === 'status-ok' ? 'stock-ok' : (r.stockCls === 'status-warn' ? 'stock-low' : 'stock-out')}">${p.stock}</span></td>
                    <td class="mono font-bold" style="text-align:center;">${r.unidadesVendidas}</td>
                    <td class="mono amount font-bold">${fmt(r.totalVendidoCRC)}</td>
                    <td>${vidaUtilBadge}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else if (activeSubTab === 'clientes') {
      container.innerHTML = `
        <div class="section">
          <div class="section-head">
            <h2><span class="dash"></span>Ranking &amp; Score de Riesgo de Clientes</h2>
          </div>
          <div class="report-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Contacto</th>
                  <th style="text-align:center;">Facturas Totales</th>
                  <th style="text-align:right;">Total Compras</th>
                  <th style="text-align:right;">Total Pagado</th>
                  <th style="text-align:right;">Saldo Pendiente</th>
                  <th style="text-align:right;">Saldo en Mora</th>
                  <th style="text-align:center;">% Cumplimiento</th>
                  <th>Score Crediticio</th>
                </tr>
              </thead>
              <tbody>
                ${clientAnalytics.map(r => `
                  <tr>
                    <td class="client-name font-bold">${escapeHtml(r.cliente.nombre)}</td>
                    <td class="mono">${escapeHtml(r.cliente.contacto || '—')}</td>
                    <td class="mono" style="text-align:center;">${r.facturasCount}</td>
                    <td class="mono amount font-bold">${fmt(r.totalCompras)}</td>
                    <td class="mono amount" style="color:var(--ok);">${fmt(r.totalPagado)}</td>
                    <td class="mono amount" style="color:${r.saldoPendiente > 0 ? 'var(--rust-bright)' : 'var(--bone-dim)'}; font-weight:bold;">${fmt(r.saldoPendiente)}</td>
                    <td class="mono amount" style="color:${r.saldoVencido > 0 ? 'var(--danger-bright)' : 'var(--bone-dim)'};">${fmt(r.saldoVencido)}</td>
                    <td class="mono" style="text-align:center;">
                      <div style="display:flex; align-items:center; justify-content:center; gap:6px;">
                        <span>${r.cumplimientoPct}%</span>
                        <div class="inv-bar-track" style="width:50px; height:6px;">
                          <div class="inv-bar-fill" style="width:${r.cumplimientoPct}%; background:${r.cumplimientoPct > 70 ? 'var(--ok)' : (r.cumplimientoPct > 40 ? 'var(--warn)' : 'var(--danger-bright)')};"></div>
                        </div>
                      </div>
                    </td>
                    <td><span class="${r.scoreCls}">${r.score}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else if (activeSubTab === 'pagos') {
      container.innerHTML = `
        <div class="kpi-row">
          <div class="kpi ok">
            <div class="kpi-label">Total Recaudado en Período</div>
            <div class="kpi-value mono">${fmt(auditLog.totalCobradoAudit)}</div>
            <div class="kpi-meta">${auditLog.pagos.length} transacciones de cobro</div>
          </div>
        </div>

        <div class="section" style="margin-top:20px;">
          <div class="section-head">
            <h2><span class="dash"></span>Libro Diario de Pagos / Auditoría de Cobranza (${auditLog.pagos.length})</h2>
          </div>
          <div class="report-table-wrap">
            ${auditLog.pagos.length === 0 ? '<div class="empty-state"><div class="dash"></div><h3>Sin pagos registrados en este período</h3><p>Ajustá las fechas del filtro superior.</p></div>' : `
            <table>
              <thead>
                <tr>
                  <th>Fecha de Pago</th>
                  <th>Factura ID</th>
                  <th>Cliente</th>
                  <th>Producto</th>
                  <th style="text-align:right;">Monto Recibido</th>
                  <th>Nota / Movimiento</th>
                  <th>Estado Factura</th>
                </tr>
              </thead>
              <tbody>
                ${auditLog.pagos.map(p => `
                  <tr>
                    <td class="mono">${p.fecha.toLocaleDateString('es-CR')}</td>
                    <td class="mono font-bold">${escapeHtml(p.facturaId)}</td>
                    <td class="font-bold">${escapeHtml(p.clienteNombre)}</td>
                    <td>${escapeHtml(p.productoNombre)}</td>
                    <td class="mono amount font-bold" style="color:var(--ok);">${fmt(p.monto)}</td>
                    <td style="color:var(--bone-dim);">${escapeHtml(p.nota)}</td>
                    <td><span class="status-pill status-${p.estadoFactura.includes('Pagada') ? 'ok' : 'warn'}"><span class="dot"></span>${escapeHtml(p.estadoFactura)}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            `}
          </div>
        </div>
      `;
    }
  }

  function exportCurrentReportView() {
    const tableWrap = query('reportContentArea');
    if (!tableWrap) return;
    const table = tableWrap.querySelector('table');
    if (!table) {
      alert('No hay una tabla de datos disponible en la vista actual para exportar.');
      return;
    }
    const filename = `ebizu_reporte_${activeSubTab}_${toDateInputValue(new Date())}.xls`;
    exportHtmlTableToExcel(filename, table.outerHTML, `Reporte Ebizu - ${activeSubTab.toUpperCase()}`);
  }

  function exportMasterReport() {
    const facturasFiltradas = filterFacturas(state.facturas, filterState);
    const exec = calculateExecutiveSummary(facturasFiltradas, state.facturas, filterState);
    const aging = calculateAgingReport();
    const invIntel = calculateInventoryIntelligence();
    const clientAnalytics = calculateClientAnalytics();
    const auditLog = calculatePaymentAuditLog(filterState);

    const masterHtml = `
      <h3>1. RESUMEN EJECUTIVO</h3>
      <table>
        <tr><th>Métrica</th><th>Valor</th></tr>
        <tr><td>Total Ventas Facturadas</td><td class="curr">${exec.totalFacturado}</td></tr>
        <tr><td>Total Recaudado (Cobranza)</td><td class="curr">${exec.totalCobrado}</td></tr>
        <tr><td>Saldo Total por Cobrar</td><td class="curr">${exec.saldoPendiente}</td></tr>
        <tr><td>Cartera Vencida (Mora)</td><td class="curr">${exec.saldoVencido}</td></tr>
        <tr><td>Costo de Mercadería Vendida</td><td class="curr">${exec.totalCostoArticulos}</td></tr>
        <tr><td>Gastos Importación China</td><td class="curr">${exec.totalGastosImportacionChina}</td></tr>
        <tr><td>Gastos Adicionales</td><td class="curr">${exec.totalGastosAdicionales}</td></tr>
        <tr><td>Ganancia Neta Real Estimada</td><td class="curr">${exec.gananciaNetaEstimada}</td></tr>
        <tr><td>Margen de Ganancia Promedio</td><td class="pct">${(exec.margenGananciaPct / 100).toFixed(3)}</td></tr>
        <tr><td>Tasa de Cobro sobre Ventas</td><td class="pct">${(exec.efectividadCobroPct / 100).toFixed(3)}</td></tr>
      </table>

      <h3>2. MATRIZ DE ANTIGÜEDAD DE SALDOS (AGING)</h3>
      <table>
        <tr><th>Cliente</th><th>Al Día</th><th>1-30d</th><th>31-60d</th><th>61-90d</th><th>+90d</th><th>Total Saldo</th><th>Nivel de Riesgo</th></tr>
        ${aging.clientRows.map(r => `
          <tr>
            <td>${escapeHtml(r.cliente.nombre)}</td>
            <td class="curr">${r.corriente}</td>
            <td class="curr">${r.dias1_30}</td>
            <td class="curr">${r.dias31_60}</td>
            <td class="curr">${r.dias61_90}</td>
            <td class="curr">${r.dias90plus}</td>
            <td class="curr">${r.totalSaldo}</td>
            <td>${r.riesgo}</td>
          </tr>
        `).join('')}
      </table>

      <h3>3. INVENTARIO, RENTABILIDAD &amp; VIDA ÚTIL</h3>
      <table>
        <tr><th>Producto</th><th>SKU</th><th>S/N</th><th>Precio Venta</th><th>Costo Compra</th><th>% China</th><th>Ganancia Unit.</th><th>Stock</th><th>Vendidos</th><th>Total Ventas</th><th>Vida Útil</th></tr>
        ${invIntel.rows.map(r => `
          <tr>
            <td>${escapeHtml(r.producto.nombre)}</td>
            <td>${escapeHtml(r.producto.sku)}</td>
            <td>${escapeHtml(r.producto.numeroSerie || '')}</td>
            <td class="curr">${r.producto.precio}</td>
            <td class="curr">${r.ganancia.costoCRC}</td>
            <td class="num">${r.producto.porcentajeImportacionChina}</td>
            <td class="curr">${r.ganancia.ganancia}</td>
            <td class="num">${r.producto.stock}</td>
            <td class="num">${r.unidadesVendidas}</td>
            <td class="curr">${r.totalVendidoCRC}</td>
            <td>${r.vidaUtil || 'N/A'}</td>
          </tr>
        `).join('')}
      </table>

      <h3>4. INTELIGENCIA DE CLIENTES</h3>
      <table>
        <tr><th>Cliente</th><th>Contacto</th><th>Facturas</th><th>Total Compras</th><th>Total Pagado</th><th>Saldo Pendiente</th><th>Saldo Vencido</th><th>% Cumplimiento</th><th>Score</th></tr>
        ${clientAnalytics.map(r => `
          <tr>
            <td>${escapeHtml(r.cliente.nombre)}</td>
            <td>${escapeHtml(r.cliente.contacto || '')}</td>
            <td class="num">${r.facturasCount}</td>
            <td class="curr">${r.totalCompras}</td>
            <td class="curr">${r.totalPagado}</td>
            <td class="curr">${r.saldoPendiente}</td>
            <td class="curr">${r.saldoVencido}</td>
            <td class="pct">${(r.cumplimientoPct / 100).toFixed(2)}</td>
            <td>${r.score}</td>
          </tr>
        `).join('')}
      </table>

      <h3>5. LIBRO DIARIO DE PAGOS</h3>
      <table>
        <tr><th>Fecha</th><th>Factura ID</th><th>Cliente</th><th>Producto</th><th>Monto</th><th>Nota</th></tr>
        ${auditLog.pagos.map(p => `
          <tr>
            <td>${p.fecha.toLocaleDateString('es-CR')}</td>
            <td>${escapeHtml(p.facturaId)}</td>
            <td>${escapeHtml(p.clienteNombre)}</td>
            <td>${escapeHtml(p.productoNombre)}</td>
            <td class="curr">${p.monto}</td>
            <td>${escapeHtml(p.nota)}</td>
          </tr>
        `).join('')}
      </table>
    `;

    const filename = `ebizu_reporte_consolidado_maestro_${toDateInputValue(new Date())}.xls`;
    exportHtmlTableToExcel(filename, masterHtml, 'Reporte Consolidado Maestro - Ebizu');
  }

  function setupReportsEventListeners() {
    document.querySelectorAll('.report-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeSubTab = btn.dataset.tab;
        renderReportContent();
      });
    });

    const repPeriodo = query('repFilterPeriodo');
    if (repPeriodo) {
      repPeriodo.addEventListener('change', (e) => {
        filterState.periodo = e.target.value;
        renderReportContent();
      });
    }

    const repDesde = query('repFechaDesde');
    if (repDesde) {
      repDesde.addEventListener('change', (e) => {
        filterState.fechaDesde = e.target.value;
        renderReportContent();
      });
    }

    const repHasta = query('repFechaHasta');
    if (repHasta) {
      repHasta.addEventListener('change', (e) => {
        filterState.fechaHasta = e.target.value;
        renderReportContent();
      });
    }

    const repCliente = query('repFilterCliente');
    if (repCliente) {
      repCliente.addEventListener('change', (e) => {
        filterState.clienteId = e.target.value;
        renderReportContent();
      });
    }

    const repTipoPago = query('repFilterTipoPago');
    if (repTipoPago) {
      repTipoPago.addEventListener('change', (e) => {
        filterState.tipoPago = e.target.value;
        renderReportContent();
      });
    }

    const repEstado = query('repFilterEstado');
    if (repEstado) {
      repEstado.addEventListener('change', (e) => {
        filterState.estado = e.target.value;
        renderReportContent();
      });
    }

    const btnExportView = query('btnExportReportView');
    if (btnExportView) {
      btnExportView.addEventListener('click', exportCurrentReportView);
    }

    const btnExportMaster = query('btnExportMasterReport');
    if (btnExportMaster) {
      btnExportMaster.addEventListener('click', exportMasterReport);
    }

    const btnPrint = query('btnPrintReport');
    if (btnPrint) {
      btnPrint.addEventListener('click', () => {
        window.print();
      });
    }
  }

  setupReportsEventListeners();

  return {
    render: renderReportContent,
    exportView: exportCurrentReportView,
    exportMaster: exportMasterReport,
  };
}

