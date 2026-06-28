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
  AUTH_KEY,
} from './state.js';

function query(id) {
  return document.getElementById(id);
}

function getPaymentTypeSelect() {
  return query('fTipoPago');
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

function renderKpisCxc() {
  const pendientes = state.facturas.filter(f => f.estadoPago === 'pendiente');
  const total = pendientes.reduce((s, f) => s + f.monto, 0);
  const vencidas = pendientes.filter(f => estadoFactura(f) === 'vencido');
  const vencidoMonto = vencidas.reduce((s, f) => s + f.monto, 0);
  const porVencer = pendientes.filter(f => estadoFactura(f) === 'por_vencer');
  const porVencerMonto = porVencer.reduce((s, f) => s + f.monto, 0);

  const cobradoMes = state.facturas.filter(f => f.estadoPago === 'pagado' && f.fechaPago &&
    f.fechaPago.getMonth() === new Date().getMonth() && f.fechaPago.getFullYear() === new Date().getFullYear());
  const cobradoMonto = cobradoMes.reduce((s, f) => s + f.monto, 0);

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

  let rows = state.facturas.filter(f => f.estadoPago === 'pendiente');
  if (filtro !== 'todos') {
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
            <td class="amount">${fmt(f.monto)}</td>
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

    return `<div class="inv-card">
        <div class="inv-card-top">
          <div>
            <div class="inv-name">${p.nombre}</div>
            <div class="inv-sku">${p.sku}</div>
          </div>
          <span class="inv-stock-badge ${badgeCls}">${badgeText}</span>
        </div>
        <div class="inv-bar-track"><div class="inv-bar-fill" style="width:${pct}%; background:${barColor};"></div></div>
        <div class="inv-meta">
          <span>${p.stock} unidad${p.stock === 1 ? '' : 'es'} · mín ${p.min}</span>
          <span class="price">${fmt(p.precio)}</span>
        </div>
      </div>`;
  }).join('');
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
      <thead><tr><th>Cliente</th><th>Contacto</th><th>Facturas activas</th><th>Saldo pendiente</th><th>Estado</th><th></th></tr></thead>
      <tbody>
        ${list.map(c => {
    const fs = state.facturas.filter(f => f.clienteId === c.id && f.estadoPago === 'pendiente');
    const saldo = fs.reduce((s, f) => s + f.monto, 0);
    const tieneVencido = fs.some(f => estadoFactura(f) === 'vencido');
    return `<tr>
            <td class="client-name">${c.nombre}</td>
            <td class="mono">${c.contacto || '—'}</td>
            <td>${fs.length}</td>
            <td class="amount">${fmt(saldo)}</td>
            <td>${fs.length === 0 ? statusPillHtml('al_dia') : (tieneVencido ? statusPillHtml('vencido') : statusPillHtml('al_dia'))}</td>
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

function populateSelects() {
  query('fCliente').innerHTML = state.clientes.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
  query('fProducto').innerHTML = state.productos.map(p => `<option value="${p.id}" data-precio="${p.precio}">${p.nombre} — ${fmt(p.precio)}</option>`).join('');
}

function openFacturaModal() {
  populateSelects();
  query('fCantidad').value = 1;
  query('fMonto').value = state.productos[0] ? state.productos[0].precio : '';
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
  query('pagoInfo').innerHTML = `
    <strong style="color:var(--bone)">${c ? c.nombre : 'Cliente'}</strong> — ${p ? p.nombre : 'Producto'}<br>
    Tipo: <strong>${invoicePaymentLabel(f.tipoPago)}</strong><br>
    Saldo pendiente: <span class="mono" style="color:var(--rust-bright); font-weight:700;">${fmt(f.monto)}</span>`;
  query('pMonto').value = f.monto;
  query('pFecha').value = toDateInputValue(today);
  modalPago.style.display = 'flex';
}

function closePagoModal() {
  modalPago.style.display = 'none';
  pagoFacturaId = null;
}

function openProductoModal() {
  query('ipNombre').value = '';
  query('ipSku').value = '';
  query('ipPrecio').value = '';
  query('ipStock').value = '';
  query('ipMin').value = '';
  modalProducto.style.display = 'flex';
}

function closeProductoModal() {
  modalProducto.style.display = 'none';
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

function checkAuth() {
  // Login gate disabled so the app shows tables immediately.
  document.body.classList.remove('locked');
  const loginScreen = document.getElementById('loginScreen');
  if (loginScreen) loginScreen.style.display = 'none';
}

function attemptLogin() {
  const user = query('loginUser').value.trim();
  const pass = query('loginPass').value;
  const errBox = query('loginError');
  const VALID_USER = 'Cristian';
  const VALID_PASS = 'Cris1234';

  if (user === VALID_USER && pass === VALID_PASS) {
    try { sessionStorage.setItem(AUTH_KEY, '1'); } catch (e) { }
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

  query('fProducto').addEventListener('change', (e) => {
    const opt = e.target.selectedOptions[0];
    const precio = Number(opt.dataset.precio);
    const cant = Number(query('fCantidad').value) || 1;
    query('fMonto').value = precio * cant;
  });
  query('fCantidad').addEventListener('input', (e) => {
    const sel = query('fProducto');
    const opt = sel.selectedOptions[0];
    if (!opt) return;
    const precio = Number(opt.dataset.precio);
    const cant = Number(e.target.value) || 1;
    query('fMonto').value = precio * cant;
  });
  getPaymentTypeSelect().addEventListener('change', syncPaymentType);

  query('saveFactura').addEventListener('click', () => {
    const clienteId = query('fCliente').value;
    const productoId = query('fProducto').value;
    const cantidad = Number(query('fCantidad').value) || 1;
    const monto = Number(query('fMonto').value);
    const venc = query('fVencimiento').value;
    const nota = query('fNota').value.trim();
    const tipoPago = getPaymentTypeSelect().value;

    if (!monto || monto <= 0) { alert('Ingresá un monto válido.'); return; }
    if (!venc) { alert('Seleccioná una fecha de vencimiento.'); return; }

    createFactura({
      clienteId,
      productoId,
      cantidad,
      monto,
      vencimiento: parseDateInputValue(venc),
      nota,
      tipoPago,
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

    if (monto >= f.monto) {
      f.estadoPago = 'pagado';
      f.fechaPago = parseDateInputValue(fecha);
    } else {
      f.monto = f.monto - monto;
    }

    closePagoModal();
    renderAll();
  });

  query('closeModalPago').addEventListener('click', closePagoModal);
  query('cancelPago').addEventListener('click', closePagoModal);
  modalPago.addEventListener('click', (e) => { if (e.target === modalPago) closePagoModal(); });

  query('saveProducto').addEventListener('click', () => {
    const nombre = query('ipNombre').value.trim();
    const sku = query('ipSku').value.trim();
    const precio = Number(query('ipPrecio').value);
    const stock = Number(query('ipStock').value);
    const min = Number(query('ipMin').value);

    if (!nombre) { alert('Ingresá el nombre del producto.'); return; }
    if (!precio || precio <= 0) { alert('Ingresá un precio válido.'); return; }

    state.productos.push({
      id: 'p' + state.nextProductoId,
      nombre,
      sku: sku || ('SKU-' + state.nextProductoId),
      precio,
      stock: stock || 0,
      min: min || 0,
    });
    state.nextProductoId += 1;
    closeProductoModal();
    renderAll();
  });

  query('closeModalProducto').addEventListener('click', closeProductoModal);
  query('cancelProducto').addEventListener('click', closeProductoModal);
  modalProducto.addEventListener('click', (e) => { if (e.target === modalProducto) closeProductoModal(); });

  query('btnLogout').addEventListener('click', () => {
    try { sessionStorage.removeItem(AUTH_KEY); } catch (e) { }
    query('loginUser').value = '';
    query('loginPass').value = '';
    checkAuth();
  });

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
