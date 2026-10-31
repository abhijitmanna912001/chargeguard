import { describe, expect, it } from "vitest";
import { assertTestDatabaseUrl } from "./test-helpers";

describe("assertTestDatabaseUrl", () => {
  it("accepts a database name ending in _test", () => {
    expect(assertTestDatabaseUrl("postgresql://u:p@localhost:5432/chargeguard_test")).toBe(
      "chargeguard_test",
    );
  });

  it("ignores query parameters when reading the name", () => {
    expect(
      assertTestDatabaseUrl("postgresql://u:p@localhost:5432/chargeguard_test?schema=public"),
    ).toBe("chargeguard_test");
  });

  it("rejects the dev database", () => {
    expect(() => assertTestDatabaseUrl("postgresql://u:p@localhost:5432/chargeguard")).toThrow(
      /does not end with "_test"/,
    );
  });

  it("rejects a name that only contains _test", () => {
    expect(() =>
      assertTestDatabaseUrl("postgresql://u:p@localhost:5432/chargeguard_test_backup"),
    ).toThrow(/does not end/);
  });

  it("rejects a missing URL, an empty name and garbage", () => {
    expect(() => assertTestDatabaseUrl(undefined)).toThrow(/not set/);
    expect(() => assertTestDatabaseUrl("postgresql://u:p@localhost:5432/")).toThrow(/does not end/);
    expect(() => assertTestDatabaseUrl("not a url")).toThrow(/could not parse/);
  });

  it("never leaks the password in the error", () => {
    try {
      assertTestDatabaseUrl("postgresql://u:s3cret@localhost:5432/chargeguard");
    } catch (e) {
      expect(String(e)).not.toContain("s3cret");
    }
  });
});
