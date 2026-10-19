import { useCallback, useEffect, useMemo, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from "wagmi";
import { formatUnits, isAddress, parseUnits, zeroAddress } from "viem";
import { escrowAbi } from "./abi";
import {
  BTC_FAUCET,
  DEPLOY_BLOCK,
  ESCROW_ADDRESS,
  EXPLORER,
  GIG_STATUS,
  MS_STATUS,
  MUSD_ADDRESS,
  MUSD_HOWTO,
  REVIEW_PERIOD_SECONDS_FALLBACK,
} from "./config";

type Hex = `0x${string}`;

type GigRow = {
  id: bigint;
  client: Hex;
  freelancer: Hex;
  arbiter: Hex;
  total: bigint;
  milestoneCount: bigint;
};

type GigInfo = {
  client: Hex;
  freelancer: Hex;
  arbiter: Hex;
  createdAt: bigint;
  funded: bigint;
  paidOut: bigint;
  refunded: bigint;
  status: number;
  cancelProposer: Hex;
  metadataURI: string;
  milestoneCount: bigint;
};

type MsInfo = {
  amount: bigint;
  deadline: bigint;
  submittedAt: bigint;
  status: number;
  proofURI: string;
};

const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
const fmt = (v: bigint) => formatUnits(v, 18);
const fmtNum = (v: bigint) => {
  const s = Number(formatUnits(v, 18));
  return s.toLocaleString(undefined, { maximumFractionDigits: 2 });
};
const dt = (ts: bigint) => (ts === 0n ? "—" : new Date(Number(ts) * 1000).toLocaleString());
const nowSec = () => BigInt(Math.floor(Date.now() / 1000));
const inputToTs = (value: string) => BigInt(Math.floor(new Date(value).getTime() / 1000));

function Pill({ value, labels }: { value: number; labels: readonly string[] }) {
  const label = labels[value] ?? String(value);
  return <span className={`pill ${label}`}>{label}</span>;
}

export default function App() {
  const { address, isConnected, chain } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [tab, setTab] = useState<"create" | "gigs" | "help">("gigs");
  const [rows, setRows] = useState<GigRow[]>([]);
  const [selected, setSelected] = useState<bigint | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<Hex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [roleFilter, setRoleFilter] = useState<"all" | "client" | "freelancer">("all");

  const send = useCallback(
    async (functionName: string, args: unknown[], label: string) => {
      setError(null);
      setBusy(label);
      try {
        const hash = await writeContractAsync({
          address: ESCROW_ADDRESS as Hex,
          abi: escrowAbi as any,
          functionName,
          args,
        } as any);
        setLastTx(hash);
        await publicClient!.waitForTransactionReceipt({ hash });
        setRefreshKey((k) => k + 1);
        return hash;
      } catch (e: any) {
        setError(e?.shortMessage || e?.message || String(e));
        return null;
      } finally {
        setBusy(null);
      }
    },
    [publicClient, writeContractAsync]
  );

  // MUSD balance + allowance
  const { data: musdBalance, refetch: refetchBalance } = useReadContract({
    address: MUSD_ADDRESS,
    abi: [
      { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
    ],
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  } as any);

  const { data: allowance } = useReadContract({
    address: MUSD_ADDRESS,
    abi: [
      { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ type: "uint256" }] },
    ],
    functionName: "allowance",
    args: address ? [address, ESCROW_ADDRESS] : undefined,
    query: { enabled: Boolean(address) },
  } as any);

  // Load gigs from events
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!publicClient || !ESCROW_ADDRESS || ESCROW_ADDRESS === zeroAddress) return;
      try {
        const logs = await publicClient.getContractEvents({
          address: ESCROW_ADDRESS as Hex,
          abi: escrowAbi as any,
          eventName: "GigCreated",
          fromBlock: DEPLOY_BLOCK,
        } as any);
        if (cancelled) return;
        setRows(
          logs.map((l: any) => ({
            id: l.args.gigId as bigint,
            client: l.args.client as Hex,
            freelancer: l.args.freelancer as Hex,
            arbiter: l.args.arbiter as Hex,
            total: l.args.totalAmount as bigint,
            milestoneCount: l.args.milestoneCount as bigint,
          }))
        );
      } catch (e: any) {
        setError(`Could not read gig events: ${e?.shortMessage || e?.message}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicClient, refreshKey]);

  // Deep link ?gig=1
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("gig");
    if (p) {
      setSelected(BigInt(p));
      setTab("gigs");
    }
  }, []);

  const visibleRows = useMemo(() => {
    if (!address) return rows;
    const lower = address.toLowerCase();
    return rows.filter((r) => {
      if (roleFilter === "client") return r.client.toLowerCase() === lower;
      if (roleFilter === "freelancer") return r.freelancer.toLowerCase() === lower;
      return true;
    });
  }, [rows, roleFilter, address]);

  const copyInvite = async (id: bigint) => {
    const url = `${window.location.origin}${window.location.pathname}?gig=${id}`;
    await navigator.clipboard.writeText(url);
    setError(null);
    alert(`Invite link copied:\n${url}`);
  };

  return (
    <div className="wrap">
      <div className="topbar">
        <div className="brand">
          <span className="dot" /> MezoGig
          <span className="muted small" style={{ fontWeight: 400, marginLeft: 6 }}>
            milestone escrow · MUSD on Mezo
          </span>
        </div>
        <div className="topbar-right">
          {isConnected && (
            <span className="small muted">
              MUSD: <b className="mono">{musdBalance !== undefined ? fmtNum(musdBalance as bigint) : "…"}</b>
            </span>
          )}
          <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
        </div>
      </div>

      {chain && chain.id !== 31611 && (
        <div className="notice">
          Wrong network. Switch your wallet to <b>Mezo Testnet</b> (chainId 31611) via the connect menu.
        </div>
      )}
      {ESCROW_ADDRESS === zeroAddress && (
        <div className="notice">
          Contract not configured: set <span className="mono">VITE_ESCROW_ADDRESS</span> in <span className="mono">frontend/.env</span> and rebuild.
        </div>
      )}
      {error && <div className="card error small">{error}</div>}

      <div className="tabs">
        <button className={`tab ${tab === "gigs" ? "active" : ""}`} onClick={() => setTab("gigs")}>
          My gigs
        </button>
        <button className={`tab ${tab === "create" ? "active" : ""}`} onClick={() => setTab("create")}>
          Create gig
        </button>
        <button className={`tab ${tab === "help" ? "active" : ""}`} onClick={() => setTab("help")}>
          How to test in 5 min
        </button>
      </div>

      {tab === "help" && <HelpTab />}

      {tab === "create" && (
        <CreateTab
          connected={isConnected}
          address={address}
          allowance={allowance as bigint | undefined}
          musdBalance={musdBalance as bigint | undefined}
          onApprove={async () => {
            const hash = await send("approve", [MUSD_ADDRESS, 2n ** 255n], "approving MUSD");
            if (hash) refetchBalance();
          }}
          onCreate={async (args, total) => {
            const hash = await send(
              "createGig",
              [args.freelancer, args.amounts, args.deadlines, args.arbiter, args.metadataURI],
              "creating gig"
            );
            if (hash) {
              setTab("gigs");
              setRefreshKey((k) => k + 1);
            }
            return hash;
          }}
        />
      )}

      {tab === "gigs" && (
        <>
          <div className="card">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <h2>Gigs</h2>
              <div className="row" style={{ gap: 6 }}>
                {(["all", "client", "freelancer"] as const).map((r) => (
                  <button
                    key={r}
                    className={`tab ${roleFilter === r ? "active" : ""}`}
                    onClick={() => setRoleFilter(r)}
                    style={{ padding: "6px 12px" }}
                  >
                    {r}
                  </button>
                ))}
                <button className="secondary" onClick={() => setRefreshKey((k) => k + 1)}>
                  ↻
                </button>
              </div>
            </div>
            <p className="muted small">
              Loaded from <span className="mono">GigCreated</span> events. {isConnected ? "" : "Connect a wallet to see your role buttons."}
            </p>
            {visibleRows.length === 0 && <p className="muted">No gigs yet — create one, or open an invite link.</p>}
            {visibleRows.map((r) => (
              <div key={r.id.toString()} className="kv" style={{ cursor: "pointer" }} onClick={() => setSelected(r.id)}>
                <span>
                  <b>#{r.id.toString()}</b> · client <span className="mono">{short(r.client)}</span> · freelancer{" "}
                  <span className="mono">{short(r.freelancer)}</span>
                </span>
                <span className="muted small">
                  {fmtNum(r.total)} MUSD · {r.milestoneCount.toString()} milestones
                </span>
              </div>
            ))}
          </div>

          {selected !== null && (
            <GigDetail
              gigId={selected}
              address={address}
              onClose={() => setSelected(null)}
              onCopyInvite={copyInvite}
              send={send}
              publicClient={publicClient}
              refreshKey={refreshKey}
              busy={busy}
            />
          )}
        </>
      )}

      <div className="footer">
        MezoGig · escrow contract <a href={`${EXPLORER}/address/${ESCROW_ADDRESS}`} target="_blank" rel="noreferrer">{short(ESCROW_ADDRESS)}</a> ·{" "}
        <a href={BTC_FAUCET} target="_blank" rel="noreferrer">testnet BTC faucet</a> ·{" "}
        <a href={MUSD_HOWTO} target="_blank" rel="noreferrer">how to get testnet MUSD</a>
        {lastTx && (
          <>
            {" · last tx "}
            <a href={`${EXPLORER}/tx/${lastTx}`} target="_blank" rel="noreferrer">
              {short(lastTx)}
            </a>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function HelpTab() {
  return (
    <div className="card">
      <h2>Test the whole flow in ~5 minutes</h2>
      <ol className="small" style={{ lineHeight: 1.9 }}>
        <li>
          Add <b>Mezo Testnet</b> to your wallet: RPC <span className="mono">https://rpc.test.mezo.org</span>, chainId{" "}
          <span className="mono">31611</span>, explorer <span className="mono">https://explorer.test.mezo.org</span>.
        </li>
        <li>
          Get test BTC from the <a href={BTC_FAUCET} target="_blank" rel="noreferrer">faucet</a>.
        </li>
        <li>
          Get test MUSD at <a href={MUSD_HOWTO} target="_blank" rel="noreferrer">testnet.mezo.org</a> (borrow MUSD against
          test BTC, minimum 2000 MUSD debt).
        </li>
        <li>Create a gig: pick a freelancer address (a second wallet, or a teammate), split the work into 2–3 milestones, set short deadlines.</li>
        <li>
          As the freelancer: press <b>Submit</b> with any proof link. As the client: press <b>Approve</b> — MUSD moves to the
          freelancer instantly.
        </li>
        <li>
          Try the trustless paths: submit and wait out the (short) review period, then <b>Claim</b>; or let a deadline pass and
          use <b>Refund</b>; or open a <b>Dispute</b> and have the arbiter split it.
        </li>
      </ol>
      <div className="notice small">
        This demo deployment uses a short review period ({REVIEW_PERIOD_SECONDS_FALLBACK}s) so the auto-claim can be tested
        quickly. Nothing here touches mainnet or real money.
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function CreateTab(props: {
  connected: boolean;
  address?: Hex;
  allowance?: bigint;
  musdBalance?: bigint;
  onApprove: () => Promise<void>;
  onCreate: (
    args: { freelancer: Hex; amounts: bigint[]; deadlines: bigint[]; arbiter: Hex; metadataURI: string },
    total: bigint
  ) => Promise<Hex | null>;
}) {
  const [freelancer, setFreelancer] = useState("");
  const [arbiter, setArbiter] = useState("");
  const [metadataURI, setMetadataURI] = useState("ipfs://gig-brief");
  const [milestones, setMilestones] = useState<{ amount: string; deadline: string }[]>([
    { amount: "100", deadline: defaultDeadline(3) },
    { amount: "150", deadline: defaultDeadline(7) },
  ]);
  const [creating, setCreating] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const amounts = milestones.map((m) => {
    try {
      return m.amount ? parseUnits(m.amount, 18) : 0n;
    } catch {
      return 0n;
    }
  });
  const total = amounts.reduce((a, b) => a + b, 0n);
  const needsApproval = (props.allowance ?? 0n) < total;
  const clientOk = props.connected && Boolean(props.address);
  const freelancerOk = isAddress(freelancer);
  const arbiterOk = arbiter === "" || isAddress(arbiter);
  const valid =
    clientOk &&
    freelancerOk &&
    arbiterOk &&
    milestones.length > 0 &&
    milestones.every((m, i) => amounts[i] > 0n && m.deadline && inputToTs(m.deadline) > nowSec()) &&
    (props.musdBalance ?? 0n) >= total;

  const update = (i: number, patch: Partial<{ amount: string; deadline: string }>) =>
    setMilestones((ms) => ms.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));

  const submit = async () => {
    setLocalError(null);
    setCreating(true);
    try {
      const hash = await props.onCreate(
        {
          freelancer: freelancer as Hex,
          amounts,
          deadlines: milestones.map((m) => inputToTs(m.deadline)),
          arbiter: (arbiter || zeroAddress) as Hex,
          metadataURI,
        },
        total
      );
      if (hash) {
        setMilestones([
          { amount: "100", deadline: defaultDeadline(3) },
          { amount: "150", deadline: defaultDeadline(7) },
        ]);
      }
    } catch (e: any) {
      setLocalError(e?.message || String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="card">
      <h2>Create a gig</h2>
      <p className="muted small">
        You deposit the full amount up-front; the contract holds it until each milestone is approved, claimed or refunded.
      </p>

      <div className="row">
        <div className="field">
          <label>Freelancer address</label>
          <input value={freelancer} onChange={(e) => setFreelancer(e.target.value.trim())} placeholder="0x…" />
        </div>
        <div className="field">
          <label>Arbiter (optional, 0x0 = no disputes)</label>
          <input value={arbiter} onChange={(e) => setArbiter(e.target.value.trim())} placeholder="0x…" />
        </div>
      </div>
      <div className="field" style={{ marginTop: 10 }}>
        <label>Gig brief URI</label>
        <input value={metadataURI} onChange={(e) => setMetadataURI(e.target.value)} placeholder="ipfs://… or https://…" />
      </div>

      <h3 style={{ marginBottom: 6 }}>Milestones</h3>
      {milestones.map((m, i) => (
        <div className="row" key={i} style={{ marginBottom: 8 }}>
          <div className="field">
            <label>Amount (MUSD)</label>
            <input value={m.amount} onChange={(e) => update(i, { amount: e.target.value })} placeholder="100" />
          </div>
          <div className="field">
            <label>Deadline</label>
            <input
              type="datetime-local"
              value={m.deadline}
              onChange={(e) => update(i, { deadline: e.target.value })}
            />
          </div>
          <button
            className="secondary"
            disabled={milestones.length === 1}
            onClick={() => setMilestones((ms) => ms.filter((_, idx) => idx !== i))}
          >
            remove
          </button>
        </div>
      ))}
      <button className="secondary" onClick={() => setMilestones((ms) => [...ms, { amount: "100", deadline: defaultDeadline(10) }])}>
        + add milestone
      </button>

      <div className="kv" style={{ marginTop: 14 }}>
        <span>Total deposit</span>
        <b className="mono">{fmtNum(total)} MUSD</b>
      </div>
      <div className="kv">
        <span>Your MUSD balance</span>
        <b className="mono">{props.musdBalance !== undefined ? fmtNum(props.musdBalance) : "—"}</b>
      </div>

      {!freelancerOk && freelancer !== "" && <p className="error small">Freelancer address looks invalid.</p>}
      {!arbiterOk && <p className="error small">Arbiter address looks invalid.</p>}
      {props.musdBalance !== undefined && props.musdBalance < total && (
        <p className="error small">
          Not enough MUSD. Get testnet MUSD at <a href={MUSD_HOWTO} target="_blank" rel="noreferrer">{MUSD_HOWTO}</a>.
        </p>
      )}
      {localError && <p className="error small">{localError}</p>}

      <div className="actions">
        {needsApproval && (
          <button className="warn" disabled={!clientOk || total === 0n || creating} onClick={() => props.onApprove()}>
            {creating ? "Approving…" : "1) Approve MUSD"}
          </button>
        )}
        <button disabled={!valid || creating || (needsApproval && true)} onClick={submit}>
          {creating ? "Creating…" : needsApproval ? "2) Create gig" : "Create gig"}
        </button>
      </div>
      {!props.connected && <p className="muted small">Connect a wallet to create a gig.</p>}
    </div>
  );
}

function defaultDeadline(daysFromNow: number) {
  const d = new Date(Date.now() + daysFromNow * 24 * 3600 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ------------------------------------------------------------------ */

function GigDetail(props: {
  gigId: bigint;
  address?: Hex;
  onClose: () => void;
  onCopyInvite: (id: bigint) => void;
  send: (functionName: string, args: unknown[], label: string) => Promise<Hex | null>;
  publicClient: any;
  refreshKey: number;
  busy: string | null;
}) {
  const { gigId, address, send } = props;
  const [gig, setGig] = useState<GigInfo | null>(null);
  const [ms, setMs] = useState<MsInfo[]>([]);
  const [proof, setProof] = useState<Record<number, string>>({});
  const [bps, setBps] = useState<Record<number, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(async () => {
    if (!props.publicClient) return;
    try {
      const g: any = await props.publicClient.readContract({
        address: ESCROW_ADDRESS,
        abi: escrowAbi as any,
        functionName: "getGig",
        args: [gigId],
      });
      setGig({
        client: g[0],
        freelancer: g[1],
        arbiter: g[2],
        createdAt: g[3],
        funded: g[4],
        paidOut: g[5],
        refunded: g[6],
        status: Number(g[7]),
        cancelProposer: g[8],
        metadataURI: g[9],
        milestoneCount: g[10],
      });
      const list: MsInfo[] = [];
      for (let i = 0; i < Number(g[10]); i++) {
        const m: any = await props.publicClient.readContract({
          address: ESCROW_ADDRESS,
          abi: escrowAbi as any,
          functionName: "getMilestone",
          args: [gigId, BigInt(i)],
        });
        list.push({
          amount: m[0],
          deadline: m[1],
          submittedAt: m[2],
          status: Number(m[3]),
          proofURI: m[4],
        });
      }
      setMs(list);
    } catch (e: any) {
      setErr(e?.shortMessage || e?.message || String(e));
    }
  }, [props.publicClient, gigId]);

  useEffect(() => {
    reload();
  }, [reload, props.refreshKey]);

  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 5000);
    return () => clearInterval(t);
  }, []);

  const role = !address || !gig ? "observer" : address.toLowerCase() === gig.client.toLowerCase() ? "client" : address.toLowerCase() === gig.freelancer.toLowerCase() ? "freelancer" : address.toLowerCase() === gig.arbiter.toLowerCase() ? "arbiter" : "observer";

  const act = async (fn: string, args: unknown[], label: string) => {
    setErr(null);
    const hash = await send(fn, args, label);
    if (hash) await reload();
  };

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2>
          Gig #{gigId.toString()} {gig && <Pill value={gig.status} labels={GIG_STATUS} />}
        </h2>
        <div className="row" style={{ gap: 8 }}>
          <button className="secondary" onClick={() => props.onCopyInvite(gigId)}>
            Copy invite link
          </button>
          <button className="secondary" onClick={props.onClose}>
            close
          </button>
        </div>
      </div>

      {!gig && <p className="muted">Loading…</p>}
      {gig && (
        <>
          <div className="grid">
            <div>
              <div className="kv"><span>Client</span><span className="mono">{short(gig.client)}</span></div>
              <div className="kv"><span>Freelancer</span><span className="mono">{short(gig.freelancer)}</span></div>
              <div className="kv"><span>Arbiter</span><span className="mono">{gig.arbiter === zeroAddress ? "none" : short(gig.arbiter)}</span></div>
            </div>
            <div>
              <div className="kv"><span>Funded</span><span className="mono">{fmtNum(gig.funded)} MUSD</span></div>
              <div className="kv"><span>Paid / refunded</span><span className="mono">{fmtNum(gig.paidOut)} / {fmtNum(gig.refunded)}</span></div>
              <div className="kv"><span>Your role</span><b>{role}</b></div>
            </div>
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>
            Brief: <span className="mono">{gig.metadataURI || "—"}</span>
          </p>

          <h3 style={{ marginTop: 16 }}>Milestones</h3>
          {ms.map((m, i) => {
            const now = nowSec();
            const claimable = m.status === 1 && m.submittedAt > 0n && now >= m.submittedAt + BigInt(REVIEW_PERIOD_SECONDS_FALLBACK);
            const expired = m.status === 0 && now > m.deadline;
            return (
              <div className="milestone" key={i}>
                <div className="milestone-head">
                  <b>
                    #{i + 1} · {fmtNum(m.amount)} MUSD
                  </b>
                  <Pill value={m.status} labels={MS_STATUS} />
                </div>
                <div className="small muted">
                  deadline {dt(m.deadline)} · submitted {dt(m.submittedAt)}
                  {m.proofURI ? <> · proof <span className="mono">{m.proofURI}</span></> : null}
                </div>

                <div className="actions">
                  {role === "freelancer" && m.status === 0 && (
                    <>
                      <input
                        style={{ flex: "1 1 220px" }}
                        placeholder="proof link (ipfs://… or https://…)"
                        value={proof[i] ?? ""}
                        onChange={(e) => setProof((p) => ({ ...p, [i]: e.target.value }))}
                      />
                      <button disabled={!proof[i] || props.busy !== null} onClick={() => act("submitMilestone", [gigId, BigInt(i), proof[i] ?? ""], "submitting")}>
                        Submit
                      </button>
                    </>
                  )}
                  {role === "client" && m.status === 1 && (
                    <button disabled={props.busy !== null} onClick={() => act("approveMilestone", [gigId, BigInt(i)], "approving")}>
                      Approve &amp; pay
                    </button>
                  )}
                  {role === "freelancer" && m.status === 1 && (
                    <button
                      className={claimable ? "" : "secondary"}
                      disabled={!claimable || props.busy !== null}
                      onClick={() => act("claimMilestone", [gigId, BigInt(i)], "claiming")}
                      title={claimable ? "Review period elapsed" : "Available after the review period"}
                    >
                      {claimable ? "Claim (review passed)" : "Claim after review"}
                    </button>
                  )}
                  {role === "client" && expired && (
                    <button className="danger" disabled={props.busy !== null} onClick={() => act("refundExpired", [gigId, BigInt(i)], "refunding")}>
                      Refund (deadline passed)
                    </button>
                  )}
                  {(role === "client" || role === "freelancer") && (m.status === 0 || m.status === 1) && gig.arbiter !== zeroAddress && (
                    <button className="warn" disabled={props.busy !== null} onClick={() => act("openDispute", [gigId, BigInt(i)], "opening dispute")}>
                      Open dispute
                    </button>
                  )}
                  {role === "arbiter" && m.status === 4 && (
                    <>
                      <input
                        style={{ width: 110 }}
                        placeholder="bps to freelancer"
                        value={bps[i] ?? "5000"}
                        onChange={(e) => setBps((p) => ({ ...p, [i]: e.target.value }))}
                      />
                      <button
                        disabled={props.busy !== null}
                        onClick={() => act("resolveDispute", [gigId, BigInt(i), BigInt(bps[i] ?? "5000")], "resolving")}
                      >
                        Resolve split
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {(role === "client" || role === "freelancer") && (
            <>
              <h3 style={{ marginTop: 16 }}>Mutual cancellation</h3>
              <div className="small muted">
                {gig.cancelProposer === zeroAddress
                  ? "No cancellation proposed. Propose one when nothing is submitted or disputed."
                  : `Proposed by ${short(gig.cancelProposer)}${gig.cancelProposer.toLowerCase() === (address ?? "").toLowerCase() ? " (you)" : ""}.`}
              </div>
              <div className="actions">
                {gig.cancelProposer === zeroAddress && (
                  <button className="secondary" disabled={props.busy !== null} onClick={() => act("proposeCancel", [gigId], "proposing cancel")}>
                    Propose cancel
                  </button>
                )}
                {gig.cancelProposer !== zeroAddress && gig.cancelProposer.toLowerCase() !== (address ?? "").toLowerCase() && (
                  <button className="danger" disabled={props.busy !== null} onClick={() => act("confirmCancel", [gigId], "confirming cancel")}>
                    Accept cancel &amp; refund
                  </button>
                )}
                {gig.cancelProposer !== zeroAddress && gig.cancelProposer.toLowerCase() === (address ?? "").toLowerCase() && (
                  <button className="secondary" disabled={props.busy !== null} onClick={() => act("revokeCancel", [gigId], "revoking cancel")}>
                    Revoke proposal
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}
      {err && <p className="error small">{err}</p>}
    </div>
  );
}
