/**
 * seed-portal-ana.ts
 * Siembra datos del portal para la clienta Ana Perez (beauty-glam):
 *   - PuntosCliente (1 250 puntos)
 *   - Membresia "Gold Beauty" + MembresiaSuscripcion activa
 *   - 3 ventas históricas pagadas para totalGastado real
 *
 * Idempotente: usa upsert / findFirst + create-if-missing en todos los pasos.
 * NO toca el schema ni lógica del backend.
 */

import {
  PrismaClient,
  VentaStatus,
  VentaOrigen,
  LineaTipo,
  PagoStatus,
  MembresiaPeriodo,
  MembresiaSuscripcionStatus,
  MembresiaBeneficioTipo,
} from '@prisma/client';

const prisma = new PrismaClient();

function daysAgo(n: number, h = 10, m = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(h, m, 0, 0);
  return d;
}

function calcTotales(precio: number) {
  const subtotal = precio;
  const itbis    = Math.round(subtotal * 0.18 * 100) / 100;
  const total    = subtotal + itbis;
  return { subtotal, itbis, total };
}

async function main() {
  // ── Localizar empresa y Ana Perez ──────────────────────────────
  const empresa = await prisma.empresa.findUniqueOrThrow({
    where: { slug: 'beauty-glam' },
  });

  const ana = await prisma.cliente.findFirstOrThrow({
    where: { empresaId: empresa.id, nombre: 'Ana Perez' },
  });

  const mpEfectivo = await prisma.metodoPago.findFirstOrThrow({
    where: { empresaId: empresa.id, nombre: 'Efectivo' },
  });

  const empleada = await prisma.empleado.findFirstOrThrow({
    where: { empresaId: empresa.id, nombre: 'Estefany Jimenez' },
  });

  const svcCorte   = await prisma.servicio.findFirstOrThrow({ where: { empresaId: empresa.id, nombre: 'Corte de dama'            } });
  const svcBlowout = await prisma.servicio.findFirstOrThrow({ where: { empresaId: empresa.id, nombre: 'Blowout'                  } });
  const svcTinte   = await prisma.servicio.findFirstOrThrow({ where: { empresaId: empresa.id, nombre: 'Tinte completo'           } });
  const svcMani    = await prisma.servicio.findFirstOrThrow({ where: { empresaId: empresa.id, nombre: 'Manicure'                 } });
  const svcPedi    = await prisma.servicio.findFirstOrThrow({ where: { empresaId: empresa.id, nombre: 'Pedicure'                 } });

  console.log(`  Empresa  : ${empresa.nombre} (${empresa.id})`);
  console.log(`  Cliente  : ${ana.nombre} (${ana.id})`);

  // ══════════════════════════════════════════════════════════════
  //  1. PUNTOS — upsert por clienteId (campo unique en el modelo)
  // ══════════════════════════════════════════════════════════════
  const puntosExistentes = await prisma.puntosCliente.findUnique({
    where: { clienteId: ana.id },
  });

  if (!puntosExistentes) {
    await prisma.puntosCliente.create({
      data: {
        empresaId: empresa.id,
        clienteId: ana.id,
        saldo:     1250,
        movimientos: {
          create: [
            {
              empresaId:  empresa.id,
              tipo:       'GANADO',
              puntos:     500,
              descripcion: 'Puntos por visita - Tinte completo',
              fecha:      daysAgo(90),
            },
            {
              empresaId:  empresa.id,
              tipo:       'GANADO',
              puntos:     450,
              descripcion: 'Puntos por visita - Balayage',
              fecha:      daysAgo(45),
            },
            {
              empresaId:  empresa.id,
              tipo:       'GANADO',
              puntos:     300,
              descripcion: 'Puntos por visita - Corte + Blowout',
              fecha:      daysAgo(20),
            },
          ],
        },
      },
    });
    console.log('  ✓ PuntosCliente creado (saldo: 1 250)');
  } else if (puntosExistentes.saldo !== 1250) {
    await prisma.puntosCliente.update({
      where: { clienteId: ana.id },
      data:  { saldo: 1250 },
    });
    console.log(`  ✓ PuntosCliente actualizado → 1 250 (era ${puntosExistentes.saldo})`);
  } else {
    console.log('  · PuntosCliente ya existe (1 250) — sin cambios');
  }

  // ══════════════════════════════════════════════════════════════
  //  2. MEMBRESÍA — plantilla "Gold Beauty" + suscripción activa
  // ══════════════════════════════════════════════════════════════

  // 2a. Plantilla
  let membresia = await prisma.membresia.findFirst({
    where: { empresaId: empresa.id, nombre: 'Gold Beauty' },
  });
  if (!membresia) {
    membresia = await prisma.membresia.create({
      data: {
        empresaId:  empresa.id,
        nombre:     'Gold Beauty',
        descripcion:'Plan premium para clientas frecuentes',
        precio:     1500,
        periodo:    MembresiaPeriodo.MENSUAL,
        activa:     true,
        beneficios: {
          create: [
            {
              tipo:        MembresiaBeneficioTipo.CANTIDAD,
              servicioId:  svcCorte.id,
              descripcion: '2 cortes de dama/mes',
              cantidad:    2,
            },
            {
              tipo:        MembresiaBeneficioTipo.ILIMITADO,
              servicioId:  svcBlowout.id,
              descripcion: 'Blowout ilimitado',
            },
            {
              tipo:        MembresiaBeneficioTipo.DESCUENTO,
              descripcion: '10% de descuento en productos',
              descuentoPct: 10,
              aplicaA:     'PRODUCTOS',
            },
          ],
        },
      },
    });
    console.log('  ✓ Membresia "Gold Beauty" creada');
  } else {
    console.log('  · Membresia "Gold Beauty" ya existe — sin cambios');
  }

  // 2b. Suscripción activa para Ana
  const subExistente = await prisma.membresiaSuscripcion.findFirst({
    where: { clienteId: ana.id, estado: MembresiaSuscripcionStatus.ACTIVE },
  });
  if (!subExistente) {
    const ini = daysAgo(15);
    const fin = new Date(ini);
    fin.setMonth(fin.getMonth() + 1);
    await prisma.membresiaSuscripcion.create({
      data: {
        empresaId:      empresa.id,
        membresiaId:    membresia.id,
        clienteId:      ana.id,
        vigenciaIni:    ini,
        vigenciaFin:    fin,
        estado:         MembresiaSuscripcionStatus.ACTIVE,
        renovacionAuto: true,
        precioPagado:   1500,
      },
    });
    console.log('  ✓ MembresiaSuscripcion ACTIVE creada (vence 1 mes)');
  } else {
    console.log('  · Suscripcion activa ya existe — sin cambios');
  }

  // ══════════════════════════════════════════════════════════════
  //  3. VENTAS HISTÓRICAS (3 ventas pagadas para totalGastado)
  //     Sólo crea si Ana no tiene ventas históricas (createdAt < hoy)
  // ══════════════════════════════════════════════════════════════
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const ventasHistExistentes = await prisma.venta.count({
    where: { clienteId: ana.id, createdAt: { lt: hoy } },
  });

  if (ventasHistExistentes === 0) {
    const { _max: { numero: maxNum } } = await prisma.venta.aggregate({
      where: { empresaId: empresa.id },
      _max:  { numero: true },
    });
    let nextNum = (maxNum ?? 0) + 1;

    // Venta 1: hace 90 días — Corte de dama + Blowout
    {
      const precio1 = Number(svcCorte.precio) + Number(svcBlowout.precio); // 800 + 700 = 1500
      const { subtotal, itbis, total } = calcTotales(precio1);
      const fecha = daysAgo(90, 10, 30);
      await prisma.venta.create({
        data: {
          empresaId:  empresa.id,
          sucursalId: (await prisma.sucursal.findFirstOrThrow({ where: { empresaId: empresa.id } })).id,
          clienteId:  ana.id,
          empleadoId: empleada.id,
          numero:     nextNum++,
          origen:     VentaOrigen.DIRECTA,
          subtotal,
          descuento:  0,
          itbis,
          propina:    0,
          total,
          saldo:      0,
          estado:     VentaStatus.PAGADA,
          createdAt:  fecha,
          detalles: {
            create: [
              { tipo: LineaTipo.SERVICIO, servicioId: svcCorte.id,   empleadoId: empleada.id, descripcion: svcCorte.nombre,   cantidad: 1, precioUnit: Number(svcCorte.precio),   descuento: 0, subtotal: Number(svcCorte.precio)   },
              { tipo: LineaTipo.SERVICIO, servicioId: svcBlowout.id, empleadoId: empleada.id, descripcion: svcBlowout.nombre, cantidad: 1, precioUnit: Number(svcBlowout.precio), descuento: 0, subtotal: Number(svcBlowout.precio) },
            ],
          },
          pagos: {
            create: [{ metodoPagoId: mpEfectivo.id, empleadoId: empleada.id, monto: total, estado: PagoStatus.CONFIRMED }],
          },
        },
      });
      console.log(`  ✓ Venta #${nextNum - 1}: Corte + Blowout (RD$ ${total.toFixed(2)}) hace 90 días`);
    }

    // Venta 2: hace 45 días — Tinte completo
    {
      const { subtotal, itbis, total } = calcTotales(Number(svcTinte.precio)); // 1800
      const fecha = daysAgo(45, 14, 0);
      await prisma.venta.create({
        data: {
          empresaId:  empresa.id,
          sucursalId: (await prisma.sucursal.findFirstOrThrow({ where: { empresaId: empresa.id } })).id,
          clienteId:  ana.id,
          empleadoId: empleada.id,
          numero:     nextNum++,
          origen:     VentaOrigen.DIRECTA,
          subtotal,
          descuento:  0,
          itbis,
          propina:    0,
          total,
          saldo:      0,
          estado:     VentaStatus.PAGADA,
          createdAt:  fecha,
          detalles: {
            create: [{ tipo: LineaTipo.SERVICIO, servicioId: svcTinte.id, empleadoId: empleada.id, descripcion: svcTinte.nombre, cantidad: 1, precioUnit: Number(svcTinte.precio), descuento: 0, subtotal: Number(svcTinte.precio) }],
          },
          pagos: {
            create: [{ metodoPagoId: mpEfectivo.id, empleadoId: empleada.id, monto: total, estado: PagoStatus.CONFIRMED }],
          },
        },
      });
      console.log(`  ✓ Venta #${nextNum - 1}: Tinte completo (RD$ ${total.toFixed(2)}) hace 45 días`);
    }

    // Venta 3: hace 20 días — Manicure + Pedicure
    {
      const precio3 = Number(svcMani.precio) + Number(svcPedi.precio); // 600 + 700 = 1300
      const { subtotal, itbis, total } = calcTotales(precio3);
      const fecha = daysAgo(20, 11, 0);

      const sucursal = await prisma.sucursal.findFirstOrThrow({ where: { empresaId: empresa.id } });
      const manicurista = await prisma.empleado.findFirstOrThrow({ where: { empresaId: empresa.id, nombre: 'Laura Santos' } });

      await prisma.venta.create({
        data: {
          empresaId:  empresa.id,
          sucursalId: sucursal.id,
          clienteId:  ana.id,
          empleadoId: manicurista.id,
          numero:     nextNum++,
          origen:     VentaOrigen.DIRECTA,
          subtotal,
          descuento:  0,
          itbis,
          propina:    0,
          total,
          saldo:      0,
          estado:     VentaStatus.PAGADA,
          createdAt:  fecha,
          detalles: {
            create: [
              { tipo: LineaTipo.SERVICIO, servicioId: svcMani.id, empleadoId: manicurista.id, descripcion: svcMani.nombre, cantidad: 1, precioUnit: Number(svcMani.precio), descuento: 0, subtotal: Number(svcMani.precio) },
              { tipo: LineaTipo.SERVICIO, servicioId: svcPedi.id, empleadoId: manicurista.id, descripcion: svcPedi.nombre, cantidad: 1, precioUnit: Number(svcPedi.precio), descuento: 0, subtotal: Number(svcPedi.precio) },
            ],
          },
          pagos: {
            create: [{ metodoPagoId: mpEfectivo.id, empleadoId: manicurista.id, monto: total, estado: PagoStatus.CONFIRMED }],
          },
        },
      });
      console.log(`  ✓ Venta #${nextNum - 1}: Manicure + Pedicure (RD$ ${total.toFixed(2)}) hace 20 días`);
    }

    // Total esperado: 1500+1800+1300 = 4600 base + ITBIS = RD$ 5,428
    console.log(`  ✓ 3 ventas históricas creadas. totalGastado esperado ≈ RD$ 5,428`);
  } else {
    console.log(`  · Ya existen ${ventasHistExistentes} ventas históricas de Ana — sin cambios`);
  }

  console.log('\n Seed-portal-ana completado ✓');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
