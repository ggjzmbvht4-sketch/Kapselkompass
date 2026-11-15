import { useState } from "react";
import {
  APP_VERSION,
  applyUpdate,
  checkForUpdate,
  useUpdateReady,
} from "./appUpdates";

export function AppUpdateNotice({ editing }: { editing: boolean }) {
  const ready = useUpdateReady();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!ready) return null;
  return (
    <div className="notice app-update" role="status">
      <span>
        Eine neue App-Version ist bereit. Lokal gespeicherte Einträge und
        ausstehende Fotos bleiben erhalten.
        {editing &&
          " Bitte zuerst den geöffneten Eintrag speichern oder schließen."}
      </span>
      <button
        className="button"
        disabled={editing || busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await applyUpdate();
          } catch (err) {
            setError(
              err instanceof Error
                ? err.message
                : "Aktualisierung fehlgeschlagen. Bitte erneut versuchen.",
            );
            setBusy(false);
          }
        }}
      >
        {busy ? "Wird aktualisiert …" : "Jetzt aktualisieren"}
      </button>
      {error && <span role="alert">{error}</span>}
    </div>
  );
}

export function AppVersion() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="panel app-version">
      <h2>App-Version {APP_VERSION}</h2>
      <p>
        Aktualisierungen bringen Verbesserungen für Fotos und die Bedienung.
      </p>
      <button
        className="button secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const ready = await checkForUpdate();
            setMessage(
              ready
                ? "Update bereit. Oben auf „Jetzt aktualisieren“ tippen."
                : "Nach neuen Versionen gesucht. Sobald eine bereit ist, erscheint der Hinweis oben.",
            );
          } catch (err) {
            setMessage(
              err instanceof Error
                ? err.message
                : "Aktualisierung konnte nicht geprüft werden.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Wird geprüft …" : "Nach Updates suchen"}
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
