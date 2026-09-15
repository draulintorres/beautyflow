import { PrismaClient, PlanType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // ── Super Admin ──────────────────────────────────────────
  const hash = await bcrypt.hash('SuperPass123', 12);
  await prisma.superAdmin.upsert({
    where:  { email: 'admin@beautyflow.do' },
    update: {},
    create: {
      nombre:       'Estixa Admin',
      email:        'admin@beautyflow.do',
      passwordHash: hash,
      activo:       true,
    },
  });
  console.log('✓ SuperAdmin: admin@beautyflow.do / SuperPass123');

  // ── Planes SaaS ──────────────────────────────────────────
  // Trial y Básico: upsert por nombre (unique)
  const planesPorNombre = [
    {
      nombre: 'Trial', tipo: PlanType.TRIAL, precio: 0,
      maxUsuarios: 2, maxSucursales: 1, maxEmpleados: 3,
      modulos: ['cobros', 'comisiones', 'inventario', 'reportes', 'sucursales'],
      activo: true, orden: 1,
    },
    {
      nombre: 'Básico', tipo: PlanType.BASIC, precio: 2500,
      maxUsuarios: 5, maxSucursales: 1, maxEmpleados: 10,
      modulos: ['cobros', 'comisiones', 'inventario'], activo: true, orden: 2,
    },
    {
      nombre: 'Enterprise', tipo: PlanType.ENTERPRISE, precio: 7500,
      maxUsuarios: null, maxSucursales: null, maxEmpleados: null,
      modulos: ['cobros', 'comisiones', 'inventario', 'reportes', 'sucursales'],
      activo: true, orden: 4,
    },
  ];

  for (const p of planesPorNombre) {
    await prisma.plan.upsert({
      where:  { nombre: p.nombre },
      update: {
        precio: p.precio, modulos: p.modulos, orden: p.orden, activo: p.activo,
        maxUsuarios: p.maxUsuarios, maxSucursales: p.maxSucursales, maxEmpleados: p.maxEmpleados,
      },
      create: p,
    });
    console.log(`✓ Plan: ${p.nombre} — RD$ ${p.precio}/mes`);
  }

  // PRO: el registro puede llamarse "Pro" o "Profesional" según el run anterior.
  // Buscamos por tipo para renombrarlo/actualizarlo sin duplicar.
  const planPro = await prisma.plan.findFirst({ where: { tipo: PlanType.PRO } });
  if (planPro) {
    await prisma.plan.update({
      where: { id: planPro.id },
      data: {
        nombre: 'Profesional', precio: 4500,
        maxUsuarios: null, maxSucursales: null, maxEmpleados: null,
        modulos: ['cobros', 'comisiones', 'inventario', 'reportes'],
        activo: true, orden: 3,
      },
    });
    console.log('✓ Plan: Profesional — RD$ 4500/mes');
  } else {
    await prisma.plan.create({
      data: {
        nombre: 'Profesional', tipo: PlanType.PRO, precio: 4500,
        maxUsuarios: null, maxSucursales: null, maxEmpleados: null,
        modulos: ['cobros', 'comisiones', 'inventario', 'reportes'],
        activo: true, orden: 3,
      },
    });
    console.log('✓ Plan: Profesional — RD$ 4500/mes (creado)');
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
