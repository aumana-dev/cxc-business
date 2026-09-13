import {
  state,
  today,
  fmt,
  toDateInputValue,
  parseDateInputValue,
  invoicePaymentLabel,
  paymentTypes,
  daysFromNowLocal,
  clienteById,
  productoById,
  estadoFactura,
  diasMora,
  isoDays,
  saveState,
  createFactura,
  registrarPago,
  AUTH_KEY,
  findPortalUserByUsername,
  revocarAccesoPortalCliente,
  ADMIN_USERNAME,
  ADMIN_PASSWORD_HASH,
  convertToCRC,
  gananciaProducto,
  estadoVidaUtil,
  serieDuplicada,
} from './state.js';
import { createInvoiceForm } from './invoice-form.js';
import { initReportsUI } from './reports.js';
import { sha256 } from './domain.js';

function query(id) {
  return document.getElementById(id);
}

function getStoredAuth() {
  try {
    return sessionStorage.getItem(AUTH_KEY);
  } catch (e) {
    return null;
  }
}

function setStoredAuth(value) {
  try {
    sessionStorage.setItem(AUTH_KEY, value);
  } catch (e) {
    // ignore storage issues
  }
}

function clearStoredAuth() {
  try {
    sessionStorage.removeItem(AUTH_KEY);
  } catch (e) {
    // ignore storage issues
  }
}

function syncMonedaProducto() {
  const necesitaTipoCambio = query('ipMonedaVenta').value === 'USD' || query('ipMonedaCosto').value === 'USD';
  query('ipTipoCambioWrap').style.display = necesitaTipoCambio ? 'block' : 'none';
}

function getFacturaPagos(factura) {
  return Array.isArray(factura && factura.pagos) ? factura.pagos : [];
}

function getFacturaPagadoTotal(factura) {
  return getFacturaPagos(factura).reduce((sum, pago) => sum + (Number(pago.monto) || 0), 0);
}

function renderKpisCxc() {
  const pendientes = state.facturas.filter(f => f.estadoPago === 'pendiente');
  const total = pendientes.reduce((s, f) => s + (Number(f.monto) || 0), 0);
  const vencidas = pendientes.filter(f => estadoFactura(f) === 'vencido');
  const vencidoMonto = vencidas.reduce((s, f) => s + (Number(f.monto) || 0), 0);
  const porVencer = pendientes.filter(f => estadoFactura(f) === 'por_vencer');
  const porVencerMonto = porVencer.reduce((s, f) => s + (Number(f.monto) || 0), 0);

  const cobradoMes = state.facturas.filter(f => (f.pagos || []).some(p => p.fecha &&
    p.fecha.getMonth() === new Date().getMonth() && p.fecha.getFullYear() === new Date().getFullYear()));
  const cobradoMonto = cobradoMes.reduce((s, f) => s + getFacturaPagadoTotal(f), 0);

  query('kpiTotal').textContent = fmt(total);
  query('kpiTotalMeta').textContent = `${pendientes.length} factura${pendientes.length === 1 ? '' : 's'} activa${pendientes.length === 1 ? '' : 's'}`;

  query('kpiVencido').textContent = fmt(vencidoMonto);
  query('kpiVencidoMeta').textContent = `${vencidas.length} factura${vencidas.length === 1 ? '' : 's'} en mora`;
  query('kpiVencidoBar').style.width = total > 0 ? `${Math.round((vencidoMonto / total) * 100)}%` : '0%';

  query('kpiProx').textContent = fmt(porVencerMonto);
  query('kpiProxMeta').textContent = `${porVencer.length} factura${porVencer.length === 1 ? '' : 's'} por vencer`;

  query('kpiCobrado').textContent = fmt(cobradoMonto);
  query('kpiCobradoMeta').textContent = `${cobradoMes.length} pago${cobradoMes.length === 1 ? '' : 's'} registrado${cobradoMes.length === 1 ? '' : 's'}`;
  query('navTagVencidas').textContent = vencidas.length;
  query('navTagVencidas').style.display = vencidas.length > 0 ? 'inline-flex' : 'none';
}

function statusPillHtml(estado) {
  const map = {
    al_dia: { cls: 'status-ok', label: 'Al día' },
    por_vencer: { cls: 'status-warn', label: 'Por vencer' },
    vencido: { cls: 'status-danger', label: 'Vencido' },
    pagado: { cls: 'status-ok', label: 'Pagado' },
  };
  const m = map[estado] || map.al_dia;
  return `<span class="status-pill ${m.cls}"><span class="dot"></span>${m.label}</span>`;
}

function loadBarHtml(f) {
  const dias = diasMora(f);
  const pct = Math.min(100, (dias / 60) * 100);
  let color = 'var(--ok)';
  if (dias > 0 && dias <= 15) color = 'var(--warn)';
  if (dias > 15) color = 'var(--danger-bright)';
  if (dias === 0) {
    const restantes = isoDays(f.vencimiento);
    return `<div class="load-cell">
      <div class="load-track"><div class="load-fill" style="width:${Math.max(6, 100 - Math.min(100, restantes * 3))}%; background:var(--ok);"></div></div>
      <div class="load-days">${restantes}d</div>
    </div>`;
  }
  return `<div class="load-cell">
      <div class="load-track"><div class="load-fill" style="width:${Math.max(8, pct)}%; background:${color};"></div></div>
      <div class="load-days">-${dias}d</div>
    </div>`;
}

