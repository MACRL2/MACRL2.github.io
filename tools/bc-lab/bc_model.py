"""bc_model.py — the shared PyTorch model + weight export for the driving labs.

Used by train_bc.py (behavior cloning, chapter 4) and train_round.py (DAgger,
chapter 5). The flatten functions emit the exact memory layout the JS forward
pass (static/demos/bc-net.js) expects; tests/bc-net.test.mjs pins agreement.
"""
import torch
import torch.nn.functional as F
from torch import nn

ARCH = {"inW": 24, "inH": 24, "F1": 6, "K1": 5, "F2": 12, "K2": 3, "S": 2,
        "H": 24, "o1": 10, "o2": 4, "flat": 192}


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


def _flat(t: torch.Tensor, conv: bool):
    # conv weights [oc, ic, ky, kx] -> ((oc*K+ky)*K+kx)*C+ic, the JS layout
    a = t.detach().permute(0, 2, 3, 1) if conv else t.detach()
    return [float(v) for v in a.reshape(-1)]


def export_weights(model: PilotNetMini) -> dict:
    return {
        "W1": _flat(model.c1.weight, True),  "b1": _flat(model.c1.bias, False),
        "W2": _flat(model.c2.weight, True),  "b2": _flat(model.c2.bias, False),
        "W3": _flat(model.f1.weight, False), "b3": _flat(model.f1.bias, False),
        "W4": _flat(model.f2.weight, False), "b4": _flat(model.f2.bias, False),
    }


def train(X: torch.Tensor, y: torch.Tensor, epochs=20, batch=32, lr=2e-3, seed=5):
    """Minibatch Adam on MSE; every-10th-frame held out. Returns model + record."""
    torch.manual_seed(seed)
    model = PilotNetMini()
    opt = torch.optim.Adam(model.parameters(), lr=lr)
    idx = torch.arange(len(y))
    val_idx = idx[idx % 10 == 9]
    train_idx = idx[idx % 10 != 9]
    Xt, yt, Xv, yv = X[train_idx], y[train_idx], X[val_idx], y[val_idx]
    g = torch.Generator().manual_seed(seed)
    loss_curve, val_curve, win, step = [], [], [], 0
    for _ in range(epochs):
        for b in torch.randperm(len(yt), generator=g).split(batch):
            opt.zero_grad()
            loss = F.mse_loss(model(Xt[b]), yt[b])
            loss.backward()
            opt.step()
            step += 1
            win.append(loss.item())
            if len(win) == 5:
                loss_curve.append([step, sum(win) / 5])
                win = []
        with torch.no_grad():
            val_curve.append([step, F.mse_loss(model(Xv), yv).item()])
    model.eval()
    with torch.no_grad():
        rec = {"epochs": epochs, "steps": step,
               "trainMSE": F.mse_loss(model(Xt), yt).item(),
               "valMSE": F.mse_loss(model(Xv), yv).item(),
               "lossCurve": [[s, float(m)] for s, m in loss_curve],
               "valCurve": [[s, float(m)] for s, m in val_curve]}
    return model, rec
