// src/App.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";

/* =============== KONFIG =============== */
const API_BASE = import.meta.env.VITE_APPS_SCRIPT_URL || "";

/* =============== TYPY =============== */
type Detail = { kod: string; nazev?: string; majitel?: string; delka?: string; uzly?: string };
type HistoryRow = { datum?: string; typ?: string; napeti?: string };
type RacketItem = { kod: string; nazev?: string };
type StringItem = { kod: string; nazev?: string; mnozstvi: number };
type Stats = { total: number; commonString: string; commonTension: string; byMonth: { month: string; count: number }[] };
type Tournament = "RG" | "WIM" | "AO";

/* =============== TÉMATA =============== */
function getTheme(t: Tournament) {
  switch (t) {
    case "WIM":
      return { name: "Wimbledon", primary: "#1e6f2e", bg: "#eaf6ee", text: "#0c2913", card: "#fff", accent: "#cfead6", shadow: "rgba(30,111,46,.25)", button: "#1e6f2e", buttonText: "#fff" };
    case "AO":
      return { name: "Australian Open", primary: "#1565c0", bg: "#e8f2ff", text: "#0c2b53", card: "#fff", accent: "#cfe1ff", shadow: "rgba(21,101,192,.25)", button: "#1565c0", buttonText: "#fff" };
    default:
      return { name: "Roland Garros", primary: "#c1440e", bg: "#fff4ee", text: "#2a1a12", card: "#fff", accent: "#ffd7c2", shadow: "rgba(193,68,14,.25)", button: "#ff7a1a", buttonText: "#fff" };
  }
}

