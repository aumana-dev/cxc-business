import {
  monedas,
  convertToCRC,
  gananciaProducto,
  estadoVidaUtil as calculateEstadoVidaUtil,
  serieDuplicada as isSerieDuplicada,
} from './domain.js';

export { monedas, convertToCRC, gananciaProducto };

export const STORAGE_KEY = 'fierro_data_v1';
export const AUTH_KEY = 'fierro_auth_v1';

export const ADMIN_USERNAME = 'Cristian';
export const ADMIN_PASSWORD_HASH = '9ecdc9d6b66049cbc1c9fd658c2284cbde6d0921ff64e67fe369611bebf07e45';

export function seedPortalUsers() {
  return [
    {
      username: 'gimnasio-titan',
      passwordHash: 'a9004e774acb60851ed6826fd41dde8636cfc06471aedc25d3ce5230740db3a0',
      clientId: 'c1',
      label: 'Gimnasio Titán Pavas',
      activo: true,
    },
  ];
}

export function findPortalUserByUsername(username) {
  const users = (state && state.portalUsers) ? state.portalUsers : seedPortalUsers();
  return users.find(user => user.username === username);
}

export function revocarAccesoPortalCliente(clientId) {
  if (!state || !state.portalUsers) return;
  let modificado = false;
  state.portalUsers.forEach(user => {
    if (user.clientId === clientId && user.activo) {
      user.activo = false;
      user.revocadoEn = new Date().toISOString();
      modificado = true;
    }
  });
  if (modificado) {
    saveState();
  }
}

export const paymentTypes = {
  contado: 'contado',
  credito: 'credito',
};

export const today = new Date();
today.setHours(0, 0, 0, 0);

export function fmt(n) {
  return '₡' + Math.round(n).toLocaleString('es-CR');
}

export function isoDays(d) {
  return Math.round((d - today) / 86400000);
}

export function toDateInputValue(date) {
  return date instanceof Date ? date.toISOString().slice(0, 10) : '';
}

export function parseDateInputValue(value) {
  return value ? new Date(`${value}T00:00:00`) : null;
}

export function invoicePaymentLabel(tipo) {
  return tipo === paymentTypes.contado ? 'Contado' : 'Crédito';
}

export function daysAgoLocal(n) {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return d;
}

export function daysFromNowLocal(n) {
  const d = new Date(today);
  d.setDate(d.getDate() + n);
  return d;
}

function seedData() {
  const clientes = [
    { id: 'c1', nombre: 'Gimnasio Titán Pavas', contacto: '8888-1234' },
    { id: 'c2', nombre: 'PowerHouse Heredia', contacto: '8888-5678' },
    { id: 'c3', nombre: 'CrossFit Curridabat', contacto: '8888-9012' },
    { id: 'c4', nombre: 'Iron Box Cartago', contacto: '8888-3456' },
    { id: 'c5', nombre: 'Gym Élite San Pedro', contacto: '8888-7890' },
  ];

  const productos = [
    {
      id: 'p1', nombre: 'Rack de sentadillas 4 postes', sku: 'RCK-004', numeroSerie: 'RCK-004-0001',
      precio: 485000, stock: 3, min: 2,
      monedaCosto: 'USD', costoCompra: 260, gastosAdicionales: 45, porcentajeImportacionChina: 15, tipoCambioRegistro: 535,
    },
    {
      id: 'p2', nombre: 'Banco plano profesional', sku: 'BNC-001', numeroSerie: 'BNC-001-0001',
      precio: 95000, stock: 1, min: 3,
      monedaCosto: 'CRC', costoCompra: 32000, gastosAdicionales: 4000, porcentajeImportacionChina: 10, tipoCambioRegistro: null,
    },
    {
      id: 'p3', nombre: 'Set mancuernas hex 5-25kg', sku: 'MAN-525', numeroSerie: 'MAN-525-0001',
      precio: 620000, stock: 0, min: 2,
      monedaCosto: 'USD', costoCompra: 420, gastosAdicionales: 60, porcentajeImportacionChina: 12, tipoCambioRegistro: 535,
    },
    {
      id: 'p4', nombre: 'Caminadora eléctrica T200', sku: 'TRD-200', numeroSerie: 'TRD-200-0001',
      precio: 1250000, stock: 4, min: 2,
      monedaCosto: 'USD', costoCompra: 780, gastosAdicionales: 120, porcentajeImportacionChina: 18, tipoCambioRegistro: 535,
      fechaVidaUtil: daysAgoLocal(5),
    },
    {
      id: 'p5', nombre: 'Polea de cable funcional', sku: 'POL-001', numeroSerie: 'POL-001-0001',
      precio: 780000, stock: 2, min: 1,
      monedaCosto: 'USD', costoCompra: 480, gastosAdicionales: 70, porcentajeImportacionChina: 15, tipoCambioRegistro: 535,
      fechaVidaUtil: daysFromNowLocal(20),
    },
    {
      id: 'p6', nombre: 'Plataforma de levantamiento', sku: 'PLT-010', numeroSerie: 'PLT-010-0001',
      precio: 215000, stock: 6, min: 2,
      monedaCosto: 'CRC', costoCompra: 95000, gastosAdicionales: 8000, porcentajeImportacionChina: 8, tipoCambioRegistro: null,
    },
    {
      id: 'p7', nombre: 'Barra olímpica 20kg', sku: 'BAR-020', numeroSerie: 'BAR-020-0001',
      precio: 138000, stock: 9, min: 4,
      monedaCosto: 'CRC', costoCompra: 55000, gastosAdicionales: 5000, porcentajeImportacionChina: 10, tipoCambioRegistro: null,
    },
    {
      id: 'p8', nombre: 'Bicicleta spinning Pro', sku: 'BIC-300', numeroSerie: 'BIC-300-0001',
      precio: 540000, stock: 1, min: 2,
      monedaCosto: 'USD', costoCompra: 300, gastosAdicionales: 40, porcentajeImportacionChina: 15, tipoCambioRegistro: 535,
      fechaVidaUtil: daysFromNowLocal(400),
    },
  ];

  const facturas = [];

  return { clientes, productos, facturas, nextFacturaId: 1, nextProductoId: 9, nextClienteId: 6 };
}

