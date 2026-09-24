/**
 * buzzin.live - Real-Time Game Show Buzzer
 * Modern, accessible, tactile UI with direct play, host control, and interactive multi-client simulator.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2,
  VolumeX,
  Users,
  Zap,
  RotateCcw,
  Lock,
  Unlock,
  Copy,
  Check,
  Smartphone,
  Crown,
  Play,
  Share2,
  Tv,
  ArrowRight,
  ShieldCheck,
  Sliders,
  Sparkles,
  UserX,
  Keyboard,
  Info,
  ExternalLink
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';

interface BuzzItem {
  id: string;
  name: string;
  timestamp: number;
  deltaMs: number;
}

interface PlayerItem {
  id: string;
  name: string;
}

export default function App() {
  // Navigation / Tabs: 'play' (Direct Player), 'host' (Full Host Dashboard), 'simulator' (All-in-One Multi-Player Playground)
  const [activeTab, setActiveTab] = useState<'play' | 'host' | 'simulator'>('simulator');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    return localStorage.getItem('buzzin_muted') !== 'true';
  });

  // ==========================================
  // Audio Synthesizer (Zero External Dependencies)
  // ==========================================
  const playSound = (type: 'buzz' | 'first' | 'clear' | 'lock') => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      if (type === 'buzz') {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(175, now);
        osc1.frequency.exponentialRampToValueAtTime(140, now + 0.3);
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(180, now);
        osc2.frequency.exponentialRampToValueAtTime(145, now + 0.3);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.3);
        osc2.stop(now + 0.3);
      } else if (type === 'first') {
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.05);
          gain.gain.setValueAtTime(0.25, now + idx * 0.05);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.05);
          osc.stop(now + 0.5);
        });
      } else if (type === 'clear') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.16);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.16);
      } else if (type === 'lock') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.14);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.14);
      }
    } catch {
      // Audio fallback silent
    }
  };

  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      localStorage.setItem('buzzin_muted', String(!next));
      return next;
    });
  };

  // ==========================================
  // 1. Live Simulator (Host + 2 Players side-by-side)
  // ==========================================
  const [simRoomCode, setSimRoomCode] = useState<string>('');
  const [simLocked, setSimLocked] = useState<boolean>(false);
  const [simAutoLock, setSimAutoLock] = useState<boolean>(true);
  const [simBuzzes, setSimBuzzes] = useState<BuzzItem[]>([]);
  const [simPlayers, setSimPlayers] = useState<PlayerItem[]>([]);
  const [copiedSimCode, setCopiedSimCode] = useState(false);

  const simHostSocket = useRef<Socket | null>(null);
  const simP1Socket = useRef<Socket | null>(null);
  const simP2Socket = useRef<Socket | null>(null);

  const [p1Name, setP1Name] = useState('Alice');
  const [p2Name, setP2Name] = useState('Bob');
  const [p1Buzzed, setP1Buzzed] = useState(false);
  const [p2Buzzed, setP2Buzzed] = useState(false);

  const initSimulator = () => {
    simHostSocket.current?.disconnect();
    simP1Socket.current?.disconnect();
    simP2Socket.current?.disconnect();

    setP1Buzzed(false);
    setP2Buzzed(false);
    setSimBuzzes([]);

    const hostSock = io();
    simHostSocket.current = hostSock;

    hostSock.on('connect', () => {
      hostSock.emit('createRoom', {}, (res: any) => {
        if (res && res.success) {
          const code = res.room.roomCode;
          setSimRoomCode(code);
          setSimLocked(res.room.locked);
          setSimAutoLock(res.room.autoLock);

          // Player 1
          const p1Sock = io();
          simP1Socket.current = p1Sock;
          p1Sock.on('connect', () => {
            p1Sock.emit('joinRoom', { roomCode: code, playerName: p1Name });
          });

          // Player 2
          const p2Sock = io();
          simP2Socket.current = p2Sock;
          p2Sock.on('connect', () => {
            p2Sock.emit('joinRoom', { roomCode: code, playerName: p2Name });
          });

          p1Sock.on('playerBuzzed', (data: any) => {
            if (data.player.name === p1Name) setP1Buzzed(true);
            if (data.locked !== undefined) setSimLocked(data.locked);
          });
          p1Sock.on('buzzersCleared', () => {
            setP1Buzzed(false);
            setSimLocked(false);
          });
          p1Sock.on('buzzersLocked', (d: any) => setSimLocked(d.locked));

          p2Sock.on('playerBuzzed', (data: any) => {
            if (data.player.name === p2Name) setP2Buzzed(true);
            if (data.locked !== undefined) setSimLocked(data.locked);
          });
          p2Sock.on('buzzersCleared', () => {
            setP2Buzzed(false);
            setSimLocked(false);
          });
          p2Sock.on('buzzersLocked', (d: any) => setSimLocked(d.locked));
        }
      });
    });

    hostSock.on('updatePlayerList', (players: PlayerItem[]) => {
      setSimPlayers(players);
    });

    hostSock.on('buzzerFeedUpdate', (buzzes: BuzzItem[]) => {
      setSimBuzzes(buzzes);
    });

    hostSock.on('playerBuzzed', (data: any) => {
      if (data.isFirst) {
        playSound('first');
      } else {
        playSound('buzz');
      }
      if (data.locked !== undefined) setSimLocked(data.locked);
    });

    hostSock.on('buzzersCleared', (data: any) => {
      playSound('clear');
      setSimLocked(data.locked);
      setP1Buzzed(false);
      setP2Buzzed(false);
      setSimBuzzes([]);
    });

    hostSock.on('buzzersLocked', (data: any) => {
      playSound('lock');
      setSimLocked(data.locked);
    });
  };

  useEffect(() => {
    initSimulator();
    return () => {
      simHostSocket.current?.disconnect();
      simP1Socket.current?.disconnect();
      simP2Socket.current?.disconnect();
    };
  }, []);

  const handleSimClear = () => {
    if (simHostSocket.current && simRoomCode) {
      simHostSocket.current.emit('clearBuzzers', { roomCode: simRoomCode });
    }
  };

  const handleSimToggleLock = () => {
    if (simHostSocket.current && simRoomCode) {
      simHostSocket.current.emit('lockBuzzers', { roomCode: simRoomCode, locked: !simLocked });
    }
  };

  const handleSimAutoLockToggle = () => {
    if (simHostSocket.current && simRoomCode) {
      const next = !simAutoLock;
      setSimAutoLock(next);
      simHostSocket.current.emit('toggleAutoLock', { roomCode: simRoomCode, autoLock: next });
    }
  };

  const handleSimBuzz = (playerNum: 1 | 2) => {
    if (simLocked) return;
    if (playerNum === 1 && !p1Buzzed && simP1Socket.current) {
      simP1Socket.current.emit('buzz', { roomCode: simRoomCode });
    } else if (playerNum === 2 && !p2Buzzed && simP2Socket.current) {
      simP2Socket.current.emit('buzz', { roomCode: simRoomCode });
    }
  };

  // Keyboard shortcut for simulator: '1' or 'q' for Player 1, '2' or 'p' for Player 2, 'c' for clear
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (activeTab === 'simulator') {
        if (e.key === '1' || e.key.toLowerCase() === 'a') {
          e.preventDefault();
          handleSimBuzz(1);
        } else if (e.key === '2' || e.key.toLowerCase() === 'l') {
          e.preventDefault();
          handleSimBuzz(2);
        } else if (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'r') {
          e.preventDefault();
          handleSimClear();
        } else if (e.key.toLowerCase() === ' ') {
          e.preventDefault();
          handleSimClear();
        }
      } else if (activeTab === 'play') {
        if (e.code === 'Space' || e.key === 'Enter') {
          e.preventDefault();
          handleDirectPlayerBuzz();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, simLocked, p1Buzzed, p2Buzzed, simRoomCode]);

  // ==========================================
  // 2. Direct Player Mode
  // ==========================================
  const [playerJoined, setPlayerJoined] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinNameInput, setJoinNameInput] = useState('');
  const [joinError, setJoinError] = useState('');
  const [playerRoomCode, setPlayerRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [playerLocked, setPlayerLocked] = useState(false);
  const [playerHasBuzzed, setPlayerHasBuzzed] = useState(false);
  const [playerBuzzRank, setPlayerBuzzRank] = useState<number | null>(null);
  const [playerBuzzStatus, setPlayerBuzzStatus] = useState<string>('Ready! Tap to buzz in');
  const directPlayerSocket = useRef<Socket | null>(null);

  const handleJoinGame = (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCodeInput.trim().toUpperCase();
    const name = joinNameInput.trim();

    if (!code || code.length < 3) {
      setJoinError('Please enter a valid room code.');
      return;
    }
    if (!name) {
      setJoinError('Please enter your name or team name.');
      return;
    }

    setJoinError('');
    directPlayerSocket.current?.disconnect();

    const sock = io();
    directPlayerSocket.current = sock;

    sock.on('connect', () => {
      sock.emit('joinRoom', { roomCode: code, playerName: name }, (res: any) => {
        if (!res || !res.success) {
          setJoinError(res?.message || 'Failed to join. Please check the code.');
        } else {
          setPlayerJoined(true);
          setPlayerRoomCode(res.roomCode);
          setPlayerName(res.playerName);
          setPlayerLocked(res.locked);
          setPlayerHasBuzzed(res.hasBuzzed);
        }
      });
    });

    sock.on('roomJoined', (data: any) => {
      setPlayerJoined(true);
      setPlayerRoomCode(data.roomCode);
      setPlayerName(data.playerName);
      setPlayerLocked(data.locked);
      setPlayerHasBuzzed(data.hasBuzzed);
    });

    sock.on('joinError', (data: any) => {
      setJoinError(data.message || 'Error joining room');
    });

    sock.on('playerBuzzed', (data: any) => {
      if (data.player.id === sock.id) {
        setPlayerHasBuzzed(true);
        setPlayerBuzzRank(data.position);
        if (data.isFirst) {
          playSound('first');
          setPlayerBuzzStatus('🎉 #1 FIRST! You were the first to buzz in!');
        } else {
          playSound('buzz');
          setPlayerBuzzStatus(`Position #${data.position} in queue`);
        }
      } else {
        if (data.isFirst) {
          playSound('buzz');
          setPlayerBuzzStatus(`🔒 ${data.player.name} buzzed in first!`);
        }
      }
      if (data.locked !== undefined) setPlayerLocked(data.locked);
    });

    sock.on('buzzersCleared', (data: any) => {
      playSound('clear');
      setPlayerHasBuzzed(false);
      setPlayerBuzzRank(null);
      setPlayerLocked(data.locked);
      setPlayerBuzzStatus('Ready! Tap to buzz in');
    });

    sock.on('buzzersLocked', (data: any) => {
      playSound('lock');
      setPlayerLocked(data.locked);
      if (data.locked && !playerHasBuzzed) {
        setPlayerBuzzStatus('Buzzers are currently locked by the host');
      } else if (!data.locked && !playerHasBuzzed) {
        setPlayerBuzzStatus('Ready! Tap to buzz in');
      }
    });

    sock.on('kicked', () => {
      alert('You have been removed from the room.');
      setPlayerJoined(false);
    });

    sock.on('hostDisconnected', () => {
      alert('The host has ended this room.');
      setPlayerJoined(false);
    });
  };

  const handleDirectPlayerBuzz = () => {
    if (playerLocked || playerHasBuzzed) return;
    if (directPlayerSocket.current && playerRoomCode) {
      directPlayerSocket.current.emit('buzz', { roomCode: playerRoomCode });
    }
  };

  const handleLeaveRoom = () => {
    directPlayerSocket.current?.disconnect();
    setPlayerJoined(false);
    setPlayerRoomCode('');
    setPlayerHasBuzzed(false);
    setPlayerBuzzRank(null);
  };

  // ==========================================
  // 3. Direct Host Mode
  // ==========================================
  const [hostCreated, setHostCreated] = useState(false);
  const [hostRoomCode, setHostRoomCode] = useState('');
  const [hostLocked, setHostLocked] = useState(false);
  const [hostAutoLock, setHostAutoLock] = useState(true);
  const [hostBuzzes, setHostBuzzes] = useState<BuzzItem[]>([]);
  const [hostPlayers, setHostPlayers] = useState<PlayerItem[]>([]);
  const [copiedHostCode, setCopiedHostCode] = useState(false);
  const directHostSocket = useRef<Socket | null>(null);

  const handleCreateHostRoom = () => {
    directHostSocket.current?.disconnect();
    const sock = io();
    directHostSocket.current = sock;

    sock.on('connect', () => {
      sock.emit('createRoom', {}, (res: any) => {
        if (res && res.success) {
          setHostCreated(true);
          setHostRoomCode(res.room.roomCode);
          setHostLocked(res.room.locked);
          setHostAutoLock(res.room.autoLock);
        }
      });
    });

    sock.on('updatePlayerList', (players: PlayerItem[]) => {
      setHostPlayers(players);
    });

    sock.on('buzzerFeedUpdate', (buzzes: BuzzItem[]) => {
      setHostBuzzes(buzzes);
    });

    sock.on('playerBuzzed', (data: any) => {
      if (data.isFirst) playSound('first');
      else playSound('buzz');
      if (data.locked !== undefined) setHostLocked(data.locked);
    });

    sock.on('buzzersCleared', (data: any) => {
      playSound('clear');
      setHostLocked(data.locked);
      setHostBuzzes([]);
    });

    sock.on('buzzersLocked', (data: any) => {
      playSound('lock');
      setHostLocked(data.locked);
    });
  };

  const handleHostClear = () => {
    if (directHostSocket.current && hostRoomCode) {
      directHostSocket.current.emit('clearBuzzers', { roomCode: hostRoomCode });
    }
  };

  const handleHostToggleLock = () => {
    if (directHostSocket.current && hostRoomCode) {
      directHostSocket.current.emit('lockBuzzers', { roomCode: hostRoomCode, locked: !hostLocked });
    }
  };

  const handleHostAutoLockToggle = () => {
    if (directHostSocket.current && hostRoomCode) {
      const next = !hostAutoLock;
      setHostAutoLock(next);
      directHostSocket.current.emit('toggleAutoLock', { roomCode: hostRoomCode, autoLock: next });
    }
  };

  const handleKickPlayer = (playerId: string) => {
    if (directHostSocket.current && hostRoomCode) {
      directHostSocket.current.emit('kickPlayer', { roomCode: hostRoomCode, playerId });
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-white">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50 px-4 sm:px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Zap className="w-5 h-5 text-slate-950 fill-slate-950" />
            </div>
            <div>
              <div className="text-xl font-extrabold tracking-tight text-white flex items-center">
                Game Buzzer
              </div>
              <div className="text-2xs text-slate-400 font-medium">Real-Time Precision Synchronization</div>
            </div>
          </div>

          {/* Center Mode Switcher Tabs */}
          <nav className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 gap-1">
            <button
              onClick={() => setActiveTab('simulator')}
              className={`px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'simulator'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Tv className="w-4 h-4" />
              <span>Simulator</span>
            </button>
            <button
              onClick={() => setActiveTab('play')}
              className={`px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'play'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Smartphone className="w-4 h-4" />
              <span>Player Buzzer</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('host');
                if (!hostCreated) handleCreateHostRoom();
              }}
              className={`px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'host'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm font-bold'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Crown className="w-4 h-4" />
              <span>Host Controls</span>
            </button>
          </nav>

          {/* Right Action Icons */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSound}
              className="w-9 h-9 rounded-lg border border-slate-800 bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors flex items-center justify-center"
              title={soundEnabled ? 'Mute Audio' : 'Unmute Audio'}
              aria-label="Toggle Sound"
            >
              {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
            </button>
            <a
              href="/host.html"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Open standalone host in separate window"
            >
              <span>Host Window</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </header>

      {/* Main View Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 flex flex-col justify-start">
        {/* ========================================================= */}
        {/* TAB 1: ALL-IN-ONE REAL-TIME MULTI-USER SIMULATOR          */}
        {/* ========================================================= */}
        {activeTab === 'simulator' && (
          <div className="space-y-6">
            {/* Quick Interactive Overview Header */}
            <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Live Multi-Client Sync</span>
                  <span className="text-slate-600">·</span>
                  <span className="text-xs text-slate-400">1 Host + 2 Players Active on WebSockets</span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                  Millisecond Precision Buzzer Simulator
                </h1>
                <p className="text-sm text-slate-400 mt-1 max-w-2xl">
                  Test buzzer synchronization in real-time. Click either player buzzer below to test split-millisecond ranking, automatic locking, and host resets.
                </p>
              </div>

              <div className="flex items-center gap-2 self-start md:self-auto">
                <button
                  onClick={initSimulator}
                  className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-xs"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Restart Session</span>
                </button>
              </div>
            </div>

            {/* Main Split Grid: Host Console (7 cols) + Simulated Players (5 cols) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* Left Column: Host Console */}
              <div className="lg:col-span-7 bg-slate-950 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-col justify-between">
                <div>
                  {/* Host Header */}
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-4 mb-5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center font-black text-xs">
                        H
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-white tracking-wide">HOST CONTROLLER</h2>
                        <p className="text-2xs text-slate-400">Authoritative Server State</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Users className="w-3.5 h-3.5 text-slate-500" />
                      <span>{simPlayers.length} connected</span>
                    </div>
                  </div>

                  {/* Room Code Banner */}
                  <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex items-center justify-between mb-5">
                    <div>
                      <span className="text-2xs font-bold uppercase tracking-wider text-slate-400 block mb-1">
                        Active Room Code
                      </span>
                      <span className="font-mono text-3xl sm:text-4xl font-black tracking-widest text-emerald-400 drop-shadow-sm">
                        {simRoomCode || '------'}
                      </span>
                    </div>

                    <button
                      onClick={() => {
                        if (simRoomCode) {
                          navigator.clipboard.writeText(simRoomCode);
                          setCopiedSimCode(true);
                          setTimeout(() => setCopiedSimCode(false), 1600);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                    >
                      {copiedSimCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedSimCode ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>

                  {/* Host Action Buttons */}
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    <button
                      onClick={handleSimClear}
                      className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:translate-y-0.5 text-slate-950 font-black py-3 px-4 rounded-xl shadow-lg shadow-emerald-900/30 transition-all text-sm tracking-wide"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Clear Buzzers (Space)</span>
                    </button>

                    <button
                      onClick={handleSimToggleLock}
                      className={`inline-flex items-center justify-center gap-2 font-bold py-3 px-4 rounded-xl shadow-lg transition-all text-sm tracking-wide ${
                        simLocked
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
                          : 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
                      }`}
                    >
                      {simLocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                      <span>{simLocked ? 'Unlock Buzzers' : 'Lock Buzzers'}</span>
                    </button>
                  </div>

                  {/* Auto-Lock Settings Row */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 mb-6">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <div>
                        <div className="text-xs font-bold text-slate-200">Auto-Lock on First Buzz</div>
                        <div className="text-2xs text-slate-400">Instantly locks other players out when first player buzzes</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleSimAutoLockToggle}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        simAutoLock ? 'bg-emerald-500' : 'bg-slate-700'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-slate-950 transition-transform ${
                          simAutoLock ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Buzzer Feed Section */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                          Chronological Buzzer Feed
                        </span>
                      </div>
                      <span className="text-2xs font-mono text-slate-400">Accurate to 1ms</span>
                    </div>

                    <div className="space-y-2.5 min-h-[200px] bg-slate-900/80 rounded-xl p-3.5 border border-slate-800/80 flex flex-col justify-start">
                      {simBuzzes.length === 0 ? (
                        <div className="my-auto py-8 text-center flex flex-col items-center justify-center">
                          <div className="w-12 h-12 rounded-full bg-slate-800/80 text-slate-500 flex items-center justify-center mb-2">
                            <Zap className="w-5 h-5 text-slate-500" />
                          </div>
                          <p className="text-sm font-semibold text-slate-300">Awaiting player buzzers...</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Tap either player buzzer on the right or press <kbd className="bg-slate-800 px-1 py-0.5 rounded text-2xs text-slate-300">1</kbd> / <kbd className="bg-slate-800 px-1 py-0.5 rounded text-2xs text-slate-300">2</kbd>
                          </p>
                        </div>
                      ) : (
                        simBuzzes.map((item, index) => {
                          const isFirst = index === 0;
                          return (
                            <div
                              key={item.id + index}
                              className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                                isFirst
                                  ? 'bg-gradient-to-r from-emerald-950/80 to-slate-900 border-emerald-500/50 shadow-md shadow-emerald-950/30'
                                  : 'bg-slate-900 border-slate-800'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div
                                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${
                                    isFirst
                                      ? 'bg-emerald-500 text-slate-950 shadow-sm'
                                      : 'bg-slate-800 text-slate-400'
                                  }`}
                                >
                                  {isFirst ? '🥇' : index + 1}
                                </div>
                                <span className={`font-bold text-sm ${isFirst ? 'text-emerald-300' : 'text-slate-200'}`}>
                                  {item.name}
                                </span>
                              </div>

                              <span
                                className={`font-mono text-xs font-bold ${
                                  isFirst ? 'text-emerald-400' : 'text-slate-400'
                                }`}
                              >
                                {isFirst ? 'FIRST (0.000s)' : `+${(item.deltaMs / 1000).toFixed(3)}s`}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Keyboard Guide */}
                <div className="mt-5 pt-3 border-t border-slate-800/80 flex items-center justify-between text-2xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <Keyboard className="w-3.5 h-3.5 text-slate-500" />
                    <span>Keys: <kbd className="bg-slate-800 px-1 rounded text-slate-300">1</kbd> Player 1 · <kbd className="bg-slate-800 px-1 rounded text-slate-300">2</kbd> Player 2 · <kbd className="bg-slate-800 px-1 rounded text-slate-300">Space</kbd> Clear</span>
                  </div>
                  <span className="text-emerald-400 font-semibold">● Socket Connected</span>
                </div>
              </div>

              {/* Right Column: Simulated Player Buzzers */}
              <div className="lg:col-span-5 flex flex-col gap-5">
                
                {/* Simulated Player 1 */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800/80">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-black text-xs">
                        A
                      </div>
                      <div>
                        <span className="text-sm font-bold text-white block">{p1Name}</span>
                        <span className="text-2xs text-slate-400">Simulated Participant 1</span>
                      </div>
                    </div>
                    <span className="text-2xs font-mono font-bold px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-400">
                      Key: 1
                    </span>
                  </div>

                  {/* Player 1 Tactile Buzzer Button */}
                  <div className="py-2 flex flex-col items-center">
                    <button
                      onClick={() => handleSimBuzz(1)}
                      disabled={simLocked || p1Buzzed}
                      className={`w-36 h-36 rounded-full font-black text-2xl tracking-wider transition-all transform active:scale-95 flex flex-col items-center justify-center cursor-pointer select-none shadow-2xl relative ${
                        p1Buzzed
                          ? simBuzzes[0]?.name === p1Name
                            ? 'bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 text-slate-950 ring-4 ring-emerald-400/50 shadow-emerald-500/40'
                            : 'bg-gradient-to-br from-amber-500 to-amber-600 text-slate-950 ring-2 ring-amber-400'
                          : simLocked
                          ? 'bg-gradient-to-br from-red-600 to-red-800 text-white cursor-not-allowed opacity-90 ring-2 ring-red-500/30'
                          : 'bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 text-slate-950 hover:brightness-110 active:translate-y-1 shadow-emerald-600/30 ring-4 ring-emerald-500/20'
                      }`}
                    >
                      <span className="drop-shadow-xs">
                        {p1Buzzed ? (simBuzzes[0]?.name === p1Name ? '1ST!' : 'BUZZED') : simLocked ? 'LOCKED' : 'BUZZ!'}
                      </span>
                      <span className="text-2xs font-bold tracking-tight opacity-90 mt-1 uppercase">
                        {p1Buzzed
                          ? simBuzzes[0]?.name === p1Name
                            ? '🥇 In First'
                            : 'In Queue'
                          : simLocked
                          ? 'Wait For Host'
                          : 'Tap to Buzz'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Simulated Player 2 */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-800/80">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-400 flex items-center justify-center font-black text-xs">
                        B
                      </div>
                      <div>
                        <span className="text-sm font-bold text-white block">{p2Name}</span>
                        <span className="text-2xs text-slate-400">Simulated Participant 2</span>
                      </div>
                    </div>
                    <span className="text-2xs font-mono font-bold px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-400">
                      Key: 2
                    </span>
                  </div>

                  {/* Player 2 Tactile Buzzer Button */}
                  <div className="py-2 flex flex-col items-center">
                    <button
                      onClick={() => handleSimBuzz(2)}
                      disabled={simLocked || p2Buzzed}
                      className={`w-36 h-36 rounded-full font-black text-2xl tracking-wider transition-all transform active:scale-95 flex flex-col items-center justify-center cursor-pointer select-none shadow-2xl relative ${
                        p2Buzzed
                          ? simBuzzes[0]?.name === p2Name
                            ? 'bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 text-slate-950 ring-4 ring-emerald-400/50 shadow-emerald-500/40'
                            : 'bg-gradient-to-br from-amber-500 to-amber-600 text-slate-950 ring-2 ring-amber-400'
                          : simLocked
                          ? 'bg-gradient-to-br from-red-600 to-red-800 text-white cursor-not-allowed opacity-90 ring-2 ring-red-500/30'
                          : 'bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 text-slate-950 hover:brightness-110 active:translate-y-1 shadow-emerald-600/30 ring-4 ring-emerald-500/20'
                      }`}
                    >
                      <span className="drop-shadow-xs">
                        {p2Buzzed ? (simBuzzes[0]?.name === p2Name ? '1ST!' : 'BUZZED') : simLocked ? 'LOCKED' : 'BUZZ!'}
                      </span>
                      <span className="text-2xs font-bold tracking-tight opacity-90 mt-1 uppercase">
                        {p2Buzzed
                          ? simBuzzes[0]?.name === p2Name
                            ? '🥇 In First'
                            : 'In Queue'
                          : simLocked
                          ? 'Wait For Host'
                          : 'Tap to Buzz'}
                      </span>
                    </button>
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: DEDICATED PLAYER BUZZER VIEW                       */}
        {/* ========================================================= */}
        {activeTab === 'play' && (
          <div className="max-w-md w-full mx-auto my-auto py-6">
            {!playerJoined ? (
              /* Join Screen Form */
              <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
                <div className="text-center mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto mb-3">
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight text-white">Join Game</h2>
                  <p className="text-xs text-slate-400 mt-1">Enter your room code and display name to buzz in.</p>
                </div>

                {joinError && (
                  <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-medium p-3 rounded-xl mb-4 text-center">
                    {joinError}
                  </div>
                )}

                <form onSubmit={handleJoinGame} className="space-y-4">
                  <div>
                    <label className="block text-2xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      6-Character Room Code
                    </label>
                    <input
                      type="text"
                      value={joinCodeInput}
                      onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                      placeholder={simRoomCode || 'ROOM CODE'}
                      maxLength={6}
                      className="w-full text-center tracking-widest font-mono text-2xl font-black py-3 px-4 rounded-xl bg-slate-900 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors uppercase"
                      required
                    />
                    {simRoomCode && (
                      <button
                        type="button"
                        onClick={() => setJoinCodeInput(simRoomCode)}
                        className="text-2xs text-emerald-400 hover:text-emerald-300 mt-1.5 block font-semibold"
                      >
                        Autofill current room: {simRoomCode}
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-2xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      Your Name or Team
                    </label>
                    <input
                      type="text"
                      value={joinNameInput}
                      onChange={(e) => setJoinNameInput(e.target.value)}
                      placeholder="e.g. Alex or Team Rocket"
                      maxLength={24}
                      className="w-full text-base font-semibold py-3 px-4 rounded-xl bg-slate-900 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 active:translate-y-0.5 text-slate-950 font-black py-3.5 px-6 rounded-xl transition-all shadow-lg shadow-emerald-950/40 text-sm tracking-wide mt-2"
                  >
                    Join Buzzer Room
                  </button>
                </form>
              </div>
            ) : (
              /* Joined Buzzer Interface */
              <div className="flex flex-col items-center">
                {/* Top Info Bar */}
                <div className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center justify-between mb-8 shadow-xl">
                  <div>
                    <span className="text-2xs font-bold uppercase tracking-wider text-slate-400 block">Room</span>
                    <span className="font-mono text-base font-black text-emerald-400 tracking-wider">
                      {playerRoomCode}
                    </span>
                  </div>

                  <div className="text-center">
                    <span className="text-2xs font-bold uppercase tracking-wider text-slate-400 block">Player</span>
                    <span className="text-base font-bold text-white">{playerName}</span>
                  </div>

                  <button
                    onClick={handleLeaveRoom}
                    className="text-xs font-semibold text-slate-400 hover:text-red-400 transition-colors"
                  >
                    Leave
                  </button>
                </div>

                {/* Massive Player Buzzer Button */}
                <div className="my-8">
                  <button
                    onClick={handleDirectPlayerBuzz}
                    disabled={playerLocked || playerHasBuzzed}
                    className={`w-64 h-64 rounded-full font-black text-3xl tracking-wider transition-all transform active:scale-95 flex flex-col items-center justify-center cursor-pointer select-none shadow-2xl relative ${
                      playerHasBuzzed
                        ? playerBuzzRank === 1
                          ? 'bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 text-slate-950 ring-8 ring-emerald-400/40 shadow-emerald-500/50'
                          : 'bg-gradient-to-br from-amber-500 to-amber-600 text-slate-950 ring-4 ring-amber-400'
                        : playerLocked
                        ? 'bg-gradient-to-br from-red-600 to-red-800 text-white cursor-not-allowed opacity-90 ring-4 ring-red-500/30'
                        : 'bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 text-slate-950 hover:brightness-110 active:translate-y-2 shadow-emerald-600/40 ring-8 ring-emerald-500/20'
                    }`}
                  >
                    <span className="drop-shadow-xs">
                      {playerHasBuzzed
                        ? playerBuzzRank === 1
                          ? '1ST!'
                          : `#${playerBuzzRank || ''}`
                        : playerLocked
                        ? 'LOCKED'
                        : 'BUZZ!'}
                    </span>
                    <span className="text-xs font-bold tracking-tight opacity-90 mt-2 uppercase">
                      {playerHasBuzzed
                        ? playerBuzzRank === 1
                          ? '🥇 First to Buzz'
                          : 'Buzzed In Queue'
                        : playerLocked
                        ? 'Wait For Host'
                        : 'Tap or Spacebar'}
                    </span>
                  </button>
                </div>

                {/* Status Message Banner */}
                <div className="text-center mt-4">
                  <div
                    className={`inline-block text-sm font-bold px-4 py-2 rounded-full border ${
                      playerHasBuzzed && playerBuzzRank === 1
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : playerLocked
                        ? 'bg-red-500/20 text-red-300 border-red-500/40'
                        : 'bg-slate-950 text-slate-300 border-slate-800'
                    }`}
                  >
                    {playerBuzzStatus}
                  </div>
                  <p className="text-2xs text-slate-500 mt-3">
                    Desktop shortcut: Press <kbd className="bg-slate-800 px-1 py-0.5 rounded text-slate-300">Spacebar</kbd> or <kbd className="bg-slate-800 px-1 py-0.5 rounded text-slate-300">Enter</kbd>
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: DEDICATED HOST CONTROLS VIEW                       */}
        {/* ========================================================= */}
        {activeTab === 'host' && (
          <div className="space-y-6">
            {/* Top Bar with Room Code */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-2xs font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Host Room Code
                </span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-3xl sm:text-4xl font-black tracking-widest text-emerald-400">
                    {hostRoomCode || '------'}
                  </span>
                  <button
                    onClick={() => {
                      if (hostRoomCode) {
                        navigator.clipboard.writeText(hostRoomCode);
                        setCopiedHostCode(true);
                        setTimeout(() => setCopiedHostCode(false), 1600);
                      }
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 transition-colors"
                  >
                    {copiedHostCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedHostCode ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* Host Control Action Buttons */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleHostClear}
                  className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-slate-950 font-black py-2.5 px-5 rounded-xl shadow-lg shadow-emerald-950/30 transition-all text-sm"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Clear Buzzers</span>
                </button>

                <button
                  onClick={handleHostToggleLock}
                  className={`inline-flex items-center justify-center gap-2 font-bold py-2.5 px-4 rounded-xl shadow-lg transition-all text-sm ${
                    hostLocked
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
                      : 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
                  }`}
                >
                  {hostLocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                  <span>{hostLocked ? 'Unlock Buzzers' : 'Lock Buzzers'}</span>
                </button>

                <button
                  onClick={handleHostAutoLockToggle}
                  className={`inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl border ${
                    hostAutoLock
                      ? 'bg-slate-900 border-emerald-500/40 text-emerald-400'
                      : 'bg-slate-900 border-slate-800 text-slate-400'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Auto-Lock: {hostAutoLock ? 'ON' : 'OFF'}</span>
                </button>
              </div>
            </div>

            {/* 2-Column Host Feed & Players */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Buzzer Feed (8 cols) */}
              <div className="lg:col-span-8 bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Live Buzzer Feed</h3>
                  </div>
                  <span className="text-2xs text-slate-400">Millisecond Timestamped</span>
                </div>

                <div className="space-y-2 min-h-[220px]">
                  {hostBuzzes.length === 0 ? (
                    <div className="py-12 text-center text-slate-500 flex flex-col items-center">
                      <Zap className="w-8 h-8 text-slate-600 mb-2" />
                      <p className="text-sm font-semibold text-slate-400">No active buzzers</p>
                      <p className="text-xs text-slate-500 mt-1">Buzzes will appear in chronological arrival order</p>
                    </div>
                  ) : (
                    hostBuzzes.map((item, index) => {
                      const isFirst = index === 0;
                      return (
                        <div
                          key={item.id + index}
                          className={`flex items-center justify-between p-3.5 rounded-xl border ${
                            isFirst
                              ? 'bg-emerald-950/70 border-emerald-500/50 shadow-md'
                              : 'bg-slate-900 border-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${
                                isFirst ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {isFirst ? '🥇' : index + 1}
                            </span>
                            <span className={`font-bold text-sm ${isFirst ? 'text-emerald-300' : 'text-slate-200'}`}>
                              {item.name}
                            </span>
                          </div>

                          <span className={`font-mono text-xs font-bold ${isFirst ? 'text-emerald-400' : 'text-slate-400'}`}>
                            {isFirst ? 'FIRST (0.000s)' : `+${(item.deltaMs / 1000).toFixed(3)}s`}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Connected Players List (4 cols) */}
              <div className="lg:col-span-4 bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Connected</h3>
                  </div>
                  <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    {hostPlayers.length}
                  </span>
                </div>

                <div className="space-y-2 min-h-[220px]">
                  {hostPlayers.length === 0 ? (
                    <div className="py-12 text-center text-slate-500">
                      <p className="text-sm font-semibold text-slate-400">Waiting for players...</p>
                      <p className="text-2xs text-slate-500 mt-1">Share code: {hostRoomCode}</p>
                    </div>
                  ) : (
                    hostPlayers.map((player) => (
                      <div
                        key={player.id}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-6 h-6 rounded-full bg-slate-800 text-slate-300 text-xs font-bold flex items-center justify-center">
                            {player.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-xs font-bold text-slate-200">{player.name}</span>
                        </div>

                        <button
                          onClick={() => handleKickPlayer(player.id)}
                          className="text-slate-500 hover:text-red-400 transition-colors p-1"
                          title="Remove player"
                        >
                          <UserX className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
