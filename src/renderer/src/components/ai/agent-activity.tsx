"use client";
// beui.dev/components/agents/agent-activity
// Adapted locally: English labels inlined, no locale provider.
// Search rows stay non-navigating so the renderer does not open URLs.
// MIT, Copyright (c) 2026 Saurabh Chauhan. See ./LICENSE.

import {
  Check,
  ChevronDown,
  Circle,
  FileText,
  Globe2,
  ImageIcon,
  MessageSquare,
  PencilLine,
  Search,
  Sparkles,
  SquareTerminal,
  Wrench,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type CSSProperties,
  type ElementType,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { AgentDisclosure } from "./agent-disclosure";
import { EASE_OUT, SPRING_LAYOUT, SPRING_SWAP } from "./lib/ease";
import { cn } from "./lib/utils";

const TEXT_SHIMMER_KEYFRAMES =
  "@keyframes beui-text-shimmer{from{background-position:200% 0}to{background-position:-200% 0}}" +
  "@media (prefers-reduced-motion: reduce){.beui-text-shimmer{animation:none !important}}";

const TEXT_SHIMMER_CLASS_NAME =
  "beui-text-shimmer bg-[length:200%_100%] bg-clip-text text-transparent bg-[linear-gradient(110deg,var(--muted-foreground)_30%,var(--foreground)_50%,var(--muted-foreground)_70%)]";

function textShimmerStyle(duration: number): CSSProperties {
  return { animation: `beui-text-shimmer ${duration}s linear infinite` };
}

function TextShimmer({
  children,
  as: Comp = "span",
  duration = 2.5,
  className,
}: {
  children: ReactNode;
  as?: ElementType;
  duration?: number;
  className?: string;
}) {
  return (
    <>
      <style>{TEXT_SHIMMER_KEYFRAMES}</style>
      <Comp
        style={textShimmerStyle(duration)}
        className={cn("inline-block", TEXT_SHIMMER_CLASS_NAME, className)}
      >
        {children}
      </Comp>
    </>
  );
}

function ThinkingShimmer({
  children,
  duration = 1.8,
  className,
}: {
  children: ReactNode;
  duration?: number;
  className?: string;
}) {
  return (
    <TextShimmer as="span" duration={duration} className={cn("font-medium", className)}>
      {children}
    </TextShimmer>
  );
}

/** English defaults. Override per instance with `labels`. */
export const agentActivityMessages = {
  thinking: "Thinking…",
  searching: "Searching the web…",
  runningTools: "Running tools…",
  workingTrace: "Working through the run…",
  workingMixed: "Working through it…",
  thoughtFor: "Thought for {duration}",
  seconds: "{seconds}s",
  minutes: "{minutes}m",
  minutesSeconds: "{minutes}m {seconds}s",
  searched: "Searched the web",
  ranToolsOne: "Ran {count} tool",
  ranToolsOther: "Ran {count} tools",
  traceSummary: "{toolCalls}, {messages}",
  toolCallsOne: "{count} tool call",
  toolCallsOther: "{count} tool calls",
  messagesOne: "{count} message",
  messagesOther: "{count} messages",
  completedStepsOne: "Completed {count} step",
  completedStepsOther: "Completed {count} steps",
  moreResults: "+{count} more",
  read: "Read",
  edit: "Edit",
  write: "Write",
  run: "Run",
};

export type AgentActivityMessages = typeof agentActivityMessages;

export type AgentActivityTranslate = (
  key: keyof AgentActivityMessages,
  values?: Record<string, string | number>,
) => string;

function translate(
  labels: Partial<AgentActivityMessages> | undefined,
  key: keyof AgentActivityMessages,
  values?: Record<string, string | number>,
) {
  let text: string = labels?.[key] ?? agentActivityMessages[key];
  if (!values) return text;
  for (const [name, value] of Object.entries(values)) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}

export type AgentActivityStatus = "working" | "complete";
export type AgentStepStatus = "pending" | "active" | "complete";

export interface AgentActivityStep {
  id: string;
  type: "step";
  label: ReactNode;
  status?: AgentStepStatus;
  meta?: ReactNode;
}

export interface AgentActivityText {
  id: string;
  type: "text";
  content: ReactNode;
}

export interface AgentSearchResult {
  id: string;
  title: ReactNode;
  domain?: ReactNode;
  url?: string;
  icon?: ReactNode;
}

export interface AgentActivitySearch {
  id: string;
  type: "search";
  query: ReactNode;
  results?: AgentSearchResult[];
  moreCount?: number;
}

export interface AgentActivityTool {
  id: string;
  type: "tool";
  action: "read" | "edit" | "write" | "run" | (string & {});
  target: ReactNode;
  additions?: number;
  deletions?: number;
}

export type AgentTraceKind =
  | "thinking"
  | "message"
  | "write"
  | "run"
  | "read"
  | (string & {});

export interface AgentActivityTrace {
  id: string;
  type: "trace";
  kind: AgentTraceKind;
  label: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
}

export type AgentActivityItem =
  | AgentActivityStep
  | AgentActivityText
  | AgentActivitySearch
  | AgentActivityTool
  | AgentActivityTrace;

export type AgentActivityContentType = AgentActivityItem["type"] | "mixed";

export interface AgentActivityProps {
  /** Chronological activity entries. Append or update items as events stream. */
  items: AgentActivityItem[];
  /** Expected activity kind before the first streamed item arrives. */
  contentType?: AgentActivityContentType;
  /** Current run phase. Active runs always stay expanded. */
  status?: AgentActivityStatus;
  /** Elapsed run time, in seconds. Used by the step-only summary. */
  duration?: number;
  /** Controlled expanded state used after the run completes. */
  open?: boolean;
  /** Initial expanded state used after the run completes. */
  defaultOpen?: boolean;
  /** Called when the completed activity disclosure changes state. */
  onOpenChange?: (open: boolean) => void;
  /** Collapse the disclosure when status changes from working to complete. */
  collapseOnComplete?: boolean;
  /** Optional label shown while the run is active. */
  activeLabel?: ReactNode;
  /** Optional completed summary. Derived from the item types by default. */
  summary?: ReactNode;
  /** Optional renderer for the contents of the active status row. */
  renderWorkingStatus?: (context: {
    label: ReactNode;
    duration: number;
  }) => ReactNode;
  /** Optional renderer for the contents before the built-in disclosure chevron. */
  renderCompletedStatus?: (context: {
    summary: ReactNode;
    duration: number;
  }) => ReactNode;
  /** Maximum visible activity height before the stream begins gliding. */
  maxHeight?: number;
  /** Override any built-in string. */
  labels?: Partial<AgentActivityMessages>;
  className?: string;
  contentClassName?: string;
}

function formatDuration(duration: number, t: AgentActivityTranslate) {
  const seconds = Math.max(0, Math.round(duration));
  if (seconds < 60) return t("seconds", { seconds });

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder === 0
    ? t("minutes", { minutes })
    : t("minutesSeconds", { minutes, seconds: remainder });
}

function useControllableOpen({
  open,
  defaultOpen,
  onOpenChange,
}: {
  open?: boolean;
  defaultOpen: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const controlled = open !== undefined;
  const currentOpen = open ?? internalOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (!controlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [controlled, onOpenChange],
  );

  return [currentOpen, setOpen] as const;
}

function getContentType(items: AgentActivityItem[]): AgentActivityContentType {
  const first = items[0]?.type;
  return first && items.every((item) => item.type === first) ? first : "mixed";
}

function getActiveLabel(
  type: AgentActivityContentType,
  t: AgentActivityTranslate,
) {
  if (type === "search") return t("searching");
  if (type === "tool") return t("runningTools");
  if (type === "trace") return t("workingTrace");
  if (type === "mixed") return t("workingMixed");
  return t("thinking");
}

function getSummary(
  type: AgentActivityContentType,
  items: AgentActivityItem[],
  duration: number,
  t: AgentActivityTranslate,
): ReactNode {
  const count = items.length;
  if (type === "step" || type === "text") {
    const [before, after = ""] = t("thoughtFor").split("{duration}");
    return (
      <>
        {before}
        <span className="tabular-nums">{formatDuration(duration, t)}</span>
        {after}
      </>
    );
  }
  if (type === "search") return t("searched");
  if (type === "tool") {
    return t(count === 1 ? "ranToolsOne" : "ranToolsOther", { count });
  }
  if (type === "trace") {
    const messages = items.filter(
      (item) =>
        item.type === "trace" &&
        (item.kind === "thinking" || item.kind === "message"),
    ).length;
    const tools = count - messages;
    return t("traceSummary", {
      toolCalls: t(tools === 1 ? "toolCallsOne" : "toolCallsOther", {
        count: tools,
      }),
      messages: t(messages === 1 ? "messagesOne" : "messagesOther", {
        count: messages,
      }),
    });
  }
  return t(count === 1 ? "completedStepsOne" : "completedStepsOther", {
    count,
  });
}

function StepRow({ item }: { item: AgentActivityStep }) {
  const state = item.status ?? "complete";

  return (
    <div className="flex min-h-7 items-start gap-2.5 rounded-md px-1.5 py-1">
      <span
        aria-hidden="true"
        className="mt-0.5 grid size-4 shrink-0 place-items-center text-muted-foreground/70"
      >
        {state === "complete" ? (
          <Check className="size-4" strokeWidth={1.8} />
        ) : state === "active" ? (
          <span className="relative grid size-3 place-items-center">
            <motion.span
              className="absolute inset-0 rounded-full bg-foreground/10"
              animate={{ opacity: [0.35, 0.8, 0.35] }}
              transition={{ duration: 1.5, repeat: Number.POSITIVE_INFINITY }}
            />
            <span className="size-1.5 rounded-full bg-foreground/60" />
          </span>
        ) : (
          <Circle className="size-3" strokeWidth={1.5} />
        )}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 leading-5",
          state === "pending" ? "text-muted-foreground/55" : "text-foreground/90",
        )}
      >
        {item.label}
      </span>
      {item.meta ? (
        <span className="shrink-0 leading-5 text-muted-foreground/55">
          {item.meta}
        </span>
      ) : null}
    </div>
  );
}

