import { useEffect, useMemo, useRef, useState } from "react";

/** ========= KONFIG ========= */
const API_BASE = import.meta.env.VITE_APPS_SCRIPT_URL || "";

/** ========= TYPY ========= */
type Detail = { kod: string; nazev?: string; majitel?: string; delka?: string; uzly?: string };
type HistoryRow = { datum?: string; typ?: string; napeti?: string };
type RacketItem = { kod: string; nazev?: string };
type StringItem = { kod: string; nazev?: string; mnozstvi: number };
type Tournament = "RG" | "WIM" | "AO";
type StatsPayload = {
  total: number;
  commonString: string;
  commonTension: string;
  byMonth: { month: string; count: number }[];
};

/** ========= CESTY K OBRÁZKŮM ========= */
const ICONS = {
  rackets: "/icons/rackets.png",
  strings: "/icons/strings.png",
  pricing: "/icons/pricing.png",
  stats: "/icons/stats.png",
  settings: "/icons/settings.png",
};
const SURFACES = {
  RG: "/surfaces/rg.png",
  WIM: "/surfaces/wim.png",
  AO: "/surfaces/ao.png",
};

/** ========= TÉMATA ========= */
function getTheme(t: Tournament) {
  switch (t) {
    case "WIM":
      return {
        key: "WIM" as const,
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
        key: "AO" as const,
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
        key: "RG" as const,
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
  const detectTimer = useRef<number | null>(null);
  const [scannerSupported, setScannerSupported] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    const anyWin = window as any;
    setScannerSupported(!!anyWin.BarcodeDetector);
    return () => stopScanner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startScanner() {
    try {
      if (!("mediaDevices" in navigator)) throw new Error("Kamera není dostupná.");

      // prefer zadní kamera, ale s fallbackem
      const constraints: MediaStreamConstraints = {
        video: { facingMode: { ideal: "environment" } as any },
        audio: false,
      };

      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      if (!stream) throw new Error("Nepodařilo se otevřít kameru.");

      streamRef.current = stream;

      if (videoRef.current) {
        const v = videoRef.current;
        v.srcObject = stream;
        v.muted = true;
        v.setAttribute("playsinline", "true");
        v.setAttribute("webkit-playsinline", "true");
        v.setAttribute("autoplay", "true");
        try { await v.play(); } catch {}
      }

      setScannerOpen(true);

      const anyWin = window as any;
      const Detector = anyWin.BarcodeDetector ? new anyWin.BarcodeDetector({ formats: ["qr_code"] }) : null;

      if (!Detector) {
        setErr("QR skener není v tomto prohlížeči podporován. Použij ruční zadání.");
        return;
      }

      const tick = async () => {
        if (!videoRef.current || !scannerOpen) return;

        if (videoRef.current.paused) {
          try { await videoRef.current.play(); } catch {}
        }

        try {
          const codes = await Detector.detect(videoRef.current);
          if (codes && codes.length > 0) {
            const value = (codes[0].rawValue || "").trim();
            if (value) {
              await onCodeScanned(value);
              return;
            }
          }
        } catch {
          /* ignore */
        }
        detectTimer.current = window.setTimeout(tick, 200);
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
    setScannerOpen(false);
  }

  async function onCodeScanned(value: string) {
    stopScanner();
    await loadByKod(value);
  }

  async function loadManual() {
    const k = kod.trim();
    if (!k) return;
    await loadByKod(k);
  }

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
      const hArr: any[] = Array.isArray(hRaw?.history) ? hRaw.history : (Array.isArray(hRaw) ? hRaw : []);
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

  // ===== RENDER =====
  return (
    <div style={{ minHeight: "100vh", background: theme.bg, color: theme.text, transition: "all .2s", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" }}>
      {/* horní lišta */}
      <TopBar
        theme={theme}
        title="GJ Strings"
        leftAction={screen === "detail" || screen === "owner" || screen === "strings" || screen === "pricing" || screen === "stats" || screen === "settings" ? { label: "◀ Zpět", onClick: () => (screen === "detail" ? goHome() : setScreen(detail ? "detail" : "home")) } : undefined}
        rightAction={{ label: "⋮", onClick: () => setMenuOpen((v) => !v) }}
      />

      {/* MENU OVERLAY */}
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
            <MenuItem label={<span style={{display:"flex",alignItems:"center",gap:8}}><img src={ICONS.rackets} alt="" style={menuIcon}/> Moje rakety</span>} onClick={() => { setMenuOpen(false); setScreen("owner"); }} />
            <MenuItem label={<span style={{display:"flex",alignItems:"center",gap:8}}><img src={ICONS.strings} alt="" style={menuIcon}/> Moje výplety</span>} onClick={() => { setMenuOpen(false); setScreen("strings"); }} />
            <MenuItem label={<span style={{display:"flex",alignItems:"center",gap:8}}><img src={ICONS.pricing} alt="" style={menuIcon}/> Ceník</span>} onClick={() => { setMenuOpen(false); setScreen("pricing"); }} />
            <MenuItem label={<span style={{display:"flex",alignItems:"center",gap:8}}><img src={ICONS.stats} alt="" style={menuIcon}/> Statistiky</span>} onClick={() => { setMenuOpen(false); setScreen("stats"); }} />
            <MenuItem label={<span style={{display:"flex",alignItems:"center",gap:8}}><img src={ICONS.settings} alt="" style={menuIcon}/> Nastavení</span>} onClick={() => { setMenuOpen(false); setScreen("settings"); }} />
          </div>
        </div>
      )}

      <div style={{ maxWidth: 860, margin: "0 auto", padding: 16 }}>
        {screen === "home" && (
          <HomeLanding
            theme={theme}
            scannerSupported={scannerSupported}
            onScanClick={() => (scannerSupported ? startScanner() : setShowManual(true))}
            showManual={showManual}
            setShowManual={setShowManual}
            videoRef={videoRef}
            scannerOpen={scannerOpen}
            onScannerClose={stopScanner}
            kod={kod}
            setKod={setKod}
            loadManual={loadManual}
            loading={loading}
            err={err}
          />
        )}

        {screen === "detail" && detail && (
          <DetailView theme={theme} detail={detail} history={history} loading={loading} err={err} />
        )}

        {screen === "owner" && (
          <OwnerRacketsView
            theme={theme}
            ownerName={ownerName}
            apiBase={API_BASE}
            onOpenRacket={(k) => loadByKod(k)}
          />
        )}

        {screen === "strings" && (
          <OwnerStringsView
            theme={theme}
            ownerName={ownerName}
            apiBase={API_BASE}
          />
        )}

        {screen === "pricing" && <PricingView theme={theme} />}

        {screen === "stats" && (
          <StatsView
            theme={theme}
            ownerName={ownerName}
            apiBase={API_BASE}
          />
        )}

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
      <div>
        {rightAction && (
          <button onClick={rightAction.onClick} style={btnGhost} aria-label="menu">
            {rightAction.label}
          </button>
        )}
      </div>
    </div>
  );
}

function HomeLanding({
  theme,
  scannerSupported,
  onScanClick,
  showManual,
  setShowManual,
  videoRef,
  scannerOpen,
  onScannerClose,
  kod,
  setKod,
  loadManual,
  loading,
  err,
}: {
  theme: ReturnType<typeof getTheme>;
  scannerSupported: boolean;
  onScanClick: () => void;
  showManual: boolean;
  setShowManual: (v: boolean) => void;
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  scannerOpen: boolean;
  onScannerClose: () => void;
  kod: string;
  setKod: (s: string) => void;
  loadManual: () => Promise<void>;
  loading: boolean;
  err: string | null;
}) {
  return (
    <div style={{ display: "grid", gap: 16, alignItems: "start", justifyItems: "center" }}>
      {/* logo – můžeš nahradit svým souborem */}
      <div style={{ fontSize: 28, fontWeight: 900, marginTop: 8 }}>🎾 GJ Strings</div>

      {/* velké tlačítko Skenovat QR */}
      <button
        onClick={onScanClick}
        style={{
          background: theme.button,
          color: theme.buttonText,
          padding: "14px 18px",
          borderRadius: 14,
          border: "0",
          fontWeight: 800,
          boxShadow: `0 6px 18px ${theme.shadow}`,
          width: 280,
        }}
      >
        📷 Skenovat QR kód
      </button>

      {/* odkaz na ruční zadání */}
      <button
        onClick={() => setShowManual(!showManual)}
        style={{ background: "transparent", border: "0", color: theme.text, textDecoration: "underline", cursor: "pointer" }}
      >
        {showManual ? "Skrýt ruční zadání" : "Zadat kód ručně"}
      </button>

      {/* ruční zadání */}
      {showManual && (
        <div
          style={{
            width: "100%",
            maxWidth: 520,
            background: "#fff",
            borderRadius: 12,
            padding: 12,
            boxShadow: "0 2px 8px rgba(0,0,0,.06)",
            border: "1px solid #e2e8f0",
          }}
        >
          <label style={{ display: "block", fontSize: 14, marginBottom: 6 }}>Kód rakety</label>
          <input
            value={kod}
            onChange={(e) => setKod(e.target.value)}
            placeholder="např. raketa001"
            style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #cbd5e1", marginBottom: 10 }}
            onKeyDown={(e) => e.key === "Enter" && loadManual()}
          />
          <button onClick={loadManual} disabled={loading} style={{ ...btn(theme), width: "100%" }}>
            {loading ? "Načítám…" : "Načíst detail + historii"}
          </button>
          {err && <p style={{ color: "#dc2626", marginTop: 8 }}>{err}</p>}
        </div>
      )}

      {/* skener jako overlay */}
      {scannerOpen && (
        <div
          onClick={onScannerClose}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", zIndex: 40, display: "grid", placeItems: "center" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "92%", maxWidth: 520, background: "#111", borderRadius: 12, padding: 8, boxShadow: "0 10px 30px rgba(0,0,0,.5)" }}
          >
            <video
              ref={videoRef}
              style={{ width: "100%", height: "60vh", maxHeight: 520, borderRadius: 10, background: "#000", objectFit: "cover" }}
              muted
              playsInline
            />
            <button onClick={onScannerClose} style={{ ...btnOutline(theme), width: "100%", marginTop: 8 }}>
              ✖ Zavřít čtečku
            </button>
          </div>
        </div>
      )}

      {!scannerSupported && (
        <p style={{ fontSize: 12, color: "#36454F" }}>
          Pozn.: QR čtečka vyžaduje podporu <code>BarcodeDetector</code> (většina mobilních prohlížečů). Jinak použij ruční zadání.
        </p>
      )}
    </div>
  );
}

function DetailView({
  theme,
  detail,
  history,
  loading,
  err,
}: {
  theme: ReturnType<typeof getTheme>;
  detail: Detail;
  history: HistoryRow[];
  loading: boolean;
  err: string | null;
}) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div
        style={{
          background: theme.card,
          borderRadius: 12,
          padding: 16,
          border: `1px solid ${theme.accent}`,
          boxShadow: `0 3px 10px ${theme.shadow}`,
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 8 }}>
          {detail.nazev || detail.kod}
        </div>
        <div style={{ display: "grid", rowGap: 8, fontSize: 15 }}>
          <div><b>Kód:</b> {detail.kod}</div>
          <div><b>Majitel:</b> {detail.majitel || "-"}</div>
          <div><b>Délka strun:</b> {detail.delka || "-"}</div>
          <div><b>Uzlů:</b> {detail.uzly || "-"}</div>
        </div>
      </div>

      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 12,
          border: "1px solid #e2e8f0",
          boxShadow: "0 2px 8px rgba(0,0,0,.06)",
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Historie vypletení</div>
        {loading && <div>Načítám…</div>}
        {err && <div style={{ color: "#dc2626" }}>{err}</div>}
        {history.length === 0 ? (
          <div style={{ color: "#64748b" }}>Žádná data.</div>
        ) : (
          history.map((row, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 2fr 1fr",
                gap: 8,
                padding: "8px 0",
                borderTop: "1px solid rgba(0,0,0,.08)",
              }}
            >
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

function OwnerRacketsView({
  theme,
  ownerName,
  apiBase,
  onOpenRacket,
}: {
  theme: ReturnType<typeof getTheme>;
  ownerName: string;
  apiBase: string;
  onOpenRacket: (kod: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<RacketItem[]>([]);

  useEffect(() => {
    if (ownerName) load(ownerName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerName]);

  async function load(m: string) {
    if (!m.trim()) return;
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`${apiBase}?action=racketsByOwner&majitel=${encodeURIComponent(m.trim())}`);
      const raw = await res.json();
      const arr: any[] = Array.isArray(raw?.rackets) ? raw.rackets : (Array.isArray(raw) ? raw : []);
      setItems(arr as RacketItem[]);
    } catch (e:any) {
      setErr(e?.message || String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display:"grid", gap:12 }}>
      <h1 style={{ fontSize:22, fontWeight:900, display:"flex", alignItems:"center", gap:8 }}>
        <img src={ICONS.rackets} alt="" style={{width:28,height:28,objectFit:"contain"}}/> Moje rakety
      </h1>

      {loading && <p>Načítám…</p>}
      {err && <p style={{ color:"#dc2626" }}>{err}</p>}

      <ul style={{ display:"grid", gap:8 }}>
        {items.map((r)=>(
          <li key={r.kod}
              onClick={()=>onOpenRacket(r.kod)}
              style={{ background:theme.card, border:`1px solid ${theme.accent}`, borderRadius:12, padding:12, cursor:"pointer" }}>
            <div style={{ fontWeight:700 }}>{r.nazev || r.kod}</div>
            <div style={{ fontSize:13, color:"#475569" }}>kód: {r.kod}</div>
          </li>
        ))}
        {items.length===0 && !loading && !err && <li style={{ color:"#64748b" }}>Žádné rakety.</li>}
      </ul>
    </div>
  );
}

function OwnerStringsView({
  theme,
  ownerName,
  apiBase,
}: {
  theme: ReturnType<typeof getTheme>;
  ownerName: string;
  apiBase: string;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<StringItem[]>([]);

  useEffect(() => {
    if (ownerName) load(ownerName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerName]);

  async function load(m: string) {
    if (!m.trim()) return;
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`${apiBase}?action=stringsByOwner&majitel=${encodeURIComponent(m.trim())}`);
      const raw = await res.json();
      const arr: any[] = Array.isArray(raw?.strings) ? raw.strings : (Array.isArray(raw) ? raw : []);
      setItems(arr as StringItem[]);
    } catch (e:any) {
      setErr(e?.message || String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display:"grid", gap:12 }}>
      <h1 style={{ fontSize:22, fontWeight:900, display:"flex", alignItems:"center", gap:8 }}>
        <img src={ICONS.strings} alt="" style={{width:28,height:28,objectFit:"contain"}}/> Moje výplety
      </h1>

      {loading && <p>Načítám…</p>}
      {err && <p style={{ color:"#dc2626" }}>{err}</p>}

      <ul style={{ display:"grid", gap:8 }}>
        {items.map((s)=>(
          <li key={s.kod} style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, padding:12 }}>
            <div style={{ fontWeight:700 }}>{s.nazev || s.kod}</div>
            <div style={{ fontSize:13, color:"#475569" }}>kód: {s.kod}</div>
            <div style={{ fontSize:13, color:"#475569" }}>množství: {s.mnozstvi}</div>
          </li>
        ))}
        {items.length===0 && !loading && !err && <li style={{ color:"#64748b" }}>Žádná data.</li>}
      </ul>
    </div>
  );
}

function PricingView({ theme }: { theme: ReturnType<typeof getTheme> }) {
  return (
    <div style={{ display:"grid", gap:12 }}>
      <h1 style={{ fontSize:22, fontWeight:900, display:"flex", alignItems:"center", gap:8 }}>
        <img src={ICONS.pricing} alt="" style={{width:28,height:28,objectFit:"contain"}}/> Ceník
      </h1>

      {/* Vyplétání */}
      <details open style={sectionCard(theme)}>
        <summary style={summaryRow}>🧵 <b style={{ marginLeft: 8 }}>Vyplétání</b> <span style={{ marginLeft:"auto" }}>›</span></summary>
        <div style={{ padding:"8px 12px" }}>
          <PriceRow label="Standardní vypletení" price="150 Kč" note="běžný termín" />
          <PriceRow label="Expresní vypletení (do 90 minut)" price="180 Kč" note="rychlé zpracování" />
        </div>
      </details>

      {/* Výplety */}
      <details style={sectionCard(theme)}>
        <summary style={summaryRow}>🎾 <b style={{ marginLeft: 8 }}>Výplety</b> <span style={{ marginLeft:"auto" }}>›</span></summary>
        <div style={{ padding:"8px 12px" }}>
          <PriceRow label="Babolat RPM Rough 1.25" price="300 Kč" />
          <PriceRow label="Luxilon Alu Power 1.25" price="380 Kč" />
          <PriceRow label="Yonex PolyTour Pro 1.25" price="320 Kč" />
        </div>
      </details>

      {/* Omotávky */}
      <details style={sectionCard(theme)}>
        <summary style={summaryRow}>🖐️ <b style={{ marginLeft: 8 }}>Omotávky</b> <span style={{ marginLeft:"auto" }}>›</span></summary>
        <div style={{ padding:"8px 12px" }}>
          <PriceRow label="Yonex Super Grap (1 ks)" price="70 Kč" />
          <PriceRow label="Wilson Pro Overgrip (1 ks)" price="80 Kč" />
        </div>
      </details>

      {/* Tlumítka */}
      <details style={sectionCard(theme)}>
        <summary style={summaryRow}>🔇 <b style={{ marginLeft: 8 }}>Tlumítka</b> <span style={{ marginLeft:"auto" }}>›</span></summary>
        <div style={{ padding:"8px 12px" }}>
          <PriceRow label="Babolat Custom Damp" price="120 Kč" />
          <PriceRow label="Head Logo Dampener" price="110 Kč" />
        </div>
      </details>

      <p style={{ fontSize:12, color:"#64748b" }}>Pozn.: U každé sekce je vlevo místo pro ikonu – můžeš nahradit vlastní grafikou později.</p>
    </div>
  );
}

function PriceRow({ label, price, note }: { label: string; price: string; note?: string }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:8, padding:"8px 0", borderTop:"1px solid #eef2f7" }}>
      <div>
        <div style={{ fontWeight:600 }}>{label}</div>
        {note && <div style={{ fontSize:12, color:"#64748b" }}>{note}</div>}
      </div>
      <div style={{ fontWeight:800 }}>{price}</div>
    </div>
  );
}

function StatsView({
  theme,
  ownerName,
  apiBase,
}: {
  theme: ReturnType<typeof getTheme>;
  ownerName: string;
  apiBase: string;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<StatsPayload | null>(null);

  useEffect(() => {
    if (ownerName) load(ownerName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerName]);

  async function load(m: string) {
    if (!m.trim()) return;
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch(`${apiBase}?action=statistics&majitel=${encodeURIComponent(m.trim())}`);
      const raw = await res.json();
      const payload: StatsPayload = {
        total: Number(raw?.total ?? 0),
        commonString: String(raw?.commonString ?? "-"),
        commonTension: String(raw?.commonTension ?? "-"),
        byMonth: Array.isArray(raw?.byMonth) ? raw.byMonth : [],
      };
      setData(payload);
    } catch (e:any) {
      setErr(e?.message || String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  const maxCount = Math.max(1, ...(data?.byMonth?.map(m => m.count) || [1]));

  return (
    <div style={{ display:"grid", gap:12 }}>
      <h1 style={{ fontSize:22, fontWeight:900, display:"flex", alignItems:"center", gap:8 }}>
        <img src={ICONS.stats} alt="" style={{width:28,height:28,objectFit:"contain"}}/> Statistiky
      </h1>

      {loading && <p>Načítám…</p>}
      {err && <p style={{ color:"#dc2626" }}>{err}</p>}

      {data && (
        <>
          <div style={{ display:"grid", gap:10, gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))" }}>
            <StatCard theme={theme} label="Celkem vypletení" value={String(data.total)} />
            <StatCard theme={theme} label="Nejčastější výplet" value={data.commonString || "-"} />
            <StatCard theme={theme} label="Nejčastější napětí" value={data.commonTension || "-"} />
          </div>

          <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, padding:12 }}>
            <div style={{ fontWeight:800, marginBottom:8 }}>Počty za měsíc</div>
            {data.byMonth.length === 0 ? (
              <div style={{ color:"#64748b" }}>Žádná data.</div>
            ) : (
              <div style={{ display:"grid", gap:8 }}>
                {data.byMonth.map((m)=>(
                  <div key={m.month} style={{ display:"grid", gridTemplateColumns:"80px 1fr 40px", alignItems:"center", gap:8 }}>
                    <div style={{ color:"#475569" }}>{m.month}</div>
                    <div style={{ background: theme.accent, height:10, borderRadius:6, overflow:"hidden" }}>
                      <div style={{ width: `${(m.count / maxCount) * 100}%`, background: theme.primary, height:"100%" }} />
                    </div>
                    <div style={{ textAlign:"right", fontWeight:700 }}>{m.count}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ theme, label, value }: { theme: ReturnType<typeof getTheme>; label: string; value: string }) {
  return (
    <div style={{ background: theme.card, border:`1px solid ${theme.accent}`, borderRadius:12, padding:12, boxShadow:`0 2px 8px ${theme.shadow}` }}>
      <div style={{ fontSize:12, color:"#64748b", marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:900 }}>{value}</div>
    </div>
  );
}

function SettingsView({
  theme,
  value,
  onChange,
  onBack,
}: {
  theme: ReturnType<typeof getTheme>;
  value: Tournament;
  onChange: (v: Tournament) => void;
  onBack: () => void;
}) {
  // defaultní ikonky z /public/surfaces, přepínej pomocí uploadu (uloží do localStorage)
  const [icons, setIcons] = useState<Record<Tournament, string>>({
    RG: localStorage.getItem("gj.themeIcon.RG") || SURFACES.RG,
    WIM: localStorage.getItem("gj.themeIcon.WIM") || SURFACES.WIM,
    AO: localStorage.getItem("gj.themeIcon.AO") || SURFACES.AO,
  });

  function onPick(t: Tournament) {
    onChange(t);
  }

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
        <ThemeCard
          title="Roland Garros"
          sub="oranžová"
          color="#c1440e"
          selected={value === "RG"}
          icon={icons.RG}
          onPick={() => onPick("RG")}
          onUpload={(f) => onUpload("RG", f)}
        />
        <ThemeCard
          title="Wimbledon"
          sub="zelená"
          color="#1b5e20"
          selected={value === "WIM"}
          icon={icons.WIM}
          onPick={() => onPick("WIM")}
          onUpload={(f) => onUpload("WIM", f)}
        />
        <ThemeCard
          title="Australian Open"
          sub="modrá"
          color="#1565c0"
          selected={value === "AO"}
          icon={icons.AO}
          onPick={() => onPick("AO")}
          onUpload={(f) => onUpload("AO", f)}
        />
      </div>

      <div>
        <button onClick={onBack} style={{ ...btnOutline(theme) }}>◀ Zpět</button>
      </div>
    </div>
  );
}

function ThemeCard({
  title, sub, color, selected, icon, onPick, onUpload
}: {
  title: string;
  sub: string;
  color: string;
  selected: boolean;
  icon?: string;
  onPick: () => void;
  onUpload: (file?: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div
      onClick={onPick}
      style={{
        cursor: "pointer",
        background: "#fff",
        borderRadius: 12,
        padding: 12,
        border: `2px solid ${selected ? color : "#e2e8f0"}`,
        boxShadow: "0 2px 8px rgba(0,0,0,.06)",
        display: "grid",
        gridTemplateColumns: "64px 1fr",
        gap: 12,
        alignItems: "center",
      }}
    >
      <div
        onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
        title="Nahrát vlastní ikonku"
        style={{
          width: 64,
          height: 64,
          borderRadius: "12px",
          background: icon ? `center/cover no-repeat url(${icon})` : color,
          border: `3px solid ${color}`,
        }}
      />
      <div>
        <div style={{ fontWeight: 800 }}>{title}</div>
        <div style={{ color: "#64748b" }}>{sub}</div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => onUpload(e.target.files?.[0] || undefined)}
      />
    </div>
  );
}

/** ========= STYLY ========= */
const btn = (theme: ReturnType<typeof getTheme>) => ({
  background: theme.button,
  color: theme.buttonText,
  padding: "12px 14px",
  borderRadius: 12,
  border: "0",
  fontWeight: 800,
  boxShadow: `0 6px 18px ${theme.shadow}`,
  cursor: "pointer",
}) as React.CSSProperties;

const btnOutline = (theme: ReturnType<typeof getTheme>) => ({
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

function MenuItem({ label, onClick }: { label: React.ReactNode; onClick: () => void }) {
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

const menuIcon: React.CSSProperties = { width: 20, height: 20, objectFit: "contain", filter: "brightness(0) invert(1)" };
