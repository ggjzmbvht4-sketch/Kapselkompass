import { useEffect, useRef, useState } from "react";
import { ScanBarcode, Camera, Link, PenLine } from "lucide-react";
import {
  discover,
  ownBarcode,
  prepareImage,
  type Suggestion,
} from "./discovery";
import { normalizeBarcode, type Capsule, type LocalRow } from "./domain";
export default function DiscoveryPanel({
  capsules,
  demo,
  onSuggest,
  onExisting,
}: {
  capsules: LocalRow[];
  demo: boolean;
  onSuggest: (s: Suggestion) => void;
  onExisting: (id: string, barcode?: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<"manual" | "barcode" | "ai" | "shop">(
      "manual",
    ),
    [code, setCode] = useState(""),
    [url, setUrl] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [results, setResults] = useState<Suggestion[]>([]),
    [empty, setEmpty] = useState(false),
    [camera, setCamera] = useState(false),
    [assign, setAssign] = useState("");
  const video = useRef<HTMLVideoElement>(null),
    stop = useRef<() => void>(() => {}),
    queryRef = useRef<(value: string) => Promise<void>>(async () => {});
  async function lookup(value: string) {
    setBusy(true);
    setError("");
    setResults([]);
    setEmpty(false);
    try {
      const normalized = normalizeBarcode(value);
      setCode(normalized);
      const own = ownBarcode(capsules, normalized);
      if (own) {
        setResults([
          {
            ...(own.data as Capsule),
            existing_id: own.id,
            explanation: "Dieser Barcode gehört bereits zu deiner Sammlung.",
          },
        ]);
        return;
      }
      if (demo)
        throw Error(
          "Externe Produktsuche ist in der lokalen Demo nicht verfügbar. Du kannst den Code manuell zuordnen.",
        );
      const found = await discover({ mode: "barcode", code: normalized });
      setResults(found);
      setEmpty(!found.length);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Barcode konnte nicht gelesen werden.",
      );
    } finally {
      setBusy(false);
    }
  }
  queryRef.current = lookup;
  useEffect(() => {
    if (!camera || !video.current) return;
    let disposed = false;
    async function start() {
      try {
        const [
          { BrowserMultiFormatReader },
          { BarcodeFormat, DecodeHintType },
        ] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_8,
          BarcodeFormat.EAN_13,
          BarcodeFormat.UPC_A,
        ]);
        const reader = new BrowserMultiFormatReader(hints);
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } }, audio: false },
          video.current!,
          (result) => {
            if (result && !disposed) {
              stop.current();
              setCamera(false);
              void queryRef.current(result.getText());
            }
          },
        );
        stop.current = () => controls.stop();
        if (disposed) controls.stop();
      } catch {
        if (!disposed) {
          setCamera(false);
          setError(
            "Kamera nicht verfügbar oder Zugriff abgelehnt. Bitte ein Barcodefoto wählen oder den Code eingeben.",
          );
        }
      }
    }
    void start();
    return () => {
      disposed = true;
      stop.current();
    };
  }, [camera]);
  async function readFile(image: File) {
    setBusy(true);
    setError("");
    let object = "";
    try {
      if (!image.type.startsWith("image/") || image.size > 10 * 1024 * 1024)
        throw Error("Bitte ein Barcodefoto bis 10 MB wählen.");
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      object = URL.createObjectURL(image);
      const result = await reader.decodeFromImageUrl(object);
      await lookup(result.getText());
    } catch {
      setError(
        "Kein lesbarer Barcode im Bild gefunden. Bitte näher fotografieren oder die Ziffern eingeben.",
      );
    } finally {
      if (object) URL.revokeObjectURL(object);
      setBusy(false);
    }
  }
  async function run() {
    setBusy(true);
    setError("");
    setResults([]);
    setEmpty(false);
    try {
      if (demo)
        throw Error(
          "Externe Erkennung ist mit einem angemeldeten Konto verfügbar.",
        );
      const suggestions =
        mode === "shop"
          ? await discover({ mode: "shop", url })
          : await discover({
              mode: "ai",
              consent,
              image: await prepareImage(file!),
              known: capsules.map((r) => ({ id: r.id, ...r.data })),
            });
      setResults(suggestions);
      setEmpty(!suggestions.length);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Die Erkennung ist nicht erreichbar.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="discovery-panel" aria-label="Erfassungshilfen">
      <div className="capture-tabs">
        {[
          { id: "manual", label: "Manuell", Icon: PenLine },
          { id: "barcode", label: "Barcode", Icon: ScanBarcode },
          { id: "ai", label: "Foto erkennen", Icon: Camera },
          { id: "shop", label: "Shop-Link", Icon: Link },
        ].map(({ id, label, Icon }) => (
          <button
            type="button"
            key={id}
            className={mode === id ? "active" : ""}
            onClick={() => {
              stop.current();
              setCamera(false);
              setMode(id as typeof mode);
              setResults([]);
              setError("");
              setEmpty(false);
            }}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </div>
      {mode === "barcode" && (
        <div className="capture-content">
          <p>
            Scanne den Strichcode auf der Verpackung. Eigene Zuordnungen sind
            auch offline verfügbar.
          </p>
          <div className="capture-row">
            <button
              type="button"
              className="button secondary"
              onClick={() => setCamera(!camera)}
            >
              {camera ? "Kamera stoppen" : "Kamera starten"}
            </button>
            <label className="button secondary file-button">
              Barcodefoto
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files?.[0]) void readFile(e.target.files[0]);
                }}
              />
            </label>
          </div>
          {camera && (
            <video
              ref={video}
              className="barcode-video"
              autoPlay
              muted
              playsInline
            />
          )}
          <div className="capture-row">
            <input
              aria-label="Barcode-Ziffern"
              inputMode="numeric"
              value={code}
              placeholder="EAN oder UPC eingeben"
              onChange={(e) => setCode(e.target.value)}
            />
            <button
              type="button"
              className="button"
              disabled={busy || !code}
              onClick={() => void lookup(code)}
            >
              Suchen
            </button>
          </div>
          {code && (
            <div className="capture-row">
              <select
                aria-label="Vorhandene Sorte zuordnen"
                value={assign}
                onChange={(e) => setAssign(e.target.value)}
              >
                <option value="">Einer eigenen Sorte zuordnen …</option>
                {capsules.map((r) => (
                  <option value={r.id} key={r.id}>
                    {(r.data as Capsule).brand} · {(r.data as Capsule).name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="button secondary"
                disabled={!assign || busy}
                onClick={() => {
                  try {
                    void onExisting(assign, normalizeBarcode(code)).catch((e) =>
                      setError(e.message),
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                Zuordnen
              </button>
            </div>
          )}
          <button
            type="button"
            className="text-link"
            onClick={() => {
              try {
                onSuggest({ barcodes: [normalizeBarcode(code)] });
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Code übernehmen und Angaben selbst ergänzen
          </button>
        </div>
      )}
      {mode === "ai" && (
        <div className="capture-content">
          <p>
            Fotografiere die Verpackung oder die Beschriftung einer losen
            Kapsel. Farbe allein reicht oft nicht für eine eindeutige Zuordnung.
          </p>
          <label>
            Foto auswählen
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              Dieses Foto zur Erkennung über OpenRouter an den KI-Anbieter
              senden. Es wird verkleinert und ohne EXIF-Daten übertragen, aber
              nicht automatisch in meiner Sammlung gespeichert.
            </span>
          </label>
          <button
            type="button"
            className="button"
            disabled={busy || !file || !consent}
            onClick={() => void run()}
          >
            Foto erkennen
          </button>
          <small>
            Maximal 10 Anfragen je Nutzer und Tag. Unklare Ergebnisse werden
            nicht als sichere Identifikation übernommen.
          </small>
        </div>
      )}
      {mode === "shop" && (
        <div className="capture-content">
          <p>
            Produktlink von Nespresso Deutschland oder KaffeK einfügen. Angaben
            und Preise werden einmalig abgerufen.
          </p>
          <div className="capture-row">
            <input
              type="url"
              aria-label="Produktlink"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://kaffek.de/…"
            />
            <button
              type="button"
              className="button"
              disabled={busy || !url}
              onClick={() => void run()}
            >
              Daten abrufen
            </button>
          </div>
          <button
            type="button"
            className="text-link"
            onClick={() => {
              try {
                const parsed = new URL(url);
                if (parsed.protocol !== "https:") throw Error();
                onSuggest({ shop_url: parsed.href });
              } catch {
                setError("Bitte einen gültigen HTTPS-Link eingeben.");
              }
            }}
          >
            Nur Kauflink übernehmen
          </button>
        </div>
      )}
      {busy && <p role="status">Wird erkannt …</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {empty && (
        <p className="notice">
          Nicht eindeutig erkannt. Bitte ein Foto mit lesbarer Beschriftung
          verwenden oder die Angaben manuell ergänzen.
        </p>
      )}
      {results.map((s, i) => (
        <div className="suggestion" key={i}>
          <strong>
            {s.brand} {s.name || "Angaben ergänzen"}
          </strong>
          <p>
            {s.system}
            {s.pack_size ? ` · ${s.pack_size} Kapseln pro Packung` : ""}
            {s.confidence
              ? ` · ${s.confidence === "high" ? "Deutlicher Hinweis" : s.confidence === "medium" ? "Möglicher Treffer" : "Unsicherer Vorschlag"}`
              : ""}
          </p>
          <p>{s.explanation}</p>
          {s.source && (
            <a href={s.source.url} target="_blank" rel="noopener noreferrer">
              Quelle: {s.source.name}
            </a>
          )}
          <button
            type="button"
            className="button secondary"
            onClick={() =>
              s.existing_id
                ? void onExisting(s.existing_id).catch((e) =>
                    setError(e.message),
                  )
                : onSuggest(s)
            }
          >
            {s.existing_id
              ? "Eigene Sorte öffnen"
              : "Angaben zur Prüfung übernehmen"}
          </button>
        </div>
      ))}
    </section>
  );
}
