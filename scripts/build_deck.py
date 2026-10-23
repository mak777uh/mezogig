"""Builds docs/deck.pdf (via pptx) for the AKINDO submission. 8 slides, 16:9, dark theme."""
import os
import sys

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCREENS = os.path.join(ROOT, "docs", "screens")

BG = RGBColor(0x04, 0x13, 0x0C)
PANEL = RGBColor(0x0A, 0x20, 0x15)
ACCENT = RGBColor(0x00, 0xD6, 0x8F)
TEXT = RGBColor(0xE8, 0xF5, 0xEE)
MUTED = RGBColor(0x8F, 0xB5, 0xA1)
WARN = RGBColor(0xFF, 0xB0, 0x20)

W, H = Inches(13.333), Inches(7.5)
prs = Presentation()
prs.slide_width, prs.slide_height = W, H
BLANK = prs.slide_layouts[6]


def slide():
    s = prs.slides.add_slide(BLANK)
    s.background.fill.solid()
    s.background.fill.fore_color.rgb = BG
    return s


def box(s, l, t, w, h, fill=None, line=None):
    from pptx.enum.shapes import MSO_SHAPE
    shp = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, l, t, w, h)
    shp.adjustments[0] = 0.06
    if fill is None:
        shp.fill.background()
    else:
        shp.fill.solid()
        shp.fill.fore_color.rgb = fill
    if line is None:
        shp.line.fill.background()
    else:
        shp.line.color.rgb = line
        shp.line.width = Pt(1)
    shp.shadow.inherit = False
    return shp


