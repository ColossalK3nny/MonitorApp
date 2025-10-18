import * as React from "react"
import { Card, Flex, Grid, Text, Button, Tabs, Progress } from "@radix-ui/themes"
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts"

type Point = { t: number; cpu: number | null; mem: number | null }

export default function ServerHealthDashboard({
  defaultApiBase = typeof window !== "undefined" ? window.location.origin : "http://localhost:8000",
  pollMs = 2000,
  wsPath = "/ws",
  metricsPath = "/metrics",
  healthPath = "/health",
}: {
  defaultApiBase?: string
  pollMs?: number
  wsPath?: string
  metricsPath?: string
  healthPath?: string
}) {
  const [apiBase, setApiBase] = React.useState(() =>
    (typeof window === "undefined" ? defaultApiBase : (localStorage.getItem("apiBase") || defaultApiBase)).replace(/\/$/, "")
  )
  const [conn, setConn] = React.useState<"connecting" | "ok" | "bad">("connecting")
  const [health, setHealth] = React.useState<"ok" | "unhealthy" | "unknown">("unknown")
  const [snapshot, setSnapshot] = React.useState<any | null>(null)
  const [history, setHistory] = React.useState<Point[]>([])

  const wsRef = React.useRef<WebSocket | null>(null)
  const pollRef = React.useRef<number | null>(null)

  const wsUrl = React.useMemo(() => {
    try { return apiBase.replace(/^http/i, "ws") + wsPath } catch { return "" }
  }, [apiBase, wsPath])

  // ---------- helpers ----------
  const clamp01 = (n: number) => Math.max(0, Math.min(100, n))
  const fmtBytes = (n?: number | null) => {
    if (n == null) return "—"
    const units = ["B", "KB", "MB", "GB", "TB"]
    let i = 0, x = n
    while (x >= 1024 && i < units.length - 1) { x /= 1024; i++ }
    const prec = x < 10 ? 2 : 1
    return `${x.toFixed(prec)} ${units[i]}`
  }
  const fmtPct = (n?: number | null) => (n == null ? "—" : `${Number(n).toFixed(1)}%`)
  const fmtDur = (sec?: number | null) => {
    if (sec == null) return "—"
    const s = Math.floor(sec), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
    return `${d}d ${h}h ${m}m`
  }
  const fmtTs = (ts?: number | string | null) => {
    if (!ts) return "—"
    try { const d = new Date((typeof ts === "number" ? ts * 1000 : Date.parse(ts))); return d.toLocaleString() } catch { return String(ts) }
  }

  // ---------- normalize incoming JSON to a single shape ----------
  function pick(s: any) {
    // CPU: támogatjuk cpu, cpu_percent, cpu_usage
    const cpu = s?.cpu ?? s?.cpu_percent ?? s?.cpu_usage

    // RAM: nálad "ram" alatt jön (total, used, percent)
    const vm = s?.ram ?? s?.memory ?? s?.mem ?? s?.virtual_memory
    const used = vm?.used
    const total = vm?.total
    const memPct = vm?.percent ?? (used && total ? (used / total * 100) : null)

    // Uptime: nálad "uptime_sec"
    const uptime = s?.uptime_sec ?? s?.uptime_seconds ?? s?.uptime ?? null
    const boot = s?.boot_time ?? s?.boot ?? null

    const load = s?.load ?? s?.loadavg ?? s?.load_avg
    const host = s?.host || s?.hostname || s?.node || s?.machine || s?.platform

    return { cpu, used, total, memPct, uptime, boot, load, host }
  }

  // ---------- IO ----------
  const handleSave = (v: string) => {
    const clean = (v || "http://localhost:8000").replace(/\/$/, "")
    setApiBase(clean)
    localStorage.setItem("apiBase", clean)
  }

  const fetchHealth = React.useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}${healthPath}`, { cache: "no-store" })
      const j = await r.json()
      setHealth(j?.status === "ok" ? "ok" : "unhealthy")
    } catch {
      setHealth("unknown")
    }
  }, [apiBase, healthPath])

  const startPolling = React.useCallback(() => {
    if (pollRef.current) window.clearInterval(pollRef.current)
    pollRef.current = window.setInterval(async () => {
      try {
        const r = await fetch(`${apiBase}${metricsPath}`, { cache: "no-store" })
        const j = await r.json()
        setSnapshot(j)
      } catch { /* ignore */ }
    }, pollMs)
  }, [apiBase, metricsPath, pollMs])

  const stopPolling = () => { if (pollRef.current) window.clearInterval(pollRef.current); pollRef.current = null }

  const connectWS = React.useCallback(() => {
    setConn("connecting")
    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws
      ws.onopen = () => { setConn("ok"); stopPolling() }
      ws.onmessage = (ev) => { try { const data = JSON.parse(ev.data); setSnapshot(data) } catch {} }
      ws.onclose = () => { setConn("bad"); startPolling() }
      ws.onerror = () => { setConn("bad"); try { ws.close() } catch {} }
    } catch {
      setConn("bad"); startPolling()
    }
  }, [wsUrl, startPolling])

  // history feed
  React.useEffect(() => {
    if (!snapshot) return
    const { cpu, memPct } = pick(snapshot)
    setHistory(h => [...h, { t: Date.now(), cpu: cpu ?? null, mem: memPct ?? null }].slice(-180))
  }, [snapshot])

  // reconnect on base change
  React.useEffect(() => {
    fetchHealth()
    try { wsRef.current?.close() } catch {}
    stopPolling()
    connectWS()
    return () => { try { wsRef.current?.close() } catch {}; stopPolling() }
  }, [apiBase, connectWS, fetchHealth])

  const { cpu, used, total, memPct, uptime, boot, load, host } = pick(snapshot)

  // ---------- UI ----------
  const ConnBadge = () => (
    <Text size="2" color={conn === "ok" ? "green" : conn === "bad" ? "red" : "amber"}>
      {conn === "ok" ? "Live via WebSocket" : conn === "bad" ? "Disconnected" : "Connecting…"}
    </Text>
  )

  return (
    <Flex direction="column" gap="3">
      {/* Controls */}
      <Card>
        <Flex direction="column" gap="2">
          <Text size="1" color="gray">API Base</Text>
          <Flex gap="2">
            <input
              defaultValue={apiBase}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave((e.target as HTMLInputElement).value) }}
              placeholder="http://localhost:8000"
              style={{ flex: 1 }}
              className="rt-BaseInput" // Radix Themes input base class (opcionális)
            />
            <Button variant="outline" onClick={() => {
              const el = (document.activeElement instanceof HTMLInputElement) ? document.activeElement : null
              handleSave(el?.value || apiBase)
            }}>
              Save
            </Button>
          </Flex>
          <ConnBadge />
        </Flex>
      </Card>

      {/* Stats row */}
      <Grid columns={{ initial: "1", md: "3" }} gap="3">
        <Card>
          <Flex direction="column" gap="2">
            <Text size="1" color="gray">Health</Text>
            <Text size="6" weight="bold">
              {health === "ok" ? "OK" : health === "unhealthy" ? "Error" : "—"}
            </Text>
          </Flex>
        </Card>

        <Card>
          <Flex direction="column" gap="2">
            <Text size="1" color="gray">Uptime</Text>
            <Text size="6" weight="bold">{fmtDur(uptime)}</Text>
          </Flex>
        </Card>

        <Card>
          <Flex direction="column" gap="2">
            <Text size="1" color="gray">Load Avg</Text>
            <Text size="6" weight="bold">
              {Array.isArray(load) ? load.map((v: any) => Number(v).toFixed(2)).join(" / ")
                : (load && typeof load === "object" && ("1" in load || "1m" in load))
                  ? [load["1"] || load["1m"], load["5"] || load["5m"], load["15"] || load["15m"]]
                      .map((x: any) => Number(x || 0).toFixed(2)).join(" / ")
                  : (typeof load === "string" ? load : "—")}
            </Text>
            <Text size="1" color="gray">(1m / 5m / 15m)</Text>
          </Flex>
        </Card>
      </Grid>

      {/* CPU / Memory bars */}
      <Grid columns={{ initial: "1", md: "2" }} gap="3">
        <Card>
          <Flex direction="column" gap="2">
            <Flex justify="between" align="center">
              <Text size="1" color="gray">CPU</Text>
              <Text size="1" color="gray" style={{ fontFamily: "ui-monospace" }}>{fmtPct(cpu)}</Text>
            </Flex>
            <Progress value={typeof cpu === "number" ? clamp01(cpu) : 0} />
          </Flex>
        </Card>

        <Card>
          <Flex direction="column" gap="2">
            <Flex justify="between" align="center">
              <Text size="1" color="gray">Memory</Text>
              <Text size="1" color="gray" style={{ fontFamily: "ui-monospace" }}>
                {used != null && total != null ? `${fmtBytes(used)} / ${fmtBytes(total)} (${fmtPct(memPct)})` : "—"}
              </Text>
            </Flex>
            <Progress value={typeof memPct === "number" ? clamp01(memPct) : 0} />
          </Flex>
        </Card>
      </Grid>

      {/* Charts */}
      <Grid columns={{ initial: "1", md: "2" }} gap="3">
        <Card>
          <Text size="1" color="gray">CPU % (last minutes)</Text>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="t" tickFormatter={(v) => new Date(v).toLocaleTimeString()} minTickGap={32} />
                <YAxis domain={[0, 100]} />
                <Tooltip labelFormatter={(v) => new Date(v).toLocaleTimeString()} formatter={(v: any) => [`${Number(v).toFixed(1)}%`, "CPU"]} />
                <Legend />
                <Area type="monotone" dataKey="cpu" name="CPU" stroke="#8E4EC6" fill="#5cc64eff" fillOpacity={0.15} isAnimationActive={false} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <Text size="1" color="gray">Memory % (last minutes)</Text>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="t" tickFormatter={(v) => new Date(v).toLocaleTimeString()} minTickGap={32} />
                <YAxis domain={[0, 100]} />
                <Tooltip labelFormatter={(v) => new Date(v).toLocaleTimeString()} formatter={(v: any) => [`${Number(v).toFixed(1)}%`, "Memory"]} />
                <Legend />
                <Area type="monotone" dataKey="mem" name="Memory" stroke="#8E4EC6" fill="#5cc64eff" fillOpacity={0.15} isAnimationActive={false} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </Grid>

      {/* Snapshot */}
      <Card>
        <Tabs.Root defaultValue="overview">
          <Tabs.List>
            <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
            <Tabs.Trigger value="raw">Raw JSON</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="overview">
            <Grid columns={{ initial: "1", md: "2" }} gap="2">
              {snapshot ? (
                Object.entries(snapshot)
                  .filter(([k]) =>
                    ["cpu_percent", "ram", "uptime_sec", "load", "host", "hostname", "platform", "boot_time", "boot"].includes(k)
                  )
                  .map(([k, v]) => (
                    <Card key={k} variant="surface">
                      <Flex justify="between" align="center">
                        <Text color="gray" size="1">{k}</Text>
                        <Text size="2" style={{ fontFamily: "ui-monospace" }}>
                          {typeof v === "object" ? JSON.stringify(v) : String(v)}
                        </Text>
                      </Flex>
                    </Card>
                  ))
              ) : (
                <Text color="gray">No data yet…</Text>
              )}
            </Grid>
          </Tabs.Content>
          <Tabs.Content value="raw">
            <pre style={{ maxHeight: 320, overflow: "auto", fontSize: 12 }}>
              {snapshot ? JSON.stringify(snapshot, null, 2) : "—"}
            </pre>
          </Tabs.Content>
        </Tabs.Root>
      </Card>

      <Text size="1" color="gray">Host: {host ? String(host) : "—"}</Text>
    </Flex>
  )
}
