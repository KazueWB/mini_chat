// Web Audio API Sound Synthesizer for Chat Together Web
class SoundManager {
    constructor() {
        this.enabled = true;
        this.ctx = null;
        this.ringInterval = null;
    }

    init() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                this.ctx = new AudioCtx();
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    playSent() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        // Messenger-like quick high pop
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "sine";
        const t = this.ctx.currentTime;
        osc.frequency.setValueAtTime(600, t);
        osc.frequency.exponentialRampToValueAtTime(1200, t + 0.08);

        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.1);
    }

    playReceived() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        // Chat Together Web cheerful two-tone chime
        const now = this.ctx.currentTime;
        const playTone = (freq, start, duration) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, start);
            gain.gain.setValueAtTime(0.25, start);
            gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(start);
            osc.stop(start + duration);
        };

        playTone(659.25, now, 0.12);        // E5
        playTone(880.00, now + 0.08, 0.22); // A5
    }

    startRinging() {
        if (!this.enabled || this.ringInterval) return;
        this.init();
        if (!this.ctx) return;

        const ring = () => {
            if (!this.enabled || !this.ctx) return;
            const now = this.ctx.currentTime;
            const osc1 = this.ctx.createOscillator();
            const osc2 = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc1.type = "sine";
            osc2.type = "sine";
            osc1.frequency.setValueAtTime(440, now);
            osc2.frequency.setValueAtTime(480, now);

            gain.gain.setValueAtTime(0.2, now);
            gain.gain.setValueAtTime(0.2, now + 1.2);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 1.3);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(this.ctx.destination);

            osc1.start(now);
            osc2.start(now);
            osc1.stop(now + 1.3);
            osc2.stop(now + 1.3);
        };

        ring();
        this.ringInterval = setInterval(ring, 3000);
    }

    stopRinging() {
        if (this.ringInterval) {
            clearInterval(this.ringInterval);
            this.ringInterval = null;
        }
    }

    startIncomingRing() {
        if (!this.enabled || this.incomingRingInterval) return;
        this.init();
        if (!this.ctx) return;

        const playChime = () => {
            if (!this.enabled || !this.ctx) return;
            const now = this.ctx.currentTime;
            
            // Musical incoming melody: C5 (523), E5 (659), G5 (784), C6 (1046)
            const notes = [
                { f: 523.25, start: 0, dur: 0.18 },
                { f: 659.25, start: 0.15, dur: 0.18 },
                { f: 783.99, start: 0.30, dur: 0.22 },
                { f: 1046.50, start: 0.48, dur: 0.45 },
                { f: 783.99, start: 0.95, dur: 0.18 },
                { f: 1046.50, start: 1.15, dur: 0.45 }
            ];

            notes.forEach(n => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = "sine";
                osc.frequency.setValueAtTime(n.f, now + n.start);

                gain.gain.setValueAtTime(0.28, now + n.start);
                gain.gain.exponentialRampToValueAtTime(0.001, now + n.start + n.dur);

                osc.connect(gain);
                gain.connect(this.ctx.destination);

                osc.start(now + n.start);
                osc.stop(now + n.start + n.dur);
            });
        };

        playChime();
        this.incomingRingInterval = setInterval(playChime, 2400);
    }

    stopIncomingRing() {
        if (this.incomingRingInterval) {
            clearInterval(this.incomingRingInterval);
            this.incomingRingInterval = null;
        }
    }

    playEndCall() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.linearRampToValueAtTime(200, now + 0.25);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.26);
    }
}

window.soundManager = new SoundManager();
