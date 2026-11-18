// "Tayyor javoblar" in every chat composer (CRM lead chat, owner Inbox): like
// the Windows clipboard history -- pinned answers stay (saved in the cloud),
// the person's recently sent answers come up on their own and can be pinned
// with one click. A click on any of them puts it in the message.
import { useState } from "react";
import { Check, Clock3, Pin, PinOff } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type PinnedReply = { id: string; text: string };

export function QuickReplies({
  pinned,
  recent,
  onPick,
  onPin,
  onUnpin,
  busy = false,
}: {
  pinned: PinnedReply[];
  recent: string[];
  onPick: (text: string) => void;
  onPin: (text: string) => void;
  onUnpin: (id: string) => void;
  busy?: boolean;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onPin(v);
    setDraft("");
  };
  const item = (
    key: string,
    text: string,
    action: { icon: typeof Pin; label: string; run: () => void; on?: boolean },
  ) => (
    <li key={key} className="group relative">
      <button
        type="button"
        onClick={() => onPick(text)}
        className={cn(
          "w-full rounded-xl border px-3 py-2 pr-9 text-left text-[13px] leading-snug text-foreground transition-colors hover:border-primary/40 hover:bg-primary/[0.04]",
          action.on ? "border-primary/25 bg-primary/[0.03]" : "border-border bg-card",
        )}
      >
        <span className="line-clamp-3 whitespace-pre-wrap break-words">{text}</span>
      </button>
      <button
        type="button"
        title={action.label}
        aria-label={action.label}
        disabled={busy}
        onClick={action.run}
        className={cn(
          "absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-lg transition-[opacity,colors] hover:bg-accent disabled:opacity-40",
          action.on
            ? "text-primary"
            : "text-muted-foreground opacity-0 focus-visible:opacity-100 group-hover:opacity-100 phone:opacity-100",
        )}
      >
        <action.icon className="h-3.5 w-3.5" />
      </button>
    </li>
  );
  return (
    <div className="flex max-h-[min(70vh,520px)] flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-1">
        <section>
          <p className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-wider text-subtle">
            <Pin className="h-3 w-3" /> {t("qr.pinned")}
          </p>
          {pinned.length ? (
            <ul className="space-y-1.5">
              {pinned.map((p) =>
                item(`p-${p.id}`, p.text, {
                  icon: PinOff,
                  label: t("qr.unpin"),
                  run: () => onUnpin(p.id),
                  on: true,
                }),
              )}
            </ul>
          ) : (
            <p className="px-1 text-[12.5px] text-subtle">{t("qr.noPinned")}</p>
          )}
        </section>
        {recent.length > 0 && (
          <section>
            <p className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-wider text-subtle">
              <Clock3 className="h-3 w-3" /> {t("qr.recent")}
            </p>
            <ul className="space-y-1.5">
              {recent.map((r, i) =>
                item(`r-${i}`, r, { icon: Pin, label: t("qr.pin"), run: () => onPin(r) }),
              )}
            </ul>
          </section>
        )}
      </div>
      <div className="mt-2 flex gap-1.5 border-t border-border pt-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={t("oinbox.newTemplate")}
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-card px-2.5 text-[13px] outline-none focus:border-primary"
        />
        <button
          type="button"
          disabled={!draft.trim() || busy}
          onClick={add}
          aria-label={t("qr.pin")}
          className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground disabled:bg-muted disabled:text-muted-foreground"
        >
          <Check className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
