const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function seedUnits() {
  console.log('🌱 Seeding units with full details matching Units 3.0 & 3.1 designs...');

  const salt = await bcrypt.genSalt(10);
  const demoHash = await bcrypt.hash('Admin@12345', salt);

  // Get or verify estates
  const sunrise = await prisma.estate.findFirst({ where: { name: { contains: 'Sunrise' } } }) || 
    await prisma.estate.findFirst();
  const maple = await prisma.estate.findFirst({ where: { name: { contains: 'Maple' } } }) || sunrise;
  const lakeside = await prisma.estate.findFirst({ where: { name: { contains: 'Lakeside' } } }) || sunrise;
  const pineview = await prisma.estate.findFirst({ where: { name: { contains: 'Pineview' } } }) || sunrise;

  // Residents
  const amaka = await prisma.user.upsert({
    where: { email: 'amaka.okafor@gmail.com' },
    update: {
      firstName: 'Amaka',
      lastName: 'Okafor',
      phone: '+234 801 234 5678',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80'
    },
    create: {
      firstName: 'Amaka',
      lastName: 'Okafor',
      email: 'amaka.okafor@gmail.com',
      phone: '+234 801 234 5678',
      password: demoHash,
      role: 'RESIDENT',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80'
    }
  });

  const daniel = await prisma.user.upsert({
    where: { email: 'daniel.musa@yahoo.com' },
    update: {
      firstName: 'Daniel',
      lastName: 'Musa',
      phone: '+234 805 222 3344',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80'
    },
    create: {
      firstName: 'Daniel',
      lastName: 'Musa',
      email: 'daniel.musa@yahoo.com',
      phone: '+234 805 222 3344',
      password: demoHash,
      role: 'RESIDENT',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80'
    }
  });

  const chinedu = await prisma.user.upsert({
    where: { email: 'chinedu.nwosu@gmail.com' },
    update: {
      firstName: 'Chinedu',
      lastName: 'Nwosu',
      phone: '+234 807 333 4455',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80'
    },
    create: {
      firstName: 'Chinedu',
      lastName: 'Nwosu',
      email: 'chinedu.nwosu@gmail.com',
      phone: '+234 807 333 4455',
      password: demoHash,
      role: 'RESIDENT',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80'
    }
  });

  const fatima = await prisma.user.upsert({
    where: { email: 'fatima.bello@outlook.com' },
    update: {
      firstName: 'Fatima',
      lastName: 'Bello',
      phone: '+234 809 444 5566',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80'
    },
    create: {
      firstName: 'Fatima',
      lastName: 'Bello',
      email: 'fatima.bello@outlook.com',
      phone: '+234 809 444 5566',
      password: demoHash,
      role: 'RESIDENT',
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80'
    }
  });

  const emeka = await prisma.user.upsert({
    where: { email: 'emeka.daniels@gmail.com' },
    update: {
      firstName: 'Emeka',
      lastName: 'Daniels',
      phone: '+234 813 666 7788',
      avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=120&auto=format&fit=crop&q=80'
    },
    create: {
      firstName: 'Emeka',
      lastName: 'Daniels',
      email: 'emeka.daniels@gmail.com',
      phone: '+234 813 666 7788',
      password: demoHash,
      role: 'RESIDENT',
      avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=120&auto=format&fit=crop&q=80'
    }
  });

  const galleryDefault = [
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=800&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&auto=format&fit=crop&q=80'
  ];

  const unitsData = [
    {
      estateId: sunrise.id,
      displayIdentifier: 'A1-01',
      apartmentNumber: 'A1-01',
      block: 'Block A',
      floor: '1st Floor',
      type: 'Apartment',
      category: 'Residential',
      subtype: '3 Bedroom',
      bedrooms: 3,
      bathrooms: 3,
      parkingSlots: 2,
      sizeSqm: 120,
      buildYear: 2023,
      occupancyStatus: 'OCCUPIED',
      monthlyRent: 50000,
      serviceCharge: 5000,
      billingCycle: 'Monthly',
      gracePeriodDays: 7,
      nextDueDate: new Date('2026-10-05T00:00:00.000Z'),
      currentTenantId: amaka.id,
      tenantName: 'Amaka Okafor',
      tenantEmail: 'amaka.okafor@gmail.com',
      tenantPhone: '+234 801 234 5678',
      tenantAvatar: amaka.avatar,
      moveInDate: new Date('2025-01-12T00:00:00.000Z'),
      leaseEndDate: new Date('2026-01-11T00:00:00.000Z'),
      tenancyType: 'Residential',
      agreementDocument: 'lease-agreement.pdf',
      notes: 'Tenant has been good with payments. Requested painting of balcony wall (scheduled for Oct 10, 2026).',
      description: 'Spacious 3-bedroom apartment with modern finishing, balcony, and 24/7 security. Ideal for families looking for comfort and convenience.',
      imageUrl: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&auto=format&fit=crop&q=80',
      galleryImages: galleryDefault,
      position: 'Corner Unit'
    },
    {
      estateId: sunrise.id,
      displayIdentifier: 'A1-02',
      apartmentNumber: 'A1-02',
      block: 'Block A',
      floor: '1st Floor',
      type: 'Apartment',
      category: 'Residential',
      subtype: '2 Bedroom',
      bedrooms: 2,
      bathrooms: 2,
      parkingSlots: 1,
      sizeSqm: 90,
      buildYear: 2023,
      occupancyStatus: 'VACANT',
      monthlyRent: 40000,
      serviceCharge: 4000,
      billingCycle: 'Monthly',
      gracePeriodDays: 7,
      nextDueDate: null,
      currentTenantId: null,
      tenantName: null,
      tenantEmail: null,
      tenantPhone: null,
      tenantAvatar: null,
      description: 'Cozy 2-bedroom apartment with an open layout and bright natural lighting.',
      imageUrl: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&auto=format&fit=crop&q=80',
      galleryImages: galleryDefault,
      position: 'Front'
    },
    {
      estateId: maple.id,
      displayIdentifier: 'B2-05',
      apartmentNumber: 'B2-05',
      block: 'Block B',
      floor: '2nd Floor',
      type: 'Duplex',
      category: 'Residential',
      subtype: '3 Bedroom',
      bedrooms: 3,
      bathrooms: 4,
      parkingSlots: 2,
      sizeSqm: 180,
      buildYear: 2022,
      occupancyStatus: 'OCCUPIED',
      monthlyRent: 75000,
      serviceCharge: 7500,
      billingCycle: 'Monthly',
      gracePeriodDays: 7,
      nextDueDate: new Date('2026-10-10T00:00:00.000Z'),
      currentTenantId: daniel.id,
      tenantName: 'Daniel Musa',
      tenantEmail: 'daniel.musa@yahoo.com',
      tenantPhone: '+234 805 222 3344',
      tenantAvatar: daniel.avatar,
      moveInDate: new Date('2024-06-01T00:00:00.000Z'),
      leaseEndDate: new Date('2026-05-31T00:00:00.000Z'),
      tenancyType: 'Residential',
      agreementDocument: 'tenancy-musa-b205.pdf',
      description: 'Luxury duplex with custom fittings, large living area, and serene balcony overlooking estate green spaces.',
      imageUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&auto=format&fit=crop&q=80',
      galleryImages: galleryDefault,
      position: 'Upper Level'
    },
    {
      estateId: lakeside.id,
      displayIdentifier: 'C1-01',
      apartmentNumber: 'C1-01',
      block: 'Block C',
      floor: '1st Floor',
      type: 'Studio',
      category: 'Residential',
      subtype: 'Studio',
      bedrooms: 1,
      bathrooms: 1,
      parkingSlots: 1,
      sizeSqm: 45,
      buildYear: 2023,
      occupancyStatus: 'OCCUPIED',
      monthlyRent: 30000,
      serviceCharge: 3000,
      billingCycle: 'Monthly',
      gracePeriodDays: 7,
      nextDueDate: new Date('2026-10-15T00:00:00.000Z'),
      currentTenantId: chinedu.id,
      tenantName: 'Chinedu Nwosu',
      tenantEmail: 'chinedu.nwosu@gmail.com',
      tenantPhone: '+234 807 333 4455',
      tenantAvatar: chinedu.avatar,
      moveInDate: new Date('2025-03-01T00:00:00.000Z'),
      leaseEndDate: new Date('2026-02-28T00:00:00.000Z'),
      tenancyType: 'Residential',
      description: 'Compact and efficient studio with built-in kitchenette and fast broadband provision.',
      imageUrl: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&auto=format&fit=crop&q=80',
      galleryImages: galleryDefault,
      position: 'Lake View'
    },
    {
      estateId: pineview.id,
      displayIdentifier: 'A3-04',
      apartmentNumber: 'A3-04',
      block: 'Block A',
      floor: '3rd Floor',
      type: 'Apartment',
      category: 'Residential',
      subtype: '2 Bedroom',
      bedrooms: 2,
      bathrooms: 2,
      parkingSlots: 1,
      sizeSqm: 95,
      buildYear: 2021,
      occupancyStatus: 'OCCUPIED',
      monthlyRent: 45000,
      serviceCharge: 4500,
      billingCycle: 'Monthly',
      gracePeriodDays: 7,
      nextDueDate: new Date('2026-10-20T00:00:00.000Z'),
      currentTenantId: fatima.id,
      tenantName: 'Fatima Bello',
      tenantEmail: 'fatima.bello@outlook.com',
      tenantPhone: '+234 809 444 5566',
      tenantAvatar: fatima.avatar,
      moveInDate: new Date('2024-11-15T00:00:00.000Z'),
      leaseEndDate: new Date('2026-11-14T00:00:00.000Z'),
      tenancyType: 'Residential',
      description: 'Airy 2-bedroom residence with private terrace and modern bathroom fixtures.',
      imageUrl: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&auto=format&fit=crop&q=80',
      galleryImages: galleryDefault,
      position: 'Garden View'
    },
    {
      estateId: maple.id,
      displayIdentifier: 'B1-03',
      apartmentNumber: 'B1-03',
      block: 'Block B',
      floor: '1st Floor',
      type: 'Duplex',
      category: 'Residential',
      subtype: '4 Bedroom',
      bedrooms: 4,
      bathrooms: 4,
      parkingSlots: 3,
      sizeSqm: 200,
      buildYear: 2022,
      occupancyStatus: 'VACANT',
      monthlyRent: 85000,
      serviceCharge: 8500,
      billingCycle: 'Monthly',
      gracePeriodDays: 7,
      nextDueDate: null,
      currentTenantId: null,
      tenantName: null,
      tenantEmail: null,
      tenantPhone: null,
      tenantAvatar: null,
      description: 'Sprawling 4-bedroom duplex with double-height ceiling and private double garage.',
      imageUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&auto=format&fit=crop&q=80',
      galleryImages: galleryDefault,
      position: 'Rear'
    },
    {
      estateId: sunrise.id,
      displayIdentifier: 'D1-01',
      apartmentNumber: 'D1-01',
      block: 'Block D',
      floor: 'Ground Floor',
      type: 'Commercial',
      category: 'Commercial',
      subtype: 'Shop',
      bedrooms: 0,
      bathrooms: 1,
      parkingSlots: 2,
      sizeSqm: 60,
      buildYear: 2024,
      occupancyStatus: 'OCCUPIED',
      monthlyRent: 120000,
      serviceCharge: 12000,
      billingCycle: 'Monthly',
      gracePeriodDays: 7,
      nextDueDate: new Date('2026-10-25T00:00:00.000Z'),
      currentTenantId: emeka.id,
      tenantName: 'Emeka Daniels',
      tenantEmail: 'emeka.daniels@gmail.com',
      tenantPhone: '+234 813 666 7788',
      tenantAvatar: emeka.avatar,
      moveInDate: new Date('2025-01-01T00:00:00.000Z'),
      leaseEndDate: new Date('2026-12-31T00:00:00.000Z'),
      tenancyType: 'Commercial',
      description: 'Retail space directly facing the internal estate promenade. High pedestrian footfall.',
      imageUrl: 'https://images.unsplash.com/photo-1541123437800-1bb1317badc2?w=800&auto=format&fit=crop&q=80',
      galleryImages: galleryDefault,
      position: 'Promenade Front'
    },
    {
      estateId: sunrise.id,
      displayIdentifier: 'D1-02',
      apartmentNumber: 'D1-02',
      block: 'Block D',
      floor: '1st Floor',
      type: 'Commercial',
      category: 'Commercial',
      subtype: 'Office',
      bedrooms: 0,
      bathrooms: 2,
      parkingSlots: 4,
      sizeSqm: 80,
      buildYear: 2024,
      occupancyStatus: 'VACANT',
      monthlyRent: 150000,
      serviceCharge: 15000,
      billingCycle: 'Monthly',
      gracePeriodDays: 7,
      nextDueDate: null,
      currentTenantId: null,
      tenantName: null,
      tenantEmail: null,
      tenantPhone: null,
      tenantAvatar: null,
      description: 'Modern executive office space with conference room partition and server room readiness.',
      imageUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&auto=format&fit=crop&q=80',
      galleryImages: galleryDefault,
      position: 'Front East'
    }
  ];

  let seededA101 = null;

  for (const item of unitsData) {
    const prop = await prisma.property.upsert({
      where: {
        estateId_displayIdentifier: {
          estateId: item.estateId,
          displayIdentifier: item.displayIdentifier
        }
      },
      update: item,
      create: item
    });

    if (item.displayIdentifier === 'A1-01') {
      seededA101 = prop;
    }

    if (item.currentTenantId) {
      await prisma.userProperty.upsert({
        where: {
          userId_propertyId: {
            userId: item.currentTenantId,
            propertyId: prop.id
          }
        },
        update: {
          relationship: 'TENANT',
          isPrimary: true
        },
        create: {
          userId: item.currentTenantId,
          propertyId: prop.id,
          estateId: item.estateId,
          relationship: 'TENANT',
          isPrimary: true
        }
      });
    }
  }

  // Also seed the invoices for A1-01 matching Unit Details (3.1.png)
  if (seededA101) {
    const a101Invoices = [
      { invoiceNumber: 'INV-2026-001', title: 'Rent', amount: 50000, paidAmount: 50000, status: 'PAID', dueDate: new Date('2026-09-05') },
      { invoiceNumber: 'INV-2026-002', title: 'Service Charge', amount: 5000, paidAmount: 5000, status: 'PAID', dueDate: new Date('2026-09-05') },
      { invoiceNumber: 'INV-2026-003', title: 'Water Bill', amount: 3500, paidAmount: 0, status: 'PENDING', dueDate: new Date('2026-10-05') },
      { invoiceNumber: 'INV-2026-004', title: 'Security Levy', amount: 2000, paidAmount: 2000, status: 'PAID', dueDate: new Date('2026-08-05') },
      { invoiceNumber: 'INV-2026-005', title: 'Waste Management', amount: 1500, paidAmount: 0, status: 'PENDING', dueDate: new Date('2026-10-05') },
    ];

    for (const inv of a101Invoices) {
      await prisma.invoice.upsert({
        where: { invoiceNumber: inv.invoiceNumber },
        update: {
          propertyId: seededA101.id,
          residentId: amaka.id,
          title: inv.title,
          amount: inv.amount,
          paidAmount: inv.paidAmount,
          status: inv.status,
          dueDate: inv.dueDate
        },
        create: {
          invoiceNumber: inv.invoiceNumber,
          estateId: sunrise.id,
          propertyId: seededA101.id,
          residentId: amaka.id,
          title: inv.title,
          amount: inv.amount,
          paidAmount: inv.paidAmount,
          status: inv.status,
          dueDate: inv.dueDate
        }
      });
    }
  }

  console.log('✅ Units seeded successfully into Supabase!');
}

seedUnits()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
