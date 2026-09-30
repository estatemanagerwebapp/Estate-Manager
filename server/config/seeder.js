const bcrypt = require('bcryptjs');
const {
  User,
  Estate,
  Property,
  UserProperty,
  Invoice,
  Payment,
  VerificationLog,
  UpcomingDue
} = require('../models');

/**
 * High-Fidelity EstatePro Database Seeder
 * Populates real data matching Estatedashb.png exactly
 */
async function seedDatabase() {
  try {
    const estateCount = await Estate.countDocuments();
    if (estateCount > 0) {
      console.log('🌱 Database already seeded. Skipping initial seed.');
      return;
    }

    console.log('🌱 Seeding fresh database with EstatePro data...');

    // 1. Password hash for all seeded demo users
    const salt = await bcrypt.genSalt(10);
    const demoPasswordHash = await bcrypt.hash('Admin@12345', salt);

    // 2. Seed Estates
    const estates = await Estate.create([
      {
        name: 'Sunrise Estate',
        code: 'SUN-001',
        address: 'Plot 12, Lekki Phase 1, Lekki-Epe Expressway',
        city: 'Lekki',
        state: 'Lagos',
        country: 'Nigeria',
        totalUnits: 120,
        occupancyRate: 92,
        imageUrl: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=600&auto=format&fit=crop&q=80',
        gateConfiguration: { requireVisitorImage: true, requireVehicleImage: false }
      },
      {
        name: 'Maple Residency',
        code: 'MAP-002',
        address: '44 Glover Road, Ikoyi',
        city: 'Ikoyi',
        state: 'Lagos',
        country: 'Nigeria',
        totalUnits: 80,
        occupancyRate: 85,
        imageUrl: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=600&auto=format&fit=crop&q=80',
        gateConfiguration: { requireVisitorImage: true, requireVehicleImage: true }
      },
      {
        name: 'Lakeside Court',
        code: 'LAK-003',
        address: 'Admiralty Way, Victoria Island Extension',
        city: 'Victoria Island',
        state: 'Lagos',
        country: 'Nigeria',
        totalUnits: 60,
        occupancyRate: 78,
        imageUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=600&auto=format&fit=crop&q=80',
        gateConfiguration: { requireVisitorImage: true, requireVehicleImage: false }
      },
      {
        name: 'Pineview Estate',
        code: 'PIN-004',
        address: 'Banana Island Boulevard, Ikoyi',
        city: 'Ikoyi',
        state: 'Lagos',
        country: 'Nigeria',
        totalUnits: 40,
        occupancyRate: 95,
        imageUrl: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=600&auto=format&fit=crop&q=80',
        gateConfiguration: { requireVisitorImage: true, requireVehicleImage: true }
      }
    ]);

    const primaryEstate = estates[0]; // Sunrise Estate

    // 3. Seed Properties for Sunrise Estate
    const propertiesData = [
      { unit: 'A1-02', court: 'Court A', block: '01', floor: '01', type: 'APARTMENT' },
      { unit: 'B2-05', court: 'Court B', block: '02', floor: '02', type: 'APARTMENT' },
      { unit: 'C1-01', court: 'Court C', block: '01', floor: '01', type: 'TERRACE' },
      { unit: 'A3-04', court: 'Court A', block: '03', floor: '03', type: 'PENTHOUSE' },
      { unit: 'B1-03', court: 'Court B', block: '01', floor: '01', type: 'APARTMENT' },
      { unit: 'A2-01', court: 'Court A', block: '02', floor: '02', type: 'APARTMENT' }
    ];

    const properties = await Promise.all(
      propertiesData.map(p =>
        Property.create({
          estateId: primaryEstate._id,
          type: p.type,
          court: p.court,
          block: p.block,
          floor: p.floor,
          apartmentNumber: p.unit,
          displayIdentifier: p.unit,
          occupancyStatus: 'OCCUPIED'
        })
      )
    );

    const propMap = {};
    properties.forEach(p => {
      propMap[p.displayIdentifier] = p;
    });

    // 4. Seed Administrator & Staff
    const tobiAdmin = await User.create({
      firstName: 'Tobi',
      lastName: 'John',
      email: 'admin@estatemanager.io',
      phone: '+234 802 123 4567',
      password: demoPasswordHash,
      role: 'SUPER_ADMIN',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
      isActive: true
    });

    const guardUser = await User.create({
      firstName: 'Musa',
      lastName: 'Ibrahim',
      email: 'guard@estatemanager.io',
      phone: '+234 803 987 6543',
      password: demoPasswordHash,
      role: 'GUARD',
      isActive: true
    });

    // 5. Seed Primary Residents from design table
    const residentSpecs = [
      { firstName: 'Amaka', lastName: 'Okafor', email: 'amaka.okafor@gmail.com', phone: '+234 803 111 2233', unit: 'A1-02' },
      { firstName: 'Daniel', lastName: 'Musa', email: 'daniel.musa@yahoo.com', phone: '+234 805 222 3344', unit: 'B2-05' },
      { firstName: 'Chinedu', lastName: 'Nwosu', email: 'chinedu.nwosu@gmail.com', phone: '+234 807 333 4455', unit: 'C1-01' },
      { firstName: 'Fatima', lastName: 'Bello', email: 'fatima.bello@outlook.com', phone: '+234 809 444 5566', unit: 'A3-04' },
      { firstName: 'Ibrahim', lastName: 'Lawal', email: 'ibrahim.lawal@gmail.com', phone: '+234 812 555 6677', unit: 'B1-03' },
      { firstName: 'John', lastName: 'Adeyemi', email: 'john.adeyemi@gmail.com', phone: '+234 813 666 7788', unit: 'A1-02' },
      { firstName: 'Emeka', lastName: 'Johnson', email: 'emeka.johnson@gmail.com', phone: '+234 814 777 8899', unit: 'C1-01' }
    ];

    const residents = await Promise.all(
      residentSpecs.map(r =>
        User.create({
          firstName: r.firstName,
          lastName: r.lastName,
          email: r.email,
          phone: r.phone,
          password: demoPasswordHash,
          role: 'RESIDENT',
          avatar: `https://images.unsplash.com/photo-${1500000000000 + Math.floor(Math.random() * 900000000)}?w=100&auto=format&fit=crop&q=80`,
          isActive: true
        })
      )
    );

    // Link residents to properties
    for (let i = 0; i < residentSpecs.length; i++) {
      const r = residents[i];
      const unitId = residentSpecs[i].unit;
      const targetProp = propMap[unitId] || properties[0];
      await UserProperty.create({
        userId: r._id,
        propertyId: targetProp._id,
        estateId: primaryEstate._id,
        relationship: 'OWNER',
        isPrimary: true
      });
    }

    // Seed remaining batch to reach exactly 286 residents
    const additionalResidentCount = 286 - (residents.length + 1); // accounts for tobi + primary
    const bulkResidents = [];
    const firstNames = ['Kehinde', 'Taiwo', 'Folake', 'Bimpe', 'Oluwaseun', 'Femi', 'Ngozi', 'Ifeanyi', 'Zainab', 'Abubakar'];
    const lastNames = ['Adeleke', 'Balogun', 'Danjuma', 'Suleiman', 'Eze', 'Okonkwo', 'Aliyu', 'Gbadamosi', 'Kalu', 'Soyinka'];

    for (let i = 0; i < additionalResidentCount; i++) {
      const fn = firstNames[i % firstNames.length];
      const ln = lastNames[Math.floor(i / firstNames.length) % lastNames.length];
      bulkResidents.push({
        firstName: fn,
        lastName: `${ln} ${i + 1}`,
        email: `resident.${fn.toLowerCase()}.${i}@estatemanager.io`,
        phone: `+234 80${(10000000 + i).toString().slice(0, 8)}`,
        password: demoPasswordHash,
        role: 'RESIDENT',
        isActive: true
      });
    }
    await User.insertMany(bulkResidents);

    // 6. Seed Invoices (Matching Recent Invoices Table Exactly)
    const exactInvoices = [
      {
        invoiceNumber: 'INV-2026-001',
        resident: residents[0], // Amaka Okafor
        property: propMap['A1-02'],
        amount: 120000,
        paidAmount: 120000,
        status: 'PAID',
        dueDate: new Date('2026-09-28'),
        title: 'Q3 Service Charge & Security Levy'
      },
      {
        invoiceNumber: 'INV-2026-002',
        resident: residents[1], // Daniel Musa
        property: propMap['B2-05'],
        amount: 150000,
        paidAmount: 0,
        status: 'PENDING',
        dueDate: new Date('2026-10-02'),
        title: 'October Facility Maintenance Fee'
      },
      {
        invoiceNumber: 'INV-2026-003',
        resident: residents[2], // Chinedu Nwosu
        property: propMap['C1-01'],
        amount: 120000,
        paidAmount: 0,
        status: 'OVERDUE',
        dueDate: new Date('2026-09-20'),
        title: 'September Water & Power Reticulation'
      },
      {
        invoiceNumber: 'INV-2026-004',
        resident: residents[3], // Fatima Bello
        property: propMap['A3-04'],
        amount: 100000,
        paidAmount: 100000,
        status: 'PAID',
        dueDate: new Date('2026-09-25'),
        title: 'Q3 Estate Security Surcharge'
      },
      {
        invoiceNumber: 'INV-2026-005',
        resident: residents[4], // Ibrahim Lawal
        property: propMap['B1-03'],
        amount: 150000,
        paidAmount: 0,
        status: 'PENDING',
        dueDate: new Date('2026-10-05'),
        title: 'Waste Management & Common Area Dues'
      }
    ];

    for (const inv of exactInvoices) {
      const invoiceDoc = await Invoice.create({
        invoiceNumber: inv.invoiceNumber,
        estateId: primaryEstate._id,
        propertyId: inv.property._id,
        residentId: inv.resident._id,
        title: inv.title,
        amount: inv.amount,
        paidAmount: inv.paidAmount,
        status: inv.status,
        dueDate: inv.dueDate,
        items: [{ description: inv.title, amount: inv.amount }]
      });

      if (inv.status === 'PAID') {
        await Payment.create({
          paymentReference: `PAY-${inv.invoiceNumber}`,
          invoiceId: invoiceDoc._id,
          residentId: inv.resident._id,
          estateId: primaryEstate._id,
          amount: inv.amount,
          channel: 'CARD',
          status: 'SUCCESS',
          paidAt: inv.dueDate
        });
      }
    }

    // Historical payments to reach exact ₦8,950,000 Total Payments
    const historicalAmount = 8950000 - 220000;
    await Payment.create({
      paymentReference: 'PAY-HISTORICAL-SEP-2026',
      invoiceId: primaryEstate._id,
      residentId: residents[0]._id,
      estateId: primaryEstate._id,
      amount: historicalAmount,
      channel: 'BANK_TRANSFER',
      status: 'SUCCESS',
      paidAt: new Date('2026-09-15')
    });

    // Seed additional open invoices to match "48 Open Invoices" totaling ₦2,430,000
    // Currently open: INV-002 (150k), INV-003 (120k), INV-005 (150k) = 420k
    // Remaining to seed: 45 invoices totaling ₦2,010,000 (~₦44,666 each)
    const remainingOpenAmount = 2430000 - 420000;
    const additionalOpenInvoices = 45;
    const avgAmount = Math.round(remainingOpenAmount / additionalOpenInvoices);

    for (let i = 6; i <= 50; i++) {
      const numStr = i < 10 ? `00${i}` : `0${i}`;
      await Invoice.create({
        invoiceNumber: `INV-2026-${numStr}`,
        estateId: primaryEstate._id,
        propertyId: properties[i % properties.length]._id,
        residentId: residents[i % residents.length]._id,
        title: 'Monthly Estate Utility & Security',
        amount: avgAmount,
        paidAmount: 0,
        status: i % 4 === 0 ? 'OVERDUE' : 'PENDING',
        dueDate: new Date(Date.now() + (i % 7) * 86400000),
        items: [{ description: 'Utility and Security Levy', amount: avgAmount }]
      });
    }

    // 7. Seed Gate Access Logs (Matching design list)
    const gateLogSpecs = [
      {
        visitorName: 'John Adeyemi',
        gateAction: 'ENTRY',
        time: '10:24 AM',
        notes: 'Resident • A1-02',
        property: propMap['A1-02'],
        resident: residents[5],
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80'
      },
      {
        visitorName: 'Jane Smith',
        gateAction: 'ENTRY',
        time: '09:18 AM',
        notes: 'Visitor • To A2-01',
        property: propMap['A2-01'],
        resident: residents[0],
        avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80'
      },
      {
        visitorName: 'Delivery (Swift Logistics)',
        gateAction: 'EXIT',
        time: '08:45 AM',
        notes: 'Vendor • B1-03',
        property: propMap['B1-03'],
        resident: residents[4],
        avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80'
      },
      {
        visitorName: 'Emeka Johnson',
        gateAction: 'ENTRY',
        time: '08:12 AM',
        notes: 'Resident • C1-01',
        property: propMap['C1-01'],
        resident: residents[6],
        avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=100&auto=format&fit=crop&q=80'
      },
      {
        visitorName: 'Maintenance Team',
        gateAction: 'ENTRY',
        time: '07:50 AM',
        notes: 'Staff',
        property: propMap['A1-02'],
        resident: tobiAdmin,
        avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&auto=format&fit=crop&q=80'
      }
    ];

    for (const log of gateLogSpecs) {
      await VerificationLog.create({
        estateId: primaryEstate._id,
        propertyId: log.property ? log.property._id : null,
        residentId: log.resident ? log.resident._id : null,
        verifiedByGuardId: guardUser._id,
        gateAction: log.gateAction,
        visitorName: log.visitorName,
        guardNotes: log.notes,
        visitorImageUrl: log.avatar,
        verifiedAt: new Date()
      });
    }

    // 8. Seed Upcoming Dues (Matching widget)
    await UpcomingDue.create([
      {
        estateId: primaryEstate._id,
        title: 'Service Charge',
        unitsCount: 24,
        dueDaysText: 'Due in 3 days',
        amount: 2400000
      },
      {
        estateId: primaryEstate._id,
        title: 'Estate Maintenance',
        unitsCount: 18,
        dueDaysText: 'Due in 5 days',
        amount: 1200000
      },
      {
        estateId: primaryEstate._id,
        title: 'Security Levy',
        unitsCount: 12,
        dueDaysText: 'Due in 7 days',
        amount: 600000
      }
    ]);

    console.log('✅ Seeding completed successfully!');
    console.log(`📊 4 Estates, 286 Residents, 50 Invoices, Gate Logs, and Upcoming Dues created.`);
  } catch (err) {
    console.error('❌ Error during seeding:', err);
  }
}

module.exports = { seedDatabase };
