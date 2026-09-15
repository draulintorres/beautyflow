import {
  PrismaClient,
  RoleKey,
  Vertical,
  CitaStatus,
  CitaOrigen,
  VentaStatus,
  VentaOrigen,
  LineaTipo,
  PagoStatus,
  InventarioTipo,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function todayAt(h: number, m: number): Date {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function addMinutes(d: Date, mins: number): Date {
  return new Date(d.getTime() + mins * 60_000);
}

async function main() {
  // ══════════════════════════════════════════════════════
  //  1. EMPRESA
  // ══════════════════════════════════════════════════════
  const empresa = await prisma.empresa.upsert({
    where: { slug: 'beauty-glam' },
    update: {},
    create: {
      nombre: 'Beauty Glam',
      slug: 'beauty-glam',
      rnc: '1-31-12345-6',
      telefono: '809-555-0100',
      direccion: 'Naco, Santo Domingo',
      verticales: [Vertical.SALON, Vertical.NAIL_BAR],
      itbisPct: 18,
      permiteFiao: true,
    },
  });

  // ══════════════════════════════════════════════════════
  //  2. SUCURSAL PRINCIPAL
  // ══════════════════════════════════════════════════════
  let sucursal = await prisma.sucursal.findFirst({
    where: { empresaId: empresa.id, esPrincipal: true },
  });
  if (!sucursal) {
    sucursal = await prisma.sucursal.create({
      data: {
        empresaId: empresa.id,
        nombre: 'Sucursal Principal',
        esPrincipal: true,
        direccion: 'Naco, Santo Domingo',
        telefono: '809-555-0100',
        activo: true,
      },
    });
  }

  // ══════════════════════════════════════════════════════
  //  3. ROLES DEL SISTEMA
  // ══════════════════════════════════════════════════════
  const rolesData: { nombre: string; roleKey: RoleKey }[] = [
    { nombre: 'Dueno', roleKey: RoleKey.OWNER },
    { nombre: 'Administrador', roleKey: RoleKey.ADMIN },
    { nombre: 'Encargado', roleKey: RoleKey.MANAGER },
    { nombre: 'Cajero', roleKey: RoleKey.CASHIER },
    { nombre: 'Recepcion', roleKey: RoleKey.RECEPCION },
    { nombre: 'Estilista', roleKey: RoleKey.ESTILISTA },
    { nombre: 'Manicurista', roleKey: RoleKey.MANICURISTA },
  ];
  for (const r of rolesData) {
    await prisma.rol.upsert({
      where: { empresaId_nombre: { empresaId: empresa.id, nombre: r.nombre } },
      update: {},
      create: { empresaId: empresa.id, nombre: r.nombre, roleKey: r.roleKey, esSistema: true },
    });
  }
  const ownerRol = await prisma.rol.findFirstOrThrow({
    where: { empresaId: empresa.id, roleKey: RoleKey.OWNER },
  });

  // ══════════════════════════════════════════════════════
  //  4. USUARIO OWNER
  // ══════════════════════════════════════════════════════
  const passwordHash = await bcrypt.hash('Password123', 12);
  const luisUsuario = await prisma.usuario.upsert({
    where: { empresaId_email: { empresaId: empresa.id, email: 'owner@beautyglam.do' } },
    update: {},
    create: {
      empresaId: empresa.id,
      rolId: ownerRol.id,
      nombre: 'Luis Rodriguez',
      email: 'owner@beautyglam.do',
      passwordHash,
    },
  });

  // Crear Empleado vinculado a Luis (no participa en agenda — rol administrativo)
  const luisEmpleado = await prisma.empleado.findFirst({
    where: { empresaId: empresa.id, usuarioId: luisUsuario.id },
  });
  if (!luisEmpleado) {
    await prisma.empleado.create({
      data: {
        empresaId: empresa.id,
        usuarioId: luisUsuario.id,
        nombre: 'Luis Rodriguez',
        puesto: 'Administración',
        activo: true,
        participaAgenda: false,
      },
    });
  }

  // ══════════════════════════════════════════════════════
  //  5. METODOS DE PAGO
  // ══════════════════════════════════════════════════════
  const mpDefs = [
    { nombre: 'Efectivo',       esEfectivo: true,  orden: 1 },
    { nombre: 'Tarjeta',        esEfectivo: false, orden: 2 },
    { nombre: 'Transferencia',  esEfectivo: false, orden: 3 },
  ];
  for (const mp of mpDefs) {
    await prisma.metodoPago.upsert({
      where: { empresaId_nombre: { empresaId: empresa.id, nombre: mp.nombre } },
      update: {},
      create: { empresaId: empresa.id, ...mp, activo: true },
    });
  }
  const mpEfectivo = await prisma.metodoPago.findFirstOrThrow({
    where: { empresaId: empresa.id, nombre: 'Efectivo' },
  });

  // ══════════════════════════════════════════════════════
  //  6. CATEGORIAS DE SERVICIO
  // ══════════════════════════════════════════════════════
  const catDefs = [
    { nombre: 'Cabello',       vertical: Vertical.SALON,    orden: 1 },
    { nombre: 'Unas',          vertical: Vertical.NAIL_BAR, orden: 2 },
    { nombre: 'Tratamientos',  vertical: Vertical.SALON,    orden: 3 },
  ];
  for (const cat of catDefs) {
    await prisma.categoriaServicio.upsert({
      where: { empresaId_nombre: { empresaId: empresa.id, nombre: cat.nombre } },
      update: {},
      create: { empresaId: empresa.id, ...cat, activo: true },
    });
  }
  const catCabello = await prisma.categoriaServicio.findFirstOrThrow({
    where: { empresaId: empresa.id, nombre: 'Cabello' },
  });
  const catUnas = await prisma.categoriaServicio.findFirstOrThrow({
    where: { empresaId: empresa.id, nombre: 'Unas' },
  });
  const catTrat = await prisma.categoriaServicio.findFirstOrThrow({
    where: { empresaId: empresa.id, nombre: 'Tratamientos' },
  });

  // ══════════════════════════════════════════════════════
  //  7. SERVICIOS
  // ══════════════════════════════════════════════════════
  const svcDefs = [
    { nombre: 'Corte de dama',           categoriaId: catCabello.id, precio: 800,  duracionMin: 45,  vertical: Vertical.SALON },
    { nombre: 'Blowout',                 categoriaId: catCabello.id, precio: 700,  duracionMin: 45,  vertical: Vertical.SALON },
    { nombre: 'Tinte completo',          categoriaId: catCabello.id, precio: 1800, duracionMin: 120, vertical: Vertical.SALON },
    { nombre: 'Balayage',               categoriaId: catCabello.id, precio: 3500, duracionMin: 150, vertical: Vertical.SALON },
    { nombre: 'Manicure',               categoriaId: catUnas.id,    precio: 600,  duracionMin: 40,  vertical: Vertical.NAIL_BAR },
    { nombre: 'Pedicure',               categoriaId: catUnas.id,    precio: 700,  duracionMin: 50,  vertical: Vertical.NAIL_BAR },
    { nombre: 'Unas acrilicas',         categoriaId: catUnas.id,    precio: 1200, duracionMin: 90,  vertical: Vertical.NAIL_BAR },
    { nombre: 'Tratamiento hidratacion',categoriaId: catTrat.id,    precio: 1500, duracionMin: 60,  vertical: Vertical.SALON },
    { nombre: 'Corte de caballero',     categoriaId: catCabello.id, precio: 500,  duracionMin: 30,  vertical: Vertical.SALON },
  ];
  const svc: Record<string, any> = {};
  for (const s of svcDefs) {
    let found = await prisma.servicio.findFirst({ where: { empresaId: empresa.id, nombre: s.nombre } });
    if (!found) {
      found = await prisma.servicio.create({
        data: { empresaId: empresa.id, ...s, activo: true },
      });
    }
    svc[s.nombre] = found;
  }

  // ══════════════════════════════════════════════════════
  //  8. EMPLEADOS (5 con nombres dominicanos)
  // ══════════════════════════════════════════════════════
  const empDefs = [
    { nombre: 'Estefany Jimenez', puesto: 'Estilista',   telefono: '809-444-0011' },
    { nombre: 'Maria Rodriguez',  puesto: 'Estilista',   telefono: '809-444-0022' },
    { nombre: 'Laura Santos',     puesto: 'Manicurista', telefono: '809-444-0033' },
    { nombre: 'Carla Mendez',     puesto: 'Colorista',   telefono: '809-444-0044' },
    { nombre: 'Juliana Reyes',    puesto: 'Estilista',   telefono: '809-444-0055' },
  ];
  const emp: Record<string, any> = {};
  for (const e of empDefs) {
    let found = await prisma.empleado.findFirst({ where: { empresaId: empresa.id, nombre: e.nombre } });
    if (!found) {
      found = await prisma.empleado.create({
        data: {
          empresaId: empresa.id,
          sucursalId: sucursal.id,
          nombre: e.nombre,
          puesto: e.puesto,
          telefono: e.telefono,
          activo: true,
        },
      });
    }
    emp[e.nombre] = found;
  }

  // ══════════════════════════════════════════════════════
  //  8B. HORARIOS DE EMPLEADOS (Lun–Sáb 09:00–18:00)
  // ══════════════════════════════════════════════════════
  for (const e of Object.values(emp) as any[]) {
    for (let dia = 1; dia <= 6; dia++) { // 1=Lun … 6=Sáb
      const existe = await prisma.empleadoHorario.findFirst({
        where: { empleadoId: e.id, diaSemana: dia },
      });
      if (!existe) {
        await prisma.empleadoHorario.create({
          data: { empleadoId: e.id, diaSemana: dia, horaInicio: '09:00', horaFin: '18:00', activo: true },
        });
      }
    }
  }

  // ══════════════════════════════════════════════════════
  //  9. CLIENTES (10 con nombres dominicanos)
  // ══════════════════════════════════════════════════════
  const cliDefs = [
    { nombre: 'Ana Perez',       telefono: '809-201-1111', email: 'ana.perez@gmail.com',       daysAgo: 2,   limiteCredito: 5000 },
    { nombre: 'Sofia Reyes',     telefono: '809-201-2222', email: 'sofia.reyes@hotmail.com',   daysAgo: 5,   limiteCredito: 3000 },
    { nombre: 'Maria Gomez',     telefono: '809-201-3333', email: 'maria.gomez@gmail.com',     daysAgo: 90,  limiteCredito: 0    },
    { nombre: 'Juliana Diaz',    telefono: '809-201-4444', email: null,                        daysAgo: 120, limiteCredito: 2000 },
    { nombre: 'Isabel Castro',   telefono: '809-201-5555', email: 'isabel.castro@gmail.com',   daysAgo: 60,  limiteCredito: 8000 },
    { nombre: 'Paola Mena',      telefono: '809-201-6666', email: null,                        daysAgo: 3,   limiteCredito: 0    },
    { nombre: 'Carlos Mendez',   telefono: '809-201-7777', email: 'carlos.mendez@gmail.com',   daysAgo: 180, limiteCredito: 1500 },
    { nombre: 'Valeria Diaz',    telefono: '809-201-8888', email: null,                        daysAgo: 7,   limiteCredito: 0    },
    { nombre: 'Carmen Lugo',     telefono: '809-201-9999', email: 'carmen.lugo@yahoo.com',     daysAgo: 200, limiteCredito: 4000 },
    { nombre: 'Nicole Pichardo', telefono: '809-201-0000', email: null,                        daysAgo: 1,   limiteCredito: 0    },
  ];
  const cli: Record<string, any> = {};
  for (const c of cliDefs) {
    let found = await prisma.cliente.findFirst({ where: { empresaId: empresa.id, nombre: c.nombre } });
    if (!found) {
      found = await prisma.cliente.create({
        data: {
          empresaId: empresa.id,
          nombre: c.nombre,
          telefono: c.telefono,
          whatsapp: c.telefono,
          ...(c.email ? { email: c.email } : {}),
          activo: true,
          createdAt: daysAgo(c.daysAgo),
          limiteCredito: c.limiteCredito,
        },
      });
    } else {
      found = await prisma.cliente.update({
        where: { id: found.id },
        data: { limiteCredito: c.limiteCredito },
      });
    }
    cli[c.nombre] = found;
  }

  // ══════════════════════════════════════════════════════
  //  10. LIMPIEZA DE DATOS DE HOY (idempotencia)
  //      Orden obligatorio por FK: ventas -> citas
  // ══════════════════════════════════════════════════════
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  // Ventas de hoy (cascade elimina pagos y detalles)
  await prisma.venta.deleteMany({
    where: { empresaId: empresa.id, createdAt: { gte: todayStart, lt: tomorrowStart } },
  });
  // Citas de hoy (cascade elimina cita_servicios)
  await prisma.cita.deleteMany({
    where: { empresaId: empresa.id, inicio: { gte: todayStart, lt: tomorrowStart } },
  });

  // ══════════════════════════════════════════════════════
  //  11. CITAS DE HOY (12 citas, 5 estados distintos)
  // ══════════════════════════════════════════════════════
  const ITBIS = 0.18;
  function calcTotales(precioBase: number) {
    const subtotal = precioBase;
    const itbis    = Math.round(subtotal * ITBIS * 100) / 100;
    const total    = subtotal + itbis;
    return { subtotal, itbis, total };
  }

  type CitaDef = {
    cliente: string;
    empleado: string;
    svcs: string[];
    h: number; m: number;
    estado: CitaStatus;
    notas?: string;
  };

  const citasDef: CitaDef[] = [
    { cliente: 'Ana Perez',       empleado: 'Estefany Jimenez', svcs: ['Corte de dama'],             h: 9,  m: 0,  estado: CitaStatus.CONFIRMED,    notas: 'Prefiere tijeras, no maquinilla' },
    { cliente: 'Sofia Reyes',     empleado: 'Maria Rodriguez',  svcs: ['Tinte completo'],             h: 9,  m: 0,  estado: CitaStatus.CONFIRMED },
    { cliente: 'Juliana Diaz',    empleado: 'Laura Santos',     svcs: ['Manicure', 'Pedicure'],       h: 9,  m: 30, estado: CitaStatus.IN_PROGRESS },
    { cliente: 'Carlos Mendez',   empleado: 'Carla Mendez',     svcs: ['Corte de caballero'],         h: 10, m: 0,  estado: CitaStatus.CONFIRMED },
    { cliente: 'Isabel Castro',   empleado: 'Juliana Reyes',    svcs: ['Tratamiento hidratacion'],    h: 10, m: 0,  estado: CitaStatus.CONFIRMED },
    { cliente: 'Maria Gomez',     empleado: 'Estefany Jimenez', svcs: ['Blowout'],                    h: 11, m: 0,  estado: CitaStatus.SCHEDULED },
    { cliente: 'Paola Mena',      empleado: 'Laura Santos',     svcs: ['Unas acrilicas'],             h: 11, m: 30, estado: CitaStatus.SCHEDULED },
    { cliente: 'Valeria Diaz',    empleado: 'Maria Rodriguez',  svcs: ['Tinte completo'],             h: 13, m: 0,  estado: CitaStatus.COMPLETED },
    { cliente: 'Carmen Lugo',     empleado: 'Estefany Jimenez', svcs: ['Corte de dama'],              h: 14, m: 0,  estado: CitaStatus.SCHEDULED },
    { cliente: 'Nicole Pichardo', empleado: 'Laura Santos',     svcs: ['Unas acrilicas'],             h: 14, m: 30, estado: CitaStatus.CONFIRMED },
    { cliente: 'Ana Perez',       empleado: 'Carla Mendez',     svcs: ['Blowout'],                    h: 15, m: 0,  estado: CitaStatus.CANCELED,   notas: 'Cancelada por la cliente' },
    { cliente: 'Juliana Diaz',    empleado: 'Juliana Reyes',    svcs: ['Tratamiento hidratacion'],    h: 16, m: 0,  estado: CitaStatus.CONFIRMED },
  ];

  for (const def of citasDef) {
    const svcs      = def.svcs.map(n => svc[n]);
    const duracion  = svcs.reduce((s: number, x: any) => s + x.duracionMin, 0);
    const precioBase = svcs.reduce((s: number, x: any) => s + Number(x.precio), 0);
    const inicio    = todayAt(def.h, def.m);
    const fin       = addMinutes(inicio, duracion);
    const { subtotal, itbis, total } = calcTotales(precioBase);

    await prisma.cita.create({
      data: {
        empresaId: empresa.id,
        sucursalId: sucursal.id,
        clienteId:  cli[def.cliente].id,
        empleadoId: emp[def.empleado].id,
        inicio,
        fin,
        estado: def.estado,
        subtotal,
        itbis,
        total,
        origen: CitaOrigen.WEB,
        ...(def.notas ? { notas: def.notas } : {}),
        servicios: {
          create: svcs.map((s: any) => ({
            servicioId: s.id,
            precio:     Number(s.precio),
            duracionMin: s.duracionMin,
          })),
        },
      },
    });
  }

  // ══════════════════════════════════════════════════════
  //  12. VENTAS PAGADAS DE HOY (para el dashboard)
  //      3 ventas directas, estado PAGADA
  // ══════════════════════════════════════════════════════
  const { _max: { numero: maxNum } } = await prisma.venta.aggregate({
    where:  { empresaId: empresa.id },
    _max:   { numero: true },
  });
  let nextNum = (maxNum ?? 0) + 1;

  const ventasDef = [
    { cliente: 'Maria Gomez',   empleado: 'Estefany Jimenez', svcNombre: 'Blowout' },
    { cliente: 'Isabel Castro', empleado: 'Juliana Reyes',    svcNombre: 'Tratamiento hidratacion' },
    { cliente: 'Carlos Mendez', empleado: 'Carla Mendez',     svcNombre: 'Corte de caballero' },
  ];

  for (const def of ventasDef) {
    const s = svc[def.svcNombre];
    const { subtotal, itbis, total } = calcTotales(Number(s.precio));

    await prisma.venta.create({
      data: {
        empresaId:  empresa.id,
        sucursalId: sucursal.id,
        clienteId:  cli[def.cliente].id,
        empleadoId: emp[def.empleado].id,
        numero:     nextNum++,
        origen:     VentaOrigen.DIRECTA,
        subtotal,
        descuento:  0,
        itbis,
        propina:    0,
        total,
        saldo:      0,
        estado:     VentaStatus.PAGADA,
        detalles: {
          create: [{
            tipo:        LineaTipo.SERVICIO,
            servicioId:  s.id,
            empleadoId:  emp[def.empleado].id,
            descripcion: s.nombre,
            cantidad:    1,
            precioUnit:  Number(s.precio),
            descuento:   0,
            subtotal:    Number(s.precio),
          }],
        },
        pagos: {
          create: [{
            metodoPagoId: mpEfectivo.id,
            empleadoId:   emp[def.empleado].id,
            monto:        total,
            estado:       PagoStatus.CONFIRMED,
          }],
        },
      },
    });
  }

  // ══════════════════════════════════════════════════════
  //  13. CATEGORÍAS DE PRODUCTO
  // ══════════════════════════════════════════════════════
  const catProdDefs = [
    { nombre: 'Cabello',  descripcion: 'Shampoos, acondicionadores, tintes y tratamientos capilares' },
    { nombre: 'Unas',     descripcion: 'Esmaltes, geles, acetona y accesorios de manicure' },
    { nombre: 'Insumos',  descripcion: 'Consumibles internos del salón' },
  ];
  const catProd: Record<string, any> = {};
  for (const cp of catProdDefs) {
    let found = await prisma.categoriaProducto.findFirst({
      where: { empresaId: empresa.id, nombre: cp.nombre },
    });
    if (!found) {
      found = await prisma.categoriaProducto.create({
        data: { empresaId: empresa.id, ...cp, activo: true },
      });
    }
    catProd[cp.nombre] = found;
  }

  // ══════════════════════════════════════════════════════
  //  14. PRODUCTOS (12 productos de salón realistas)
  // ══════════════════════════════════════════════════════
  type ProdDef = {
    codigo: string;
    nombre: string;
    descripcion?: string;
    marca?: string;
    categoriaKey: string;
    tipo?: InventarioTipo;
    unidadMedida?: string;
    costo: number;
    precio: number;
    existencia: number;
    stockMinimo: number;
    permiteVentaSinStock?: boolean;
  };

  const prodDefs: ProdDef[] = [
    // — Cabello —
    {
      codigo: 'CAB-001', nombre: 'Shampoo Redken All Soft 500ml',
      descripcion: 'Shampoo nutritivo para cabello seco y quebradizo',
      marca: 'Redken', categoriaKey: 'Cabello', unidadMedida: 'unidad',
      costo: 650, precio: 1250, existencia: 15, stockMinimo: 5,
    },
    {
      codigo: 'CAB-002', nombre: 'Acondicionador Kerastase 200ml',
      descripcion: 'Acondicionador reparador para cabello dañado',
      marca: 'Kerastase', categoriaKey: 'Cabello', unidadMedida: 'unidad',
      costo: 900, precio: 1850, existencia: 10, stockMinimo: 3,
    },
    {
      codigo: 'CAB-003', nombre: 'Mascarilla Wella Professionals 500ml',
      descripcion: 'Mascarilla hidratante de uso profesional',
      marca: 'Wella', categoriaKey: 'Cabello', unidadMedida: 'unidad',
      costo: 750, precio: 1500, existencia: 8, stockMinimo: 3,
    },
    {
      codigo: 'CAB-004', nombre: 'Tinte L\'Oreal Casting 60ml',
      descripcion: 'Coloración semipermanente sin amoníaco',
      marca: 'L\'Oreal', categoriaKey: 'Cabello', unidadMedida: 'unidad',
      costo: 250, precio: 550, existencia: 30, stockMinimo: 10,
    },
    // — Uñas —
    {
      codigo: 'UNA-001', nombre: 'Esmalte OPI 15ml',
      descripcion: 'Esmalte profesional larga duración',
      marca: 'OPI', categoriaKey: 'Unas', unidadMedida: 'unidad',
      costo: 180, precio: 380, existencia: 40, stockMinimo: 10,
    },
    {
      codigo: 'UNA-002', nombre: 'Gel UV Builder IBD 30g',
      descripcion: 'Gel constructor para uñas acrílicas UV',
      marca: 'IBD', categoriaKey: 'Unas', unidadMedida: 'unidad',
      costo: 450, precio: 950, existencia: 12, stockMinimo: 4,
    },
    {
      codigo: 'UNA-003', nombre: 'Acetona Pura 500ml',
      descripcion: 'Acetona profesional para remoción de esmalte y acrílico',
      categoriaKey: 'Unas', unidadMedida: 'unidad',
      costo: 90, precio: 195, existencia: 20, stockMinimo: 5,
    },
    {
      codigo: 'UNA-004', nombre: 'Top Coat Seche Vite 14ml',
      descripcion: 'Sellador de acabado ultrabrillante de secado rápido',
      marca: 'Seche', categoriaKey: 'Unas', unidadMedida: 'unidad',
      costo: 200, precio: 420, existencia: 18, stockMinimo: 5,
    },
    // — Insumos (consumo interno) —
    {
      codigo: 'INS-001', nombre: 'Guantes de Látex 100 unid',
      descripcion: 'Guantes desechables para coloración y tratamientos',
      categoriaKey: 'Insumos', unidadMedida: 'caja',
      tipo: InventarioTipo.CONSUMO_INTERNO,
      costo: 280, precio: 580, existencia: 8, stockMinimo: 3,
    },
    {
      codigo: 'INS-002', nombre: 'Spray Tinte Temporal 150ml',
      descripcion: 'Color temporal en spray para efectos creativos',
      categoriaKey: 'Insumos', unidadMedida: 'unidad',
      costo: 350, precio: 750, existencia: 15, stockMinimo: 5,
    },
    {
      codigo: 'INS-003', nombre: 'Papel Aluminio 500 hojas',
      descripcion: 'Papel aluminio profesional para mechas y balayage',
      categoriaKey: 'Insumos', unidadMedida: 'paquete',
      tipo: InventarioTipo.CONSUMO_INTERNO,
      costo: 120, precio: 260, existencia: 6, stockMinimo: 2,
    },
    {
      codigo: 'INS-004', nombre: 'Aceite de Argán Moroccanoil 30ml',
      descripcion: 'Aceite tratante para brillo y suavidad del cabello',
      marca: 'Moroccanoil', categoriaKey: 'Insumos', unidadMedida: 'unidad',
      costo: 280, precio: 590, existencia: 20, stockMinimo: 5,
    },
  ];

  for (const p of prodDefs) {
    const exists = await prisma.producto.findFirst({
      where: { empresaId: empresa.id, codigo: p.codigo },
    });
    if (!exists) {
      await prisma.producto.create({
        data: {
          empresaId:    empresa.id,
          codigo:       p.codigo,
          nombre:       p.nombre,
          descripcion:  p.descripcion,
          marca:        p.marca,
          categoriaId:  catProd[p.categoriaKey].id,
          tipo:         p.tipo ?? InventarioTipo.VENTA,
          unidadMedida: p.unidadMedida,
          costo:        p.costo,
          precio:       p.precio,
          existencia:   p.existencia,
          stockMinimo:  p.stockMinimo,
          permiteVentaSinStock: p.permiteVentaSinStock ?? false,
          activo:       true,
        },
      });
    }
  }

  // ══════════════════════════════════════════════════════
  //  RESUMEN
  // ══════════════════════════════════════════════════════
  console.log('\n Seed completado exitosamente');
  console.log('  Empresa  : beauty-glam');
  console.log('  Login    : owner@beautyglam.do / Password123');
  console.log(`  Empleados: ${empDefs.length}`);
  console.log(`  Servicios: ${svcDefs.length}`);
  console.log(`  Clientes : ${cliDefs.length}`);
  console.log(`  Citas hoy: ${citasDef.length} (CONFIRMED:5 SCHEDULED:3 IN_PROGRESS:1 COMPLETED:1 CANCELED:1 + CONFIRMED:1)`);
  console.log(`  Ventas hoy (PAGADA): ${ventasDef.length}`);
  console.log(`  Cat. producto: ${catProdDefs.length} | Productos: ${prodDefs.length}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
