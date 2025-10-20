import { useEffect, useMemo, useRef, useState } from "react";

/** ========= KONFIG ========= */
const API_BASE = import.meta.env.VITE_APPS_SCRIPT_URL || "";

/** ========= TYPY ========= */
type Detail = { kod: string; nazev?: string; majitel?: string; delka?: string; uzly?: string };
type HistoryRow = { datum?: string; typ?: string; napeti?: string };
type RacketItem = { kod: string; nazev?: string };
type StringItem = { kod: string; nazev?: string; mnozstvi: number };
type ByMonth = { month: string; count: number };
type Stats = { total: number; commonString: string; commonTension: string; byMonth: ByMonth[] };
type Tournament = "RG" | "WIM" | "AO";

/** ========= TÉMATA ========= */
function getTheme(t: Tournament) {
  switch (t) {
    case "WIM":
      return {
        name: "Wimbledon",
        primary: "#1b5e20",
        bg: "#f1f8f4",
        text: "#102610",
        card: "#ffffff",
        accent: "#c8e6c9",
        shadow: "rgba(27,94,32,0.25)",
        button: "#1b5e20",
        buttonText: "#ffffff",
      };
    case "AO":
      return {
        name: "Australian Open",
        primary: "#1565c0",
        bg: "#e3f2fd",
        text: "#0d2c53",
        card: "#ffffff",
        accent: "#bbdefb",
        shadow: "rgba(21,101,192,0.25)",
        button: "#1565c0",
        buttonText: "#ffffff",
      };
    default: // RG
      return {
        name: "Roland Garros",
        primary: "#c1440e",
        bg: "#fff7f3",
        text: "#2b1a12",
        card: "#ffffff",
        accent: "#ffd2b3",
        shadow: "rgba(255,122,26,0.25)",
        button: "#ff7a1a",
        buttonText: "#ffffff",
      };
  }
}

