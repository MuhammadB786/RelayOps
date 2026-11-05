"use client";
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  Activity,
  ArrowUpRight,
  ArrowRight,
  Box,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Download,
  FileText,
  LayoutDashboard,
  Menu,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Signal,
  Users,
  Wrench,
  X,
  CalendarDays,
  FlaskConical,
  Pause,
  Play,
  AlertTriangle,
  Upload,
  BookOpen,
  Command,
  RefreshCw,
  LogOut,
} from "lucide-react";
import ModelLab from "./model-lab";
import {
  condition,
  csvCell,
  parseCSV,
  businessDate,
  type Row,
  type Asset,
  type Order,
  type Sensor,
  type Plan,
  type Manual,
} from "@/lib/domain";
type Member = { user: string; name: string; email: string; role: string };
type State = {
  user: { userId: string; displayName: string; email: string } | null;
  workspaces: { id: string; name: string; role: string }[];
  member?: Member;
  records: Row[];
  members: Member[];
  events: {
    id: string;
    actor: string;
    action: string;
    target: string;
    detail: string;
    created: string;
  }[];
  invites: { id: string; email: string; role: string; expires: string }[];
  capabilities?: { ai: boolean; storage: boolean };
  viewLimited?:boolean;
};
const initial: State = {
  user: null,
  workspaces: [],
  records: [],
  members: [],
  events: [],
  invites: [],
};
const nav = [
  ["Overview", LayoutDashboard],
  ["Work orders", ClipboardList],
  ["Assets", Box],
  ["Condition monitoring", Activity],
  ["Preventive plans", CalendarDays],
  ["Reports", Signal],
  ["Model lab", FlaskConical],
  ["Knowledge", BookOpen],
  ["Activity log", Clock],
  ["Team & settings", Settings],
] as const;
const today = () => businessDate();
const date = (s: string) =>
  new Date(s.length === 10 ? s + "T12:00:00" : s).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
function Badge({ children }: { children: ReactNode }) {
  const s = String(children);
  return (
    <span
      className={
        "badge " +
        (/Critical|Offline|overdue/i.test(s)
          ? "red"
          : /High|Watch|Awaiting|Maintenance|Stale/i.test(s)
            ? "amber"
            : /Done|Normal|Operational|Low/i.test(s)
              ? "green"
              : "neutral")
      }
    >
      {children}
    </span>
  );
}
function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Box size={30} />
      <h3>{title}</h3>
      <p>{children || "Add your first record to get started."}</p>
    </div>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => previous?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="modal-head">
        <h2 id="dialog-title">{title}</h2>
        <button
          className="icon-btn"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <div className="modal-content">{children}</div>
    </dialog>
  );
}
function Chart({ readings }: { readings: Row[] }) {
  const sorted = [...readings]
    .sort((a, b) => a.data.recorded.localeCompare(b.data.recorded))
    .slice(-30);
  if (!sorted.length)
    return (
      <Empty title="Your history starts here">
        Record or import readings to see a trend.
      </Empty>
    );
  const values = sorted.map((r) => Number(r.data.value));
  const min = Math.min(0, ...values),
    max = Math.max(...values, 1) * 1.15;
  const points = values
    .map(
      (v, i) =>
        `${40 + (i / Math.max(1, values.length - 1)) * 650},${160 - ((v - min) / (max - min)) * 130}`,
    )
    .join(" ");
  return (
    <>
      <svg
        viewBox="0 0 720 200"
        role="img"
        aria-label="Recorded sensor readings over time"
        className="chart"
      >
        <defs>
          <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#14b8a6" stopOpacity=".2" />
            <stop offset="100%" stopColor="#14b8a6" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <line
              x1="40"
              x2="690"
              y1={30 + i * 43}
              y2={30 + i * 43}
              stroke="#e8eeed"
              strokeDasharray="4 5"
            />
            <text x="0" y={35 + i * 43} fill="#71847f" fontSize="10">
              {Math.round(max - (i * max) / 3)}
            </text>
          </g>
        ))}
        <polygon points={`40,160 ${points} 690,160`} fill="url(#area)" />
        <polyline
          points={points}
          fill="none"
          stroke="#0d9488"
          strokeWidth="2.5"
        />
        <text x="40" y="190" fill="#71847f" fontSize="11">
          {date(sorted[0].data.recorded)}
        </text>
        <text x="600" y="190" fill="#71847f" fontSize="11">
          Latest reading
        </text>
      </svg>
      <details>
        <summary>View chart data</summary>
        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Reading</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.data.recorded).toLocaleString()}</td>
                <td>
                  {r.data.value} {r.data.unit}
                </td>
                <td>{r.data.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}
