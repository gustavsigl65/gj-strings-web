import { useEffect, useMemo, useRef, useState } from "react";
import QRScanner from "./QRScanner";

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
        bg: "#e7f3ea",
        text: "#0d2c12",
        card: "#ffffff",
        accent: "#cfead4",
        shadow: "rgba(27,94,32,0.25)",
        button: "#1b5e20",
        buttonText: "#ffffff",
      };
    case "AO":
      return {
        name: "Australian Open",
        primary: "#1565c0",
        bg: "#e7f2fe",
        text: "#0d2c53",
        card: "#ffffff",
        accent: "#cfe1fb",
        shadow: "rgba(21,101,192,0.25)",
        button: "#1565c0",
        buttonText: "#ffffff",
      };
    default: // RG
      return {
        name: "Roland Garros",
        primary: "#c1440e",
        bg: "#fff1ea",
        text: "#2b1a12",
        card: "#ffffff",
        accent: "#ffd8c5",
        shadow: "rgba(193,68,14,.25)",
        button: "#c1440e",
        buttonText: "#ffffff",
      };
  }
}

/** ========= HLAVNÍ APP ========= */
export default function App() {
  // obrazovky
  const [screen, setScreen] = useState<
    "home" | "detail" | "settings" | "owner" | "strings" | "pricing" | "stats"
  >("home");

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

  // QR overlay
  const [scannerOpen, setScannerOpen] = useState(false);

  async function onCodeScanned(value: string) {
    await loadByKod(value);
    setScannerOpen(false);
  }

  async function loadByKod(k: string) {
    const code = (k || "").trim();
    if (!code) return;
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
      const dRes = await fetch(`${API_BASE}?action=detail&kod=${encodeURIComponent(code)}`);
      const dRaw = await dRes.json();
      const d = dRaw?.detail ?? dRaw;
      if (!d || !d.kod) throw new Error("Detail neobsahuje očekávaná data.");
      setDetail({ kod: d.kod, nazev: d.nazev, majitel: d.majitel, delka: d.delka, uzly: d.uzly });

      // HISTORIE
      const hRes = await fetch(`${API_BASE}?action=history&kod=${encodeURIComponent(code)}`);
      const hRaw = await hRes.json();
      const hArr: any[] = Array.isArray(hRaw?.history) ? hRaw.history : Array.isArray(hRaw) ? hRaw : [];
      setHistory(hArr.map((r) => ({ datum: r.datum ?? "", typ: r.typ ?? "", napeti: r.napeti ?? "" })));

      setKod(code);
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
    setScreen("home");
  }

  // ===== RENDER =====
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
      {/* horní lišta */}
      <TopBar
        theme={theme}
        title="GJ Strings"
        leftAction={
          screen === "detail" ||
          screen === "owner" ||
          screen === "strings" ||
          screen === "pricing" ||
          screen === "settings" ||
          screen === "stats"
            ? { label: "◀ Zpět", onClick: () => (screen === "detail" ? goHome() : setScreen(detail ? "detail" : "home")) }
            : undefined
        }
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
            <MenuItem label="🎾 Moje rakety" onClick={() => { setMenuOpen(false); setScreen("owner"); }} />
            <MenuItem label="🧵 Moje výplety" onClick={() => { setMenuOpen(false); setScreen("strings"); }} />
            <MenuItem label="📈 Statistiky" onClick={() => { setMenuOpen(false); setScreen("stats"); }} />
            <MenuItem label="💰 Ceník" onClick={() => { setMenuOpen(false); setScreen("pricing"); }} />
            <MenuItem label="⚙️ Nastavení" onClick={() => { setMenuOpen(false); setScreen("settings"); }} />
          </div>
        </div>
      )}

      {/* sjednocená šířka všech obrazovek */}
      <div style={containerStyle}>
        {screen === "home" && (
          <HomeLanding
            theme={theme}
            onScanClick={() => setScannerOpen(true)}
            onPickImage={decodeFromImage}
            setErr={setErr}
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

      {/* QR OVERLAY */}
      {scannerOpen && (
        <QRScanner
          onDetected={(value) => onCodeScanned(value)}
          onClose={() => setScannerOpen(false)}
        />
      )}
    </div>
  );
}

/** ========= POMOCNÉ ========= */