/** ========= HLAVNÍ APP ========= */
export default function App() {
  // obrazovky
  const [screen, setScreen] = useState<"home" | "detail" | "settings" | "owner" | "strings" | "pricing" | "stats">("home");

  // motiv
  const [tournament, setTournament] = useState<Tournament>("RG");
  useEffect(() => {
    const saved = localStorage.getItem("gj.tournament");
    if (saved === "RG" || saved === "WIM" || saved === "AO") setTournament(saved);
  }, []);
  const theme = useMemo(() => getTheme(tournament), [tournament]);

  // data
  const [kod, setKod] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const ownerName = detail?.majitel?.trim() || "";

  // menu
  const [menuOpen, setMenuOpen] = useState(false);

  // QR scanner
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const detectTimer = useRef<number | null>(null);
  const [scannerSupported, setScannerSupported] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  // kamery & zoom
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceIndex, setDeviceIndex] = useState(0);
  const [zoomInfo, setZoomInfo] = useState<{ min: number; max: number; step: number; value: number } | null>(null);

  // image fallback input
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const anyWin = window as any;
    setScannerSupported(!!anyWin.BarcodeDetector);
    return () => stopScanner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** --- pomocné pro kamery/zoom --- */
  async function listVideoInputs() {
    const all = await navigator.mediaDevices.enumerateDevices();
    const vids = all.filter((d) => d.kind === "videoinput");
    const sorted = [...vids].sort((a, b) => {
      const S = (d: MediaDeviceInfo) => {
        const l = (d.label || "").toLowerCase();
        if (l.includes("tele")) return 0;
        if (l.includes("back")) return 1;
        if (l.includes("rear")) return 2;
        return 3;
      };
      return S(a) - S(b);
    });
    setDevices(sorted);
    if (sorted.length && deviceIndex >= sorted.length) setDeviceIndex(0);
    return sorted;
  }
  function applyInitialZoom(track: MediaStreamTrack) {
    const caps: any = track.getCapabilities?.();
    const settings: any = track.getSettings?.();
    if (!caps || !("zoom" in caps)) {
      setZoomInfo(null);
      return;
    }
    const min = caps.zoom.min ?? 1;
    const max = caps.zoom.max ?? 1;
    const step = caps.zoom.step ?? 0.1;
    const target = Math.min(max, Math.max(min, settings?.zoom ? settings.zoom : Math.min(2, max)));
    track.applyConstraints({ advanced: [{ zoom: target }] } as any).catch(() => {});
    setZoomInfo({ min, max, step, value: target });
  }
  async function nudgeZoom(delta: number) {
    if (!trackRef.current || !zoomInfo) return;
    const next = Math.min(zoomInfo.max, Math.max(zoomInfo.min, +(zoomInfo.value + delta).toFixed(2)));
    try {
      await trackRef.current.applyConstraints({ advanced: [{ zoom: next }] } as any);
      setZoomInfo((prev) => (prev ? { ...prev, value: next } : prev));
    } catch {}
  }

  /** --- spuštění / ukončení skeneru --- */
  async function startScanner() {
    try {
      setScannerOpen(true);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await new Promise((r) => setTimeout(r, 20));

      if (!("mediaDevices" in navigator)) throw new Error("Kamera není dostupná v tomto prohlížeči.");

      const list = await listVideoInputs();
      const pick = list[deviceIndex];

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: pick?.deviceId ? { exact: pick.deviceId } : undefined,
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
          advanced: [{ focusMode: "continuous" as any }],
        },
        audio: false,
      });

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("Video element nenalezen.");
      video.srcObject = stream;
      await video.play();

      const track = stream.getVideoTracks()[0];
      trackRef.current = track;
      applyInitialZoom(track);

      const anyWin = window as any;
      const detector: any = anyWin.BarcodeDetector ? new anyWin.BarcodeDetector({ formats: ["qr_code"] }) : null;
      if (!detector) throw new Error("QR skener není v tomto prohlížeči podporován.");

      const tick = async () => {
        if (!videoRef.current || !scannerOpen) return;
        try {
          const codes = await detector.detect(video);
          if (codes && codes.length > 0) {
            const value = (codes[0].rawValue || "").trim();
            if (value) {
              await onCodeScanned(value);
              return;
            }
          }
        } catch {}
        detectTimer.current = window.setTimeout(tick, 180);
      };
      tick();
    } catch (e: any) {
      setErr(e?.message || String(e));
      stopScanner();
    }
  }
  function stopScanner() {
    if (detectTimer.current) {
      clearTimeout(detectTimer.current);
      detectTimer.current = null;
    }
    if (videoRef.current) {
      try {
        videoRef.current.pause();
      } catch {}
      videoRef.current.srcObject = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    trackRef.current = null;
    setZoomInfo(null);
    setScannerOpen(false);
  }

  /** --- po naskenování --- */
  async function onCodeScanned(value: string) {
    stopScanner();
    await loadByKod(value);
  }

  /** --- fallback: vyfotit / vybrat obrázek s QR a detekovat --- */
  async function detectFromFile(file: File) {
    const anyWin = window as any;
    if (!anyWin.BarcodeDetector) {
      setErr("Tento prohlížeč nepodporuje BarcodeDetector — použij živé skenování nebo jiný prohlížeč.");
      return;
    }
    const detector = new anyWin.BarcodeDetector({ formats: ["qr_code"] });
    const bmp = await createImageBitmap(file);
    try {
      const codes = await detector.detect(bmp as any);
      if (codes && codes.length > 0) {
        const value = (codes[0].rawValue || "").trim();
        if (value) {
          await onCodeScanned(value);
          return;
        }
      }
      setErr("QR kód se z obrázku nepodařilo přečíst.");
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }

  /** --- API volání --- */
  async function loadByKod(k: string) {
    if (!API_BASE) {
      setErr("Chybí VITE_APPS_SCRIPT_URL v .env");
      return;
    }
    setLoading(true);
    setErr(null);
    setDetail(null);
    setHistory([]);
    try {
      // DETAIL
      const dRes = await fetch(`${API_BASE}?action=detail&kod=${encodeURIComponent(k)}`);
      const dRaw = await dRes.json();
      const d = dRaw?.detail ?? dRaw;
      if (!d || !d.kod) throw new Error("Detail neobsahuje očekávaná data.");
      setDetail({ kod: d.kod, nazev: d.nazev, majitel: d.majitel, delka: d.delka, uzly: d.uzly });

      // HISTORIE
      const hRes = await fetch(`${API_BASE}?action=history&kod=${encodeURIComponent(k)}`);
      const hRaw = await hRes.json();
      const hArr: any[] = Array.isArray(hRaw?.history) ? hRaw.history : Array.isArray(hRaw) ? hRaw : [];
      setHistory(hArr.map((r) => ({ datum: r.datum ?? "", typ: r.typ ?? "", napeti: r.napeti ?? "" })));

      setKod(k);
      setScreen("detail");
    } catch (e: any) {
      setErr(e?.message || String(e));
      setDetail(null);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }

  function goHome() {
    setDetail(null);
    setHistory([]);
    setKod("");
    stopScanner();
    setScreen("home");
  }

  /** ---------- RENDER ---------- */
  return (
    <div style={{ minHeight: "100vh", background: theme.bg, color: theme.text, transition: "all .2s", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" }}>
      {/* horní lišta */}
      <TopBar
        theme={theme}
        title="GJ Strings"
        leftAction={screen !== "home" ? { label: "◀ Zpět", onClick: () => (screen === "detail" ? goHome() : setScreen(detail ? "detail" : "home")) } : undefined}
        rightAction={{ label: "⋮", onClick: () => setMenuOpen((v) => !v) }}
      />

      {/* MENU */}
      {menuOpen && (
        <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 30 }}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: 56,
              right: 12,
              width: 260,
              background: theme.primary,
              color: "white",
              borderRadius: 12,
              padding: 6,
              boxShadow: "0 8px 24px rgba(0,0,0,.35)",
            }}
          >
            <MenuItem label="🎾 Moje rakety" onClick={() => { setMenuOpen(false); setScreen("owner"); }} />
            <MenuItem label="🧵 Moje výplety" onClick={() => { setMenuOpen(false); setScreen("strings"); }} />
            <MenuItem label="💰 Ceník" onClick={() => { setMenuOpen(false); setScreen("pricing"); }} />
            <MenuItem label="📈 Statistiky" onClick={() => { setMenuOpen(false); setScreen("stats"); }} />
            <MenuItem label="⚙️ Nastavení" onClick={() => { setMenuOpen(false); setScreen("settings"); }} />
          </div>
        </div>
      )}

      <div style={pageContainer}>
        {screen === "home" && (
          <HomeLanding
            theme={theme}
            scannerSupported={scannerSupported}
            onScanClick={() => startScanner()}
            onPickImage={() => fileInputRef.current?.click()}
            scannerOpen={scannerOpen}
            onScannerClose={stopScanner}
            videoRef={videoRef}
            // zoom/přepínač
            zoomInfo={zoomInfo}
            onZoomIn={() => nudgeZoom(zoomInfo?.step ?? 0.25)}
            onZoomOut={() => nudgeZoom(-(zoomInfo?.step ?? 0.25))}
            devices={devices}
            deviceLabel={devices[deviceIndex]?.label || "Kamera"}
            onSwitchCamera={() => {
              stopScanner();
              setDeviceIndex((i) => (devices.length ? (i + 1) % devices.length : 0));
              setTimeout(() => startScanner(), 50);
            }}
            // fallback input
            fileInputRef={fileInputRef}
            onFileSelected={(f) => f && detectFromFile(f)}
            err={err}
          />
        )}

        {screen === "detail" && detail && <DetailView theme={theme} detail={detail} history={history} loading={loading} err={err} />}

        {screen === "owner" && <OwnerRacketsView theme={theme} ownerName={ownerName} apiBase={API_BASE} onOpenRacket={(k) => loadByKod(k)} />}

        {screen === "strings" && <OwnerStringsView theme={theme} ownerName={ownerName} apiBase={API_BASE} />}

        {screen === "pricing" && <PricingView theme={theme} />}

        {screen === "stats" && <StatsView theme={theme} ownerName={ownerName} apiBase={API_BASE} />}

        {screen === "settings" && (
          <SettingsView
            theme={theme}
            value={tournament}
            onChange={(v) => {
              setTournament(v);
              localStorage.setItem("gj.tournament", v);
            }}
            onBack={() => (detail ? setScreen("detail") : setScreen("home"))}
          />
        )}
      </div>
    </div>
  );
}

