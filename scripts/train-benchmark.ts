import fs from "node:fs";
import crypto from "node:crypto";
import { features, predict, metrics, type Tree } from "../lib/benchmark.ts";
const path = "data/ai4i2020/ai4i2020.csv";
const text = fs.readFileSync(path, "utf8");
const rows = text
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((line) => {
    const r = line.split(",");
    return { x: features(+r[3], +r[4], +r[5], +r[6], +r[7]), y: +r[8] };
  });
if (
  rows.length !== 10000 ||
  rows.some(
    (r) => r.x.some((x) => !Number.isFinite(x)) || ![0, 1].includes(r.y),
  )
)
  throw new Error("Unexpected dataset schema.");
const training = rows.slice(0, 6000),
  validation = rows.slice(6000, 8000),
  test = rows.slice(8000);
const positiveWeight =
  training.filter((r) => !r.y).length / training.filter((r) => r.y).length;
function train(data: typeof rows, depth: number): Tree {
  const positives = data.filter((r) => r.y).length;
  const probability =
    (positives * positiveWeight) /
    (data.length - positives + positives * positiveWeight);
  const node: Tree = { probability, samples: data.length };
  if (
    !depth ||
    data.length < 60 ||
    positives === 0 ||
    positives === data.length
  )
    return node;
  let bestGain = 0,
    bestFeature = -1,
    bestThreshold = 0;
  const total = data.length - positives + positives * positiveWeight;
  const impurity = 2 * probability * (1 - probability);
  for (let f = 0; f < 8; f++) {
    const sorted = [...data].sort((a, b) => a.x[f] - b.x[f]);
    let lp = 0;
    for (let i = 0; i < sorted.length - 1; i++) {
      lp += sorted[i].y;
      if (
        i < 29 ||
        i > sorted.length - 31 ||
        i % Math.max(1, Math.floor(sorted.length / 40)) !== 0 ||
        sorted[i].x[f] === sorted[i + 1].x[f]
      )
        continue;
      const ln = i + 1 - lp,
        rp = positives - lp,
        rn = data.length - i - 1 - rp;
      const lw = ln + lp * positiveWeight,
        rw = rn + rp * positiveWeight;
      const lprob = (lp * positiveWeight) / lw,
        rprob = (rp * positiveWeight) / rw;
      const gain =
        impurity -
        (lw * 2 * lprob * (1 - lprob) + rw * 2 * rprob * (1 - rprob)) / total;
      if (gain > bestGain) {
        bestGain = gain;
        bestFeature = f;
        bestThreshold = (sorted[i].x[f] + sorted[i + 1].x[f]) / 2;
      }
    }
  }
  if (bestFeature < 0) return node;
  node.feature = bestFeature;
  node.threshold = bestThreshold;
  node.left = train(
    data.filter((r) => r.x[bestFeature] <= bestThreshold),
    depth - 1,
  );
  node.right = train(
    data.filter((r) => r.x[bestFeature] > bestThreshold),
    depth - 1,
  );
  return node;
}
let best:
  | {
      tree: Tree;
      depth: number;
      threshold: number;
      validation: ReturnType<typeof metrics>;
    }
  | undefined;
const candidates = [];
for (const depth of [3, 5, 7]) {
  const tree = train(training, depth);
  const scores = validation.map((r) => predict(tree, r.x).score);
  for (const threshold of [0.2, 0.35, 0.5, 0.65, 0.8]) {
    const result = metrics(
      validation.map((r) => r.y),
      scores,
      threshold,
    );
    candidates.push({ depth, threshold, f1: result.f1 });
    if (!best || result.f1 > best.validation.f1)
      best = { tree, depth, threshold, validation: result };
  }
}
const artifact = {
  version: "relayops-cart-v1",
  dataset: "UCI AI4I 2020",
  source:
    "https://archive.ics.uci.edu/dataset/601/ai4i+2020+predictive+maintenance+dataset",
  citation:
    "AI4I 2020 Predictive Maintenance Dataset. (2020). UCI Machine Learning Repository. DOI: 10.24432/C5HS5C.",
  license: "CC BY 4.0",
  datasetSHA256: crypto.createHash("sha256").update(text).digest("hex"),
  method:
    "Class-weighted CART decision tree, numeric sensor features with derived temperature difference, power and wear × torque. No failure-mode labels or IDs used as features.",
  split:
    "Ordered holdout: first 6,000 rows train; next 2,000 validation; last 2,000 test. Model depth and threshold selected on validation F1; test evaluated once after selection.",
  limitations: [
    "Synthetic benchmark, not field validation.",
    "Class-weighted leaf scores are not calibrated failure probabilities.",
    "Classifies the failure label at the observation; does not estimate remaining useful life.",
    "Equipment identities and real service conditions are unavailable; cross-equipment generalization is not established.",
    "The synthetic target is partly derived from known physical rules; performance does not establish real-world predictive accuracy.",
  ],
  training: {
    rows: 6000,
    positives: training.filter((r) => r.y).length,
    positiveWeight,
  },
  depth: best!.depth,
  threshold: best!.threshold,
  validation: best!.validation,
  test: metrics(
    test.map((r) => r.y),
    test.map((r) => predict(best!.tree, r.x).score),
    best!.threshold,
  ),
  baseline: metrics(
    test.map((r) => r.y),
    test.map(() => 0),
    0.5,
  ),
  candidates,
  tree: best!.tree,
};
fs.mkdirSync("lib/generated", { recursive: true });
fs.writeFileSync(
  "lib/generated/benchmark.json",
  JSON.stringify(artifact, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    model: artifact.version,
    depth: artifact.depth,
    threshold: artifact.threshold,
    test: artifact.test,
    baseline: artifact.baseline,
  }),
);
