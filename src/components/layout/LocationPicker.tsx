import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, LocateFixed, MapPin, Search } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  useIntegrationSetting,
  useSetOfficeLocation,
  type OfficeLocationConfig,
} from "@/hooks/use-crm-data";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type NominatimResult = { display_name: string; lat: string; lon: string };

// Address search + map preview via OpenStreetMap's public Nominatim search
// and embed endpoints — both work without any API key, so precise office
// locations can be picked without a maps provider connected to this
// workspace.
export function LocationPicker({ canEdit }: { canEdit: boolean }) {
  const { t } = useI18n();
  const { data: setting } = useIntegrationSetting("office_location");
  const setLocation = useSetOfficeLocation();
  const config = (setting?.config ?? null) as OfficeLocationConfig | null;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<NominatimResult | null>(null);
  const [detecting, setDetecting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    setQuery(config?.address ?? "");
    setPicked(null);
    setResults([]);
  }, [open, config?.address]);

  useEffect(() => {
    if (!canEdit || !open || query.trim().length < 3) {
      setResults([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearching(true);
      fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`,
      )
        .then((res) => res.json())
        .then((json: NominatimResult[]) => setResults(Array.isArray(json) ? json : []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 500);
    return () => clearTimeout(debounceRef.current);
  }, [query, open, canEdit]);

  function detectCurrentLocation() {
    if (!navigator.geolocation) {
      toast.error(t("shell.detectFailed"));
      return;
    }
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
        )
          .then((res) => res.json())
          .then((json: { display_name?: string }) => {
            const displayName = json.display_name ?? `${latitude}, ${longitude}`;
            setQuery(displayName);
            setResults([]);
            setPicked({ display_name: displayName, lat: String(latitude), lon: String(longitude) });
          })
          .catch(() => toast.error(t("shell.detectFailed")))
          .finally(() => setDetecting(false));
      },
      () => {
        toast.error(t("shell.detectFailed"));
        setDetecting(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function save() {
    if (!picked) return;
    try {
      await setLocation.mutateAsync({
        label: picked.display_name.split(",").slice(0, 2).join(","),
        address: picked.display_name,
        lat: Number(picked.lat),
        lon: Number(picked.lon),
      });
      toast.success(t("shell.locationSaved"));
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("shell.locationSaveFailed"));
    }
  }

  const previewLat = picked ? Number(picked.lat) : config?.lat;
  const previewLon = picked ? Number(picked.lon) : config?.lon;
  const hasPreview = previewLat !== undefined && previewLon !== undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
        <MapPin className="h-3.5 w-3.5 shrink-0 text-success" />
        <span className="max-w-[220px] truncate">{config?.label || t("shell.setLocation")}</span>
        <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2.5 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-subtle">
          {t("shell.workspace")}
        </p>
        {!canEdit ? (
          <p className="text-sm text-muted-foreground">
            {config?.address || t("shell.locationNotSet")}
          </p>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("shell.locationSearchPlaceholder")}
                className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-2 text-sm outline-none focus:border-primary/40"
              />
            </div>
            <button
              type="button"
              onClick={detectCurrentLocation}
              disabled={detecting}
              className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground transition-colors hover:bg-accent disabled:opacity-60"
            >
              {detecting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <LocateFixed className="h-3.5 w-3.5" />
              )}
              {t("shell.detectLocation")}
            </button>
            {searching && (
              <div className="flex items-center gap-2 text-xs text-subtle">
                <Loader2 className="h-3 w-3 animate-spin" /> {t("common.loading")}
              </div>
            )}
            {results.length > 0 && (
              <ul className="max-h-40 space-y-1 overflow-y-auto">
                {results.map((r) => (
                  <li key={`${r.lat}-${r.lon}`}>
                    <button
                      type="button"
                      onClick={() => setPicked(r)}
                      className={cn(
                        "flex w-full items-start gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent",
                        picked?.display_name === r.display_name && "bg-primary/10 text-primary",
                      )}
                    >
                      <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                      <span className="truncate">{r.display_name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {hasPreview && (
              <iframe
                title="location-preview"
                className="h-32 w-full rounded-lg border border-border"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${previewLon! - 0.01}%2C${previewLat! - 0.01}%2C${previewLon! + 0.01}%2C${previewLat! + 0.01}&layer=mapnik&marker=${previewLat}%2C${previewLon}`}
              />
            )}
            <button
              type="button"
              onClick={() => void save()}
              disabled={!picked || setLocation.isPending}
              className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {setLocation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              {t("common.save")}
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
