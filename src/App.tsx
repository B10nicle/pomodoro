import { useState, useEffect, useCallback, useRef } from 'react';

type TimerMode = 'focus' | 'shortBreak' | 'longBreak';

interface Settings {
  focus: number;
  shortBreak: number;
  longBreak: number;
  longBreakInterval: number;
}

interface SessionLog {
  date: string;
  sessions: number;
  totalFocusSeconds: number;
}

const DEFAULT_SETTINGS: Settings = {
  focus: 25,
  shortBreak: 5,
  longBreak: 15,
  longBreakInterval: 4,
};

const MODE_LABELS: Record<TimerMode, string> = {
  focus: 'Focus',
  shortBreak: 'Short Break',
  longBreak: 'Long Break',
};

const MODE_COLORS: Record<TimerMode, { bg: string; ring: string; text: string; button: string; buttonHover: string }> = {
  focus: {
    bg: 'bg-rose-50',
    ring: 'stroke-rose-500',
    text: 'text-rose-600',
    button: 'bg-rose-500',
    buttonHover: 'hover:bg-rose-600',
  },
  shortBreak: {
    bg: 'bg-emerald-50',
    ring: 'stroke-emerald-500',
    text: 'text-emerald-600',
    button: 'bg-emerald-500',
    buttonHover: 'hover:bg-emerald-600',
  },
  longBreak: {
    bg: 'bg-blue-50',
    ring: 'stroke-blue-500',
    text: 'text-blue-600',
    button: 'bg-blue-500',
    buttonHover: 'hover:bg-blue-600',
  },
};

function getTodayKey(): string {
  return new Date().toISOString().split('T')[0];
}

function loadSettings(): Settings {
  try {
    const saved = localStorage.getItem('pomodoro-settings');
    if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
  } catch {}
  return DEFAULT_SETTINGS;
}

function loadStats(): SessionLog[] {
  try {
    const saved = localStorage.getItem('pomodoro-stats');
    if (saved) return JSON.parse(saved);
  } catch {}
  return [];
}

function saveSettings(settings: Settings) {
  localStorage.setItem('pomodoro-settings', JSON.stringify(settings));
}

