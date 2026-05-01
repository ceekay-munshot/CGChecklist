import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import Plot from "react-plotly.js";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import pako from "pako";
import { PlusCircle, Trash2, Play, MessageSquarePlus } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

// -------------------- Config --------------------

const MUNS_API_BASE = import.meta.env.VITE_MUNS_API_BASE || "https://devde.muns.io";
const MUNS_ACCESS_TOKEN = import.meta.env.VITE_MUNS_ACCESS_TOKEN || "";

// -------------------- Types --------------------

export interface MunsAgentConfig {
  id: string;
  name: string;
  libraryId: string;
}

export interface MunsAgentSessionState {
  markdown: string;
  rawOutput: string;
  error: string | null;
  userQuery: string;
  queryOpen: boolean;
  inputTicker: string;
  inputCompanyName: string;
  activeAnalystId?: string;
  analystOutputId?: string;
  updatedAt?: number;
}

type MunsSessionsMap = Record<string, MunsAgentSessionState>;

interface RunMunsAgentInput {
  modelId: string;
  userQuery?: string;
  context?: Record<string, unknown>;
}

interface RunMunsAgentResult {
  ok: boolean;
  markdown: string;
  raw: string;
  activeAnalystId?: string;
  analystOutputId?: string;
  error?: string;
}

interface UseMunsAgentsOptions {
  storageKey?: string;
  initialAgents?: MunsAgentConfig[];
}

interface UseMunsAgentSessionsOptions {
  storageKey?: string;
  scopeKey?: string;
}

interface MunsAgentsWorkspaceProps {
  context?: Record<string, unknown>;
  initialAgents?: MunsAgentConfig[];
  storageNamespace?: string;
  title?: string;
  description?: string;
}

interface MunsModelPanelProps {
  title: string;
  description?: string;
  modelId: string;
  context?: Record<string, unknown>;
  sessionNamespace?: string;
}

// -------------------- Constants --------------------

const DEFAULT_AGENT_STORAGE_KEY = "muns_agents_registry_v2";
const DEFAULT_SESSION_STORAGE_KEY = "muns_agent_sessions_v2";

const EMPTY_SESSION: MunsAgentSessionState = {
  markdown: "",
  rawOutput: "",
  error: null,
  userQuery: "",
  queryOpen: false,
  inputTicker: "",
  inputCompanyName: "",
};

// -------------------- Helpers --------------------

const safeParse = <T,>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const stripTags = (value: string) => value.replace(/<[^>]+>/g, "").trim();

const NOISE_PATTERNS = [
  /^WriteTodos:?/i,
  /^NewsSearch:?/i,
  /^WebSearch:?/i,
  /^WebReader:?/i,
  /^DocumentFetch:?/i,
  /^PythonRepl:?/i,
  /^GetAnnouncements:?/i,
  /^HTTP\/\d/i,
  /^(server|date|content-type|x-powered-by|access-control-allow-origin|x-request-id|x-ratelimit-limit|x-ratelimit-remaining|x-ratelimit-reset|cache-control|x-active-analyst-id|x-analyst-output-id|access-control-expose-headers):/i,
  /^H4sI[A-Za-z0-9+/=]+$/,
  /H4sI[A-Za-z0-9+/=]{120,}/,
  /^[A-Za-z0-9+/]{200,}={0,2}$/,
  /^\[(object Object|\{.*\})\]$/,
];

const isNoise = (line: string) => NOISE_PATTERNS.some((rx) => rx.test(line));

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-_]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

const toUint8 = (binary: string) => {
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const decodeGraphData = (encoded: string): unknown => {
  const clean = encoded.replace(/\s+/g, "");
  const bytes = toUint8(atob(clean));
  const inflated = pako.inflate(bytes);
  const json = new TextDecoder().decode(inflated);
  return JSON.parse(json);
};

const extractGraphData = (raw: string): Array<{ filename: string; data: unknown }> => {
  const graphRe = /<graph\s+filename="([^"]+)"\s*>([\s\S]*?)<\/graph>/gi;
  const graphs: Array<{ filename: string; data: unknown }> = [];
  let match: RegExpExecArray | null;

  graphRe.lastIndex = 0;
  while ((match = graphRe.exec(raw)) !== null) {
    const filename = (match[1] || "Visualization").trim();
    const encoded = (match[2] || "").trim();
    if (!encoded) continue;
    try {
      graphs.push({ filename, data: decodeGraphData(encoded) });
    } catch {
      // ignore malformed graph blocks
    }
  }

  return graphs;
};

const stripGraphTags = (raw: string) => raw.replace(/<graph[^>]*>[\s\S]*?<\/graph>/gi, "").trim();

export const cleanStreamToMarkdown = (raw: string) => {
  const lines = raw
    .split("\n")
    .map(stripTags)
    .filter(Boolean)
    .filter((line) => !isNoise(line));
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
};

