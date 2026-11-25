// Mahsulotlarni yuklash: paste a table copied from Excel (or pick a CSV
// file), check the preview, import. Same SKU or name updates the product;
// a quantity on hand comes in as one kirim.
import { useMemo, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useImportProducts, useProducts } from "@/hooks/crm/warehouse";
import { useI18n } from "@/lib/i18n";
import { formatUzs } from "@/lib/currency";
import { describeError } from "@/lib/utils";
import { parseProductTable } from "@/lib/warehouse";

export function ProductImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const { data: products = [] } = useProducts();
  const run = useImportProducts();
  const [text, setText] = useState("");
  const rows = useMemo(() => parseProductTable(text), [text]);
  async function pickFile(f: File | undefined) {
    if (!f) return;
    setText(await f.text());
  }
  async function submit() {
    try {
      const r = await run.mutateAsync({ rows, existing: products });
      toast.success(t("wh.import.done", { added: r.added, updated: r.updated }));
      onOpenChange(false);
    } catch (e) {
      toast.error(describeError(e, t("wh.failed")));
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("wh.import.title")}</DialogTitle>
        </DialogHeader>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{t("wh.import.hint")}</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("wh.import.placeholder")}
          className="h-36 w-full resize-y rounded-lg border border-border bg-card p-3 font-mono text-[12.5px] outline-none focus:border-primary/60"
        />
        <label className="inline-flex w-fit cursor-pointer items-center gap-2 text-[13px] font-semibold text-primary hover:underline">
          <FileUp className="h-4 w-4" /> {t("wh.import.file")}
          <input
            type="file"
            accept=".csv,.tsv,.txt,text/csv"
            className="hidden"
            onChange={(e) => void pickFile(e.target.files?.[0])}
          />
        </label>
        {rows.length > 0 && (
          <div className="max-h-60 overflow-auto rounded-lg border border-border">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-left text-[12px] text-muted-foreground">
                  <th className="px-3 py-2">{t("wh.col.product")}</th>
                  <th className="px-3 py-2">SKU</th>
                  <th className="px-3 py-2 text-right">{t("wh.f.price")}</th>
                  <th className="px-3 py-2 text-right">{t("wh.qty")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((r, i) => (
                  <tr key={i} className="border-b border-border/60">
                    <td className="px-3 py-1.5">{r.name}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{r.sku ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatUzs(r.price)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {r.qty || "—"} {r.qty ? r.unit : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-muted-foreground">
            {t("wh.import.count", { n: rows.length })}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void submit()} disabled={!rows.length || run.isPending}>
              {run.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("wh.import.run")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
