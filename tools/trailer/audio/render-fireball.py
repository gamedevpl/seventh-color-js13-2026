#!/usr/bin/env python3
"""Re-render THE STAMPEDE (Unicorn Fireball's theme) with the same sampled
one-shots the Snap trailer uses, and arrange it against that trailer's beats.

Like render.py this is a port, not a new composition: BPM, the gallop
pattern, the bassline and the lead all come straight out of
fireball/src/snd.js. What is new is the *arrangement* - the game scales the
music by how big your herd is, and the trailer needs those same gears to
land on the cut instead of on the play.

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

# ---------------------------------------------------------------- samples --
def load_mp3(name):
    src = os.path.join(HERE, f'{name}.mp3')
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', src, '-ar', str(SR), '-ac', '1',
         '-f', 's16le', '-'],
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
print(f'bass {bass_f0:.1f} Hz, lead {lead_f0:.1f} Hz')

# ------------------------------------------------- the sequencer, ported --
BPM = 132
STEP = 15 / BPM
NOTE = lambda s: 110 * 2 ** (s / 12)
R = -99
BASS = [0, R, 0, 0, R, 0, 0, R, 0, 0, R, 0, 7, R, 7, 7]
LEAD = [12, R, 15, R, 19, R, 15, R, 12, R, 10, R, 12, R, R, R,
        17, R, 15, R, 12, R, 15, R, 19, R, 22, R, 19, R, R, R]
GALLOP = [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0]

# The cut's own gears, in seconds. Read from the recording rather than
# retyped here: record-fireball.mjs writes build/trailer-fireball/beats.json
# with the beat boundaries it actually used AND the second the two rainbows
# actually detonated - which is physics, not a cue, and moves when the
# approach is retuned. Typing both in two files is how a score ends up
# hitting its boom a second after the screen does. The numbers below are the
# fallback, for rendering the music before the frames exist.
BEATS_JSON = os.path.join(OUT_DIR, '..', 'beats.json')
TITLE_END = 3.6      # bare: hooves in the distance and the bass
GATHER_END = 13.2    # the run, heat climbing with the herd
CHARGE_END = 18.6    # the wind-up, riser over the top
RIDE_END = 24.2      # lit
CLASH_AT = 26.6      # the two rainbows meet
END = 31.4
if os.path.exists(BEATS_JSON):
    with open(BEATS_JSON) as fh:
        cut = json.load(fh)
    at = cut['at']
    TITLE_END, GATHER_END = at['plain'], at['charge']
    CHARGE_END, RIDE_END = at['ride'], at['clash']
    END = cut['duration']
    if cut.get('clashAt'):
        CLASH_AT = cut['clashAt']
    print(f'beats from the cut: charge {CHARGE_END:.2f}s, clash {CLASH_AT:.2f}s, end {END:.2f}s')
DUR = END + 3.0

buf = np.zeros((2, int(SR * DUR)))


def add(t, mono, gain, pan=0.0):
    start = int(t * SR)
    if start >= buf.shape[1] or gain <= 0:
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


def sine(freq, dur, gain, attack=0.0, f2=None):
    n = int(SR * dur)
    t = np.arange(n) / SR
    f = np.linspace(freq, f2, n) if f2 else np.full(n, freq)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(t / dur * np.log(0.001))
    if attack > 0:
        tone = tone * np.minimum(1.0, t / attack)
    return tone * gain


def heat_at(t):
    """The game scales the mix by herd size; the trailer scales it by beat."""
    if t < TITLE_END:
        return 0.0                                    # bare
    if t < GATHER_END:
        return 0.25 + 0.45 * (t - TITLE_END) / (GATHER_END - TITLE_END)
    if t < CHARGE_END:
        return 0.75
    if t < RIDE_END:
        return 1.0
    if t < CLASH_AT + 0.6:
        return 1.0
    return max(0.0, 1.0 - (t - CLASH_AT - 0.6) / 2.4)  # the plain empties out


t = 0.0
step = 0
while t < END:
    s = step % 32
    h = s % 16
    heat = heat_at(t)
    bare = t < TITLE_END
    # The gallop: three hits then a rest, the DUM lower than the other two.
    if GALLOP[h]:
        low = (h % 4 == 2)
        g = (0.16 if bare else 0.30 + heat * 0.20) * (1.25 if low else 1.0)
        add(t, resample(hoof_s, (180 if low else 320) / 400), g, pan=-0.1 if h % 2 else 0.1)
    if not bare and h % 4 == 2:
        add(t, env(kick_s, 0.22, 0.85 + heat * 0.35), 1.0)
    if not bare and h % 8 == 6:
        add(t, env(hat_s, 0.07, 0.20 + heat * 0.12), 1.0, pan=-0.18)
    if BASS[h] != R:
        f = NOTE(BASS[h] - 12)
        add(t, env(resample(bass_s, f / bass_f0), 0.20, 0.5 + heat * 0.5), 1.0)
        if not bare:
            add(t, sine(f / 2, 0.22, 0.5 + heat * 0.4), 1.0)
    if heat > 0.35 and LEAD[s] != R:
        f = NOTE(LEAD[s] + 12)
        add(t, env(resample(lead_s, f / lead_f0), 0.26, 0.30 + heat * 0.45), 1.0, pan=0.18)
    t += STEP
    step += 1

# --- the one-shots the game plays, on the cut's beats ---------------------
# The riser: held under the whole wind-up, pitch tracking the charge from
# outside exactly as rise(k) does, so releasing early would sound early.
rise_dur = CHARGE_END - (CHARGE_END - 4.6)
n = int(SR * rise_dur)
tt = np.arange(n) / SR
k = tt / rise_dur
sweep = 110 * 2 ** (k * 3)
riser = np.sin(2 * np.pi * np.cumsum(sweep) / SR) * (0.10 + k * 0.22) * np.minimum(1, tt / 0.25)
riser *= np.minimum(1, (rise_dur - tt) / 0.08)
add(CHARGE_END - 4.6, riser, 1.0)

# IGNITION: a light coming on. Seven notes fanning up, no sub under them.
for i, semi in enumerate([0, 4, 7, 11, 14, 16, 19]):
    add(CHARGE_END + i * 0.04, sine(NOTE(12 + semi), 0.6, 0.16, attack=0.005), 1.0,
        pan=-0.25 + i * 0.08)
add(CHARGE_END, env(hat_s, 0.35, 0.5), 1.0)

# THE CLASH: a sub boom, a wide burst, then the rainbow fanning up - one
# note per colour, because a rainbow has to be heard as well as seen.
add(CLASH_AT, sine(90, 0.9, 1.0, f2=30), 1.0)
rng = np.random.default_rng(11)
burst = rng.uniform(-1, 1, int(SR * 0.8))
burst *= np.exp(np.arange(len(burst)) / SR / 0.8 * np.log(0.001)) * 0.5
add(CLASH_AT, burst, 1.0)
for i, semi in enumerate([0, 2, 4, 5, 7, 9, 11]):
    add(CLASH_AT + 0.12 + i * 0.06, sine(NOTE(24 + semi), 0.5, 0.18), 1.0,
        pan=-0.3 + i * 0.1)

# A held chord to go out on, so the tail is something to fade rather than
# silence to fade (the lesson from the Snap cut, which ended on a hard stop).
for semi, g in ((0, 0.55), (7, 0.35), (12, 0.22)):
    f = NOTE(semi)
    add(END - 2.4, env(resample(bass_s, f / bass_f0), 3.4, g, attack=0.5), 1.0)
    add(END - 2.4, sine(f / 2, 3.4, g * 0.8, attack=0.6), 1.0)

# --- tail, limiter, out ---------------------------------------------------
end_n = int((END + 1.6) * SR)
fade_n = int(SR * 1.8)
buf[:, end_n - fade_n:end_n] *= np.linspace(1, 0, fade_n) ** 1.3
buf = buf[:, :end_n]

peak = np.max(np.abs(buf))
if peak > 0:
    buf = buf / peak * 0.98
buf = np.tanh(buf * 1.15) / np.tanh(1.15)

os.makedirs(OUT_DIR, exist_ok=True)
out_path = os.path.normpath(os.path.join(OUT_DIR, 'stampede.wav'))
w = wave.open(out_path, 'wb')
w.setnchannels(2)
w.setsampwidth(2)
w.setframerate(SR)
w.writeframes(np.clip(buf.T * 32767, -32768, 32767).astype(np.int16).tobytes())
w.close()
print(f'wrote {out_path}, {end_n / SR:.2f}s')
