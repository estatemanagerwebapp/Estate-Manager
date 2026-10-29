import { describe, expect, it } from 'vitest';
import {
  NAV_SECTIONS,
  PRIMARY_NAV,
  SETTINGS_NAV,
  isNavItemVisible,
  sectionLabelForPath,
} from './navigation';

function item(label: string) {
  const found = [...PRIMARY_NAV, ...SETTINGS_NAV].find((entry) => entry.label === label);
  if (!found) throw new Error(`Missing nav item: ${label}`);
  return found;
}

describe('operator navigation registry', () => {
  it('always shows the overview and account settings', () => {
    expect(isNavItemVisible(item('Overview'), {}, false)).toBe(true);
    expect(isNavItemVisible(item('Account & password'), {}, false)).toBe(true);
  });

  it('gates estate settings on the config manage permission', () => {
    expect(isNavItemVisible(item('Estate settings'), {}, false)).toBe(false);
    expect(isNavItemVisible(item('Estate settings'), { 'config.manage': true }, false)).toBe(true);
  });

  it('gates estate and property links on their read permissions', () => {
    expect(isNavItemVisible(item('Estates'), {}, false)).toBe(false);
    expect(isNavItemVisible(item('Estates'), { 'estate.read': true }, false)).toBe(true);
    expect(isNavItemVisible(item('Properties'), {}, false)).toBe(false);
    expect(isNavItemVisible(item('Properties'), { 'property.read': true }, false)).toBe(true);
  });

  it('gates account-administration links on user management', () => {
    expect(isNavItemVisible(item('Residents'), {}, false)).toBe(false);
    expect(isNavItemVisible(item('Administrators'), {}, false)).toBe(false);
    expect(isNavItemVisible(item('Residents'), {}, true)).toBe(true);
    expect(isNavItemVisible(item('Administrators'), {}, true)).toBe(true);
  });

  it('gates data import on import.manage', () => {
    expect(isNavItemVisible(item('Data import'), {}, false)).toBe(false);
    expect(isNavItemVisible(item('Data import'), { 'import.manage': true }, false)).toBe(true);
  });

  it('groups destinations into the approved operator sections', () => {
    expect(NAV_SECTIONS.map((section) => section.label ?? section.id)).toEqual([
      'overview',
      'Front desk',
      'Portfolio',
      'Operations',
      'Administration',
    ]);

    const labels = (id: string) =>
      NAV_SECTIONS.find((section) => section.id === id)?.items.map((entry) => entry.label);

    expect(labels('front-desk')).toEqual(['SOS alerts', 'Messages', 'Complaints']);
    expect(labels('portfolio')).toEqual(['Estates', 'Properties', 'Residents']);
    expect(labels('operations')).toEqual(['Billing', 'Facilities', 'Bookings', 'Gate access']);
    expect(labels('administration')).toEqual(['Activity', 'Data import', 'Administrators']);
  });

  it('assigns counters only to actionable destinations', () => {
    expect(item('SOS alerts').badge).toBe('sosAlerts');
    expect(item('Messages').badge).toBe('unreadMessages');
    expect(item('Complaints').badge).toBe('openComplaints');
    expect(item('Residents').badge).toBe('pendingResidents');
    expect(item('Billing').badge).toBe('overdueInvoices');
    expect(item('Facilities').badge).toBe('facilityWaitlist');
    expect(item('Bookings').badge).toBe('requestedBookings');
    expect(item('Data import').badge).toBeUndefined();
    expect(item('Gate access').badge).toBeUndefined();
  });

  it('gates SOS alerts on the SOS read permission', () => {
    expect(isNavItemVisible(item('SOS alerts'), {}, false)).toBe(false);
    expect(isNavItemVisible(item('SOS alerts'), { 'sos.read': true }, false)).toBe(true);
  });

  it('gates the activity log on audit.read', () => {
    expect(isNavItemVisible(item('Activity'), {}, false)).toBe(false);
    expect(isNavItemVisible(item('Activity'), { 'audit.read': true }, false)).toBe(true);
  });

  it('gates billing on the billing read permission', () => {
    expect(isNavItemVisible(item('Billing'), {}, false)).toBe(false);
    expect(isNavItemVisible(item('Billing'), { 'billing.read': true }, false)).toBe(true);
  });

  it('gates gate access on the verification read permission', () => {
    expect(isNavItemVisible(item('Gate access'), {}, false)).toBe(false);
    expect(isNavItemVisible(item('Gate access'), { 'verification.read': true }, false)).toBe(true);
  });

  it('gates messages and complaints on their read permissions', () => {
    expect(isNavItemVisible(item('Messages'), {}, false)).toBe(false);
    expect(isNavItemVisible(item('Messages'), { 'message.read': true }, false)).toBe(true);
    expect(isNavItemVisible(item('Complaints'), {}, false)).toBe(false);
    expect(isNavItemVisible(item('Complaints'), { 'complaint.read': true }, false)).toBe(true);
  });

  it('derives the sticky-header section from the current path', () => {
    expect(sectionLabelForPath('/app')).toBe('Overview');
    expect(sectionLabelForPath('/app/estates/123')).toBe('Estates');
    expect(sectionLabelForPath('/app/properties/123')).toBe('Property');
    expect(sectionLabelForPath('/app/properties')).toBe('Properties');
    expect(sectionLabelForPath('/app/imports')).toBe('Data import');
    expect(sectionLabelForPath('/app/billing')).toBe('Billing');
    expect(sectionLabelForPath('/app/residents')).toBe('Residents');
    expect(sectionLabelForPath('/app/administrators')).toBe('Administrators');
    // Old bookmarks redirect to Administrators but still label the header.
    expect(sectionLabelForPath('/app/users')).toBe('Administrators');
    expect(sectionLabelForPath('/app/sos')).toBe('SOS alerts');
    expect(sectionLabelForPath('/app/messages')).toBe('Messages');
    expect(sectionLabelForPath('/app/complaints')).toBe('Complaints');
    expect(sectionLabelForPath('/app/gate')).toBe('Gate access');
    expect(sectionLabelForPath('/app/activity')).toBe('Activity');
    expect(sectionLabelForPath('/app/settings')).toBe('Settings');
    expect(sectionLabelForPath('/app/account')).toBe('Settings');
  });
});
