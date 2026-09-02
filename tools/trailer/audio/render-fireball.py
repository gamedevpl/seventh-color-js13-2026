#!/usr/bin/env python3
"""THE STAMPEDE, arranged for the Unicorn Fireball trailer.

The cut is Apocalypse Now, so the drop is the air cavalry: the game's own
lead sample plays Ride of the Valkyries over the game's own gallop. That
is the whole joke, and it is made of nothing but the game.

Like render.py this is a port, not a new composition: BPM, the gallop, the
bassline and the lead are fireball/src/snd.js. What is new is that it is an
ARRANGEMENT rather than a mix: the game scales one groove by herd size, and
a trailer needs movements - an intro that withholds the groove, a build, a
breakdown, a drop, a half-time stretch for the slow motion, a hit, and a
coda that answers the intro. Every one of those starts on a cue the cut
wrote (build/trailer-fireball/beats.json), so the score is arranged to the
picture and never the other way round.

The motif is varied rather than repeated. The intro plays the lead at half
speed two octaves up, as a music box, with an echo; the drop stacks it in
octaves and answers its second bar with a phrase of its own; the coda
brings the music box back over a held chord.

    python3 tools/trailer/audio/render-fireball.py

Writes build/trailer-fireball/audio/stampede.wav.
"""
import json
import os
import subprocess
import wave

import numpy as np

SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, '..', '..', '..', 'build', 'trailer-fireball', 'audio')
BEATS_JSON = os.path.normpath(os.path.join(OUT_DIR, '..', 'beats.json'))


# ---------------------------------------------------------------- samples --
def load_mp3(name):
    src = os.path.join(HERE, f'{name}.mp3')
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', src, '-ar', str(SR), '-ac', '1', '-f', 's16le', '-'],
        check=True, stdout=subprocess.PIPE).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32768.0


def trim_lead(a, thresh=0.02):
    return a[np.argmax(np.abs(a) > thresh):]


def fade_tail(a, n):
    n = min(n, len(a))
    if n <= 0:
        return a
    a = a.copy()
    a[-n:] *= np.linspace(1, 0, n) ** 1.5
    return a


def detect_pitch(a, fmin=60, fmax=800):
    a = a[: int(SR * 0.5)]
    a = a - a.mean()
    corr = np.correlate(a, a, mode='full')[len(a) - 1:]
    lo, hi = int(SR / fmax), int(SR / fmin)
    return SR / (np.argmax(corr[lo:hi]) + lo)


def resample(a, ratio):
    n_out = max(1, int(len(a) / ratio))
    return np.interp(np.arange(n_out) * ratio, np.arange(len(a)), a, left=0, right=0)


kick_s = fade_tail(trim_lead(load_mp3('kick')), 4000)[: int(SR * 0.30)]
hoof_s = fade_tail(trim_lead(load_mp3('clap')), 2200)[: int(SR * 0.10)]
hat_s = fade_tail(trim_lead(load_mp3('hat')), 800)[: int(SR * 0.07)]
bass_s = trim_lead(load_mp3('bass'))
lead_s = trim_lead(load_mp3('lead'))
bass_f0 = detect_pitch(bass_s, 70, 300)
lead_f0 = detect_pitch(lead_s, 200, 900)

# ------------------------------------------------- the sequencer, ported --
BPM = 132
STEP = 15 / BPM
BAR = STEP * 16
NOTE = lambda s: 110 * 2 ** (s / 12)
R = -99
BASS = [0, R, 0, 0, R, 0, 0, R, 0, 0, R, 0, 7, R, 7, 7]
LEAD = [12, R, 15, R, 19, R, 15, R, 12, R, 10, R, 12, R, R, R,
        17, R, 15, R, 12, R, 15, R, 19, R, 22, R, 19, R, R, R]
