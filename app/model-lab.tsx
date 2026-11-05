"use client";
import { useState } from "react";
import { FlaskConical, ArrowUpRight, Download } from "lucide-react";
import model from "@/lib/generated/benchmark.json";
import { features, predict, type Tree } from "@/lib/benchmark";
export default function ModelLab() {
  const [values, setValues] = useState([300, 310, 1500, 40, 100]);
  const result = predict(
    model.tree as Tree,
    features(...(values as [number, number, number, number, number])),
  );
  const pct = (n: number) => (n * 100).toFixed(1) + "%";
  return (
    <>
      <div className="info-banner">
        <FlaskConical size={22} />
        <div>
          <strong>A trained model, with its limits in view.</strong>
          <p>
            Reproducible classification benchmark on UCI’s synthetic AI4I 2020
            dataset. It does not control maintenance decisions or estimate time
            to failure.
          </p>
        </div>
      </div>
      <div className="metrics">
        {[
          ["TEST PRECISION", model.test.precision],
          ["TEST RECALL", model.test.recall],
          ["TEST F1", model.test.f1],
          ["TEST ACCURACY", model.test.accuracy],
        ].map(([name, value]) => (
          <section className="metric" key={name}>
            <div className="metric-top">
              <span>{name}</span>
            </div>
            <strong>{pct(Number(value))}</strong>
            <p>Untouched ordered test split · {model.test.support} rows</p>
          </section>
        ))}
      </div>
      <div className="two-col">
        <section className="panel">
          <div className="panel-head">
            <h2>Explore model inference</h2>
            <span className="badge amber">Benchmark only</span>
          </div>
          <div className="form-grid">
            {[
              "Air temperature (K)",
              "Process temperature (K)",
              "Speed (rpm)",
              "Torque (Nm)",
              "Tool wear (min)",
            ].map((name, i) => (
              <label className="field" key={name}>
                <span>{name}</span>
                <input
                  type="number"
                  min={0}
                  max={i < 2 ? 400 : i === 2 ? 10000 : 1000}
                  step="any"
                  value={values[i]}
                  onChange={(e) =>
                    setValues((old) =>
                      old.map((x, j) => (j === i ? Number(e.target.value) : x)),
                    )
                  }
                />
              </label>
            ))}
          </div>
          <div className="model-outcome">
            <span
              className={
                "badge " + (result.score >= model.threshold ? "red" : "green")
              }
            >
              {result.score >= model.threshold
                ? "Failure class"
                : "Normal class"}
            </span>
            <strong>{result.score.toFixed(3)}</strong>
            <p>
              Weighted leaf score · threshold {model.threshold} ·{" "}
              {result.samples} training observations in this leaf
            </p>
          </div>
          <p className="footnote">
            This score is not a calibrated probability. Values outside the
            benchmark’s operating range may produce unreliable results.
          </p>
          <details>
            <summary>Inspect the decision path</summary>
            <ol>
              {result.path.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ol>
          </details>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>Held-out confusion matrix</h2>
          </div>
          <table>
            <thead>
              <tr>
                <th>Actual / predicted</th>
                <th>Failure</th>
                <th>Normal</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Failure</td>
                <td>{model.test.tp} true positives</td>
                <td>{model.test.fn} missed failures</td>
              </tr>
              <tr>
                <td>Normal</td>
                <td>{model.test.fp} false alarms</td>
                <td>{model.test.tn} true negatives</td>
              </tr>
            </tbody>
          </table>
          <div className="baseline">
            <h3>Compare with a baseline</h3>
            <p>
              A model that always predicts normal has{" "}
              {pct(model.baseline.accuracy)} accuracy and{" "}
              {pct(model.baseline.recall)} failure recall. Class imbalance makes
              accuracy alone misleading.
            </p>
          </div>
          <p className="footnote">
            Failure prevalence in the test split: {model.test.positives} /{" "}
            {model.test.support}. All metrics are derived by the committed
            training script.
          </p>
        </section>
      </div>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Evaluation & provenance</h2>
            <p>
              {model.version} · depth {model.depth}
            </p>
          </div>
          <a
            className="btn"
            href={model.source}
            target="_blank"
            rel="noreferrer"
          >
            Dataset source <ArrowUpRight size={15} />
          </a>
        </div>
        <p className="notes">{model.method}</p>
        <p className="notes">{model.split}</p>
        <h3>Known limitations</h3>
        <ul className="limitations">
          {model.limitations.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        <div className="model-attribution">
          <p>
            {model.citation} Licensed {model.license}.
          </p>
          <code>Dataset SHA-256: {model.datasetSHA256}</code>
        </div>
        <button
          className="btn"
          onClick={() => {
            const u = URL.createObjectURL(
              new Blob([JSON.stringify(model, null, 2)], {
                type: "application/json",
              }),
            );
            const a = document.createElement("a");
            a.href = u;
            a.download = "relayops-model-card.json";
            a.click();
            setTimeout(() => URL.revokeObjectURL(u), 1000);
          }}
        >
          <Download size={15} /> Download model & evaluation
        </button>
      </section>
    </>
  );
}
