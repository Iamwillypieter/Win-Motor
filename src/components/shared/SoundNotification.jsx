"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// Singleton AudioContext — dibuat sekali, di-resume saat diperlukan
let _audioCtx = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  if (!_audioCtx) {
    _audioCtx = new AudioContext();
  }
  return _audioCtx;
}

/**
 * Pastikan AudioContext aktif (resume jika suspended karena autoplay policy).
 * Browser memblokir audio sampai ada interaksi user — ini menanganinya.
 */
async function ensureAudioContextRunning() {
  const ctx = getAudioContext();
  if (!ctx) return null;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      // ignore
    }
  }
  return ctx;
}

/**
 * Mainkan satu "ding" pada AudioContext yang diberikan.
 * @param {AudioContext} ctx
 * @param {number[]} notes - array frekuensi
 * @param {number} startOffset - waktu mulai relatif dari ctx.currentTime
 * @param {"sine"|"triangle"} type
 * @param {number} noteDuration
 * @param {number} noteSpacing
 * @param {number} volume
 */
function playNotes(ctx, notes, startOffset, oscType = "sine", noteDuration = 0.3, noteSpacing = 0.18, volume = 0.4) {
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = oscType;
    osc.frequency.value = freq;
    const t = ctx.currentTime + startOffset + i * noteSpacing;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + noteDuration);
    osc.start(t);
    osc.stop(t + noteDuration);
  });
}

/**
 * Buat suara notifikasi menggunakan Web Audio API.
 * Untuk `new_order`: diulang 3 kali agar tidak terlewat.
 *
 * @param {"new_order"|"order_ready"|"payment_success"|"new_transaction"} type
 */
async function playNotificationSound(type) {
  try {
    const ctx = await ensureAudioContextRunning();
    if (!ctx) return;

    if (type === "new_order") {
      // Suara "ding ding ding" diulang 3 kali — C5, E5, G5
      const notes = [523.25, 659.25, 783.99];
      const repeatCount = 3;
      const repeatInterval = 0.8; // jeda antar pengulangan (detik)

      for (let r = 0; r < repeatCount; r++) {
        playNotes(ctx, notes, r * repeatInterval, "sine", 0.3, 0.18, 0.5);
      }

    } else if (type === "order_ready") {
      // Suara "fanfare" diulang 2 kali — C5, E5, G5, C6
      const notes = [523.25, 659.25, 783.99, 1046.5];
      playNotes(ctx, notes, 0, "triangle", 0.35, 0.15, 0.4);
      playNotes(ctx, notes, 0.9, "triangle", 0.35, 0.15, 0.35);

    } else if (type === "payment_success") {
      // Suara mesin kasir / register — "ka-ching!"
      // 1. Bunyi mekanik pendek (noise burst)
      const bufferSize = ctx.sampleRate * 0.04;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * 0.6;
      }
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.value = 3000;
      noiseFilter.Q.value = 0.5;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.8, ctx.currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noiseSource.start(ctx.currentTime);
      noiseSource.stop(ctx.currentTime + 0.04);

      // 2. Nada "ching" tinggi — suara lonceng kasir
      const chingNotes = [
        { freq: 2093, start: 0.02, dur: 0.6, vol: 0.35 },  // C7
        { freq: 2637, start: 0.05, dur: 0.5, vol: 0.25 },  // E7
        { freq: 3136, start: 0.08, dur: 0.4, vol: 0.2  },  // G7
      ];
      chingNotes.forEach(({ freq, start, dur, vol }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "triangle";
        osc.frequency.value = freq;
        const t = ctx.currentTime + start;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(vol, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.start(t);
        osc.stop(t + dur);
      });

      // 3. Nada rendah "ka" — suara laci kasir terbuka
      const kaOsc = ctx.createOscillator();
      const kaGain = ctx.createGain();
      kaOsc.connect(kaGain);
      kaGain.connect(ctx.destination);
      kaOsc.type = "sawtooth";
      kaOsc.frequency.setValueAtTime(180, ctx.currentTime);
      kaOsc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.15);
      kaGain.gain.setValueAtTime(0, ctx.currentTime);
      kaGain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.01);
      kaGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      kaOsc.start(ctx.currentTime);
      kaOsc.stop(ctx.currentTime + 0.15);

    } else if (type === "new_transaction") {
      // Suara "ping" dua kali
      [0, 0.4].forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = 880;
        const t = ctx.currentTime + offset;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.3, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        osc.start(t);
        osc.stop(t + 0.5);
      });
    }
  } catch {
    // Web Audio API tidak tersedia atau error — abaikan
  }
}

/**
 * Hook untuk unlock AudioContext saat user pertama kali berinteraksi.
 * Dipanggil di komponen yang butuh suara.
 */
export function useAudioUnlock() {
  useEffect(() => {
    const unlock = () => {
      ensureAudioContextRunning();
    };
    // Unlock saat user pertama kali klik atau sentuh layar
    window.addEventListener("click", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);
}

/**
 * Toast notification item.
 */
function Toast({ toast, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 5000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const isNewOrder = toast.type === "new_order";

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg max-w-sm w-full animate-slide-in ${
        isNewOrder
          ? "bg-blue-600 border-blue-500 text-white"
          : "bg-green-600 border-green-500 text-white"
      }`}
      role="alert"
      aria-live="assertive"
    >
      <span className="text-2xl flex-shrink-0 mt-0.5">
        {isNewOrder ? "🛒" : "✅"}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{toast.title}</p>
        <p className="text-xs opacity-90 mt-0.5">{toast.message}</p>
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-white/70 hover:text-white text-lg leading-none flex-shrink-0"
        aria-label="Tutup notifikasi"
      >
        ×
      </button>
    </div>
  );
}

/**
 * SoundNotification — komponen notifikasi dengan suara.
 *
 * Mendengarkan SSE events dan menampilkan toast + memainkan suara.
 *
 * @param {{
 *   listenFor: "new_order" | "order_ready",
 *   onEvent?: (event: Object) => void
 * }} props
 */
export default function SoundNotification({ listenFor, onEvent }) {
  const [toasts, setToasts] = useState([]);
  const counterRef = useRef(0);

  const addToast = useCallback((type, title, message) => {
    const id = ++counterRef.current;
    setToasts((prev) => [...prev, { id, type, title, message }]);
    playNotificationSound(type);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Expose addToast via ref pattern — parent calls this
  useEffect(() => {
    if (onEvent) {
      // Store addToast in a way parent can call it
      onEvent._addToast = addToast;
    }
  }, [onEvent, addToast]);

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end"
      aria-label="Notifikasi"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </div>
  );
}

export { playNotificationSound };
