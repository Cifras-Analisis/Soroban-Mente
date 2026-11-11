"""Prepara una canción propia para Ritmo corporal.

Uso:  python procesar_cancion.py <archivo> <inicio_seg> [duración_seg] [nombre]

1. Recorta el fragmento (por defecto 30 s).
2. Separa la voz de los instrumentos con Demucs.
3. Detecta la melodía de la voz (torchcrepe) y la toca con un sonido de organeta.
4. Mezcla instrumentos + organeta -> <nombre>.m4a
5. Calcula el pulso y las notas -> <nombre>.json (lo usa el juego para colocar los gestos)

Todo queda en tu equipo: el juego solo reproduce el archivo desde esta carpeta.
"""
import json, os, subprocess, sys
import numpy as np
import soundfile as sf
import imageio_ffmpeg

HERE = os.path.dirname(os.path.abspath(__file__))
FF = imageio_ffmpeg.get_ffmpeg_exe()


def run(cmd):
    print('>', ' '.join(str(c) for c in cmd)[:160])
    subprocess.run(cmd, check=True)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    src = args[0]
    start = float(args[1])
    dur = float(args[2]) if len(args) > 2 else 30.0
    name = args[3] if len(args) > 3 else 'mi_cancion'
    precise = '--preciso' in sys.argv
    # --original: el juego usa el fragmento tal cual (con voz); la voz separada solo sirve para analizar
    original = '--original' in sys.argv
    work = os.path.join(HERE, '_trabajo')
    os.makedirs(work, exist_ok=True)
    seg = os.path.join(work, 'fragmento.wav')
    # 1. Fragmento (con 1 s extra para el final suave)
    run([FF, '-y', '-loglevel', 'error', '-ss', str(start), '-t', str(dur + 1), '-i', src, '-ac', '2', '-ar', '44100', seg])

    # 2. Separación voz / instrumentos
    # --preciso: modelo afinado (4 redes), varias pasadas desplazadas y filtro de Wiener final
    model = 'htdemucs_ft' if precise else 'htdemucs'
    if original:
        # reutiliza una separación ya hecha si existe (solo para detectar las notas largas)
        model = next((m for m in ('htdemucs_ft', 'htdemucs') if os.path.exists(os.path.join(work, m, 'fragmento', 'vocals.wav'))), 'htdemucs')
    base = os.path.join(work, model, 'fragmento')
    if not (('--reusar' in sys.argv or original) and os.path.exists(os.path.join(base, 'vocals.wav'))):
        extra = ['--shifts', '2', '--overlap', '0.5'] if precise else []
        run([sys.executable, '-m', 'demucs', '--two-stems=vocals', '-n', model, *extra, '-o', work, seg])
    inst, sr = sf.read(os.path.join(base, 'no_vocals.wav'))
    voc, _ = sf.read(os.path.join(base, 'vocals.wav'))
    if precise and not original:
        # Refinado: máscara de Wiener sobre la mezcla original -> quita restos de voz del acompañamiento
        from scipy.signal import stft, istft
        mix_in, _ = sf.read(seg)
        n = min(len(mix_in), len(inst), len(voc))
        out = np.zeros((n, 2))
        for ch in range(2):
            _, _, M = stft(mix_in[:n, ch], sr, nperseg=4096, noverlap=3072)
            _, _, I = stft(inst[:n, ch], sr, nperseg=4096, noverlap=3072)
            _, _, V = stft(voc[:n, ch], sr, nperseg=4096, noverlap=3072)
            pi, pv = np.abs(I) ** 2, np.abs(V) ** 2
            mask = pi / (pi + 1.6 * pv + 1e-10)
            _, x = istft(M * mask, sr, nperseg=4096, noverlap=3072)
            out[:, ch] = x[:n]
        inst = out
        print('refinado de Wiener aplicado')

    # 3. Melodía de la voz
    import torch, torchcrepe
    mono = voc.mean(axis=1).astype(np.float32)
    sr16 = 16000
    x16 = torch.tensor(np.interp(np.arange(0, len(mono), sr / sr16), np.arange(len(mono)), mono), dtype=torch.float32)[None]
    hop = 160  # 10 ms
    f0, per = torchcrepe.predict(x16, sr16, hop, 65, 1000, 'full', batch_size=512, device='cpu', return_periodicity=True)
    f0 = f0[0].numpy(); per = per[0].numpy()
    per = torchcrepe.filter.median(torch.tensor(per)[None], 5)[0].numpy()
    frames = len(f0)
    def frame_rms(i):
        a = int(i * sr * 0.01)
        seg_ = mono[a:a + int(sr * 0.02)]
        return float(np.sqrt(np.mean(seg_ ** 2))) if len(seg_) else 0.0
    rms = np.array([frame_rms(i) for i in range(frames)])
    print('periodicidad media', round(float(per.mean()), 3), '· frames', frames)
    voiced = (per > 0.45) & (rms > rms.max() * 0.04)
    midi = 69 + 12 * np.log2(np.maximum(f0, 1) / 440)
    # suaviza el tono
    k = 5
    ms = np.array([np.median(midi[max(0, i - k):i + k + 1]) for i in range(frames)])

    notes = []
    i = 0
    while i < frames:
        if not voiced[i]:
            i += 1
            continue
        j = i
        ref = ms[i]
        while j + 1 < frames and voiced[j + 1] and abs(ms[j + 1] - ref) < 0.8:
            j += 1
            ref = np.median(ms[i:j + 1])
        if (j - i + 1) * 0.01 >= 0.07:
            notes.append([i * 0.01, (j + 1) * 0.01, int(round(np.median(ms[i:j + 1])))])
        i = j + 1
    # une notas iguales muy seguidas
    merged = []
    for n in notes:
        if merged and n[2] == merged[-1][2] and n[0] - merged[-1][1] < 0.06:
            merged[-1][1] = n[1]
        else:
            merged.append(n)
    notes = [n for n in merged if n[0] < dur]
    print('notas detectadas:', len(notes))

    # 4. Organeta: órgano sencillo (armónicos + leve trémolo)
    L = int((dur + 1) * sr)
    org = np.zeros(L)
    for s, e, m in notes:
        e = min(e, dur + 0.9)
        f = 440 * 2 ** ((m - 69) / 12)
        # una octava arriba si la voz es muy grave, para que se oiga clara
        while f < 330:
            f *= 2
        a, b = int(s * sr), int(e * sr)
        t = np.arange(b - a) / sr
        w = (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * 2 * f * t) + 0.3 * np.sin(2 * np.pi * 3 * f * t) + 0.15 * np.sin(2 * np.pi * 4 * f * t))
        w *= 1 + 0.12 * np.sin(2 * np.pi * 6 * t)
        env = np.minimum(1, t / 0.015) * np.minimum(1, (t[::-1]) / 0.04)
        org[a:b] += w * env
    org /= max(1e-9, np.abs(org).max())
    mix = inst[:L] * 0.85 + np.stack([org, org], axis=1)[:len(inst[:L])] * 0.32
    if original:
        mix, _ = sf.read(seg)
        mix = mix.astype(np.float64)
    n = len(mix)
    fade_in, fade_out = int(0.3 * sr), int(1.5 * sr)
    total = int(dur * sr)
    mix = mix[:total]
    mix[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
    mix[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None]
    mix /= max(1e-9, np.abs(mix).max()) / 0.95
    wav = os.path.join(work, 'mezcla.wav')
    sf.write(wav, mix, sr)
    out = os.path.join(HERE, name + '.m4a')
    run([FF, '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'aac', '-b:a', '160k', out])

    # 5. Pulso (tempo y fase) a partir de lo que suena en el juego
    im = (mix if original else inst[:total]).mean(axis=1)
    hopb = 512
    win = np.hanning(2048)
    spec = np.array([np.abs(np.fft.rfft(im[p:p + 2048] * win)) for p in range(0, len(im) - 2048, hopb)])
    flux = np.maximum(0, np.diff(np.log1p(spec), axis=0)).sum(axis=1)
    lowf = np.maximum(0, np.diff(np.log1p(spec[:, :14]), axis=0)).sum(axis=1)  # graves: bombo y bajo
    flux = (flux - flux.mean()) / (flux.std() + 1e-9)
    lowf = (lowf - lowf.mean()) / (lowf.std() + 1e-9)
    fps = sr / hopb
    best = None
    for bpm in np.arange(70, 140, 0.25):
        per_f = fps * 60 / bpm
        for ph in np.arange(0, per_f, 0.5):
            idx = (ph + per_f * np.arange(int(len(flux) / per_f))).astype(int)
            idx = idx[idx < len(flux)]
            sc = flux[idx].mean()
            if best is None or sc > best[0]:
                best = (sc, bpm, ph / fps)
    _, bpm, off = best
    spb = 60 / bpm
    # La fase del pulso se toma del bombo (graves): la caja y el hi-hat suelen ir a contratiempo
    freqs = np.fft.rfftfreq(2048, 1 / sr)
    kb = (freqs >= 30) & (freqs < 120)
    kick = np.maximum(0, np.diff(np.log1p(spec[:, kb]), axis=0)).sum(axis=1)
    kick = (kick - kick.mean()) / (kick.std() + 1e-9)
    per_f = fps * spb
    best_k = max((kick[(ph + per_f * np.arange(int(len(kick) / per_f))).astype(int).clip(0, len(kick) - 1)].mean(), ph / fps)
                 for ph in np.arange(0, per_f, 0.25))
    print('fase por todo el espectro', round(off, 3), 's · fase por el bombo', round(best_k[1], 3), 's')
    off = best_k[1]
    print('tempo ~', bpm, 'bpm · primer pulso', round(off, 3), 's')
    q = 0.5  # corcheas
    beats = []
    for s, e, m in notes:
        t = round((s - off) / spb / q) * q
        d = max(q, round((e - s) / spb / q) * q)
        if t < 0 or t * spb + off > dur - 0.5:
            continue
        if beats and beats[-1]['t'] == t:
            continue
        beats.append({'t': t, 'd': d, 'm': m})
    # Fuerza de cada medio tiempo (0..1): los golpes más fuertes de la canción
    strength = 0.35 * flux + 0.65 * lowf
    acc = []
    for k in range(int((dur - off) / (spb / 2)) + 1):
        c = (off + k * spb / 2) * fps
        a, b = max(0, int(c - 0.04 * fps)), min(len(strength), int(c + 0.04 * fps) + 1)
        acc.append(float(strength[a:b].max()) if b > a else 0.0)
    acc = np.array(acc)
    lo, hi = np.percentile(acc, 10), np.percentile(acc, 97)
    acc = np.clip((acc - lo) / (hi - lo + 1e-9), 0, 1)
    info = {'name': name, 'file': 'Canciones/' + name + '.m4a', 'bpm': round(float(bpm), 2), 'offset': round(float(off), 3),
            'dur': dur, 'notes': beats, 'acc': [round(float(a), 2) for a in acc], 'original': original}
    with open(os.path.join(HERE, name + '.json'), 'w', encoding='utf8') as fh:
        json.dump(info, fh, ensure_ascii=False)
    print('listo:', out)


if __name__ == '__main__':
    main()
