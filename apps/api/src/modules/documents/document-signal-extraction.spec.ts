import { describe, expect, it } from "vitest";
import {
  buildIgnoredContentExplanation,
  DevLabSignalExtractor,
} from "./document-signal-extraction.js";

describe("DevLabSignalExtractor", () => {
  it("extracts allowlisted lab signals without persisting raw document text", () => {
    const extractor = new DevLabSignalExtractor();
    const plainText =
      "Lab Report\nCollected: 2026-05-01\nVitamin D: 22 ng/mL\nReference range 30-100 ng/mL\nEnergy level: 4 / 10";

    const signals = extractor.extract(plainText);

    expect(signals.some((signal) => signal.signalKey === "vitamin_d")).toBe(true);
    expect(signals.some((signal) => signal.signalKey === "energy_level")).toBe(true);
    expect(JSON.stringify(signals)).not.toContain("Lab Report");
  });

  it("ignores unsupported lab fields and explains empty extractions", () => {
    const extractor = new DevLabSignalExtractor();
    const signals = extractor.extract(
      "Lab Report\nCollected: 2026-05-01\nUnsupported Marker: 10 units\nDiagnosis: example text",
    );

    expect(signals).toHaveLength(0);
    expect(buildIgnoredContentExplanation(signals.length)).toContain(
      "No allowlisted wellness-relevant lab fields were detected.",
    );
  });

  it("rejects malformed observed dates before returning extracted signals", () => {
    const extractor = new DevLabSignalExtractor();

    expect(() =>
      extractor.extract("Lab Report\nCollected: 13/40/2026\nVitamin D: 22 ng/mL"),
    ).toThrow("Extracted signal payload failed validation.");
  });
});
