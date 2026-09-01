#!/usr/bin/env python3
"""Re-render THE STRUT (Unicorn Snap's game theme) with ElevenLabs-generated
instrument samples in place of the raw Web Audio oscillators, keeping the
exact same bassline, hook melody, tempo and bare->full (studio->session)
arrangement as snap/src/snd.js. This is a faithful re-orchestration, not a
new composition: the sequencer below is a port of snd.js, note for note.

The five .mp3s next to this file are the one-shot instrument samples, as
downloaded from ElevenLabs. They are the source of truth - everything else
here is derived from them at run time.

    pip install numpy && python3 tools/trailer/audio/render.py

Writes build/trailer/audio/strut.wav, which assemble.mjs muxes in.
"""
import os
import subprocess
import wave

import numpy as np

SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, '..', '..', '..', 'build', 'trailer', 'audio')

# ---------------------------------------------------------------- samples --
def load_mp3(name):
    """Decode one of the committed .mp3 one-shots to mono float samples.

    ffmpeg rather than a Python decoder on purpose: it is already a hard
    dependency of assemble.mjs, and this keeps the repo free of the multi-
    megabyte intermediate .wavs these decode to.
    """
    src = os.path.join(HERE, f'{name}.mp3')
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', src, '-ar', str(SR), '-ac', '1',
         '-f', 's16le', '-'],
        check=True, stdout=subprocess.PIPE).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32768.0

def trim_lead_silence(a, thresh=0.02):
    idx = np.argmax(np.abs(a) > thresh)
    return a[idx:]

def fade_tail(a, n):
    n = min(n, len(a))
    if n <= 0:
        return a
    a = a.copy()
    a[-n:] *= np.linspace(1, 0, n) ** 1.5
    return a

def detect_pitch(a, sr=SR, fmin=60, fmax=800):
    # Autocorrelation pitch detection on a clean sustained tone.
    a = a[: int(sr * 0.5)]  # first 0.5s, before any AI-generated drift/decay
    a = a - a.mean()
    corr = np.correlate(a, a, mode='full')[len(a) - 1:]
    lo, hi = int(sr / fmax), int(sr / fmin)
    seg = corr[lo:hi]
    peak = np.argmax(seg) + lo
    return sr / peak

def resample(a, ratio):
    # ratio = target_freq / source_freq. ratio>1 -> higher pitch -> shorter.
    n_out = max(1, int(len(a) / ratio))
    x_old = np.arange(len(a))
    x_new = np.arange(n_out) * ratio
    return np.interp(x_new, x_old, a, left=0, right=0)

kick_s = fade_tail(trim_lead_silence(load_mp3('kick')), 4000)[: int(SR * 0.28)]
clap_s = fade_tail(trim_lead_silence(load_mp3('clap')), 3000)[: int(SR * 0.22)]
hat_s = fade_tail(trim_lead_silence(load_mp3('hat')), 800)[: int(SR * 0.09)]
bass_s = trim_lead_silence(load_mp3('bass'))
lead_s = trim_lead_silence(load_mp3('lead'))

bass_f0 = detect_pitch(bass_s, fmin=70, fmax=300)
lead_f0 = detect_pitch(lead_s, fmin=200, fmax=900)
print(f'detected bass pitch: {bass_f0:.1f} Hz, lead pitch: {lead_f0:.1f} Hz')

# ---------------------------------------------------------- the arrangement --
# Ported verbatim from snap/src/snd.js so the melody/bass/structure are
# unchanged - only the instrument voices and the mix are new.
BPM = 116
STEP = 15 / BPM
NOTE = lambda s: 110 * 2 ** (s / 12)
REST = -99
BASS = [0, 0, 12, 0, 7, 0, 10, 7, 0, 0, 12, 0, 3, 5, 7, 10]
HOOK = [
    12, REST, REST, 15, REST, 17, REST, REST, 19, REST, 17, REST, 15, REST, REST, REST,
    10, REST, REST, 12, REST, 15, REST, REST, 17, REST, 15, REST, 12, REST, REST, REST,
]