function normalizeProduct(producto) {
  return {
    ...producto,
    numeroSerie: producto.numeroSerie || '',
    monedaVenta: producto.monedaVenta || monedas.crc,
    precioVentaOriginal: producto.precioVentaOriginal != null ? Number(producto.precioVentaOriginal) : Number(producto.precio) || 0,
    monedaCosto: producto.monedaCosto || monedas.crc,
    costoCompra: Number(producto.costoCompra) || 0,
    gastosAdicionales: Number(producto.gastosAdicionales) || 0,
    porcentajeImportacionChina: Number(producto.porcentajeImportacionChina) || 0,
    tipoCambioRegistro: producto.tipoCambioRegistro != null ? Number(producto.tipoCambioRegistro) : null,
    fechaVidaUtil: producto.fechaVidaUtil ? new Date(producto.fechaVidaUtil) : null,
  };
}

export function estadoVidaUtil(p) {
  return calculateEstadoVidaUtil(p, today);
}

export function serieDuplicada(numeroSerie, excludeId) {
  return isSerieDuplicada(numeroSerie, excludeId, state.productos);
}

function normalizeInvoice(invoice) {
  const pagos = Array.isArray(invoice.pagos) ? invoice.pagos.map(p => ({
    ...p,
    monto: Number(p.monto) || 0,
    fecha: p.fecha ? new Date(p.fecha) : new Date(),
  })) : [];

  const saldoActual = Number(invoice.monto) || 0;
  const montoOriginal = Number(invoice.montoOriginal || invoice.monto || 0);

  return {
    ...invoice,
    tipoPago: invoice.tipoPago || paymentTypes.contado,
    montoOriginal,
    monto: saldoActual > 0 ? saldoActual : 0,
    emision: invoice.emision ? new Date(invoice.emission || invoice.emision) : today,
    vencimiento: invoice.vencimiento ? new Date(invoice.vencimiento) : today,
    fechaPago: invoice.fechaPago ? new Date(invoice.fechaPago) : (pagos.length > 0 ? pagos[pagos.length - 1].fecha : undefined),
    pagos,
    estadoPago: invoice.estadoPago || (saldoActual <= 0 ? 'pagado' : 'pendiente'),
  };
}

