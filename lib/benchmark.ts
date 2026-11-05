export type Tree = {
  probability: number;
  samples: number;
  feature?: number;
  threshold?: number;
  left?: Tree;
  right?: Tree;
};
export const featureNames = [
  "Air temperature (K)",
  "Process temperature (K)",
  "Speed (rpm)",
  "Torque (Nm)",
  "Tool wear (min)",
  "Temperature difference (K)",
  "Power (W)",
  "Wear × torque",
];
export function features(
  air: number,
  process: number,
  speed: number,
  torque: number,
  wear: number,
) {
  return [
    air,
    process,
    speed,
    torque,
    wear,
    process - air,
    (torque * speed * Math.PI) / 30,
    wear * torque,
  ];
}
export function predict(tree: Tree, x: number[]) {
  const path: string[] = [];
  let node = tree;
  while (node.feature !== undefined && node.left && node.right) {
    const left = x[node.feature] <= node.threshold!;
    path.push(
      `${featureNames[node.feature]} ${left ? "≤" : ">"} ${node.threshold!.toFixed(2)}`,
    );
    node = left ? node.left : node.right;
  }
  return { score: node.probability, path, samples: node.samples };
}
export function metrics(labels: number[], scores: number[], threshold: number) {
  let tp = 0,
    fp = 0,
    tn = 0,
    fn = 0;
  labels.forEach((y, i) => {
    const positive = scores[i] >= threshold;
    if (y && positive) tp++;
    else if (!y && positive) fp++;
    else if (y) fn++;
    else tn++;
  });
  const precision = tp / (tp + fp) || 0,
    recall = tp / (tp + fn) || 0;
  return {
    tp,
    fp,
    tn,
    fn,
    precision,
    recall,
    f1: (2 * precision * recall) / (precision + recall) || 0,
    accuracy: (tp + tn) / labels.length,
    support: labels.length,
    positives: tp + fn,
  };
}