GALLOP = [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0]
# The answer: the same A-minor pentatonic the lead lives in, climbing to
# the octave and falling back, so a four-bar phrase is lead / lead / answer
# / lead instead of the same two bars round and round.
# (kept for the build, which still plays the game's own tune)
ANSWER = [24, R, 22, R, 19, R, 22, R, 24, R, 27, R, 24, R, R, R]

# RIDE OF THE VALKYRIES, on the game's own lead sample. Wagner died in 1883
# and the piece is public domain; what makes it work here is the
# instrument, not the tune - it arrives on the same sampled lead the game
# has been playing all along, over the game's own gallop, which is already
# a rhythm of hooves.
#
# The recognisable gesture is short-short-LONG climbing a minor arpeggio:
# a dotted eighth, a sixteenth, a quarter (3 + 1 + 4 sixteenths = half a
# bar), transposed up the triad each time. Written from A, the trailer's
# tonic, as (step within a 32-step cycle, semitone, length in sixteenths).
VALKYRIES = [
    (0, -5, 3), (3, 0, 1), (4, 3, 4),
    (8, 0, 3), (11, 3, 1), (12, 7, 4),
    (16, 3, 3), (19, 7, 1), (20, 12, 4),
    (24, 7, 3), (27, 12, 1), (28, 15, 4),
]
VALK_AT = {step: (semi, length) for step, semi, length in VALKYRIES}

# ---------------------------------------------------------------- the cut --
with open(BEATS_JSON) as fh:
    cut = json.load(fh)
C = cut['cues']
END = cut['duration']
ENDCARD = 5.0                     # the end card rides on the tail
DUR = END + ENDCARD + 1.0

# Which movement each shot belongs to. Anything not named falls into the
# movement of the cue before it.
MOVEMENT = {
    'lone': 'intro', 'reveal': 'intro',
    'cardHerd': 'build1', 'gatherA': 'build1', 'gatherB': 'build2', 'gatherC': 'build3',
    'cardButton': 'break', 'hold': 'break',
    'ignite': 'drop', 'rideA': 'drop', 'rideB': 'drop', 'rideC': 'drop',
    'cardOther': 'thin', 'approach': 'half', 'slowmo': 'still', 'clash': 'hit',
    'boom': 'hit', 'after': 'coda',
}
for i in range(1, 8):
    MOVEMENT[f'colour{i}'] = 'montage'
timeline = sorted((t, n) for n, t in C.items() if n in MOVEMENT)
# The drums come back on the first downbeat after the boom, not on the boom:
# the boom is a hit, the bar after it is the groove landing.
T_DROP2 = BAR * (int(C['clash'] / BAR) + 1) if 'clash' in C else None


def movement(t):
    m = 'intro'
    for at, name in timeline:
        if t >= at - 1e-6:
            m = MOVEMENT[name]
    if m == 'hit' and T_DROP2 is not None and t >= T_DROP2:
        return 'drop2'
    return m


print('movements:', ' '.join(f'{n}@{t:.2f}' for t, n in timeline), f'end@{END:.2f}')

buf = np.zeros((2, int(SR * DUR)))


def add(t, mono, gain, pan=0.0):
    start = int(t * SR)
    if start >= buf.shape[1] or gain <= 0 or start < 0:
        return
    n = min(len(mono), buf.shape[1] - start)
    buf[0, start:start + n] += gain * (1 - max(0, pan)) * mono[:n]
    buf[1, start:start + n] += gain * (1 + min(0, pan)) * mono[:n]


def env(sample, dur, gain, attack=0.0):
    n = min(int(SR * dur), len(sample))
    t = np.arange(n) / SR
    out = sample[:n] * np.exp(t / dur * np.log(0.001))
    if attack > 0:
        out = out * np.minimum(1.0, t / attack)
    return out * gain