const buildScopeKey = (context: Record<string, unknown> | undefined) => {
  if (!context) return "global";

  const preferred = [
    context.ticker,
    context.symbol,
    context.companyName,
    context.name,
    context.id,
    context.caseNumber,
    context.patientId,
  ].filter((v) => typeof v === "string" && v.trim().length > 0) as string[];

  if (preferred.length > 0) return preferred.join("::");

  const entries = Object.entries(context)
    .filter(([, v]) => ["string", "number", "boolean"].includes(typeof v))
    .sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([k, v]) => `${k}:${String(v)}`).join("|") || "global";
};

const toMetadata = (context: Record<string, unknown> | undefined) => {
  const now = new Date();
  const toDate = now.toISOString().slice(0, 10);

  const ticker =
    (context?.stock_ticker as string) ||
    (context?.ticker as string) ||
    (context?.symbol as string) ||
    "";

  const companyName =
    (context?.stock_company_name as string) ||
    (context?.context_company_name as string) ||
    (context?.companyName as string) ||
    (context?.name as string) ||
    "";

  const stockCountry =
    (context?.stock_country as string) ||
    (context?.stockCountry as string) ||
    (context?.country as string) ||
    "INDIA";

  const timezone = (context?.timezone as string) || "UTC";

  return {
    stock_ticker: ticker,
    stock_country: stockCountry,
    stock_company_name: companyName,
    context_company_name: companyName,
    to_date: (context?.to_date as string) || toDate,
    timezone,
    ...(context || {}),
  };
};

const sessionKeyForAgent = (agentId: string, scopeKey: string) => `${agentId}::${scopeKey}`;

// -------------------- API --------------------

export const runMunsAgent = async (input: RunMunsAgentInput): Promise<RunMunsAgentResult> => {
  if (!MUNS_ACCESS_TOKEN) {
    return {
      ok: false,
      markdown: "",
      raw: "",
      error: "Missing VITE_MUNS_ACCESS_TOKEN.",
    };
  }

  const payload = {
    agent_library_id: input.modelId,
    ...(input.userQuery ? { user_query: input.userQuery } : {}),
    metadata: toMetadata(input.context),
  };

  const response = await fetch(`${MUNS_API_BASE}/agents/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MUNS_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const raw = await response.text();

  if (!response.ok) {
    return {
      ok: false,
      markdown: "",
      raw,
      error: `MUNS request failed (${response.status}).`,
    };
  }

  return {
    ok: true,
    markdown: cleanStreamToMarkdown(raw),
    raw,
    activeAnalystId: response.headers.get("x-active-analyst-id") || undefined,
    analystOutputId: response.headers.get("x-analyst-output-id") || undefined,
  };
};

// -------------------- Storage Hooks --------------------

export const useMunsAgents = (options?: UseMunsAgentsOptions) => {
  const storageKey = options?.storageKey || DEFAULT_AGENT_STORAGE_KEY;
  const initialAgents = options?.initialAgents || [];
  const [agents, setAgents] = useState<MunsAgentConfig[]>([]);

  useEffect(() => {
    const stored = safeParse<MunsAgentConfig[]>(localStorage.getItem(storageKey), []);
    setAgents(stored.length > 0 ? stored : initialAgents);
  }, [storageKey, initialAgents]);

  const persist = (next: MunsAgentConfig[]) => {
    setAgents(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  const addAgent = (input: { id: string; name: string; libraryId: string }) => {
    const id = slugify(input.id);
    const name = input.name.trim();
    const libraryId = input.libraryId.trim();

    if (!id || !name || !libraryId) {
      throw new Error("Agent ID, name, and library ID are required.");
    }

    if (agents.some((agent) => agent.id === id)) {
      throw new Error(`Agent with ID \"${id}\" already exists.`);
    }

    const next = [...agents, { id, name, libraryId }];
    persist(next);
    return id;
  };

  const removeAgent = (agentId: string) => {
    const next = agents.filter((agent) => agent.id !== agentId);
    persist(next);
  };

  return { agents, addAgent, removeAgent, setAgents: persist };
};

