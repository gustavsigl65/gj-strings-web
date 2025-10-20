import { useEffect, useMemo, useRef, useState } from "react";

/** ========= KONFIG ========= */
const API_BASE = import.meta.env.VITE_APPS_SCRIPT_URL || "";

/** ========= TYPY ========= */
type Detail = { kod: string; nazev?: string; majitel?: string; delka?: string; uzly?: string };
type HistoryRow = { datum?: string; typ?: string; napeti?: string };
type RacketItem = { kod: string; nazev?: string };
type StringItem = { kod: string; nazev?: string; mnozstvi: number };
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
  const [screen, setScreen] = useState<
    "home" | "detail" | "settings" | "owner" | "strings" | "pricing"
  >("home");

  const [tournament, setTournament] = useState<Tournament>("RG");
  useEffect(() => {
    const saved = localStorage.getItem("gj.tournament");
    if (saved === "RG" || saved === "WIM" || saved === "AO") setTournament(saved);
  }, []);
  const theme = useMemo(() => getTheme(tournament), [tournament]);

  const [kod, setKod] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const ownerName = detail?.majitel?.trim() || "";

  const [menuOpen, setMenuOpen] = useState(false);

  // QR skener
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
  }, []);

  async function startScanner() {
    try {
      if (!("mediaDevices" in navigator)) throw new Error("Kamera není dostupná.");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScannerOpen(true);

      const anyWin = window as any;
      const Detector = anyWin.BarcodeDetector
        ? new anyWin.BarcodeDetector({ formats: ["qr_code"] })
        : null;
      if (!Detector) throw new Error("QR skener není v tomto prohlížeči podporován.");

      const tick = async () => {
        if (!videoRef.current || !scannerOpen) return;
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
          // ignore
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
      const dRes = await fetch(`${API_BASE}?action=detail&kod=${encodeURIComponent(k)}`);
      const dRaw = await dRes.json();
      const d = dRaw?.detail ?? dRaw;
      if (!d || !d.kod) throw new Error("Detail neobsahuje očekávaná data.");
      setDetail({
        kod: d.kod,
        nazev: d.nazev,
        majitel: d.majitel,
        delka: d.delka,
        uzly: d.uzly,
      });

      const hRes = await fetch(`${API_BASE}?action=history&kod=${encodeURIComponent(k)}`);
      const hRaw = await hRes.json();
      const hArr: any[] = Array.isArray(hRaw?.history)
        ? hRaw.history
        : Array.isArray(hRaw)
        ? hRaw
        : [];
      setHistory(
        hArr.map((r) => ({
          datum: r.datum ?? "",
          typ: r.typ ?? "",
          napeti: r.napeti ?? "",
        }))
      );

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

  return (
    <div
      style={{
        minHeight: "100vh",
        background: theme.bg,
        color: theme.text,
        transition: "all .2s",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
      }}
    >
      <TopBar
        theme={theme}
        title="GJ Strings"
        leftAction={
          screen === "detail" ||
          screen === "owner" ||
          screen === "strings" ||
          screen === "pricing"
            ? {
                label: "◀ Zpět",
                onClick: () =>
                  screen === "detail" ? goHome() : setScreen(detail ? "detail" : "home"),
              }
            : undefined
        }
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
              width: 240,
              background: theme.primary,
              color: "white",
              borderRadius: 12,
              padding: 6,
              boxShadow: "0 8px 24px rgba(0,0,0,.35)",
            }}
          >
            <MenuItem label="Moje rakety" onClick={() => { setMenuOpen(false); setScreen("owner"); }} />
            <MenuItem label="Moje výplety" onClick={() => { setMenuOpen(false); setScreen("strings"); }} />
            <MenuItem label="Ceník" onClick={() => { setMenuOpen(false); setScreen("pricing"); }} />
            <MenuItem label="Nastavení" onClick={() => { setMenuOpen(false); setScreen("settings"); }} />
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
          <OwnerRacketsView theme={theme} ownerName={ownerName} apiBase={API_BASE} onOpenRacket={(k) => loadByKod(k)} />
        )}

        {screen === "strings" && (
          <OwnerStringsView theme={theme} ownerName={ownerName} apiBase={API_BASE} />
        )}

        {screen === "pricing" && <PricingView theme={theme} />}

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

