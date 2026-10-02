const prisma = require('../lib/prisma');

async function seedMaintenance() {
  try {
    console.log('Seeding Maintenance Suite data...');
    const sunrise = await prisma.estate.findFirst({
      where: { code: 'SUN-001' }
    });

    if (!sunrise) {
      console.log('Sunrise Estate not found. Skipping maintenance seed.');
      return;
    }

    const properties = await prisma.property.findMany({
      where: { estateId: sunrise.id }
    });
    const residents = await prisma.user.findMany({
      where: { role: 'RESIDENT' }
    });

    // 1. Seed Vetted Artisans if empty
    const artisanCount = await prisma.artisan.count();
    let artisans = [];
    if (artisanCount === 0) {
      const artisanData = [
        { name: 'Tunde Balogun', phone: '0803 456 7890', category: 'Electrical', rating: 4.9, jobsCount: 34, isAvailable: true, isVerified: true, estateId: sunrise.id },
        { name: 'Emeka Obi', phone: '0802 345 6789', category: 'Plumbing', rating: 4.8, jobsCount: 28, isAvailable: true, isVerified: true, estateId: sunrise.id },
        { name: 'Sunday Adeyemi', phone: '0805 123 4567', category: 'HVAC & Power', rating: 4.7, jobsCount: 19, isAvailable: false, isVerified: true, estateId: sunrise.id },
        { name: 'Segun Adeleke', phone: '0818 901 2345', category: 'Access Automation & Gates', rating: 4.9, jobsCount: 42, isAvailable: true, isVerified: true, estateId: sunrise.id }
      ];

      for (const a of artisanData) {
        const item = await prisma.artisan.create({ data: a });
        artisans.push(item);
      }
      console.log(`Seeded ${artisans.length} vetted artisans.`);
    } else {
      artisans = await prisma.artisan.findMany();
    }

    // 2. Seed Preventive Maintenance Schedules if empty
    const scheduleCount = await prisma.maintenanceSchedule.count();
    if (scheduleCount === 0) {
      const now = new Date();
      const schedulesData = [
        {
          estateId: sunrise.id,
          title: '500kVA Perkins Diesel Generator 250-Hour Major Service',
          category: 'Power',
          assetName: 'Main Central Powerhouse Gen #1',
          frequency: 'Monthly',
          nextDueDate: new Date(now.getTime() + 4 * 86400000),
          vendorName: 'Mantrac Nigeria Ltd',
          vendorPhone: '01 270 4100',
          estimatedCost: 185000,
          status: 'UPCOMING',
          notes: 'Oil filter replacement, fuel line flushing, valve clearance inspection, and battery fluid check.'
        },
        {
          estateId: sunrise.id,
          title: 'Water Treatment Plant Aeration & Activated Carbon Filter Backwash',
          category: 'Water',
          assetName: 'Central Industrial Water Filtration Skid',
          frequency: 'Bi-Weekly',
          nextDueDate: new Date(now.getTime() + 6 * 86400000),
          vendorName: 'AquaPure Tech Services Ltd',
          vendorPhone: '0803 999 1234',
          estimatedCost: 75000,
          status: 'UPCOMING',
          notes: 'Inspect multi-media beds, replace pre-sediment cartridges, test pH levels and chlorine residual.'
        },
        {
          estateId: sunrise.id,
          title: 'Central Perimeter CCTV Backhaul & NVR Storage Health Check',
          category: 'Security',
          assetName: '64-Channel AI Perimeter Surveillance Grid',
          frequency: 'Quarterly',
          nextDueDate: new Date(now.getTime() + 14 * 86400000),
          vendorName: 'SecureNet Systems West Africa',
          vendorPhone: '0812 888 4400',
          estimatedCost: 120000,
          status: 'UPCOMING',
          notes: 'Camera optical lens cleanings, optical fiber switch latency check, RAID drive integrity verification.'
        },
        {
          estateId: sunrise.id,
          title: 'Otis 8-Passenger Elevator Safety Governor & Cable Tensioning',
          category: 'Elevator',
          assetName: 'Court A High-Rise Passenger Lift',
          frequency: 'Monthly',
          nextDueDate: new Date(now.getTime() + 18 * 86400000),
          vendorName: 'Otis Elevator Nigeria Certified Support',
          vendorPhone: '01 448 3000',
          estimatedCost: 240000,
          status: 'UPCOMING',
          notes: 'Emergency brake testing, car leveling calibration, door lock sensors, and counterweight rope lubrication.'
        },
        {
          estateId: sunrise.id,
          title: 'Estate 33kV Transformer Substation & Lightning Earthing Audit',
          category: 'Power',
          assetName: '500kVA 33/0.415kV Step-down Substation',
          frequency: 'Bi-Annual',
          nextDueDate: new Date(now.getTime() + 28 * 86400000),
          vendorName: 'EKEDC Certified High-Voltage Engineering',
          vendorPhone: '0800 225 5353',
          estimatedCost: 350000,
          status: 'UPCOMING',
          notes: 'Transformer dielectric oil breakdown voltage test, silica gel breather renewal, earth pit resistance reading < 2 ohms.'
        }
      ];

      for (const s of schedulesData) {
        await prisma.maintenanceSchedule.create({ data: s });
      }
      console.log(`Seeded ${schedulesData.length} preventive maintenance schedules.`);
    }

    // 3. Update existing complaints or add high-fidelity work orders
    const highFidelityWorkOrders = [
      {
        ticketNumber: 'TCK-2026-0891',
        estateId: sunrise.id,
        propertyId: properties[0]?.id || null,
        residentId: residents[0]?.id || sunrise.id,
        title: 'Phase 2 Borehole Industrial Pressure Pump Failure',
        description: 'Primary booster pump tripping breaker after 45 seconds of operation. Water pressure has dropped significantly across Court A & B upper floors.',
        category: 'Water & Plumbing',
        priority: 'CRITICAL',
        status: 'OPEN',
        location: 'Phase 2 Pump House Basement',
        estimatedCost: 280000,
        actualCost: 0,
        dueDate: new Date(Date.now() + 1 * 86400000)
      },
      {
        ticketNumber: 'TCK-2026-0884',
        estateId: sunrise.id,
        propertyId: properties[1]?.id || null,
        residentId: residents[1]?.id || sunrise.id,
        title: 'Block C Streetlight Column #4 Underground Cable Short',
        description: 'Feeder pillar breaker for Streetlight Loop 3 trips intermittently during rainfall. Traced ground fault to column #4 junction box.',
        category: 'Electrical & Power',
        priority: 'HIGH',
        status: 'IN_PROGRESS',
        location: 'Block C Main Boulevard',
        estimatedCost: 85000,
        actualCost: 0,
        artisanName: 'Tunde Balogun',
        artisanPhone: '0803 456 7890',
        artisanSpecialty: 'Electrical',
        dueDate: new Date(Date.now() + 2 * 86400000)
      },
      {
        ticketNumber: 'TCK-2026-0872',
        estateId: sunrise.id,
        propertyId: properties[2]?.id || null,
        residentId: residents[2]?.id || sunrise.id,
        title: 'Main Gate Hydraulic Arm Motor Sluggish Response',
        description: 'Inbound barrier arm motor experiencing intermittent delays opening during morning rush hour. Motor capacitor may need replacement.',
        category: 'Gate & Security',
        priority: 'MEDIUM',
        status: 'IN_PROGRESS',
        location: 'Estate Main Entrance Gate',
        estimatedCost: 65000,
        actualCost: 0,
        artisanName: 'Segun Adeleke',
        artisanPhone: '0818 901 2345',
        artisanSpecialty: 'Automation',
        dueDate: new Date(Date.now() + 3 * 86400000)
      },
      {
        ticketNumber: 'TCK-2026-0860',
        estateId: sunrise.id,
        propertyId: properties[3]?.id || null,
        residentId: residents[3]?.id || sunrise.id,
        title: 'Court B Sewage Lift Station Float Switch Jammed',
        description: 'High level alarm triggered on wastewater pit. Float switch assembly jammed by debris silt.',
        category: 'Water & Plumbing',
        priority: 'LOW',
        status: 'RESOLVED',
        location: 'Court B Rear Service Pit',
        estimatedCost: 45000,
        actualCost: 42000,
        artisanName: 'Emeka Obi',
        artisanPhone: '0802 345 6789',
        artisanSpecialty: 'Plumbing',
        resolutionNotes: 'Lift station pit cleared of debris. Installed heavy-duty stainless steel float bracket. Tested auto-cycle across 4 simulated pumping runs.',
        resolvedAt: new Date(Date.now() - 2 * 86400000)
      },
      {
        ticketNumber: 'TCK-2026-0855',
        estateId: sunrise.id,
        propertyId: null,
        residentId: residents[0]?.id || sunrise.id,
        title: 'Clubhouse Split Unit AC Compressor Tripping Breaker',
        description: 'Standing 5HP split unit AC in residents gymnasium blowing ambient air; outdoor unit fan not turning.',
        category: 'HVAC & Cooling',
        priority: 'MEDIUM',
        status: 'OPEN',
        location: 'Estate Recreational Clubhouse / Gym',
        estimatedCost: 110000,
        actualCost: 0,
        dueDate: new Date(Date.now() + 5 * 86400000)
      }
    ];

    for (const wo of highFidelityWorkOrders) {
      await prisma.complaint.upsert({
        where: { ticketNumber: wo.ticketNumber },
        update: wo,
        create: wo
      });
    }

    console.log('Seeded high-fidelity work orders successfully.');
  } catch (err) {
    console.error('Error seeding maintenance:', err);
  }
}

if (require.main === module) {
  seedMaintenance().finally(() => prisma.$disconnect());
}

module.exports = { seedMaintenance };
