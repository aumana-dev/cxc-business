export function createInvoiceForm({
  query,
  state,
  fmt,
  productoById,
  toDateInputValue,
  paymentTypes,
  daysFromNowLocal,
  today,
  modalFactura,
}) {
  let facturaLineas = [];
  let facturaLineaSeq = 0;

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
    const total = facturaLineas.reduce((sum, linea) => sum + (Number(linea.monto) || 0), 0);
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
      const linea = facturaLineas.find(item => item.id === lineaId);
      if (!linea) return;

      row.querySelector('.fl-producto').addEventListener('change', (event) => {
        const producto = productoById(event.target.value);
        linea.productoId = event.target.value;
        linea.cantidad = producto && producto.stock > 0 ? 1 : 0;
        linea.monto = producto ? producto.precio * linea.cantidad : 0;
        renderFacturaLineas();
      });

      row.querySelector('.fl-cantidad').addEventListener('input', (event) => {
        const producto = productoById(linea.productoId);
        const stockDisponible = producto ? producto.stock : 0;
        let cantidad = Number(event.target.value) || 0;
        if (cantidad > stockDisponible) cantidad = stockDisponible;
        if (cantidad < 0) cantidad = 0;
        event.target.value = cantidad;
        linea.cantidad = cantidad;
        linea.monto = producto ? producto.precio * cantidad : 0;
        row.querySelector('.fl-monto').value = linea.monto;
        updateFacturaTotal();
      });

      row.querySelector('.fl-monto').addEventListener('input', (event) => {
        linea.monto = Number(event.target.value) || 0;
        updateFacturaTotal();
      });

      row.querySelector('.fl-remove').addEventListener('click', () => {
        if (facturaLineas.length <= 1) return;
        facturaLineas = facturaLineas.filter(item => item.id !== lineaId);
        renderFacturaLineas();
      });
    });

    updateFacturaTotal();
  }

  function openFacturaModal() {
    query('fCliente').innerHTML = state.clientes.map(cliente => `<option value="${cliente.id}">${cliente.nombre}</option>`).join('');
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

  query('btnAgregarLinea').addEventListener('click', () => {
    facturaLineas.push(nuevaLineaFactura());
    renderFacturaLineas();
  });
  getPaymentTypeSelect().addEventListener('change', syncPaymentType);
  query('closeModalFactura').addEventListener('click', closeFacturaModal);
  query('cancelFactura').addEventListener('click', closeFacturaModal);
  modalFactura.addEventListener('click', (event) => {
    if (event.target === modalFactura) closeFacturaModal();
  });

  return {
    getLines: () => facturaLineas,
    open: openFacturaModal,
    close: closeFacturaModal,
  };
}