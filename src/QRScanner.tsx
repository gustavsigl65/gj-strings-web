import { useEffect, useRef } from "react";
import {
  Html5Qrcode,
  Html5QrcodeSupportedFormats,
} from "html5-qrcode";
import type { Html5QrcodeCameraScanConfig } from "html5-qrcode";

type Props = {
  onDetected: (text: string) => void;
  onClose: () => void;
};

export default function QRScanner({ onDetected, onClose }: Props) {
  const divId = useRef(`qr-reader-${Math.random().toString(36).slice(2)}`);
  const qrRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    let stopped = false;

    async function start() {
      try {
        // vytvoř čtečku
        qrRef.current = new Html5Qrcode(divId.current);

        // dostupné kamery
        const devices = await Html5Qrcode.getCameras();
        if (!devices || devices.length === 0)
          throw new Error("Kamera nebyla nalezena");

        const back =
          devices.find((d) => /back|rear|environment/i.test(d.label))?.id ??
          devices[0].id;

        // konfigurace
        const config: Html5QrcodeCameraScanConfig = {
          fps: 18,
          qrbox: { width: 260, height: 260 },
          aspectRatio: 16 / 9,
        } as any;

        await qrRef.current.start(
          { deviceId: { exact: back } },
          config,
          (decodedText) => {
            if (stopped) return;
            stopped = true;
            stop().finally(() => onDetected(decodedText.trim()));
          },
          () => {}
        );
      } catch (err) {
        console.error(err);
        onClose();
      }
    }

    async function stop() {
      try {
        await qrRef.current?.stop();
      } catch {}
      try {
        qrRef.current?.clear();
      } catch {}
    }

    start();

    return () => {
      stopped = true;
      stop();
    };
  }, [onDetected, onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.55)",
        zIndex: 40,
        display: "grid",
        placeItems: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "92%",
          maxWidth: 720,
          background: "#000",
          borderRadius: 12,
          padding: 8,
          boxSizing: "border-box",
        }}
      >
        <div id={divId.current} style={{ width: "100%", minHeight: 320 }} />
        <button
          onClick={onClose}
          style={{
            marginTop: 8,
            width: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #fff3",
            background: "transparent",
            color: "white",
            fontWeight: 700,
          }}
        >
          ✖ Zavřít čtečku
        </button>
      </div>
    </div>
  );
}
