import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { UserRound } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { NAV_ITEMS, appRoleOf, navItemsFor } from "@/lib/nav";
import { useLeadSearch } from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

// ⌘K: jump to any page this user's role opens, or to a lead by name. Only
// real data -- the leads come from the database, scoped like everywhere
// else (a rep finds only their own).
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const isPlatformOwner = user?.role === "platform_owner";
  const pages = isPlatformOwner
    ? NAV_ITEMS.filter((i) => i.platformOwnerOnly)
    : navItemsFor(appRoleOf(user));
  const searchLeads = open && !isPlatformOwner && term.trim().length >= 2;
  const { data: leads = [] } = useLeadSearch(term, searchLeads);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) setTerm("");
  }, [open]);

  const go = (to: string) => {
    onOpenChange(false);
    void navigate({ to });
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder={t("cmd.placeholder")} value={term} onValueChange={setTerm} />
      <CommandList>
        <CommandEmpty>{t("cmd.noResults")}</CommandEmpty>

        <CommandGroup heading={t("cmd.navigation")}>
          {pages.map((item) => (
            <CommandItem
              key={item.to}
              value={`nav ${item.label} ${t(`nav.${item.to}`)}`}
              onSelect={() => go(item.to)}
            >
              <item.icon className="mr-2 h-4 w-4" />
              {t(`nav.${item.to}`)}
            </CommandItem>
          ))}
        </CommandGroup>

        {searchLeads && leads.length > 0 && (
          <CommandGroup heading={t("cmd.leads")}>
            {leads.map((l) => (
              <CommandItem
                key={l.id}
                value={`lead ${l.id} ${l.name} ${l.company_name ?? ""}`}
                onSelect={() => go(`/crm/leads/${l.id}`)}
              >
                <UserRound className="mr-2 h-4 w-4" />
                <span className="truncate">{l.name}</span>
                {l.company_name && (
                  <span className="ml-auto truncate pl-3 text-xs text-subtle">
                    {l.company_name}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
