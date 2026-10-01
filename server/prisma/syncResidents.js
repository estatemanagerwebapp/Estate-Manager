const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function syncResidents() {
  console.log('🔄 Syncing existing residents with rich profile data...');

  // 1. Amaka Okafor (RES-001) - Owner, Sunrise Estate, A1-01
  const amaka = await prisma.user.findUnique({ where: { email: 'amaka.okafor@gmail.com' } });
  if (amaka) {
    await prisma.user.update({
      where: { id: amaka.id },
      data: {
        residentCode: 'RES-001',
        dateOfBirth: new Date('1990-03-14'),
        gender: 'Female',
        identificationType: 'National ID',
        idNumber: '1234 5678 9012',
        emergencyContactName: 'Chinedu Okafor',
        emergencyContactPhone: '+234 803 112 9987',
        address: 'Lekki, Lagos, Nigeria',
        residentStatus: 'ACTIVE',
        notes: 'Resident is active and up to date on all service charges.',
        documents: [
          { name: 'National ID', type: 'id', uploadedAt: '2025-01-08', color: 'red' },
          { name: 'Tenancy Agreement', type: 'agreement', uploadedAt: '2025-01-12', color: 'blue' },
          { name: 'Utility Bill', type: 'utility', uploadedAt: '2025-02-05', color: 'green' },
          { name: 'Passport Photograph', type: 'photo', uploadedAt: '2025-01-08', color: 'purple' }
        ],
        createdAt: new Date('2025-01-08')
      }
    });

    // Update UserProperty to Owner
    await prisma.userProperty.updateMany({
      where: { userId: amaka.id },
      data: {
        relationship: 'Owner',
        status: 'ACTIVE',
        moveInDate: new Date('2025-01-12'),
        leaseEndDate: new Date('2026-01-11'),
        monthlyRent: 50000
      }
    });
  }

  // 2. Daniel Musa (RES-002) - Tenant, Maple Residency, B2-05
  const daniel = await prisma.user.findUnique({ where: { email: 'daniel.musa@yahoo.com' } });
  if (daniel) {
    await prisma.user.update({
      where: { id: daniel.id },
      data: {
        residentCode: 'RES-002',
        dateOfBirth: new Date('1988-06-22'),
        gender: 'Male',
        identificationType: 'Driver\'s License',
        idNumber: 'DL-9821-4432',
        emergencyContactName: 'Aisha Musa',
        emergencyContactPhone: '+234 802 334 1122',
        address: 'Glover Road, Ikoyi, Lagos',
        residentStatus: 'ACTIVE'
      }
    });

    await prisma.userProperty.updateMany({
      where: { userId: daniel.id },
      data: {
        relationship: 'Tenant',
        status: 'ACTIVE',
        moveInDate: new Date('2025-02-03'),
        monthlyRent: 75000
      }
    });
  }

  // 3. Chinedu Nwosu (RES-003) - Tenant, Lakeside Court, C1-01
  const chinedu = await prisma.user.findUnique({ where: { email: 'chinedu.nwosu@gmail.com' } });
  if (chinedu) {
    await prisma.user.update({
      where: { id: chinedu.id },
      data: {
        residentCode: 'RES-003',
        dateOfBirth: new Date('1992-11-05'),
        gender: 'Male',
        identificationType: 'International Passport',
        idNumber: 'A08924156',
        emergencyContactName: 'Adaobi Nwosu',
        emergencyContactPhone: '+234 807 554 2211',
        address: 'Admiralty Way, Lekki',
        residentStatus: 'ACTIVE'
      }
    });

    await prisma.userProperty.updateMany({
      where: { userId: chinedu.id },
      data: {
        relationship: 'Tenant',
        status: 'ACTIVE',
        moveInDate: new Date('2025-03-15'),
        monthlyRent: 30000
      }
    });
  }

  // 4. Fatima Bello (RES-004) - Owner, Pineview Estate, A3-04
  const fatima = await prisma.user.findUnique({ where: { email: 'fatima.bello@outlook.com' } });
  if (fatima) {
    await prisma.user.update({
      where: { id: fatima.id },
      data: {
        residentCode: 'RES-004',
        dateOfBirth: new Date('1994-04-18'),
        gender: 'Female',
        identificationType: 'National ID',
        idNumber: '4455 6677 8899',
        emergencyContactName: 'Aliyu Bello',
        emergencyContactPhone: '+234 809 111 4433',
        address: 'Pineview Estate, Ibadan',
        residentStatus: 'ACTIVE'
      }
    });

    await prisma.userProperty.updateMany({
      where: { userId: fatima.id },
      data: {
        relationship: 'Owner',
        status: 'ACTIVE',
        moveInDate: new Date('2025-04-02'),
        monthlyRent: 45000
      }
    });
  }

  // 5. Emeka Daniels (RES-005) - Business, Sunrise Estate, D1-01
  const emeka = await prisma.user.findUnique({ where: { email: 'emeka.daniels@gmail.com' } });
  if (emeka) {
    await prisma.user.update({
      where: { id: emeka.id },
      data: {
        residentCode: 'RES-005',
        dateOfBirth: new Date('1985-09-12'),
        gender: 'Male',
        identificationType: 'CAC Certificate / National ID',
        idNumber: 'RC-1849204',
        emergencyContactName: 'Ngozi Daniels',
        emergencyContactPhone: '+234 813 999 0011',
        address: 'Promenade Wing, Sunrise Estate',
        residentStatus: 'ACTIVE'
      }
    });

    await prisma.userProperty.updateMany({
      where: { userId: emeka.id },
      data: {
        relationship: 'Business',
        status: 'ACTIVE',
        moveInDate: new Date('2025-05-10'),
        monthlyRent: 120000
      }
    });
  }

  // 6. Ibrahim Lawal (RES-006)
  const ibrahim = await prisma.user.findUnique({ where: { email: 'ibrahim.lawal@gmail.com' } });
  if (ibrahim) {
    await prisma.user.update({
      where: { id: ibrahim.id },
      data: {
        residentCode: 'RES-006',
        dateOfBirth: new Date('1987-12-01'),
        gender: 'Male',
        identificationType: 'Driver\'s License',
        idNumber: 'DL-5544-2211',
        emergencyContactName: 'Zainab Lawal',
        emergencyContactPhone: '+234 812 333 4455',
        address: 'Maple Residency, Abuja',
        residentStatus: 'ACTIVE'
      }
    });

    await prisma.userProperty.updateMany({
      where: { userId: ibrahim.id },
      data: {
        relationship: 'Tenant',
        status: 'ACTIVE',
        moveInDate: new Date('2025-07-01'),
        monthlyRent: 85000
      }
    });
  }

  console.log('✅ Existing residents synced successfully!');
}

syncResidents()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