function renderTablaCxc() {
  const search = query('searchCxc').value.trim().toLowerCase();
  const filtro = query('filterEstado').value;

  let rows = state.facturas;
  if (filtro === 'pendientes') {
    rows = state.facturas.filter(f => f.estadoPago === 'pendiente');
  } else if (filtro === 'pagado') {
    rows = state.facturas.filter(f => f.estadoPago === 'pagado');
  } else if (filtro !== 'todos') {
    rows = state.facturas.filter(f => estadoFactura(f) === filtro);
  }
  if (search) {
    rows = rows.filter(f => {
      const c = clienteById(f.clienteId);
      const p = productoById(f.productoId);
      return (c && c.nombre.toLowerCase().includes(search)) ||
        (p && p.nombre.toLowerCase().includes(search)) ||
        f.id.toLowerCase().includes(search);
    });
  }

  rows.sort((a, b) => isoDays(a.vencimiento) - isoDays(b.vencimiento));
  const wrap = query('cxcTableWrap');

  if (rows.length === 0) {
    wrap.innerHTML = `<div class="empty-state">
      <div class="dash"></div>
      <h3>Sin facturas que coincidan</h3>
      <p>Ajustá la búsqueda o el filtro, o registrá una nueva factura.</p>
    </div>`;
    return;
  }

  wrap.innerHTML = `<table>
      <thead><tr>
        <th>Cliente</th>
        <th>Producto</th>
        <th>Tipo</th>
        <th>Monto</th>
        <th>Vencimiento</th>
        <th>Estado</th>
        <th>Mora / días</th>
        <th></th>
      </tr></thead>
      <tbody>
        ${rows.map(f => {
    const c = clienteById(f.clienteId);
    const p = productoById(f.productoId);
    const estado = estadoFactura(f);
    return `<tr data-id="${f.id}" style="cursor:pointer;">
            <td>
              <div class="client-name">${c ? c.nombre : '—'}</div>
              <div class="client-sub">${c ? c.contacto : ''}</div>
            </td>
            <td>
              <div>${p ? p.nombre : '—'}</div>
              <div class="client-sub">x${f.cantidad}</div>
            </td>
            <td>${invoicePaymentLabel(f.tipoPago)}</td>
            <td class="amount">${fmt(f.monto)}<div class="client-sub">${f.estadoPago === 'pagado' ? 'Cerrada' : 'Saldo pendiente'}</div></td>
            <td class="mono">${f.vencimiento.toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
            <td>${statusPillHtml(estado)}</td>
            <td>${loadBarHtml(f)}</td>
            <td>
              <div class="row-actions">
                <button class="icon-btn" data-action="pagar" data-id="${f.id}" title="Registrar pago">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
                </button>
              </div>
            </td>
          </tr>`;
  }).join('')}
      </tbody>
    </table>`;

  wrap.querySelectorAll('tbody tr[data-id]').forEach(tr => {
    tr.addEventListener('click', () => openDetalleFacturaModal(tr.dataset.id));
  });
  wrap.querySelectorAll('[data-action="pagar"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openPagoModal(btn.dataset.id);
    });
  });
}

function renderInventario() {
  const search = query('searchInv').value.trim().toLowerCase();
  let list = state.productos;
  if (search) {
    list = list.filter(p => p.nombre.toLowerCase().includes(search) || p.sku.toLowerCase().includes(search));
  }

  const valorTotal = state.productos.reduce((s, p) => s + (p.precio * p.stock), 0);
  const bajo = state.productos.filter(p => p.stock > 0 && p.stock <= p.min).length;
  const agotado = state.productos.filter(p => p.stock === 0).length;
  const unidades = state.productos.reduce((s, p) => s + p.stock, 0);

  query('kpiInvValor').textContent = fmt(valorTotal);
  query('kpiInvMeta').textContent = `${state.productos.length} productos`;
  query('kpiInvBajo').textContent = bajo;
  query('kpiInvAgotado').textContent = agotado;
  query('kpiInvUnidades').textContent = unidades.toLocaleString('es-CR');

  const grid = query('invGrid');
  if (list.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
      <div class="dash"></div>
      <h3>Sin productos que coincidan</h3>
      <p>Probá otra búsqueda o agregá un producto nuevo.</p>
    </div>`;
    return;
  }

  grid.innerHTML = list.map(p => {
    let badgeCls = 'stock-ok';
    let badgeText = 'En stock';
    if (p.stock === 0) { badgeCls = 'stock-out'; badgeText = 'Agotado'; }
    else if (p.stock <= p.min) { badgeCls = 'stock-low'; badgeText = 'Stock bajo'; }

    const pct = p.stock === 0 ? 100 : Math.min(100, (p.stock / Math.max(p.min * 3, 1)) * 100);
    let barColor = 'var(--ok)';
    if (p.stock === 0) barColor = 'var(--danger-bright)';
    else if (p.stock <= p.min) barColor = 'var(--warn)';

    const ganancia = gananciaProducto(p);
    const vidaUtil = estadoVidaUtil(p);
    const vidaUtilHtml = vidaUtil === 'vencida'
      ? '<span class="inv-stock-badge stock-out">Vida útil vencida</span>'
      : (vidaUtil === 'por_vencer' ? '<span class="inv-stock-badge stock-low">Vida útil por vencer</span>' : '');

    return `<div class="inv-card" data-id="${p.id}" style="cursor:pointer;">
        <div class="inv-card-top">
          <div>
            <div class="inv-name">${p.nombre}</div>
            <div class="inv-sku">${p.sku}${p.numeroSerie ? ' · S/N ' + p.numeroSerie : ''}</div>
          </div>
          <span class="inv-stock-badge ${badgeCls}">${badgeText}</span>
        </div>
        <div class="inv-bar-track"><div class="inv-bar-fill" style="width:${pct}%; background:${barColor};"></div></div>
        <div class="inv-meta">
          <span>${p.stock} unidad${p.stock === 1 ? '' : 'es'} · mín ${p.min}</span>
          <span class="price">${fmt(p.precio)}</span>
        </div>
        <div class="inv-meta" style="margin-top:6px;">
          <span>Costo: ${fmt(ganancia.costoCRC)} · Gastos: ${fmt(ganancia.gastosTotalCRC)}</span>
          <span style="color:${ganancia.ganancia >= 0 ? 'var(--ok)' : 'var(--danger-bright)'};">Ganancia: ${fmt(ganancia.ganancia)}</span>
        </div>
        ${vidaUtilHtml ? `<div style="margin-top:6px;">${vidaUtilHtml}</div>` : ''}
      </div>`;
  }).join('');

  grid.querySelectorAll('.inv-card').forEach(card => {
    card.addEventListener('click', () => openProductoModal(card.dataset.id));
  });
}

function renderClientes() {
  const search = query('searchCli').value.trim().toLowerCase();
  let list = state.clientes;
  if (search) list = list.filter(c => c.nombre.toLowerCase().includes(search));

  const wrap = query('cliTableWrap');
  if (list.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="dash"></div><h3>Sin clientes que coincidan</h3><p>Probá otra búsqueda o agregá un cliente nuevo.</p></div>`;
    return;
  }

  wrap.innerHTML = `<table>
      <thead><tr><th>Cliente</th><th>Contacto</th><th>Facturas activas</th><th>Saldo pendiente</th><th>Total pagado</th><th>Estado</th><th></th></tr></thead>
      <tbody>
        ${list.map(c => {
    const fs = state.facturas.filter(f => f.clienteId === c.id);
    const pendientes = fs.filter(f => f.estadoPago === 'pendiente');
    const saldo = pendientes.reduce((s, f) => s + (Number(f.monto) || 0), 0);
    const totalPagado = fs.reduce((s, f) => s + getFacturaPagadoTotal(f), 0);
    const tieneVencido = pendientes.some(f => estadoFactura(f) === 'vencido');
    const estado = pendientes.length === 0 ? 'al_dia' : (tieneVencido ? 'vencido' : 'al_dia');
    return `<tr data-id="${c.id}" style="cursor:pointer;">
            <td class="client-name">${c.nombre}</td>
            <td class="mono">${c.contacto || '—'}</td>
            <td>${pendientes.length}</td>
            <td class="amount">${fmt(saldo)}</td>
            <td class="amount">${fmt(totalPagado)}</td>
            <td>${statusPillHtml(estado)}</td>
            <td>
              <div class="row-actions">
                <button class="icon-btn" data-action="editar-cliente" data-id="${c.id}" title="Editar cliente">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                </button>
                <button class="icon-btn danger" data-action="eliminar-cliente" data-id="${c.id}" title="Eliminar cliente">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6h16z"/></svg>
                </button>
              </div>
            </td>
          </tr>`;
  }).join('')}
      </tbody>
    </table>`;

  wrap.querySelectorAll('tbody tr[data-id]').forEach(tr => {
    tr.addEventListener('click', () => openHistorialClienteModal(tr.dataset.id));
  });
  wrap.querySelectorAll('[data-action="editar-cliente"]').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); openClienteModal(btn.dataset.id); });
  });
  wrap.querySelectorAll('[data-action="eliminar-cliente"]').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); openDeleteClienteModal(btn.dataset.id); });
  });
}