export function loadState() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    raw = null;
  }

  if (!raw) {
    const seeded = seedData();
    return {
      ...seeded,
      productos: seeded.productos.map(normalizeProduct),
      portalUsers: seedPortalUsers(),
    };
  }

  try {
    const parsed = JSON.parse(raw);
    const facturas = (parsed.facturas || []).map(normalizeInvoice);
    const productos = (parsed.productos || []).map(normalizeProduct);
    const portalUsers = (parsed.portalUsers || seedPortalUsers()).map(u => ({
      ...u,
      passwordHash: u.passwordHash || 'a9004e774acb60851ed6826fd41dde8636cfc06471aedc25d3ce5230740db3a0',
      activo: u.activo !== false,
    }));

    return {
      clientes: parsed.clientes || [],
      productos,
      facturas,
      portalUsers,
      nextFacturaId: parsed.nextFacturaId || 1,
      nextProductoId: parsed.nextProductoId || 1,
      nextClienteId: parsed.nextClienteId || 1,
    };
  } catch (e) {
    console.error('Datos guardados corruptos, usando datos iniciales:', e);
    return { ...seedData(), portalUsers: seedPortalUsers() };
  }
}

export function serializeState() {
  return JSON.stringify({
    clientes: state.clientes,
    productos: state.productos.map(p => ({
      ...p,
      fechaVidaUtil: p.fechaVidaUtil instanceof Date ? p.fechaVidaUtil.toISOString() : (p.fechaVidaUtil || null),
    })),
    facturas: state.facturas.map(f => ({
      ...f,
      emision: f.emision instanceof Date ? f.emision.toISOString() : f.emision,
      vencimiento: f.vencimiento instanceof Date ? f.vencimiento.toISOString() : f.vencimiento,
      fechaPago: f.fechaPago instanceof Date ? f.fechaPago.toISOString() : (f.fechaPago || null),
      pagos: (f.pagos || []).map(p => ({
        ...p,
        fecha: p.fecha instanceof Date ? p.fecha.toISOString() : p.fecha,
      })),
    })),
    portalUsers: state.portalUsers || seedPortalUsers(),
    nextFacturaId: state.nextFacturaId,
    nextProductoId: state.nextProductoId,
    nextClienteId: state.nextClienteId,
  });
}

export function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, serializeState());
  } catch (e) {
    console.error('No se pudo guardar localmente:', e);
  }
}

export function clienteById(id) {
  return state.clientes.find(c => c.id === id);
}

export function productoById(id) {
  return state.productos.find(p => p.id === id);
}

export function estadoFactura(f) {
  if (f.estadoPago === 'pagado') return 'pagado';
  const dias = isoDays(f.vencimiento);
  if (dias < 0) return 'vencido';
  if (dias <= 7) return 'por_vencer';
  return 'al_dia';
}

export function diasMora(f) {
  const dias = isoDays(f.vencimiento);
  return dias < 0 ? Math.abs(dias) : 0;
}

export function createFactura({ clienteId, productoId, cantidad, monto, vencimiento, nota, tipoPago }) {
  const factura = {
    id: 'f' + state.nextFacturaId,
    clienteId,
    productoId,
    cantidad,
    monto,
    montoOriginal: monto,
    emision: new Date(),
    vencimiento: vencimiento || new Date(),
    estadoPago: 'pendiente',
    tipoPago: tipoPago || paymentTypes.contado,
    nota: nota || '',
    pagos: [],
  };
  state.facturas.push(factura);
  state.nextFacturaId += 1;

  const producto = productoById(productoId);
  if (producto) {
    producto.stock = Math.max(0, (Number(producto.stock) || 0) - (Number(cantidad) || 0));
  }

  saveState();
  return factura;
}

export function registrarPago(factura, { monto, fecha, nota = '' }) {
  if (!factura) return null;
  const montoRecibido = Math.max(0, Number(monto) || 0);
  const saldoActual = Math.max(0, Number(factura.monto) || 0);
  const pagoValido = Math.min(montoRecibido, saldoActual);

  if (pagoValido <= 0) return factura;

  const pago = {
    id: 'p' + Date.now() + Math.round(Math.random() * 1000),
    monto: pagoValido,
    fecha: fecha ? new Date(fecha) : new Date(),
    nota,
  };

  factura.pagos = factura.pagos || [];
  factura.pagos.push(pago);
  factura.monto = Math.max(0, saldoActual - pagoValido);
  factura.fechaPago = pago.fecha;
  factura.estadoPago = factura.monto <= 0 ? 'pagado' : 'pendiente';

  // Regla de seguridad: Si el cliente canceló la totalidad de su deuda (Saldo ₡0), revocar acceso al portal
  if (factura.clienteId) {
    const facturasPendientesCliente = state.facturas.filter(f => f.clienteId === factura.clienteId && f.estadoPago === 'pendiente' && (Number(f.monto) || 0) > 0);
    if (facturasPendientesCliente.length === 0) {
      revocarAccesoPortalCliente(factura.clienteId);
    }
  }

  saveState();
  return factura;
}

export const state = loadState();