function TextRow({ item }: { item: AgentActivityText }) {
  return (
    <div className="rounded-md px-1.5 py-1 leading-5 text-muted-foreground">
      {item.content}
    </div>
  );
}

function SearchResultRow({ result }: { result: AgentSearchResult }) {
  return (
    <div className="flex min-h-7 items-center gap-2 rounded-md px-1.5 py-1 text-left">
      <span
        aria-hidden="true"
        className="grid size-5 shrink-0 place-items-center text-muted-foreground"
      >
        {result.icon ?? <Globe2 className="size-3" strokeWidth={2} />}
      </span>
      <span className="min-w-0 truncate font-medium text-foreground/90">
        {result.title}
      </span>
      {result.domain ? (
        <span className="min-w-0 truncate text-muted-foreground/55">
          {result.domain}
        </span>
      ) : null}
    </div>
  );
}

function SearchRow({
  item,
  t,
}: {
  item: AgentActivitySearch;
  t: AgentActivityTranslate;
}) {
  const reduce = useReducedMotion() ?? false;
  const enter = reduce ? { opacity: 1 } : { opacity: 0, y: 6 };
  const visible = { opacity: 1, y: 0 };
  const exit = reduce ? { opacity: 0 } : { opacity: 0, y: -3 };
  const transition = reduce
    ? { duration: 0 }
    : {
        opacity: { duration: 0.18, ease: EASE_OUT },
        y: SPRING_LAYOUT,
        layout: SPRING_LAYOUT,
      };

  return (
    <div className="space-y-0.5">
      <div className="flex min-h-7 items-center gap-2.5 rounded-md px-1.5 py-1 text-muted-foreground">
        <Search aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.7} />
        <span className="min-w-0 truncate">{item.query}</span>
      </div>
      {item.results?.length ? (
        <div className="space-y-0.5 pl-4">
          <AnimatePresence initial mode="popLayout">
            {item.results.map((result) => (
              <motion.div
                layout="position"
                key={result.id}
                initial={enter}
                animate={visible}
                exit={exit}
                transition={transition}
              >
                <SearchResultRow result={result} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : null}
      <AnimatePresence initial>
        {item.moreCount ? (
          <motion.div
            key="more-results"
            initial={enter}
            animate={visible}
            exit={exit}
            transition={transition}
            className="px-1.5 py-1 pl-8 text-muted-foreground/55"
          >
            {t("moreResults", { count: item.moreCount })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ActionIcon({ action }: { action: string }) {
  if (action === "read") return <FileText className="size-4" />;
  if (action === "edit" || action === "write") {
    return <PencilLine className="size-4" />;
  }
  if (action === "run") return <SquareTerminal className="size-4" />;
  return <Wrench className="size-4" />;
}

const KNOWN_ACTIONS = ["read", "edit", "write", "run"] as const;

function ToolRow({
  item,
  t,
}: {
  item: AgentActivityTool;
  t: AgentActivityTranslate;
}) {
  const known = KNOWN_ACTIONS.find((action) => action === item.action);
  const action = known
    ? t(known)
    : item.action.charAt(0).toUpperCase() + item.action.slice(1);

  return (
    <div className="flex min-h-8 min-w-0 items-center gap-2.5 rounded-md px-1.5 py-0.5 leading-5">
      <span
        aria-hidden="true"
        className="grid size-4 shrink-0 place-items-center text-muted-foreground/70"
      >
        <ActionIcon action={item.action} />
      </span>
      <span className="shrink-0 font-medium text-foreground/90">{action}</span>
      <span className="min-w-0 flex-1 truncate rounded-lg bg-muted/80 px-2.5 py-1 font-mono text-xs text-muted-foreground/70">
        {item.target}
      </span>
      {typeof item.additions === "number" || typeof item.deletions === "number" ? (
        <span className="flex shrink-0 items-center gap-2 font-mono tabular-nums">
          {typeof item.additions === "number" ? (
            <span className="text-emerald-500">+{item.additions}</span>
          ) : null}
          {typeof item.deletions === "number" ? (
            <span className="text-rose-500">−{item.deletions}</span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

function TraceIcon({ kind }: { kind: AgentActivityTrace["kind"] }) {
  if (kind === "thinking") return <Sparkles className="size-4" />;
  if (kind === "message") return <MessageSquare className="size-4" />;
  if (kind === "write") return <PencilLine className="size-4" />;
  if (kind === "run") return <SquareTerminal className="size-4" />;
  if (kind === "read") return <ImageIcon className="size-4" />;
  return <Wrench className="size-4" />;
}

function TraceRow({ item }: { item: AgentActivityTrace }) {
  return (
    <div className="grid min-h-8 grid-cols-[1rem_auto_minmax(0,1fr)] items-center gap-2.5 rounded-md px-1.5 py-0.5">
      <span
        aria-hidden="true"
        className="grid size-4 place-items-center text-muted-foreground/70"
      >
        {item.icon ?? <TraceIcon kind={item.kind} />}
      </span>
      <span className="font-medium text-foreground/90">{item.label}</span>
      {item.detail ? (
        <span className="min-w-0 truncate rounded-lg bg-muted/80 px-2.5 py-1 font-mono text-xs text-muted-foreground/70">
          {item.detail}
        </span>
      ) : (
        <span />
      )}
    </div>
  );
}

function ActivityRow({
  item,
  t,
}: {
  item: AgentActivityItem;
  t: AgentActivityTranslate;
}) {
  if (item.type === "text") return <TextRow item={item} />;
  if (item.type === "search") return <SearchRow item={item} t={t} />;
  if (item.type === "tool") return <ToolRow item={item} t={t} />;
  if (item.type === "trace") return <TraceRow item={item} />;
  return <StepRow item={item} />;
}

export function AgentActivity({
  items,
  contentType: initialContentType,
  status = "working",
  duration = 0,
  open,
  defaultOpen = false,
  onOpenChange,
  collapseOnComplete = true,
  activeLabel,
  summary,
  renderWorkingStatus,
  renderCompletedStatus,
  maxHeight = 208,
  labels,
  className,
  contentClassName,
}: AgentActivityProps) {
  const reduce = useReducedMotion() ?? false;
  const t = useCallback<AgentActivityTranslate>(
    (key, values) => translate(labels, key, values),
    [labels],
  );
  const baseId = useId();
  const triggerId = `${baseId}-trigger`;
  const contentId = `${baseId}-content`;
  const contentRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const previousStatus = useRef(status);
  const [contentHeight, setContentHeight] = useState(0);
  const [currentOpen, setOpen] = useControllableOpen({
    open,
    defaultOpen,
    onOpenChange,
  });
  const working = status === "working";
  const expanded = working || currentOpen;
  const contentType = items.length
    ? getContentType(items)
    : (initialContentType ?? "mixed");
  const cappedHeight = Math.min(contentHeight, Math.max(0, maxHeight));
  const viewportHeight = working ? Math.max(0, maxHeight) : cappedHeight;
  const capped = contentHeight > maxHeight;
  const streamOffset = working
    ? Math.min(0, viewportHeight - contentHeight)
    : 0;

  useLayoutEffect(() => {
    const node = contentRef.current;
    if (!node) return;

    const measure = () => setContentHeight(node.offsetHeight);
    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (previousStatus.current === "working" && status === "complete") {
      setOpen(!collapseOnComplete);
    }
    previousStatus.current = status;
  }, [collapseOnComplete, setOpen, status]);

  const toggle = () => {
    const next = !currentOpen;
    setOpen(next);
    if (next) requestAnimationFrame(() => viewportRef.current?.scrollTo({ top: 0 }));
  };

  const liveLabel = activeLabel ?? getActiveLabel(contentType, t);
  const completedSummary = summary ?? getSummary(contentType, items, duration, t);
  const maskImage = capped
    ? working
      ? "linear-gradient(to bottom, transparent, black 12px)"
      : "linear-gradient(to bottom, transparent, black 12px, black calc(100% - 12px), transparent)"
    : undefined;

  return (
    <div
      data-state={working ? "working" : expanded ? "open" : "closed"}
      data-content={contentType}
      aria-busy={working}
      className={cn("w-full min-w-0 max-w-full text-sm", className)}
    >
      {working ? (
        <div
          id={triggerId}
          role="status"
          className="flex h-7 min-w-0 items-center text-muted-foreground"
        >
          {renderWorkingStatus
            ? renderWorkingStatus({ label: liveLabel, duration })
            : <ThinkingShimmer>{liveLabel}</ThinkingShimmer>}
        </div>
      ) : (
        <button
          id={triggerId}
          type="button"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={toggle}
          className="group flex h-7 min-w-0 items-center gap-1.5 rounded-md text-left font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="truncate">
            {renderCompletedStatus
              ? renderCompletedStatus({ summary: completedSummary, duration })
              : completedSummary}
          </span>
          <motion.span
            aria-hidden="true"
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={reduce ? { duration: 0 } : SPRING_SWAP}
            className="inline-flex shrink-0 text-muted-foreground/70 group-hover:text-foreground"
          >
            <ChevronDown className="size-3.5" />
          </motion.span>
        </button>
      )}

      <AgentDisclosure
        id={contentId}
        role="region"
        aria-labelledby={triggerId}
        open={expanded}
        openHeight={viewportHeight}
        className="min-w-0 max-w-full"
      >
        <div
          ref={viewportRef}
          className={cn(
            "scrollbar-hide min-w-0 max-w-full pr-1",
            capped && expanded && !working ? "overflow-y-auto" : "overflow-y-hidden",
          )}
          style={{ height: viewportHeight, maskImage, WebkitMaskImage: maskImage }}
        >
          <motion.div
            ref={contentRef}
            role="list"
            initial={false}
            animate={{ y: streamOffset }}
            transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
            className={cn("space-y-0.5 py-2", contentClassName)}
          >
            <AnimatePresence mode="popLayout">
              {items.map((item) => (
                <motion.div
                  layout="position"
                  key={item.id}
                  role="listitem"
                  initial={reduce ? { opacity: 1 } : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -3 }}
                  transition={
                    reduce
                      ? { duration: 0 }
                      : {
                          opacity: { duration: 0.18, ease: EASE_OUT },
                          y: SPRING_LAYOUT,
                          layout: SPRING_LAYOUT,
                        }
                  }
                >
                  <ActivityRow item={item} t={t} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </div>
      </AgentDisclosure>
    </div>
  );
}
