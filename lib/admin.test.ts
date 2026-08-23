import { describe, expect, it } from "vitest";
import { isAdminEmail, parseAdminEmails } from "./admin";

describe("parseAdminEmails", () => {
  it("coupe, trim, minuscule — pas de joker", () => {
    expect(parseAdminEmails(" A@X.com , b@y.fr, * ")).toEqual([
      "a@x.com",
      "b@y.fr",
      "*",
    ]);
    expect(isAdminEmail("a@x.com", "a@x.com")).toBe(true);
    expect(isAdminEmail("other@x.com", "a@x.com")).toBe(false);
    expect(isAdminEmail("anyone@x.com", "*")).toBe(false);
  });
});
