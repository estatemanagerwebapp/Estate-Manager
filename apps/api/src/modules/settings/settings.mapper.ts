import {
  ACCESS_CODE_DURATION_MIN_HOURS,
  type OrganizationConfig,
} from '@silverstone/config-schema';
import type {
  BankTransferDetailsDto,
  OrganizationSettingsView,
  SosContactDto,
} from '@silverstone/shared';

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Map the stored bank-transfer section to the resident-facing DTO. */
export function bankTransferDetailsFromConfig(
  config: OrganizationConfig,
): BankTransferDetailsDto | null {
  const details = config.payments?.bankTransfer;
  if (!details) return null;

  const dto: BankTransferDetailsDto = {
    bankName: cleanText(details.bankName),
    accountName: cleanText(details.accountName),
    accountNumber: cleanText(details.accountNumber),
    sortCode: cleanText(details.sortCode),
    instructions: cleanText(details.instructions),
  };

  // The three account fields are all-or-nothing. Instructions or a sort code
  // alone cannot make a usable transfer instruction, so the block stays hidden.
  const configured =
    dto.bankName !== null && dto.accountName !== null && dto.accountNumber !== null;

  return configured ? dto : null;
}

function toSosContactDto(contact: OrganizationConfig['sos']['contacts'][number]): SosContactDto {
  return {
    id: contact.id,
    label: contact.label,
    phone: contact.phone,
    category: contact.category,
    notes: contact.notes ?? null,
    active: contact.active,
    sortOrder: contact.sortOrder,
  };
}

/** Active contacts only, ordered for display. */
export function activeSosContactsFromConfig(config: OrganizationConfig): SosContactDto[] {
  return (config.sos?.contacts ?? [])
    .filter((contact) => contact.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
    .map(toSosContactDto);
}

/** Curated operator settings view. Never exposes structural configuration. */
export function organizationSettingsViewFromConfig(
  config: OrganizationConfig,
  version: number,
): OrganizationSettingsView {
  const fee = config.fees.registration;
  const bank = config.payments?.bankTransfer;

  return {
    version,
    onboarding: {
      registrationFee: {
        amountKobo: fee.amountKobo,
        currency: fee.currency,
        description: fee.description ?? null,
        refundable: fee.refundable,
      },
    },
    accessCodes: {
      defaultDurationHours: config.accessCodes.defaultDurationHours,
      minDurationHours: ACCESS_CODE_DURATION_MIN_HOURS,
      maxDurationHours: config.accessCodes.maxDurationHours,
    },
    payments: {
      bankTransfer: {
        bankName: cleanText(bank?.bankName),
        accountName: cleanText(bank?.accountName),
        accountNumber: cleanText(bank?.accountNumber),
        sortCode: cleanText(bank?.sortCode),
        instructions: cleanText(bank?.instructions),
      },
    },
    sos: {
      contacts: (config.sos?.contacts ?? []).map(toSosContactDto),
    },
  };
}
