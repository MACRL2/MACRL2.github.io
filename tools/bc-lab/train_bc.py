#!/usr/bin/env python3
"""train_bc.py — train the driving policy with PyTorch and export it for the site.

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
import torch.nn.functional as F
from torch import nn

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
SITE_WEIGHTS = HERE.parent.parent / "static" / "demos" / "bc-weights.json"

EPOCHS = 20
BATCH = 32
LR = 2e-3
SEED = 5
TEST_FRAMES = [0, 777, 1500]  # pinned frames used as JS-vs-torch test vectors


# image 24×24×1 → conv 5×5 s2 ×6 → conv 3×3 s2 ×12 → dense 192→24 → dense 24→1
class PilotNetMini(nn.Module):
    def __init__(self):
        super().__init__()
        self.c1 = nn.Conv2d(1, 6, 5, stride=2)
        self.c2 = nn.Conv2d(6, 12, 3, stride=2)
        self.f1 = nn.Linear(192, 24)
        self.f2 = nn.Linear(24, 1)

    def forward(self, x):                       # x: [N, 1, 24, 24]
        h = F.relu(self.c1(x))
        h = F.relu(self.c2(h))
        h = h.permute(0, 2, 3, 1).flatten(1)    # HWC order — matches the JS runtime
        h = F.relu(self.f1(h))
        return self.f2(h).squeeze(-1)


def load_variant(name: str, meta: dict):
    n, w, h = meta["nFrames"], meta["obsW"], meta["obsH"]
    X = np.fromfile(OUT / f"X-{name}.bin", np.float32).reshape(n, 1, h, w)
    y = np.fromfile(OUT / f"y-{name}.bin", np.float32)
    return torch.from_numpy(X), torch.from_numpy(y)


def train_variant(name: str, X, y):
    torch.manual_seed(SEED)
    model = PilotNetMini()
    opt = torch.optim.Adam(model.parameters(), lr=LR)

    idx = np.arange(len(y))
    val_idx = idx[idx % 10 == 9]                # every 10th frame held out (same split as the page)
    train_idx = idx[idx % 10 != 9]
    Xt, yt = X[train_idx], y[train_idx]
    Xv, yv = X[val_idx], y[val_idx]

    g = torch.Generator().manual_seed(SEED)
    loss_curve, val_curve, win = [], [], []
    step = 0
    for _ in range(EPOCHS):
        for batch in torch.randperm(len(yt), generator=g).split(BATCH):
            opt.zero_grad()
            loss = F.mse_loss(model(Xt[batch]), yt[batch])
            loss.backward()
            opt.step()
            step += 1
            win.append(loss.item())
            if len(win) == 5:                   # record every 5th step (what the page plots)
                loss_curve.append([step, sum(win) / 5])
                win = []
        with torch.no_grad():
            val_curve.append([step, F.mse_loss(model(Xv), yv).item()])

    model.eval()
    with torch.no_grad():
        train_mse = F.mse_loss(model(Xt), yt).item()
        val_mse = F.mse_loss(model(Xv), yv).item()
        vectors = [
            {"variant": name, "frame": int(i), "label": float(y[i]), "y": float(model(X[i : i + 1]).item())}
            for i in TEST_FRAMES
        ]
    print(f"{name}: {step} steps · train MSE {train_mse:.3e} · held-out MSE {val_mse:.3e}")

    def flat(t: torch.Tensor, conv: bool):
        # conv weights [oc, ic, ky, kx] -> ((oc*K+ky)*K+kx)*C+ic, the JS layout
        a = t.detach().permute(0, 2, 3, 1) if conv else t.detach()
        return [float(v) for v in a.reshape(-1)]

    weights = {
        "W1": flat(model.c1.weight, True),  "b1": flat(model.c1.bias, False),
        "W2": flat(model.c2.weight, True),  "b2": flat(model.c2.bias, False),
        "W3": flat(model.f1.weight, False), "b3": flat(model.f1.bias, False),
        "W4": flat(model.f2.weight, False), "b4": flat(model.f2.bias, False),
        "epochs": EPOCHS, "trainMSE": train_mse, "valMSE": val_mse,
        "lossCurve": [[s, float(m)] for s, m in loss_curve],
        "valCurve": [[s, float(m)] for s, m in val_curve],
    }
    return weights, vectors


def main():
    meta = json.loads((OUT / "meta.json").read_text())
    out = {
        "arch": {"inW": 24, "inH": 24, "F1": 6, "K1": 5, "F2": 12, "K2": 3, "S": 2,
                 "H": 24, "o1": 10, "o2": 4, "flat": 192},
        "source": f"tools/bc-lab/train_bc.py · torch {torch.__version__} · "
                  f"datasets: tools/bc-lab/export-dataset.mjs (seeds {meta['variants']})",
        "variants": {},
        "testVectors": [],
    }
    for name in ("clean", "dart"):
        X, y = load_variant(name, meta)
        weights, vectors = train_variant(name, X, y)
        out["variants"][name] = weights
        out["testVectors"] += vectors
    SITE_WEIGHTS.write_text(json.dumps(out))
    print(f"wrote {SITE_WEIGHTS} ({SITE_WEIGHTS.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