export const useMunsAgentSessions = (options?: UseMunsAgentSessionsOptions) => {
  const storageKey = options?.storageKey || DEFAULT_SESSION_STORAGE_KEY;
  const scopeKey = options?.scopeKey || "global";
  const [sessions, setSessions] = useState<MunsSessionsMap>({});

  useEffect(() => {
    const stored = safeParse<MunsSessionsMap>(sessionStorage.getItem(storageKey), {});
    setSessions(stored);
  }, [storageKey]);

  const persist = (next: MunsSessionsMap) => {
    setSessions(next);
    sessionStorage.setItem(storageKey, JSON.stringify(next));
  };

  const getSession = (agentId: string): MunsAgentSessionState => {
    const key = sessionKeyForAgent(agentId, scopeKey);
    return sessions[key] || EMPTY_SESSION;
  };

  const patchSession = (agentId: string, patch: Partial<MunsAgentSessionState>) => {
    const key = sessionKeyForAgent(agentId, scopeKey);
    const existing = sessions[key] || EMPTY_SESSION;
    persist({
      ...sessions,
      [key]: {
        ...existing,
        ...patch,
        updatedAt: Date.now(),
      },
    });
  };

  return { sessions, getSession, patchSession };
};

// -------------------- Output Renderer --------------------

type BlockType =
  | "executive_summary"
  | "key_findings"
  | "recommendations"
  | "management_summary"
  | "kv_table"
  | "ceo_details"
  | "status_table"
  | "timeline_table"
  | "data_table"
  | "unknown";

interface ParsedTable {
  columns: string[];
  rows: Record<string, string>[];
}

interface AgentBlock {
  id: string;
  heading: string;
  type: BlockType;
  debugName: string;
  rawContent: string;
  graphs?: Array<{ filename: string; data: unknown }>;
  parsedTable?: ParsedTable;
  prose?: string;
  items?: string[];
}

const MD_TABLE_RE = /(\|.+\|[ \t]*\n\|[ \t|:\-]+\|[ \t]*\n(?:\|.+\|[ \t]*\n?)+)/g;

const HEADING_LINE_RE = /^#{1,4}\s+(.+)$/m;

const BOLD_BULLET_RE = /^[\*\-]\s+\*\*(.+?)\*\*[:\s]*(.*)/gm;

const PLAIN_BULLET_RE = /^[\*\-]\s+(.+)$/gm;

const statusVariantMap = {
  positive: "border-emerald-200 bg-emerald-50 text-emerald-700",
  negative: "border-red-200 bg-red-50 text-red-700",
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  info: "border-blue-200 bg-blue-50 text-blue-700",
} as const;

const resolveStatus = (raw: string): keyof typeof statusVariantMap => {
  const v = raw.trim().toLowerCase();
  if (["positive", "pass", "yes", "good", "experienced", "sufficient"].includes(v)) return "positive";
  if (["negative", "fail", "no", "poor", "not experienced"].includes(v)) return "negative";
  if (["warning", "increased", "above average"].includes(v)) return "warning";
  if (["info", "decreased"].includes(v)) return "info";
  return "neutral";
};

const parseMarkdownTable = (raw: string): ParsedTable | null => {
  const lines = raw
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 3) return null;

  const parseCells = (line: string): string[] =>
    line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());

  const isSeparator = (line: string) => /^\|?[\s|\-:]+\|?$/.test(line) && line.includes("-");
  if (!isSeparator(lines[1])) return null;

  const columns = parseCells(lines[0]).map((cell) => cell.replace(/\*\*/g, "").trim());
  const rows = lines.slice(2).map((line) => {
    const cells = parseCells(line);
    const row: Record<string, string> = {};
    columns.forEach((column, index) => {
      row[column] = (cells[index] || "").replace(/\*\*/g, "").trim();
    });
    return row;
  });

  return { columns, rows };
};

const classifyBlock = (heading: string, columns: string[]): BlockType => {
  const h = heading.toLowerCase();
  const cols = columns.map((col) => col.toLowerCase());
  const has = (needle: string) => cols.some((col) => col.includes(needle));

  if (/executive\s+summary|overview|background/.test(h)) return "executive_summary";
  if (/key\s+finding|highlight|insight/.test(h)) return "key_findings";
  if (/recommendation|action|next\s+step|takeaway/.test(h)) return "recommendations";
  if (/ceo\s+detail|ceo\s+profile|chief\s+executive/.test(h)) return "ceo_details";
  if (/timeline|announcement|recent\s+update|management\s+update/.test(h)) return "timeline_table";
  if (/management\s+summary|management\s+overview/.test(h)) return "management_summary";

  if (has("status") || (has("check") && has("status"))) return "status_table";
  if (has("date") && (has("event") || has("update") || has("announcement"))) return "timeline_table";
  if (has("field") && has("value")) return "kv_table";
  if (has("metric") && has("value")) return "data_table";
  if (has("name") && (has("position") || has("role") || has("title"))) return "data_table";

  return columns.length > 0 ? "data_table" : "unknown";
};

