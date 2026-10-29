/**
 * Operational settings wire contracts (Phase 8).
 *
 * Settings are deliberately curated: the API exposes the few pieces of
 * organization configuration an estate office can change from the console,
 * never the structural configuration document (asset model, property options,
 * module switches, role grants).
 */

export const SOS_CONTACT_CATEGORIES = [
  'SECURITY',
  'MEDICAL',
  'FIRE',
  'ESTATE_OFFICE',
  'OTHER',
] as const;

export type SosContactCategory = (typeof SOS_CONTACT_CATEGORIES)[number];

export const SOS_CONTACT_CATEGORY_LABELS: Record<SosContactCategory, string> = {
  SECURITY: 'Security',
  MEDICAL: 'Medical',
  FIRE: 'Fire',
  ESTATE_OFFICE: 'Estate office',
  OTHER: 'Other',
};

/** A predefined emergency contact shown to residents and operators. */
export interface SosContactDto {
  id: string;
  label: string;
  phone: string;
  category: SosContactCategory;
  notes: string | null;
  active: boolean;
  sortOrder: number;
}

/** Bank-transfer instructions shown on onboarding and resident invoices. */
export interface BankTransferDetailsDto {
  bankName: string | null;
  accountName: string | null;
  accountNumber: string | null;
  sortCode: string | null;
  instructions: string | null;
}

/** The curated settings view returned by `GET /settings`. */
export interface OrganizationSettingsView {
  /** Active configuration version; send it back on update for optimistic concurrency. */
  version: number;
  onboarding: {
    registrationFee: {
      amountKobo: number;
      currency: 'NGN';
      description: string | null;
      refundable: boolean;
    };
  };
  accessCodes: {
    defaultDurationHours: number;
    minDurationHours: number;
    maxDurationHours: number;
  };
  payments: {
    bankTransfer: BankTransferDetailsDto;
  };
  sos: {
    contacts: SosContactDto[];
  };
}

/**
 * Partial update payload. Omitted sections are left untouched; `null` clears a
 * nullable field. The server merges before validating, so clients may send
 * only the section they edited.
 */
export interface OrganizationSettingsUpdateInput {
  expectedVersion?: number;
  onboarding?: {
    registrationFee?: {
      amountKobo?: number;
      description?: string | null;
      refundable?: boolean;
    };
  };
  accessCodes?: {
    defaultDurationHours?: number;
    maxDurationHours?: number;
  };
  payments?: {
    bankTransfer?: Partial<BankTransferDetailsDto>;
  };
  sos?: {
    contacts?: SosContactDto[];
  };
}
