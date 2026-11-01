import type { Express } from 'express';
import type { AppDependencies } from './dependencies.js';
import type { Env } from './config/env.js';
import { createApp } from './application.js';
import { ResidentProfileService } from './modules/resident/profile.service.js';
import { ResidentPropertiesService } from './modules/resident/properties.service.js';
import { ResidentDashboardService } from './modules/resident/dashboard.service.js';

/** Builds the Express application from the resolved dependency graph. */
export function buildApplication(deps: AppDependencies, env: Env): Express {
  // The profile and property services are shared: the resident routes use
  // them directly and the dashboard home composes them.
  const residentProfileService = new ResidentProfileService({
    users: deps.users,
    drafts: deps.residentOnboarding,
    audit: deps.audit,
    loadProperty: async (orgId, propertyId) => {
      const detail = await deps.loadPropertyDetail(orgId, propertyId);
      if (!detail) return null;
      return { identifier: detail.identifier, estate: detail.estate };
    },
  });
  const residentPropertiesService = new ResidentPropertiesService({
    drafts: deps.residentOnboarding,
    properties: deps.properties,
    estates: deps.estates,
  });
  const residentDashboardService = new ResidentDashboardService({
    profile: residentProfileService,
    properties: residentPropertiesService,
    finance: deps.residentFinanceService,
    codes: deps.residentCodesService,
    complaints: deps.residentComplaintsService,
    community: deps.residentCommunityService,
    bookings: deps.residentBookingsService,
    notifications: deps.residentNotificationsService,
  });

  return createApp({
    checkDatabase: deps.checkDatabase,
    configService: deps.configService,
    auth: {
      ...deps.auth,
      organizationId: deps.organizationId,
      // The auth router carries its own, much stricter limiter for the
      // credential-guessing surface. It is configured from the environment so
      // disposable test harnesses can raise it without touching the
      // production default.
      rateLimits: { loginPerWindow: env.AUTH_LOGIN_RATE_LIMIT_MAX },
    },
    estates: {
      estateService: deps.estateService,
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      organizationId: deps.organizationId,
    },
    properties: {
      propertyService: deps.propertyService,
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      organizationId: deps.organizationId,
    },
    imports: {
      importService: deps.importService,
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      organizationId: deps.organizationId,
      loadConfigVersion: deps.loadConfigVersion,
    },
    orgImports: {
      orgImportService: deps.orgImportService,
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      organizationId: deps.organizationId,
    },
    onboarding: {
      residentOnboarding: deps.residentOnboardingService,
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      organizationId: deps.organizationId,
      mediaStorage: deps.mediaStorage,
    },
    media: {
      storage: deps.mediaStorage,
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      organizationId: deps.organizationId,
      residentOnboarding: deps.residentOnboardingService,
    },
    dashboard: {
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      audit: deps.audit,
      users: deps.users,
      residentOnboarding: deps.residentOnboarding,
      estates: deps.estates,
      properties: deps.properties,
      finance: deps.finance,
      complaints: deps.complaints,
      sos: deps.sos,
      gate: deps.gate,
      organizationId: deps.organizationId,
      loadModules: deps.loadModules,
    },
    navigation: {
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      residentOnboarding: deps.residentOnboarding,
      finance: deps.finance,
      complaints: deps.complaints,
      messages: deps.messages,
      bookings: deps.bookings,
      sos: deps.sos,
      organizationId: deps.organizationId,
      loadModules: deps.loadModules,
    },
    audit: {
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      audit: deps.audit,
      organizationId: deps.organizationId,
    },
    resident: {
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      organizationId: deps.organizationId,
      profile: residentProfileService,
      properties: residentPropertiesService,
      finance: deps.residentFinanceService,
      codes: deps.residentCodesService,
      mediaStorage: deps.mediaStorage,
      complaints: deps.residentComplaintsService,
      messages: deps.residentMessagesService,
      community: deps.residentCommunityService,
      bookings: deps.residentBookingsService,
      sos: deps.residentSosService,
      notifications: deps.residentNotificationsService,
      dashboard: residentDashboardService,
    },
    sos: {
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      organizationId: deps.organizationId,
      sos: deps.operatorSosService,
    },
    messages: {
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      organizationId: deps.organizationId,
      messages: deps.operatorMessagesService,
    },
    complaints: {
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      organizationId: deps.organizationId,
      complaints: deps.operatorComplaintsService,
    },
    billing: {
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      organizationId: deps.organizationId,
      billing: deps.operatorBillingService,
    },
    gate: {
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      organizationId: deps.organizationId,
      gate: deps.operatorGateService,
    },
    facilities: {
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      organizationId: deps.organizationId,
      facilities: deps.operatorFacilitiesService,
    },
    bookings: {
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      organizationId: deps.organizationId,
      bookings: deps.operatorBookingsService,
      payment: deps.bookingPaymentService,
    },
    settings: {
      settingsService: deps.settingsService,
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      organizationId: deps.organizationId,
    },
    sync: {
      sessions: deps.auth.sessions,
      permissions: deps.auth.permissions,
      organizationId: deps.organizationId,
      audit: deps.audit,
      notifications: deps.notifications,
      community: deps.community,
      navigation: {
        residentOnboarding: deps.residentOnboarding,
        finance: deps.finance,
        complaints: deps.complaints,
        messages: deps.messages,
        bookings: deps.bookings,
        sos: deps.sos,
        loadModules: deps.loadModules,
      },
    },
  });
}
