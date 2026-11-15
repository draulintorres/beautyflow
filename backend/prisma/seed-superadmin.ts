import { PrismaClient, PlanType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // ── Super Admin ──────────────────────────────────────────
  // La clave nunca va en este archivo: se lee de una variable de entorno
  // para no volver a exponerla en el repo (fue filtrada una vez con un
  // literal acá y ya está rotada).
  const superadminPassword = process.env.SUPERADMIN_SEED_PASSWORD;
  if (!superadminPassword) {
    throw new Error(
      'Falta SUPERADMIN_SEED_PASSWORD en el entorno — no se puede sembrar el SuperAdmin sin ella.',
    );
  }
  // El correo tampoco tiene default: "admin@beautyflow.do" era un correo
  // de marca vieja hardcodeado -- cada entorno (staging, producción)
  // debe sembrar el suyo explícitamente, sin reutilizar nada fijo acá.
  const superadminEmail = process.env.SUPERADMIN_SEED_EMAIL;
  if (!superadminEmail) {
    throw new Error(
      'Falta SUPERADMIN_SEED_EMAIL en el entorno — no se puede sembrar el SuperAdmin sin un correo.',
    );
  }
  const superadminNombre = process.env.SUPERADMIN_SEED_NAME || 'Estixa Admin';

  const hash = await bcrypt.hash(superadminPassword, 12);
  await prisma.superAdmin.upsert({
    where:  { email: superadminEmail },
    update: {},
    create: {
      nombre:       superadminNombre,
      email:        superadminEmail,
      passwordHash: hash,
      activo:       true,
    },
  });
  console.log(`✓ SuperAdmin: ${superadminEmail} (clave tomada de SUPERADMIN_SEED_PASSWORD)`);

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
