import { describe, expect, it } from 'vitest';
import { PRIMARY_NAV, SETTINGS_NAV, isNavItemVisible, sectionLabelForPath } from './navigation';

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

  it('gates estate and property links on their read permissions', () => {
    expect(isNavItemVisible(item('Estates'), {}, false)).toBe(false);
    expect(isNavItemVisible(item('Estates'), { 'estate.read': true }, false)).toBe(true);
    expect(isNavItemVisible(item('Properties'), {}, false)).toBe(false);
    expect(isNavItemVisible(item('Properties'), { 'property.read': true }, false)).toBe(true);
  });

  it('gates account-administration links on user management', () => {
    expect(isNavItemVisible(item('Residents'), {}, false)).toBe(false);
    expect(isNavItemVisible(item('Users'), {}, false)).toBe(false);
    expect(isNavItemVisible(item('Residents'), {}, true)).toBe(true);
    expect(isNavItemVisible(item('Users'), {}, true)).toBe(true);
  });

  it('derives the sticky-header section from the current path', () => {
    expect(sectionLabelForPath('/app')).toBe('Overview');
    expect(sectionLabelForPath('/app/estates/123')).toBe('Estates');
    expect(sectionLabelForPath('/app/properties/123')).toBe('Property');
    expect(sectionLabelForPath('/app/properties')).toBe('Properties');
    expect(sectionLabelForPath('/app/residents')).toBe('Residents');
    expect(sectionLabelForPath('/app/users')).toBe('Users');
    expect(sectionLabelForPath('/app/activity')).toBe('Activity');
    expect(sectionLabelForPath('/app/account')).toBe('Settings');
  });
});
