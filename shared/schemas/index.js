const { z } = require('zod');
const { ROLES } = require('../constants/roles');
const { 
  ACCESS_CODE_TYPES, 
  PROPERTY_TYPES, 
  RESIDENT_RELATIONSHIPS, 
  COMPLAINT_PRIORITY 
} = require('../constants/status');

// 1. Authentication Schemas
const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters')
});

const registerSchema = z.object({
  firstName: z.string().min(2, 'First name is required'),
  lastName: z.string().min(2, 'Last name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(10, 'Valid phone number is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.nativeEnum(ROLES).default(ROLES.RESIDENT)
});

// 2. Access Code Generation (Rule 8: Resident ID is strictly rejected from schema payload)
const createAccessCodeSchema = z.object({
  estateId: z.string().min(1, 'Estate ID is required'),
  propertyId: z.string().min(1, 'Property ID is required'),
  type: z.nativeEnum(ACCESS_CODE_TYPES).default(ACCESS_CODE_TYPES.GUEST),
  visitorName: z.string().min(2, 'Visitor name is required'),
  visitorPhone: z.string().optional(),
  vehiclePlate: z.string().optional(),
  validFrom: z.string().datetime().optional(),
  expiresAt: z.string().datetime({ message: 'Valid expiration datetime is required' }),
  maxUses: z.number().int().positive().default(1)
}).strict(); // Disallow extra unexpected fields like injected residentId

// 3. Gate Verification Schema (Sub-5-second validation)
const verifyAccessCodeSchema = z.object({
  code: z.string().min(4, 'Code is required').max(10, 'Code format invalid'),
  estateId: z.string().min(1, 'Estate ID is required'),
  visitorImage: z.string().optional(), // Base64 or uploaded URL
  vehicleImage: z.string().optional(),
  guardNotes: z.string().optional()
});

// 4. Super Admin Code Restriction Schema (Rule 11, 12, 13)
const restrictAccessCodeSchema = z.object({
  reason: z.string().min(5, 'A clear justification/reason for restriction is required'),
  notifyResident: z.boolean().default(true)
});

// 5. Property Schema
const propertySchema = z.object({
  estateId: z.string().min(1, 'Estate ID is required'),
  type: z.nativeEnum(PROPERTY_TYPES),
  court: z.string().optional(),
  block: z.string().optional(),
  floor: z.string().optional(),
  apartmentNumber: z.string().min(1, 'Apartment/Unit number is required'),
  displayIdentifier: z.string().min(1, 'Display identifier is required')
});

// 6. Maintenance / Complaint Schema
const createComplaintSchema = z.object({
  estateId: z.string().min(1, 'Estate ID is required'),
  propertyId: z.string().optional().nullable(),
  residentId: z.string().optional().nullable(),
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().min(5, 'Description must be at least 5 characters'),
  category: z.string().optional().nullable(),
  priority: z.string().optional().default('MEDIUM'),
  location: z.string().optional().nullable(),
  estimatedCost: z.number().optional().nullable(),
  dueDate: z.any().optional().nullable(),
  attachments: z.array(z.string()).optional()
});

// 7. External Onboarding Sync Schema (Idempotent engine)
const onboardingSyncSchema = z.object({
  externalId: z.string().min(1, 'External record ID is required'),
  estateCode: z.string().min(1, 'Estate code is required'),
  user: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    phone: z.string().min(10)
  }),
  property: z.object({
    unitIdentifier: z.string().min(1),
    type: z.nativeEnum(PROPERTY_TYPES),
    relationship: z.nativeEnum(RESIDENT_RELATIONSHIPS)
  }),
  syncTimestamp: z.string().datetime()
});

module.exports = {
  loginSchema,
  registerSchema,
  createAccessCodeSchema,
  verifyAccessCodeSchema,
  restrictAccessCodeSchema,
  propertySchema,
  createComplaintSchema,
  onboardingSyncSchema
};
