import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { schemas } from "../middleware/validate.js";

describe("Validation schemas", () => {
  test("signup rejects a too-short password", () => {
    const result = schemas.signup.safeParse({ name: "Test User", email: "a@b.com", password: "short" });
    assert.equal(result.success, false);
  });

  test("signup accepts a valid payload", () => {
    const result = schemas.signup.safeParse({ name: "Test User", email: "a@b.com", password: "longenough123" });
    assert.equal(result.success, true);
  });

  test("signup rejects a malformed email", () => {
    const result = schemas.signup.safeParse({ name: "Test User", email: "not-an-email", password: "longenough123" });
    assert.equal(result.success, false);
  });

  test("login requires both email and password", () => {
    const result = schemas.login.safeParse({ email: "a@b.com" });
    assert.equal(result.success, false);
  });

  test("analyze rejects empty text", () => {
    const result = schemas.analyze.safeParse({ text: "" });
    assert.equal(result.success, false);
  });

  test("report rejects an unknown channel", () => {
    const result = schemas.report.safeParse({ channel: "carrier_pigeon", rawContent: "hello" });
    assert.equal(result.success, false);
  });

  test("report accepts a valid whatsapp submission with location", () => {
    const result = schemas.report.safeParse({
      channel: "whatsapp",
      rawContent: "suspicious message text",
      location: { state: "West Bengal", district: "Kolkata", lat: 22.57, lng: 88.36 },
    });
    assert.equal(result.success, true);
  });
});
