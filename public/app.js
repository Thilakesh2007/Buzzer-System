/**
 * buzzin.live - Frontend Socket.io and Audio Controller
 * Handles real-time synchronization, Web Audio sound effects, and UI state
 */

(function () {
  'use strict';

  // ============================================================================
  // 1. Audio System (Web Audio API - No external assets required)
  // ============================================================================
  const AudioManager = {
    audioCtx: null,
    isMuted: localStorage.getItem('buzzin_muted') === 'true',

    getAudioContext() {
      if (!this.audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          this.audioCtx = new AudioContextClass();
        }
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      return this.audioCtx;
    },

    toggleMute() {
      this.isMuted = !this.isMuted;
      localStorage.setItem('buzzin_muted', String(this.isMuted));
      this.updateMuteButtons();
      return this.isMuted;
    },

    updateMuteButtons() {
      const muteBtns = document.querySelectorAll('.btn-mute-toggle');
      muteBtns.forEach((btn) => {
        btn.innerHTML = this.isMuted ? '🔇' : '🔊';
        btn.setAttribute('title', this.isMuted ? 'Unmute Sound' : 'Mute Sound');
      });
    },

    // Authentic arcade buzzer sound (low-frequency dual oscillator)
    playBuzzer() {
      if (this.isMuted) return;
      try {
        const ctx = this.getAudioContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gainNode = ctx.createGain();

        // Game show buzz: dual sawtooth waves with detune
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(175, now);
        osc1.frequency.exponentialRampToValueAtTime(140, now + 0.35);

        osc2.type = 'square';
        osc2.frequency.setValueAtTime(180, now);
        osc2.frequency.exponentialRampToValueAtTime(145, now + 0.35);

        gainNode.gain.setValueAtTime(0.35, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.35);
        osc2.stop(now + 0.35);
      } catch (e) {
        console.warn('Audio playback error', e);
      }
    },

    // First place chime (bright upbeat chord)
    playFirstPlaceChime() {
      if (this.isMuted) return;
      try {
        const ctx = this.getAudioContext();
        if (!ctx) return;

        const now = ctx.currentTime;
        [523.25, 659.25, 783.99].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + i * 0.04);
          gain.gain.setValueAtTime(0.2, now + i * 0.04);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + i * 0.04);
          osc.stop(now + 0.5);
        });
      } catch (e) {
        console.warn('Audio playback error', e);
      }
    },

    // Reset chime (clean click/bell)
    playClearChime() {
      if (this.isMuted) return;
      try {
        const ctx = this.getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.15);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
      } catch (e) {}
    }
  };

  // Init audio mute buttons on load
  document.addEventListener('DOMContentLoaded', () => {
    AudioManager.updateMuteButtons();
    document.querySelectorAll('.btn-mute-toggle').forEach((btn) => {
      btn.addEventListener('click', () => AudioManager.toggleMute());
    });
  });

  // Haptic feedback helper
  function triggerHaptic(duration = 60) {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(duration);
      } catch (e) {}
    }
  }

  // ============================================================================
  // 2. Socket.io Client Setup
  // ============================================================================
  const socket = typeof io === 'function' ? io() : null;

  if (!socket) {
    console.warn('Socket.io library not detected. Ensure /socket.io/socket.io.js is loaded.');
  }

  // Expose on window
  window.BuzzerApp = {
    socket,
    audio: AudioManager,
    triggerHaptic
  };

  // ============================================================================
  // 3. Landing Page Controller
  // ============================================================================
  const landingForm = document.getElementById('quick-join-form');
  if (landingForm) {
    landingForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const codeInput = document.getElementById('quick-room-code');
      const code = (codeInput ? codeInput.value : '').trim().toUpperCase();
      if (code) {
        window.location.href = `/player.html?room=${encodeURIComponent(code)}`;
      }
    });
  }

  // ============================================================================
  // 4. Host Dashboard Controller
  // ============================================================================
  const hostDashboard = document.getElementById('host-dashboard-page');
  if (hostDashboard && socket) {
    let currentRoomCode = '';
    let isLocked = false;
    let autoLock = true;
    let currentBuzzes = [];

    const roomCodeEl = document.getElementById('host-room-code');
    const copyCodeBtn = document.getElementById('btn-copy-code');
    const copyLinkBtn = document.getElementById('btn-copy-link');
    const clearBuzzersBtn = document.getElementById('btn-clear-buzzers');
    const lockToggleBtn = document.getElementById('btn-lock-toggle');
    const autoLockCheckbox = document.getElementById('checkbox-auto-lock');
    const buzzerFeedList = document.getElementById('buzzer-feed-list');
    const emptyFeedEl = document.getElementById('empty-feed-placeholder');
    const playerListEl = document.getElementById('player-list-items');
    const playerCountBadge = document.getElementById('player-count-badge');
    const hostStatusAlert = document.getElementById('host-status-alert');

    function updateLockUI(locked) {
      isLocked = locked;
      if (lockToggleBtn) {
        if (isLocked) {
          lockToggleBtn.textContent = '🔓 Unlock Buzzers';
          lockToggleBtn.className = 'btn btn-green';
        } else {
          lockToggleBtn.textContent = '🔒 Lock Buzzers';
          lockToggleBtn.className = 'btn btn-red';
        }
      }
    }

    function renderBuzzerFeed(buzzes) {
      currentBuzzes = buzzes || [];
      if (!buzzerFeedList) return;

      if (currentBuzzes.length === 0) {
        buzzerFeedList.innerHTML = '';
        if (emptyFeedEl) emptyFeedEl.style.display = 'flex';
        return;
      }

      if (emptyFeedEl) emptyFeedEl.style.display = 'none';

      buzzerFeedList.innerHTML = currentBuzzes
        .map((b, index) => {
          const isFirst = index === 0;
          const rankText = isFirst ? '🥇' : `#${index + 1}`;
          const timeText = isFirst
            ? 'FIRST (0.000s)'
            : `+${(b.deltaMs / 1000).toFixed(3)}s`;

          return `
          <div class="buzzer-item ${isFirst ? 'first-place' : ''}">
            <div class="buzzer-left">
              <div class="rank-badge">${rankText}</div>
              <div class="buzzer-name">${escapeHtml(b.name)}</div>
            </div>
            <div class="buzzer-time">${timeText}</div>
          </div>
        `;
        })
        .join('');
    }

    function renderPlayerList(players) {
      const list = players || [];
      if (playerCountBadge) playerCountBadge.textContent = list.length;
      if (!playerListEl) return;

      if (list.length === 0) {
        playerListEl.innerHTML = '<div style="color: var(--text-muted); font-size: 0.9rem; text-align: center; padding: 1rem 0;">No players in room yet</div>';
        return;
      }

      playerListEl.innerHTML = list
        .map((player) => {
          const initial = (player.name || 'P').charAt(0).toUpperCase();
          const hasBuzzed = currentBuzzes.some((b) => b.id === player.id);
          const statusIcon = hasBuzzed ? '🔴' : '🟢';

          return `
          <div class="player-item" data-id="${player.id}">
            <div class="player-left">
              <div class="player-avatar">${initial}</div>
              <span class="player-list-name">${escapeHtml(player.name)}</span>
              <span title="${hasBuzzed ? 'Buzzed' : 'Ready'}" style="font-size: 0.8rem;">${statusIcon}</span>
            </div>
            <button class="btn-kick" title="Kick player" data-id="${player.id}">✕</button>
          </div>
        `;
        })
        .join('');

      // Add kick listeners
      playerListEl.querySelectorAll('.btn-kick').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const playerId = e.currentTarget.getAttribute('data-id');
          if (playerId && confirm('Remove this player from the room?')) {
            socket.emit('kickPlayer', { roomCode: currentRoomCode, playerId });
          }
        });
      });
    }

    // 1. Initialize or Create Room on load
    socket.emit('createRoom', {}, (res) => {
      if (res && res.success) {
        currentRoomCode = res.room.roomCode;
        if (roomCodeEl) roomCodeEl.textContent = currentRoomCode;
        updateLockUI(res.room.locked);
        if (autoLockCheckbox) autoLockCheckbox.checked = res.room.autoLock;
      }
    });

    socket.on('roomCreated', (room) => {
      currentRoomCode = room.roomCode;
      if (roomCodeEl) roomCodeEl.textContent = currentRoomCode;
      updateLockUI(room.locked);
      if (autoLockCheckbox) autoLockCheckbox.checked = room.autoLock;
    });

    // 2. Real-time buzz received
    socket.on('playerBuzzed', (data) => {
      AudioManager.getAudioContext();
      if (data.isFirst) {
        AudioManager.playBuzzer();
        AudioManager.playFirstPlaceChime();
        triggerHaptic(120);
      } else {
        AudioManager.playBuzzer();
        triggerHaptic(60);
      }
      if (data.locked !== undefined) {
        updateLockUI(data.locked);
      }
    });

    // 3. Buzzer feed update
    socket.on('buzzerFeedUpdate', (buzzes) => {
      renderBuzzerFeed(buzzes);
      // Re-render players to reflect buzz indicator
      socket.emit('requestRoomState', { roomCode: currentRoomCode }, (state) => {
        if (state && state.players) renderPlayerList(state.players);
      });
    });

    // 4. Player list update
    socket.on('updatePlayerList', (players) => {
      renderPlayerList(players);
    });

    // 5. Buzzers cleared event
    socket.on('buzzersCleared', (data) => {
      AudioManager.playClearChime();
      updateLockUI(data.locked);
      renderBuzzerFeed([]);
    });

    // 6. Buzzers locked event
    socket.on('buzzersLocked', (data) => {
      updateLockUI(data.locked);
    });

    // Controls listeners
    if (clearBuzzersBtn) {
      clearBuzzersBtn.addEventListener('click', () => {
        socket.emit('clearBuzzers', { roomCode: currentRoomCode });
      });
    }

    if (lockToggleBtn) {
      lockToggleBtn.addEventListener('click', () => {
        socket.emit('lockBuzzers', { roomCode: currentRoomCode, locked: !isLocked });
      });
    }

    if (autoLockCheckbox) {
      autoLockCheckbox.addEventListener('change', (e) => {
        socket.emit('toggleAutoLock', {
          roomCode: currentRoomCode,
          autoLock: e.target.checked
        });
      });
    }

    // Copy Room Code
    if (copyCodeBtn) {
      copyCodeBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(currentRoomCode).then(() => {
          const original = copyCodeBtn.textContent;
          copyCodeBtn.textContent = 'Copied!';
          setTimeout(() => (copyCodeBtn.textContent = original), 1800);
        });
      });
    }

    // Copy Player Join Link
    if (copyLinkBtn) {
      copyLinkBtn.addEventListener('click', () => {
        const joinUrl = `${window.location.origin}/player.html?room=${currentRoomCode}`;
        navigator.clipboard.writeText(joinUrl).then(() => {
          const original = copyLinkBtn.textContent;
          copyLinkBtn.textContent = 'Link Copied!';
          setTimeout(() => (copyLinkBtn.textContent = original), 1800);
        });
      });
    }
  }

  // ============================================================================
  // 5. Player Screen Controller
  // ============================================================================
  const playerScreen = document.getElementById('player-screen-page');
  if (playerScreen && socket) {
    let currentRoomCode = '';
    let currentPlayerName = '';
    let isLocked = false;
    let hasBuzzed = false;
    let buzzPosition = null;

    const joinCard = document.getElementById('player-join-card');
    const buzzerCard = document.getElementById('player-buzzer-card');
    const joinForm = document.getElementById('player-join-form');
    const roomCodeInput = document.getElementById('player-room-code');
    const nameInput = document.getElementById('player-name');
    const joinAlert = document.getElementById('join-alert-box');

    const displayRoomCode = document.getElementById('display-room-code');
    const displayPlayerName = document.getElementById('display-player-name');
    const bigBuzzerBtn = document.getElementById('big-buzzer-btn');
    const buzzerText = document.getElementById('buzzer-text');
    const buzzerSubtext = document.getElementById('buzzer-subtext');
    const statusBanner = document.getElementById('buzzer-status-banner');
    const leaveBtn = document.getElementById('btn-leave-room');

    // Auto-fill room code from URL query param (?room=XYZ123)
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam && roomCodeInput) {
      roomCodeInput.value = roomParam.trim().toUpperCase();
      if (nameInput) nameInput.focus();
    }

    // Join Form Submit
    if (joinForm) {
      joinForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const code = (roomCodeInput ? roomCodeInput.value : '').trim().toUpperCase();
        const name = (nameInput ? nameInput.value : '').trim();

        if (!code || code.length < 3) {
          showJoinError('Please enter a valid 6-character room code.');
          return;
        }

        if (!name) {
          showJoinError('Please enter your name.');
          return;
        }

        // Initialize Web Audio on user gesture
        AudioManager.getAudioContext();

        socket.emit('joinRoom', { roomCode: code, playerName: name }, (res) => {
          if (!res || !res.success) {
            showJoinError(res?.message || 'Could not join room.');
          }
        });
      });
    }

    function showJoinError(msg) {
      if (joinAlert) {
        joinAlert.textContent = msg;
        joinAlert.classList.add('show');
      }
    }

    // Successful Join
    socket.on('roomJoined', (data) => {
      currentRoomCode = data.roomCode;
      currentPlayerName = data.playerName;
      isLocked = data.locked;
      hasBuzzed = data.hasBuzzed;

      if (displayRoomCode) displayRoomCode.textContent = currentRoomCode;
      if (displayPlayerName) displayPlayerName.textContent = currentPlayerName;

      // Switch screens
      if (joinCard) joinCard.style.display = 'none';
      if (buzzerCard) buzzerCard.style.display = 'flex';

      updateBuzzerUI();
    });

    socket.on('joinError', (data) => {
      showJoinError(data.message || 'Error joining room');
    });

    // The Buzzer Press Action
    function pressBuzzer() {
      if (isLocked || hasBuzzed) return;

      AudioManager.getAudioContext();
      triggerHaptic(80);

      // Local optimistic animation
      if (bigBuzzerBtn) bigBuzzerBtn.classList.add('is-pressed');
      setTimeout(() => {
        if (bigBuzzerBtn) bigBuzzerBtn.classList.remove('is-pressed');
      }, 150);

      // Send buzz event with client timestamp
      socket.emit('buzz', {
        roomCode: currentRoomCode,
        clientTimestamp: Date.now()
      });
    }

    if (bigBuzzerBtn) {
      bigBuzzerBtn.addEventListener('click', pressBuzzer);
      bigBuzzerBtn.addEventListener('touchstart', (e) => {
        // Prevent default double-tap zoom
        pressBuzzer();
      }, { passive: true });
    }

    // Spacebar & Enter Key Trigger for Desktop Players
    window.addEventListener('keydown', (e) => {
      if (buzzerCard && buzzerCard.style.display !== 'none') {
        if (e.code === 'Space' || e.key === ' ' || e.code === 'Enter') {
          e.preventDefault();
          pressBuzzer();
        }
      }
    });

    // Buzz Confirmed
    socket.on('playerBuzzed', (data) => {
      if (data.player.id === socket.id) {
        hasBuzzed = true;
        buzzPosition = data.position;

        if (data.isFirst) {
          AudioManager.playFirstPlaceChime();
        } else {
          AudioManager.playBuzzer();
        }
      } else {
        // Someone else buzzed
        if (data.isFirst) {
          AudioManager.playBuzzer();
        }
      }

      if (data.locked !== undefined) {
        isLocked = data.locked;
      }

      updateBuzzerUI(data);
    });

    // Buzzers cleared by host
    socket.on('buzzersCleared', (data) => {
      hasBuzzed = false;
      buzzPosition = null;
      isLocked = data.locked;
      AudioManager.playClearChime();
      triggerHaptic(40);
      updateBuzzerUI();
    });

    // Buzzers locked/unlocked
    socket.on('buzzersLocked', (data) => {
      isLocked = data.locked;
      updateBuzzerUI();
    });

    // Kicked by host
    socket.on('kicked', (data) => {
      alert(data.message || 'You have been removed from the room.');
      window.location.href = '/player.html';
    });

    // Host left
    socket.on('hostDisconnected', (data) => {
      alert(data.message || 'The host has closed the room.');
      window.location.href = '/';
    });

    // Update Buzzer Appearance
    function updateBuzzerUI(lastBuzzData) {
      if (!bigBuzzerBtn) return;

      // Reset state classes
      bigBuzzerBtn.classList.remove('state-locked', 'state-buzzed', 'is-first');

      if (hasBuzzed) {
        // Player has pressed the buzzer
        bigBuzzerBtn.classList.add('state-buzzed');
        if (buzzPosition === 1) {
          bigBuzzerBtn.classList.add('is-first');
          if (buzzerText) buzzerText.textContent = '1ST!';
          if (buzzerSubtext) buzzerSubtext.textContent = 'YOU BUZZED FIRST';
          if (statusBanner) {
            statusBanner.innerHTML = '<span class="status-message highlight-first">🎉 You were #1! First to buzz in!</span>';
          }
        } else {
          if (buzzerText) buzzerText.textContent = `#${buzzPosition || ''}`;
          if (buzzerSubtext) buzzerSubtext.textContent = 'BUZZED IN';
          if (statusBanner) {
            statusBanner.innerHTML = `<span class="status-message">Position #${buzzPosition} - Waiting for host reset</span>`;
          }
        }
      } else if (isLocked) {
        // Buzzer is locked by host or auto-locked
        bigBuzzerBtn.classList.add('state-locked');
        if (buzzerText) buzzerText.textContent = 'LOCKED';
        if (buzzerSubtext) buzzerSubtext.textContent = 'WAIT FOR HOST';

        if (statusBanner) {
          if (lastBuzzData && lastBuzzData.isFirst) {
            statusBanner.innerHTML = `<span class="status-message highlight-locked">🔒 ${escapeHtml(lastBuzzData.player.name)} buzzed in first!</span>`;
          } else {
            statusBanner.innerHTML = '<span class="status-message highlight-locked">🔒 Buzzers are locked</span>';
          }
        }
      } else {
        // Active and ready
        if (buzzerText) buzzerText.textContent = 'BUZZ!';
        if (buzzerSubtext) buzzerSubtext.textContent = 'TAP OR PRESS SPACE';
        if (statusBanner) {
          statusBanner.innerHTML = '<span class="status-message" style="color: var(--green-hover);">🟢 Ready! Tap to buzz in</span>';
        }
      }
    }

    if (leaveBtn) {
      leaveBtn.addEventListener('click', () => {
        if (confirm('Leave this room?')) {
          window.location.href = '/';
        }
      });
    }
  }

  // Helper: Escape HTML
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
})();
