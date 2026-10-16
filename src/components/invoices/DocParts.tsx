// Pieces of a printed document (invoices, acts): a party's details block
// and a signature line. Black on white in both themes, A4 when printed.

export function Party({
  title,
  rows,
}: {
  title: string;
  rows: [string, string | null | undefined][];
}) {
  return (
    <div>
      <p className="mb-2 border-b border-neutral-300 pb-1 text-[12px] font-bold uppercase tracking-wide text-neutral-600">
        {title}
      </p>
      <dl className="space-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[120px_1fr] gap-2">
            <dt className="text-neutral-500">{k}</dt>
            <dd className="font-medium">{v || "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function Sign({ label, name }: { label: string; name: string | null | undefined }) {
  return (
    <div>
      <p className="text-neutral-600">{label}</p>
      <div className="mt-6 flex items-end gap-2">
        <span className="flex-1 border-b border-neutral-400" />
        <span className="min-w-[120px] text-right font-medium">{name ?? ""}</span>
      </div>
    </div>
  );
}
