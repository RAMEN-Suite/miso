import { describe, expect, test } from "vitest";
import { PropertyConfigDataType } from "../../../../src/models/types";
import {
  getTemporalInputType,
  isArray,
  isNumeric,
  isTemporal,
  toStoredTemporal,
  toTemporalInputValue,
} from "../../../../src/utils/helper/propertyTypeHelper";

const config = (type: PropertyConfigDataType) => ({ type });

describe("toStoredTemporal", () => {
  test.for([null, undefined, ""])("returns null for a cleared input (%j)", (value) => {
    expect(toStoredTemporal(value, config("Date"))).toBeNull();
  });

  test.for([
    ["Date", "2024-03-01", "2024-03-01"],
    ["Time", "09:30", "09:30:00"],
    ["Time", "09:30:15", "09:30:15"],
    ["DateTime", "2024-03-01T09:30", "2024-03-01T09:30:00.000Z"],
    ["DateTime", "2024-03-01T09:30:15", "2024-03-01T09:30:15.000Z"],
  ] as const)("%s: %s -> %s", ([type, input, expected]) => {
    expect(toStoredTemporal(input, config(type))).toBe(expected);
  });
});

describe("toTemporalInputValue", () => {
  test.for([null, undefined, ""])("returns an empty string for a missing value (%j)", (value) => {
    expect(toTemporalInputValue(value, config("DateTime"))).toBe("");
  });

  test.for([
    ["Date", "2024-03-01", "2024-03-01"],
    ["Time", "09:30:00", "09:30:00"],
    ["DateTime", "2024-03-01T09:30:15.000Z", "2024-03-01T09:30:15"],
  ] as const)("%s: %s -> %s", ([type, stored, expected]) => {
    expect(toTemporalInputValue(stored, config(type))).toBe(expected);
  });

  test.for([
    ["Date", "2024-03-01", "2024-03-01"],
    ["Time", "09:30", "09:30:00"],
    ["DateTime", "2024-03-01T09:30", "2024-03-01T09:30:00"],
  ] as const)("round-trips %s input %s via storage", ([type, input, expected]) => {
    expect(toTemporalInputValue(toStoredTemporal(input, config(type)), config(type))).toBe(expected);
  });
});

describe("getTemporalInputType", () => {
  test.for([
    ["Date", "date"],
    ["Time", "time"],
    ["DateTime", "datetime-local"],
  ] as const)("%s -> %s", ([type, expected]) => {
    expect(getTemporalInputType(config(type))).toBe(expected);
  });
});

describe("type checks without a config", () => {
  test.for([isArray, isNumeric, isTemporal])("%o returns false", (check) => {
    expect(check(undefined)).toBe(false);
  });
});