/** ========= KOMPONENTY ========= */

function TopBar({
  theme,
  title,
  leftAction,
  rightAction,
}: {
  theme: ReturnType<typeof getTheme>;
  title: string;
  leftAction?: { label: string; onClick: () => void };
  rightAction?: { label: string; onClick: () => void };
}) {
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        background: theme.primary,
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 14px",
        boxShadow: `0 2px 8px ${theme.shadow}`,
      }}
    >
      <div>
        {leftAction ? (
          <button onClick={leftAction.onClick} style={btnGhost}>
            {leftAction.label}
          </button>
        ) : (
          <strong>{title}</strong>
        )}
      </div>
      <div>{rightAction && <button onClick={rightAction.onClick} style={btnGhost} aria-label="menu">{rightAction.label}</button>}</div>
    </div>
  );
}

function HomeLanding({
  theme,
  scannerSupported,
  onScanClick,
  onPickImage,
  scannerOpen,
  onScannerClose,
  videoRef,
  zoomInfo,
  onZoomIn,
  onZoomOut,
  devices,
  deviceLabel,
  onSwitchCamera,
  fileInputRef,
  onFileSelected,
  err,
}: {
  theme: ReturnType<typeof getTheme>;
  scannerSupported: boolean;
  onScanClick: () => void;
  onPickImage: () => void;
  scannerOpen: boolean;
  onScannerClose: () => void;
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  zoomInfo: { min: number; max: number; step: number; value: number } | null;
  onZoomIn: () => void;
  onZoomOut: () => void;
  devices: MediaDeviceInfo[];
  deviceLabel: string;
  onSwitchCamera: () => void;
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  onFileSelected: (f?: File) => void;
  err: string | null;
}) {
  return (
    <div style={{ display: "grid", gap: 16, alignItems: "start", justifyItems: "center" }}>
      <div style={{ fontSize: 36, fontWeight: 900, marginTop: 8 }}>🔎 GJ Strings</div>

      <button onClick={onScanClick} style={{ ...bigButton(theme), width: "100%" }}>
        📷 Skenovat QR kód
      </button>

      <button onClick={onPickImage} style={{ ...btnOutline(theme), width: "100%" }}>
        🖼️ Vyfotit / vybrat obrázek s QR
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => onFileSelected(e.target.files?.[0] || undefined)}
      />

      {err && <p style={{ color: "#dc2626" }}>{err}</p>}

      {scannerOpen && (
        <div onClick={onScannerClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 40, display: "grid", placeItems: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "92%", maxWidth: 520, background: "#000", borderRadius: 12, padding: 8 }}>
            <video ref={videoRef} style={{ width: "100%", borderRadius: 10 }} muted playsInline />
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr 1fr", marginTop: 8 }}>
              <button onClick={(e) => { e.stopPropagation(); onZoomOut(); }} style={btnOutline(theme)}>➖ Zoom</button>
              <button onClick={(e) => { e.stopPropagation(); onSwitchCamera(); }} style={btnOutline(theme)}>🔁 Přepnout kameru</button>
              <button onClick={(e) => { e.stopPropagation(); onZoomIn(); }} style={btnOutline(theme)}>➕ Zoom</button>
            </div>
            <div style={{ fontSize: 12, color: "#fff", opacity: .85, textAlign: "center", marginTop: 6 }}>
              {deviceLabel} {zoomInfo ? `• zoom ${zoomInfo.value.toFixed(1)}×` : ""} • klepni mimo pro zavření
            </div>
          </div>
        </div>
      )}

      {!scannerSupported && (
        <p style={{ fontSize: 12, color: "#36454F" }}>
          Pokud živé skenování selže (nebo není podporováno), použij vyfocení/galerii.
        </p>
      )}
    </div>
  );
}

