const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Supabase PostgreSQL database with EstatePro data...');

  // Hash demo password
  const salt = await bcrypt.genSalt(10);
  const demoPasswordHash = await bcrypt.hash('Admin@12345', salt);

  // 1. Seed Estates
  const sunrise = await prisma.estate.upsert({
    where: { code: 'SUN-001' },
    update: {},
    create: {
      name: 'Sunrise Estate',
      code: 'SUN-001',
      address: 'Plot 12, Lekki Phase 1, Lekki-Epe Expressway',
      city: 'Lekki',
      state: 'Lagos',
      country: 'Nigeria',
      totalUnits: 120,
      occupancyRate: 92,
      imageUrl: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=600&auto=format&fit=crop&q=80',
      requireVisitorImage: true,
      requireVehicleImage: false
    }
  });

  const maple = await prisma.estate.upsert({
    where: { code: 'MAP-002' },
    update: {},
    create: {
      name: 'Maple Residency',
      code: 'MAP-002',
      address: '44 Glover Road, Ikoyi',
      city: 'Ikoyi',
      state: 'Lagos',
      country: 'Nigeria',
      totalUnits: 80,
      occupancyRate: 85,
      imageUrl: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=600&auto=format&fit=crop&q=80',
      requireVisitorImage: true,
      requireVehicleImage: true
    }
  });

  const lakeside = await prisma.estate.upsert({
    where: { code: 'LAK-003' },
    update: {},
    create: {
      name: 'Lakeside Court',
      code: 'LAK-003',
      address: 'Admiralty Way, Victoria Island Extension',
      city: 'Victoria Island',
      state: 'Lagos',
      country: 'Nigeria',
      totalUnits: 60,
      occupancyRate: 78,
      imageUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=600&auto=format&fit=crop&q=80',
      requireVisitorImage: true,
      requireVehicleImage: false
    }
  });

  const pineview = await prisma.estate.upsert({
    where: { code: 'PIN-004' },
    update: {},
    create: {
      name: 'Pineview Estate',
      code: 'PIN-004',
      address: 'Banana Island Boulevard, Ikoyi',
      city: 'Ikoyi',
      state: 'Lagos',
      country: 'Nigeria',
      totalUnits: 40,
      occupancyRate: 95,
      imageUrl: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=600&auto=format&fit=crop&q=80',
      requireVisitorImage: true,
      requireVehicleImage: true
    }
  });

  // 2. Seed Admin & Guard
  const tobiAdmin = await prisma.user.upsert({
    where: { email: 'admin@estatemanager.io' },
    update: {},
    create: {
      firstName: 'Tobi',
      lastName: 'John',
      email: 'admin@estatemanager.io',
      phone: '+234 802 123 4567',
      password: demoPasswordHash,
      role: 'SUPER_ADMIN',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80'
    }
  });

  const guardUser = await prisma.user.upsert({
    where: { email: 'guard@estatemanager.io' },
    update: {},
    create: {
      firstName: 'Musa',
      lastName: 'Ibrahim',
      email: 'guard@estatemanager.io',
      phone: '+234 803 987 6543',
      password: demoPasswordHash,
      role: 'GUARD'
    }
  });

  // 3. Seed Properties for Sunrise Estate
  const units = ['A1-02', 'B2-05', 'C1-01', 'A3-04', 'B1-03', 'A2-01'];
  const properties = [];
  for (const u of units) {
    const prop = await prisma.property.upsert({
      where: {
        estateId_displayIdentifier: {
          estateId: sunrise.id,
          displayIdentifier: u
        }
      },
      update: {},
      create: {
        estateId: sunrise.id,
        type: 'APARTMENT',
        apartmentNumber: u,
        displayIdentifier: u,
        occupancyStatus: 'OCCUPIED'
      }
    });
    properties.push(prop);
  }

  // 4. Seed Residents
  const residentDefs = [
    { firstName: 'Amaka', lastName: 'Okafor', email: 'amaka.okafor@gmail.com', phone: '+234 803 111 2233', unit: properties[0] },
    { firstName: 'Daniel', lastName: 'Musa', email: 'daniel.musa@yahoo.com', phone: '+234 805 222 3344', unit: properties[1] },
    { firstName: 'Chinedu', lastName: 'Nwosu', email: 'chinedu.nwosu@gmail.com', phone: '+234 807 333 4455', unit: properties[2] },
    { firstName: 'Fatima', lastName: 'Bello', email: 'fatima.bello@outlook.com', phone: '+234 809 444 5566', unit: properties[3] },
    { firstName: 'Ibrahim', lastName: 'Lawal', email: 'ibrahim.lawal@gmail.com', phone: '+234 812 555 6677', unit: properties[4] }
  ];

  const seededResidents = [];
  for (const r of residentDefs) {
    const res = await prisma.user.upsert({
      where: { email: r.email },
      update: {},
      create: {
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        phone: r.phone,
        password: demoPasswordHash,
        role: 'RESIDENT'
      }
    });
    seededResidents.push(res);

    await prisma.userProperty.upsert({
      where: {
        userId_propertyId: {
          userId: res.id,
          propertyId: r.unit.id
        }
      },
      update: {},
      create: {
        userId: res.id,
        propertyId: r.unit.id,
        estateId: sunrise.id,
        relationship: 'OWNER',
        isPrimary: true
      }
    });
  }

  // 5. Seed Invoices
  const invoiceDefs = [
    { invoiceNumber: 'INV-2026-001', res: seededResidents[0], prop: properties[0], amount: 120000, paid: 120000, status: 'PAID', date: '2026-09-28' },
    { invoiceNumber: 'INV-2026-002', res: seededResidents[1], prop: properties[1], amount: 150000, paid: 0, status: 'PENDING', date: '2026-10-02' },
    { invoiceNumber: 'INV-2026-003', res: seededResidents[2], prop: properties[2], amount: 120000, paid: 0, status: 'OVERDUE', date: '2026-09-20' },
    { invoiceNumber: 'INV-2026-004', res: seededResidents[3], prop: properties[3], amount: 100000, paid: 100000, status: 'PAID', date: '2026-09-25' },
    { invoiceNumber: 'INV-2026-005', res: seededResidents[4], prop: properties[4], amount: 150000, paid: 0, status: 'PENDING', date: '2026-10-05' }
  ];

  for (const inv of invoiceDefs) {
    await prisma.invoice.upsert({
      where: { invoiceNumber: inv.invoiceNumber },
      update: {},
      create: {
        invoiceNumber: inv.invoiceNumber,
        estateId: sunrise.id,
        propertyId: inv.prop.id,
        residentId: inv.res.id,
        title: 'Monthly Estate Service Charge',
        amount: inv.amount,
        paidAmount: inv.paid,
        status: inv.status,
        dueDate: new Date(inv.date)
      }
    });
  }

  // 6. Seed Upcoming Dues
  const duesDefs = [
    { title: 'Service Charge', unitsCount: 24, dueDaysText: 'Due in 3 days', amount: 2400000 },
    { title: 'Estate Maintenance', unitsCount: 18, dueDaysText: 'Due in 5 days', amount: 1200000 },
    { title: 'Security Levy', unitsCount: 12, dueDaysText: 'Due in 7 days', amount: 600000 }
  ];

  for (const d of duesDefs) {
    await prisma.upcomingDue.create({
      data: {
        estateId: sunrise.id,
        title: d.title,
        unitsCount: d.unitsCount,
        dueDaysText: d.dueDaysText,
        amount: d.amount
      }
    });
  }

  // 7. Seed Gate Access Logs
  const gateLogs = [
    { name: 'John Adeyemi', action: 'ENTRY', notes: 'Resident • A1-02', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80' },
    { name: 'Jane Smith', action: 'ENTRY', notes: 'Visitor • To A2-01', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80' },
    { name: 'Delivery (Swift Logistics)', action: 'EXIT', notes: 'Vendor • B1-03', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80' },
    { name: 'Emeka Johnson', action: 'ENTRY', notes: 'Resident • C1-01', avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=100&auto=format&fit=crop&q=80' },
    { name: 'Maintenance Team', action: 'ENTRY', notes: 'Staff', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&auto=format&fit=crop&q=80' }
  ];

  for (const g of gateLogs) {
    await prisma.verificationLog.create({
      data: {
        estateId: sunrise.id,
        verifiedByGuardId: guardUser.id,
        visitorName: g.name,
        gateAction: g.action,
        guardNotes: g.notes,
        visitorImageUrl: g.avatar
      }
    });
  }

  console.log('✅ Supabase PostgreSQL seeding complete!');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