function renderAll() {
  renderKpisCxc();
  renderTablaCxc();
  renderInventario();
  renderClientes();
  renderPortalView();
  if (reportsUI) reportsUI.render();
  saveState();
}

function switchView(viewKey) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.view').forEach(s => s.classList.remove('active'));
  const activeButton = document.querySelector(`.nav-item[data-view="${viewKey}"]`);
  if (activeButton) activeButton.classList.add('active');
  query(`view-${viewKey}`).classList.add('active');
  query('pageTitle').textContent = viewMeta[viewKey].title;
  query('pageSub').textContent = viewMeta[viewKey].sub;
  query('btnNewLabel').textContent = viewMeta[viewKey].btn;
  currentView = viewKey;
  if (viewKey === 'reportes' && reportsUI) {
    reportsUI.render();
  }
}

const viewMeta = {
  cxc: { title: 'Cuentas por cobrar', sub: 'Facturas pendientes de cobro a clientes de equipo de gimnasio', btn: 'Nueva factura' },
  inventario: { title: 'Inventario', sub: 'Equipo de gimnasio disponible para venta', btn: 'Nuevo producto' },
  clientes: { title: 'Clientes', sub: 'Gimnasios y negocios a los que se les vende equipo', btn: 'Nuevo cliente' },
  reportes: { title: 'Reportes & Analítica', sub: 'Centro integral de inteligencia financiera, cartera, inventario y clientes', btn: 'Imprimir / PDF' },
};

let currentView = 'cxc';

const modalFactura = query('modalFactura');
const modalPago = query('modalPago');
const modalProducto = query('modalProducto');
const modalCliente = query('modalCliente');
const modalDeleteCliente = query('modalDeleteCliente');
const modalDetalleFactura = query('modalDetalleFactura');
const modalHistorialCliente = query('modalHistorialCliente');
let pagoFacturaId = null;
let editingClienteId = null;
let deletingClienteId = null;
let editingProductoId = null;
let detalleFacturaId = null;
let historialClienteId = null;
const invoiceForm = createInvoiceForm({
  query,
  state,
  fmt,
  productoById,
  toDateInputValue,
  paymentTypes,
  daysFromNowLocal,
  today,
  modalFactura,
});

const reportsUI = initReportsUI({ query, state });

const openFacturaModal = invoiceForm.open;
const closeFacturaModal = invoiceForm.close;

