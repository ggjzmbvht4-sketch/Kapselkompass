import { useState, type FormEvent } from "react";
import {
  Home,
  Users,
  Plus,
  Check,
  X,
  LogOut,
  ArrowUpRight,
} from "lucide-react";
import { householdAction, type HouseholdState } from "./households";
import { supabase } from "./backend";
import { stock, type LocalRow, type Capsule } from "./domain";
export default function HouseholdPanel({
  user,
  state,
  rows,
  onRefresh,
  onSelect,
  onImported,
}: {
  user: string;
  state: HouseholdState;
  rows: LocalRow[];
  onRefresh: () => Promise<void>;
  onSelect: (id: string | null) => void;
  onImported: (household: string, capsule: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [name, setName] = useState(""),
    [source, setSource] = useState(""),
    [targetHouse, setTargetHouse] = useState(""),
    [target, setTarget] = useState(""),
    [move, setMove] = useState(true),
    [operation, setOperation] = useState(crypto.randomUUID());
  const privateCapsules = rows.filter(
    (r) => r.kind === "capsules" && !r.household_id && !r.deleted,
  );
  const targets = rows.filter(
    (r) =>
      r.kind === "capsules" && r.household_id === targetHouse && !r.deleted,
  );
  const sourceRow = privateCapsules.find((r) => r.id === source),
    amount = sourceRow
      ? stock(
          rows.filter((r) => !r.household_id),
          sourceRow.id,
        ).amount
      : null;
  async function action(
    kind: string,
    args: Record<string, unknown>,
    message: string,
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await householdAction(kind, args);
      await onRefresh();
      setNotice(message);
      return result;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : String((e as { message?: string }).message || e),
      );
    } finally {
      setBusy(false);
    }
  }
  async function create(e: FormEvent) {
    e.preventDefault();
    const result = await action(
      "create",
      { p_name: name },
      "Haushalt angelegt. Lade jetzt weitere Personen ein.",
    );
    if (result) {
      setName("");
      onSelect(result.id);
    }
  }
  async function transfer(e: FormEvent) {
    e.preventDefault();
    if (!sourceRow || !targetHouse || !supabase) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!navigator.onLine) throw Error("Die Übernahme benötigt Internet.");
      if (rows.some((r) => r.dirty))
        throw Error(
          "Bitte zuerst alle ausstehenden Änderungen synchronisieren.",
        );
      const { data, error } = await supabase.rpc("coffee_import_household", {
        p_id: operation,
        p_source: source,
        p_household: targetHouse,
        p_target: target || null,
        p_expected: sourceRow.version,
        p_move_stock: move,
      });
      if (error) throw error;
      await onRefresh();
      setNotice(
        `Übernommen. ${data.transferred} Kapseln wurden vom privaten in den gemeinsamen Bestand übertragen.`,
      );
      onImported(targetHouse, data.capsule_id);
      setSource("");
      setOperation(crypto.randomUUID());
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : String((e as { message?: string }).message || e),
      );
    } finally {
      setBusy(false);
    }
  }
  if (!user)
    return (
      <section className="empty">
        <h2>Zusammen schmeckt Kaffee noch besser.</h2>
        <p>
          Melde dich mit deinem eigenen Konto an, um einen Haushalt anzulegen
          oder eine Einladung anzunehmen.
        </p>
      </section>
    );
  return (
    <div className="households-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">GEMEINSAMER VORRAT · PERSÖNLICHER GESCHMACK</p>
          <h1>Deine Haushalte</h1>
          <p className="muted">
            Jede Person hat ihr eigenes Login. Bestand und Sammlung gehören dem
            Haushalt, Bewertungen bleiben ihrem Autor zugeordnet.
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {state.invitations.map((invite) => (
        <section className="panel household-invite" key={invite.id}>
          <h2>
            <Users size={20} /> Einladung: {invite.name}
          </h2>
          <p>
            {invite.inviter} lädt dich in den gemeinsamen Haushalt ein. Andere
            Mitglieder können dort deine Haushaltsbewertungen und Fotos sehen.
            Dein privater Bereich bleibt getrennt. Bereits beigetragene
            Bewertungen bleiben bei einem späteren Austritt im Haushaltsverlauf
            erhalten.
          </p>
          <div className="row">
            <button
              className="button"
              disabled={busy}
              onClick={async () => {
                const result = await action(
                  "accept",
                  { p_invitation: invite.id },
                  "Du bist dem Haushalt beigetreten.",
                );
                if (result) onSelect(result.id);
              }}
            >
              <Check size={16} /> Beitreten
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                void action(
                  "decline",
                  { p_invitation: invite.id },
                  "Einladung abgelehnt.",
                )
              }
            >
              <X size={16} /> Ablehnen
            </button>
          </div>
        </section>
      ))}
      <section className="panel">
        <h2>
          <Plus size={20} /> Haushalt anlegen
        </h2>
        <form className="share-form" onSubmit={create}>
          <input
            aria-label="Name des neuen Haushalts"
            required
            maxLength={80}
            value={name}
            placeholder="z. B. Unsere Kaffeebar"
            onChange={(e) => setName(e.target.value)}
          />
          <button className="button" disabled={busy} type="submit">
            Haushalt anlegen
          </button>
        </form>
      </section>
      {state.households.map((h) => (
        <section className="panel household-card" key={h.id}>
          <div className="section-head">
            <div>
              <h2>
                <Home size={20} /> {h.name}
              </h2>
              <p className="muted">
                {h.members.length}{" "}
                {h.members.length === 1 ? "Person" : "Personen"} ·{" "}
                {h.owner_id === user
                  ? "Du verwaltest diesen Haushalt"
                  : "Mitglied"}
              </p>
            </div>
            <button className="button secondary" onClick={() => onSelect(h.id)}>
              Haushalt öffnen <ArrowUpRight size={16} />
            </button>
          </div>
          {h.members.map((m) => (
            <div className="household-member" key={m.user_id}>
              <span>
                {m.name}
                {m.user_id === user ? " (Du)" : ""}
                <small>
                  {m.user_id === h.owner_id
                    ? "Haushaltsverwaltung"
                    : "Mitglied"}
                </small>
              </span>
              {h.owner_id === user && m.user_id !== user && (
                <div className="row">
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (
                        confirm(
                          "Die Verwaltung an diese Person übertragen? Danach verwaltet sie Mitglieder und Einladungen.",
                        )
                      )
                        void action(
                          "transfer_owner",
                          { p_household: h.id, p_user: m.user_id },
                          "Verwaltung übertragen.",
                        );
                    }}
                  >
                    Verwaltung übertragen
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (
                        confirm(
                          "Dieses Mitglied entfernen? Der künftige Zugriff endet; bisherige Bewertungen und Bestandsbuchungen bleiben im Verlauf.",
                        )
                      )
                        void action(
                          "remove",
                          { p_household: h.id, p_user: m.user_id },
                          "Mitglied entfernt.",
                        );
                    }}
                  >
                    Entfernen
                  </button>
                </div>
              )}
            </div>
          ))}
          {h.owner_id === user ? (
            <>
              <form
                className="share-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void action(
                    "invite",
                    { p_household: h.id, p_email: String(f.get("email")) },
                    "Einladung angelegt. Die Person kann sie unter Haushalte annehmen.",
                  );
                }}
              >
                <input
                  name="email"
                  type="email"
                  aria-label={"Person in " + h.name + " einladen"}
                  required
                  placeholder="Bestätigte E-Mail-Adresse der Person"
                />
                <button type="submit" className="button" disabled={busy}>
                  Einladen
                </button>
              </form>
              <p className="muted">
                Einladungen erscheinen in der App. Es werden keine E-Mails
                versendet. Die Person benötigt bereits ein bestätigtes Konto.
              </p>
              {h.invitations.map((i) => (
                <div className="share-row" key={i.id}>
                  <span>{i.email} · Einladung offen</span>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void action(
                        "cancel_invitation",
                        { p_household: h.id, p_invitation: i.id },
                        "Einladung zurückgezogen.",
                      )
                    }
                  >
                    Zurückziehen
                  </button>
                </div>
              ))}
              <details className="household-settings">
                <summary>Haushaltsname ändern</summary>
                <form
                  className="share-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void action(
                      "rename",
                      { p_household: h.id, p_name: String(f.get("name")) },
                      "Name gespeichert.",
                    );
                  }}
                >
                  <input
                    name="name"
                    aria-label={"Neuer Name für " + h.name}
                    required
                    maxLength={80}
                    defaultValue={h.name}
                  />
                  <button
                    type="submit"
                    className="button secondary"
                    disabled={busy}
                  >
                    Speichern
                  </button>
                </form>
              </details>
            </>
          ) : (
            <button
              className="text-link"
              disabled={busy}
              onClick={() => {
                if (
                  confirm(
                    "Haushalt verlassen? Du verlierst den Zugriff auf Sammlung und Bestand. Bisher beigetragene Bewertungen bleiben im Haushalt; nicht synchronisierte Haushaltsänderungen auf diesem Gerät werden verworfen.",
                  )
                )
                  void action(
                    "leave",
                    { p_household: h.id },
                    "Haushalt verlassen.",
                  );
              }}
            >
              <LogOut size={16} /> Haushalt verlassen
            </button>
          )}
        </section>
      ))}
      {state.households.length > 0 && privateCapsules.length > 0 && (
        <section className="panel">
          <h2>Private Sorte in einen Haushalt übernehmen</h2>
          <p className="muted">
            Die private Sorte und ihre Bewertungen bleiben erhalten. Eine
            Momentaufnahme deiner Bewertungen und Fotos wird im Haushalt
            sichtbar. Übertragener Bestand wird im privaten Bereich abgezogen
            und im Haushalt hinzugefügt. Spätere Änderungen an privaten
            Bewertungen werden nicht automatisch übernommen.
          </p>
          <form className="entry-form household-transfer" onSubmit={transfer}>
            <label>
              Private Sorte
              <select
                required
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  setTarget("");
                  setOperation(crypto.randomUUID());
                }}
              >
                <option value="">Sorte auswählen</option>
                {privateCapsules.map((c) => (
                  <option key={c.id} value={c.id}>
                    {(c.data as Capsule).brand} · {(c.data as Capsule).name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Zielhaushalt
              <select
                required
                value={targetHouse}
                onChange={(e) => {
                  setTargetHouse(e.target.value);
                  setTarget("");
                  setOperation(crypto.randomUUID());
                }}
              >
                <option value="">Haushalt auswählen</option>
                {state.households.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sorte im Haushalt
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="">Als neue Sorte anlegen</option>
                {targets.map((c) => (
                  <option key={c.id} value={c.id}>
                    {(c.data as Capsule).brand} · {(c.data as Capsule).name}
                  </option>
                ))}
              </select>
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={move}
                onChange={(e) => setMove(e.target.checked)}
              />
              <span>
                Aktuellen privaten Bestand mit übertragen{" "}
                {amount !== null
                  ? `(${amount} Kapseln)`
                  : "(bisher nicht erfasst)"}
              </span>
            </label>
            {sourceRow &&
              targets.some((r) =>
                (r.data as Capsule).barcodes?.some((code) =>
                  (sourceRow.data as Capsule).barcodes?.includes(code),
                ),
              ) && (
                <p className="notice">
                  Dieser Barcode ist im Zielhaushalt bereits vorhanden. Wähle
                  die passende vorhandene Sorte, um sie zusammenzuführen.
                </p>
              )}
            <button className="button" type="submit" disabled={busy}>
              Übernahme ausdrücklich bestätigen
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