function DetailView({ theme, detail, history, loading, err }: { theme: ReturnType<typeof getTheme>; detail: Detail; history: HistoryRow[]; loading: boolean; err: string | null }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ background: theme.card, borderRadius: 12, padding: 16, border: `1px solid ${theme.accent}`, boxShadow: `0 3px 10px ${theme.shadow}` }}>
        <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 8 }}>{detail.nazev || detail.kod}</div>
        <div style={{ display: "grid", rowGap: 8, fontSize: 15 }}>
          <div><b>Kód:</b> {detail.kod}</div>
          <div><b>Majitel:</b> {detail.majitel || "-"}</div>
          <div><b>Délka strun:</b> {detail.delka || "-"}</div>
          <div><b>Uzlů:</b> {detail.uzly || "-"}</div>
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: 12, padding: 12, border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Historie vypletení</div>
        {loading && <div>Načítám…</div>}
        {err && <div style={{ color: "#dc2626" }}>{err}</div>}
        {history.length === 0 ? (
          <div style={{ color: "#64748b" }}>Žádná data.</div>
        ) : (
          history.map((row, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 8, padding: "8px 0", borderTop: "1px solid rgba(0,0,0,.08)" }}>
              <div>{row.datum}</div>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.typ}</div>
              <div>{row.napeti}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function OwnerRacketsView({ theme, ownerName, apiBase, onOpenRacket }: { theme: ReturnType<typeof getTheme>; ownerName: string; apiBase: string; onOpenRacket: (kod: string) => void; }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<RacketItem[]>([]);

  useEffect(() => { if (ownerName) load(ownerName); /* eslint-disable-next-line */ }, [ownerName]);

  async function load(m: string) {
    if (!m.trim()) return;
    try {
      setLoading(true); setErr(null);
      const res = await fetch(`${apiBase}?action=racketsByOwner&majitel=${encodeURIComponent(m.trim())}`);
      const raw = await res.json();
      const arr: any[] = Array.isArray(raw?.rackets) ? raw.rackets : Array.isArray(raw) ? raw : [];
      setItems(arr as RacketItem[]);
    } catch (e: any) { setErr(e?.message || String(e)); setItems([]); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h1 style={{ fontSize: 22, fontWeight: 900 }}>Moje rakety</h1>
      {ownerName ? <p style={{ color: "#475569" }}>Majitel: <b>{ownerName}</b></p> : <p style={{ color: "#dc2626" }}>Otevři nejdřív detail rakety (QR) a z něj přejdi sem.</p>}
      {loading && <p>Načítám…</p>}
      {err && <p style={{ color: "#dc2626" }}>{err}</p>}
      <ul style={{ display: "grid", gap: 8 }}>
        {items.map((r) => (
          <li key={r.kod} onClick={() => onOpenRacket(r.kod)} style={{ background: theme.card, border: `1px solid ${theme.accent}`, borderRadius: 12, padding: 12, cursor: "pointer" }}>
            <div style={{ fontWeight: 700 }}>{r.nazev || r.kod}</div>
            <div style={{ fontSize: 13, color: "#475569" }}>kód: {r.kod}</div>
          </li>
        ))}
        {items.length === 0 && !loading && !err && <li style={{ color: "#64748b" }}>Žádné rakety.</li>}
      </ul>
    </div>
  );
}

function OwnerStringsView({ theme, ownerName, apiBase }: { theme: ReturnType<typeof getTheme>; ownerName: string; apiBase: string; }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<StringItem[]>([]);

  useEffect(() => { if (ownerName) load(ownerName); /* eslint-disable-next-line */ }, [ownerName]);

  async function load(m: string) {
    if (!m.trim()) return;
    try {
      setLoading(true); setErr(null);
      const res = await fetch(`${apiBase}?action=stringsByOwner&majitel=${encodeURIComponent(m.trim())}`);
      const raw = await res.json();
      const arr: any[] = Array.isArray(raw?.strings) ? raw.strings : Array.isArray(raw) ? raw : [];
      setItems(arr as StringItem[]);
    } catch (e: any) { setErr(e?.message || String(e)); setItems([]); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h1 style={{ fontSize: 22, fontWeight: 900 }}>Moje výplety</h1>
      {ownerName ? <p style={{ color: "#475569" }}>Majitel: <b>{ownerName}</b></p> : <p style={{ color: "#dc2626" }}>Otevři nejdřív detail rakety (QR) a z něj přejdi sem.</p>}
      {loading && <p>Načítám…</p>}
      {err && <p style={{ color: "#dc2626" }}>{err}</p>}
      <ul style={{ display: "grid", gap: 8 }}>
        {items.map((s) => (
          <li key={s.kod} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 700 }}>{s.nazev || s.kod}</div>
            <div style={{ fontSize: 13, color: "#475569" }}>kód: {s.kod}</div>
            <div style={{ fontSize: 13, color: "#475569" }}>množství: {s.mnozstvi}</div>
          </li>
        ))}
        {items.length === 0 && !loading && !err && <li style={{ color: "#64748b" }}>Žádná data.</li>}
      </ul>
    </div>
  );
}

function PricingView({ theme }: { theme: ReturnType<typeof getTheme> }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h1 style={{ fontSize: 22, fontWeight: 900 }}>Ceník</h1>

      <details open style={sectionCard(theme)}>
        <summary style={summaryRow}>🧵 <b style={{ marginLeft: 8 }}>Vyplétání</b> <span style={{ marginLeft: "auto" }}>›</span></summary>
        <div style={{ padding: "8px 12px" }}>
          <PriceRow label="Standardní vypletení" price="150 Kč" note="běžný termín" />
          <PriceRow label="Expresní vypletení (do 90 minut)" price="180 Kč" note="rychlé zpracování" />
        </div>
      </details>

      <details style={sectionCard(theme)}>
        <summary style={summaryRow}>🎾 <b style={{ marginLeft: 8 }}>Výplety</b> <span style={{ marginLeft: "auto" }}>›</span></summary>
        <div style={{ padding: "8px 12px" }}>
          <PriceRow label="Babolat RPM Rough 1.25" price="300 Kč" />
          <PriceRow label="Luxilon Alu Power 1.25" price="380 Kč" />
          <PriceRow label="Yonex PolyTour Pro 1.25" price="320 Kč" />
        </div>
      </details>

      <details style={sectionCard(theme)}>
        <summary style={summaryRow}>🖐️ <b style={{ marginLeft: 8 }}>Omotávky</b> <span style={{ marginLeft: "auto" }}>›</span></summary>
        <div style={{ padding: "8px 12px" }}>
          <PriceRow label="Yonex Super Grap (1 ks)" price="70 Kč" />
          <PriceRow label="Wilson Pro Overgrip (1 ks)" price="80 Kč" />
        </div>
      </details>

      <details style={sectionCard(theme)}>
        <summary style={summaryRow}>🔇 <b style={{ marginLeft: 8 }}>Tlumítka</b> <span style={{ marginLeft: "auto" }}>›</span></summary>
        <div style={{ padding: "8px 12px" }}>
          <PriceRow label="Babolat Custom Damp" price="120 Kč" />
          <PriceRow label="Head Logo Dampener" price="110 Kč" />
        </div>
      </details>
    </div>
  );
}

