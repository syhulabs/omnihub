#!/usr/bin/env python3
"""Generates Sleep Mode's six ambient sounds (src/assets/sleep-mode/sound-audio/*.mp3) from scratch.

Why this exists: the previous recordings had no recorded source or licence, so on 18 Nov 2026 the
owner chose to replace them with sounds Omni Hub makes itself. Everything here is synthesised from
random numbers (noise shaped in the frequency domain, damped sine "drops", FM chirps), so the
output contains no third-party audio at all.

Every sound is built circularly over exactly 60 s: noise is shaped with an inverse FFT (periodic by
construction), events that run past the end wrap round to the start, and slow envelopes use whole
cycles per minute. The app loops each file with an AudioBufferSourceNode, so the loop is seamless.

Run from the repository root:  python3 scripts/gen-sleep-sounds.py   (needs numpy and ffmpeg)
The random seeds are fixed, so the output is the same every run.
"""
import os
import subprocess
import tempfile
import wave

import numpy as np

SR = 44100
DUR = 60
N = SR * DUR
OUT_DIR = 'src/assets/sleep-mode/sound-audio'
FREQS = np.fft.rfftfreq(N, 1 / SR)


def shaped_noise(rng, gain_fn):
    """White noise reshaped by a magnitude response gain_fn(freqs); periodic over N samples."""
    spec = rng.standard_normal(FREQS.size) + 1j * rng.standard_normal(FREQS.size)
    spec *= gain_fn(np.maximum(FREQS, 1.0))
    spec[0] = 0
    x = np.fft.irfft(spec, N)
    return x / (np.sqrt(np.mean(x ** 2)) + 1e-12)


def band(lo, hi, slope=0.0, order=2):
    """Smooth band-pass magnitude response with a 1/f**slope tilt."""
    def g(f):
        hp = 1 / np.sqrt(1 + (lo / f) ** (2 * order)) if lo else 1
        lp = 1 / np.sqrt(1 + (f / hi) ** (2 * order)) if hi else 1
        return hp * lp / f ** (slope / 2)
    return g


def circ_conv(x, ir):
    """Circular convolution, so a reverb tail wraps round instead of breaking the loop."""
    k = np.zeros(N)
    k[: ir.size] = ir
    return np.fft.irfft(np.fft.rfft(x) * np.fft.rfft(k), N)


def add_event(buf, start, ev):
    """Adds ev at start, wrapping past the end back to the beginning."""
    idx = (start + np.arange(ev.size)) % N
    np.add.at(buf, idx, ev)


