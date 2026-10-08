/**
 * Custom video lesson player (FR-09, FR-10).
 *
 * Everything a student needs while reviewing sits in one control bar in the
 * same place on every lesson: play, skip back and forward, a clickable
 * position bar, volume, playback speed and full screen. Position is reported
 * to the server every few seconds so the lesson resumes where it stopped,
 * and completion is recorded when the video ends.
 */
(function () {
  var L = window.LESSON;
  if (!L) return;

  var video = document.getElementById('player');
  var scrub = document.getElementById('scrub');
  var played = document.getElementById('played');
  var knob = document.getElementById('knob');
  var playBtn = document.getElementById('playBtn');
  var back10 = document.getElementById('back10');
  var fwd10 = document.getElementById('fwd10');
  var muteBtn = document.getElementById('muteBtn');
  var volume = document.getElementById('volume');
  var speed = document.getElementById('speed');
  var fsBtn = document.getElementById('fsBtn');
  var timeLabel = document.getElementById('time');
  var completeBtn = document.getElementById('completeBtn');
  var saveState = document.getElementById('saveState');
  var courseBar = document.getElementById('courseBar');
  var percentLabel = document.getElementById('percentLabel');

  var lastSent = 0;

  function fmt(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function paint() {
    var d = video.duration || L.duration || 0;
    var pct = d ? (video.currentTime / d) * 100 : 0;
    played.style.width = pct + '%';
    knob.style.left = pct + '%';
    scrub.setAttribute('aria-valuenow', Math.round(pct));
    timeLabel.textContent = fmt(video.currentTime) + ' / ' + fmt(d);
  }

  /* Resume from the stored position (FR-10). */
  video.addEventListener('loadedmetadata', function () {
    if (L.resumeAt > 0 && L.resumeAt < (video.duration || Infinity) - 1) {
      video.currentTime = L.resumeAt;
      say('Resumed where you stopped');
    }
    paint();
  });

  video.addEventListener('timeupdate', function () {
    paint();
    var now = Date.now();
    if (now - lastSent > 5000) {           // one small request every 5 seconds
      lastSent = now;
      report(false);
    }
  });

  video.addEventListener('ended', function () { report(true); });
  video.addEventListener('play', function () { playBtn.innerHTML = '&#10074;&#10074;'; playBtn.setAttribute('aria-label', 'Pause'); });
  video.addEventListener('pause', function () { playBtn.innerHTML = '&#9654;'; playBtn.setAttribute('aria-label', 'Play'); report(false); });

  playBtn.addEventListener('click', function () { video.paused ? video.play() : video.pause(); });
  back10.addEventListener('click', function () { video.currentTime = Math.max(0, video.currentTime - 10); });
  fwd10.addEventListener('click', function () { video.currentTime = Math.min(video.duration || 0, video.currentTime + 10); });

  /* Clickable position bar: in-video navigation without dragging a thin line. */
  function seekFromEvent(e) {
    var rect = scrub.getBoundingClientRect();
    var x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    var ratio = Math.min(1, Math.max(0, x / rect.width));
    if (video.duration) video.currentTime = ratio * video.duration;
  }
  scrub.addEventListener('click', seekFromEvent);
  scrub.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') video.currentTime += 5;
    if (e.key === 'ArrowLeft') video.currentTime -= 5;
  });

  muteBtn.addEventListener('click', function () {
    video.muted = !video.muted;
    muteBtn.innerHTML = video.muted ? '&#128263;' : '&#128266;';
    muteBtn.setAttribute('aria-label', video.muted ? 'Unmute' : 'Mute');
  });
  volume.addEventListener('input', function () { video.volume = Number(volume.value); video.muted = false; });
  speed.addEventListener('change', function () { video.playbackRate = Number(speed.value); });

  fsBtn.addEventListener('click', function () {
    var shell = video.parentElement;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (shell.requestFullscreen) shell.requestFullscreen();
    else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
  });

  /* Keyboard control for the whole player (NFR-09). */
  document.addEventListener('keydown', function (e) {
    if (/input|textarea|select/i.test(e.target.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); video.paused ? video.play() : video.pause(); }
    if (e.key === 'ArrowRight') video.currentTime += 5;
    if (e.key === 'ArrowLeft') video.currentTime -= 5;
  });

  completeBtn.addEventListener('click', function () { report(true); });

  function say(message) {
    saveState.textContent = message;
    setTimeout(function () { if (saveState.textContent === message) saveState.textContent = ''; }, 2500);
  }

  /* Progress reporting (FR-11, FR-12). */
  function report(completed) {
    fetch('/lessons/' + L.id + '/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position_seconds: Math.floor(video.currentTime || 0), completed: !!completed })
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.ok) return;
        if (completed) {
          completeBtn.textContent = 'Completed';
          completeBtn.classList.add('btn-ghost');
          completeBtn.dataset.completed = '1';
          say('Lesson marked complete');
          var tick = document.querySelector('.lesson-link.current .tick');
          if (tick) tick.classList.add('done');
        }
        if (typeof data.course_percent === 'number') {
          courseBar.style.width = data.course_percent + '%';
          percentLabel.textContent = data.course_percent + '%';
        }
      })
      .catch(function () { /* a dropped request is retried on the next tick */ });
  }

  /* Save the position when the page is closed or backgrounded. */
  window.addEventListener('pagehide', function () { report(false); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') report(false);
  });
})();
