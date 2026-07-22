/**
 * Multinomial Naive Bayes text classifier — trained at process start on a
 * small labelled corpus of real-world scam/benign message patterns.
 *
 * This is a genuine trained statistical model (bag-of-words + Laplace
 * smoothing + log-space posterior), not a regex lookup — it generalises to
 * wording it has never seen, which the SIGNAL_LIBRARY regex list in
 * aiAnalysis.js cannot do. It complements the regex signals: regex explains
 * *which specific phrases* tripped the alert (useful for the citizen-facing
 * "AI Reasoning" panel and for court-admissible evidence), while this model
 * produces the category + a probability-calibrated confidence score.
 *
 * Swap-in path to a hosted LLM: keep the exported `classify(text)` signature
 * identical and replace the body with a Gemini/Claude call — every caller
 * (routes/aiAnalysis.js, routes/reports.js) only depends on that signature.
 */

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "to", "of", "and", "or", "in",
  "on", "at", "for", "with", "your", "you", "this", "that", "it", "will",
  "be", "as", "by", "from", "has", "have", "not", "please", "kindly",
]);

function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " __url__ ")
    .replace(/[^a-z0-9_\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOPWORDS.has(t));
}

// --- Training corpus -------------------------------------------------
// Kept intentionally small and readable so it's easy to extend with real
// reported-message text over time (e.g. export anonymised Complaint.rawContent
// rows periodically and append here, or move to a DB-backed retrain job).
const TRAINING_DATA = [
  // Digital Arrest Scam
  { text: "this is officer sharma from cbi a parcel with your aadhaar linked to narcotics has been seized stay on this video call do not disconnect", label: "Digital Arrest Scam" },
  { text: "customs department calling your courier has illegal items non bailable warrant issued stay on video call pay verification deposit now", label: "Digital Arrest Scam" },
  { text: "income tax department you are under investigation for money laundering stay on this call do not disconnect pay to avoid arrest", label: "Digital Arrest Scam" },
  { text: "enforcement directorate has issued a digital arrest order against you keep this video call active until verification completes", label: "Digital Arrest Scam" },
  { text: "narcotics control bureau found drugs in a parcel addressed to you this is a virtual arrest do not tell anyone about this call", label: "Digital Arrest Scam" },
  { text: "mumbai police cyber cell your bank account is linked to a money laundering case join this whatsapp video call immediately", label: "Digital Arrest Scam" },
  { text: "fedex courier seized illegal passports and drugs under your name cbi officer will now take your statement stay online", label: "Digital Arrest Scam" },
  // Fake Legal / Government Notice
  { text: "court notice attached enforcement directorate case pending respond within 48 hours or a warrant will be issued against you", label: "Fake Legal / Government Notice" },
  { text: "trai calling your mobile number will be blocked in 2 hours due to complaints press 9 to connect to cyber cell", label: "Fake Legal / Government Notice" },
  { text: "a first information report fir has been registered against you at your local police station regarding cybercrime", label: "Fake Legal / Government Notice" },
  { text: "your aadhaar card is being misused in another state a legal notice has been generated visit the portal to verify", label: "Fake Legal / Government Notice" },
  { text: "supreme court e notice your sim card will be deactivated today unless you confirm your identity on this call", label: "Fake Legal / Government Notice" },
  { text: "income tax notice pending against your pan card reply immediately to avoid non bailable warrant", label: "Fake Legal / Government Notice" },
  // Financial / UPI Fraud
  { text: "your electricity bill payment failed share the otp and upi pin to get refund processed within 30 minutes", label: "Financial / UPI Fraud" },
  { text: "your bank account will be suspended share otp and cvv immediately to keep account active", label: "Financial / UPI Fraud" },
  { text: "kyc update required for your bank account click link and enter your upi pin to avoid account freeze", label: "Financial / UPI Fraud" },
  { text: "you have received a refund of rupees 2340 confirm by sharing the one time password sent to your phone", label: "Financial / UPI Fraud" },
  { text: "your debit card will expire today update details and share cvv otp to continue using your card", label: "Financial / UPI Fraud" },
  { text: "credit card cashback offer share your card number cvv and otp to claim rupees 5000 instantly", label: "Financial / UPI Fraud" },
  // Phishing / Job-Lure Scam
  { text: "congratulations you got a work from home task job with daily payout click link and pay registration fee to start", label: "Phishing / Job-Lure Scam" },
  { text: "claim your lottery prize of rupees 25 lakh limited time offer click the link and pay processing charge", label: "Phishing / Job-Lure Scam" },
  { text: "you have been selected for a part time job earn 3000 rupees per day just complete simple tasks online", label: "Phishing / Job-Lure Scam" },
  { text: "kbc lucky draw winner your number has been selected for 25 lakh prize contact us to claim now", label: "Phishing / Job-Lure Scam" },
  { text: "easy money opportunity like and subscribe videos earn daily income join our telegram group now", label: "Phishing / Job-Lure Scam" },
  { text: "amazon delivery task job apply now earn commission per order no experience needed work from home", label: "Phishing / Job-Lure Scam" },
  // Unclassified / Low Signal (benign / low-risk messages)
  { text: "reminder your subscription renews tomorrow manage your plan in the app settings", label: "Unclassified / Low Signal" },
  { text: "hey are we still meeting for lunch today let me know what time works for you", label: "Unclassified / Low Signal" },
  { text: "your order has been shipped and will arrive in 3 to 5 business days track it using the app", label: "Unclassified / Low Signal" },
  { text: "thank you for your payment this month your invoice is attached for your records", label: "Unclassified / Low Signal" },
  { text: "meeting rescheduled to 3 pm tomorrow in conference room b please confirm your availability", label: "Unclassified / Low Signal" },
  { text: "happy birthday hope you have a wonderful day filled with joy and laughter", label: "Unclassified / Low Signal" },
  { text: "your appointment with the dentist is confirmed for next tuesday at 10 am", label: "Unclassified / Low Signal" },
];

