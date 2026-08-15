#!/usr/bin/env python3
"""train_round.py — one DAgger round: fit the policy to the AGGREGATE dataset.

Called by run_dagger.mjs once per round. Reads the aggregated (obs, label)
binaries, trains from scratch with the exact recipe chapter 4 used (Follow-The-
Leader on the sequence of rollout losses), and emits weights + the recorded
curves + parity vectors as JSON.

Usage: train_round.py --x X.bin --y y.bin --n <frames> --out round.json
"""
import argparse
import json

import numpy as np
import torch

from bc_model import export_weights, train


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--x", required=True)
    ap.add_argument("--y", required=True)
    ap.add_argument("--n", type=int, required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    X = torch.from_numpy(np.fromfile(a.x, np.float32).reshape(a.n, 1, 24, 24))
    y = torch.from_numpy(np.fromfile(a.y, np.float32))
    model, rec = train(X, y)

    # parity vectors: first / middle / last aggregate frames, obs inline so the
    # committed test can pin JS inference == torch inference with no regen
    picks = [0, a.n // 2, a.n - 1]
    with torch.no_grad():
        vectors = [
            {"obs": [round(float(v), 6) for v in X[i].reshape(-1)],
             "label": float(y[i]), "y": float(model(X[i:i + 1]).item())}
            for i in picks
        ]

    with open(a.out, "w") as f:
        json.dump({**export_weights(model), **rec, "vectors": vectors}, f)
    print(f"round fit: n={a.n} steps={rec['steps']} train={rec['trainMSE']:.3e} val={rec['valMSE']:.3e}")


if __name__ == "__main__":
    main()