def sine(freq, dur, gain, attack=0.0, f2=None, partial2=0.0):
    n = int(SR * dur)
    t = np.arange(n) / SR
    f = np.linspace(freq, f2, n) if f2 else np.full(n, freq)
    ph = 2 * np.pi * np.cumsum(f) / SR
    tone = (np.sin(ph) + partial2 * np.sin(2 * ph)) * np.exp(t / dur * np.log(0.001))
    if attack > 0:
        tone = tone * np.minimum(1.0, t / attack)
    return tone * gain


def held(freq, dur, gain, attack=0.5, release=0.6, partial2=0.0):
    """A note that stays: sustained, swelled in, let go of."""
    n = int(SR * dur)
    t = np.arange(n) / SR
    ph = 2 * np.pi * freq * t
    tone = np.sin(ph) + partial2 * np.sin(2 * ph)
    e = np.minimum(1.0, t / attack) * np.minimum(1.0, (dur - t) / release)
    return tone * e * gain


def noise(dur, seed=1):
    rng = np.random.default_rng(seed)
    return rng.uniform(-1, 1, int(SR * dur))


# A note of the music box: two octaves up, a touch of second partial for
# the tine, and two echoes a dotted eighth apart.
def music_box(t, semi, gain, pan=0.0):
    f = NOTE(semi + 24)
    tone = sine(f, 0.9, gain, attack=0.004, partial2=0.35)
    add(t, tone, 1.0, pan)
    add(t + STEP * 3, tone, 0.42, -pan)
    add(t + STEP * 6, tone, 0.18, pan)


