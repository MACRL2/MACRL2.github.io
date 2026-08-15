#!/usr/bin/env python3
"""train_bc.py — train the behavior-cloning policy (chapter 4) and export it.

The simulator, expert, and camera live in JavaScript (static/demos/bc-car.js —
they must run in the reader's browser). Learning belongs in PyTorch. This
script consumes the datasets exported by export-dataset.mjs, trains the small
CNN for both variants (clean, dart), and writes everything the page needs to
static/demos/bc-weights.json:

  - weights, flattened in the exact memory layout the JS forward pass uses
  - the recorded training / held-out loss curves (the page replays the real ones)
  - final metrics, and test vectors that pin JS inference == PyTorch inference

Usage:
  node tools/bc-lab/export-dataset.mjs
  .venv/bin/python tools/bc-lab/train_bc.py      # needs: pip install torch numpy
"""
import json
from pathlib import Path

import numpy as np
import torch

from bc_model import ARCH, export_weights, train

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
SITE_WEIGHTS = HERE.parent.parent / "static" / "demos" / "bc-weights.json"

TEST_FRAMES = [0, 777, 1500]  # pinned frames used as JS-vs-torch test vectors


def load_variant(name: str, meta: dict):
    n, w, h = meta["nFrames"], meta["obsW"], meta["obsH"]
    X = np.fromfile(OUT / f"X-{name}.bin", np.float32).reshape(n, 1, h, w)
    y = np.fromfile(OUT / f"y-{name}.bin", np.float32)
    return torch.from_numpy(X), torch.from_numpy(y)


def main():
    meta = json.loads((OUT / "meta.json").read_text())
    out = {
        "arch": ARCH,
        "source": f"tools/bc-lab/train_bc.py · torch {torch.__version__} · "
                  f"datasets: tools/bc-lab/export-dataset.mjs (seeds {meta['variants']})",
        "variants": {},
        "testVectors": [],
    }
    for name in ("clean", "dart"):
        X, y = load_variant(name, meta)
        model, rec = train(X, y)
        print(f"{name}: {rec['steps']} steps · train MSE {rec['trainMSE']:.3e} · held-out MSE {rec['valMSE']:.3e}")
        with torch.no_grad():
            out["testVectors"] += [
                {"variant": name, "frame": int(i), "label": float(y[i]), "y": float(model(X[i:i + 1]).item())}
                for i in TEST_FRAMES
            ]
        out["variants"][name] = {**export_weights(model), **rec}
    SITE_WEIGHTS.write_text(json.dumps(out))
    print(f"wrote {SITE_WEIGHTS} ({SITE_WEIGHTS.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
