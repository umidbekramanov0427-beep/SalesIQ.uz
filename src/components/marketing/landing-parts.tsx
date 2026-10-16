// Small pieces shared by the landing page's sections (Landing.tsx and the
// pricing comparison in PricingCompare.tsx).

export function formatUzs(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
}

/** What /api/pricing returns: live prices and the owner's support contacts. */
export type PublicSiteInfo = {
  priceStartIqUzs: number;
  priceAnalystIqUzs: number;
  priceMasterIqUzs: number;
  extraSeatPriceUzs: number;
  supportPhone: string | null;
  supportTelegram: string | null;
  supportEmail: string | null;
};

export const shell = "mx-auto w-full max-w-[1200px] px-5 sm:px-8";

export function SectionHead({
  eyebrow,
  title,
  accent,
  desc,
}: {
  eyebrow: string;
  title: string;
  accent: string;
  desc?: string;
}) {
  return (
    <div data-reveal>
      <p className="lp-eyebrow">{eyebrow}</p>
      <h2 className="lp-display mt-5 text-[40px] font-semibold leading-[1.04] sm:text-[52px]">
        {title}
        <br />
        <span className="lp-grad-text">{accent}</span>
      </h2>
      {desc && (
        <p className="mt-5 max-w-md text-[16px] leading-relaxed text-[var(--lp-muted)]">{desc}</p>
      )}
    </div>
  );
}