def periodic_smooth_noise(rng, cycles_per_loop, lo_cycles=1):
    """A slow random curve in [-1, 1] made of whole cycles per loop (so it loops)."""
    spec = np.zeros(N // 2 + 1, complex)
    c = np.arange(lo_cycles, cycles_per_loop + 1)
    spec[c] = (rng.standard_normal(c.size) + 1j * rng.standard_normal(c.size)) / c
    y = np.fft.irfft(spec, N)
    return y / (np.max(np.abs(y)) + 1e-12)


def circ_smooth(x, width):
    """Circular moving average over `width` samples."""
    k = np.zeros(N)
    k[:width] = 1 / width
    return np.fft.irfft(np.fft.rfft(x) * np.fft.rfft(k), N)


def stereo(left, right, width=0.6):
    mid = (left + right) / 2
    side = (left - right) / 2 * width
    return np.stack([mid + side, mid - side])


# ---------------------------------------------------------------------------------------------
def rain(rng):
    chans = []
    for _ in range(2):
        bed = shaped_noise(rng, band(350, 9000, slope=0.6)) * 0.55
        drops = np.zeros(N)
        for _ in range(9000):  # ~150 small drops a second
            f = rng.uniform(1800, 6500)
            tau = rng.uniform(0.002, 0.008)
            n = int(tau * 6 * SR)
            t = np.arange(n) / SR
            ev = np.exp(-t / tau) * np.sin(2 * np.pi * f * t) * rng.pareto(3.0) * 0.08
            add_event(drops, rng.integers(N), ev)
        for _ in range(700):  # heavier drops on leaves and gutters
            f = rng.uniform(600, 2200)
            tau = rng.uniform(0.008, 0.025)
            n = int(tau * 6 * SR)
            t = np.arange(n) / SR
            ev = np.exp(-t / tau) * np.sin(2 * np.pi * f * t * (1 - 0.15 * t / t[-1])) * rng.uniform(0.05, 0.18)
            add_event(drops, rng.integers(N), ev)
        swell = 1 + 0.12 * periodic_smooth_noise(rng, 6)
        chans.append((bed + drops) * swell)
    return stereo(*chans, width=0.8)


def ocean(rng):
    t = np.arange(N) / SR
    # Six waves a minute (one every ~10 s), each placed with a little jitter.
    env = np.zeros(N)
    starts = (np.arange(6) * 10 + rng.uniform(-1.5, 1.5, 6)) * SR
    for s in starts:
        rise, fall = rng.uniform(1.8, 2.6), rng.uniform(5.5, 7.5)
        n = int((rise + fall) * SR)
        tt = np.arange(n) / SR
        shape = np.where(tt < rise, (tt / rise) ** 2, np.exp(-(tt - rise) / (fall / 3)))
        add_event(env, int(s), shape * rng.uniform(0.75, 1.0))
    env = 0.25 + env
    chans = []
    for _ in range(2):
        body = shaped_noise(rng, band(40, 900, slope=1.2)) * env
        foam = shaped_noise(rng, band(800, 7000, slope=0.4)) * env ** 2.2 * 0.35
        chans.append(body + foam)
    return stereo(*chans, width=0.7)


def forest(rng):
    wind_env = 0.6 + 0.4 * periodic_smooth_noise(rng, 5)
    chans = [shaped_noise(rng, band(120, 2500, slope=1.0)) * wind_env * 0.5 for _ in range(2)]
    leaves = [shaped_noise(rng, band(2500, 9000, slope=0.3)) * (0.5 + 0.5 * periodic_smooth_noise(rng, 20, 4)) ** 2 * 0.15 for _ in range(2)]
    chans = [c + l for c, l in zip(chans, leaves)]

    def chirp(f0, f1, dur, vib=0.0):
        n = int(dur * SR)
        tt = np.arange(n) / SR
        f = f0 + (f1 - f0) * tt / dur + vib * np.sin(2 * np.pi * 28 * tt)
        ph = 2 * np.pi * np.cumsum(f) / SR
        win = np.sin(np.pi * tt / dur) ** 2
        return np.sin(ph) * win

    birds = [
        # (calls per minute, builder)
        (16, lambda: np.concatenate([chirp(4200, 3600, 0.09), np.zeros(int(0.05 * SR)), chirp(4300, 3700, 0.09)])),
        (11, lambda: np.concatenate([chirp(2800 + 300 * k, 3400 + 300 * k, 0.07) for k in range(4)])),
        (9, lambda: chirp(5200, 2600, 0.35, vib=180)),
        (7, lambda: np.concatenate([chirp(3100, 3150, 0.25, vib=60), chirp(2500, 2450, 0.3, vib=40)])),
    ]
    for calls, build in birds:
        pan = rng.uniform(0.2, 0.8)
        gain = rng.uniform(0.35, 0.55)
        for _ in range(calls):
            ev = build() * gain
            s = rng.integers(N)
            add_event(chans[0], s, ev * (1 - pan) * 2)
            add_event(chans[1], s, ev * pan * 2)
    return np.stack(chans)


def night_ambience(rng):
    chans = [shaped_noise(rng, band(60, 1200, slope=1.4)) * 0.35 for _ in range(2)]
    crickets = [  # (carrier Hz, pulses per chirp, chirps per second, pan)
        (4400, 3, 1.6, 0.3),
        (4750, 4, 1.1, 0.7),
        (5100, 2, 2.3, 0.5),
        (3900, 3, 0.8, 0.15),
    ]
    for f, pulses, rate, pan in crickets:
        gain = rng.uniform(0.05, 0.09)
        n_chirps = int(rate * DUR)
        offset = rng.uniform(0, 1 / rate)
        for k in range(n_chirps):
            s = int(((k / rate) + offset + rng.uniform(-0.04, 0.04)) * SR)
            pulse_n = int(0.018 * SR)
            gap_n = int(0.012 * SR)
            tt = np.arange(pulse_n) / SR
            p = np.sin(2 * np.pi * f * tt) * np.sin(np.pi * tt / tt[-1]) ** 2
            ev = np.concatenate([np.concatenate([p, np.zeros(gap_n)]) for _ in range(pulses)]) * gain
            add_event(chans[0], s, ev * (1 - pan) * 2)
            add_event(chans[1], s, ev * pan * 2)
    return np.stack(chans)


def campfire(rng):
    chans = []
    flicker = 0.75 + 0.25 * periodic_smooth_noise(rng, 30, 6)
    for _ in range(2):
        roar = shaped_noise(rng, band(40, 500, slope=1.0)) * 0.6 * flicker
        hiss = shaped_noise(rng, band(1500, 8000, slope=0.2)) * 0.12
        pops = np.zeros(N)
        n_events = 2400
        times = np.sort(rng.integers(N, size=n_events))
        for s in times:
            n = int(rng.uniform(0.0008, 0.004) * SR)
            click = rng.standard_normal(n) * np.exp(-np.arange(n) / (n / 4))
            click = np.diff(click, prepend=0)  # brighter
            add_event(pops, s, click * min(rng.pareto(2.2) * 0.4, 2.0))
        for _ in range(60):  # bigger snaps
            n = int(rng.uniform(0.01, 0.03) * SR)
            snap = rng.standard_normal(n) * np.exp(-np.arange(n) / (n / 5))
            add_event(pops, rng.integers(N), snap * rng.uniform(0.8, 1.6))
        chans.append(roar + hiss + pops)
    return stereo(*chans, width=0.5)


def cafe(rng):
    chans = [np.zeros(N), np.zeros(N)]
    for _ in range(14):  # voices at the other tables
        speech = shaped_noise(rng, lambda f: band(180, 3200, slope=0.6)(f) * (1 + 1.5 * np.exp(-((f - 600) / 300) ** 2) + np.exp(-((f - 1700) / 500) ** 2)))
        syll = np.clip(periodic_smooth_noise(rng, 280, 150) * 1.6, 0, 1)    # ~4 syllables a second
        talk = (periodic_smooth_noise(rng, 12, 2) > rng.uniform(-0.4, 0.1)).astype(float)  # talking vs pausing
        talk = circ_smooth(talk, 2000)
        voice = speech * syll * talk * rng.uniform(0.25, 0.5)
        pan = rng.uniform(0.15, 0.85)
        chans[0] += voice * (1 - pan) * 2
        chans[1] += voice * pan * 2
    for _ in range(14):  # cups and spoons
        n = int(0.6 * SR)
        tt = np.arange(n) / SR
        partials = rng.uniform(2200, 5200) * np.array([1, 2.32, 3.9, 5.3])
        ev = sum(np.sin(2 * np.pi * p * tt) * np.exp(-tt / rng.uniform(0.05, 0.25)) / (i + 1) for i, p in enumerate(partials))
        pan = rng.uniform(0.2, 0.8)
        s = rng.integers(N)
        g = rng.uniform(0.05, 0.12)
        add_event(chans[0], s, ev * g * (1 - pan) * 2)
        add_event(chans[1], s, ev * g * pan * 2)
    room = [shaped_noise(rng, band(80, 600, slope=1.0)) * 0.12 for _ in range(2)]
    # A small room: a short decaying noise tail, applied circularly.
    ir_n = int(0.5 * SR)
    out = []
    for c, r in zip(chans, room):
        ir = rng.standard_normal(ir_n) * np.exp(-np.arange(ir_n) / (0.12 * SR)) * 0.03
        ir[0] = 1.0
        out.append(circ_conv(c, ir) + r)
    lp = band(0, 6000, order=2)
    out = [np.fft.irfft(np.fft.rfft(c) * lp(np.maximum(FREQS, 1.0)), N) for c in out]
    return np.stack(out)


# target mean level per sound (dBFS RMS), close to the recordings they replace
SOUNDS = {
    'rain': (rain, -22.5),
    'ocean': (ocean, -25.0),
    'forest': (forest, -25.0),
    'night-ambience': (night_ambience, -25.5),
    'campfire': (campfire, -26.0),
    'cafe': (cafe, -24.0),
}


def normalise(x, target_db):
    rms = np.sqrt(np.mean(x ** 2))
    x = x * (10 ** (target_db / 20) / rms)
    peak = np.max(np.abs(x))
    if peak > 0.89:  # about -1 dBFS: soft-limit the rare loud transient instead of clipping
        x = np.tanh(x / 0.89) * 0.89
    return x


def write_mp3(name, x):
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, name + '.wav')
        pcm = (np.clip(x.T, -1, 1) * 32767).astype('<i2')
        with wave.open(wav, 'wb') as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(pcm.tobytes())
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '128k',
                        '-map_metadata', '-1', os.path.join(OUT_DIR, name + '.mp3')], check=True)


if __name__ == '__main__':
    for i, (name, (fn, level)) in enumerate(SOUNDS.items()):
        rng = np.random.default_rng(20261118 + i)
        x = normalise(fn(rng), level)
        write_mp3(name, x)
        print(f'{name}.mp3  rms {20 * np.log10(np.sqrt(np.mean(x ** 2))):.1f} dBFS  peak {20 * np.log10(np.max(np.abs(x))):.1f} dBFS')
