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
  convertToCRC,
  gananciaProducto,
  estadoVidaUtil,
  serieDuplicada,
} from './state.js';

function query(id) {
  return document.getElementById(id);
}

function getPaymentTypeSelect() {
  return query('fTipoPago');
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

function syncPaymentType() {
  const tipoPago = getPaymentTypeSelect().value;
  const vencimientoInput = query('fVencimiento');
  if (tipoPago === paymentTypes.contado) {
    vencimientoInput.value = toDateInputValue(today);
    vencimientoInput.disabled = true;
  } else {
    vencimientoInput.disabled = false;
    if (!vencimientoInput.value) {
      vencimientoInput.value = toDateInputValue(daysFromNowLocal(15));
    }
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

  let rows = state.facturas.filter(f => f.estadoPago !== 'pagado');
  if (filtro === 'pagado') {
    rows = state.facturas.filter(f => f.estadoPago === 'pagado');
  } else if (filtro === 'pendientes') {
    rows = rows.filter(f => f.estadoPago === 'pendiente');
  } else if (filtro !== 'todos') {
    rows = rows.filter(f => estadoFactura(f) === filtro);
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
    return `<tr>
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

  wrap.querySelectorAll('[data-action="pagar"]').forEach(btn => {
    btn.addEventListener('click', () => openPagoModal(btn.dataset.id));
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
    return `<tr>
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

  wrap.querySelectorAll('[data-action="editar-cliente"]').forEach(btn => {
    btn.addEventListener('click', () => openClienteModal(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="eliminar-cliente"]').forEach(btn => {
    btn.addEventListener('click', () => openDeleteClienteModal(btn.dataset.id));
  });
}

function renderAll() {
  renderKpisCxc();
  renderTablaCxc();
  renderInventario();
  renderClientes();
  renderPortalView();
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
}

const viewMeta = {
  cxc: { title: 'Cuentas por cobrar', sub: 'Facturas pendientes de cobro a clientes de equipo de gimnasio', btn: 'Nueva factura' },
  inventario: { title: 'Inventario', sub: 'Equipo de gimnasio disponible para venta', btn: 'Nuevo producto' },
  clientes: { title: 'Clientes', sub: 'Gimnasios y negocios a los que se les vende equipo', btn: 'Nuevo cliente' },
};

let currentView = 'cxc';

const modalFactura = query('modalFactura');
const modalPago = query('modalPago');
const modalProducto = query('modalProducto');
const modalCliente = query('modalCliente');
const modalDeleteCliente = query('modalDeleteCliente');
let pagoFacturaId = null;
let editingClienteId = null;
let deletingClienteId = null;
let editingProductoId = null;
let facturaLineas = [];
let facturaLineaSeq = 0;

function populateSelects() {
  query('fCliente').innerHTML = state.clientes.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
}

function primerProductoConStock() {
  const disponible = state.productos.find(p => p.stock > 0);
  return disponible ? disponible.id : (state.productos[0] ? state.productos[0].id : null);
}

function productoOptionsHtml(selectedId) {
  return state.productos.map(p => {
    const sinStock = p.stock <= 0;
    const label = sinStock ? `${p.nombre} — Agotado` : `${p.nombre} — ${fmt(p.precio)} (${p.stock} disp.)`;
    return `<option value="${p.id}" ${sinStock ? 'disabled' : ''} ${p.id === selectedId ? 'selected' : ''}>${label}</option>`;
  }).join('');
}

function nuevaLineaFactura() {
  facturaLineaSeq += 1;
  const productoId = primerProductoConStock();
  const producto = productoId ? productoById(productoId) : null;
  const cantidad = producto && producto.stock > 0 ? 1 : 0;
  return {
    id: facturaLineaSeq,
    productoId,
    cantidad,
    monto: producto ? producto.precio * cantidad : 0,
  };
}

function updateFacturaTotal() {
  const total = facturaLineas.reduce((sum, l) => sum + (Number(l.monto) || 0), 0);
  query('facturaTotal').textContent = `Total: ${fmt(total)}`;
}

function renderFacturaLineas() {
  const wrap = query('facturaLineas');
  wrap.innerHTML = facturaLineas.map(linea => {
    const producto = linea.productoId ? productoById(linea.productoId) : null;
    const sinStock = !producto || producto.stock <= 0;
    const warningHtml = sinStock
      ? '<div class="fl-warning">Sin unidades disponibles para este producto.</div>'
      : '';
    return `<div class="factura-linea" data-linea="${linea.id}">
        <select class="fl-producto">${productoOptionsHtml(linea.productoId)}</select>
        <input type="number" class="fl-cantidad" value="${linea.cantidad}" min="0" max="${producto ? producto.stock : 0}" ${sinStock ? 'disabled' : ''}>
        <input type="number" class="fl-monto" value="${linea.monto}" placeholder="0">
        <button type="button" class="icon-btn fl-remove" title="Quitar producto" ${facturaLineas.length <= 1 ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
        ${warningHtml}
      </div>`;
  }).join('');

  wrap.querySelectorAll('.factura-linea').forEach(row => {
    const lineaId = Number(row.dataset.linea);
    const linea = facturaLineas.find(l => l.id === lineaId);
    if (!linea) return;

    row.querySelector('.fl-producto').addEventListener('change', (e) => {
      const producto = productoById(e.target.value);
      linea.productoId = e.target.value;
      linea.cantidad = producto && producto.stock > 0 ? 1 : 0;
      linea.monto = producto ? producto.precio * linea.cantidad : 0;
      renderFacturaLineas();
    });

    row.querySelector('.fl-cantidad').addEventListener('input', (e) => {
      const producto = productoById(linea.productoId);
      const stockDisponible = producto ? producto.stock : 0;
      let cantidad = Number(e.target.value) || 0;
      if (cantidad > stockDisponible) cantidad = stockDisponible;
      if (cantidad < 0) cantidad = 0;
      e.target.value = cantidad;
      linea.cantidad = cantidad;
      linea.monto = producto ? producto.precio * cantidad : 0;
      row.querySelector('.fl-monto').value = linea.monto;
      updateFacturaTotal();
    });

    row.querySelector('.fl-monto').addEventListener('input', (e) => {
      linea.monto = Number(e.target.value) || 0;
      updateFacturaTotal();
    });

    row.querySelector('.fl-remove').addEventListener('click', () => {
      if (facturaLineas.length <= 1) return;
      facturaLineas = facturaLineas.filter(l => l.id !== lineaId);
      renderFacturaLineas();
    });
  });

  updateFacturaTotal();
}

function openFacturaModal() {
  populateSelects();
  facturaLineas = [nuevaLineaFactura()];
  renderFacturaLineas();
  getPaymentTypeSelect().value = paymentTypes.credito;
  query('fNota').value = '';
  syncPaymentType();
  modalFactura.style.display = 'flex';
}

function closeFacturaModal() {
  modalFactura.style.display = 'none';
}

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
  const totalPagado = facturas.reduce((sum, f) => sum + getFacturaPagadoTotal(f), 0);
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
  if (clienteId) {
    const cliente = clienteById(clienteId);
    query('modalClienteTitle').textContent = 'Editar cliente';
    query('icId').value = cliente.id;
    query('icNombre').value = cliente.nombre;
    query('icContacto').value = cliente.contacto || '';
  } else {
    query('modalClienteTitle').textContent = 'Nuevo cliente';
    query('icId').value = '';
    query('icNombre').value = '';
    query('icContacto').value = '';
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

function downloadCsv(filename, rows) {
  if (!rows || rows.length === 0) {
    alert('No hay datos para exportar.');
    return;
  }
  const escapeCell = (value) => {
    if (value === null || value === undefined) return '';
    const text = String(value).replace(/"/g, '""');
    return /[",\n\r]/.test(text) ? `"${text}"` : text;
  };
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.map(escapeCell).join(','),
    ...rows.map(row => headers.map(h => escapeCell(row[h])).join(','))
  ].join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

function exportarCsv() {
  let filename = 'fierro_export.csv';
  let rows = [];

  if (currentView === 'cxc') {
    const pendientes = state.facturas.filter(f => f.estadoPago === 'pendiente');
    rows = pendientes.map(f => {
      const c = clienteById(f.clienteId);
      const p = productoById(f.productoId);
      return {
        'Cliente': c ? c.nombre : '',
        'Contacto': c ? c.contacto : '',
        'Producto': p ? p.nombre : '',
        'Tipo de pago': invoicePaymentLabel(f.tipoPago),
        'Monto original': f.montoOriginal || f.monto,
        'Monto pendiente': f.monto,
        'Vencimiento': f.vencimiento.toLocaleDateString('es-CR'),
        'Estado': ({al_dia: 'Al día', por_vencer: 'Por vencer', vencido: 'Vencido'})[estadoFactura(f)],
        'Días de mora': diasMora(f),
        'Nota': f.nota || '',
      };
    });
    filename = 'cuentas_por_cobrar.csv';

  } else if (currentView === 'inventario') {
    rows = state.productos.map(p => ({
      'Producto': p.nombre,
      'SKU': p.sku,
      'Precio unitario': p.precio,
      'Stock actual': p.stock,
      'Stock mínimo': p.min,
      'Valor en inventario': p.precio * p.stock,
      'Estado': p.stock === 0 ? 'Agotado' : (p.stock <= p.min ? 'Stock bajo' : 'En stock'),
    }));
    filename = 'inventario.csv';

  } else if (currentView === 'clientes') {
    rows = state.clientes.map(c => {
      const fs = state.facturas.filter(f => f.clienteId === c.id && f.estadoPago === 'pendiente');
      const saldo = fs.reduce((s, f) => s + f.monto, 0);
      const tieneVencido = fs.some(f => estadoFactura(f) === 'vencido');
      return {
        'Cliente': c.nombre,
        'Contacto': c.contacto || '',
        'Facturas activas': fs.length,
        'Saldo pendiente': saldo,
        'Estado': fs.length === 0 ? 'Al día' : (tieneVencido ? 'Vencido' : 'Al día'),
      };
    });
    filename = 'clientes.csv';
  }

  downloadCsv(filename, rows);
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
  const isPortal = typeof authValue === 'string' && authValue.startsWith('portal:');
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

function attemptLogin() {
  const user = query('loginUser').value.trim();
  const pass = query('loginPass').value;
  const errBox = query('loginError');
  const VALID_USER = 'Cristian';
  const VALID_PASS = 'Cris1234';

  const portalUser = findPortalUserByUsername(user);
  if (portalUser && pass === portalUser.password) {
    setStoredAuth(`portal:${portalUser.username}`);
    errBox.style.display = 'none';
    checkAuth();
    return;
  }

  if (user === VALID_USER && pass === VALID_PASS) {
    setStoredAuth('admin');
    errBox.style.display = 'none';
    checkAuth();
  } else {
    errBox.style.display = 'block';
  }
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
    else openFacturaModal();
  });
  query('btnExport').addEventListener('click', exportarCsv);
  query('btnNewCliente').addEventListener('click', () => openClienteModal(null));

  query('btnAgregarLinea').addEventListener('click', () => {
    facturaLineas.push(nuevaLineaFactura());
    renderFacturaLineas();
  });
  getPaymentTypeSelect().addEventListener('change', syncPaymentType);

  query('saveFactura').addEventListener('click', () => {
    const clienteId = query('fCliente').value;
    const venc = query('fVencimiento').value;
    const nota = query('fNota').value.trim();
    const tipoPago = getPaymentTypeSelect().value;

    if (!venc) { alert('Seleccioná una fecha de vencimiento.'); return; }

    const lineasValidas = facturaLineas.filter(l => l.productoId && l.cantidad > 0 && l.monto > 0);
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

  query('closeModalFactura').addEventListener('click', closeFacturaModal);
  query('cancelFactura').addEventListener('click', closeFacturaModal);
  modalFactura.addEventListener('click', (e) => { if (e.target === modalFactura) closeFacturaModal(); });

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
    populateSelects();
    renderAll();
  });

  query('closeModalCliente').addEventListener('click', closeClienteModal);
  query('cancelCliente').addEventListener('click', closeClienteModal);
  modalCliente.addEventListener('click', (e) => { if (e.target === modalCliente) closeClienteModal(); });

  query('confirmDeleteCliente').addEventListener('click', () => {
    state.clientes = state.clientes.filter(c => c.id !== deletingClienteId);
    closeDeleteClienteModal();
    populateSelects();
    renderAll();
  });

  query('closeModalDeleteCliente').addEventListener('click', closeDeleteClienteModal);
  query('cancelDeleteCliente').addEventListener('click', closeDeleteClienteModal);
  modalDeleteCliente.addEventListener('click', (e) => { if (e.target === modalDeleteCliente) closeDeleteClienteModal(); });

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
