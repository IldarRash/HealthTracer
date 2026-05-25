import type { WellbeingScore } from "@health/types";
import { WELLBEING_SCORE_OPTIONS } from "../../lib/wellbeing-ui-state";

type WellbeingScaleInputProps = {
  id: string;
  label: string;
  value: WellbeingScore | null;
  optionLabels: Record<WellbeingScore, string>;
  disabled?: boolean;
  onChange: (score: WellbeingScore) => void;
};

export function WellbeingScaleInput({
  id,
  label,
  value,
  optionLabels,
  disabled = false,
  onChange,
}: WellbeingScaleInputProps) {
  return (
    <fieldset className="wellbeing-scale-fieldset" disabled={disabled}>
      <legend className="wellbeing-scale-legend">{label}</legend>
      <div className="wellbeing-scale-options" role="radiogroup" aria-label={label}>
        {WELLBEING_SCORE_OPTIONS.map((score) => {
          const selected = value === score;
          const optionId = `${id}-${score}`;

          return (
            <label
              key={score}
              htmlFor={optionId}
              className={`wellbeing-scale-option${selected ? " wellbeing-scale-option--selected" : ""}`}
            >
              <input
                id={optionId}
                type="radio"
                name={id}
                value={score}
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(score)}
              />
              <span className="wellbeing-scale-option__score">{score}</span>
              <span className="wellbeing-scale-option__label">{optionLabels[score]}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
