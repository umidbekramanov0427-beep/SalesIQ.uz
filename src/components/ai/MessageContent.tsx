import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Headset, Send } from "lucide-react";
import { cn } from "@/lib/utils";

// The assistant is instructed to always include a lead's real /crm/leads/<id>
// path verbatim when it mentions that lead (see ai-assistant.chat.ts's system
// prompt) -- messages render as plain text otherwise, so without this those
// paths would just sit there as unclickable text instead of taking the user
// straight to the lead.
const LEAD_PATH_RE = /\/crm\/leads\/([a-zA-Z0-9-]+)/;

/** Same as OPEN_SUPPORT_EVENT in AiAssistantFab: opens its Operator tab. */
const OPEN_SUPPORT = "salesiq:open-support";

// A page link the assistant gives ("go to this section") is a small button.
const CHIP =
  "mx-0.5 inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-0.5 align-baseline font-semibold text-primary no-underline transition-colors hover:bg-primary/20";

/** "/settings?section=profile" -> a router link with its search. */
function PageLink({ href, children }: { href: string; children: ReactNode }) {
  const [path, query] = href.split("?");
  const search = query ? Object.fromEntries(new URLSearchParams(query)) : undefined;
  return (
    <Link to={path!} {...(search ? { search: search as never } : {})} className={CHIP}>
      {children}
      <ArrowUpRight className="h-3.5 w-3.5" />
    </Link>
  );
}

// The AI writes its replies in light Markdown (**bold**, ### headers, "* "
// bullets, "1. " numbered lists, [label](url) links, --- rules), but the
// message bubble used to render raw text -- every ** and [ ]( ) showed up
// literally instead of as formatting. This is a small hand-rolled parser
// (not a full Markdown engine) covering exactly what the assistant's own
// prompt asks it to produce.
function renderInline(text: string, keyPrefix: string, openLabel: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re =
    /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|(\/crm\/leads\/[a-zA-Z0-9-]+)|\((\/[a-z][a-z0-9/_?=&.-]*)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const [, bold, code, linkLabel, linkUrl, bareLeadPath, barePath] = match;
    if (bold !== undefined) {
      nodes.push(
        <strong key={`${keyPrefix}-${i++}`} className="font-semibold text-foreground">
          {bold}
        </strong>,
      );
    } else if (code !== undefined) {
      nodes.push(
        <code
          key={`${keyPrefix}-${i++}`}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[13px]"
        >
          {code}
        </code>,
      );
    } else if (linkLabel !== undefined && linkUrl !== undefined) {
      const leadMatch = LEAD_PATH_RE.exec(linkUrl);
      nodes.push(
        leadMatch ? (
          <Link
            key={`${keyPrefix}-${i++}`}
            to="/crm/leads/$leadId"
            params={{ leadId: leadMatch[1]! }}
            className="font-semibold text-primary underline underline-offset-2 hover:opacity-80"
          >
            {linkLabel}
          </Link>
        ) : linkUrl === "#operator" ? (
          <button
            key={`${keyPrefix}-${i++}`}
            type="button"
            onClick={() => window.dispatchEvent(new Event(OPEN_SUPPORT))}
            className={cn(
              CHIP,
              "bg-emerald-500/12 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300",
            )}
          >
            <Headset className="h-3.5 w-3.5" />
            {linkLabel}
          </button>
        ) : linkUrl.startsWith("/") ? (
          <PageLink key={`${keyPrefix}-${i++}`} href={linkUrl}>
            {linkLabel}
          </PageLink>
        ) : /^https:\/\/t\.me\//.test(linkUrl) ? (
          <a
            key={`${keyPrefix}-${i++}`}
            href={linkUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(CHIP, "bg-sky-500/12 text-sky-700 hover:bg-sky-500/20 dark:text-sky-300")}
          >
            <Send className="h-3.5 w-3.5" />
            {linkLabel}
          </a>
        ) : (
          <a
            key={`${keyPrefix}-${i++}`}
            href={linkUrl}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-primary underline underline-offset-2 hover:opacity-80"
          >
            {linkLabel}
          </a>
        ),
      );
    } else if (barePath !== undefined) {
      nodes.push(
        "(",
        <PageLink key={`${keyPrefix}-${i++}`} href={barePath}>
          {barePath}
        </PageLink>,
        ")",
      );
    } else if (bareLeadPath !== undefined) {
      const leadId = bareLeadPath.split("/").pop()!;
      nodes.push(
        <Link
          key={`${keyPrefix}-${i++}`}
          to="/crm/leads/$leadId"
          params={{ leadId }}
          className="font-semibold text-primary underline underline-offset-2 hover:opacity-80"
        >
          {openLabel}
        </Link>,
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function renderMessageContent(content: string, openLabel: string): ReactNode[] {
  const blocks: ReactNode[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  let key = 0;

  function flushList() {
    if (!list) return;
    const items = list.items;
    blocks.push(
      list.type === "ul" ? (
        <ul key={`l-${key}`} className="mb-1.5 list-disc space-y-1 pl-5 last:mb-0">
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it, `li-${key}-${idx}`, openLabel)}</li>
          ))}
        </ul>
      ) : (
        <ol key={`l-${key}`} className="mb-1.5 list-decimal space-y-1 pl-5 last:mb-0">
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it, `li-${key}-${idx}`, openLabel)}</li>
          ))}
        </ol>
      ),
    );
    key++;
    list = null;
  }

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (line === "") {
      flushList();
      continue;
    }

    const headingMatch = /^(#{1,3})\s+(.*)$/.exec(line);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1]!.length;
      blocks.push(
        <p
          key={`h-${key++}`}
          className={cn(
            "mb-1.5 mt-3 font-bold text-foreground first:mt-0",
            level === 1 ? "text-base" : "text-sm",
          )}
        >
          {renderInline(headingMatch[2]!, `h-${key}`, openLabel)}
        </p>,
      );
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(line)) {
      flushList();
      blocks.push(<hr key={`hr-${key++}`} className="my-3 border-border" />);
      continue;
    }

    const bulletMatch = /^[*-]\s+(.*)$/.exec(line);
    if (bulletMatch) {
      if (!list || list.type !== "ul") {
        flushList();
        list = { type: "ul", items: [] };
      }
      list.items.push(bulletMatch[1]!);
      continue;
    }

    const numberedMatch = /^\d+\.\s+(.*)$/.exec(line);
    if (numberedMatch) {
      if (!list || list.type !== "ol") {
        flushList();
        list = { type: "ol", items: [] };
      }
      list.items.push(numberedMatch[1]!);
      continue;
    }

    flushList();
    blocks.push(
      <p key={`p-${key++}`} className="mb-1.5 last:mb-0">
        {renderInline(line, `p-${key}`, openLabel)}
      </p>,
    );
  }
  flushList();
  return blocks;
}