function PriceRow({ label, price, note }: { label: string; price: string; note?: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, padding: "8px 0", borderTop: "1px solid #eef2f7" }}>
      <div>
        <div style={{ fontWeight: 600 }}>{label}</div>
        {note && <div style={{ fontSize: 12, color: "#64748b" }}>{note}</div>}
      </div>
      <div style={{ fontWeight: 800 }}>{price}</div>
    </div>
  );
}

function StatsView({ theme, ownerName, apiBase }: { theme: ReturnType<typeof getTheme>; ownerName: string; apiBase: string; }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => { if (ownerName) load(ownerName); /* eslint-disable-next-line */ }, [ownerName]);

  async function load(m: string) {
    try {
      setLoading(true); setErr(null);
      const res = await fetch(`${apiBase}?action=statistics&majitel=${encodeURIComponent(m)}`);
      const raw = await res.json();
      const s: Stats = {
        total: raw?.total ?? 0,
        commonString: raw?.commonString ?? "-",
        commonTension: raw?.commonTension ?? "-",
        byMonth: Array.isArray(raw?.byMonth) ? raw.byMonth : [],
      };
      setStats(s);
    } catch (e: any) { setErr(e?.message || String(e)); setStats(null); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h1 style={{ fontSize: 22, fontWeight: 900 }}>Statistiky</h1>
      {ownerName ? <p style={{ color: "#475569" }}>Majitel: <b>{ownerName}</b></p> : <p style={{ color: "#dc2626" }}>Otevři nejdřív detail rakety (QR) a z něj přejdi sem.</p>}
      {loading && <p>Načítám…</p>}
      {err && <p style={{ color: "#dc2626" }}>{err}</p>}
      {stats && (
        <>
          <div style={{ background: theme.card, border: `1px solid ${theme.accent}`, borderRadius: 12, padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><div style={{ color: "#64748b", fontSize: 12 }}>Celkem vypletení</div><div style={{ fontWeight: 900, fontSize: 24 }}>{stats.total}</div></div>
            <div><div style={{ color: "#64748b", fontSize: 12 }}>Nejčastější napětí</div><div style={{ fontWeight: 800 }}>{stats.commonTension}</div></div>
            <div><div style={{ color: "#64748b", fontSize: 12 }}>Nejčastější výplet</div><div style={{ fontWeight: 800 }}>{stats.commonString}</div></div>
          </div>

          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Po měsících</div>
            {stats.byMonth.length === 0 ? (
              <div style={{ color: "#64748b" }}>Žádná data.</div>
            ) : (
              stats.byMonth.map((m) => (
                <div key={m.month} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, padding: "6px 0", borderTop: "1px solid #eef2f7" }}>
                  <div>{m.month}</div>
                  <div style={{ fontWeight: 700 }}>{m.count}</div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SettingsView({ theme, value, onChange, onBack }: { theme: ReturnType<typeof getTheme>; value: Tournament; onChange: (v: Tournament) => void; onBack: () => void; }) {
  const [icons, setIcons] = useState<Record<Tournament, string>>({
    RG: localStorage.getItem("gj.themeIcon.RG") || "",
    WIM: localStorage.getItem("gj.themeIcon.WIM") || "",
    AO: localStorage.getItem("gj.themeIcon.AO") || "",
  });

  function onPick(t: Tournament) { onChange(t); }
  async function onUpload(t: Tournament, file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || "");
      setIcons((prev) => {
        const next = { ...prev, [t]: url };
        localStorage.setItem(`gj.themeIcon.${t}`, url);
        return next;
      });
    };
    reader.readAsDataURL(file);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 900 }}>Nastavení vzhledu</h1>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <ThemeCard title="Roland Garros" sub="oranžová" color="#c1440e" selected={value === "RG"} icon={icons.RG} onPick={() => onPick("RG")} onUpload={(f) => onUpload("RG", f)} />
        <ThemeCard title="Wimbledon" sub="zelená" color="#1b5e20" selected={value === "WIM"} icon={icons.WIM} onPick={() => onPick("WIM")} onUpload={(f) => onUpload("WIM", f)} />
        <ThemeCard title="Australian Open" sub="modrá" color="#1565c0" selected={value === "AO"} icon={icons.AO} onPick={() => onPick("AO")} onUpload={(f) => onUpload("AO", f)} />
      </div>

      <div><button onClick={onBack} style={{ ...btnOutline(theme) }}>◀ Zpět</button></div>
    </div>
  );
}

function ThemeCard({ title, sub, color, selected, icon, onPick, onUpload }: { title: string; sub: string; color: string; selected: boolean; icon?: string; onPick: () => void; onUpload: (file?: File) => void; }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div onClick={onPick} style={{ cursor: "pointer", background: "#fff", borderRadius: 12, padding: 12, border: `2px solid ${selected ? color : "#e2e8f0"}`, boxShadow: "0 2px 8px rgba(0,0,0,.06)", display: "grid", gridTemplateColumns: "64px 1fr", gap: 12, alignItems: "center" }}>
      <div onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }} title="Nahrát vlastní ikonku" style={{ width: 64, height: 64, borderRadius: "50%", background: icon ? `center/cover no-repeat url(${icon})` : color, border: `3px solid ${color}` }} />
      <div>
        <div style={{ fontWeight: 800 }}>{title}</div>
        <div style={{ color: "#64748b" }}>{sub}</div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => onUpload(e.target.files?.[0] || undefined)} />
    </div>
  );
}

