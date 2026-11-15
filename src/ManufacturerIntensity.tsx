import { useState } from "react";
import {
  formatManufacturerIntensity,
  normalizedManufacturerIntensity,
  type Capsule,
} from "./domain";
const number = (value: number) =>
  value.toLocaleString("de-DE", { maximumFractionDigits: 1 });

export function ManufacturerIntensityFields({
  capsule,
}: {
  capsule: Partial<Capsule>;
}) {
  const [value, setValue] = useState(capsule.intensity?.toString() || "");
  const [maximum, setMaximum] = useState(
    capsule.intensity_max?.toString() || "",
  );
  const normalized = normalizedManufacturerIntensity({
    intensity: value ? Number(value) : undefined,
    intensity_max: maximum ? Number(maximum) : undefined,
  });
  return (
    <fieldset className="manufacturer-intensity">
      <legend>Herstellerintensität (optional)</legend>
      <div className="intensity-inputs">
        <label>
          Wert
          <input
            name="intensity"
            aria-label="Herstellerintensität Wert"
            type="number"
            min="1"
            max="20"
            step="1"
            required={Boolean(maximum)}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="z. B. 7"
          />
        </label>
        <span aria-hidden="true">/</span>
        <label>
          Skalenmaximum
          <input
            name="intensity_max"
            aria-label="Herstellerintensität Skalenmaximum"
            type="number"
            min="1"
            max="20"
            step="1"
            required={Boolean(value)}
            value={maximum}
            onChange={(e) => setMaximum(e.target.value)}
            placeholder="z. B. 10 oder 13"
          />
        </label>
      </div>
      <p className="muted">
        Übernimm beide Zahlen von der Packung, zum Beispiel 7/10 oder 9/13. Bei
        älteren Einträgen bitte die fehlende Skala ergänzen.
      </p>
      {normalized !== null && (
        <p className="intensity-normalized" role="status">
          Rechnerisch auf 10: <strong>{number(normalized)}/10</strong>
        </p>
      )}
    </fieldset>
  );
}

export function ManufacturerIntensityComparison({
  capsule,
}: {
  capsule: Capsule;
}) {
  const normalized = normalizedManufacturerIntensity(capsule);
  return (
    <div className="manufacturer-comparison">
      <h3>Herstellerintensität</h3>
      <p>Packungsangabe: {formatManufacturerIntensity(capsule)}</p>
      {normalized === null ? (
        <p className="muted">
          {capsule.intensity === undefined
            ? "Keine Herstellerangabe vorhanden."
            : "Zum Vergleichen zuerst die Skala ergänzen."}
        </p>
      ) : (
        <>
          <strong>
            {number(normalized)}
            <small> /10 rechnerisch</small>
          </strong>
          <div className="bar">
            <i style={{ width: `${normalized * 10}%` }} />
          </div>
        </>
      )}
    </div>
  );
}