/* =============== APP =============== */
export default function App() {
  const [screen, setScreen] = useState<"home" | "detail" | "owner" | "strings" | "pricing" | "settings" | "stats">("home");

  // theme
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

  // ===== QR SCANNER =====
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectTimer = useRef<number | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [lastFocusPoint, setLastFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const overlayBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => () => stopScanner(), []);

  async function startScanner() {
    try {
      if (!("mediaDevices" in navigator)) throw new Error("Kamera není dostupná");

      // preferovaná zadní hlavní kamera (žádný ultra-wide)
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          // držíme rozumný poměr stran
          aspectRatio: { ideal: 16 / 9 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) throw new Error("Video element nenalezen.");
      video.srcObject = stream;
      await video.play();

      // zoom (když lze)
      try {
        const track = stream.getVideoTracks()[0];
        const caps: any = track.getCapabilities?.() || {};
        if (typeof caps.zoom === "object") {
          const target = Math.min(caps.zoom.max ?? 2, 2.0);
          await track.applyConstraints({ advanced: [{ zoom: target }] } as any);
        }
        // autofocus
        await enableAutofocus(track);
      } catch (zerr) {
        console.warn("Zařízení nepodporuje zoom/ostření:", zerr);
      }

      setScannerOpen(true);
      startDetectLoop();
    } catch (e: any) {
      setErr(e?.message || String(e));
      stopScanner();
    }
  }

  function startDetectLoop() {
    const tick = async () => {
      if (!videoRef.current || !scannerOpen) return;
      try {
        // moderní BarcodeDetector (rychlejší než canvas)
        const Any = window as any;
        if (Any.BarcodeDetector) {
          const det = new Any.BarcodeDetector({ formats: ["qr_code"] });
          const codes = await det.detect(videoRef.current);
          if (codes?.length) {
            const value = (codes[0].rawValue || "").trim();
            if (value) {
              await onCodeScanned(value);
              return;
            }
          }
        }
      } catch {}
      detectTimer.current = window.setTimeout(tick, 160);
    };
    tick();
  }

  async function enableAutofocus(track: MediaStreamTrack) {
    const caps: any = track.getCapabilities?.() || {};
    const adv: any[] = [];
    if (caps.focusMode?.includes?.("continuous")) adv.push({ focusMode: "continuous" });
    else if (caps.focusMode?.includes?.("single-shot")) adv.push({ focusMode: "single-shot" });
    if (adv.length) {
      try { await track.applyConstraints({ advanced: adv } as any); } catch {}
    }
    // středový bod (když je ImageCapture)
    try {
      const IC: any = (window as any).ImageCapture;
      if (IC) {
        const ic = new IC(track);
        if (ic.setOptions) await ic.setOptions({ pointsOfInterest: [{ x: 0.5, y: 0.5 }] });
      }
    } catch {}
  }

  async function tapToFocus(e: React.MouseEvent) {
    if (!overlayBoxRef.current) return;
    const r = overlayBoxRef.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    setLastFocusPoint({ x, y });

    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const IC: any = (window as any).ImageCapture;
      if (IC) {
        const ic = new IC(track);
        if (ic.setOptions) await ic.setOptions({ pointsOfInterest: [{ x, y }] });
      }
      const caps: any = track.getCapabilities?.() || {};
      if (caps.focusMode?.includes?.("single-shot")) {
        try { await track.applyConstraints({ advanced: [{ focusMode: "single-shot" }] } as any); } catch {}
        await new Promise(r => setTimeout(r, 120));
      }
      if (caps.focusMode?.includes?.("continuous")) {
        try { await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] } as any); } catch {}
      }
    } catch {}
  }

  function stopScanner() {
    if (detectTimer.current) { clearTimeout(detectTimer.current); detectTimer.current = null; }
    const v = videoRef.current;
    if (v) { try { v.pause(); } catch {} v.srcObject = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setScannerOpen(false);
    setLastFocusPoint(null);
  }

  async function onCodeScanned(value: string) {
    stopScanner();
    await loadByKod(value);
  }

  async function loadByKod(k: string) {
    if (!API_BASE) { setErr("Chybí VITE_APPS_SCRIPT_URL v .env"); return; }
    setLoading(true); setErr(null); setDetail(null); setHistory([]);
    try {
      const dRes = await fetch(`${API_BASE}?action=detail&kod=${encodeURIComponent(k)}`);
      const dRaw = await dRes.json();
      const d = dRaw?.detail ?? dRaw;
      if (!d || !d.kod) throw new Error("Detail neobsahuje očekávaná data.");
      setDetail({ kod: d.kod, nazev: d.nazev, majitel: d.majitel, delka: d.delka, uzly: d.uzly });

      const hRes = await fetch(`${API_BASE}?action=history&kod=${encodeURIComponent(k)}`);
      const hRaw = await hRes.json();
      const hArr: any[] = Array.isArray(hRaw?.history) ? hRaw.history : (Array.isArray(hRaw) ? hRaw : []);
      setHistory(hArr.map(r => ({ datum: r.datum ?? "", typ: r.typ ?? "", napeti: r.napeti ?? "" })));

      setKod(k);
      setScreen("detail");
    } catch (e: any) {
      setErr(e?.message || String(e));
      setDetail(null); setHistory([]);
    } finally { setLoading(false); }
  }

  function goHome() {
    setDetail(null); setHistory([]); setKod(""); stopScanner(); setScreen("home");
  }

  /* =============== RENDER =============== */
  return (
    <div style={{ minHeight: "100vh", background: theme.bg, color: theme.text, transition: "all .2s", fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif" }}>
      <TopBar
        theme={theme}
        title="GJ Strings"
        leftAction={screen !== "home" ? { label: "◀ Zpět", onClick: () => (screen === "detail" ? goHome() : setScreen(detail ? "detail" : "home")) } : undefined}
        rightAction={{ label: "⋮", onClick: () => setMenuOpen(v => !v) }}
      />

      {menuOpen && (
        <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 30 }}>
          <div onClick={(e) => e.stopPropagation()}
               style={{ position: "absolute", top: 56, right: 12, width: 260, background: theme.primary, color: "#fff", borderRadius: 14, padding: 6, boxShadow: "0 10px 30px rgba(0,0,0,.35)" }}>
            <MenuItem label="🏸 Moje rakety" onClick={() => { setMenuOpen(false); setScreen("owner"); }} />
            <MenuItem label="🧵 Moje výplety" onClick={() => { setMenuOpen(false); setScreen("strings"); }} />
            <MenuItem label="📈 Statistiky" onClick={() => { setMenuOpen(false); setScreen("stats"); }} />
            <MenuItem label="🏷️ Ceník" onClick={() => { setMenuOpen(false); setScreen("pricing"); }} />
            <MenuItem label="⚙️ Nastavení" onClick={() => { setMenuOpen(false); setScreen("settings"); }} />
          </div>
        </div>
      )}

      <Container>
        {screen === "home" && (
          <HomeLanding
            theme={theme}
            onScanClick={startScanner}
            err={err}
          />
        )}

        {screen === "detail" && detail && (
          <DetailView theme={theme} detail={detail} history={history} loading={loading} err={err} />
        )}

        {screen === "owner" && (
          <OwnerRacketsView theme={theme} ownerName={ownerName} apiBase={API_BASE} onOpenRacket={(k) => loadByKod(k)} />
        )}

        {screen === "strings" && <OwnerStringsView theme={theme} ownerName={ownerName} apiBase={API_BASE} />}

        {screen === "pricing" && <PricingView theme={theme} />}

        {screen === "stats" && <StatsView theme={theme} ownerName={ownerName} apiBase={API_BASE} />}

        {screen === "settings" && (
          <SettingsView theme={theme} value={tournament} onChange={(v) => { setTournament(v); localStorage.setItem("gj.tournament", v); }} onBack={() => (detail ? setScreen("detail") : setScreen("home"))} />
        )}
      </Container>

      {/* QR overlay */}
      {scannerOpen && (
        <div onClick={stopScanner} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 40, display: "grid", placeItems: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "92%", maxWidth: 540, background: "#000", borderRadius: 12, padding: 8 }}>
            <div ref={overlayBoxRef} onClick={tapToFocus} style={{ position: "relative", borderRadius: 10, overflow: "hidden", cursor: "crosshair" }} title="Klepni pro zaostření">
              <video ref={videoRef} style={{ width: "100%", display: "block" }} muted playsInline />
              {lastFocusPoint && (
                <div style={{ position: "absolute", left: `calc(${lastFocusPoint.x * 100}% - 22px)`, top: `calc(${lastFocusPoint.y * 100}% - 22px)`, width: 44, height: 44, border: "2px solid #4ade80", borderRadius: "50%", boxShadow: "0 0 0 2px rgba(74,222,128,.35)" }} />
              )}
            </div>
            <button onClick={stopScanner} style={{ ...btnOutline(theme), width: "100%", marginTop: 8 }}>✖ Zavřít čtečku</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* =============== LAYOUT =============== */
function Container({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ width: "100%", maxWidth: 960, margin: "0 auto", padding: "16px 16px 32px" }}>
      {children}
    </div>
  );
}