function openPagoModal(facturaId) {
  pagoFacturaId = facturaId;
  const f = state.facturas.find(x => x.id === facturaId);
  if (!f) return;
  const c = clienteById(f.clienteId);
  const p = productoById(f.productoId);
  const saldoActual = Number(f.monto) || 0;
  const pagos = getFacturaPagos(f);
  const totalPagado = getFacturaPagadoTotal(f);
  const historialHtml = pagos.length > 0
    ? `<div style="display:grid; gap:6px; margin-top:6px;">${pagos.map(pago => `<div style="display:flex; justify-content:space-between; gap:8px; color:var(--bone);"><span>${pago.fecha ? new Date(pago.fecha).toLocaleDateString('es-CR') : 'Fecha no registrada'}</span><span class="mono">${fmt(Number(pago.monto) || 0)}</span></div>`).join('')}</div>`
    : '<div style="margin-top:6px; color:var(--bone-dim);">Aún no hay pagos registrados.</div>';

  query('pagoInfo').innerHTML = `
    <strong style="color:var(--bone)">${c ? c.nombre : 'Cliente'}</strong> — ${p ? p.nombre : 'Producto'}<br>
    Saldo pendiente: <span class="mono" style="color:var(--rust-bright); font-weight:700;">${fmt(saldoActual)}</span><br>
    Total pagado: <span class="mono" style="color:var(--ok);">${fmt(totalPagado)}</span><br>
    <span style="color:var(--bone-dim);">Si el monto cubre el saldo total, la factura se cerrará y quedará registrada en historial.</span>`;
  query('pagoHistorial').innerHTML = `<div style="font-weight:600; color:var(--bone); margin-bottom:6px;">Historial de pagos</div>${historialHtml}`;
  query('pMonto').value = saldoActual;
  query('pFecha').value = toDateInputValue(today);
  modalPago.style.display = 'flex';
}

function closePagoModal() {
  modalPago.style.display = 'none';
  pagoFacturaId = null;
}

function openProductoModal(productoId) {
  editingProductoId = productoId || null;
  const p = editingProductoId ? productoById(editingProductoId) : null;

  query('modalProductoTitle').textContent = p ? 'Editar producto' : 'Nuevo producto';
  query('ipNombre').value = p ? p.nombre : '';
  query('ipSku').value = p ? p.sku : '';
  query('ipSerie').value = p ? (p.numeroSerie || '') : '';
  query('ipMonedaVenta').value = p ? p.monedaVenta : 'CRC';
  query('ipPrecio').value = p ? p.precioVentaOriginal : '';
  query('ipMonedaCosto').value = p ? p.monedaCosto : 'CRC';
  query('ipCosto').value = p ? p.costoCompra : '';
  query('ipTipoCambio').value = p && p.tipoCambioRegistro ? p.tipoCambioRegistro : '';
  query('ipGastos').value = p ? p.gastosAdicionales : '';
  query('ipImportacionPct').value = p ? p.porcentajeImportacionChina : '';
  query('ipVidaUtil').value = p ? toDateInputValue(p.fechaVidaUtil) : '';
  query('ipStock').value = p ? p.stock : '';
  query('ipMin').value = p ? p.min : '';
  syncMonedaProducto();
  modalProducto.style.display = 'flex';
}

function closeProductoModal() {
  modalProducto.style.display = 'none';
  editingProductoId = null;
}

function openClienteModal(clienteId) {
  editingClienteId = clienteId || null;
  const deleteBtn = query('deleteClienteFromModal');
  if (clienteId) {
    const cliente = clienteById(clienteId);
    if (!cliente) return;
    query('modalClienteTitle').textContent = 'Editar cliente';
    query('icId').value = cliente.id;
    query('icNombre').value = cliente.nombre;
    query('icContacto').value = cliente.contacto || '';
    if (deleteBtn) deleteBtn.style.display = 'inline-flex';
  } else {
    query('modalClienteTitle').textContent = 'Nuevo cliente';
    query('icId').value = '';
    query('icNombre').value = '';
    query('icContacto').value = '';
    if (deleteBtn) deleteBtn.style.display = 'none';
  }
  modalCliente.style.display = 'flex';
}

function closeClienteModal() {
  modalCliente.style.display = 'none';
  editingClienteId = null;
}

function openDeleteClienteModal(clienteId) {
  deletingClienteId = clienteId;
  const cliente = clienteById(clienteId);
  if (!cliente) return;
  const facturasAsoc = state.facturas.filter(f => f.clienteId === clienteId);
  const msg = facturasAsoc.length > 0
    ? `<strong style="color:var(--bone)">${cliente.nombre}</strong> tiene ${facturasAsoc.length} factura${facturasAsoc.length === 1 ? '' : 's'} asociada${facturasAsoc.length === 1 ? '' : 's'}. Si lo eliminás, esas facturas quedarán sin cliente asignado. ¿Continuar?`
    : `¿Seguro que querés eliminar a <strong style="color:var(--bone)">${cliente.nombre}</strong>? Esta acción no se puede deshacer.`;
  query('deleteClienteMsg').innerHTML = msg;
  modalDeleteCliente.style.display = 'flex';
}

function closeDeleteClienteModal() {
  modalDeleteCliente.style.display = 'none';
  deletingClienteId = null;
}

function openDetalleFacturaModal(facturaId) {
  const f = state.facturas.find(x => x.id === facturaId);
  if (!f) return;
  detalleFacturaId = facturaId;

  const c = clienteById(f.clienteId);
  const p = productoById(f.productoId);
  const estado = f.estadoPago === 'pagado' ? 'pagado' : estadoFactura(f);
  const pagos = getFacturaPagos(f);
  const totalPagado = getFacturaPagadoTotal(f);

  query('detalleFacturaTitle').textContent = `Factura ${f.id}`;
  query('detalleFacturaInfo').innerHTML = `
    <strong style="color:var(--bone);">${c ? c.nombre : 'Cliente'}</strong><br>
    Producto: ${p ? p.nombre : '—'} × ${f.cantidad}<br>
    Tipo de pago: ${invoicePaymentLabel(f.tipoPago)}<br>
    Emisión: ${f.emision.toLocaleDateString('es-CR')} · Vencimiento: ${f.vencimiento.toLocaleDateString('es-CR')}<br>
    Estado: ${statusPillHtml(estado)}<br>
    Monto original: <span class="mono">${fmt(f.montoOriginal || f.monto)}</span><br>
    Saldo pendiente: <span class="mono" style="color:var(--rust-bright); font-weight:700;">${fmt(f.monto)}</span><br>
    Total pagado: <span class="mono" style="color:var(--ok);">${fmt(totalPagado)}</span>
    ${f.nota ? `<br>Nota: ${f.nota}` : ''}`;

  const historialHtml = pagos.length > 0
    ? `<div style="display:grid; gap:6px;">${pagos.map(pago => `<div style="display:flex; justify-content:space-between; gap:8px; color:var(--bone);"><span>${pago.fecha ? new Date(pago.fecha).toLocaleDateString('es-CR') : 'Fecha no registrada'}</span><span class="mono">${fmt(Number(pago.monto) || 0)}</span></div>`).join('')}</div>`
    : 'Aún no hay pagos registrados.';
  query('detalleFacturaHistorial').innerHTML = `<div style="font-weight:600; color:var(--bone); margin-bottom:6px;">Historial de pagos</div>${historialHtml}`;

  query('detalleFacturaPagar').style.display = f.estadoPago === 'pagado' ? 'none' : 'inline-flex';
  modalDetalleFactura.style.display = 'flex';
}

