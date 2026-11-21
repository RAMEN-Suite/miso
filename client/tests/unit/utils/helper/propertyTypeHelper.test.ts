import { describe, expect, test } from "vitest";
import {
  getTemporalInputType,
  isNumeric,
  isTemporal,
  toStoredTemporal,
  toTemporalInputValue,
} from "../../../../src/utils/helper/propertyTypeHelper";

describe("toStoredTemporal", () => {
  test.for([null, undefined, ""])("returns null for a cleared input (%j)", (value) => {
    expect(toStoredTemporal(value, "Date")).toBeNull();
  });

  test.for([
    ["Date", "2024-03-01", "2024-03-01"],
    ["DateTime", "2024-03-01T09:30", "2024-03-01T09:30:00.000Z"],
    ["DateTime", "2024-03-01T09:30:15", "2024-03-01T09:30:15.000Z"],
  ] as const)("%s: %s -> %s", ([type, input, expected]) => {
    expect(toStoredTemporal(input, type)).toBe(expected);
  });
});

describe("toTemporalInputValue", () => {
  test.for([null, undefined, ""])("returns an empty string for a missing value (%j)", (value) => {
    expect(toTemporalInputValue(value, "DateTime")).toBe("");
  });

  test.for([
    ["Date", "2024-03-01", "2024-03-01"],
    ["DateTime", "2024-03-01T09:30:15.000Z", "2024-03-01T09:30:15"],
  ] as const)("%s: %s -> %s", ([type, stored, expected]) => {
    expect(toTemporalInputValue(stored, type)).toBe(expected);
  });

  test.for([
    ["Date", "2024-03-01", "2024-03-01"],
    ["DateTime", "2024-03-01T09:30", "2024-03-01T09:30:00"],
  ] as const)("round-trips %s input %s via storage", ([type, input, expected]) => {
    expect(toTemporalInputValue(toStoredTemporal(input, type), type)).toBe(expected);
  });
});

describe("getTemporalInputType", () => {
  test.for([
    ["Date", "date"],
    ["DateTime", "datetime-local"],
  ] as const)("%s -> %s", ([type, expected]) => {
    expect(getTemporalInputType(type)).toBe(expected);
  });
});

describe("type checks without a value type", () => {
  test.for([isNumeric, isTemporal])("%o returns false", (check) => {
    expect(check(undefined)).toBe(false);
  });
});
