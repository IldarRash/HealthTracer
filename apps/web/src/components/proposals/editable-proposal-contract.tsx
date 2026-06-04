"use client";

import { type DisplayContract, computeDerivedValues } from "@health/types";
import { useId, useMemo } from "react";

type EditableProposalContractProps = {
  contract: DisplayContract;
  fieldValues: Record<string, number>;
  disabled?: boolean;
  onFieldValuesChange?: (values: Record<string, number>) => void;
};

/**
 * Renders the editable fields of a DisplayContract with live-recomputed
 * derived values.
 *
 * - slider fields render as <input type="range"> with the current value shown
 * - number fields render as numeric inputs with min/max/step bounds applied
 * - text / readonly fields render as static labels
 * - derived rows are shown below; the isPrimaryTotal derived is rendered as a
 *   prominent headline that updates in real time as the user drags sliders
 */
export function EditableProposalContract({
  contract,
  fieldValues,
  disabled = false,
  onFieldValuesChange,
}: EditableProposalContractProps) {
  const idBase = useId();

  const derived = useMemo(
    () => computeDerivedValues(contract, fieldValues),
    [contract, fieldValues],
  );

  const primaryTotal = contract.derived.find((d) => d.isPrimaryTotal);
  const otherDerived = contract.derived.filter((d) => !d.isPrimaryTotal);

  const handleChange = (key: string, raw: number) => {
    if (!onFieldValuesChange) return;
    onFieldValuesChange({ ...fieldValues, [key]: raw });
  };

  return (
    <div className="editable-proposal-contract">
      {contract.title ? (
        <p className="proposal-meta editable-contract-title">{contract.title}</p>
      ) : null}

      {/* Primary total headline — updates live as fields change */}
      {primaryTotal ? (
        <div
          className="editable-contract-primary-total"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="editable-contract-total-label">{primaryTotal.label}:</span>{" "}
          <strong className="editable-contract-total-value">
            {Math.round(derived[primaryTotal.target] ?? 0)}
            {primaryTotal.unit ? ` ${primaryTotal.unit}` : ""}
          </strong>
        </div>
      ) : null}

      {/* Editable / readonly fields */}
      <div className="editable-contract-fields">
        {contract.fields.map((field) => {
          const inputId = `${idBase}-field-${field.key}`;
          const currentValue = fieldValues[field.key] ?? field.value ?? 0;
          const isEditable = field.editable && !!onFieldValuesChange;

          if (field.kind === "slider") {
            return (
              <div key={field.key} className="form-field editable-contract-field">
                <label htmlFor={inputId} className="proposal-meta">
                  {field.label}
                  {field.unit ? ` (${field.unit})` : ""}
                </label>
                <div className="editable-contract-slider-row">
                  <input
                    id={inputId}
                    type="range"
                    min={field.min ?? 0}
                    max={field.max ?? 100}
                    step={field.step ?? 1}
                    value={currentValue}
                    disabled={disabled || !isEditable}
                    aria-valuemin={field.min ?? 0}
                    aria-valuemax={field.max ?? 100}
                    aria-valuenow={currentValue}
                    aria-label={field.label}
                    onChange={(e) => handleChange(field.key, Number(e.target.value))}
                  />
                  <span className="editable-contract-slider-value" aria-hidden="true">
                    {currentValue}
                    {field.unit ? ` ${field.unit}` : ""}
                  </span>
                </div>
              </div>
            );
          }

          if (field.kind === "number") {
            return (
              <div key={field.key} className="form-field editable-contract-field">
                <label htmlFor={inputId} className="proposal-meta">
                  {field.label}
                  {field.unit ? ` (${field.unit})` : ""}
                </label>
                <input
                  id={inputId}
                  type="number"
                  className="form-input"
                  min={field.min}
                  max={field.max}
                  step={field.step ?? 1}
                  value={currentValue}
                  disabled={disabled || !isEditable}
                  inputMode="numeric"
                  onChange={(e) => handleChange(field.key, Number(e.target.value))}
                />
              </div>
            );
          }

          if (field.kind === "text") {
            return (
              <div key={field.key} className="form-field editable-contract-field">
                <span className="proposal-meta">{field.label}</span>
                <span className="muted-text">{field.textValue ?? ""}</span>
              </div>
            );
          }

          // readonly kind
          return (
            <div key={field.key} className="form-field editable-contract-field">
              <span className="proposal-meta">{field.label}</span>
              <span className="muted-text">
                {field.value ?? "—"}
                {field.unit ? ` ${field.unit}` : ""}
              </span>
            </div>
          );
        })}
      </div>

      {/* Other (non-primary) derived rows */}
      {otherDerived.length > 0 ? (
        <div className="editable-contract-derived" role="status" aria-live="polite">
          {otherDerived.map((d) => (
            <div key={d.target} className="editable-contract-derived-row">
              <span className="proposal-meta">{d.label}:</span>{" "}
              <span className="muted-text">
                {Math.round(derived[d.target] ?? 0)}
                {d.unit ? ` ${d.unit}` : ""}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