def text(s, l, t, w, h, runs, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, space=6):
    tb = s.shapes.add_textbox(l, t, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = 0
    tf.margin_top = tf.margin_bottom = 0
    first = True
    for item in runs:
        content, size, color, bold, *rest = item
        p = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        p.alignment = align
        p.space_after = Pt(space)
        run = p.add_run()
        run.text = content
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.color.rgb = color
        run.font.name = "Segoe UI"
        if rest and rest[0] == "bullet":
            pPr = p._pPr if p._pPr is not None else p._p.get_or_add_pPr()
            pPr.set("indent", "-171450")
            pPr.set("marL", "171450")
        if rest and rest[0] == "bullet":
            run.text = "•  " + content
    return tb


def header(s, kicker, title):
    text(s, Inches(0.7), Inches(0.45), Inches(12), Inches(0.4), [(kicker.upper(), 12, ACCENT, True)])
    text(s, Inches(0.7), Inches(0.85), Inches(12), Inches(1.0), [(title, 34, TEXT, True)])
    line = s.shapes.add_shape(1, Inches(0.7), Inches(1.85), Inches(1.6), Emu(38100))
    line.fill.solid()
    line.fill.fore_color.rgb = ACCENT
    line.line.fill.background()


def footer(s, n):
    text(s, Inches(0.7), Inches(7.0), Inches(9), Inches(0.3),
         [("MezoGig · milestone escrow in MUSD on Mezo · AKINDO “Build with MUSD and MEZO”, Wave 1", 10, MUTED, False)])
    text(s, Inches(11.8), Inches(7.0), Inches(0.9), Inches(0.3), [(f"{n}/9", 10, MUTED, False)], align=PP_ALIGN.RIGHT)


# 1 — title -----------------------------------------------------------------
s = slide()
box(s, Inches(0.7), Inches(0.6), Inches(1.1), Emu(91440), fill=ACCENT)
text(s, Inches(0.7), Inches(1.5), Inches(11.9), Inches(1.0),
     [("MezoGig", 54, TEXT, True)])
text(s, Inches(0.7), Inches(2.6), Inches(11.4), Inches(1.2),
     [("Milestone escrow for freelance work, settled in MUSD", 28, ACCENT, True)])
text(s, Inches(0.7), Inches(3.5), Inches(11.0), Inches(1.8), [
    ("The client locks the whole gig budget up-front in MUSD. Each milestone is released on delivery;", 17, TEXT, False),
    ("a silent client cannot block payment forever, and a disputed milestone is split by an arbiter.", 17, TEXT, False),
    ("", 8, TEXT, False),
    ("AKINDO “Build with MUSD and MEZO” · Wave 1 · Mezo Testnet (chainId 31611)", 14, MUTED, False),
])
box(s, Inches(0.7), Inches(5.3), Inches(5.7), Inches(1.35), fill=PANEL, line=RGBColor(0x1D, 0x4A, 0x33))
text(s, Inches(0.95), Inches(5.45), Inches(5.3), Inches(1.1), [
    ("Live demo", 11, MUTED, True),
    ("https://mak777uh.github.io/mezogig/", 14, ACCENT, True),
    ("Repo: github.com/mak777uh/mezogig", 11, MUTED, False),
])
box(s, Inches(6.7), Inches(5.3), Inches(5.9), Inches(1.35), fill=PANEL, line=RGBColor(0x1D, 0x4A, 0x33))
text(s, Inches(6.95), Inches(5.45), Inches(5.5), Inches(1.1), [
    ("Contract (Mezo Testnet)", 11, MUTED, True),
    ("0x247b313d0eD3C532B16c7E5f9eA760272361600F", 12, TEXT, True),
    ("Sourcify exact_match · 90 tests · no owner, no fee", 11, MUTED, False),
])
footer(s, 1)

# 2 — problem ---------------------------------------------------------------
s = slide()
header(s, "Problem", "Freelancers work first and get paid later — or not at all")
box(s, Inches(0.7), Inches(2.2), Inches(5.7), Inches(3.9), fill=PANEL, line=RGBColor(0x1D, 0x4A, 0x33))
text(s, Inches(0.95), Inches(2.4), Inches(5.2), Inches(3.5), [
    ("For the freelancer", 16, ACCENT, True),
    ("Deliver first → the client can disappear with the work.", 14, TEXT, False, "bullet"),
    ("No small-claims court for a $300 gig across borders.", 14, TEXT, False, "bullet"),
    ("Clients who do pay upfront invert the risk the other way.", 14, TEXT, False, "bullet"),
    ("", 8, TEXT, False),
    ("For the client", 16, ACCENT, True),
    ("Pay first → the freelancer can disappear with the money.", 14, TEXT, False, "bullet"),
    ("No neutral, cheap way to hold funds per milestone.", 14, TEXT, False, "bullet"),
])
box(s, Inches(6.7), Inches(2.2), Inches(5.9), Inches(3.9), fill=PANEL, line=RGBColor(0x1D, 0x4A, 0x33))
text(s, Inches(6.95), Inches(2.4), Inches(5.4), Inches(3.5), [
    ("Why stablecoin, why now", 16, ACCENT, True),
    ("Crypto clients can pay instantly — but a volatile budget is unusable for real work.", 14, TEXT, False, "bullet"),
    ("MUSD is a Bitcoin-backed stablecoin: the client keeps BTC exposure, the freelancer gets a stable unit.", 14, TEXT, False, "bullet"),
    ("Existing escrow contracts are all-or-nothing: no milestones, no review window, no refunds, no arbiter.", 14, TEXT, False, "bullet"),
    ("Result: crypto-native work still runs on trust and screenshots.", 14, WARN, True, "bullet"),
])
footer(s, 2)

# 3 — solution --------------------------------------------------------------
s = slide()
header(s, "Solution", "One escrow contract, four exits, zero admin keys")
steps = [
    ("1 · Fund", "Client deposits the full budget in MUSD (approve, or one-tx EIP-2612 permit)."),
    ("2 · Deliver", "Freelancer submits a milestone with a proof link before its deadline."),
    ("3 · Release", "Client approves → paid instantly. Silence → freelancer claims after 148 s review window."),
    ("4 · Exit", "Missed deadline → refund. Disagreement → arbiter splits. Both agree → mutual cancel."),
]
y = Inches(2.15)
for i, (t, d) in enumerate(steps):
    box(s, Inches(0.7), y, Inches(0.62), Inches(0.62), fill=ACCENT)
    text(s, Inches(0.7), y + Inches(0.08), Inches(0.62), Inches(0.5), [(t.split(" ")[0], 16, BG, True)], align=PP_ALIGN.CENTER)
    text(s, Inches(1.55), y - Inches(0.04), Inches(11.0), Inches(0.4), [(t, 17, TEXT, True)])
    text(s, Inches(1.55), y + Inches(0.38), Inches(11.0), Inches(0.5), [(d, 13, MUTED, False)])
    y += Inches(1.02)
box(s, Inches(0.7), Inches(6.15), Inches(11.9), Inches(0.72), fill=PANEL, line=RGBColor(0x1D, 0x4A, 0x33))
text(s, Inches(0.95), Inches(6.27), Inches(11.4), Inches(0.5),
     [("No owner role · no platform fee · no upgradeability · token address immutable", 14, ACCENT, True)])
footer(s, 3)

# 4 — MUSD integration ------------------------------------------------------
s = slide()
header(s, "Integration (30 % of the score)", "How MUSD is used — not decoration, settlement")
box(s, Inches(0.7), Inches(2.15), Inches(6.4), Inches(4.2), fill=PANEL, line=RGBColor(0x1D, 0x4A, 0x33))
text(s, Inches(0.95), Inches(2.35), Inches(5.9), Inches(3.8), [
    ("Money flows", 16, ACCENT, True),
    ("Deposit: safeTransferFrom(client → escrow) of the full milestone sum, or createGigWithPermit (EIP-2612) with no separate approve.", 13, TEXT, False, "bullet"),
    ("Payout: escrow → freelancer on approve, or on claim after the review period.", 13, TEXT, False, "bullet"),
    ("Refund: escrow → client after a missed deadline, or on mutual cancel.", 13, TEXT, False, "bullet"),
    ("Dispute: arbiter splits the milestone by basis points; the remainder returns to the client.", 13, TEXT, False, "bullet"),
    ("Accounting invariant: paidOut + refunded ≤ funded, each milestone settles exactly once.", 13, ACCENT, True, "bullet"),
])
box(s, Inches(7.4), Inches(2.15), Inches(5.2), Inches(4.2), fill=PANEL, line=RGBColor(0x1D, 0x4A, 0x33))
text(s, Inches(7.65), Inches(2.35), Inches(4.7), Inches(3.8), [
    ("Facts on-chain", 16, ACCENT, True),
    ("MUSD 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503 — 18 decimals, permit supported.", 13, TEXT, False, "bullet"),
    ("Contract bound to that token by an immutable address.", 13, TEXT, False, "bullet"),
    ("Deployed on Mezo Testnet, block 16247351.", 13, TEXT, False, "bullet"),
    ("", 6, TEXT, False),
    ("Honest gap: MEZO token is not integrated.", 13, WARN, True, "bullet"),
    ("The rules allow “MUSD and/or MEZO”; MEZO utility (fee discounts, staked arbiters) is on the roadmap and is not claimed as done.", 12, MUTED, False),
])
footer(s, 4)

# 5 — demo ------------------------------------------------------------------
s = slide()
header(s, "Demo (10 % UX + 10 % materials)", "What a judge sees in the first five minutes")
shots = [
    ("01-my-gigs.png", "Gigs list, role filters, live contract link"),
    ("02-create-gig.png", "Create: two milestones, deadlines, deposit"),
    ("03-connect-wallet.png", "Wallet connect — Mezo Testnet only"),
]
x = Inches(0.7)
for name, cap in shots:
    p = os.path.join(SCREENS, name)
    if os.path.exists(p):
        s.shapes.add_picture(p, x, Inches(2.15), width=Inches(3.85))
    text(s, x, Inches(5.15), Inches(3.85), Inches(0.6), [(cap, 11, MUTED, False)])
    x += Inches(4.05)
box(s, Inches(0.7), Inches(5.85), Inches(11.9), Inches(1.0), fill=PANEL, line=RGBColor(0x1D, 0x4A, 0x33))
text(s, Inches(0.95), Inches(5.98), Inches(11.4), Inches(0.8), [
    ("Create → submit → approve → claim → dispute → refund", 14, ACCENT, True),
    ("Live: https://mak777uh.github.io/mezogig/  ·  contract: https://explorer.test.mezo.org/address/0x247b313d0eD3C532B16c7E5f9eA760272361600F", 11, TEXT, False),
])
footer(s, 5)

# 6 — technical -------------------------------------------------------------
s = slide()
header(s, "Technical (20 %)", "Small contract, boring security, checkable evidence")
left = [
    ("90 tests", "lifecycle, guards, terminal states, fuzz invariants"),
    ("100 % / 92 %", "statements / branches of the escrow contract"),
    ("6 attacks", "malicious ERC-20 reentrancy attempts, all rejected"),
    ("6 Slither findings", "every one dispositioned, no high/medium"),
    ("Sourcify exact_match", "creation + runtime bytecode, chain 31611"),
]
y = Inches(2.15)
for t, d in left:
    box(s, Inches(0.7), y, Inches(5.9), Inches(0.78), fill=PANEL, line=RGBColor(0x1D, 0x4A, 0x33))
    text(s, Inches(0.9), y + Inches(0.08), Inches(5.5), Inches(0.3), [(t, 15, ACCENT, True)])
    text(s, Inches(0.9), y + Inches(0.4), Inches(5.5), Inches(0.3), [(d, 11, MUTED, False)])
    y += Inches(0.9)
box(s, Inches(6.9), Inches(2.15), Inches(5.7), Inches(2.55), fill=RGBColor(0x06, 0x18, 0x0F), line=RGBColor(0x1D, 0x4A, 0x33))
text(s, Inches(7.1), Inches(2.28), Inches(5.3), Inches(2.3), [
    ("Verify in one command", 12, MUTED, True),
    ("ESCROW_ADDRESS=0x247b…600F \\", 10, TEXT, False),
    ("  node scripts/check-musd.js", 10, TEXT, False),
    ("→ musd(), reviewPeriod()=148, gigCount()=0", 10, ACCENT, False),
    ("", 4, TEXT, False),
    ("npm test        # 90 passing", 10, TEXT, False),
    ("npm run coverage", 10, TEXT, False),
    ("npm run verify:sourcify", 10, TEXT, False),
])
box(s, Inches(6.9), Inches(4.85), Inches(5.7), Inches(1.55), fill=PANEL, line=RGBColor(0x1D, 0x4A, 0x33))
text(s, Inches(7.1), Inches(4.98), Inches(5.3), Inches(1.3), [
    ("Security model", 12, ACCENT, True),
    ("No owner, no withdrawal path, no delegatecall", 11, TEXT, False),
    ("CEI + nonReentrant + SafeERC20, immutable token", 11, TEXT, False),
    ("Payouts bounded per milestone, settle once", 11, TEXT, False),
])
footer(s, 6)

# 7 — business --------------------------------------------------------------
s = slide()
header(s, "Business (30 %)", "Why the market pays for this")
cols = [
    ("Who is the customer", [
        "Freelancers and small agencies serving crypto-native clients",
        "DAOs outsourcing bounded tasks (design, audits, content)",
        "BTC holders in the Mezo economy who need to pay for work without selling BTC",
    ]),
    ("Why Mezo", [
        "MUSD is a BTC-backed stable unit — the missing piece for work payments",
        "Mezo’s audience already holds BTC and wants to spend without exiting",
        "Escrow makes MUSD a settlement rail, not just a savings asset",
    ]),
    ("How it makes money", [
        "No fee in v1 (adoption); v2: optional arbiter marketplace and MEZO fee discounts",
        "Distribution through Mezo Discord / AKINDO builders and freelance communities",
        "Each gig is a repeatable on-chain flow: more MUSD volume, more wallets",
    ]),
]
x = Inches(0.7)
for title, bullets in cols:
    box(s, x, Inches(2.15), Inches(3.85), Inches(4.0), fill=PANEL, line=RGBColor(0x1D, 0x4A, 0x33))
    text(s, x + Inches(0.22), Inches(2.32), Inches(3.4), Inches(0.4), [(title, 14, ACCENT, True)])
    text(s, x + Inches(0.22), Inches(2.8), Inches(3.4), Inches(3.2),
         [(b, 12, TEXT, False, "bullet") for b in bullets])
    x += Inches(4.05)
text(s, Inches(0.7), Inches(6.3), Inches(11.9), Inches(0.5), [
    ("Positioning: every 1 MUSD that moves through MezoGig is MUSD used for real work — the exact utility Mezo is building toward.", 13, WARN, True),
])
footer(s, 7)

# 8 — roadmap / team --------------------------------------------------------
s = slide()
header(s, "Roadmap & team", "Three milestones, and what we are honest about")
road = [
    ("M1 · 2 weeks", "Hosted frontend polish, wallet UX, gig templates, docs video"),
    ("M2 · 4 weeks", "Mezo mainnet deployment, third-party review, incident runbook"),
    ("M3 · 8 weeks", "Dispute v2: staked arbiters, reputation, MEZO fee discounts"),
]
y = Inches(2.15)
for t, d in road:
    box(s, Inches(0.7), y, Inches(7.3), Inches(0.85), fill=PANEL, line=RGBColor(0x1D, 0x4A, 0x33))
    text(s, Inches(0.9), y + Inches(0.1), Inches(2.0), Inches(0.4), [(t, 14, ACCENT, True)])
    text(s, Inches(2.9), y + Inches(0.2), Inches(4.9), Inches(0.5), [(d, 12, TEXT, False)])
    y += Inches(1.0)
box(s, Inches(8.3), Inches(2.15), Inches(4.3), Inches(2.85), fill=PANEL, line=RGBColor(0x1D, 0x4A, 0x33))
text(s, Inches(8.5), Inches(2.3), Inches(3.9), Inches(2.6), [
    ("Team", 14, ACCENT, True),
    ("Operator (human): product, registration, payments", 12, TEXT, False),
    ("AI agent team: contract, tests, frontend, docs", 12, TEXT, False),
    ("", 6, TEXT, False),
    ("Built during Wave 1; code, tests and deployment are public", 11, MUTED, False),
])
box(s, Inches(8.3), Inches(5.15), Inches(4.3), Inches(1.25), fill=PANEL, line=RGBColor(0x1D, 0x4A, 0x33))
text(s, Inches(8.5), Inches(5.28), Inches(3.9), Inches(1.0), [
    ("Links", 12, ACCENT, True),
    ("github.com/mak777uh/mezogig", 11, TEXT, False),
    ("mak777uh.github.io/mezogig", 11, TEXT, False),
])
footer(s, 8)

# 9 — agent console ---------------------------------------------------------
s = slide()
header(s, "New · 23 Oct 2026", "The same escrow, operable by an agent")
box(s, Inches(0.7), Inches(2.15), Inches(5.9), Inches(4.2), fill=PANEL, line=RGBColor(0x1D, 0x4A, 0x33))
text(s, Inches(0.95), Inches(2.35), Inches(5.4), Inches(3.8), [
    ("Machine-readable CLI", 16, ACCENT, True),
    ("scripts/agent-console.js — no UI, no keys printed", 11, MUTED, False),
    ("", 5, TEXT, False),
    ("CLI: status / jobs list / job get / watch / verify", 11, TEXT, False, "bullet"),
    ("MCP: create_gig / fund_gig / submit / approve / dispute / status", 11, TEXT, False, "bullet"),
    ("lifecycle commands build calldata; --dry-run is the default", 12, TEXT, False, "bullet"),
    ("exit codes 0/1/2/3 = ok / input / network / revert", 12, TEXT, False, "bullet"),
    ("21 new tests (CLI + MCP + pin); npm test = 90 passing", 12, TEXT, False, "bullet"),
    ("commit fbf6fb8; contract unchanged", 12, TEXT, False, "bullet"),
    ("Sourcify exact_match · creation + runtime", 11, TEXT, False, "bullet"),
    ("", 5, TEXT, False),
    ("Read-only calls checked against the deployed contract; no transaction sent.", 10, MUTED, False),
])
box(s, Inches(6.9), Inches(2.15), Inches(5.7), Inches(4.2), fill=RGBColor(0x06, 0x18, 0x0F), line=RGBColor(0x1D, 0x4A, 0x33))
text(s, Inches(7.1), Inches(2.3), Inches(5.3), Inches(3.8), [
    ("$ npm run agent -- verify --json", 10, ACCENT, True),
    ("{", 10, TEXT, False),
    ('  "chainId": 31611,', 10, TEXT, False),
    ('  "escrow": "0x247b313d0eD3C532B16c7E5f9eA760272361600F",', 9, TEXT, False),
    ('  "musd": "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",', 9, TEXT, False),
    ('  "musdMatches": true,', 10, TEXT, False),
    ('  "reviewPeriodSeconds": 148,', 10, TEXT, False),
    ('  "ok": true', 10, TEXT, False),
    ("}", 10, TEXT, False),
    ("$ npm test", 10, ACCENT, True),
    ("90 passing", 11, ACCENT, True),
], space=3)
footer(s, 9)

out_pptx = os.path.join(ROOT, "docs", "deck.pptx")
prs.save(out_pptx)
print("saved", out_pptx, os.path.getsize(out_pptx), "bytes")