function closeDetalleFacturaModal() {
  modalDetalleFactura.style.display = 'none';
  detalleFacturaId = null;
}

function openHistorialClienteModal(clienteId) {
  const cliente = clienteById(clienteId);
  if (!cliente) return;
  historialClienteId = clienteId;

  const facturas = state.facturas.filter(f => f.clienteId === clienteId).slice().sort((a, b) => b.emision - a.emision);
  const pendientes = facturas.filter(f => f.estadoPago === 'pendiente');
  const saldo = pendientes.reduce((s, f) => s + (Number(f.monto) || 0), 0);
  const totalPagado = facturas.reduce((s, f) => s + getFacturaPagadoTotal(f), 0);

  query('historialClienteTitle').textContent = cliente.nombre;
  query('historialClienteResumen').innerHTML = `<strong style="color:var(--bone);">${pendientes.length}</strong> factura${pendientes.length === 1 ? '' : 's'} pendiente${pendientes.length === 1 ? '' : 's'} · Saldo: <span class="mono" style="color:var(--rust-bright); font-weight:700;">${fmt(saldo)}</span> · Total pagado: <span class="mono" style="color:var(--ok);">${fmt(totalPagado)}</span>`;

  const lista = query('historialClienteLista');
  if (facturas.length === 0) {
    lista.innerHTML = '<div class="portal-empty">Este cliente todavía no tiene facturas.</div>';
  } else {
    lista.innerHTML = facturas.map(f => {
      const p = productoById(f.productoId);
      const estado = f.estadoPago === 'pagado' ? 'pagado' : estadoFactura(f);
      return `<div class="portal-item" data-id="${f.id}" style="cursor:pointer;">
        <div>
          <strong>${p ? p.nombre : 'Producto'}</strong>
          <div class="portal-item-sub">Factura ${f.id} · vence ${f.vencimiento.toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
        </div>
        <div class="portal-item-balance">${fmt(f.monto)}<br>${statusPillHtml(estado)}</div>
      </div>`;
    }).join('');

    lista.querySelectorAll('[data-id]').forEach(item => {
      item.addEventListener('click', () => {
        closeHistorialClienteModal();
        openDetalleFacturaModal(item.dataset.id);
      });
    });
  }

  modalHistorialCliente.style.display = 'flex';
}

function closeHistorialClienteModal() {
  modalHistorialCliente.style.display = 'none';
  historialClienteId = null;
}