const CLASSES = [...new Set(TRAINING_DATA.map((d) => d.label))];

function train(data) {
  const classDocCount = {};
  const classWordCount = {}; // total words per class
  const wordCountPerClass = {}; // {class: {word: count}}
  const vocab = new Set();

  CLASSES.forEach((c) => { classDocCount[c] = 0; classWordCount[c] = 0; wordCountPerClass[c] = {}; });

  for (const { text, label } of data) {
    classDocCount[label] += 1;
    for (const tok of tokenize(text)) {
      vocab.add(tok);
      wordCountPerClass[label][tok] = (wordCountPerClass[label][tok] || 0) + 1;
      classWordCount[label] += 1;
    }
  }

  const totalDocs = data.length;
  const priors = {};
  CLASSES.forEach((c) => { priors[c] = classDocCount[c] / totalDocs; });

  return { priors, classWordCount, wordCountPerClass, vocabSize: vocab.size };
}

const MODEL = train(TRAINING_DATA);

/**
 * classify(text) -> { label, confidence (0-100), probs: {label: prob(0-100)} }
 * Runs multinomial Naive Bayes with Laplace (add-1) smoothing in log-space
 * for numerical stability, then converts back to a normalised probability
 * distribution over classes.
 */
export function classify(text) {
  const tokens = tokenize(text);
  if (tokens.length === 0) {
    return { label: "Unclassified / Low Signal", confidence: 20, probs: {} };
  }

  const logScores = {};
  for (const c of CLASSES) {
    let logProb = Math.log(MODEL.priors[c] || 1e-6);
    const denom = MODEL.classWordCount[c] + MODEL.vocabSize; // Laplace smoothing denominator
    for (const tok of tokens) {
      const count = MODEL.wordCountPerClass[c][tok] || 0;
      logProb += Math.log((count + 1) / denom);
    }
    logScores[c] = logProb;
  }

  // Convert log-scores to a normalised probability distribution (log-sum-exp).
  const maxLog = Math.max(...Object.values(logScores));
  const expScores = {};
  let sumExp = 0;
  for (const c of CLASSES) {
    expScores[c] = Math.exp(logScores[c] - maxLog);
    sumExp += expScores[c];
  }
  const probs = {};
  for (const c of CLASSES) probs[c] = (expScores[c] / sumExp) * 100;

  const [bestLabel, bestProb] = Object.entries(probs).sort((a, b) => b[1] - a[1])[0];
  return { label: bestLabel, confidence: Math.round(bestProb), probs };
}

export const modelInfo = {
  type: "Multinomial Naive Bayes (bag-of-words, Laplace smoothing)",
  classes: CLASSES,
  trainingExamples: TRAINING_DATA.length,
  vocabSize: MODEL.vocabSize,
};
