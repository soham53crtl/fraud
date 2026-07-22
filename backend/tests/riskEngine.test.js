import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { classify } from "../ml/naiveBayes.js";
import { runRiskEngine } from "../routes/aiAnalysis.js";

describe("Naive Bayes classifier", () => {
  test("classifies a digital arrest scam message correctly", () => {
    const result = classify(
      "This is CBI officer speaking, a digital arrest warrant has been issued, stay on this video call and do not disconnect"
    );
    assert.equal(result.label, "Digital Arrest Scam");
    assert.ok(result.confidence > 30, `expected confidence > 30, got ${result.confidence}`);
  });

  test("classifies a UPI/OTP fraud message correctly", () => {
    const result = classify("Your bank account will be suspended, share otp and cvv immediately to keep it active");
    assert.equal(result.label, "Financial / UPI Fraud");
  });

  test("classifies a benign message as low signal", () => {
    const result = classify("Hey are we still meeting for lunch today, let me know what time works");
    assert.equal(result.label, "Unclassified / Low Signal");
  });

  test("returns a full probability distribution across all classes", () => {
    const result = classify("congratulations you won a lottery prize click here to claim");
    const total = Object.values(result.probs).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 100) < 0.5, `probabilities should sum to ~100, got ${total}`);
  });

  test("handles empty input without throwing", () => {
    const result = classify("");
    assert.equal(result.label, "Unclassified / Low Signal");
  });
});

describe("Risk engine (regex signals + NB classifier blend)", () => {
  test("flags a critical digital arrest scam with CRITICAL band", async () => {
    const verdict = await runRiskEngine(
      "This is Officer Sharma from CBI. A parcel with your Aadhaar linked to narcotics has been seized. Stay on this video call and do not disconnect. Pay a refundable verification fee immediately."
    );
    assert.equal(verdict.band, "CRITICAL");
    assert.equal(verdict.category, "Digital Arrest Scam");
    assert.ok(verdict.score >= 70);
    assert.ok(verdict.hits.length > 0, "should surface at least one explainable signal");
  });

  test("gives a low score to an unremarkable message", async () => {
    const verdict = await runRiskEngine("Reminder: your subscription renews tomorrow.");
    assert.equal(verdict.band, "LOW");
    assert.ok(verdict.score < 20);
  });

  test("keeps score within the documented 4-98 bounds", async () => {
    const verdict = await runRiskEngine("otp otp otp cbi cbi digital arrest warrant video call pay now");
    assert.ok(verdict.score >= 4 && verdict.score <= 98);
  });

  test("includes model metadata for auditability", async () => {
    const verdict = await runRiskEngine("your upi pin otp cvv please share now for refund");
    assert.ok(verdict.model && verdict.model.name, "verdict should report which model produced the category");
  });
});