/** ========= OBRAZOVKY ========= */
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
}: any) {
  return (
    <div style={{ display: "grid", gap: 16, alignItems: "start", justifyItems: "center" }}>
      {/* LOGO */}
      <div style={{ fontSize: 30, fontWeight: 900, marginTop: 16 }}>🎾 GJ Strings</div>

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

      <button
        onClick={() => setShowManual(!showManual)}
        style={{ background: "transparent", border: "0", color: theme.text, textDecoration: "underline", cursor: "pointer" }}
      >
        {showManual ? "Skrýt ruční zadání" : "Zadat kód ručně"}
      </button>

      {showManual && (
        <div style={{ width: "100%", maxWidth: 520, background: "#fff", borderRadius: 12, padding: 12, boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
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

      {scannerOpen && (
        <div onClick={onScannerClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 40, display: "grid", placeItems: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "92%", maxWidth: 520, background: "#000", borderRadius: 12, padding: 8 }}>
            <video ref={videoRef} style={{ width: "100%", borderRadius: 10 }} muted playsInline />
            <button onClick={onScannerClose} style={{ ...btnOutline(theme), width: "100%", marginTop: 8 }}>✖ Zavřít čtečku</button>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailView({ theme, detail, history, loading, err }: any) {
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
          history.map((r: any, i: number) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 8, padding: "8px 0", borderTop: "1px solid rgba(0,0,0,.08)" }}>
              <div>{r.datum}</div>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.typ}</div>
              <div>{r.napeti}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* --- zítra (část ③) sem navazuje OwnerRacketsView, OwnerStringsView, PricingView, SettingsView + styly --- */
/** ========= OBRAZOVKY (pokračování) ========= */

function OwnerRacketsView({
  theme,
  ownerName,
  apiBase,
  onOpenRacket,
}: {
  theme: ReturnType<typeof getTheme>;
  ownerName: string;               // z detailu (přihlášený majitel)
  apiBase: string;
  onOpenRacket: (kod: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<RacketItem[]>([]);

  useEffect(() => {
    if (!ownerName) return;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await fetch(`${apiBase}?action=racketsByOwner&majitel=${encodeURIComponent(ownerName)}`);
        const raw = await res.json();
        const arr: any[] = Array.isArray(raw?.rackets) ? raw.rackets : (Array.isArray(raw) ? raw : []);
        setItems(arr as RacketItem[]);
      } catch (e:any) {
        setErr(e?.message || String(e));
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [ownerName, apiBase]);

  if (!ownerName) {
    return <div style={{ color:"#64748b" }}>Nejprve naskenuj raketu (přihlášení), aby bylo jasné, kdo jsi.</div>;
  }

  return (
    <div style={{ display:"grid", gap:12 }}>
      <h1 style={{ fontSize:22, fontWeight:900 }}>Moje rakety</h1>

      {loading && <p>Načítám…</p>}
      {err && <p style={{ color:"#dc2626" }}>{err}</p>}

      <ul style={{ display:"grid", gap:8 }}>
        {items.map((r)=>(
          <li
            key={r.kod}
            onClick={()=>onOpenRacket(r.kod)}
            style={{ background:theme.card, border:`1px solid ${theme.accent}`, borderRadius:12, padding:12, cursor:"pointer" }}
          >
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
  ownerName: string;   // z detailu (přihlášený majitel)
  apiBase: string;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<StringItem[]>([]);

  useEffect(() => {
    if (!ownerName) return;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await fetch(`${apiBase}?action=stringsByOwner&majitel=${encodeURIComponent(ownerName)}`);
        const raw = await res.json();
        const arr: any[] = Array.isArray(raw?.strings) ? raw.strings : (Array.isArray(raw) ? raw : []);
        setItems(arr as StringItem[]);
      } catch (e:any) {
        setErr(e?.message || String(e));
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [ownerName, apiBase]);

  if (!ownerName) {
    return <div style={{ color:"#64748b" }}>Nejprve naskenuj raketu (přihlášení), aby bylo jasné, kdo jsi.</div>;
  }

  return (
    <div style={{ display:"grid", gap:12 }}>
      <h1 style={{ fontSize:22, fontWeight:900 }}>Moje výplety</h1>

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
      <h1 style={{ fontSize:22, fontWeight:900 }}>Ceník</h1>

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

function SettingsView({
  theme,
  value,
  onChange,
  onBack,
}: {
  theme: ReturnType<typeof getTheme>;
  value: Tournament;   // RG=antuka, AO=modrý beton, WIM=tráva
  onChange: (v: Tournament) => void;
  onBack: () => void;
}) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 900 }}>Nastavení vzhledu</h1>
      <p style={{ marginTop: -6, color: "#64748b" }}>Vyber povrch – aplikace změní barvy podle něj.</p>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <SurfaceTile
          title="Antuka (Roland Garros)"
          img="/surfaces/antuka.jpg"
          selected={value === "RG"}
          onClick={() => {
            onChange("RG");
            localStorage.setItem("gj.tournament", "RG");
          }}
          badgeColor="#c1440e"
        />
        <SurfaceTile
          title="Modrý beton (Australian Open)"
          img="/surfaces/modry-beton.jpg"
          selected={value === "AO"}
          onClick={() => {
            onChange("AO");
            localStorage.setItem("gj.tournament", "AO");
          }}
          badgeColor="#1565c0"
        />
        <SurfaceTile
          title="Tráva (Wimbledon)"
          img="/surfaces/trava.jpg"
          selected={value === "WIM"}
          onClick={() => {
            onChange("WIM");
            localStorage.setItem("gj.tournament", "WIM");
          }}
          badgeColor="#1b5e20"
        />
      </div>

      <div>
        <button onClick={onBack} style={{ ...btnOutline(theme) }}>◀ Zpět</button>
      </div>
    </div>
  );
}

function SurfaceTile({
  title,
  img,
  selected,
  onClick,
  badgeColor,
}: {
  title: string;
  img: string;
  selected: boolean;
  onClick: () => void;
  badgeColor: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: "left",
        cursor: "pointer",
        background: "#fff",
        borderRadius: 14,
        padding: 10,
        border: `2px solid ${selected ? badgeColor : "#e2e8f0"}`,
        boxShadow: "0 2px 10px rgba(0,0,0,.06)",
      }}
    >
      <div
        style={{
          width: "100%",
          height: 120,
          borderRadius: 10,
          background: `center/cover no-repeat url(${img})`,
          border: `2px solid ${badgeColor}`,
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: badgeColor,
            boxShadow: "0 0 0 2px #ffffff, 0 0 0 4px rgba(0,0,0,.06)",
          }}
        />
        <div style={{ fontWeight: 800 }}>{title}</div>
      </div>
      {selected && <div style={{ marginTop: 6, color: "#16a34a", fontSize: 13 }}>✓ Aktuálně vybráno</div>}
    </button>
  );
}

/** ========= STYLY & HELPERY ========= */

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

const btnGhost: React.CSSProperties = {
  background: "transparent",
  color: "white",
  padding: "6px 10px",
  borderRadius: 8,
  border: "0",
  fontWeight: 700,
  cursor: "pointer",
};