// fallback dekódování z obrázku přes BarcodeDetector (když je k dispozici)
async function decodeFromImage(file: File): Promise<string | null> {
  try {
    const anyWin = window as any;
    if (!anyWin.BarcodeDetector) return null;

    const bmp = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0);
    const detector = new anyWin.BarcodeDetector({ formats: ["qr_code"] });
    const codes = await detector.detect(canvas);
    return codes?.[0]?.rawValue || null;
  } catch {
    return null;
  }
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
  onScanClick,
  onPickImage,
  setErr,
  err,
}: {
  theme: ReturnType<typeof getTheme>;
  onScanClick: () => void;
  onPickImage: (file: File) => Promise<string | null>;
  setErr: (e: string | null) => void;
  err: string | null;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setErr(null);
    const value = await onPickImage(f);
    if (value) {
      const ev = new CustomEvent("qr-image-decoded", { detail: value });
      window.dispatchEvent(ev);
    } else {
      setErr("Obrázek se nepodařilo přečíst. Zkus jej vyfotit ostřeji nebo použij živé skenování.");
    }
  }

  useEffect(() => {
    const h = (e: any) => {
      const txt = String(e.detail || "");
      if (!txt) return;
      const ce = new CustomEvent("qr-detected", { detail: txt });
      window.dispatchEvent(ce);
    };
    window.addEventListener("qr-image-decoded" as any, h);
    return () => window.removeEventListener("qr-image-decoded" as any, h);
  }, []);

  return (
    <div style={{ display: "grid", gap: 16, alignItems: "start", justifyItems: "center" }}>
      <div style={{ fontSize: 34, fontWeight: 900, marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 36 }}>🔎</span> GJ Strings
      </div>

      <button onClick={onScanClick} style={{ ...btn(theme), width: "100%" }}>
        📷 Skenovat QR kód
      </button>

      <button
        onClick={() => fileRef.current?.click()}
        style={{ ...btnOutline(theme), width: "100%" }}
      >
        🖼️ Vyfotit / vybrat obrázek s QR
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFile}
        style={{ display: "none" }}
      />

      {err && <p style={{ color: "#dc2626", marginTop: 8 }}>{err}</p>}

      <p style={{ fontSize: 12, color: "#586b7a", textAlign: "center" }}>
        Pokud živé skenování selže nebo není podporováno, použij vyfocení/galerii.
      </p>
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
        <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 8 }}>
          {detail.nazev || detail.kod}
        </div>
        <div style={{ display: "grid", rowGap: 8, fontSize: 16 }}>
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
        <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 18 }}>Historie vypletení</div>
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
                padding: "10px 0",
                borderTop: "1px solid rgba(0,0,0,.08)",
                alignItems: "center",
              }}
            >
              <div style={{ fontFeatureSettings: "'tnum' 1" }}>{row.datum}</div>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.typ}</div>
              <div style={{ justifySelf: "end" }}>{row.napeti}</div>
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
      <h1 style={{ fontSize:24, fontWeight:900, display:"flex", alignItems:"center", gap:8 }}>🎾 Moje rakety</h1>

      {loading && <p>Načítám…</p>}
      {err && <p style={{ color:"#dc2626" }}>{err}</p>}

      <ul style={{ display:"grid", gap:10 }}>
        {items.map((r)=>(
          <li key={r.kod}
              onClick={()=>onOpenRacket(r.kod)}
              style={{ background:theme.card, border:`1px solid ${theme.accent}`, borderRadius:12, padding:14, cursor:"pointer", boxShadow:`0 2px 8px ${theme.shadow}` }}>
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
      <h1 style={{ fontSize:24, fontWeight:900, display:"flex", alignItems:"center", gap:8 }}>🧵 Moje výplety</h1>
      {loading && <p>Načítám…</p>}
      {err && <p style={{ color:"#dc2626" }}>{err}</p>}

      <ul style={{ display:"grid", gap:10 }}>
        {items.map((s)=>(
          <li key={s.kod} style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, padding:14 }}>
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
      <h1 style={{ fontSize:24, fontWeight:900, display:"flex", alignItems:"center", gap:8 }}>💰 Ceník</h1>

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
  const [owner, setOwner] = useState(ownerName);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [mostString, setMostString] = useState<string>("-");
  const [mostTension, setMostTension] = useState<string>("-");
  const [byMonth, setByMonth] = useState<Array<{ month: string; count: number }>>([]);

  useEffect(() => {
    setOwner(ownerName);
    if (ownerName) load(ownerName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerName]);

  async function load(m: string) {
    if (!m.trim()) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`${apiBase}?action=statsByOwner&majitel=${encodeURIComponent(m.trim())}`);
      const data = await res.json();
      setTotal(Number(data?.total ?? 0));
      setMostString(String(data?.mostString ?? "-"));
      setMostTension(String(data?.mostTension ?? "-"));
      const arr: any[] = Array.isArray(data?.byMonth) ? data.byMonth : [];
      setByMonth(arr.map((x) => ({ month: String(x.month), count: Number(x.count) })));
    } catch (e: any) {
      setErr(e?.message || String(e));
      setTotal(0);
      setMostString("-");
      setMostTension("-");
      setByMonth([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display:"grid", gap:12 }}>
      <h1 style={{ fontSize:24, fontWeight:900, display:"flex", alignItems:"center", gap:8 }}>📈 Statistiky</h1>

      <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, padding:12 }}>
        <div style={{ marginBottom:10 }}><b>Majitel:</b> {owner || "-"}</div>
        <button onClick={()=>load(owner)} style={btn(theme)}>Načíst / Obnovit</button>

        {loading && <p style={{ marginTop:10 }}>Načítám…</p>}
        {err && <p style={{ marginTop:10, color:"#dc2626" }}>{err}</p>}

        {!loading && !err && (
          <div style={{ marginTop:12, display:"grid", gap:10 }}>
            <div><b>Celkem vypletení:</b> {total}</div>
            <div><b>Nejobvyklejší výplet:</b> {mostString}</div>
            <div><b>Nejobvyklejší napětí:</b> {mostTension}</div>
            <div style={{ marginTop:4 }}>
              <b>Po měsících:</b>
              <ul style={{ marginTop:6 }}>
                {byMonth.map((r) => (
                  <li key={r.month}>{r.month}: {r.count}</li>
                ))}
                {byMonth.length === 0 && <li>—</li>}
              </ul>
            </div>
          </div>
        )}
      </div>
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
  value: Tournament;
  onChange: (v: Tournament) => void;
  onBack: () => void;
}) {
  const [icons, setIcons] = useState<Record<Tournament, string>>({
    RG: localStorage.getItem("gj.themeIcon.RG") || "",
    WIM: localStorage.getItem("gj.themeIcon.WIM") || "",
    AO: localStorage.getItem("gj.themeIcon.AO") || "",
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
      <h1 style={{ fontSize: 24, fontWeight: 900 }}>Nastavení vzhledu</h1>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <ThemeCard title="Roland Garros" sub="oranžová" color="#c1440e" selected={value === "RG"} icon={icons.RG} onPick={() => onPick("RG")} onUpload={(f) => onUpload("RG", f)} />
        <ThemeCard title="Wimbledon" sub="zelená" color="#1b5e20" selected={value === "WIM"} icon={icons.WIM} onPick={() => onPick("WIM")} onUpload={(f) => onUpload("WIM", f)} />
        <ThemeCard title="Australian Open" sub="modrá" color="#1565c0" selected={value === "AO"} icon={icons.AO} onPick={() => onPick("AO")} onUpload={(f) => onUpload("AO", f)} />
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
          borderRadius: "50%",
          background: icon ? `center/cover no-repeat url(${icon})` : color,
          border: `3px solid ${color}`,
        }}
      />
      <div>
        <div style={{ fontWeight: 800 }}>{title}</div>
        <div style={{ color: "#64748b" }}>{sub}</div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => onUpload(e.target.files?.[0] || undefined)} />
    </div>
  );
}

/** ========= STYLY ========= */
const containerStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 720, // stejné pro všechny obrazovky
  margin: "0 auto",
  padding: 16,
  boxSizing: "border-box",
};

const btn = (theme: ReturnType<typeof getTheme>) => ({
  background: theme.button,
  color: theme.buttonText,
  padding: "14px 16px",
  borderRadius: 12,
  border: "0",
  fontWeight: 800,
  boxShadow: `0 6px 18px ${theme.shadow}`,
  cursor: "pointer",
}) as React.CSSProperties;

const btnOutline = (theme: ReturnType<typeof getTheme>) => ({
  background: "transparent",
  color: theme.text,
  padding: "12px 14px",
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
