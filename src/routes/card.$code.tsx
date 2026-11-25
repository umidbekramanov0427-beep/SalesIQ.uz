import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, Download, Loader2, Mail, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

// A person's open business card (Profil → Imzo va vizitka → QR vizitka):
// name, position, company, phone and email, and «Kontaktni saqlash» as a
// .vcf file. Read through public_vcard(), which returns only these fields.
export const Route = createFileRoute("/card/$code")({
  head: () => ({ meta: [{ title: "Vizitka — SalesIQ" }, { name: "robots", content: "noindex" }] }),
  component: CardPage,
});

type Card = {
  name: string | null;
  last_name: string | null;
  position: string | null;
  phone: string | null;
  email: string | null;
  avatar: string | null;
  company: string | null;
  logo: string | null;
};

function vcf(c: Card): string {
  const esc = (s: string | null) => (s ?? "").replace(/[,;\\]/g, (m) => `\\${m}`);
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${esc(c.last_name)};${esc(c.name)};;;`,
    `FN:${esc([c.name, c.last_name].filter(Boolean).join(" "))}`,
    c.company ? `ORG:${esc(c.company)}` : "",
    c.position ? `TITLE:${esc(c.position)}` : "",
    c.phone ? `TEL;TYPE=CELL:${c.phone}` : "",
    c.email ? `EMAIL:${c.email}` : "",
    "END:VCARD",
  ]
    .filter(Boolean)
    .join("\r\n");
}

function CardPage() {
  const { code } = Route.useParams();
  const { t } = useI18n();
  const { data: card, isLoading } = useQuery({
    queryKey: ["public-vcard", code],
    queryFn: async (): Promise<Card | null> => {
      const { data, error } = await supabase.rpc("public_vcard", { p_code: code });
      if (error) return null;
      return (data as Card | null) ?? null;
    },
  });

  if (isLoading)
    return (
      <div className="grid min-h-dvh place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  if (!card)
    return (
      <div className="grid min-h-dvh place-items-center bg-background px-6 text-center text-muted-foreground">
        {t("pf.card.notFound")}
      </div>
    );

  const fullName = [card.name, card.last_name].filter(Boolean).join(" ");
  function save() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([vcf(card!)], { type: "text/vcard" }));
    a.download = `${fullName || "kontakt"}.vcf`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className="flex flex-col items-center gap-3 border-b border-border px-6 pb-6 pt-8 text-center">
          {card.avatar ? (
            <img src={card.avatar} alt="" className="h-24 w-24 rounded-full object-cover" />
          ) : (
            <span className="grid h-24 w-24 place-items-center rounded-full bg-primary/15 text-3xl font-bold text-primary">
              {(card.name ?? "?").slice(0, 1).toUpperCase()}
            </span>
          )}
          <div>
            <h1 className="text-[22px] font-extrabold text-foreground">{fullName}</h1>
            {card.position && <p className="text-[14px] text-muted-foreground">{card.position}</p>}
          </div>
          {card.company && (
            <p className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-foreground">
              {card.logo ? (
                <img src={card.logo} alt="" className="h-5 w-5 rounded object-contain" />
              ) : (
                <Building2 className="h-4 w-4 text-muted-foreground" />
              )}
              {card.company}
            </p>
          )}
        </div>
        <div className="space-y-2 px-6 py-5">
          {card.phone && (
            <a
              href={`tel:${card.phone}`}
              className="ctl-soft flex h-11 items-center gap-3 rounded-xl px-4 text-[14px] font-semibold"
            >
              <Phone className="h-4 w-4 text-primary" /> {card.phone}
            </a>
          )}
          {card.email && (
            <a
              href={`mailto:${card.email}`}
              className="ctl-soft flex h-11 items-center gap-3 rounded-xl px-4 text-[14px] font-semibold"
            >
              <Mail className="h-4 w-4 text-primary" />{" "}
              <span className="truncate">{card.email}</span>
            </a>
          )}
          <button
            type="button"
            onClick={save}
            className="ctl-lit flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold"
          >
            <Download className="h-4 w-4" /> {t("pf.card.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