BARE_STEPS = 87   # "the tease" - bassline alone, 11.25s, matching the frame-stepped capture exactly
FULL_STEPS = 196  # "the session" - the full drop, 25.34s, matching the frame-stepped capture exactly
TOTAL_STEPS = BARE_STEPS + FULL_STEPS
OUTRO_DUR = 4.0   # the held final chord after the step sequencer stops - see below
DUR = TOTAL_STEPS * STEP + OUTRO_DUR + 2.0  # +tail for the last envelope/reverb to ring out
buf = np.zeros((2, int(SR * DUR) + SR))

def add(t, mono, gain, pan=0.0):
    start = int(t * SR)
    n = len(mono)
    if start >= buf.shape[1]:
        return
    n = min(n, buf.shape[1] - start)
    l = gain * (1 - max(0, pan)) * mono[:n]
    r = gain * (1 + min(0, pan)) * mono[:n]
    buf[0, start:start + n] += l
    buf[1, start:start + n] += r

def note_env(sample, dur, gain):
    # Mirrors env(): linear-ish attack already in the sample, exponential
    # decay to ~.001 over `dur` seconds.
    n = int(SR * dur)
    n = min(n, len(sample))
    t = np.arange(n) / SR
    decay = np.exp(t / dur * np.log(0.001))
    out = sample[:n] * decay
    return out * gain

def sub_sine(freq, dur, gain):
    n = int(SR * dur)
    t = np.arange(n) / SR
    decay = np.exp(t / dur * np.log(0.001))
    return np.sin(2 * np.pi * freq * t) * decay * gain

def swell_env(sample, dur, gain, attack=0.4):
    # Same exponential decay as note_env, but with a slow linear fade-in on
    # top - the raw samples are one-shot instrument hits with their own
    # percussive attack transient, which is exactly right under the beat but
    # reads as a thump/bang when triggered cold as a held chord. The fade-in
    # swallows that transient so the chord swells in instead of hitting.
    n = int(SR * dur)
    n = min(n, len(sample))
    t = np.arange(n) / SR
    decay = np.exp(t / dur * np.log(0.001))
    rise = np.minimum(1.0, t / attack)
    return sample[:n] * decay * rise * gain

def swell_sine(freq, dur, gain, attack=0.4):
    n = int(SR * dur)
    t = np.arange(n) / SR
    decay = np.exp(t / dur * np.log(0.001))
    rise = np.minimum(1.0, t / attack)
    return np.sin(2 * np.pi * freq * t) * decay * rise * gain

def riser(dur, gain):
    # A rising TONAL sweep (two detuned saw-ish sines) in the last bars of
    # the tease, so the drop reads as an arrival. A first version of this
    # used broadband noise for the sweep and it read as a hiss swallowing
    # the tease rather than a pitched build - almost no noise here now,
    # just enough grit to not sound pure and synthetic.
    n = int(SR * dur)
    t = np.arange(n) / SR
    sweep_hz = 90 + (520 - 90) * (t / dur) ** 1.5
    phase = 2 * np.pi * np.cumsum(sweep_hz) / SR
    tone = np.sin(phase) + 0.5 * np.sin(phase * 1.005) + 0.3 * np.sin(phase * 2.0)
    grit = np.random.default_rng(7).uniform(-1, 1, n) * 0.06
    env = (t / dur) ** 2.2
    return (tone / 1.8 + grit) * env * gain

def impact(gain):
    dur = 0.5
    n = int(SR * dur)
    t = np.arange(n) / SR
    sweep = np.sin(2 * np.pi * np.cumsum(np.linspace(180, 40, n)) / SR)
    decay = np.exp(-t / (dur * 0.35))
    return sweep * decay * gain

# A beat of near-silence right before the drop reads as far more of an
# arrival than any rising sweep - the ear has nothing, then everything.
SILENCE_STEPS = 8  # ~1.03s of hush at the end of the tease