const parseAgentOutput = (raw: string): AgentBlock[] => {
  const sections = raw
    .split(/(?=^#{1,4}\s)/m)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sections.length === 0 && raw.trim()) {
    return [
      {
        id: "block-0",
        heading: "Overview",
        type: "unknown",
        debugName: "unknown -> MarkdownProse",
        rawContent: raw,
        prose: raw,
      },
    ];
  }

  let idx = 0;
  const blocks: AgentBlock[] = [];

  for (const section of sections) {
    const headingMatch = section.match(HEADING_LINE_RE);
    const heading = headingMatch ? headingMatch[1].trim() : "Overview";
    const body = section.replace(HEADING_LINE_RE, "").trim();

    const sectionGraphs = extractGraphData(body);
    const bodySansGraphs = stripGraphTags(body);

    MD_TABLE_RE.lastIndex = 0;
    const tableMatch = MD_TABLE_RE.exec(bodySansGraphs);
    const parsedTable = tableMatch ? parseMarkdownTable(tableMatch[0]) || undefined : undefined;
    const prose = tableMatch ? bodySansGraphs.replace(tableMatch[0], "").trim() : bodySansGraphs;

    const items: string[] = [];
    let match: RegExpExecArray | null;
    BOLD_BULLET_RE.lastIndex = 0;
    while ((match = BOLD_BULLET_RE.exec(bodySansGraphs)) !== null) {
      items.push((match[2] ? `${match[1]}: ${match[2]}` : match[1]).replace(/\*\*/g, "").trim());
    }
    if (items.length === 0) {
      PLAIN_BULLET_RE.lastIndex = 0;
      while ((match = PLAIN_BULLET_RE.exec(bodySansGraphs)) !== null) {
        items.push(match[1].replace(/\*\*/g, "").trim());
      }
    }

    const type = classifyBlock(heading, parsedTable?.columns || []);
    blocks.push({
      id: `block-${idx++}`,
      heading,
      type,
      debugName: `${type} -> widget`,
      rawContent: bodySansGraphs,
      graphs: sectionGraphs.length > 0 ? sectionGraphs : undefined,
      parsedTable,
      prose: prose || undefined,
      items: items.length > 0 ? items : undefined,
    });
  }

  return blocks;
};

const GraphRenderer = ({ graphs }: { graphs: Array<{ filename: string; data: unknown }> }) => {
  if (graphs.length === 0) return null;

  return (
    <div className="space-y-3">
      {graphs.map((graph, index) => {
        const graphObj = graph.data as Record<string, unknown>;
        const data = Array.isArray(graphObj?.data)
          ? (graphObj.data as unknown[])
          : Array.isArray(graph.data)
            ? (graph.data as unknown[])
            : [graph.data];
        const layout =
          graphObj && typeof graphObj.layout === "object"
            ? (graphObj.layout as Record<string, unknown>)
            : {};

        return (
          <Card key={`${graph.filename}-${index}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{graph.filename}</CardTitle>
            </CardHeader>
            <CardContent>
              <Plot
                data={data as never[]}
                layout={{
                  autosize: true,
                  height: 360,
                  paper_bgcolor: "transparent",
                  plot_bgcolor: "transparent",
                  ...layout,
                }}
                config={{ responsive: true }}
                useResizeHandler
                style={{ width: "100%" }}
              />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export const MarkdownProse = ({ content }: { content: string }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    rehypePlugins={[rehypeRaw]}
    components={{
      h1: (props) => <h1 className="mt-5 mb-2 text-xl font-semibold" {...props} />,
      h2: (props) => <h2 className="mt-4 mb-2 text-lg font-semibold" {...props} />,
      h3: (props) => <h3 className="mt-3 mb-1 text-base font-semibold" {...props} />,
      p: (props) => <p className="my-2 text-sm leading-relaxed text-foreground/90" {...props} />,
      ul: (props) => <ul className="my-2 list-disc pl-5 text-sm" {...props} />,
      ol: (props) => <ol className="my-2 list-decimal pl-5 text-sm" {...props} />,
      li: (props) => <li className="my-1" {...props} />,
      table: (props) => (
        <div className="my-3 overflow-auto rounded-md border">
          <table className="w-full text-sm" {...props} />
        </div>
      ),
      th: (props) => <th className="border bg-muted p-2 text-left font-medium" {...props} />,
      td: (props) => <td className="border p-2" {...props} />,
      code: ({ children, ...rest }: any) => {
        const inline = Boolean(rest.inline);
        const asText = String(children || "");
        if (!inline) {
          try {
            const parsed = JSON.parse(asText) as Record<string, unknown>;
            const data = Array.isArray(parsed.data)
              ? (parsed.data as never[])
              : [parsed as never];
            return (
              <div className="my-3 overflow-hidden rounded-md border">
                <Plot
                  data={data}
                  layout={{ autosize: true, height: 320, paper_bgcolor: "transparent" }}
                  config={{ responsive: true }}
                  useResizeHandler
                  style={{ width: "100%" }}
                />
              </div>
            );
          } catch {
            return (
              <pre className="my-3 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
                <code>{children}</code>
              </pre>
            );
          }
        }
        return <code className="rounded bg-muted px-1 py-0.5 text-xs">{children}</code>;
      },
    }}
  >
    {content}
  </ReactMarkdown>
);

const renderItems = (items?: string[], ordered = false) => {
  if (!items || items.length === 0) return null;
  if (ordered) {
    return (
      <ol className="list-decimal pl-5 space-y-2 text-sm leading-6 text-foreground/90">
        {items.map((item, idx) => (
          <li key={`item-${idx}`} className="rounded-md bg-white/70 px-2 py-1">
            {item}
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ul className="list-disc pl-5 space-y-2 text-sm leading-6 text-foreground/90">
      {items.map((item, idx) => (
        <li key={`item-${idx}`} className="rounded-md bg-white/70 px-2 py-1">
          {item}
        </li>
      ))}
    </ul>
  );
};

const renderDataTable = (block: AgentBlock) => {
  const table = block.parsedTable;
  if (!table) return null;
  const statusColumn = table.columns.find((col) => col.toLowerCase().includes("status"));

  return (
    <div className="overflow-auto rounded-xl border border-cyan-200/60 bg-white shadow-sm">
      <Table>
        <TableHeader className="bg-gradient-to-r from-slate-100 to-slate-50">
          <TableRow>
            {table.columns.map((col) => (
              <TableHead key={col} className="font-semibold text-slate-700">
                {col}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.rows.map((row, rowIdx) => (
            <TableRow key={`row-${rowIdx}`} className="odd:bg-white even:bg-slate-50/60">
              {table.columns.map((col) => {
                const value = row[col] || "";
                const isStatus = Boolean(statusColumn && col === statusColumn && value);
                return (
                  <TableCell key={`${rowIdx}-${col}`}>
                    {isStatus ? (
                      <Badge className={statusVariantMap[resolveStatus(value)]} variant="outline">
                        {value}
                      </Badge>
                    ) : (
                      <span className="text-sm text-foreground/90">{value}</span>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

const renderMetaGrid = (block: AgentBlock) => {
  const table = block.parsedTable;
  if (!table || table.columns.length < 2 || table.rows.length === 0) return null;
  const [keyCol, valueCol] = table.columns;
  const cards = table.rows
    .map((row) => ({ key: (row[keyCol] || "").trim(), value: (row[valueCol] || "").trim() }))
    .filter((item) => item.key || item.value);
  if (cards.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card, index) => {
        const status = resolveStatus(card.value);
        const statusLike = status !== "neutral";
        return (
          <div
            key={`${card.key}-${index}`}
            className="rounded-xl border border-border/70 bg-gradient-to-br from-slate-50 to-white p-3 shadow-sm"
          >
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground break-words">
              {card.key || "Value"}
            </p>
            {statusLike ? (
              <Badge className={statusVariantMap[status]} variant="outline">
                {card.value || "-"}
              </Badge>
            ) : (
              <p className="font-mono text-sm text-foreground break-words">{card.value || "-"}</p>
            )}
          </div>
        );
      })}
    </div>
  );
};

const renderTimeline = (block: AgentBlock) => {
  const table = block.parsedTable;
  if (!table || table.rows.length === 0) return null;

  const findCol = (...needles: string[]) =>
    table.columns.find((col) => needles.some((needle) => col.toLowerCase().includes(needle)));

  const dateCol = findCol("date", "time", "updated", "timestamp");
  const titleCol = findCol("event", "update", "announcement", "headline", "item");
  const detailCol = findCol("description", "detail", "notes", "summary", "comment");
  if (!dateCol && !titleCol && !detailCol) return null;

  const items = table.rows
    .map((row) => ({
      date: (dateCol && row[dateCol]) || "",
      title: (titleCol && row[titleCol]) || "",
      detail: (detailCol && row[detailCol]) || "",
    }))
    .filter((item) => item.date || item.title || item.detail);
  if (items.length === 0) return null;

  return (
    <div className="relative pl-8">
      <div className="absolute left-[0.7rem] top-2 bottom-2 w-px bg-gradient-to-b from-cyan-300 via-sky-300 to-blue-300" />
      <div className="space-y-3">
        {items.map((item, idx) => (
          <div key={`timeline-${idx}`} className="relative">
            <span className="absolute -left-8 top-2 h-4 w-4 rounded-full border-2 border-cyan-300 bg-white" />
            <div className="rounded-lg border border-cyan-200/60 bg-gradient-to-br from-cyan-50/70 to-white p-3 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                {item.title ? <p className="text-sm font-semibold text-foreground">{item.title}</p> : null}
                {item.date ? (
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                    {item.date}
                  </span>
                ) : null}
              </div>
              {item.detail ? <p className="mt-1 text-sm leading-6 text-foreground/85">{item.detail}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const renderPersonCard = (block: AgentBlock) => {
  const table = block.parsedTable;
  const row = table?.rows[0];
  if (!table || !row) return null;

  const findCol = (...needles: string[]) =>
    table.columns.find((col) => needles.some((needle) => col.toLowerCase().includes(needle)));

  const name = row[findCol("name") || ""] || "";
  const role = row[findCol("role", "position", "title") || ""] || "";
  const age = row[findCol("age") || ""] || "";
  const tenure = row[findCol("tenure") || ""] || "";
  const compensation = row[findCol("compensation", "salary", "pay", "total") || ""] || "";
  const notes = row[findCol("notes", "detail", "description") || ""] || "";

  if (!name && !role && !age && !tenure && !compensation && !notes) return null;

  return (
    <div className="space-y-3 rounded-xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50 via-sky-50 to-white p-4 shadow-sm">
      <div className="space-y-1">
        {name ? <p className="text-base font-semibold tracking-tight">{name}</p> : null}
        {role ? <p className="text-sm text-muted-foreground">{role}</p> : null}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {age ? (
          <div className="rounded-lg border border-indigo-200/70 bg-white/80 p-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Age</p>
            <p className="font-mono text-sm">{age}</p>
          </div>
        ) : null}
        {tenure ? (
          <div className="rounded-lg border border-indigo-200/70 bg-white/80 p-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Tenure</p>
            <p className="font-mono text-sm">{tenure}</p>
          </div>
        ) : null}
        {compensation ? (
          <div className="rounded-lg border border-indigo-200/70 bg-white/80 p-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Compensation</p>
            <p className="font-mono text-sm">{compensation}</p>
          </div>
        ) : null}
      </div>
      {notes ? <p className="text-sm leading-6 text-foreground/90">{notes}</p> : null}
    </div>
  );
};

const renderBlock = (block: AgentBlock) => {
  const dataTable = renderDataTable(block);
  const prose = block.prose ? <MarkdownProse content={block.prose} /> : null;

  switch (block.type) {
    case "key_findings":
      return renderItems(block.items, true) || dataTable || prose || <MarkdownProse content={block.rawContent} />;
    case "recommendations":
      return renderItems(block.items, false) || dataTable || prose || <MarkdownProse content={block.rawContent} />;
    case "management_summary":
    case "kv_table": {
      const meta = renderMetaGrid(block);
      if (meta && prose) return <div className="space-y-3">{meta}{prose}</div>;
      return meta || dataTable || prose || <MarkdownProse content={block.rawContent} />;
    }
    case "timeline_table": {
      const timeline = renderTimeline(block);
      if (timeline && prose) return <div className="space-y-3">{timeline}{prose}</div>;
      return timeline || dataTable || prose || <MarkdownProse content={block.rawContent} />;
    }
    case "ceo_details": {
      const person = renderPersonCard(block);
      if (person && prose) return <div className="space-y-3">{person}{prose}</div>;
      return person || dataTable || prose || <MarkdownProse content={block.rawContent} />;
    }
    default:
      if (dataTable && prose) return <div className="space-y-3">{dataTable}{prose}</div>;
      return dataTable || prose || <MarkdownProse content={block.rawContent} />;
  }
};

const RenderedSections = ({ blocks, showDebug }: { blocks: AgentBlock[]; showDebug: boolean }) => {
  return (
    <div className="space-y-5">
      {blocks.map((block) => (
        <section
          key={block.id}
          className="space-y-2 rounded-xl border bg-gradient-to-br from-slate-50 via-muted/60 to-transparent p-4 shadow-sm"
        >
          <div className="space-y-1">
            <h3 className="text-sm font-semibold tracking-wide text-foreground">{block.heading}</h3>
            {showDebug ? <p className="font-mono text-xs text-muted-foreground">{block.debugName}</p> : null}
          </div>
          {renderBlock(block)}
        </section>
      ))}
    </div>
  );
};

export const MunsAgentOutput = ({ markdown, raw }: { markdown: string; raw: string }) => {
  const cleaned = useMemo(
    () => stripGraphTags(markdown).replace(/<doc_source>\d+<\/doc_source>/g, "").trim(),
    [markdown],
  );
  const graphs = useMemo(() => extractGraphData(raw || markdown), [raw, markdown]);
  const blocks = useMemo(() => parseAgentOutput(cleaned), [cleaned]);

  if (!cleaned && graphs.length === 0 && blocks.length === 0) {
    return <p className="text-sm text-muted-foreground">No output yet.</p>;
  }

  return (
    <Tabs defaultValue="report" className="space-y-4">
      <TabsList className="grid w-full max-w-[280px] grid-cols-2 rounded-xl bg-muted/60 p-1">
        <TabsTrigger
          value="report"
          className="rounded-lg transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm"
        >
          Report
        </TabsTrigger>
        <TabsTrigger
          value="audit"
          className="rounded-lg transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm"
        >
          Audit
        </TabsTrigger>
      </TabsList>

      <TabsContent value="report" className="space-y-4">
        {graphs.length > 0 ? (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold tracking-wide text-foreground">Visualizations</h3>
            <GraphRenderer graphs={graphs} />
          </section>
        ) : null}
        <RenderedSections blocks={blocks} showDebug={false} />
      </TabsContent>

      <TabsContent value="audit" className="space-y-5">
        <RenderedSections blocks={blocks} showDebug />
      </TabsContent>
    </Tabs>
  );
};

// -------------------- Panel --------------------

const AgentRunPanel = ({
  agent,
  context,
  session,
  onPatch,
}: {
  agent: MunsAgentConfig;
  context?: Record<string, unknown>;
  session: MunsAgentSessionState;
  onPatch: (patch: Partial<MunsAgentSessionState>) => void;
}) => {
  const [running, setRunning] = useState(false);

  const defaultTicker =
    (context?.stock_ticker as string) ||
    (context?.ticker as string) ||
    (context?.symbol as string) ||
    "";

  const defaultCompanyName =
    (context?.stock_company_name as string) ||
    (context?.context_company_name as string) ||
    (context?.companyName as string) ||
    (context?.name as string) ||
    "";

  const effectiveTicker = session.inputTicker || defaultTicker;
  const effectiveCompanyName = session.inputCompanyName || defaultCompanyName;

  const contextBadges = useMemo(() => {
    return Object.entries(context || {})
      .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
      .slice(0, 8);
  }, [context]);

  const handleRun = async () => {
    setRunning(true);
    const tickerToSend = effectiveTicker.trim() || defaultTicker;
    const companyToSend = effectiveCompanyName.trim() || defaultCompanyName;
    onPatch({
      error: null,
      inputTicker: tickerToSend,
      inputCompanyName: companyToSend,
    });

    try {
      const runContext = {
        ...(context || {}),
        stock_ticker: tickerToSend,
        ticker: tickerToSend,
        symbol: tickerToSend,
        stock_company_name: companyToSend,
        context_company_name: companyToSend,
        companyName: companyToSend,
        name: companyToSend,
      };

      const result = await runMunsAgent({
        modelId: agent.libraryId,
        context: runContext,
        userQuery: session.queryOpen ? session.userQuery || undefined : undefined,
      });

      if (!result.ok) {
        onPatch({ error: result.error || "Failed to run MUNS agent." });
        return;
      }

      onPatch({
        markdown: result.markdown,
        rawOutput: result.raw,
        error: null,
        activeAnalystId: result.activeAnalystId,
        analystOutputId: result.analystOutputId,
      });
      toast.success(`${agent.name} completed`);
    } catch (error) {
      onPatch({ error: error instanceof Error ? error.message : "Unexpected error" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">{agent.name}</CardTitle>
              <CardDescription>Agent ID: {agent.id}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleRun} disabled={running}>
                <Play className="mr-2 h-4 w-4" />
                {running ? "Running..." : "Run"}
              </Button>
              <Button
                variant="outline"
                onClick={() => onPatch({ queryOpen: !session.queryOpen })}
              >
                <MessageSquarePlus className="mr-2 h-4 w-4" />
                Extra User Query
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">Library: {agent.libraryId}</Badge>
            {effectiveTicker ? <Badge variant="secondary">Ticker: {effectiveTicker}</Badge> : null}
            {effectiveCompanyName ? <Badge variant="secondary">Company: {effectiveCompanyName}</Badge> : null}
            {contextBadges.map(([key, value]) => (
              <Badge key={key} variant="secondary">
                {key}: {String(value)}
              </Badge>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Ticker override</p>
              <Input
                value={session.inputTicker || ""}
                onChange={(event) => onPatch({ inputTicker: event.target.value })}
                placeholder={defaultTicker || "e.g. JIOFIN"}
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Company override</p>
              <Input
                value={session.inputCompanyName || ""}
                onChange={(event) => onPatch({ inputCompanyName: event.target.value })}
                placeholder={defaultCompanyName || "e.g. Jio Financial Services"}
                className="text-sm"
              />
            </div>
          </div>

          {session.queryOpen ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Extra user query (sent on next Run)</p>
              <Textarea
                value={session.userQuery}
                onChange={(event) => onPatch({ userQuery: event.target.value })}
                className="min-h-[100px]"
                placeholder="e.g. generate as many graphs as possible for visualisation"
              />
            </div>
          ) : null}

          {session.activeAnalystId || session.analystOutputId ? (
            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              {session.activeAnalystId ? <p>Active Analyst ID: {session.activeAnalystId}</p> : null}
              {session.analystOutputId ? <p>Analyst Output ID: {session.analystOutputId}</p> : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          {session.error ? (
            <p className="text-sm text-destructive">{session.error}</p>
          ) : session.markdown ? (
            <MunsAgentOutput markdown={session.markdown} raw={session.rawOutput} />
          ) : (
            <p className="text-sm text-muted-foreground">Run the agent to load output.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// -------------------- Workspace (Tabs + Add/Remove) --------------------

export const MunsAgentsWorkspace = ({
  context,
  initialAgents = [],
  storageNamespace = "default",
  title = "MUNS Agents",
  description = "Dynamic tab-based MUNS analysis",
}: MunsAgentsWorkspaceProps) => {
  const agentStorageKey = `${DEFAULT_AGENT_STORAGE_KEY}::${storageNamespace}`;
  const sessionStorageKey = `${DEFAULT_SESSION_STORAGE_KEY}::${storageNamespace}`;
  const scopeKey = useMemo(() => buildScopeKey(context), [context]);

  const { agents, addAgent, removeAgent } = useMunsAgents({
    storageKey: agentStorageKey,
    initialAgents,
  });
  const { getSession, patchSession } = useMunsAgentSessions({
    storageKey: sessionStorageKey,
    scopeKey,
  });

  const [activeAgentId, setActiveAgentId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newLibraryId, setNewLibraryId] = useState("");

  const activeAgent = agents.find((agent) => agent.id === activeAgentId) || null;

  useEffect(() => {
    if (agents.length === 0) {
      setActiveAgentId("");
      return;
    }
    if (!activeAgentId || !agents.some((agent) => agent.id === activeAgentId)) {
      setActiveAgentId(agents[0].id);
    }
  }, [agents, activeAgentId]);

  const handleAddAgent = () => {
    try {
      const createdId = addAgent({ id: newId, name: newName, libraryId: newLibraryId });
      setActiveAgentId(createdId);
      setDialogOpen(false);
      setNewId("");
      setNewName("");
      setNewLibraryId("");
      toast.success("MUNS agent tab added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add agent");
    }
  };

  const handleRemoveAgent = (agentId: string) => {
    removeAgent(agentId);
    if (activeAgentId === agentId) {
      const remaining = agents.filter((agent) => agent.id !== agentId);
      setActiveAgentId(remaining[0]?.id || "");
    }
    toast.info("MUNS agent tab removed");
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
            <Button onClick={() => setDialogOpen(true)} size="sm">
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Agent
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {agents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No agent tabs yet. Add one to begin.</p>
            ) : (
              agents.map((agent) => {
                const isActive = agent.id === activeAgentId;
                return (
                  <div key={agent.id} className="flex items-center gap-1">
                    <Button
                      variant={isActive ? "default" : "outline"}
                      size="sm"
                      onClick={() => setActiveAgentId(agent.id)}
                    >
                      {agent.name}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleRemoveAgent(agent.id)}
                      aria-label={`Remove ${agent.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {activeAgent ? (
        <AgentRunPanel
          agent={activeAgent}
          context={context}
          session={getSession(activeAgent.id)}
          onPatch={(patch) => patchSession(activeAgent.id, patch)}
        />
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add MUNS Agent Tab</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="muns-agent-id">Agent ID</Label>
              <Input
                id="muns-agent-id"
                placeholder="e.g. management-compensation"
                value={newId}
                onChange={(event) => setNewId(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="muns-agent-name">Agent Name</Label>
              <Input
                id="muns-agent-name"
                placeholder="e.g. Management Compensation"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="muns-agent-library-id">Agent Library ID</Label>
              <Input
                id="muns-agent-library-id"
                placeholder="UUID from MUNS library"
                value={newLibraryId}
                onChange={(event) => setNewLibraryId(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddAgent}>Add Agent</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// -------------------- Compatibility Panel --------------------

export const MunsModelPanel = ({
  title,
  description = "AI agent analysis",
  modelId,
  context,
  sessionNamespace = "single-panel",
}: MunsModelPanelProps) => {
  const scopeKey = useMemo(() => buildScopeKey(context), [context]);
  const agent: MunsAgentConfig = useMemo(
    () => ({ id: `panel-${slugify(title)}-${modelId}`, name: title, libraryId: modelId }),
    [title, modelId],
  );
  const { getSession, patchSession } = useMunsAgentSessions({
    storageKey: `${DEFAULT_SESSION_STORAGE_KEY}::${sessionNamespace}`,
    scopeKey,
  });
  const session = getSession(agent.id);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      </Card>
      <AgentRunPanel
        agent={agent}
        context={context}
        session={session}
        onPatch={(patch) => patchSession(agent.id, patch)}
      />
    </div>
  );
};