/** ========= STYLY / SHARED ========= */
const pageContainer: React.CSSProperties = {
  // JEDNOTNÁ ŠÍŘKA NA VŠECH STRÁNKÁCH
  width: "100%",
  maxWidth: 520,
  margin: "0 auto",
  padding: 16,
};

const btn = (theme: ReturnType<typeof getTheme>) =>
  ({
    background: theme.button,
    color: theme.buttonText,
    padding: "12px 14px",
    borderRadius: 12,
    border: "0",
    fontWeight: 800,
    boxShadow: `0 6px 18px ${theme.shadow}`,
    cursor: "pointer",
  }) as React.CSSProperties;

const bigButton = (theme: ReturnType<typeof getTheme>) =>
  ({
    ...btn(theme),
    fontSize: 18,
  }) as React.CSSProperties;

const btnOutline = (theme: ReturnType<typeof getTheme>) =>
  ({
    background: "transparent",
    color: theme.text,
    padding: "10px 12px",
    borderRadius: 10,
    border: `1px solid ${theme.text}33`,
    fontWeight: 700,
    cursor: "pointer",
  }) as React.CSSProperties;

const btnGhost: React.CSSProperties = {
  background: "transparent",
  color: "white",
  padding: "6px 10px",
  borderRadius: 8,
  border: "0",
  fontWeight: 700,
  cursor: "pointer",
};

const summaryRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "10px 12px",
  cursor: "pointer",
  listStyle: "none",
};

const sectionCard = (theme: ReturnType<typeof getTheme>) =>
  ({
    background: "#fff",
    borderRadius: 12,
    border: "1px solid #e2e8f0",
    boxShadow: "0 2px 8px rgba(0,0,0,.06)",
  }) as React.CSSProperties;

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: "transparent",
        color: "white",
        padding: "12px 12px",
        borderRadius: 10,
        border: 0,
        fontSize: 16,
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}