/* =============== UI BLOKY =============== */
function TopBar({ theme, title, leftAction, rightAction }: { theme: ReturnType<typeof getTheme>; title: string; leftAction?: { label: string; onClick: () => void }; rightAction?: { label: string; onClick: () => void } }) {
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 10, background: theme.primary, color: "white", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", boxShadow: `0 2px 8px ${theme.shadow}` }}>
      <div>{leftAction ? <button onClick={leftAction.onClick} style={btnGhost}>{leftAction.label}</button> : <strong>{title}</strong>}</div>
      <div>{rightAction && <button onClick={rightAction.onClick} style={btnGhost} aria-label="menu">{rightAction.label}</button>}</div>
    </div>
  );
}

function HomeLanding({ theme, onScanClick, err }: { theme: ReturnType<typeof getTheme>; onScanClick: () => void; err: string | null; }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ fontSize: 34, fontWeight: 900, textAlign: "center", marginTop: 6 }}>🔎 GJ Strings</div>
      <button onClick={onScanClick} style={{ ...btn(theme), width: "100%", padding: "16px 18px" }}>📷 Skenovat QR kód</button>

      <input
        type="file"
        accept="image/*"
        capture="environment"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const url = URL.createObjectURL(file);
          const img = new Image();
          img.onload = async () => {
            const cvs = document.createElement("canvas");
            cvs.width = img.width; cvs.height = img.height;
            const ctx = cvs.getContext("2d")!;
            ctx.drawImage(img, 0, 0);
            const imgData = ctx.getImageData(0, 0, cvs.width, cvs.height);
            const { default: jsQR } = await import("jsqr");
            const code = jsQR(imgData.data, imgData.width, imgData.height);
            if (code?.data) window.location.href = `/?k=${encodeURIComponent(code.data)}`; // necháme načíst z URL, app si to přečte
          };
          img.src = url;
        }}
        style={{ display: "none" }}
        id="qrfile"
      />
      <label htmlFor="qrfile" style={{ ...btnOutline(theme), textAlign: "center", cursor: "pointer", padding: "12px 14px" }}>🖼️ Vyfotit / vybrat obrázek s QR</label>

      {err && <p style={{ color: "#dc2626" }}>{err}</p>}
      <p style={{ fontSize: 12, color: "#475569", textAlign: "center" }}>Pokud živé skenování selže nebo není podporováno, použij vyfocení/galerii.</p>
    </div>
  );
}