export default function Workspace() {
  const [state, setState] = useState<State>(initial),
    [workspace, setWorkspace] = useState(""),
    [page, setPage] = useState("Overview"),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [menu, setMenu] = useState(false),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("All"),
    [mine, setMine] = useState(false),
    [modal, setModal] = useState<string | null>(null),
    [selected, setSelected] = useState<Row | null>(null),
    [form, setForm] = useState<Record<string, any>>({}),
    [assetDetail, setAssetDetail] = useState<string | null>(null),
    [simAsset, setSimAsset] = useState(""),
    [playing, setPlaying] = useState(false),
    [manualResults, setManualResults] = useState<any[]>([]),
    [joinToken, setJoinToken] = useState(""),
    [historySensor, setHistorySensor] = useState("");
  const load = useCallback(
    async (w = workspace) => {
      const res = await fetch(
        "/api/relay" + (w ? "?workspace=" + encodeURIComponent(w) : ""),
      );
      const d: any = await res.json();
      if (!res.ok) throw new Error(d.error);
      setState({ ...initial, ...d });
      setLoading(false);
      if (!w && d.workspaces.length) {
        const stored = localStorage.getItem("relayops-workspace");
        setWorkspace(
          d.workspaces.some((x: any) => x.id === stored)
            ? stored
            : d.workspaces[0].id,
        );
      }
      return d;
    },
    [workspace],
  );
  useEffect(() => {
    load().catch((e) => {
      setError(e.message);
      setLoading(false);
    });
  }, [load]);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("workspace")) setWorkspace(params.get("workspace")!);
    if (params.get("asset")) {
      setAssetDetail(params.get("asset"));
      setPage("Assets");
    }
    if (params.get("invite")) setJoinToken(params.get("invite")!);
  }, []);
  useEffect(() => {
    if (workspace) localStorage.setItem("relayops-workspace", workspace);
  }, [workspace]);
  useEffect(() => {
    if (!workspace) return;
    const timer = setInterval(() => {
      if (!document.hidden && !busy && !modal) load().catch(() => {});
    }, 30000);
    return () => clearInterval(timer);
  }, [workspace, busy, modal, load]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(t);
  }, [notice]);
  const api = useCallback(
    async (action: string, data: Record<string, unknown> = {}) => {
      const res = await fetch(
        "/api/relay" +
          (workspace ? "?workspace=" + encodeURIComponent(workspace) : ""),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...data }),
        },
      );
      const d: any = await res.json();
      if (!res.ok) throw new Error(d.error);
      return d;
    },
    [workspace],
  );
  const act = async (
    action: string,
    data: Record<string, unknown> = {},
    message = "Changes saved",
  ) => {
    setBusy(true);
    setError("");
    try {
      const d = await api(action, data);
      await load();
      setNotice(
        action === "generate"
          ? `${d.created} work order${d.created === 1 ? "" : "s"} generated`
          : message,
      );
      return d;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!playing || !simAsset) return;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      api("scenario", {
        assetId: simAsset,
        scenario:
          step % 4 === 0
            ? "recover"
            : step % 3 === 0
              ? "disconnect"
              : step % 2 === 0
                ? "vibration"
                : "overheat",
      })
        .then(() => load())
        .catch((e) => {
          setError(e.message);
          setPlaying(false);
        });
    }, 6000);
    return () => clearInterval(timer);
  }, [playing, simAsset, api, load]);
  const assets = state.records.filter(
      (r) => r.kind === "asset",
    ) as Row<Asset>[],
    orders = state.records.filter((r) => r.kind === "order") as Row<Order>[],
    sensors = state.records.filter((r) => r.kind === "sensor") as Row<Sensor>[],
    plans = state.records.filter((r) => r.kind === "plan") as Row<Plan>[],
    manuals = state.records.filter((r) => r.kind === "manual") as Row<Manual>[];
  const manager = ["owner", "manager"].includes(state.member?.role || ""),
    canWrite = state.member?.role !== "viewer";
  useEffect(() => {
    if (state.member?.role === "technician") setMine(true);
  }, [state.member?.role]);
  const assetName = (id: string) =>
    assets.find((a) => a.id === id)?.data.name || "Unknown asset";
  const memberName = (id: string) =>
    state.members.find((m) => m.user === id)?.name || "Unassigned";
  const activeOrders = orders.filter((o) => o.data.status !== "Done"),
    overdue = activeOrders.filter((o) => o.data.due < today()),
    alerts = sensors.filter((s) =>
      ["Critical", "High", "Offline", "Stale"].includes(
        condition(s.data).severity,
      ),
    );
  const currentAsset = assets.find((a) => a.id === assetDetail);
  const go = (p: string) => {
    setPage(p);
    setQuery("");
    setStatus("All");
    setAssetDetail(null);
    setMenu(false);
  };
  const open = (
    kind: string,
    row: Row | null = null,
    defaults: Record<string, unknown> = {},
  ) => {
    setSelected(row);
    setForm(
      row
        ? structuredClone(row.data)
        : kind === "asset"
          ? {
              name: "",
              type: "Pump",
              location: "",
              criticality: "Medium",
              serial: "",
              status: "Operational",
              notes: "",
              ...defaults,
            }
          : kind === "order"
            ? {
                assetId: assetDetail || assets[0]?.id || "",
                title: "",
                description: "",
                priority: "Medium",
                assignee: "",
                due: today(),
                status: "Open",
                checklist: [],
                completion: "",
                laborHours: 0,
                cost: 0,
                source: "Manual",
                sourceId: "",
                ...defaults,
              }
            : kind === "sensor"
              ? {
                  assetId: assetDetail || assets[0]?.id || "",
                  name: "Temperature",
                  unit: "°C",
                  limit: 80,
                  value: 60,
                  recorded: new Date().toISOString(),
                  source: "Manual",
                  connected: true,
                  ...defaults,
                }
              : kind === "plan"
                ? {
                    assetId: assetDetail || assets[0]?.id || "",
                    title: "",
                    intervalDays: 30,
                    nextDue: today(),
                    assignee: "",
                    checklist: [],
                    enabled: true,
                    ...defaults,
                  }
                : kind === "manual"
                  ? {
                      assetId: assetDetail || assets[0]?.id || "",
                      title: "",
                      text: "",
                      ...defaults,
                    }
                  : defaults,
    );
    setError("");
    setModal(kind);
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const d = await act("save", {
      kind: modal,
      id: selected?.id,
      version: selected?.version,
      data: form,
    });
    if (d) setModal(null);
  };
  const update = (key: string, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));
  const exportRows = (kind: string) => {
    const rows = state.records.filter((r) => r.kind === kind);
    if (!rows.length) {
      setNotice("No records to export");
      return;
    }
    const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r.data))));
    const lines = [
      ["id", "created", "updated", ...keys],
      ...rows.map((r) => [
        r.id,
        r.created,
        r.updated,
        ...keys.map((k) =>
          typeof r.data[k] === "object" ? JSON.stringify(r.data[k]) : r.data[k],
        ),
      ]),
    ];
    download(
      "relayops-" + kind + ".csv",
      lines.map((r) => r.map(csvCell).join(",")).join("\r\n"),
      "text/csv",
    );
  };
  function download(name: string, content: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const upload = async (file: File, target: string) => {
    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("target", target);
      const res = await fetch(
        "/api/files?workspace=" + encodeURIComponent(workspace),
        { method: "POST", body },
      );
      const d: any = await res.json();
      if (!res.ok) throw new Error(d.error);
      await load();
      setNotice("Evidence uploaded");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const assetSelect = (
    <select
      required
      value={form.assetId || ""}
      onChange={(e) => update("assetId", e.target.value)}
    >
      <option value="">Select equipment</option>
      {assets.map((a) => (
        <option key={a.id} value={a.id}>
          {a.data.name}
        </option>
      ))}
    </select>
  );
  const assigneeSelect = (
    <select
      value={form.assignee || ""}
      onChange={(e) => update("assignee", e.target.value)}
    >
      <option value="">Unassigned</option>
      {state.members
        .filter((m) => m.role !== "viewer")
        .map((m) => (
          <option key={m.user} value={m.user}>
            {m.name} · {m.role}
          </option>
        ))}
    </select>
  );
  const attachments = (target: string) => (
    <div className="attachments">
      {state.records
        .filter(
          (r) =>
            (r.kind as string) === "attachment" && r.data.target === target,
        )
        .map((r) => (
          <a
            key={r.id}
            href={
              "/api/files?workspace=" +
              encodeURIComponent(workspace) +
              "&key=" +
              encodeURIComponent(r.data.key)
            }
          >
            <FileText size={15} />
            {r.data.name} <Download size={13} />
          </a>
        ))}
      {(manager ||
        (state.records.some(
          (r) =>
            r.id === target &&
            r.kind === "order" &&
            r.data.assignee === state.user?.userId,
        ) &&
          canWrite)) && (
        <label className="upload-btn">
          <Upload size={15} /> Attach evidence
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf,text/plain"
            disabled={busy}
            onChange={(e) => {
              if (e.target.files?.[0]) upload(e.target.files[0], target);
            }}
          />
        </label>
      )}
      <small>JPEG, PNG, WebP, PDF or TXT · up to 5 MB</small>
    </div>
  );

  if (loading)
    return (
      <div className="boot">
        <span className="brand-symbol">R</span>
        <h1>RelayOps</h1>
        <p>Opening your maintenance workspace…</p>
      </div>
    );
  if (!state.user)
    return (
      <div className="landing">
        <div className="landing-nav">
          <div className="brand">
            <span className="brand-symbol">R</span>RelayOps
          </div>
          <span>MAINTENANCE & RELIABILITY</span>
        </div>
        <div className="landing-body">
          <div className="eyebrow">
            <span className="live-dot" /> Built for the work that keeps things
            running
          </div>
          <h1>
            Every signal.
            <br />A clear next step.
          </h1>
          <p>
            Bring equipment, people, and maintenance into one shared workspace.
            Track the issue. Coordinate the work. Verify the repair.
          </p>
          <a
            className="btn primary"
            target="_top"
            href="/signin-with-chatgpt?return_to=/"
          >
            Open your workspace <ArrowRight size={18} />
          </a>
          <div className="landing-features">
            <span>
              <ShieldCheck size={18} /> Role-based access
            </span>
            <span>
              <Activity size={18} /> Explainable condition alerts
            </span>
            <span>
              <CheckCircle2 size={18} /> Verified repairs
            </span>
          </div>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </div>
        <div className="landing-preview">
          <div className="preview-top">
            <span className="live-dot" /> MAINTENANCE WORKFLOW
          </div>
          {[
            "Register your equipment",
            "Monitor its condition",
            "Assign the right technician",
            "Document the repair",
            "Verify and close the loop",
          ].map((x, i) => (
            <div className="flow-step" key={x}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <h3>{x}</h3>
              <ArrowUpRight size={19} />
            </div>
          ))}
          <p>Real records. Clear ownership. A complete history.</p>
        </div>
      </div>
    );
  if (!workspace || !state.workspaces.length)
    return (
      <div className="onboarding">
        <div className="brand">
          <span className="brand-symbol">R</span>RelayOps
        </div>
        <div className="onboarding-card">
          <div className="eyebrow">YOUR OPERATIONS, CONNECTED</div>
          <h1>
            Give your equipment
            <br />a place to call home.
          </h1>
          <p>
            Create a workspace for your facility or join your team with an
            invitation.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const d = await api("createWorkspace", {
                  name: form.name || "",
                });
                setWorkspace(d.workspace);
                setNotice("Workspace created");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Workspace name">
              <input
                required
                minLength={2}
                maxLength={100}
                placeholder="e.g. Northside Operations"
                value={form.name || ""}
                onChange={(e) => update("name", e.target.value)}
              />
            </Field>
            <button className="btn primary" disabled={busy}>
              Create workspace <ArrowRight size={16} />
            </button>
          </form>
          <hr />
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const d = await api("join", { token: joinToken });
                setWorkspace(d.workspace);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Invitation code">
              <input
                required
                value={joinToken}
                onChange={(e) => setJoinToken(e.target.value)}
                placeholder="Paste your invitation code"
              />
            </Field>
            <button className="btn" disabled={busy}>
              Join workspace
            </button>
          </form>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
        </div>
        <p className="muted">Signed in as {state.user.email}</p>
      </div>
    );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <aside className={menu ? "sidebar mobile-open" : "sidebar"}>
        <div className="brand">
          <span className="brand-symbol">R</span>RelayOps
          <span className="brand-period">.</span>
        </div>
        <div className="workspace-select">
          <span className="workspace-icon">
            {state.workspaces.find((w) => w.id === workspace)?.name.slice(0, 1)}
          </span>
          <select
            aria-label="Workspace"
            value={workspace}
            onChange={(e) => {
              setWorkspace(e.target.value);
              setAssetDetail(null);
            }}
          >
            {state.workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {nav.map(([name, Icon]) => (
            <button
              key={name}
              className={page === name ? "nav-item active" : "nav-item"}
              aria-current={page === name ? "page" : undefined}
              onClick={() => go(name)}
            >
              <Icon size={18} />
              <span>{name}</span>
              {name === "Work orders" && activeOrders.length > 0 && (
                <span className="nav-count">{activeOrders.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="system-state">
            <span className="live-dot" /> Shared workspace <span>SQL</span>
          </div>
          <button className="profile" onClick={() => go("Team & settings")}>
            <span className="avatar">
              {state.user.displayName.slice(0, 2).toUpperCase()}
            </span>
            <span>
              <strong>{state.user.displayName.split("@")[0]}</strong>
              <small>{state.member?.role}</small>
            </span>
            <Settings size={16} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-btn mobile-menu"
              onClick={() => setMenu(!menu)}
              aria-label="Toggle navigation"
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{page}</strong>
          </div>
          <div className="topbar-actions">
            <span className="refresh-note">
              <span className="live-dot" /> Synced · refreshes every 30s
            </span>
            <button
              className="icon-btn"
              aria-label="Refresh workspace"
              onClick={() =>
                load()
                  .then(() => setNotice("Workspace refreshed"))
                  .catch((e) => setError(e.message))
              }
            >
              <RefreshCw size={16} />
            </button>
            <button
              className="notification"
              aria-label={`${alerts.length} condition alerts`}
              onClick={() => go("Condition monitoring")}
            >
              <Activity size={18} />
              {alerts.length > 0 && <span>{alerts.length}</span>}
            </button>
            <span className="avatar small">
              {state.user.displayName.slice(0, 2).toUpperCase()}
            </span>
          </div>
        </header>
        <main id="content" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {page === "Overview"
                  ? "YOUR OPERATIONS AT A GLANCE"
                  : "MAINTENANCE & RELIABILITY"}
              </div>
              <h1>{page === "Overview" ? "Operations overview" : page}</h1>
              <p>
                {page === "Overview"
                  ? "A clear view of your equipment, your team, and what needs attention."
                  : page === "Work orders"
                    ? "Coordinate the work. Document the repair. Close the loop."
                    : page === "Assets"
                      ? "Every asset, with its condition and complete maintenance history."
                      : page === "Condition monitoring"
                        ? "Recorded signals, clear thresholds, and explainable alerts."
                        : page === "Preventive plans"
                          ? "Stay ahead with recurring inspections and maintenance."
                          : page === "Reports"
                            ? "Measured activity from your recorded maintenance data."
                            : page === "Model lab"
                              ? "Inspect a trained benchmark, its evidence, and its limitations."
                            : page === "Knowledge"
                              ? "Equipment documentation, searchable and tied to the source."
                              : page === "Activity log"
                                ? "A traceable record of changes across your workspace."
                                : "The right access for every member of your team."}
              </p>
            </div>
            <div className="heading-actions">
              {manager && (
                <>
                  <button className="btn" onClick={() => open("scenario")}>
                    <FlaskConical size={16} /> Scenario lab
                  </button>
                  <button
                    className="btn primary"
                    onClick={() =>
                      open(
                        page === "Assets"
                          ? "asset"
                          : page === "Preventive plans"
                            ? "plan"
                            : page === "Knowledge"
                              ? "manual"
                              : "order",
                      )
                    }
                  >
                    <Plus size={17} />
                    {page === "Assets"
                      ? "Add asset"
                      : page === "Preventive plans"
                        ? "Add plan"
                        : page === "Knowledge"
                          ? "Add document"
                          : "Create work order"}
                  </button>
                </>
              )}
            </div>
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {state.viewLimited&&<div className="info-banner" role="status">This view includes up to 10,000 operational records and the latest 2,000 readings. Charts and exports reflect the loaded data.</div>}
          {notice && (
            <div className="toast" role="status">
              <CheckCircle2 size={18} />
              {notice}
            </div>
          )}
          {assets.length === 0 && page === "Overview" && (
            <div className="welcome-banner">
              <div>
                <h2>A fresh start for your operations.</h2>
                <p>
                  Add your equipment, or explore the full workflow with six
                  sample assets and clearly labeled simulated readings.
                </p>
              </div>
              {manager && (
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => act("seed", {}, "Sample workspace loaded")}
                >
                  <FlaskConical size={16} /> Load sample workspace
                </button>
              )}
            </div>
          )}
          {page === "Overview" && (
            <>
              <div className="metrics">
                <Metric
                  title="REGISTERED ASSETS"
                  value={assets.length}
                  note={`${assets.filter((a) => a.data.status === "Operational").length} operational`}
                  icon={<Box size={19} />}
                  tone="teal"
                />
                <Metric
                  title="OPEN WORK ORDERS"
                  value={activeOrders.length}
                  note={`${orders.filter((o) => o.data.status === "In progress").length} currently in progress`}
                  icon={<ClipboardList size={19} />}
                  tone="blue"
                />
                <Metric
                  title="NEEDS ATTENTION"
                  value={alerts.length}
                  note="Active condition alerts"
                  icon={<AlertTriangle size={19} />}
                  tone="amber"
                />
                <Metric
                  title="AWAITING VERIFICATION"
                  value={
                    orders.filter(
                      (o) => o.data.status === "Awaiting verification",
                    ).length
                  }
                  note="Ready for manager review"
                  icon={<ShieldCheck size={19} />}
                  tone="purple"
                />
              </div>
              <div className="overview-grid">
                <section className="panel attention">
                  <PanelHead
                    title="Attention queue"
                    sub="The next actions that matter"
                    action={
                      <button
                        className="text-btn"
                        onClick={() => go("Work orders")}
                      >
                        View all <ArrowRight size={14} />
                      </button>
                    }
                  />
                  {[
                    ...overdue,
                    ...orders.filter(
                      (o) =>
                        o.data.status === "Awaiting verification" &&
                        !overdue.some((x) => x.id === o.id),
                    ),
                  ]
                    .slice(0, 4)
                    .map((o) => (
                      <button
                        className="attention-row"
                        key={o.id}
                        onClick={() => open("order", o)}
                      >
                        <span
                          className={
                            "attention-icon " +
                            (o.data.status === "Awaiting verification"
                              ? "purple"
                              : "amber")
                          }
                        >
                          <Wrench size={18} />
                        </span>
                        <span>
                          <strong>{o.data.title}</strong>
                          <small>
                            {assetName(o.data.assetId)} ·{" "}
                            {o.data.status === "Awaiting verification"
                              ? "Repair awaiting verification"
                              : "Due " + date(o.data.due)}
                          </small>
                        </span>
                        <Badge>
                          {o.data.status === "Awaiting verification"
                            ? "Review"
                            : "Overdue"}
                        </Badge>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                  {alerts.slice(0,3).map(sensor=><button className="attention-row" key={sensor.id} onClick={()=>go('Condition monitoring')}><span className="attention-icon amber"><Activity size={18}/></span><span><strong>{assetName(sensor.data.assetId)}</strong><small>{condition(sensor.data).reason}</small></span><Badge>{condition(sensor.data).severity}</Badge><ChevronRight size={16}/></button>)}
                  {!alerts.length && !overdue.length &&
                    !orders.some(
                      (o) => o.data.status === "Awaiting verification",
                    ) && (
                      <Empty title="You’re all caught up">
                        Overdue work and repairs ready for review will appear
                        here.
                      </Empty>
                    )}
                </section>
                <section className="panel fleet-panel">
                  <PanelHead
                    title="Fleet status"
                    sub="Current equipment availability"
                  />
                  <div
                    className="fleet-donut"
                    style={{
                      background: `conic-gradient(#0d9488 0 ${assets.length ? (assets.filter((a) => a.data.status === "Operational").length / assets.length) * 100 : 0}%, #f4b96b 0 ${assets.length ? (assets.filter((a) => a.data.status !== "Offline").length / assets.length) * 100 : 0}%, #e9eeee 0 100%)`,
                    }}
                  >
                    <div>
                      <strong>
                        {assets.length
                          ? Math.round(
                              (assets.filter(
                                (a) => a.data.status === "Operational",
                              ).length /
                                assets.length) *
                                100,
                            )
                          : 0}
                        %
                      </strong>
                      <span>operational</span>
                    </div>
                  </div>
                  <div className="fleet-legend">
                    {["Operational", "Maintenance", "Offline"].map((s, i) => (
                      <div key={s}>
                        <span className={"legend-dot dot-" + i} />
                        <span>{s}</span>
                        <strong>
                          {assets.filter((a) => a.data.status === s).length}
                        </strong>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
              <section className="panel">
                <PanelHead
                  title="Work in motion"
                  sub="Active maintenance across your workspace"
                  action={
                    <button
                      className="text-btn"
                      onClick={() => go("Work orders")}
                    >
                      All work orders <ArrowRight size={14} />
                    </button>
                  }
                />
                <OrderTable
                  assetName={assetName}
                  memberName={memberName}
                  onOpen={(o) => open("order", o)}
                  rows={activeOrders.slice(0, 5)}
                />
              </section>
              <div className="two-col">
                <section className="panel">
                  <PanelHead
                    title="Latest signals"
                    sub="Condition rules · no failure-date estimates"
                  />
                  {[...alerts,...sensors.filter(s=>!alerts.some(a=>a.id===s.id))].slice(0, 4).map((s) => (
                    <div className="signal-row" key={s.id}>
                      <span className="signal-icon">
                        <Activity size={18} />
                      </span>
                      <div>
                        <strong>{assetName(s.data.assetId)}</strong>
                        <small>
                          {s.data.name} · {s.data.source}
                        </small>
                      </div>
                      <span className="reading">
                        {s.data.value}
                        <small>{s.data.unit}</small>
                      </span>
                      <Badge>{condition(s.data).severity}</Badge>
                    </div>
                  ))}
                  {!sensors.length && <Empty title="No sensor readings yet" />}
                </section>
                <section className="panel">
                  <PanelHead
                    title="Recent activity"
                    sub="A shared history of the work"
                  />
                  {state.events.slice(0, 4).map((e) => (
                    <div className="activity-row" key={e.id}>
                      <span className="timeline-dot" />
                      <div>
                        <strong>{e.action}</strong>
                        <p>{e.detail}</p>
                        <small>
                          {e.actor.split("@")[0]} ·{" "}
                          {new Date(e.created).toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </small>
                      </div>
                    </div>
                  ))}
                  {!state.events.length && (
                    <Empty title="Your activity will appear here" />
                  )}
                </section>
              </div>
            </>
          )}
          {page === "Work orders" && (
            <>
              <div className="filter-bar">
                <div className="search-box">
                  <Search size={17} />
                  <input
                    aria-label="Search work orders"
                    placeholder="Search work orders or equipment…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Filter work order status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  {[
                    "All",
                    "Open",
                    "In progress",
                    "Awaiting verification",
                    "Done",
                    "Overdue",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={mine}
                    onChange={(e) => setMine(e.target.checked)}
                  />{" "}
                  My tasks
                </label>
                <button className="btn" onClick={() => exportRows("order")}>
                  <Download size={15} /> Export
                </button>
              </div>
              <div className="status-strip">
                {["Open", "In progress", "Awaiting verification", "Done"].map(
                  (s) => (
                    <button
                      className={status === s ? "selected" : ""}
                      key={s}
                      onClick={() => setStatus(status === s ? "All" : s)}
                    >
                      <span>{s}</span>
                      <strong>
                        {orders.filter((o) => o.data.status === s).length}
                      </strong>
                    </button>
                  ),
                )}
              </div>
              <section className="panel no-padding">
                <OrderTable
                  assetName={assetName}
                  memberName={memberName}
                  onOpen={(o) => open("order", o)}
                  rows={orders.filter(
                    (o) =>
                      (status === "All" ||
                        (status === "Overdue" &&
                          o.data.due < today() &&
                          o.data.status !== "Done") ||
                        o.data.status === status) &&
                      (!mine || o.data.assignee === state.user?.userId) &&
                      (o.data.title + " " + assetName(o.data.assetId))
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                  )}
                />
              </section>
            </>
          )}
          {page === "Assets" && !currentAsset && (
            <>
              <div className="filter-bar">
                <div className="search-box">
                  <Search size={17} />
                  <input
                    aria-label="Search assets"
                    placeholder="Search equipment, location, or serial number…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <button className="btn" onClick={() => exportRows("asset")}>
                  <Download size={15} /> Export assets
                </button>
              </div>
              <div className="asset-grid">
                {assets
                  .filter((a) =>
                    (a.data.name + " " + a.data.location + " " + a.data.serial)
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((a) => (
                    <button
                      className="asset-card"
                      key={a.id}
                      onClick={() => setAssetDetail(a.id)}
                    >
                      <div className="asset-card-top">
                        <span className="equipment-icon">
                          <Box size={25} />
                        </span>
                        <Badge>{a.data.status}</Badge>
                      </div>
                      <small>{a.data.type.toUpperCase()}</small>
                      <h3>{a.data.name}</h3>
                      <p>{a.data.location}</p>
                      <div className="asset-card-bottom">
                        <span>
                          <span className="legend-dot dot-0" />
                          {
                            activeOrders.filter((o) => o.data.assetId === a.id)
                              .length
                          }{" "}
                          open tasks
                        </span>
                        <span>
                          {a.data.criticality} priority{" "}
                          <ChevronRight size={14} />
                        </span>
                      </div>
                    </button>
                  ))}
              </div>
              {!assets.length && (
                <Empty title="Your asset register is ready">
                  Add equipment to start building its maintenance history.
                </Empty>
              )}
            </>
          )}
          {page === "Assets" && currentAsset && (
            <>
              <button
                className="text-btn back"
                onClick={() => setAssetDetail(null)}
              >
                ← All equipment
              </button>
              <section className="panel asset-detail-head">
                <span className="equipment-icon big">
                  <Box size={35} />
                </span>
                <div>
                  <div className="eyebrow">
                    {currentAsset.data.type} ·{" "}
                    {currentAsset.data.serial || "No serial number"}
                  </div>
                  <h2>{currentAsset.data.name}</h2>
                  <p>{currentAsset.data.location}</p>
                </div>
                <Badge>{currentAsset.data.status}</Badge>
                <div className="heading-actions">
                  {manager && (
                    <button
                      className="btn"
                      onClick={() => open("asset", currentAsset)}
                    >
                      Edit asset
                    </button>
                  )}
                  <button
                    className="btn"
                    onClick={() => open("qr", currentAsset)}
                  >
                    Equipment link / QR
                  </button>
                </div>
              </section>
              <div className="two-col">
                <section className="panel">
                  <PanelHead title="Equipment details" />
                  <dl>
                    <dt>Criticality</dt>
                    <dd>
                      <Badge>{currentAsset.data.criticality}</Badge>
                    </dd>
                    <dt>Location</dt>
                    <dd>{currentAsset.data.location}</dd>
                    <dt>Serial</dt>
                    <dd>{currentAsset.data.serial || "—"}</dd>
                    <dt>Added</dt>
                    <dd>{date(currentAsset.created)}</dd>
                  </dl>
                  <p className="notes">
                    {currentAsset.data.notes || "No equipment notes yet."}
                  </p>
                  {attachments(currentAsset.id)}
                </section>
                <section className="panel">
                  <PanelHead title="Recorded condition" />
                  {sensors
                    .filter((s) => s.data.assetId === currentAsset.id)
                    .map((s) => (
                      <div className="signal-row" key={s.id}>
                        <Activity size={18} />
                        <div>
                          <strong>{s.data.name}</strong>
                          <small>
                            {s.data.source} · {date(s.data.recorded)}
                          </small>
                        </div>
                        <strong>
                          {s.data.value} {s.data.unit}
                        </strong>
                        <Badge>{condition(s.data).severity}</Badge>
                      </div>
                    ))}
                  {!sensors.some((s) => s.data.assetId === currentAsset.id) && (
                    <Empty title="No instrumented signals" />
                  )}
                </section>
              </div>
              <section className="panel">
                <PanelHead
                  title="Maintenance history"
                  action={
                    manager ? (
                      <button
                        className="btn"
                        onClick={() =>
                          open("order", null, { assetId: currentAsset.id })
                        }
                      >
                        <Plus size={15} /> Report an issue
                      </button>
                    ) : undefined
                  }
                />
                <OrderTable
                  assetName={assetName}
                  memberName={memberName}
                  onOpen={(o) => open("order", o)}
                  rows={orders.filter(
                    (o) => o.data.assetId === currentAsset.id,
                  )}
                />
              </section>
              <section className="panel">
                <PanelHead title="Documentation" />
                {manuals
                  .filter((m) => m.data.assetId === currentAsset.id)
                  .map((m) => (
                    <details key={m.id}>
                      <summary>{m.data.title}</summary>
                      <pre className="manual-text">{m.data.text}</pre>
                    </details>
                  ))}
                {!manuals.some((m) => m.data.assetId === currentAsset.id) && (
                  <p className="muted">No equipment documentation added yet.</p>
                )}
              </section>
            </>
          )}
          {page === "Condition monitoring" && (
            <>
              <div className="info-banner">
                <ShieldCheck size={20} />
                <div>
                  <strong>Evidence you can inspect.</strong>
                  <p>
                    Alerts compare recorded values against upper thresholds.
                    Simulation is labeled. No trained failure predictor or
                    calibrated confidence is claimed.
                  </p>
                </div>
              </div>
              <div className="filter-bar">
                <span className="muted">
                  {sensors.length} signals · {alerts.length} need attention
                </span>
                <div className="spacer" />
                {manager && (
                  <>
                    <button className="btn" onClick={() => open("sensor")}>
                      <Plus size={15} /> Add sensor
                    </button>
                    <button className="btn" onClick={() => open("import")}>
                      <Upload size={15} /> Import CSV
                    </button>
                    <button
                      className="btn primary"
                      disabled={busy}
                      onClick={() => act("generate")}
                    >
                      <ClipboardList size={15} /> Generate work orders
                    </button>
                  </>
                )}
                <button className="btn" onClick={() => exportRows("sensor")}>
                  <Download size={15} />
                  <span className="sr-only">Export sensors</span>
                </button>
              </div>
              <div className="sensor-grid">
                {sensors.map((s) => {
                  const c = condition(s.data);
                  return (
                    <section className="panel sensor-card" key={s.id}>
                      <div className="sensor-card-title">
                        <span className="signal-icon">
                          <Activity size={18} />
                        </span>
                        <Badge>{c.severity}</Badge>
                      </div>
                      <h3>{s.data.name}</h3>
                      <p>{assetName(s.data.assetId)}</p>
                      <div className="sensor-value">
                        {s.data.connected ? s.data.value : "—"}{" "}
                        <small>{s.data.unit}</small>
                      </div>
                      <div className="meter">
                        <span
                          style={{
                            width: Math.min(100, (c.ratio / 1.5) * 100) + "%",
                            background: c.ratio >= 1 ? "#d18b35" : "#0d9488",
                          }}
                        />
                      </div>
                      <div className="sensor-meta">
                        <span>
                          Upper limit {s.data.limit} {s.data.unit}
                        </span>
                        <span>{s.data.source}</span>
                      </div>
                      <p className="sensor-reason">{c.reason}</p>
                      <small>
                        Recorded {new Date(s.data.recorded).toLocaleString()}
                      </small>
                      <div className="card-actions">
                        <button
                          className="text-btn"
                          onClick={() => setHistorySensor(s.id)}
                        >
                          History <ArrowRight size={14} />
                        </button>
                        {manager && (
                          <button
                            className="text-btn"
                            onClick={() => open("sensor", s)}
                          >
                            Edit / record reading
                          </button>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
              {!sensors.length && (
                <Empty title="Connect your first signal">
                  Add a manual sensor, import readings, or run a labeled
                  simulation.
                </Empty>
              )}
              {historySensor && (
                <section className="panel">
                  <PanelHead
                    title={
                      sensors.find((s) => s.id === historySensor)?.data.name +
                      " · reading history"
                    }
                    action={
                      <button
                        className="icon-btn"
                        aria-label="Close history"
                        onClick={() => setHistorySensor("")}
                      >
                        <X size={16} />
                      </button>
                    }
                  />
                  <Chart
                    readings={state.records.filter(
                      (r) =>
                        (r.kind as string) === "reading" &&
                        r.data.sensorId === historySensor,
                    )}
                  />
                </section>
              )}
            </>
          )}
          {page === "Preventive plans" && (
            <>
              <div className="filter-bar">
                <span className="muted">
                  {plans.filter((p) => p.data.enabled).length} active plans
                </span>
                <div className="spacer" />
                {manager && (
                  <button
                    className="btn primary"
                    disabled={busy}
                    onClick={() => act("generate")}
                  >
                    <CalendarDays size={15} /> Generate due work
                  </button>
                )}
                <button className="btn" onClick={() => exportRows("plan")}>
                  <Download size={15} /> Export
                </button>
              </div>
              <section className="panel no-padding">
                {plans.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Maintenance plan</th>
                          <th>Equipment</th>
                          <th>Interval</th>
                          <th>Next due</th>
                          <th>Owner</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plans.map((p) => (
                          <tr key={p.id}>
                            <td>
                              <button
                                className="table-link"
                                onClick={() => open("plan", p)}
                              >
                                {p.data.title}
                              </button>
                              <small>
                                {p.data.checklist.length} checklist items
                              </small>
                            </td>
                            <td>{assetName(p.data.assetId)}</td>
                            <td>Every {p.data.intervalDays} days</td>
                            <td>{date(p.data.nextDue)}</td>
                            <td>{memberName(p.data.assignee)}</td>
                            <td>
                              <Badge>
                                {p.data.enabled ? "Active" : "Paused"}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty title="Plan ahead">
                    Create a recurring maintenance plan for your equipment.
                  </Empty>
                )}
              </section>
              <p className="footnote">
                Due work is generated on demand. Each generation advances the
                next due date; existing active work is not duplicated.
                Unattended scheduling requires a separately configured
                scheduler.
              </p>
            </>
          )}
          {page === "Reports" && (
            <>
              <div className="metrics">
                <Metric
                  title="VERIFIED REPAIRS"
                  value={orders.filter((o) => o.data.status === "Done").length}
                  note="Manager-verified work orders"
                  icon={<CheckCircle2 size={19} />}
                  tone="teal"
                />
                <Metric
                  title="RECORDED COST"
                  value={money(
                    orders
                      .filter((o) => o.data.status === "Done")
                      .reduce((n, o) => n + o.data.cost, 0),
                  )}
                  note="Verified work only · USD"
                  icon={<Signal size={19} />}
                  tone="blue"
                />
                <Metric
                  title="LABOR HOURS"
                  value={orders
                    .filter((o) => o.data.status === "Done")
                    .reduce((n, o) => n + o.data.laborHours, 0)
                    .toFixed(1)}
                  note="Verified work only"
                  icon={<Clock size={19} />}
                  tone="purple"
                />
                <Metric
                  title="OVERDUE WORK"
                  value={overdue.length}
                  note="Open past the due date"
                  icon={<AlertTriangle size={19} />}
                  tone="amber"
                />
              </div>
              <section className="panel">
                <PanelHead
                  title="Maintenance by equipment"
                  sub="Recorded work and costs; no estimated savings"
                  action={
                    <button className="btn" onClick={() => exportRows("order")}>
                      <Download size={15} /> Export work data
                    </button>
                  }
                />
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Equipment</th>
                        <th>Open work</th>
                        <th>Verified repairs</th>
                        <th>Recorded cost</th>
                        <th>Labor hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assets.map((a) => {
                        const done = orders.filter(
                          (o) =>
                            o.data.assetId === a.id && o.data.status === "Done",
                        );
                        return (
                          <tr key={a.id}>
                            <td>{a.data.name}</td>
                            <td>
                              {
                                activeOrders.filter(
                                  (o) => o.data.assetId === a.id,
                                ).length
                              }
                            </td>
                            <td>{done.length}</td>
                            <td>
                              {money(done.reduce((n, o) => n + o.data.cost, 0))}
                            </td>
                            <td>
                              {done
                                .reduce((n, o) => n + o.data.laborHours, 0)
                                .toFixed(1)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="panel">
                <PanelHead title="Data provenance" />
                <div className="provenance-grid">
                  {["Manual", "Imported", "Simulation"].map((s) => (
                    <div key={s}>
                      <span>{s} signals</span>
                      <strong>
                        {sensors.filter((r) => r.data.source === s).length}
                      </strong>
                    </div>
                  ))}
                </div>
                <p className="footnote">
                  Simulated readings are test data. Costs are entered by users.
                  Condition thresholds are rules, not predictions. No downtime
                  reduction or model accuracy is inferred.
                </p>
              </section>
            </>
          )}
          {page === "Knowledge" && (
            <>
              <section className="panel">
                <PanelHead
                  title="Find it in the manual"
                  sub="Search text documents and inspect the matching source excerpts"
                />
                <form
                  className="knowledge-search"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    try {
                      const d = await api("searchManuals", { query });
                      setManualResults(d.results);
                      if (!d.results.length)
                        setNotice(
                          "No matching excerpts. Try another search term.",
                        );
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <div className="search-box">
                    <Search size={18} />
                    <input
                      required
                      minLength={2}
                      placeholder="Search inspection, vibration, operating limits…"
                      aria-label="Search documentation"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <button className="btn primary" disabled={busy}>
                    Search sources <ArrowRight size={16} />
                  </button>
                </form>
                {manualResults.map((r, i) => (
                  <div className="source-result" key={i}>
                    <span className="eyebrow">
                      SOURCE {i + 1} · SECTION {r.section}
                    </span>
                    <h3>{r.title}</h3>
                    <p>{r.text}</p>
                    <small>{assetName(r.assetId)}</small>
                  </div>
                ))}
              </section>
              <div className="two-col">
                {manuals.map((m) => (
                  <section className="panel" key={m.id}>
                    <div className="document-title">
                      <FileText size={23} />
                      <div>
                        <h3>{m.data.title}</h3>
                        <p>{assetName(m.data.assetId)}</p>
                      </div>
                      {manager && (
                        <button
                          className="text-btn"
                          onClick={() => open("manual", m)}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                    <details>
                      <summary>Read source text</summary>
                      <pre className="manual-text">{m.data.text}</pre>
                    </details>
                  </section>
                ))}
              </div>
              {!manuals.length && (
                <Empty title="Build your equipment library">
                  Add manufacturer text or upload a TXT guide. Original PDFs can
                  be attached to an asset.
                </Empty>
              )}
              <div className="info-banner">
                <BookOpen size={19} />
                <p>
                  Search returns excerpts from your documents.{" "}
                  {state.capabilities?.ai
                    ? "AI drafting is connected in the work-order form. All generated suggestions require review."
                    : "The work-order assistant uses labeled rules. Generative drafting becomes available when a model provider is connected."}
                </p>
              </div>
            </>
          )}
          {page === "Model lab" && <ModelLab />}
          {page === "Activity log" && (
            <section className="panel">
              <PanelHead
                title="Workspace activity"
                sub="Latest 500 events · newest first"
              />
              {state.events.map((e) => (
                <div className="activity-row" key={e.id}>
                  <span className="timeline-dot" />
                  <div>
                    <strong>{e.action}</strong>
                    <p>{e.detail}</p>
                    <small>
                      {e.actor} · {new Date(e.created).toLocaleString()} ·{" "}
                      {e.target.slice(0, 8)}
                    </small>
                  </div>
                </div>
              ))}
            </section>
          )}
          {page === "Team & settings" && (
            <>
              <section className="panel">
                <PanelHead
                  title="People & permissions"
                  sub="Roles are enforced on the server for every operation"
                  action={
                    manager ? (
                      <button
                        className="btn primary"
                        onClick={() =>
                          open("invite", null, {
                            email: "",
                            role: "technician",
                          })
                        }
                      >
                        <Plus size={15} /> Invite member
                      </button>
                    ) : undefined
                  }
                />
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Member</th>
                        <th>Email</th>
                        <th>Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.members.map((m) => (
                        <tr key={m.user}>
                          <td>
                            <span className="person-dot">{m.name[0]}</span>
                            {m.name}
                          </td>
                          <td>{m.email}</td>
                          <td>
                            {state.member?.role === "owner" &&
                            m.role !== "owner" ? (
                              <select
                                aria-label={"Role for " + m.name}
                                value={m.role}
                                onChange={(e) =>
                                  act(
                                    "role",
                                    { user: m.user, role: e.target.value },
                                    "Member role updated",
                                  )
                                }
                              >
                                {["manager", "technician", "viewer"].map(
                                  (r) => (
                                    <option key={r}>{r}</option>
                                  ),
                                )}
                              </select>
                            ) : (
                              <Badge>{m.role}</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="role-explainer">
                  <p>
                    <strong>Owner / manager</strong> — plan work, manage assets,
                    assign technicians, verify repairs.
                  </p>
                  <p>
                    <strong>Technician</strong> — update assigned work, complete
                    checklists, record labor and attach evidence.
                  </p>
                  <p>
                    <strong>Viewer</strong> — inspect records and reports
                    without modifying them.
                  </p>
                </div>
              </section>
              {state.invites.length > 0 && (
                <section className="panel">
                  <PanelHead
                    title="Pending invitations"
                    sub="Invitation codes expire after 7 days and are bound to the recipient’s email"
                  />
                  {state.invites.map((i) => (
                    <div className="invite-row" key={i.id}>
                      <div>
                        <strong>{i.email}</strong>
                        <small>
                          {i.role} · expires {date(i.expires)}
                        </small>
                        <code>{i.id}</code>
                      </div>
                      <button
                        className="btn"
                        onClick={() =>
                          navigator.clipboard
                            .writeText(i.id)
                            .then(() => setNotice("Invitation code copied"))
                            .catch(() =>
                              setNotice("Select and copy the invitation code"),
                            )
                        }
                      >
                        Copy code
                      </button>
                      <button
                        className="text-btn"
                        disabled={busy}
                        onClick={() =>
                          act(
                            "revokeInvite",
                            { id: i.id },
                            "Invitation revoked",
                          )
                        }
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </section>
              )}
              <section className="panel">
                <PanelHead title="Workspace tools" />
                <div className="settings-actions">
                  <button
                    className="btn"
                    onClick={() => {
                      download(
                        "relayops-workspace-backup.json",
                        JSON.stringify(
                          {
                            exported: new Date().toISOString(),
                            workspace: state.workspaces.find(
                              (w) => w.id === workspace,
                            ),
                            records: state.records,
                            events: state.events,
                          },
                          null,
                          2,
                        ),
                        "application/json",
                      );
                    }}
                  >
                    <Download size={16} /> Export workspace snapshot
                  </button>
                  <button
                    className="btn"
                    onClick={() => open("newWorkspace", null, { name: "" })}
                  >
                    <Plus size={16} /> New workspace
                  </button>
                  <button
                    className="btn"
                    onClick={() => open("join", null, { token: "" })}
                  >
                    <Users size={16} /> Join another workspace
                  </button>
                  <a
                    className="btn"
                    href="/signout-with-chatgpt?return_to=/"
                    target="_top"
                  >
                    <LogOut size={16} /> Sign out
                  </a>
                </div>
                <p className="footnote">
                  The snapshot includes record metadata and activity. Download
                  attached files separately. Account access is handled by the
                  private hosting platform.
                </p>
              </section>
            </>
          )}
          <footer className="app-footer">
            <span>
              <span className="brand-mini">R</span> RelayOps{" "}
              <span className="muted">/ Maintenance & reliability</span>
            </span>
            <span>From signal to verified repair.</span>
          </footer>
        </main>
      </div>
      {modal && (
        <Modal
          title={
            modal === "asset"
              ? selected
                ? "Equipment details"
                : "Register equipment"
              : modal === "order"
                ? selected
                  ? "Work order details"
                  : "Create work order"
                : modal === "scenario"
                  ? "Scenario lab"
                  : modal === "sensor"
                    ? "Sensor configuration"
                    : modal === "plan"
                      ? "Preventive maintenance plan"
                      : modal === "manual"
                        ? "Equipment documentation"
                        : modal === "qr"
                          ? "Equipment access link"
                          : modal === "import"
                            ? "Import sensor readings"
                            : modal === "invite"
                              ? "Invite a teammate"
                              : modal === "newWorkspace"
                                ? "Create another workspace"
                                : "Join a workspace"
          }
          onClose={() => setModal(null)}
        >
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {["asset", "order", "sensor", "plan", "manual"].includes(modal) && (
            <form onSubmit={save}>
              <fieldset
                disabled={
                  busy ||
                  !canWrite ||
                  (!manager &&
                    (modal !== "order" ||
                      selected?.data.assignee !== state.user?.userId ||
                      selected?.data.status === "Done"))
                }
                className="form-fields"
              >
                {modal === "asset" && (
                  <>
                    <Field label="Equipment name">
                      <input
                        required
                        minLength={2}
                        maxLength={100}
                        value={form.name}
                        onChange={(e) => update("name", e.target.value)}
                      />
                    </Field>
                    <div className="form-grid">
                      <Field label="Equipment type">
                        <input
                          required
                          value={form.type}
                          onChange={(e) => update("type", e.target.value)}
                        />
                      </Field>
                      <Field label="Location">
                        <input
                          required
                          value={form.location}
                          onChange={(e) => update("location", e.target.value)}
                        />
                      </Field>
                      <Field label="Criticality">
                        <select
                          value={form.criticality}
                          onChange={(e) =>
                            update("criticality", e.target.value)
                          }
                        >
                          {["Low", "Medium", "High", "Critical"].map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Equipment status">
                        <select
                          value={form.status}
                          onChange={(e) => update("status", e.target.value)}
                        >
                          {["Operational", "Maintenance", "Offline"].map(
                            (v) => (
                              <option key={v}>{v}</option>
                            ),
                          )}
                        </select>
                      </Field>
                    </div>
                    <Field label="Serial number">
                      <input
                        value={form.serial}
                        onChange={(e) => update("serial", e.target.value)}
                      />
                    </Field>
                    <Field label="Equipment notes">
                      <textarea
                        rows={3}
                        value={form.notes}
                        onChange={(e) => update("notes", e.target.value)}
                      />
                    </Field>
                  </>
                )}
                {modal === "order" && (
                  <>
                    <fieldset disabled={!manager} className="form-fields">
                      <Field label="Equipment">{assetSelect}</Field>
                      <Field label="Work order title">
                        <input
                          required
                          minLength={3}
                          maxLength={180}
                          value={form.title}
                          onChange={(e) => update("title", e.target.value)}
                        />
                      </Field>
                      <Field label="Issue / technician notes">
                        <textarea
                          rows={3}
                          value={form.description}
                          onChange={(e) =>
                            update("description", e.target.value)
                          }
                        />
                      </Field>
                      {!selected && (
                        <button
                          type="button"
                          className="assistant-btn"
                          disabled={form.description?.length < 10 || busy}
                          onClick={async () => {
                            setBusy(true);
                            try {
                              const d = await api("draft", {
                                notes: form.description,
                              });
                              setForm((f) => ({
                                ...f,
                                title: d.title,
                                priority: d.priority,
                                checklist: d.checklist,
                              }));
                              setNotice(d.method);
                            } catch (e) {
                              setError((e as Error).message);
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          <Command size={15} /> Structure notes into a draft{" "}
                          <span>Rules-based</span>
                        </button>
                      )}
                      {!selected && state.capabilities?.ai && (
                        <>
                          <button
                            type="button"
                            className="assistant-btn"
                            disabled={form.description?.length < 10 || busy}
                            onClick={async () => {
                              setBusy(true);
                              try {
                                const d = await api("draft", {
                                  notes: form.description,
                                  useAI: true,
                                });
                                setForm((f) => ({
                                  ...f,
                                  title: d.title,
                                  description: d.description,
                                  priority: d.priority,
                                  checklist: d.checklist,
                                }));
                                setNotice(d.method);
                              } catch (e) {
                                setError((e as Error).message);
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            <Command size={15} /> Draft with AI{" "}
                            <span>Review required</span>
                          </button>
                          <p className="footnote">
                            Sends these notes to OpenAI to structure a draft.
                            Review all suggested details before saving.
                          </p>
                        </>
                      )}
                      <div className="form-grid">
                        <Field label="Priority">
                          <select
                            value={form.priority}
                            onChange={(e) => update("priority", e.target.value)}
                          >
                            {["Low", "Medium", "High", "Critical"].map((v) => (
                              <option key={v}>{v}</option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Due date">
                          <input
                            type="date"
                            required
                            value={form.due}
                            onChange={(e) => update("due", e.target.value)}
                          />
                        </Field>
                      </div>
                      <Field label="Assigned to">{assigneeSelect}</Field>
                    </fieldset>
                    <Field label="Work status">
                      <select
                        disabled={
                          !selected ||
                          (!manager && form.assignee !== state.user?.userId)
                        }
                        value={form.status}
                        onChange={(e) => update("status", e.target.value)}
                      >
                        {[
                          "Open",
                          "In progress",
                          "Awaiting verification",
                          ...(manager ? ["Done"] : []),
                        ].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </Field>
                    <div className="checklist">
                      <h3>Completion checklist</h3>
                      {form.checklist?.map((c: any, i: number) => (
                        <label className="check-label" key={i}>
                          <input
                            type="checkbox"
                            checked={c.done}
                            onChange={(e) =>
                              update(
                                "checklist",
                                form.checklist.map((x: any, j: number) =>
                                  j === i
                                    ? { ...x, done: e.target.checked }
                                    : x,
                                ),
                              )
                            }
                          />
                          {c.text}
                        </label>
                      ))}
                      {manager && (
                        <input
                          aria-label="Add checklist item"
                          placeholder="Add checklist item and press Enter"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const text = e.currentTarget.value.trim();
                              if (text) {
                                update("checklist", [
                                  ...form.checklist,
                                  { text, done: false },
                                ]);
                                e.currentTarget.value = "";
                              }
                            }
                          }}
                        />
                      )}
                    </div>
                    <Field label="Completion notes">
                      <textarea
                        rows={3}
                        placeholder="What was inspected, repaired, and verified?"
                        value={form.completion}
                        onChange={(e) => update("completion", e.target.value)}
                      />
                    </Field>
                    <div className="form-grid">
                      <Field label="Labor hours">
                        <input
                          type="number"
                          min="0"
                          max="10000"
                          step=".1"
                          value={form.laborHours}
                          onChange={(e) =>
                            update("laborHours", Number(e.target.value))
                          }
                        />
                      </Field>
                      <Field label="Recorded cost (USD)">
                        <input
                          type="number"
                          min="0"
                          max="10000000"
                          step=".01"
                          value={form.cost}
                          onChange={(e) =>
                            update("cost", Number(e.target.value))
                          }
                        />
                      </Field>
                    </div>
                    <p className="footnote">
                      Open → In progress → Awaiting verification → Done. A
                      manager must verify repairs. Completion requires notes and
                      all checklist items.
                    </p>
                  </>
                )}
                {modal === "sensor" && (
                  <>
                    <Field label="Equipment">{assetSelect}</Field>
                    <div className="form-grid">
                      <Field label="Signal name">
                        <input
                          required
                          value={form.name}
                          onChange={(e) => update("name", e.target.value)}
                        />
                      </Field>
                      <Field label="Unit">
                        <input
                          required
                          value={form.unit}
                          onChange={(e) => update("unit", e.target.value)}
                        />
                      </Field>
                      <Field label="Upper alarm threshold">
                        <input
                          type="number"
                          required
                          step="any"
                          min=".00001"
                          value={form.limit}
                          onChange={(e) =>
                            update("limit", Number(e.target.value))
                          }
                        />
                      </Field>
                      <Field label="Latest reading">
                        <input
                          type="number"
                          required
                          step="any"
                          value={form.value}
                          onChange={(e) => {
                            update("value", Number(e.target.value));
                            update("recorded", new Date().toISOString());
                          }}
                        />
                      </Field>
                    </div>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={form.connected}
                        onChange={(e) => update("connected", e.target.checked)}
                      />{" "}
                      Sensor connected
                    </label>
                    <p className="footnote">
                      Upper-limit monitoring only. Use separate low-limit rules
                      for signals such as pressure loss. Source: {form.source}.
                    </p>
                  </>
                )}
                {modal === "plan" && (
                  <>
                    <Field label="Equipment">{assetSelect}</Field>
                    <Field label="Plan title">
                      <input
                        required
                        minLength={3}
                        value={form.title}
                        onChange={(e) => update("title", e.target.value)}
                      />
                    </Field>
                    <div className="form-grid">
                      <Field label="Interval (days)">
                        <input
                          required
                          type="number"
                          min={1}
                          max={3650}
                          value={form.intervalDays}
                          onChange={(e) =>
                            update("intervalDays", Number(e.target.value))
                          }
                        />
                      </Field>
                      <Field label="Next due">
                        <input
                          required
                          type="date"
                          value={form.nextDue}
                          onChange={(e) => update("nextDue", e.target.value)}
                        />
                      </Field>
                    </div>
                    <Field label="Assigned to">{assigneeSelect}</Field>
                    <Field label="Checklist (one step per line)">
                      <textarea
                        rows={4}
                        value={form.checklist.join("\n")}
                        onChange={(e) =>
                          update("checklist", e.target.value.split("\n"))
                        }
                      />
                    </Field>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={form.enabled}
                        onChange={(e) => update("enabled", e.target.checked)}
                      />{" "}
                      Plan enabled
                    </label>
                  </>
                )}
                {modal === "manual" && (
                  <>
                    <Field label="Equipment">{assetSelect}</Field>
                    <Field label="Document title">
                      <input
                        required
                        minLength={2}
                        value={form.title}
                        onChange={(e) => update("title", e.target.value)}
                      />
                    </Field>
                    <Field label="Source text">
                      <textarea
                        required
                        minLength={10}
                        rows={10}
                        value={form.text}
                        onChange={(e) => update("text", e.target.value)}
                      />
                    </Field>
                    <label className="upload-btn">
                      <Upload size={15} /> Load a TXT document
                      <input
                        type="file"
                        accept="text/plain,.txt"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 100000) {
                              setError("Text documents must be under 100 KB");
                              return;
                            }
                            update("text", await file.text());
                            if (!form.title) update("title", file.name);
                          }
                        }}
                      />
                    </label>
                  </>
                )}
                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setModal(null)}
                  >
                    Cancel
                  </button>
                  <button className="btn primary" disabled={busy}>
                    {busy ? "Saving…" : "Save changes"} <Check size={16} />
                  </button>
                </div>
              </fieldset>
            </form>
          )}
          {modal === "order" && selected && (
            <>
              <h3 className="section-label">Evidence & attachments</h3>
              {attachments(selected.id)}
              <h3 className="section-label">Work notes</h3>
              {state.records
                .filter(
                  (r) => r.kind === "comment" && r.data.orderId === selected.id,
                )
                .map((c) => (
                  <div className="comment" key={c.id}>
                    <p>{c.data.text}</p>
                    <small>
                      {c.data.author || "Workspace member"} · {date(c.created)}
                    </small>
                  </div>
                ))}
              {canWrite && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const input = e.currentTarget.elements.namedItem(
                      "comment",
                    ) as HTMLTextAreaElement;
                    const d = await act(
                      "save",
                      {
                        kind: "comment",
                        data: { orderId: selected.id, text: input.value },
                      },
                      "Work note added",
                    );
                    if (d) input.value = "";
                  }}
                >
                  <textarea
                    name="comment"
                    required
                    rows={2}
                    placeholder="Add a work note"
                    aria-label="Work note"
                  />
                  <button className="btn" disabled={busy}>
                    Add note
                  </button>
                </form>
              )}
            </>
          )}
          {modal === "scenario" && (
            <>
              <div className="simulation-label">
                <FlaskConical size={17} /> SIMULATION · Test data only
              </div>
              <p>
                Inject a repeatable condition, inspect the alert, then generate
                a work order. These controls only change simulation signals.
              </p>
              <Field label="Equipment">
                <select
                  value={simAsset}
                  onChange={(e) => {
                    setSimAsset(e.target.value);
                    setPlaying(false);
                  }}
                >
                  <option value="">Choose equipment</option>
                  {assets.map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.data.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="scenario-grid">
                {[
                  ["overheat", "Overheating", "104 °C · threshold 80 °C"],
                  [
                    "vibration",
                    "High vibration",
                    "16 mm/s · threshold 12 mm/s",
                  ],
                  ["disconnect", "Disconnect sensor", "Signal becomes offline"],
                  [
                    "recover",
                    "Recover condition",
                    "Returns to 65% of threshold",
                  ],
                ].map(([key, name, desc]) => (
                  <button
                    key={key}
                    disabled={!simAsset || busy}
                    onClick={() =>
                      act(
                        "scenario",
                        { assetId: simAsset, scenario: key },
                        "Simulation recorded",
                      )
                    }
                  >
                    <Activity size={20} />
                    <strong>{name}</strong>
                    <small>{desc}</small>
                  </button>
                ))}
              </div>
              <button
                className="btn"
                disabled={!simAsset}
                onClick={() => setPlaying(!playing)}
              >
                {playing ? <Pause size={16} /> : <Play size={16} />}{" "}
                {playing ? "Pause playback" : "Play scenario sequence"}
              </button>
              <p className="footnote">
                Playback advances every 6 seconds while this app stays open.
                Recovery does not close repair work. Pause playback before
                making changes to simulation sensors.
              </p>
              <div className="modal-actions">
                <button
                  className="btn primary"
                  disabled={busy}
                  onClick={() => act("generate")}
                >
                  Generate condition work orders
                </button>
              </div>
            </>
          )}
          {modal === "qr" && selected && (
            <EquipmentQR
              url={
                typeof location !== "undefined"
                  ? location.origin +
                    "/?workspace=" +
                    encodeURIComponent(workspace) +
                    "&asset=" +
                    encodeURIComponent(selected.id)
                  : ""
              }
              name={selected.data.name}
              onNotice={setNotice}
            />
          )}
          {modal === "import" && (
            <>
              <p>
                Import readings using the exact columns below. All rows are
                validated before saving; maximum 100 rows. Use existing
                equipment IDs from the asset export.
              </p>
              <code className="code-block">
                assetId,name,unit,limit,value,recorded
              </code>
              <button
                className="text-btn"
                onClick={() =>
                  download(
                    "relayops-readings-template.csv",
                    "assetId,name,unit,limit,value,recorded\n" +
                      (assets[0]?.id || "ASSET_ID") +
                      ",Temperature,°C,80,62," +
                      new Date().toISOString(),
                    "text/csv",
                  )
                }
              >
                Download CSV template <Download size={14} />
              </button>
              <Field label="CSV file">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      if (file.size > 200000)
                        throw new Error("CSV must be under 200 KB");
                      const rows = parseCSV(await file.text());
                      if (rows.length > 101)
                        throw new Error("Maximum 100 readings per import");
                      const headers = rows[0]?.map((x) =>
                        x.replace(/^\uFEFF/, "").trim(),
                      );
                      const required = [
                        "assetId",
                        "name",
                        "unit",
                        "limit",
                        "value",
                        "recorded",
                      ];
                      if (!required.every((k) => headers?.includes(k)))
                        throw new Error("Missing required CSV columns");
                      const data = rows.slice(1).map((r, i) => {
                        const d = Object.fromEntries(
                          headers.map((k, j) => [k, r[j]]),
                        );
                        if (!assets.some((a) => a.id === d.assetId))
                          throw new Error(`Row ${i + 2}: unknown equipment ID`);
                        if (
                          !d.limit?.trim() ||
                          !d.value?.trim() ||
                          !Number.isFinite(Number(d.limit)) ||
                          Number(d.limit) <= 0 ||
                          !Number.isFinite(Number(d.value))
                        )
                          throw new Error(
                            `Row ${i + 2}: invalid numeric reading or limit`,
                          );
                        if (
                          !d.recorded ||
                          !Number.isFinite(Date.parse(d.recorded))
                        )
                          throw new Error(`Row ${i + 2}: invalid timestamp`);
                        return {
                          ...d,
                          limit: Number(d.limit),
                          value: Number(d.value),
                          recorded: new Date(d.recorded).toISOString(),
                          source: "Imported",
                          connected: true,
                        };
                      });
                      setForm({ rows: data });
                      setError("");
                    } catch (e) {
                      setError((e as Error).message);
                      setForm({});
                    }
                  }}
                />
              </Field>
              {form.rows && (
                <>
                  <p>{form.rows.length} rows validated and ready.</p>
                  <button
                    className="btn primary"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const d = await api("import", { rows: form.rows });
                        await load();
                        setNotice(`${d.imported} readings imported`);
                        setModal(null);
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Import {form.rows.length} readings
                  </button>
                </>
              )}
            </>
          )}
          {modal === "invite" && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const d = await act(
                  "invite",
                  { email: form.email, role: form.role },
                  "Invitation created. Copy the code from Team & settings and share it with your teammate.",
                );
                if (d) setModal(null);
              }}
            >
              <Field label="Teammate email">
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                />
              </Field>
              <Field label="Role">
                <select
                  value={form.role}
                  onChange={(e) => update("role", e.target.value)}
                >
                  {[
                    "technician",
                    "viewer",
                    ...(state.member?.role === "owner" ? ["manager"] : []),
                  ].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </Field>
              <p className="footnote">
                The invitation is bound to this email and expires in 7 days.
                This creates a code; no email is sent automatically. The
                teammate also needs access to this private Site.
              </p>
              <button className="btn primary" disabled={busy}>
                Create invitation
              </button>
            </form>
          )}
          {(modal === "newWorkspace" || modal === "join") && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  const d = await api(
                    modal === "join" ? "join" : "createWorkspace",
                    modal === "join"
                      ? { token: form.token }
                      : { name: form.name },
                  );
                  setWorkspace(d.workspace);
                  setModal(null);
                  setNotice("Workspace opened");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Field
                label={modal === "join" ? "Invitation code" : "Workspace name"}
              >
                <input
                  required
                  value={modal === "join" ? form.token : form.name}
                  onChange={(e) =>
                    update(modal === "join" ? "token" : "name", e.target.value)
                  }
                />
              </Field>
              <button className="btn primary" disabled={busy}>
                Continue <ArrowRight size={16} />
              </button>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
function Metric({
  title,
  value,
  note,
  icon,
  tone,
}: {
  title: string;
  value: string | number;
  note: string;
  icon: ReactNode;
  tone: string;
}) {
  return (
    <section className="metric">
      <div className="metric-top">
        <span>{title}</span>
        <span className={"metric-icon " + tone}>{icon}</span>
      </div>
      <strong>{value}</strong>
      <p>
        <span className={"tiny-dot " + tone} />
        {note}
      </p>
    </section>
  );
}
function PanelHead({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel-head">
      <div>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {action}
    </div>
  );
}
function EquipmentQR({
  url,
  name,
  onNotice,
}: {
  url: string;
  name: string;
  onNotice: (s: string) => void;
}) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let alive = true;
    import("qrcode")
      .then((q) =>
        q.toString(url, {
          type: "svg",
          margin: 2,
          width: 240,
          color: { dark: "#123b35", light: "#ffffff" },
        }),
      )
      .then((s) => {
        if (alive) setSvg(s);
      })
      .catch(() =>
        onNotice("QR generation unavailable. Use the equipment link."),
      );
    return () => {
      alive = false;
    };
  }, [url, onNotice]);
  return (
    <div className="qr-panel">
      <h3>{name}</h3>
      {svg && (
        <img
          width={240}
          height={240}
          src={"data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg)}
          alt={"QR code linking to " + name}
        />
      )}
      <p>
        Scan to open this equipment’s history and work orders. Workspace
        membership is required.
      </p>
      <input
        readOnly
        aria-label="Equipment link"
        value={url}
        onFocus={(e) => e.target.select()}
      />
      <button
        className="btn primary"
        onClick={() =>
          navigator.clipboard
            .writeText(url)
            .then(() => onNotice("Equipment link copied"))
            .catch(() => onNotice("Select and copy the equipment link"))
        }
      >
        Copy equipment link
      </button>
      {svg && (
        <button
          className="btn"
          onClick={() => {
            const a = document.createElement("a");
            a.href =
              "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
            a.download = "relayops-equipment-qr.svg";
            a.click();
          }}
        >
          Download QR label
        </button>
      )}
    </div>
  );
}

function OrderTable({
  rows,
  assetName,
  memberName,
  onOpen,
}: {
  rows: Row<Order>[];
  assetName: (id: string) => string;
  memberName: (id: string) => string;
  onOpen: (row: Row<Order>) => void;
}) {
  return rows.length ? (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Work order</th>
            <th>Asset</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Assigned to</th>
            <th>Due date</th>
            <th>
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id}>
              <td>
                <button className="table-link" onClick={() => onOpen(o)}>
                  {o.data.title}
                </button>
                <small>
                  {o.data.source} · {o.id.slice(0, 8).toUpperCase()}
                </small>
              </td>
              <td>{assetName(o.data.assetId)}</td>
              <td>
                <Badge>{o.data.priority}</Badge>
              </td>
              <td>
                <Badge>{o.data.status}</Badge>
              </td>
              <td>
                <span className="person-dot">
                  {memberName(o.data.assignee).slice(0, 1)}
                </span>
                {memberName(o.data.assignee).split("@")[0]}
              </td>
              <td
                className={
                  o.data.due < today() && o.data.status !== "Done"
                    ? "text-red"
                    : ""
                }
              >
                {date(o.data.due)}
              </td>
              <td>
                <button
                  aria-label={"Open " + o.data.title}
                  className="icon-btn"
                  onClick={() => onOpen(o)}
                >
                  <ChevronRight size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty title="No work orders match">
      Try changing your filters or create a work order.
    </Empty>
  );
}