t = 0.0
for step in range(TOTAL_STEPS):
    bare = step < BARE_STEPS
    hush = bare and BARE_STEPS - step <= SILENCE_STEPS
    intensity = 0.2 if bare else 0.85
    s = step % 32
    h = s % 16

    if s % 4 == 0 and not bare:
        add(t, kick_s, 1.25)
    if not bare and s % 8 == 4:
        add(t, clap_s, 0.95, pan=0.05)
    if not bare and s % 2 == 1:
        add(t, hat_s, 0.18 + intensity * 0.12, pan=-0.12)
    if s % 2 == 0 and not hush:
        freq = NOTE(BASS[h >> 1])
        b = resample(bass_s, freq / bass_f0)
        # The tease plays a thin, quiet bass on its own - almost demure - so
        # the drop's fuller, sub-reinforced bass reads as a real arrival
        # rather than the same low end with drums added on top.
        add(t, note_env(b, 0.16 if bare else 0.22, 0.45 if bare else 0.95), 1.0)
        if not bare:
            add(t, sub_sine(freq / 2, 0.24, 1.0), 1.0)
    if not bare and intensity > 0.5:
        n = HOOK[s]
        if n != REST:
            freq = NOTE(n + 12)
            ld = resample(lead_s, freq / lead_f0)
            add(t, note_env(ld, 0.30, 0.7), 1.0, pan=0.18)
    if step == BARE_STEPS:
        add(t, impact(1.1), 1.0)
    t += STEP

# Every note in the loop above decays in ~0.2-0.3s by design - they have to,
# to stay percussive under the beat - so simply stopping the sequencer and
# tail-fading whatever's left is fading silence: the last note has already
# died on its own well inside the fade window, and it reads as a hard stop
# rather than a landing. A held final chord (root + fifth in the bass, a sub
# underneath, a soft high shimmer in the lead) gives the fade something to
# actually work on, so the music comes down WITH the finale instead of
# quitting partway through it. It swells in (swell_env/swell_sine) rather
# than hitting at full gain - triggering these one-shot samples cold as a
# held note reproduced their own percussive attack transient as a loud bang
# right where the sequencer stopped, which read as a stray hit, not a chord.
outro_root, outro_fifth = NOTE(0), NOTE(7)
add(t, swell_env(resample(bass_s, outro_root / bass_f0), OUTRO_DUR, 0.8, attack=0.45), 1.0)
add(t, swell_env(resample(bass_s, outro_fifth / bass_f0), OUTRO_DUR, 0.5, attack=0.55), 1.0, pan=-0.12)
add(t, swell_sine(outro_root / 2, OUTRO_DUR, 0.9, attack=0.6), 1.0)
add(t, swell_env(resample(lead_s, NOTE(12) / lead_f0), OUTRO_DUR * 0.85, 0.35, attack=0.7), 1.0, pan=0.2)
t += OUTRO_DUR

# A longer tail fade over the chord above so the render ends cleanly rather
# than being chopped.
tail_n = int(SR * 1.8)
end = min(buf.shape[1], int(t * SR) + tail_n)
fade_start = max(0, end - tail_n)
buf[:, fade_start:end] *= np.linspace(1, 0, end - fade_start) ** 1.3
buf[:, end:] = 0

# Soft limiter + normalise: several samples land on the same beat, so this
# is a hotter mix than any single oscillator and needs taming.
peak = np.max(np.abs(buf))
if peak > 0:
    buf = buf / peak * 0.98
buf = np.tanh(buf * 1.12) / np.tanh(1.12)

trimmed_len = end  # the fade above runs to exactly here - cutting any earlier chops it mid-fade, which is what an abrupt ending actually was
buf = buf[:, :trimmed_len]

out16 = np.clip(buf.T * 32767, -32768, 32767).astype(np.int16)
os.makedirs(OUT_DIR, exist_ok=True)
out_path = os.path.normpath(os.path.join(OUT_DIR, 'strut.wav'))
w = wave.open(out_path, 'wb')
w.setnchannels(2)
w.setsampwidth(2)
w.setframerate(SR)
w.writeframes(out16.tobytes())
w.close()
print(f'wrote {out_path}, {trimmed_len / SR:.2f}s')
