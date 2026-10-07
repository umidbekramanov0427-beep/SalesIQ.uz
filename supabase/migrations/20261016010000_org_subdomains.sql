-- Per-company subdomains: <subdomain>.salesiq.uz. DNS already has a
-- wildcard CNAME (*.salesiq.uz); the app reads the host, shows the
-- company's name on its login page, and only lets that company's own
-- members in (see src/lib/subdomain.ts and SubdomainGuard).
alter table public.organizations add column if not exists subdomain text;

create unique index if not exists organizations_subdomain_key
  on public.organizations (lower(subdomain)) where subdomain is not null;

do $$
begin
  alter table public.organizations
    add constraint organizations_subdomain_format
    check (subdomain is null or subdomain ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$');
exception
  when duplicate_object then null;
end $$;
