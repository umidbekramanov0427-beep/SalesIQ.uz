-- Real 3-tier pricing (Start IQ / Analyst IQ / Master IQ) with separately
-- gated features and separate prices -- see src/lib/plan-gating.ts for the
-- feature matrix and seat limits.
--
-- Every organization that exists at the moment this migration runs was
-- already using the platform before pricing tiers existed (many on
-- AmoCRM/analytics already), so all of them are grandfathered onto
-- master_iq here rather than losing access to features they already use --
-- confirmed with the platform owner. Only an organization created AFTER
-- this migration starts on the new default (start_iq) and actually sees
-- the real feature gates.
update public.organizations set plan = 'master_iq';

alter table public.organizations
  alter column plan set default 'start_iq';

alter table public.organizations
  drop constraint if exists organizations_plan_check;
alter table public.organizations
  add constraint organizations_plan_check
  check (plan in ('start_iq', 'analyst_iq', 'master_iq'));

-- Seats beyond a plan's included limit (see SEAT_LIMITS in
-- plan-gating.ts) that the platform owner has explicitly granted an org,
-- each billed at platform_settings.extra_seat_price_uzs/month on top of
-- the plan's own price -- see the "Qo'shimcha joylar" control on
-- /platform/organizations/$orgId and getBillingStatus()'s price
-- computation.
alter table public.organizations
  add column if not exists extra_seats integer not null default 0;
alter table public.organizations
  drop constraint if exists organizations_extra_seats_nonnegative;
alter table public.organizations
  add constraint organizations_extra_seats_nonnegative check (extra_seats >= 0);

alter table public.platform_settings
  add column if not exists price_start_iq_uzs bigint not null default 299000,
  add column if not exists price_analyst_iq_uzs bigint not null default 399000,
  add column if not exists price_master_iq_uzs bigint not null default 699000,
  add column if not exists extra_seat_price_uzs bigint not null default 20000;

-- Backfills the new per-tier prices from the old single price for any
-- project that already customized subscription_price_uzs away from its
-- zero default, so an existing platform owner's configured price isn't
-- silently lost -- applied to master_iq, the closest equivalent to "the
-- one price everyone used to pay". subscription_price_uzs itself is left
-- in place (unused by new code) rather than dropped.
update public.platform_settings
  set price_master_iq_uzs = subscription_price_uzs
  where subscription_price_uzs > 0;