function saveStats(stats: SessionLog[]) {
  localStorage.setItem('pomodoro-stats', JSON.stringify(stats));
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [stats, setStats] = useState<SessionLog[]>(loadStats);
  const [mode, setMode] = useState<TimerMode>('focus');
  const [timeLeft, setTimeLeft] = useState(settings.focus * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [completedInCycle, setCompletedInCycle] = useState(0);
  const intervalRef = useRef<number | null>(null);
  const sessionStartRef = useRef<number | null>(null);

  const totalTime = mode === 'focus' ? settings.focus * 60 :
    mode === 'shortBreak' ? settings.shortBreak * 60 :
    settings.longBreak * 60;

  const progress = (totalTime - timeLeft) / totalTime;

  // Get today's stats
  const todayKey = getTodayKey();
  const todayStats = stats.find(s => s.date === todayKey) || { date: todayKey, sessions: 0, totalFocusSeconds: 0 };

  // Timer logic
  useEffect(() => {
    if (isRunning) {
      if (mode === 'focus' && !sessionStartRef.current) {
        sessionStartRef.current = Date.now();
      }
      intervalRef.current = window.setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            handleTimerComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  const handleTimerComplete = useCallback(() => {
    setIsRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (mode === 'focus') {
      // Record completed session
      const elapsed = sessionStartRef.current
        ? Math.round((Date.now() - sessionStartRef.current) / 1000)
        : settings.focus * 60;
      sessionStartRef.current = null;

      setStats(prev => {
        const newStats = [...prev];
        const todayIdx = newStats.findIndex(s => s.date === todayKey);
        if (todayIdx >= 0) {
          newStats[todayIdx] = {
            ...newStats[todayIdx],
            sessions: newStats[todayIdx].sessions + 1,
            totalFocusSeconds: newStats[todayIdx].totalFocusSeconds + elapsed,
          };
        } else {
          newStats.push({ date: todayKey, sessions: 1, totalFocusSeconds: elapsed });
        }
        saveStats(newStats);
        return newStats;
      });

      const newCycleCount = completedInCycle + 1;
      setCompletedInCycle(newCycleCount);

      // Auto switch to break
      if (newCycleCount % settings.longBreakInterval === 0) {
        setMode('longBreak');
        setTimeLeft(settings.longBreak * 60);
      } else {
        setMode('shortBreak');
        setTimeLeft(settings.shortBreak * 60);
      }
    } else {
      // Break complete, switch to focus
      setMode('focus');
      setTimeLeft(settings.focus * 60);
    }

    // Play notification sound
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.5);
    } catch {}
  }, [mode, settings, completedInCycle, todayKey]);

  const handleStart = () => setIsRunning(true);
  const handlePause = () => {
    setIsRunning(false);
    if (mode === 'focus') sessionStartRef.current = null;
  };
  const handleReset = () => {
    setIsRunning(false);
    sessionStartRef.current = null;
    if (mode === 'focus') {
      setTimeLeft(settings.focus * 60);
    } else if (mode === 'shortBreak') {
      setTimeLeft(settings.shortBreak * 60);
    } else {
      setTimeLeft(settings.longBreak * 60);
    }
  };

  const switchMode = (newMode: TimerMode) => {
    setIsRunning(false);
    sessionStartRef.current = null;
    setMode(newMode);
    if (newMode === 'focus') setTimeLeft(settings.focus * 60);
    else if (newMode === 'shortBreak') setTimeLeft(settings.shortBreak * 60);
    else setTimeLeft(settings.longBreak * 60);
  };

  const updateSetting = (key: keyof Settings, value: number) => {
    const newSettings = { ...settings, [key]: Math.max(1, Math.min(120, value)) };
    setSettings(newSettings);
    saveSettings(newSettings);
    // Update timer if not running and matches current mode
    if (!isRunning) {
      if (key === 'focus' && mode === 'focus') setTimeLeft(newSettings.focus * 60);
      if (key === 'shortBreak' && mode === 'shortBreak') setTimeLeft(newSettings.shortBreak * 60);
      if (key === 'longBreak' && mode === 'longBreak') setTimeLeft(newSettings.longBreak * 60);
    }
  };

  const colors = MODE_COLORS[mode];
  const circumference = 2 * Math.PI * 140;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <div className={`min-h-screen ${colors.bg} transition-colors duration-500 flex flex-col`}>
      {/* Header */}
      <header className="w-full px-6 py-4 flex items-center justify-between max-w-2xl mx-auto">
        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <span className="text-2xl">🍅</span>
          <span>Pomodoro</span>
        </h1>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 rounded-lg hover:bg-white/60 transition-colors text-gray-600"
          title="Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 pb-8">
        {/* Settings Panel */}
        {showSettings && (
          <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-6 mb-8 animate-fade-in">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Settings</h2>
            <div className="grid grid-cols-1 gap-4">
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-600">Focus (min)</label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={settings.focus}
                  onChange={e => updateSetting('focus', parseInt(e.target.value) || 1)}
                  className="w-20 px-3 py-1.5 border border-gray-200 rounded-lg text-center text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-600">Short Break (min)</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={settings.shortBreak}
                  onChange={e => updateSetting('shortBreak', parseInt(e.target.value) || 1)}
                  className="w-20 px-3 py-1.5 border border-gray-200 rounded-lg text-center text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-600">Long Break (min)</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={settings.longBreak}
                  onChange={e => updateSetting('longBreak', parseInt(e.target.value) || 1)}
                  className="w-20 px-3 py-1.5 border border-gray-200 rounded-lg text-center text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-600">Long break after (sessions)</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={settings.longBreakInterval}
                  onChange={e => updateSetting('longBreakInterval', parseInt(e.target.value) || 1)}
                  className="w-20 px-3 py-1.5 border border-gray-200 rounded-lg text-center text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </div>
            </div>
          </div>
        )}

        {/* Mode Tabs */}
        <div className="flex gap-2 mb-8 bg-white/60 backdrop-blur-sm rounded-full p-1.5 shadow-sm">
          {(['focus', 'shortBreak', 'longBreak'] as TimerMode[]).map(m => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                mode === m
                  ? `${MODE_COLORS[m].button} text-white shadow-md`
                  : 'text-gray-600 hover:bg-white/80'
              }`}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>

        {/* Timer Circle */}
        <div className="relative mb-8">
          <svg width="320" height="320" className="transform -rotate-90">
            <circle
              cx="160"
              cy="160"
              r="140"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              className="text-gray-200/60"
            />
            <circle
              cx="160"
              cy="160"
              r="140"
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              className={`${colors.ring} transition-all duration-1000`}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-6xl font-mono font-bold ${colors.text} tracking-wider`}>
              {formatTime(timeLeft)}
            </span>
            <span className="text-sm text-gray-500 mt-2 uppercase tracking-wide">
              {MODE_LABELS[mode]}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4 mb-10">
          <button
            onClick={handleReset}
            className="w-12 h-12 rounded-full bg-white shadow-md flex items-center justify-center text-gray-500 hover:text-gray-700 hover:shadow-lg transition-all"
            title="Reset"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          <button
            onClick={isRunning ? handlePause : handleStart}
            className={`w-16 h-16 rounded-full ${colors.button} ${colors.buttonHover} text-white shadow-lg hover:shadow-xl flex items-center justify-center transition-all transform hover:scale-105`}
            title={isRunning ? 'Pause' : 'Start'}
          >
            {isRunning ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          <button
            onClick={() => {
              if (mode === 'focus') {
                switchMode(completedInCycle > 0 && completedInCycle % settings.longBreakInterval === 0 ? 'longBreak' : 'shortBreak');
              } else {
                switchMode('focus');
              }
            }}
            className="w-12 h-12 rounded-full bg-white shadow-md flex items-center justify-center text-gray-500 hover:text-gray-700 hover:shadow-lg transition-all"
            title="Skip"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Session Progress Dots */}
        <div className="flex items-center gap-2 mb-8">
          {Array.from({ length: settings.longBreakInterval }).map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full transition-all duration-300 ${
                i < (completedInCycle % settings.longBreakInterval)
                  ? `${colors.button} scale-110`
                  : 'bg-gray-300'
              }`}
            />
          ))}
        </div>

        {/* Today's Statistics */}
        <div className="w-full max-w-md bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Today's Focus
          </h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-gray-800">{todayStats.sessions}</div>
              <div className="text-xs text-gray-500 mt-1">Sessions</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-800">
                {formatDuration(todayStats.totalFocusSeconds)}
              </div>
              <div className="text-xs text-gray-500 mt-1">Focus Time</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-800">
                {completedInCycle}
              </div>
              <div className="text-xs text-gray-500 mt-1">Cycle</div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-4 text-xs text-gray-400">
        Stay focused. Take breaks. Be productive.
      </footer>
    </div>
  );
}