function DetailView({ theme, detail, history, loading, err }: { theme: ReturnType<typeof getTheme>; detail: Detail; history: HistoryRow[]; loading: boolean; err: string | null; }) {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card theme={theme}>
        <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 8 }}>{detail.nazev || detail.kod}</div>
        <div style={{ display: "grid", rowGap: 8, fontSize: 16 }}>
          <div><b>Kód:</b> {detail.kod}</div>
          <div><b>Majitel:</b> {detail.majitel || "-"}</div>
          <div><b>Délka strun:</b> {detail.delka || "-"}</div>
          <div><b>Uzlů:</b> {detail.uzly || "-"}</div>
        </div>
      </Card>

      <Card theme={theme}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Historie vypletení</div>
        {loading && <div>Načítám…</div>}
        {err && <div style={{ color: "#dc2626" }}>{err}</div>}
        {history.length === 0 ? (
          <div style={{ color: "#64748b" }}>Žádná data.</div>
        ) : (
          history.map((row, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 8, padding: "12px 0", borderTop: "1px solid rgba(0,0,0,.08)" }}>
              <div>{row.datum}</div>
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.typ}</div>
              <div>{row.napeti}</div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

function OwnerRacketsView({ theme, ownerName, apiBase, onOpenRacket }: { theme: ReturnType<typeof getTheme>; ownerName: string; apiBase: string; onOpenRacket: (kod: string) => void; }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<RacketItem[]>([]);
  useEffect(() => { if (ownerName) load(ownerName); }, [ownerName]);

  async function load(m: string) {
    try {
      setLoading(true); setErr(null);
      const res = await fetch(`${apiBase}?action=racketsByOwner&majitel=${encodeURIComponent(m)}`);
      const raw = await res.json();
      const arr: any[] = Array.isArray(raw?.rackets) ? raw.rackets : (Array.isArray(raw) ? raw : []);
      setItems(arr as RacketItem[]);
    } catch (e: any) { setErr(e?.message || String(e)); setItems([]); } finally { setLoading(false); }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h1 style={{ fontSize: 24, fontWeight: 900 }}>Moje rakety</h1>
      <Card theme={theme}>
        <div style={{ fontSize: 14, color: "#64748b" }}>Majitel</div>
        <div style={{ fontWeight: 700 }}>{ownerName || "-"}</div>
        <button onClick={() => load(ownerName)} style={{ ...btn(theme), marginTop: 10 }}>Načíst / Obnovit</button>
        {loading && <p>Načítám…</p>}
        {err && <p style={{ color: "#dc2626" }}>{err}</p>}
      </Card>

      <ul style={{ display: "grid", gap: 8, margin: 0, padding: 0, listStyle: "none" }}>
        {items.map((r) => (
          <li key={r.kod} onClick={() => onOpenRacket(r.kod)} style={{ ...listCard(theme), cursor: "pointer" }}>
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
  useEffect(() => { if (ownerName) load(ownerName); }, [ownerName]);

  async function load(m: string) {
    try {
      setLoading(true); setErr(null);
      const res = await fetch(`${apiBase}?action=stringsByOwner&majitel=${encodeURIComponent(m)}`);
      const raw = await res.json();
      const arr: any[] = Array.isArray(raw?.strings) ? raw.strings : (Array.isArray(raw) ? raw : []);
      setItems(arr as StringItem[]);
    } catch (e: any) { setErr(e?.message || String(e)); setItems([]); } finally { setLoading(false); }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h1 style={{ fontSize: 24, fontWeight: 900 }}>Moje výplety</h1>
      <Card theme={theme}>
        <div style={{ fontSize: 14, color: "#64748b" }}>Majitel</div>
        <div style={{ fontWeight: 700 }}>{ownerName || "-"}</div>
        <button onClick={() => load(ownerName)} style={{ ...btn(theme), marginTop: 10 }}>Načíst / Obnovit</button>
        {loading && <p>Načítám…</p>}
        {err && <p style={{ color: "#dc2626" }}>{err}</p>}
      </Card>

      <ul style={{ display: "grid", gap: 8, margin: 0, padding: 0, listStyle: "none" }}>
        {items.map((s) => (
          <li key={s.kod} style={listCard(theme)}>
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

function StatsView({ theme, ownerName, apiBase }: { theme: ReturnType<typeof getTheme>; ownerName: string; apiBase: string; }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  async function load() {
    if (!ownerName) return;
    try {
      setLoading(true); setErr(null);
      const res = await fetch(`${apiBase}?action=statistics&majitel=${encodeURIComponent(ownerName)}`);
      const raw = await res.json();
      const s: Stats = {
        total: raw?.total ?? 0,
        commonString: raw?.commonString ?? "-",
        commonTension: raw?.commonTension ?? "-",
        byMonth: Array.isArray(raw?.byMonth) ? raw.byMonth : [],
      };
      setStats(s);
    } catch (e: any) { setErr(e?.message || String(e)); setStats(null); } finally { setLoading(false); }
  }

  useEffect(() => { if (ownerName) load(); }, [ownerName]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h1 style={{ fontSize: 24, fontWeight: 900 }}>📈 Statistiky</h1>
      <Card theme={theme}>
        <div style={{ marginBottom: 8 }}><b>Majitel:</b> {ownerName || "-"}</div>
        <button onClick={load} style={{ ...btn(theme) }}>Načíst / Obnovit</button>
      </Card>

      <Card theme={theme}>
        {loading && <p>Načítám…</p>}
        {err && <p style={{ color: "#dc2626" }}>{err}</p>}
        {stats && (
          <>
            <div style={{ marginBottom: 10 }}><b>Celkem vypletení:</b> {stats.total}</div>
            <div style={{ marginBottom: 10 }}><b>Nejobvyklejší výplet:</b> {stats.commonString}</div>
            <div style={{ marginBottom: 10 }}><b>Nejobvyklejší napětí:</b> {stats.commonTension}</div>
            <div><b>Po měsících:</b></div>
            <ul>
              {stats.byMonth.map((m) => <li key={m.month}>{m.month}: {m.count}</li>)}
              {stats.byMonth.length === 0 && <li>—</li>}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}

function PricingView({ theme }: { theme: ReturnType<typeof getTheme> }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h1 style={{ fontSize: 24, fontWeight: 900 }}>🏷️ Ceník</h1>

      <details open style={sectionCard(theme)}>
        <summary style={summaryRow}>🧵 <b style={{ marginLeft: 8 }}>Vyplétání</b> <span style={{ marginLeft: "auto" }}>›</span></summary>
        <div style={{ padding: "10px 12px" }}>
          <PriceRow label="Standardní vypletení" price="150 Kč" note="běžný termín" />
          <PriceRow label="Expresní vypletení (do 90 minut)" price="180 Kč" note="rychlé zpracování" />
        </div>
      </details>

      <details style={sectionCard(theme)}>
        <summary style={summaryRow}>🎾 <b style={{ marginLeft: 8 }}>Výplety</b> <span style={{ marginLeft: "auto" }}>›</span></summary>
        <div style={{ padding: "10px 12px" }}>
          <PriceRow label="Babolat RPM Rough 1.25" price="300 Kč" />
          <PriceRow label="Luxilon Alu Power 1.25" price="380 Kč" />
          <PriceRow label="Yonex PolyTour Pro 1.25" price="320 Kč" />
        </div>
      </details>

      <details style={sectionCard(theme)}>
        <summary style={summaryRow}>🖐️ <b style={{ marginLeft: 8 }}>Omotávky</b> <span style={{ marginLeft: "auto" }}>›</span></summary>
        <div style={{ padding: "10px 12px" }}>
          <PriceRow label="Yonex Super Grap (1 ks)" price="70 Kč" />
          <PriceRow label="Wilson Pro Overgrip (1 ks)" price="80 Kč" />
        </div>
      </details>

      <details style={sectionCard(theme)}>
        <summary style={summaryRow}>🔇 <b style={{ marginLeft: 8 }}>Tlumítka</b> <span style={{ marginLeft: "auto" }}>›</span></summary>
        <div style={{ padding: "10px 12px" }}>
          <PriceRow label="Babolat Custom Damp" price="120 Kč" />
          <PriceRow label="Head Logo Dampener" price="110 Kč" />
        </div>
      </details>
    </div>
  );
}

function SettingsView({ theme, value, onChange, onBack }: { theme: ReturnType<typeof getTheme>; value: Tournament; onChange: (v: Tournament) => void; onBack: () => void; }) {
  const [icons, setIcons] = useState<Record<Tournament, string>>({
    RG: localStorage.getItem("gj.themeIcon.RG") || "",
    WIM: localStorage.getItem("gj.themeIcon.WIM") || "",
    AO: localStorage.getItem("gj.themeIcon.AO") || "",
  });

  async function onUpload(t: Tournament, file?: File) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      const url = String(r.result || "");
      setIcons((p) => { const n = { ...p, [t]: url }; localStorage.setItem(`gj.themeIcon.${t}`, url); return n; });
    };
    r.readAsDataURL(file);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1 style={{ fontSize: 24, fontWeight: 900 }}>Nastavení vzhledu</h1>
      <div style={{ display: "grid", gap: 12 }}>
        <ThemeCard title="Roland Garros" sub="oranžová" color="#c1440e" selected={value === "RG"} icon={icons.RG} onPick={() => onChange("RG")} onUpload={(f) => onUpload("RG", f)} />
        <ThemeCard title="Wimbledon" sub="zelená" color="#1e6f2e" selected={value === "WIM"} icon={icons.WIM} onPick={() => onChange("WIM")} onUpload={(f) => onUpload("WIM", f)} />
        <ThemeCard title="Australian Open" sub="modrá" color="#1565c0" selected={value === "AO"} icon={icons.AO} onPick={() => onChange("AO")} onUpload={(f) => onUpload("AO", f)} />
      </div>
      <button onClick={onBack} style={{ ...btnOutline(theme) }}>◀ Zpět</button>
    </div>
  );
}

function ThemeCard({ title, sub, color, selected, icon, onPick, onUpload }: { title: string; sub: string; color: string; selected: boolean; icon?: string; onPick: () => void; onUpload: (file?: File) => void; }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div onClick={onPick} style={{ cursor: "pointer", background: "#fff", borderRadius: 12, padding: 12, border: `2px solid ${selected ? color : "#e2e8f0"}`, boxShadow: "0 2px 8px rgba(0,0,0,.06)", display: "grid", gridTemplateColumns: "64px 1fr", gap: 12, alignItems: "center" }}>
      <div onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }} title="Nahrát vlastní ikonku"
           style={{ width: 64, height: 64, borderRadius: "50%", background: icon ? `center/cover no-repeat url(${icon})` : color, border: `3px solid ${color}` }} />
      <div>
        <div style={{ fontWeight: 800 }}>{title}</div>
        <div style={{ color: "#64748b" }}>{sub}</div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => onUpload(e.target.files?.[0] || undefined)} />
    </div>
  );
}

/* =============== DÍLČÍ KOMPONENTY =============== */
function Card({ theme, children }: { theme: ReturnType<typeof getTheme>; children: React.ReactNode; }) {
  return <div style={{ background: theme.card, borderRadius: 16, padding: 16, border: `1px solid ${theme.accent}`, boxShadow: `0 3px 12px ${theme.shadow}`, width: "100%" }}>{children}</div>;
}
const listCard = (theme: ReturnType<typeof getTheme>): React.CSSProperties => ({ background: "#fff", border: `1px solid ${theme.accent}`, borderRadius: 12, padding: 12, width: "100%" });

function PriceRow({ label, price, note }: { label: string; price: string; note?: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, padding: "8px 0", borderTop: "1px solid #eef2f7" }}>
      <div><div style={{ fontWeight: 600 }}>{label}</div>{note && <div style={{ fontSize: 12, color: "#64748b" }}>{note}</div>}</div>
      <div style={{ fontWeight: 800 }}>{price}</div>
    </div>
  );
}

/* =============== STYLY =============== */
const btn = (theme: ReturnType<typeof getTheme>): React.CSSProperties => ({ background: theme.button, color: theme.buttonText, padding: "12px 14px", borderRadius: 12, border: "0", fontWeight: 800, boxShadow: `0 6px 18px ${theme.shadow}`, cursor: "pointer" });
const btnOutline = (theme: ReturnType<typeof getTheme>): React.CSSProperties => ({ background: "transparent", color: theme.text, padding: "10px 12px", borderRadius: 10, border: `1px solid ${theme.text}33`, fontWeight: 700, cursor: "pointer" });
const btnGhost: React.CSSProperties = { background: "transparent", color: "white", padding: "6px 10px", borderRadius: 8, border: 0, fontWeight: 700, cursor: "pointer" };
const summaryRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, padding: "10px 12px", cursor: "pointer", listStyle: "none" };
const sectionCard = (theme: ReturnType<typeof getTheme>): React.CSSProperties => ({ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,.06)", width: "100%" });

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", color: "white", padding: "12px 12px", borderRadius: 10, border: 0, fontSize: 16 }} onMouseDown={(e) => e.preventDefault()}>
      {label}
    </button>
  );
}