# ---------------------------------------------------------------- the grid --
t = 0.0
step = 0
while t < END + 0.5:
    s = step % 32
    h = s % 16
    m = movement(t)
    bar = step // 16
    downbeat = h == 0
    dum = h % 4 == 2

    if m in ('intro', 'montage', 'coda'):
        # The music box: the lead at half speed, so the tune is recognisable
        # and slow enough to be a lullaby. A heartbeat under it.
        if step % 2 == 0 and LEAD[(step // 2) % 32] != R:
            music_box(t, LEAD[(step // 2) % 32], 0.3 if m != 'coda' else 0.3, pan=0.2 if (step // 2) % 4 < 2 else -0.2)
        if downbeat:
            add(t, sine(52, 0.45, 0.45, attack=0.006, f2=40), 1.0)
        if m == 'montage' and h % 8 == 0:
            # One hoof on every cut, so the seven land on the beat.
            add(t, resample(hoof_s, 180 / 400), 0.42, pan=0.25 if bar % 2 else -0.25)

    elif m.startswith('build'):
        lvl = {'build1': 0.0, 'build2': 0.5, 'build3': 1.0}[m]
        if GALLOP[h]:
            g = (0.45 + lvl * 0.25) * (1.25 if dum else 1.0)
            add(t, resample(hoof_s, (180 if dum else 320) / 400), g, pan=-0.1 if h % 2 else 0.1)
        if dum:
            add(t, env(kick_s, 0.22, 1.0 + lvl * 0.5), 1.0)
        if lvl >= 0.5 and h % 8 == 6:
            add(t, env(hat_s, 0.07, 0.3), 1.0, pan=-0.18)
        if BASS[h] != R:
            f = NOTE(BASS[h] - 12)
            add(t, env(resample(bass_s, f / bass_f0), 0.2, 0.9 + lvl * 0.4), 1.0)
            if lvl >= 0.5:
                add(t, sine(f / 2, 0.22, 0.4 + lvl * 0.6), 1.0)
        if lvl >= 0.5 and LEAD[s] != R:
            f = NOTE(LEAD[s] + 12)
            add(t, env(resample(lead_s, f / lead_f0), 0.26, 0.5 + lvl * 0.4), 1.0, pan=0.18)

    elif m == 'break':
        # No drums. A drone on the root, and the first three notes of the
        # tune echoing on every bar - the thing held back is the groove.
        if downbeat:
            add(t, env(resample(bass_s, NOTE(-12) / bass_f0), BAR * 1.1, 0.28, attack=0.05), 1.0)
            add(t, held(NOTE(-24), BAR * 1.05, 0.22, attack=0.3, release=0.4), 1.0)
        if h in (0, 2, 4):
            music_box(t, LEAD[h], 0.16 * (1 - h * 0.12), pan=0.15 - h * 0.1)

    elif m in ('drop', 'drop2'):
        if GALLOP[h]:
            add(t, resample(hoof_s, (180 if dum else 320) / 400), 0.85 * (1.25 if dum else 1.0), pan=-0.12 if h % 2 else 0.12)
        if dum or downbeat:
            add(t, env(kick_s, 0.24, 1.7), 1.0)
        if h % 8 == 6:
            add(t, env(hat_s, 0.07, 0.45), 1.0, pan=-0.18)
        if h % 4 == 1:
            add(t, env(hat_s, 0.05, 0.2), 1.0, pan=0.22)
        if BASS[h] != R:
            f = NOTE(BASS[h] - 12)
            add(t, env(resample(bass_s, f / bass_f0), 0.2, 1.4), 1.0)
            add(t, sine(f / 2, 0.24, 1.3), 1.0)
        # The Valkyries, doubled an octave down for the weight a horn has.
        if s in VALK_AT:
            semi, length = VALK_AT[s]
            f, dur = NOTE(semi + 12), length * STEP * 1.15
            add(t, env(resample(lead_s, f / lead_f0), dur, 1.15), 1.0, pan=0.16)
            add(t, env(resample(lead_s, (f / 2) / lead_f0), dur, 0.6), 1.0, pan=-0.2)
            add(t, sine(f / 2, dur, 0.34, attack=0.008, partial2=0.4), 1.0)

    elif m == 'thin':
        # Hooves and the root only: the floor drops out ahead of the meeting.
        if GALLOP[h]:
            add(t, resample(hoof_s, (180 if dum else 320) / 400), 0.45 * (1.25 if dum else 1.0), pan=-0.1 if h % 2 else 0.1)
        if BASS[h] != R:
            add(t, env(resample(bass_s, NOTE(BASS[h] - 12) / bass_f0), 0.2, 0.8), 1.0)

    elif m == 'half':
        # Half time under the approach: a kick on the one, a slow sub, the
        # music box picking the tune out over it.
        if downbeat:
            add(t, env(kick_s, 0.3, 1.0), 1.0)
            add(t, held(NOTE(-24), BAR * 1.02, 0.5, attack=0.05, release=0.3), 1.0)
        if h == 8:
            add(t, resample(hoof_s, 180 / 400), 0.45, 1.0)
        if step % 2 == 0 and LEAD[(step // 2) % 32] != R:
            music_box(t, LEAD[(step // 2) % 32], 0.2)

    elif m in ('still', 'hit'):
        # Slow motion: nothing but the drone. The swell into the boom is a
        # one-shot below.
        if downbeat:
            add(t, held(NOTE(-24), BAR * 1.02, 0.18, attack=0.2, release=0.3, partial2=0.15), 1.0)

    t += STEP
    step += 1

# ---------------------------------------------------------- the one-shots --
# Ignition. The drop lands here: a sub that falls from sixty to thirty, a
# crash of noise, the seven-note fan the game plays, and a chord that holds
# for a bar so the bass has something to arrive under.
ig = C['ignite']
add(ig, sine(60, 0.9, 1.1, f2=28), 1.0)
add(ig, noise(0.9, 3) * np.exp(np.arange(int(SR * 0.9)) / SR / 0.9 * np.log(0.002)) * 0.55, 1.0)
for i, semi in enumerate([0, 4, 7, 11, 14, 16, 19]):
    add(ig + i * 0.035, sine(NOTE(12 + semi), 0.8, 0.2, attack=0.004), 1.0, pan=-0.3 + i * 0.1)
for semi, g in ((0, 0.4), (7, 0.28), (12, 0.2), (19, 0.14)):
    add(ig, held(NOTE(semi), BAR * 2, g, attack=0.02, release=0.8), 1.0)

# The riser under the hold: pitch climbing three octaves, the game's rise(k).
t0, t1 = C['cardButton'], ig
n = int(SR * (t1 - t0))
tt = np.arange(n) / SR
k = tt / (t1 - t0)
sweep = 110 * 2 ** (k * 3)
riser = np.sin(2 * np.pi * np.cumsum(sweep) / SR) * (0.06 + k ** 2 * 0.32) * np.minimum(1, tt / 0.5)
riser *= np.minimum(1, (t1 - t0 - tt) / 0.05)
add(t0, riser, 1.0)
# And a noise swell over its last two seconds - the breath before the drop.
sw = noise(2.0, 5) * (np.arange(int(SR * 2.0)) / SR / 2.0) ** 2.5 * 0.5
add(t1 - 2.0, sw, 1.0)

# The second riser: shorter and higher, from the card into the approach,
# then a swell into the boom while the picture is at a fifth of speed.
if 'slowmo' in C:
    t0, t1 = C['cardOther'], C['slowmo']
    n = int(SR * (t1 - t0))
    tt = np.arange(n) / SR
    k = tt / (t1 - t0)
    sweep = 220 * 2 ** (k * 2)
    riser = np.sin(2 * np.pi * np.cumsum(sweep) / SR) * (0.05 + k ** 2 * 0.2) * np.minimum(1, tt / 0.4)
    riser *= np.minimum(1, (t1 - t0 - tt) / 0.05)
    add(t0, riser, 1.0)
    t0, t1 = C['slowmo'], C['clash']
    d = max(0.3, t1 - t0)
    sw = noise(d, 7) * (np.arange(int(SR * d)) / SR / d) ** 3 * 0.6
    add(t0, sw, 1.0)

# THE CLASH: a sub boom, a wide burst, the seven-note rainbow fanning up.
cl = C['clash']
add(cl, sine(90, 1.2, 1.2, f2=28), 1.0)
add(cl, noise(1.0, 11) * np.exp(np.arange(int(SR * 1.0)) / SR / 1.0 * np.log(0.001)) * 0.6, 1.0)
for i, semi in enumerate([0, 2, 4, 5, 7, 9, 11]):
    add(cl + 0.12 + i * 0.06, sine(NOTE(24 + semi), 0.6, 0.2), 1.0, pan=-0.3 + i * 0.1)

# The coda's chord: swelled in under the music box, held through the end
# card, faded out - the tail is a chord, not silence.
co = C['after']
for semi, g in ((0, 0.26), (7, 0.17), (12, 0.12), (16, 0.07)):
    add(co + 0.3, held(NOTE(semi - 12), DUR - co - 0.3, g, attack=1.2, release=1.0), 1.0)
    add(co + 0.3, held(NOTE(semi), DUR - co - 0.3, g * 0.5, attack=1.4, release=1.0, partial2=0.2), 1.0)

# --- tail, limiter, out ---------------------------------------------------
end_n = int(DUR * SR)
fade_n = int(SR * 2.6)
buf[:, end_n - fade_n:end_n] *= np.linspace(1, 0, fade_n) ** 1.3
buf = buf[:, :end_n]

peak = np.max(np.abs(buf))
if peak > 0:
    buf = buf / peak * 0.98
buf = np.tanh(buf * 1.2) / np.tanh(1.2)

os.makedirs(OUT_DIR, exist_ok=True)
out_path = os.path.normpath(os.path.join(OUT_DIR, 'stampede.wav'))
w = wave.open(out_path, 'wb')
w.setnchannels(2)
w.setsampwidth(2)
w.setframerate(SR)
w.writeframes((np.clip(buf.T, -1, 1) * 32767).astype(np.int16).tobytes())
w.close()
print(f'wrote {out_path}, {DUR:.2f}s')
