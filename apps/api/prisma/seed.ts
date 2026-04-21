import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding ComandaPro database...');

  // ── Crear negocio demo ──────────────────────────────────────────────────────
  const business = await prisma.business.upsert({
    where: { slug: 'pizzeria-bella' },
    update: {},
    create: {
      name: 'Pizzería Bella Italia',
      slug: 'pizzeria-bella',
      phone: '+34 912 345 678',
      address: 'Calle Gran Vía 45, Madrid',
      paperWidth: 80,
      printerMode: 'webusb',
      currency: 'EUR',
      taxRate: 10,
    },
  });

  console.log(`✅ Business: ${business.name} (${business.slug})`);

  // ── Crear usuario OWNER ─────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('admin1234', 12);

  const user = await prisma.user.upsert({
    where: { email: 'admin@pizzeria-bella.com' },
    update: {},
    create: {
      name: 'Giovanni Rossi',
      email: 'admin@pizzeria-bella.com',
      passwordHash,
    },
  });

  await prisma.businessUser.upsert({
    where: { userId_businessId: { userId: user.id, businessId: business.id } },
    update: {},
    create: { userId: user.id, businessId: business.id, role: 'OWNER' },
  });

  console.log(`✅ User: ${user.email} (password: admin1234)`);

  // ── Crear productos ─────────────────────────────────────────────────────────
  const products = [
    { name: 'Pizza Margherita', price: 10.5, stock: 50, category: 'Pizzas' },
    { name: 'Pizza Pepperoni', price: 12.0, stock: 40, category: 'Pizzas' },
    { name: 'Pizza Cuatro Quesos', price: 13.5, stock: 30, category: 'Pizzas' },
    { name: 'Pizza BBQ Pollo', price: 14.0, stock: 25, category: 'Pizzas' },
    { name: 'Calzone Jamón', price: 11.0, stock: 20, category: 'Calzone' },
    { name: 'Lasaña Boloñesa', price: 9.5, stock: 15, category: 'Pasta' },
    { name: 'Pasta Carbonara', price: 9.0, stock: 20, category: 'Pasta' },
    { name: 'Tiramisú', price: 4.5, stock: 10, category: 'Postres' },
    { name: 'Panna Cotta', price: 4.0, stock: 8, category: 'Postres' },
    { name: 'Coca-Cola 33cl', price: 2.5, stock: 100, category: 'Bebidas' },
    { name: 'Agua Mineral 50cl', price: 1.5, stock: 80, category: 'Bebidas' },
    { name: 'Cerveza Moretti', price: 3.0, stock: 60, category: 'Bebidas' },
    // Producto agotado para demo
    { name: 'Pizza Trufa Negra', price: 22.0, stock: 0, category: 'Especiales' },
  ];

  for (const p of products) {
    await prisma.product.upsert({
      where: { id: `seed-${p.name.replace(/\s+/g, '-').toLowerCase()}` },
      update: { stock: p.stock },
      create: {
        id: `seed-${p.name.replace(/\s+/g, '-').toLowerCase()}`,
        businessId: business.id,
        ...p,
      },
    });
  }

  console.log(`✅ ${products.length} productos creados`);

  // ── Crear clientes demo ─────────────────────────────────────────────────────
  const customers = [
    { name: 'Carlos García', phone: '612345678', address: 'Calle Alcalá 10, 2B' },
    { name: 'María López', phone: '698765432', address: 'Avenida Castellana 55, 4A' },
    { name: 'Pedro Sánchez', phone: '654321987', address: 'Calle Fuencarral 22, 1C' },
  ];

  for (const c of customers) {
    await prisma.customer.upsert({
      where: { businessId_phone: { businessId: business.id, phone: c.phone } },
      update: {},
      create: { ...c, businessId: business.id },
    });
  }

  console.log(`✅ ${customers.length} clientes creados`);

  console.log('\n🎉 Seed completado!');
  console.log('   Login: admin@pizzeria-bella.com / admin1234');
  console.log('   Business slug: pizzeria-bella');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
