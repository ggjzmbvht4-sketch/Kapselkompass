import { useState } from "react";
import { criteria, type LocalRow, type Tasting } from "./domain";
import { householdSummary, personAverage, type Household } from "./households";
const fmt = (value: number | null) =>
  value === null
    ? "—"
    : value.toLocaleString("de-DE", { maximumFractionDigits: 1 });
export default function HouseholdRatings({
  rows,
  capsule,
  household,
  user,
}: {
  rows: LocalRow[];
  capsule: string;
  household: Household;
  user: string;
}) {
  const [method, setMethod] = useState(""),
    [includeFormer, setIncludeFormer] = useState(false);
  const relevant = rows.filter(
    (r) =>
      r.kind === "tastings" &&
      !r.deleted &&
      (r.data as Tasting).capsule_id === capsule &&
      (includeFormer || household.members.some((m) => m.user_id === r.user_id)),
  );
  const filtered = method
    ? relevant.filter((r) => (r.data as Tasting).method === method)
    : relevant;
  const summary = householdSummary(filtered, capsule);
  const name = (id: string) =>
    [...household.members, ...(household.authors || [])].find(
      (p) => p.user_id === id,
    )?.name || "Ehemaliges Mitglied";
  return (
    <section className="panel household-ratings">
      <div className="section-head">
        <div>
          <h2>Euer Geschmack im Vergleich</h2>
          <p className="muted">
            Zuerst der Durchschnitt je Person, dann die Haushaltsnote. Jede
            Person zählt gleich.
          </p>
        </div>
        <label>
          Zubereitung
          <select
            aria-label="Haushaltsbewertungen nach Zubereitung filtern"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            <option value="">Alle Zubereitungen</option>
            {[...new Set(relevant.map((r) => (r.data as Tasting).method))]
              .sort()
              .map((v) => (
                <option key={v}>{v}</option>
              ))}
          </select>
        </label>
      </div>
      <label className="check-label">
        <input
          type="checkbox"
          checked={includeFormer}
          onChange={(e) => setIncludeFormer(e.target.checked)}
        />
        <span>Historische Beiträge ehemaliger Mitglieder einbeziehen</span>
      </label>
      <p className="muted">
        Die Haushaltsnote in Sammlung und Vergleich berücksichtigt die aktuellen
        Mitglieder.
      </p>
      {summary.people.length ? (
        <>
          <div className="house-rating-summary">
            <strong>
              {fmt(summary.score)}
              <small> / 10</small>
            </strong>
            <span>
              {summary.people.length}{" "}
              {summary.people.length === 1
                ? "Person · bisher eine persönliche Sicht"
                : "Personen · gleich gewichtet"}
              <br />
              {summary.count} Verkostungen · persönliche Gesamtnoten{" "}
              {fmt(summary.min)} bis {fmt(summary.max)}
            </span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Person</th>
                  {criteria.map(([key, label]) => (
                    <th key={key}>{label}</th>
                  ))}
                  <th>Verkostungen</th>
                </tr>
              </thead>
              <tbody>
                {summary.people.map((p) => (
                  <tr key={p.id}>
                    <th>
                      {name(p.id)}
                      {p.id === user
                        ? " (Du)"
                        : household.members.some((m) => m.user_id === p.id)
                          ? ""
                          : " (ehemalig)"}
                    </th>
                    {criteria.map(([key]) => (
                      <td key={key}>
                        {fmt(personAverage(filtered, capsule, p.id, key))}
                      </td>
                    ))}
                    <td>{p.count}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th>Haushalt</th>
                  {criteria.map(([key]) => (
                    <td key={key}>
                      {fmt(householdSummary(filtered, capsule, key).score)}
                    </td>
                  ))}
                  <td>{summary.count}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="muted">
            Wiederkaufen: {summary.rebuy.yes} Ja · {summary.rebuy.no} Nein ·{" "}
            {summary.rebuy.maybe} Unsicher. Hier zählt die neueste Entscheidung
            jeder Person.
          </p>
        </>
      ) : (
        <p className="muted">
          Für diese Auswahl gibt es noch keine Bewertungen. Eure erste
          Verkostung macht den Anfang.
        </p>
      )}
    </section>
  );
}
