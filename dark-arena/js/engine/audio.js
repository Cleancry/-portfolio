/* ============================================================
   PENITENT BLADE 鈥?engine/audio.js
   procedural WebAudio SFX + dark ambient music. Zero assets.
   ============================================================ */
'use strict';
(function () {
  const Game = window.Game;
  const U = Game.U;

  let ctx = null;
  let master = null;
  let sfxBus = null;
  let musicBus = null;
  let noiseBuf = null;
  let started = false;
  let musicOn = true;

  const m = { musicOn: true };

  /* ---------- setup ---------- */
  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 1.0;
    sfxBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.85;   // soundtrack presence (was too quiet at 0.45)
    musicBus.connect(master);
    // 1s white noise buffer
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function resume() {
    ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    started = true;
    // start the soundtrack the moment audio unlocks (fixes "no music" if the
    // player only clicks after the first newGame)
    if (musicOn && !music.nodes) music.start();
  }
  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }

  function now() { return ctx ? ctx.currentTime : 0; }

  /* ---------- primitive voices ---------- */
  function osc(type, freq, t0, dur, vol, dest, freqEnd, curve) {
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.02);
    return o;
  }

  function noise(t0, dur, vol, filterType, f0, f1, q, dest) {
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType || 'bandpass';
    f.frequency.setValueAtTime(f0, t0);
    if (f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    f.Q.value = q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(dest || sfxBus);
    src.start(t0, Math.random()); src.stop(t0 + dur + 0.02);
    return src;
  }

  function bell(t0, freq, dur, vol) {
    if (!ctx) return;
    osc('sine', freq, t0, dur, vol, sfxBus, freq * 0.97);
    osc('sine', freq * 2.01, t0, dur * 0.6, vol * 0.4, sfxBus, freq * 1.98);
    osc('sine', freq * 2.98, t0, dur * 0.35, vol * 0.25, sfxBus);
    osc('sine', freq * 4.01, t0, dur * 0.2, vol * 0.12, sfxBus);
  }

  /* simple delay send for ambience */
  function echoTap(dest) {
    const d = ctx.createDelay(); d.delayTime.value = 0.34;
    const fb = ctx.createGain(); fb.gain.value = 0.35;
    const wet = ctx.createGain(); wet.gain.value = 0.5;
    d.connect(fb); fb.connect(d); d.connect(wet); wet.connect(dest);
    return d;
  }

  /* ============================================================
     SFX bank 鈥?tuned for punchy feel
     ============================================================ */
  const sfx = {
    swing() {          // blade whoosh 鈥?layered, with a quick airy cut
      noise(now(), 0.16, 0.55, 'bandpass', 600, 2800, 2.4);
      noise(now(), 0.1, 0.35, 'highpass', 2200, 5200, 1);
      osc('sine', 300, now(), 0.1, 0.05, sfxBus, 700);
    },
    heavySwing() {     // big windup 鈥?deeper whoosh
      noise(now(), 0.24, 0.75, 'bandpass', 350, 1600, 1.8);
      noise(now(), 0.16, 0.4, 'highpass', 1400, 3800, 1);
      osc('sawtooth', 150, now(), 0.2, 0.12, sfxBus, 55);
    },
    hit() {            // light impact 鈥?punchy thud + metallic tick
      noise(now(), 0.07, 0.85, 'lowpass', 3000, 420, 1.2);
      osc('sine', 130, now(), 0.07, 0.5, sfxBus, 60);
      osc('square', 320, now(), 0.04, 0.16, sfxBus, 180);
    },
    heavyHit() {       // crushing impact 鈥?heavy drum + debris
      noise(now(), 0.16, 1.0, 'lowpass', 2400, 260, 1.5);
      osc('sine', 95, now(), 0.2, 0.9, sfxBus, 32);
      osc('square', 75, now(), 0.1, 0.35, sfxBus, 48);
      noise(now() + 0.02, 0.08, 0.5, 'bandpass', 1400, 900, 2);
    },
    block() {          // metal parry
      noise(now(), 0.05, 0.6, 'highpass', 3200, 7000, 3);
      osc('square', 900, now(), 0.05, 0.25, sfxBus, 600);
      osc('sine', 2200, now(), 0.04, 0.15, sfxBus, 1800);
    },
    dash() {
      noise(now(), 0.12, 0.35, 'bandpass', 900, 2400, 2);
    },
    step() {
      noise(now(), 0.05, 0.12, 'lowpass', 500, 200, 1);
    },
    hurt() {           // player pain
      osc('sine', 160, now(), 0.18, 0.5, sfxBus, 70);
      noise(now(), 0.1, 0.35, 'lowpass', 900, 250, 1);
    },
    death() {          // enemy dies 鈥?bone snap
      noise(now(), 0.06, 0.7, 'bandpass', 1800, 900, 2);
      noise(now() + 0.06, 0.08, 0.6, 'bandpass', 1200, 500, 2);
      osc('sine', 90, now(), 0.2, 0.5, sfxBus, 40);
    },
    execution() {      // finisher
      bell(now(), 130, 1.2, 0.8);
      osc('sine', 55, now(), 0.7, 0.9, sfxBus, 30);
      noise(now(), 0.5, 0.9, 'lowpass', 3000, 200, 1.2);
      noise(now() + 0.1, 0.2, 0.5, 'highpass', 2000, 6000, 2);
    },
    ultimate() {       // fury skill
      osc('sawtooth', 60, now(), 0.8, 0.5, sfxBus, 240);
      osc('sine', 120, now() + 0.1, 0.7, 0.4, sfxBus, 480);
      noise(now(), 0.9, 0.7, 'bandpass', 400, 3200, 1);
      bell(now() + 0.15, 440, 1.4, 0.5);
      bell(now() + 0.4, 660, 1.6, 0.35);
    },
    waveStart() {      // church bell 鈥?wave begin
      bell(now(), 392, 2.2, 0.9);
      bell(now() + 0.7, 523, 2.4, 0.6);
      bell(now() + 1.4, 659, 3.0, 0.45);
    },
    bossRoar() {
      osc('sawtooth', 70, now(), 1.4, 0.6, sfxBus, 35);
      osc('sawtooth', 74, now() + 0.03, 1.4, 0.5, sfxBus, 38);
      noise(now(), 1.2, 0.5, 'lowpass', 800, 150, 1);
    },
    /* LEAP SLAM 鈥?heavy ground impact: low thud + stone debris + dust */
    leapSlam() {
      noise(now(), 0.3, 1.0, 'lowpass', 2600, 120, 1.6);
      osc('sine', 70, now(), 0.35, 1.0, sfxBus, 24);
      osc('square', 55, now(), 0.16, 0.4, sfxBus, 34);
      noise(now() + 0.04, 0.22, 0.6, 'bandpass', 900, 300, 1.5);
      noise(now() + 0.08, 0.14, 0.4, 'highpass', 1600, 4200, 2);
    },
    /* TAIL SWIPE 鈥?sharp whip crack + deep growl */
    tailSwipe() {
      noise(now(), 0.1, 0.7, 'bandpass', 1800, 5200, 3);
      noise(now() + 0.02, 0.18, 0.45, 'highpass', 3000, 7000, 2);
      osc('sawtooth', 120, now(), 0.22, 0.35, sfxBus, 50);
      noise(now() + 0.12, 0.1, 0.3, 'lowpass', 500, 160, 1);
    },
    /* ROAR shockwave 鈥?sub-bass detonation */
    shockwave() {
      osc('sine', 48, now(), 0.9, 1.0, sfxBus, 22);
      osc('sine', 34, now() + 0.05, 1.1, 0.7, sfxBus, 18);
      noise(now(), 0.5, 0.8, 'lowpass', 700, 100, 1.2);
      noise(now() + 0.12, 0.5, 0.4, 'bandpass', 300, 900, 2);
    },
    /* FIRESTORM eruption 鈥?rising flame roar + crackle */
    fireErupt() {
      noise(now(), 0.5, 0.8, 'bandpass', 240, 2200, 1.2);
      osc('sawtooth', 90, now(), 0.45, 0.3, sfxBus, 240);
      for (let i = 0; i < 6; i++) {
        noise(now() + i * 0.07, 0.06, 0.25, 'highpass', 3000, 6000, 3);
      }
    },
    /* soul siphon on kill 鈥?soft rising chime */
    soulGain() {
      osc('sine', 520, now(), 0.18, 0.18, sfxBus, 660);
      osc('sine', 780, now() + 0.06, 0.22, 0.14, sfxBus, 880);
    },
    /* fury meter full 鈥?bright two-note prompt */
    furyReady() {
      osc('square', 880, now(), 0.06, 0.12, sfxBus, 880);
      osc('square', 1174, now() + 0.07, 0.09, 0.12, sfxBus, 1174);
      osc('sine', 880, now() + 0.07, 0.2, 0.15, sfxBus, 1760);
    },
    select() { osc('sine', 660, now(), 0.08, 0.2, sfxBus, 520); },
    uiTick() { osc('square', 440, now(), 0.03, 0.1, sfxBus, 380); },
  };

  /* ============================================================
     Music 鈥?dark ambient drone + sparse bells
     ============================================================ */
  const music = {
    nodes: null,
    tNextBell: 6,
    start() {
      if (!ctx || music.nodes || !musicOn) return;
      const g = musicBus;
      const n = {};
      // low drone: two detuned saws -> lowpass -> slow LFO gain
      n.drone = ctx.createGain(); n.drone.gain.value = 0.24;
      n.lp = ctx.createBiquadFilter(); n.lp.type = 'lowpass';
      n.lp.frequency.value = 240; n.lp.Q.value = 4;
      n.o1 = ctx.createOscillator(); n.o1.type = 'sawtooth'; n.o1.frequency.value = 55;
      n.o2 = ctx.createOscillator(); n.o2.type = 'sawtooth'; n.o2.frequency.value = 55.7;
      n.o3 = ctx.createOscillator(); n.o3.type = 'sine';     n.o3.frequency.value = 110.4;
      n.lfo = ctx.createOscillator(); n.lfo.frequency.value = 0.07;
      n.lfoG = ctx.createGain(); n.lfoG.gain.value = 0.05;
      n.lfo.connect(n.lfoG); n.lfoG.connect(n.drone.gain);
      n.o1.connect(n.lp); n.o2.connect(n.lp); n.o3.connect(n.lp);
      n.lp.connect(n.drone); n.drone.connect(g);
      n.o1.start(); n.o2.start(); n.o3.start(); n.lfo.start();
      // pipe-organ shimmer: a mid sawtooth through a soft lowpass (dark chapel feel)
      n.org = ctx.createOscillator(); n.org.type = 'sawtooth'; n.org.frequency.value = 220;
      n.orgG = ctx.createGain(); n.orgG.gain.value = 0.08;
      n.orgLP = ctx.createBiquadFilter(); n.orgLP.type = 'lowpass'; n.orgLP.frequency.value = 620; n.orgLP.Q.value = 3;
      n.org.connect(n.orgLP); n.orgLP.connect(n.orgG); n.orgG.connect(g);
      n.org.start();
      // heartbeat
      n.beat = ctx.createGain(); n.beat.gain.value = 0.5; n.beat.connect(g);
      n.b1 = ctx.createOscillator(); n.b1.type = 'sine'; n.b1.frequency.value = 50;
      n.b2 = ctx.createOscillator(); n.b2.type = 'sine'; n.b2.frequency.value = 46;
      n.b1.connect(n.beat); n.b2.connect(n.beat);
      n.b1.start(); n.b2.start();
      music.nodes = n;
      music.tNextBell = 5;
    },
    stop() {
      if (music.nodes) {
        try {
          music.nodes.o1.stop(); music.nodes.o2.stop(); music.nodes.o3.stop();
          music.nodes.lfo.stop(); music.nodes.b1.stop(); music.nodes.b2.stop();
          music.nodes.org.stop(); if (music.nodes.tension) music.nodes.tension.stop();
          if (music.nodes.boss) {
            music.nodes.bossSub.stop(); music.nodes.bossHiss.stop(); music.nodes.bossLfo.stop();
          }
          if (music.nodes.holy) {
            music.nodes.holyOsc.forEach(v => v.o.stop());
            music.nodes.holyLfo.stop();
          }
        } catch (e) {}
        music.nodes = null;
      }
    },
    /* called each frame with dt + intensity (0..~1.5: idle / combat / boss) */
    update(dt, intensity) {
      if (!music.nodes) return;
      const t = now();
      const inten = intensity || 0.6;
      const n = music.nodes;
      // drone swells with combat intensity
      n.drone.gain.setValueAtTime(0.15 + 0.1 * inten, t);
      // EXALTED HOLY ORGAN (combat 0.8-1.4): bright pipe-organ chord,
      // the crusader theme 鈥?fades out as the boss tension takes over
      if (inten > 0.8 && !n.holy) {
        n.holy = ctx.createGain(); n.holy.gain.value = 0;
        n.holy.connect(musicBus);
        const chord = [220, 261.6, 329.6, 440];   // A-major-ish fanfare
        n.holyOsc = chord.map(f => {
          const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
          const g = ctx.createGain(); g.gain.value = 0.5 / chord.length;
          o.connect(g); g.connect(n.holy);
          o.start();
          return { o, g };
        });
        // gentle chord swell LFO
        n.holyLfo = ctx.createOscillator(); n.holyLfo.frequency.value = 0.09;
        n.holyLfoG = ctx.createGain(); n.holyLfoG.gain.value = 0.12;
        n.holyLfo.connect(n.holyLfoG); n.holyLfoG.connect(n.holy.gain);
        n.holyLfo.start();
      }
      if (n.holy) {
        // present during combat, silenced under boss pressure
        const holyA = inten > 0.8 && inten <= 1.45 ? 0.14 + 0.1 * (inten - 0.8) : 0;
        n.holy.gain.setValueAtTime(Math.max(0, holyA), t);
      }
      // heartbeat: faster + louder under pressure
      const period = 1.7 - 0.55 * Math.min(1.4, inten);
      const ph = (t % period) / period;
      const beatV = Math.max(0, 1 - ph * 8) * (0.22 + 0.28 * inten);
      n.beat.gain.setValueAtTime(beatV, t);
      // tension drone: a low fifth appearing at high intensity
      if (inten > 1.1 && !n.tension) {
        n.tension = ctx.createOscillator();
        n.tension.type = 'sawtooth'; n.tension.frequency.value = 73;
        const tg = ctx.createGain(); tg.gain.value = 0;
        n.tension.connect(tg); tg.connect(musicBus);
        n.tensionG = tg;
        n.tension.start();
      }
      if (n.tensionG) {
        n.tensionG.gain.setValueAtTime(Math.max(0, (inten - 1.1) * 0.12), t);
      }
      // BOSS THEME: hellfire layer at peak intensity (sub drone + molten hiss)
      if (inten > 1.3 && !n.boss) {
        n.boss = ctx.createGain(); n.boss.gain.value = 0;
        n.boss.connect(musicBus);
        // hellish sub drone (below the normal drone)
        n.bossSub = ctx.createOscillator();
        n.bossSub.type = 'sawtooth'; n.bossSub.frequency.value = 41;
        n.bossSubG = ctx.createGain(); n.bossSubG.gain.value = 0.5;
        n.bossSub.connect(n.bossSubG); n.bossSubG.connect(n.boss);
        n.bossSub.start();
        // molten hiss: high saw through a sharp bandpass (fire crackle feel)
        n.bossHiss = ctx.createOscillator();
        n.bossHiss.type = 'sawtooth'; n.bossHiss.frequency.value = 3800;
        n.bossHissLP = ctx.createBiquadFilter();
        n.bossHissLP.type = 'bandpass'; n.bossHissLP.frequency.value = 4600; n.bossHissLP.Q.value = 6;
        n.bossHissG = ctx.createGain(); n.bossHissG.gain.value = 0.1;
        n.bossHiss.connect(n.bossHissLP); n.bossHissLP.connect(n.bossHissG); n.bossHissG.connect(n.boss);
        n.bossHiss.start();
        // ember crackle: fast LFO on the sub gain
        n.bossLfo = ctx.createOscillator(); n.bossLfo.frequency.value = 3.1;
        n.bossLfoG = ctx.createGain(); n.bossLfoG.gain.value = 0.2;
        n.bossLfo.connect(n.bossLfoG); n.bossLfoG.connect(n.bossSubG.gain);
        n.bossLfo.start();
      }
      if (n.boss) {
        const bossA = U.clamp((inten - 1.3) * 0.75, 0, inten > 1.7 ? 0.9 : 0.5);
        n.boss.gain.setValueAtTime(bossA, t);
      }
      // war drums under boss pressure: low thump on half the heartbeat period
      if (inten > 1.15 && t - (music.lastDrum || 0) > period * (inten > 1.7 ? 0.32 : 0.5)) {
        music.lastDrum = t;
        noise(t, 0.13, 0.42, 'lowpass', 320, 110, 1, musicBus);
        osc('sine', 55, t, 0.15, 0.4, musicBus, 38);
      }
      // PHASE-2 OPPRESSIVE PULSE: heavy sub thump, relentless
      if (inten > 1.7 && t - (music.lastPulse || 0) > 0.55) {
        music.lastPulse = t;
        osc('sine', 42, t, 0.35, 0.7, musicBus, 30);
        noise(t, 0.2, 0.5, 'lowpass', 500, 120, 1.2, musicBus);
      }
      // sparse bells (calmer when idle)
      if (t >= music.tNextBell) {
        const f = U.pick([196, 220, 261.6, 293.7, 174.6]);
        bell(t, f, 2.4, U.rand(0.10, 0.20));
        music.tNextBell = t + U.rand(6, 14);
      }
      // occasional wind swish
      if (Math.random() < dt * 0.3) noise(t, 1.6, 0.05, 'bandpass', 300, 900, 2, musicBus);
    }
  };

  Game.Audio = {
    init() { ensure(); },
    resume, suspend,
    get ready() { return !!ctx && started; },
    setMusic(on) { musicOn = on; if (!on) music.stop(); else if (started) music.start(); },
    musicOn() { return musicOn; },
    play(name) {
      if (!started || !ctx) return;
      if (sfx[name]) sfx[name]();
    },
    musicUpdate(dt) { music.update(dt); },
    musicStart() { if (started) music.start(); },
  };
})();