function downloadExcel(filename, rows) {
  if (!rows || rows.length === 0) {
    alert('No hay datos para exportar.');
    return;
  }
  const escapeHtml = (value) => {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };
  const headers = Object.keys(rows[0]);
  const tableRows = [
    `<tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join('')}</tr>`,
    ...rows.map(row => `<tr>${headers.map(header => `<td>${escapeHtml(row[header])}</td>`).join('')}</tr>`),
  ].join('');
  const workbook = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    table { border-collapse: collapse; font-family: Arial, sans-serif; }
    th { background: #1C1F25; color: #FFFFFF; font-weight: bold; }
    th, td { border: 1px solid #B7B7B7; padding: 6px 9px; white-space: nowrap; }
    td { mso-number-format: "\\@"; }
  </style></head><body><table>${tableRows}</table></body></html>`;
  const blob = new Blob([`\ufeff${workbook}`], { type: 'application/vnd.ms-excel' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

function exportarCsv() {
  let filename = 'ebizu_export.xls';
  let rows = [];

  if (currentView === 'cxc') {
    const pendientes = state.facturas
      .filter(f => f.estadoPago === 'pendiente')
      .sort((a, b) => a.vencimiento - b.vencimiento);
    rows = pendientes.map(f => {
      const c = clienteById(f.clienteId);
      const p = productoById(f.productoId);
      return {
        'Factura': f.id,
        'Cliente': c ? c.nombre : '',
        'Contacto': c ? c.contacto : '',
        'Producto': p ? p.nombre : '',
        'Cantidad': f.cantidad,
        'Tipo de pago': invoicePaymentLabel(f.tipoPago),
        'Monto original': f.montoOriginal || f.monto,
        'Monto pendiente': f.monto,
        'Vencimiento': f.vencimiento.toLocaleDateString('es-CR'),
        'Estado': ({al_dia: 'Al día', por_vencer: 'Por vencer', vencido: 'Vencido'})[estadoFactura(f)],
        'Días de mora': diasMora(f),
        'Nota': f.nota || '',
      };
    });
    filename = 'ebizu_cuentas_por_cobrar.xls';

  } else if (currentView === 'inventario') {
    rows = state.productos.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(p => {
      const ganancia = gananciaProducto(p);
      return {
      'Producto': p.nombre,
      'SKU': p.sku,
      'Número de serie': p.numeroSerie || '',
      'Precio venta CRC': p.precio,
      'Precio venta original': p.precioVentaOriginal,
      'Moneda venta': p.monedaVenta,
      'Costo compra': p.costoCompra,
      'Moneda costo': p.monedaCosto,
      'Tipo cambio registro': p.tipoCambioRegistro || '',
      'Gastos adicionales CRC': ganancia.gastosAdicionalesCRC,
      '% importación China': p.porcentajeImportacionChina,
      'Gastos importación CRC': ganancia.gastosImportacionCRC,
      'Gastos totales CRC': ganancia.gastosTotalCRC,
      'Ganancia CRC': ganancia.ganancia,
      'Stock actual': p.stock,
      'Stock mínimo': p.min,
      'Valor en inventario': p.precio * p.stock,
      'Estado': p.stock === 0 ? 'Agotado' : (p.stock <= p.min ? 'Stock bajo' : 'En stock'),
      'Vida útil': p.fechaVidaUtil ? p.fechaVidaUtil.toLocaleDateString('es-CR') : '',
      };
    });
    filename = 'ebizu_inventario.xls';

  } else if (currentView === 'clientes') {
    rows = state.clientes.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map(c => {
      const fs = state.facturas.filter(f => f.clienteId === c.id && f.estadoPago === 'pendiente');
      const saldo = fs.reduce((s, f) => s + f.monto, 0);
      const facturasTotales = state.facturas.filter(f => f.clienteId === c.id);
      const totalPagado = facturasTotales.reduce((s, f) => s + getFacturaPagadoTotal(f), 0);
      const tieneVencido = fs.some(f => estadoFactura(f) === 'vencido');
      return {
        'Cliente': c.nombre,
        'Contacto': c.contacto || '',
        'Facturas activas': fs.length,
        'Facturas totales': facturasTotales.length,
        'Saldo pendiente': saldo,
        'Total pagado': totalPagado,
        'Estado': fs.length === 0 ? 'Al día' : (tieneVencido ? 'Vencido' : 'Al día'),
      };
    });
    filename = 'ebizu_clientes.xls';
  }

  downloadExcel(filename, rows);
}

function renderPortalView() {
  const authValue = getStoredAuth();
  const isPortal = typeof authValue === 'string' && authValue.startsWith('portal:');
  const portalScreen = query('portalScreen');
  if (!portalScreen) return;

  if (!isPortal) {
    portalScreen.style.display = 'none';
    portalScreen.style.visibility = 'hidden';
    return;
  }

  const username = authValue.replace('portal:', '');
  const portalUser = findPortalUserByUsername(username);
  if (!portalUser) {
    clearStoredAuth();
    checkAuth();
    return;
  }

  const cliente = clienteById(portalUser.clientId);
  const facturasBase = (state.facturas || []).filter(f => f.clienteId === portalUser.clientId);
  const facturas = facturasBase.map(f => ({
    ...f,
    pagos: Array.isArray(f.pagos) ? f.pagos.map(pago => ({
      ...pago,
      fecha: pago.fecha ? new Date(pago.fecha) : new Date(),
    })) : [],
  }));
  const pendientes = facturas.filter(f => f.estadoPago === 'pendiente');
  const saldo = pendientes.reduce((sum, f) => sum + (Number(f.monto) || 0), 0);
  const totalPagado = facturas.reduce((sum, f) => sum + ((f.pagos || []).reduce((paymentSum, pago) => paymentSum + (Number(pago.monto) || 0), 0)), 0);
  const pagos = facturas.flatMap(f => (f.pagos || []).map(pago => ({
    ...pago,
    facturaId: f.id,
    fecha: pago.fecha ? new Date(pago.fecha) : new Date(),
  }))).sort((a, b) => b.fecha - a.fecha);
  const lastPayment = pagos[0] || null;

  query('portalUserName').textContent = portalUser.label;
  query('portalClientName').textContent = cliente ? cliente.nombre : portalUser.label;
  query('portalBalance').textContent = fmt(saldo);
  query('portalPaid').textContent = fmt(totalPagado);
  query('portalSummary').textContent = `${pendientes.length} factura${pendientes.length === 1 ? '' : 's'} pendiente${pendientes.length === 1 ? '' : 's'} · Últimos movimientos: ${lastPayment ? `${fmt(Number(lastPayment.monto) || 0)} · ${new Date(lastPayment.fecha).toLocaleDateString('es-CR')}` : 'Sin pagos aún'}`;

  if (facturas.length === 0) {
    query('portalInvoiceList').innerHTML = '<div class="portal-empty">Aún no hay facturas registradas para este negocio.</div>';
  } else {
    query('portalInvoiceList').innerHTML = facturas.map(f => {
      const estado = f.estadoPago === 'pagado' ? 'Pagada' : 'Pendiente';
      const saldoFactura = fmt(Number(f.monto) || 0);
      const pagosFactura = (f.pagos || []).slice().sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
      const pagosHtml = pagosFactura.length > 0
        ? pagosFactura.map(pago => `<div class="portal-payment-item"><span>${new Date(pago.fecha).toLocaleDateString('es-CR')}</span><strong>${fmt(Number(pago.monto) || 0)}</strong></div>`).join('')
        : '<div class="portal-empty">Sin pagos registrados aún.</div>';
      return `<div class="portal-item"><div><strong>Factura ${f.id}</strong><div class="portal-item-sub">${f.productoId ? 'Producto asociado' : 'Detalle disponible'}</div>${pagosHtml}</div><div class="portal-item-balance">${saldoFactura}<br><span>${estado}</span></div></div>`;
    }).join('');
  }

  if (pagos.length === 0) {
    query('portalPaymentList').innerHTML = '<div class="portal-empty">Aún no hay registros de pagos para este negocio.</div>';
  } else {
    query('portalPaymentList').innerHTML = pagos.map(pago => `
      <div class="portal-item">
        <div>
          <strong>Factura ${pago.facturaId}</strong>
          <div class="portal-item-sub">${new Date(pago.fecha).toLocaleDateString('es-CR')}</div>
        </div>
        <div class="portal-item-balance">${fmt(Number(pago.monto) || 0)}<br><span>Pago registrado</span></div>
      </div>
    `).join('');
  }

  portalScreen.style.display = 'flex';
  portalScreen.style.visibility = 'visible';
}

function checkAuth() {
  const authValue = getStoredAuth();
  let isPortal = typeof authValue === 'string' && authValue.startsWith('portal:');

  if (isPortal) {
    const username = authValue.replace('portal:', '');
    const portalUser = findPortalUserByUsername(username);
    if (!portalUser || !portalUser.activo) {
      clearStoredAuth();
      isPortal = false;
    } else {
      const clienteFacturasPendientes = state.facturas.filter(f => f.clienteId === portalUser.clientId && f.estadoPago === 'pendiente' && (Number(f.monto) || 0) > 0);
      if (clienteFacturasPendientes.length === 0 && state.facturas.some(f => f.clienteId === portalUser.clientId)) {
        revocarAccesoPortalCliente(portalUser.clientId);
        clearStoredAuth();
        isPortal = false;
      }
    }
  }

  const isLoggedIn = isPortal || authValue === 'admin';

  document.body.classList.toggle('locked', !isLoggedIn);
  document.body.classList.toggle('portal-mode', isPortal);

  const loginScreen = document.getElementById('loginScreen');
  if (loginScreen) {
    loginScreen.style.display = isLoggedIn && !isPortal ? 'none' : (isLoggedIn ? 'none' : 'flex');
    loginScreen.style.visibility = isLoggedIn && !isPortal ? 'hidden' : 'visible';
  }

  renderPortalView();
  return isLoggedIn;
}

async function attemptLogin() {
  const user = query('loginUser').value.trim();
  const pass = query('loginPass').value;
  const errBox = query('loginError');

  if (!user || !pass) {
    errBox.textContent = 'Por favor ingresá usuario y contraseña.';
    errBox.style.display = 'block';
    return;
  }

  const passHash = await sha256(pass);

  // 1. Verificación Admin (Cristian)
  if (user === ADMIN_USERNAME && passHash === ADMIN_PASSWORD_HASH) {
    setStoredAuth('admin');
    errBox.style.display = 'none';
    checkAuth();
    return;
  }

  // 2. Verificación Portal Negocio
  const portalUser = findPortalUserByUsername(user);
  if (portalUser) {
    if (!portalUser.activo) {
      errBox.textContent = 'Acceso inactivo: Este negocio no tiene saldos pendientes o la clave fue cancelada al saldar la deuda.';
      errBox.style.display = 'block';
      return;
    }

    const clienteFacturasPendientes = state.facturas.filter(f => f.clienteId === portalUser.clientId && f.estadoPago === 'pendiente' && (Number(f.monto) || 0) > 0);
    if (clienteFacturasPendientes.length === 0 && state.facturas.some(f => f.clienteId === portalUser.clientId)) {
      revocarAccesoPortalCliente(portalUser.clientId);
      errBox.textContent = 'Acceso inactivo: La cuenta ya canceló la totalidad de su saldo pendiente.';
      errBox.style.display = 'block';
      return;
    }

    if (passHash === portalUser.passwordHash || (portalUser.password && pass === portalUser.password)) {
      setStoredAuth(`portal:${portalUser.username}`);
      errBox.style.display = 'none';
      checkAuth();
      return;
    }
  }

  errBox.textContent = 'Usuario o contraseña incorrectos.';
  errBox.style.display = 'block';
}

function setupEventListeners() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.view;
      switchView(v);
    });
  });

  query('btnNew').addEventListener('click', () => {
    if (currentView === 'inventario') openProductoModal();
    else if (currentView === 'clientes') openClienteModal(null);
    else if (currentView === 'reportes') window.print();
    else openFacturaModal();
  });
  query('btnExport').addEventListener('click', () => {
    if (currentView === 'reportes') {
      reportsUI.exportView();
    } else {
      exportarCsv();
    }
  });
  query('btnNewCliente').addEventListener('click', () => openClienteModal(null));

  query('saveFactura').addEventListener('click', () => {
    const clienteId = query('fCliente').value;
    const venc = query('fVencimiento').value;
    const nota = query('fNota').value.trim();
    const tipoPago = query('fTipoPago').value;

    if (!venc) { alert('Seleccioná una fecha de vencimiento.'); return; }

    const lineasValidas = invoiceForm.getLines().filter(l => l.productoId && l.cantidad > 0 && l.monto > 0);
    if (lineasValidas.length === 0) { alert('Agregá al menos un producto con cantidad y monto válidos.'); return; }

    lineasValidas.forEach(linea => {
      createFactura({
        clienteId,
        productoId: linea.productoId,
        cantidad: linea.cantidad,
        monto: linea.monto,
        vencimiento: parseDateInputValue(venc),
        nota,
        tipoPago,
      });
    });

    closeFacturaModal();
    renderAll();
  });

  query('savePago').addEventListener('click', () => {
    const f = state.facturas.find(x => x.id === pagoFacturaId);
    if (!f) return;
    const monto = Number(query('pMonto').value);
    const fecha = query('pFecha').value;
    if (!monto || monto <= 0) { alert('Ingresá un monto válido.'); return; }

    registrarPago(f, {
      monto,
      fecha: parseDateInputValue(fecha),
      nota: '',
    });

    closePagoModal();
    renderAll();
  });

  query('closeModalPago').addEventListener('click', closePagoModal);
  query('cancelPago').addEventListener('click', closePagoModal);
  modalPago.addEventListener('click', (e) => { if (e.target === modalPago) closePagoModal(); });

  query('saveProducto').addEventListener('click', () => {
    const nombre = query('ipNombre').value.trim();
    const sku = query('ipSku').value.trim();
    const numeroSerie = query('ipSerie').value.trim();
    const monedaVenta = query('ipMonedaVenta').value;
    const precioInput = Number(query('ipPrecio').value);
    const monedaCosto = query('ipMonedaCosto').value;
    const costoInput = Number(query('ipCosto').value) || 0;
    const tipoCambioInput = Number(query('ipTipoCambio').value) || 0;
    const gastosInput = Number(query('ipGastos').value) || 0;
    const importPctInput = Number(query('ipImportacionPct').value) || 0;
    const vidaUtilInput = query('ipVidaUtil').value;
    const stock = Number(query('ipStock').value);
    const min = Number(query('ipMin').value);

    if (!nombre) { alert('Ingresá el nombre del producto.'); return; }
    if (!precioInput || precioInput <= 0) { alert('Ingresá un precio de venta válido.'); return; }
    if ((monedaVenta === 'USD' || monedaCosto === 'USD') && tipoCambioInput <= 0) {
      alert('Ingresá el tipo de cambio del BCCR del día para convertir el monto en dólares.');
      return;
    }
    if (numeroSerie && serieDuplicada(numeroSerie, editingProductoId)) {
      alert('Ya existe un producto registrado con ese número de serie.');
      return;
    }

    const tipoCambioRegistro = (monedaVenta === 'USD' || monedaCosto === 'USD') ? tipoCambioInput : null;
    const datosProducto = {
      nombre,
      sku: sku || ('SKU-' + state.nextProductoId),
      numeroSerie,
      precio: convertToCRC(precioInput, monedaVenta, tipoCambioRegistro),
      precioVentaOriginal: precioInput,
      monedaVenta,
      monedaCosto,
      costoCompra: costoInput,
      gastosAdicionales: gastosInput,
      porcentajeImportacionChina: importPctInput,
      tipoCambioRegistro,
      fechaVidaUtil: vidaUtilInput ? parseDateInputValue(vidaUtilInput) : null,
      stock: stock || 0,
      min: min || 0,
    };

    if (editingProductoId) {
      const p = productoById(editingProductoId);
      if (p) Object.assign(p, datosProducto);
    } else {
      state.productos.push({ id: 'p' + state.nextProductoId, ...datosProducto });
      state.nextProductoId += 1;
    }
    closeProductoModal();
    renderAll();
  });

  query('ipMonedaVenta').addEventListener('change', syncMonedaProducto);
  query('ipMonedaCosto').addEventListener('change', syncMonedaProducto);
  query('closeModalProducto').addEventListener('click', closeProductoModal);
  query('cancelProducto').addEventListener('click', closeProductoModal);
  modalProducto.addEventListener('click', (e) => { if (e.target === modalProducto) closeProductoModal(); });

  query('btnLogout').addEventListener('click', () => {
    clearStoredAuth();
    query('loginUser').value = '';
    query('loginPass').value = '';
    query('loginError').style.display = 'none';
    checkAuth();
  });

  const portalLogout = query('portalLogout');
  if (portalLogout) {
    portalLogout.addEventListener('click', () => {
      clearStoredAuth();
      query('loginUser').value = '';
      query('loginPass').value = '';
      query('loginError').style.display = 'none';
      checkAuth();
    });
  }

  query('loginBtn').addEventListener('click', attemptLogin);
  query('loginPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') attemptLogin(); });
  query('loginUser').addEventListener('keydown', (e) => { if (e.key === 'Enter') attemptLogin(); });

  query('saveCliente').addEventListener('click', () => {
    const nombre = query('icNombre').value.trim();
    const contacto = query('icContacto').value.trim();
    const id = query('icId').value;

    if (!nombre) { alert('Ingresá el nombre del cliente.'); return; }

    if (id) {
      const c = clienteById(id);
      if (c) { c.nombre = nombre; c.contacto = contacto; }
    } else {
      state.clientes.push({ id: 'c' + state.nextClienteId, nombre, contacto });
      state.nextClienteId += 1;
    }

    closeClienteModal();
    renderAll();
  });

  const deleteFromModalBtn = query('deleteClienteFromModal');
  if (deleteFromModalBtn) {
    deleteFromModalBtn.addEventListener('click', () => {
      const idToDelete = editingClienteId;
      closeClienteModal();
      if (idToDelete) {
        openDeleteClienteModal(idToDelete);
      }
    });
  }

  query('closeModalCliente').addEventListener('click', closeClienteModal);
  query('cancelCliente').addEventListener('click', closeClienteModal);
  modalCliente.addEventListener('click', (e) => { if (e.target === modalCliente) closeClienteModal(); });

  query('confirmDeleteCliente').addEventListener('click', () => {
    state.clientes = state.clientes.filter(c => c.id !== deletingClienteId);
    closeDeleteClienteModal();
    renderAll();
  });

  query('closeModalDeleteCliente').addEventListener('click', closeDeleteClienteModal);
  query('cancelDeleteCliente').addEventListener('click', closeDeleteClienteModal);
  modalDeleteCliente.addEventListener('click', (e) => { if (e.target === modalDeleteCliente) closeDeleteClienteModal(); });

  query('closeModalDetalleFactura').addEventListener('click', closeDetalleFacturaModal);
  query('closeDetalleFactura').addEventListener('click', closeDetalleFacturaModal);
  modalDetalleFactura.addEventListener('click', (e) => { if (e.target === modalDetalleFactura) closeDetalleFacturaModal(); });
  query('detalleFacturaPagar').addEventListener('click', () => {
    const facturaId = detalleFacturaId;
    closeDetalleFacturaModal();
    openPagoModal(facturaId);
  });

  const editFromHistoryBtn = query('editClienteFromHistory');
  if (editFromHistoryBtn) {
    editFromHistoryBtn.addEventListener('click', () => {
      const idToEdit = historialClienteId;
      closeHistorialClienteModal();
      if (idToEdit) {
        openClienteModal(idToEdit);
      }
    });
  }

  query('closeModalHistorialCliente').addEventListener('click', closeHistorialClienteModal);
  query('closeHistorialCliente').addEventListener('click', closeHistorialClienteModal);
  modalHistorialCliente.addEventListener('click', (e) => { if (e.target === modalHistorialCliente) closeHistorialClienteModal(); });

  query('searchCxc').addEventListener('input', renderTablaCxc);
  query('filterEstado').addEventListener('change', renderTablaCxc);
  query('searchInv').addEventListener('input', renderInventario);
  query('searchCli').addEventListener('input', renderClientes);
}

export function initUi() {
  setupEventListeners();
  checkAuth();
  renderAll();
}
