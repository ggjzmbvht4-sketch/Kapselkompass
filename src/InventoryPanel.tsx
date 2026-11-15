import { useState, type FormEvent } from "react";
import { Package, Plus, AlertCircle } from "lucide-react";
import { stock, type LocalRow, type Inventory, type Capsule } from "./domain";
export default function InventoryPanel({
  rows,
  capsule,
  onSave,
  people,
  user,
}: {
  rows: LocalRow[];
  capsule: LocalRow;
  onSave: (movement: Inventory) => Promise<void>;
  people?: { user_id: string; name: string }[];
  user?: string;
}) {
  const value = stock(rows, capsule.id),
    [open, setOpen] = useState(false),
    [type, setType] = useState<Inventory["type"]>("purchase"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [packs, setPacks] = useState(false);
  const moves = rows
    .filter(
      (r) =>
        r.kind === "inventory" &&
        !r.deleted &&
        (r.data as Inventory).capsule_id === capsule.id,
    )
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const f = new FormData(e.currentTarget);
      let amount = Number(f.get("amount"));
      const kind = value.amount === null ? "opening" : type;
      if (kind === "threshold") amount = 0;
      if (packs && kind === "purchase") amount *= Number(f.get("pack_size"));
      if (kind === "consume") amount = -Math.abs(amount);
      if (!Number.isSafeInteger(amount) || Math.abs(amount) > 1000000)
        throw Error("Bitte eine ganze Kapselanzahl bis 1.000.000 eingeben.");
      if (
        (["opening", "purchase"].includes(kind) && amount < 0) ||
        (kind === "consume" && amount >= 0)
      )
        throw Error("Bitte eine gültige Menge eingeben.");
      const threshold = Number(f.get("threshold"));
      await onSave({
        capsule_id: capsule.id,
        amount,
        type: kind,
        note: String(f.get("note") || ""),
        ...(["opening", "threshold"].includes(kind) ? { threshold } : {}),
      });
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Buchung fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel inventory-panel">
      <div className="section-head">
        <div>
          <h2>
            <Package size={20} /> Mein Kapselbestand
          </h2>
          <p className="muted">
            {capsule.household_id
              ? "Gemeinsamer Vorrat · Alle Haushaltsmitglieder sehen diese Buchungen."
              : "Privat · Bestandsbewegungen werden nicht mit deinem Profil geteilt."}
          </p>
        </div>
        <button className="button secondary" onClick={() => setOpen(!open)}>
          <Plus size={16} />
          {value.amount === null ? "Bestand erfassen" : "Buchung hinzufügen"}
        </button>
      </div>
      <div className="inventory-summary">
        <strong>
          {value.amount === null ? "Nicht erfasst" : `${value.amount} Kapseln`}
        </strong>
        {value.pending && (
          <span className="chip">
            Vorläufig · noch nicht vollständig synchronisiert
          </span>
        )}
        {value.amount !== null && value.amount < 0 ? (
          <span className="stock-warning">
            <AlertCircle size={16} /> Bestand prüfen: Bitte tatsächliche Menge
            zählen und die Differenz korrigieren.
          </span>
        ) : value.amount !== null && value.amount <= value.threshold ? (
          <span className="stock-warning">
            Zeit zum Nachkaufen · Warnschwelle {value.threshold}
          </span>
        ) : null}
      </div>
      {open && (
        <form className="entry-form stock-form" onSubmit={submit}>
          {value.amount !== null && (
            <label>
              Buchungsart
              <select
                value={type}
                onChange={(e) => setType(e.target.value as Inventory["type"])}
              >
                <option value="purchase">Einkauf / Zugang</option>
                <option value="consume">Zusätzlicher Verbrauch</option>
                <option value="correction">
                  Korrektur als Differenz (+/−)
                </option>
                <option value="threshold">Warnschwelle ändern</option>
              </select>
            </label>
          )}
          {value.amount === null && (
            <p>
              Erfasse die tatsächlich vorhandenen Kapseln. Frühere Verkostungen
              werden nicht nachträglich abgezogen.
            </p>
          )}
          {type !== "threshold" || value.amount === null ? (
            <>
              <label>
                {value.amount === null
                  ? "Anfangsbestand"
                  : packs && type === "purchase"
                    ? "Anzahl Packungen"
                    : type === "correction"
                      ? "Korrektur um Kapseln"
                      : "Anzahl Kapseln"}
                <input
                  name="amount"
                  type="number"
                  step="1"
                  min={type === "correction" ? "-1000000" : "0"}
                  max="1000000"
                  required
                  defaultValue={value.amount === null ? 0 : 1}
                />
              </label>
              {value.amount !== null && type === "purchase" && (
                <>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={packs}
                      onChange={(e) => setPacks(e.target.checked)}
                    />
                    <span>Packungen statt einzelner Kapseln buchen</span>
                  </label>
                  {packs && (
                    <label>
                      Kapseln je Packung
                      <input
                        name="pack_size"
                        type="number"
                        min="1"
                        max="10000"
                        step="1"
                        required
                        defaultValue={(capsule.data as Capsule).pack_size || 10}
                      />
                    </label>
                  )}
                </>
              )}
            </>
          ) : null}
          {value.amount === null || type === "threshold" ? (
            <label>
              Nachkaufwarnung ab Kapseln
              <input
                name="threshold"
                type="number"
                min="0"
                max="10000"
                step="1"
                defaultValue={value.threshold}
                required
              />
            </label>
          ) : null}
          <label>
            Notiz (optional)
            <input
              name="note"
              maxLength={500}
              placeholder="z. B. Einkauf oder Korrektur nachgezählt"
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="button" disabled={busy}>
            {busy ? "Wird gebucht …" : "Buchung bestätigen"}
          </button>
        </form>
      )}
      {moves.length > 0 && (
        <details className="stock-history">
          <summary>Bestandsverlauf · {moves.length} Buchungen</summary>
          {moves.map((r) => {
            const m = r.data as Inventory;
            return (
              <div className="stock-movement" key={r.id}>
                <span>
                  {m.type === "opening"
                    ? "Anfangsbestand"
                    : m.type === "purchase"
                      ? "Einkauf"
                      : m.type === "consume"
                        ? "Verbrauch"
                        : m.type === "threshold"
                          ? "Warnschwelle"
                          : m.type === "tasting"
                            ? m.note
                            : "Korrektur"}
                  <small>
                    {people
                      ? `${r.user_id === user ? "Du" : people.find((p) => p.user_id === r.user_id)?.name || "Ehemaliges Mitglied"} · `
                      : ""}
                    {new Date(r.updated_at).toLocaleString("de-DE")}
                    {r.dirty ? " · nur lokal" : ""}
                    {m.note && m.type !== "tasting" ? ` · ${m.note}` : ""}
                  </small>
                </span>
                <strong>
                  {m.type === "threshold"
                    ? m.threshold
                    : m.amount > 0
                      ? "+" + m.amount
                      : m.amount}
                </strong>
              </div>
            );
          })}
        </details>
      )}
    </section>
  );
}
