import React, { useEffect, useRef, useState } from 'react';
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
import { DriverStatus, Settings, EyeEAR } from '../types';
import { AlarmSystem } from '../utils/alarm';
import { 
  Camera, 
  CameraOff, 
  Settings as SettingsIcon, 
  Volume2, 
  Activity, 
  AlertTriangle, 
  RefreshCw, 
  CheckCircle,
  Cpu, 
  Sparkles,
  ToggleLeft,
  Play,
  Square
} from 'lucide-react';

const LEFT_EYE_LANDMARKS = [362, 385, 387, 263, 373, 380];
const RIGHT_EYE_LANDMARKS = [33, 160, 158, 133, 153, 144];

// Alarm controller instance
const alarm = new AlarmSystem();

export default function DrowsinessDetector() {
  // State
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState('Initializing MediaPipe Engine...');
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [driverStatus, setDriverStatus] = useState<DriverStatus>('ALERT');
  const [currentEAR, setCurrentEAR] = useState<EyeEAR>({ left: 0.30, right: 0.30, average: 0.30 });
  const [eyesClosedDuration, setEyesClosedDuration] = useState<number>(0);
  const [fps, setFps] = useState<number>(0);
  const [earHistory, setEarHistory] = useState<number[]>(Array(50).fill(0.3));
  const [drowsinessAlertCount, setDrowsinessAlertCount] = useState<number>(0);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Settings state
  const [settings, setSettings] = useState<Settings>({
    threshold: 0.22,
    closedTimeRequired: 2.0,
    debugMesh: true,
    alertVolume: 0.7,
    minFPS: 15
  });

  // Sandbox simulation states
  const [simulationActive, setSimulationActive] = useState(false);
  const [simulatedEyesClosed, setSimulatedEyesClosed] = useState(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameId = useRef<number | null>(null);
  
  // High accuracy state trackers to prevent state lag in requestAnimationFrame
  const stateTracker = useRef({
    closedStartTime: null as number | null,
    lastFrameTime: performance.now(),
    frameCount: 0,
    fpsIntervalStart: performance.now(),
    isDrowsyTriggered: false,
    history: Array(50).fill(0.3) as number[]
  });

  // 1. Initialise FaceLandmarker Model
  useEffect(() => {
    async function loadModel() {
      try {
        setLoadingStep('Downloading Face Landmarker WebAssembly...');
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm"
        );
        
        setLoadingStep('Configuring Neural Network Weights (Float16)...');
        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numFaces: 1
        });

        landmarkerRef.current = landmarker;
        setIsModelLoading(false);
      } catch (err) {
        console.error("Error loading MediaPipe FaceLandmarker:", err);
        setLoadingStep('Failed to load. Retrying over fallback CDN...');
        // Try fallback CDN or display error
        setTimeout(loadModel, 2000);
      }
    }
    loadModel();

    return () => {
      // Clean up
      stopCamera();
      alarm.stop();
    };
  }, []);

  // 2. Camera Stream Controls
  const startCamera = async () => {
    setCameraError(null);
    alarm.init(); // Warm up AudioContext on user action
    
    try {
      if (streamRef.current) {
        stopCamera();
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user"
        },
        audio: false
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().then(() => {
            setIsMonitoring(true);
          });
        };
      }
    } catch (err: any) {
      console.error("Error accessing camera:", err);
      setCameraError(
        "Could not access camera. Please verify permission, check if another app is using it, or try using Sandbox simulation mode."
      );
      setIsMonitoring(false);
    }
  };

  const stopCamera = () => {
    setIsMonitoring(false);
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    stateTracker.current.closedStartTime = null;
    setEyesClosedDuration(0);
    setDriverStatus('ALERT');
    alarm.stop();
  };

  // 3. Main processing loop for eye landmarks & EAR
  useEffect(() => {
    if (!isMonitoring || simulationActive) {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
      return;
    }

    let lastVideoTime = -1;

    const runDetection = () => {
      if (!videoRef.current || !landmarkerRef.current) {
        animationFrameId.current = requestAnimationFrame(runDetection);
        return;
      }

      const video = videoRef.current;
      const landmarker = landmarkerRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');

      // Ensure stream is playing and has data
      if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;

        // Sync canvas size to video size
        if (canvas && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        // FPS Calculation
        const now = performance.now();
        stateTracker.current.frameCount++;
        if (now - stateTracker.current.fpsIntervalStart >= 1000) {
          setFps(Math.round((stateTracker.current.frameCount * 1000) / (now - stateTracker.current.fpsIntervalStart)));
          stateTracker.current.frameCount = 0;
          stateTracker.current.fpsIntervalStart = now;
        }

        // Detect face landmarks
        const result = landmarker.detectForVideo(video, now);

        if (ctx && canvas) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          if (result && result.faceLandmarks && result.faceLandmarks.length > 0) {
            const landmarks = result.faceLandmarks[0];
            const width = canvas.width;
            const height = canvas.height;

            // Helper for distance
            const pDist = (p1: any, p2: any) => {
              return Math.sqrt(Math.pow((p1.x - p2.x) * width, 2) + Math.pow((p1.y - p2.y) * height, 2));
            };

            // Calculate eye aspect ratio
            const calcEAR = (indices: number[]) => {
              const p1 = landmarks[indices[0]];
              const p2 = landmarks[indices[1]];
              const p3 = landmarks[indices[2]];
              const p4 = landmarks[indices[3]];
              const p5 = landmarks[indices[4]];
              const p6 = landmarks[indices[5]];

              const v1 = pDist(p2, p6);
              const v2 = pDist(p3, p5);
              const h = pDist(p1, p4);

              if (h === 0) return 0.3;
              return (v1 + v2) / (2.0 * h);
            };

            const leftEAR = calcEAR(LEFT_EYE_LANDMARKS);
            const rightEAR = calcEAR(RIGHT_EYE_LANDMARKS);
            const avgEAR = (leftEAR + rightEAR) / 2.0;

            // Update state with calculated values
            setCurrentEAR({ left: leftEAR, right: rightEAR, average: avgEAR });

            // Update historical EAR data for charts
            stateTracker.current.history = [...stateTracker.current.history.slice(1), avgEAR];
            setEarHistory([...stateTracker.current.history]);

            // Drowsiness State Machine
            const eyesClosed = leftEAR < settings.threshold && rightEAR < settings.threshold;

            if (eyesClosed) {
              if (stateTracker.current.closedStartTime === null) {
                stateTracker.current.closedStartTime = Date.now();
              }
              const duration = (Date.now() - stateTracker.current.closedStartTime) / 1000;
              setEyesClosedDuration(duration);

              if (duration >= settings.closedTimeRequired) {
                setDriverStatus('DROWSY');
                if (!stateTracker.current.isDrowsyTriggered) {
                  stateTracker.current.isDrowsyTriggered = true;
                  setDrowsinessAlertCount(c => c + 1);
                }
                alarm.start(settings.alertVolume);
              } else {
                setDriverStatus('CLOSED');
                alarm.stop();
              }
            } else {
              stateTracker.current.closedStartTime = null;
              stateTracker.current.isDrowsyTriggered = false;
              setEyesClosedDuration(0);
              setDriverStatus('ALERT');
              alarm.stop();
            }

            // Draw customized high-tech telemetry and meshes
            if (settings.debugMesh) {
              // 1. Draw subtle white contour lines
              ctx.fillStyle = driverStatus === 'DROWSY' ? 'rgba(239, 68, 68, 0.4)' : (driverStatus === 'CLOSED' ? 'rgba(245, 158, 11, 0.4)' : 'rgba(16, 185, 129, 0.3)');
              for (let i = 0; i < landmarks.length; i += 3) {
                const p = landmarks[i];
                ctx.beginPath();
                ctx.arc(p.x * width, p.y * height, 1.2, 0, 2 * Math.PI);
                ctx.fill();
              }

              // 2. Render Eye Outline
              const drawEyePath = (indices: number[], color: string) => {
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                indices.forEach((idx, idxOfArray) => {
                  const p = landmarks[idx];
                  if (idxOfArray === 0) ctx.moveTo(p.x * width, p.y * height);
                  else ctx.lineTo(p.x * width, p.y * height);
                });
                ctx.closePath();
                ctx.stroke();
              };

              const eyeColor = driverStatus === 'DROWSY' ? '#ef4444' : (driverStatus === 'CLOSED' ? '#f59e0b' : '#10b981');
              drawEyePath(LEFT_EYE_LANDMARKS, eyeColor);
              drawEyePath(RIGHT_EYE_LANDMARKS, eyeColor);

              // 3. Render Crosshair Bracket on the eyes
              const drawEyeBracket = (indices: number[], ear: number, label: string) => {
                let sX = 0, sY = 0;
                indices.forEach(idx => {
                  sX += landmarks[idx].x;
                  sY += landmarks[idx].y;
                });
                const cx = (sX / indices.length) * width;
                const cy = (sY / indices.length) * height;

                // Circular bracket
                ctx.strokeStyle = eyeColor;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(cx, cy, 22, 0, 2 * Math.PI);
                ctx.stroke();

                // Crosshairs
                ctx.beginPath();
                ctx.moveTo(cx - 5, cy); ctx.lineTo(cx + 5, cy);
                ctx.moveTo(cx, cy - 5); ctx.lineTo(cx, cy + 5);
                ctx.stroke();

                // EAR Text tag
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 11px monospace';
                ctx.fillText(`${label} ${ear.toFixed(2)}`, cx - 28, cy - 28);
              };

              drawEyeBracket(LEFT_EYE_LANDMARKS, leftEAR, 'L');
              drawEyeBracket(RIGHT_EYE_LANDMARKS, rightEAR, 'R');
            }
          } else {
            // No face detected
            ctx.fillStyle = 'rgba(239, 68, 68, 0.75)';
            ctx.font = 'bold 20px monospace';
            ctx.textAlign = 'center';
            ctx.fillText("⚠️ NO FACE DETECTED", canvas.width / 2, canvas.height / 2);
            ctx.textAlign = 'left'; // reset
          }
        }
      }

      animationFrameId.current = requestAnimationFrame(runDetection);
    };

    animationFrameId.current = requestAnimationFrame(runDetection);

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isMonitoring, settings, simulationActive, driverStatus]);

  // 4. Manual Sandbox simulation logic (recreates eye-closing timers entirely offline)
  useEffect(() => {
    if (!simulationActive) return;

    let timer: any = null;

    if (simulatedEyesClosed) {
      if (stateTracker.current.closedStartTime === null) {
        stateTracker.current.closedStartTime = Date.now();
      }

      timer = setInterval(() => {
        const elapsed = (Date.now() - (stateTracker.current.closedStartTime || Date.now())) / 1000;
        setEyesClosedDuration(elapsed);

        // Simulated EAR values drift down
        const lValue = Math.max(0.08, 0.12 - Math.random() * 0.04);
        const rValue = Math.max(0.09, 0.13 - Math.random() * 0.04);
        const avg = (lValue + rValue) / 2;
        setCurrentEAR({ left: lValue, right: rValue, average: avg });

        stateTracker.current.history = [...stateTracker.current.history.slice(1), avg];
        setEarHistory([...stateTracker.current.history]);

        if (elapsed >= settings.closedTimeRequired) {
          setDriverStatus('DROWSY');
          if (!stateTracker.current.isDrowsyTriggered) {
            stateTracker.current.isDrowsyTriggered = true;
            setDrowsinessAlertCount(c => c + 1);
          }
          alarm.start(settings.alertVolume);
        } else {
          setDriverStatus('CLOSED');
          alarm.stop();
        }
      }, 100);
    } else {
      stateTracker.current.closedStartTime = null;
      stateTracker.current.isDrowsyTriggered = false;
      setEyesClosedDuration(0);
      setDriverStatus('ALERT');
      alarm.stop();

      // Normal simulated values
      const lValue = 0.28 + Math.random() * 0.04;
      const rValue = 0.29 + Math.random() * 0.04;
      const avg = (lValue + rValue) / 2;
      setCurrentEAR({ left: lValue, right: rValue, average: avg });

      stateTracker.current.history = [...stateTracker.current.history.slice(1), avg];
      setEarHistory([...stateTracker.current.history]);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [simulatedEyesClosed, simulationActive, settings]);

  const handleToggleSandbox = () => {
    if (isMonitoring) {
      stopCamera();
    }
    setSimulationActive(!simulationActive);
    setSimulatedEyesClosed(false);
    setEyesClosedDuration(0);
    setDriverStatus('ALERT');
    alarm.stop();
    // Initialize dummy historical values
    stateTracker.current.history = Array(50).fill(0.3);
    setEarHistory(Array(50).fill(0.3));
  };

  const toggleSimulatedEyes = () => {
    alarm.init(); // Warm up AudioContext on click
    setSimulatedEyesClosed(!simulatedEyesClosed);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setSettings(s => ({ ...s, alertVolume: vol }));
    alarm.setVolume(vol);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 text-white font-sans max-w-7xl mx-auto pb-12" id="detector-root">
      
      {/* LEFT COLUMN: THE VISUAL MONITORING HUD */}
      <div className="lg:col-span-7 space-y-6 flex flex-col justify-between" id="visual-hud-panel">
        
        {/* State Banner / Display Alert */}
        <div 
          id="status-display-banner"
          className={`p-5 rounded-2xl border transition-all duration-300 flex items-center justify-between shadow-lg relative overflow-hidden ${
            driverStatus === 'DROWSY' 
              ? 'bg-rose-950/95 border-rose-500 shadow-rose-950/50 animate-pulse' 
              : driverStatus === 'CLOSED'
              ? 'bg-amber-950/90 border-amber-500 shadow-amber-950/30'
              : 'bg-[#1E293B] border-slate-700/50 shadow-md'
          }`}
        >
          {driverStatus === 'DROWSY' && (
            <div className="absolute inset-0 bg-red-600/10 pointer-events-none animate-pulse-ring" />
          )}

          <div className="flex items-center gap-4 z-10">
            <div className={`p-3.5 rounded-xl ${
              driverStatus === 'DROWSY'
                ? 'bg-rose-500 text-white animate-bounce'
                : driverStatus === 'CLOSED'
                ? 'bg-amber-500 text-black'
                : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
            }`}>
              {driverStatus === 'DROWSY' ? (
                <AlertTriangle className="w-8 h-8" />
              ) : driverStatus === 'CLOSED' ? (
                <Activity className="w-8 h-8 animate-pulse" />
              ) : (
                <CheckCircle className="w-8 h-8" />
              )}
            </div>
            
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400 font-mono">System Diagnostic Status</p>
              <h2 className={`text-2xl font-black tracking-tight ${
                driverStatus === 'DROWSY'
                  ? 'text-rose-500'
                  : driverStatus === 'CLOSED'
                  ? 'text-amber-500'
                  : 'text-emerald-400'
              }`}>
                {driverStatus === 'DROWSY' ? "DROWSY - CRITICAL" : driverStatus === 'CLOSED' ? "EYES CLOSED" : "DRIVER ALERT"}
              </h2>
            </div>
          </div>

          <div className="text-right z-10">
            {driverStatus === 'DROWSY' ? (
              <div className="bg-red-600 px-4 py-2 rounded-lg text-sm font-black tracking-widest text-white uppercase animate-pulse shadow-md">
                WAKE UP!
              </div>
            ) : eyesClosedDuration > 0 ? (
              <div className="bg-amber-500 px-3 py-1.5 rounded-lg text-xs font-bold text-black font-mono">
                CLOSED: {eyesClosedDuration.toFixed(1)}s
              </div>
            ) : (
              <div className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-lg text-xs font-semibold font-mono">
                MONITORING ACTIVE
              </div>
            )}
          </div>
        </div>

        {/* Live Video Camera Render Frame */}
        <div className="relative aspect-video w-full rounded-3xl overflow-hidden border border-slate-700/50 bg-slate-950 shadow-2xl group flex items-center justify-center" id="camera-stream-wrapper">
          {/* Cyberpunk Scanner lines & Tech Brackets */}
          <div className="absolute inset-x-0 h-0.5 bg-indigo-500/15 pointer-events-none z-15 animate-scan-line" />
          <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-slate-600 pointer-events-none rounded-tl-md" />
          <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-slate-600 pointer-events-none rounded-tr-md" />
          <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-slate-600 pointer-events-none rounded-bl-md" />
          <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-slate-600 pointer-events-none rounded-br-md" />

          {/* Fallback & Initialization State Overlay */}
          {!isMonitoring && !simulationActive && (
            <div className="absolute inset-0 bg-[#0F172A]/90 backdrop-blur-md z-20 flex flex-col items-center justify-center p-8 text-center" id="init-placeholder">
              {isModelLoading ? (
                <div className="space-y-4">
                  <Cpu className="w-16 h-16 text-indigo-400 animate-spin mx-auto" />
                  <p className="text-indigo-400 font-mono text-sm tracking-widest">{loadingStep}</p>
                  <p className="text-slate-500 text-xs">This takes a few seconds to initialize local WebAssembly models...</p>
                </div>
              ) : (
                <div className="space-y-6 max-w-md">
                  <div className="w-20 h-20 bg-[#1E293B] border border-slate-700/50 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
                    <Camera className="w-10 h-10 text-slate-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-200">Continuous AI Driver Monitoring</h3>
                    <p className="text-slate-400 text-xs mt-2 leading-relaxed">
                      This application accesses your webcam to calculate your live Eye Aspect Ratio (EAR) using face landmarks. No video is ever uploaded.
                    </p>
                  </div>
                  {cameraError && (
                    <div className="bg-rose-950/60 border border-rose-800/80 rounded-xl p-3 text-xs text-rose-300">
                      {cameraError}
                    </div>
                  )}
                  <button 
                    id="btn-start-monitoring"
                    onClick={startCamera}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 px-6 rounded-2xl transition duration-150 shadow-lg shadow-indigo-950/40 flex items-center justify-center gap-2"
                  >
                    <Play className="w-5 h-5 fill-white" /> Start AI Monitoring
                  </button>
                </div>
              )}
            </div>
          )}

          {simulationActive && (
            <div className="absolute inset-0 bg-[#0F172A]/90 backdrop-blur-md z-20 flex flex-col items-center justify-center p-8 text-center" id="sandbox-active-placeholder">
              <div className="space-y-4 max-w-sm">
                <div className={`w-24 h-24 rounded-full border-2 mx-auto flex items-center justify-center transition-all ${
                  simulatedEyesClosed ? 'border-rose-500 bg-rose-950/50 scale-105' : 'border-emerald-500 bg-emerald-950/30'
                }`}>
                  <Sparkles className={`w-10 h-10 ${simulatedEyesClosed ? 'text-rose-400 animate-pulse' : 'text-emerald-400'}`} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-100">Sandbox Simulation Active</h3>
                  <p className="text-slate-400 text-xs mt-1">
                    Webcam is disabled. Use the testing controls on the right panel to simulate face landmarks and test the alarm systems.
                  </p>
                </div>
                <div className="pt-2 flex flex-col gap-2">
                  <button 
                    id="btn-simulation-toggle"
                    onClick={toggleSimulatedEyes}
                    className={`font-semibold py-3 px-6 rounded-xl transition duration-150 flex items-center justify-center gap-2 shadow-lg ${
                      simulatedEyesClosed 
                        ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400' 
                        : 'bg-rose-500 text-white hover:bg-rose-400'
                    }`}
                  >
                    {simulatedEyesClosed ? "Simulate: Open Eyes" : "Simulate: Close Eyes (2s)"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Actual Camera Feed and Overlaid HUD Canvas */}
          <video 
            ref={videoRef} 
            className="absolute inset-0 w-full h-full object-cover transform -scale-x-100 z-10"
            playsInline 
            muted 
          />
          <canvas 
            ref={canvasRef} 
            className="absolute inset-0 w-full h-full object-cover transform -scale-x-100 pointer-events-none z-15"
          />

          {/* Corner Telemetry Overlay (only when active) */}
          {isMonitoring && (
            <div className="absolute bottom-4 left-4 bg-slate-900/80 backdrop-blur border border-slate-800 rounded-lg px-2.5 py-1 z-20 font-mono text-[10px] text-slate-400">
              STREAM: 640x480 @ {fps}fps
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div className="flex flex-wrap gap-4 items-center justify-between bg-[#1E293B] border border-slate-700/50 p-4 rounded-2xl shadow-md" id="camera-feed-controls">
          <div className="flex gap-2">
            {isMonitoring ? (
              <button
                id="btn-stop-monitoring"
                onClick={stopCamera}
                className="bg-rose-600/20 border border-rose-500/30 text-rose-400 hover:bg-rose-600 hover:text-white px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2"
              >
                <Square className="w-4 h-4 fill-current" /> Terminate Stream
              </button>
            ) : (
              <button
                id="btn-re-init-camera"
                onClick={startCamera}
                disabled={isModelLoading}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 disabled:opacity-40"
              >
                <Camera className="w-4 h-4" /> Start Camera Monitoring
              </button>
            )}

            <button
              id="btn-toggle-sandbox-mode"
              onClick={handleToggleSandbox}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                simulationActive 
                  ? 'bg-indigo-500 text-white hover:bg-indigo-400' 
                  : 'bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300'
              }`}
            >
              <ToggleLeft className="w-4 h-4" /> {simulationActive ? "Exit Sandbox Mode" : "Use Testing Sandbox"}
            </button>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs text-slate-400" id="alert-counter-badge">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
            <span>Cumulative Alarm Triggers:</span>
            <span className="font-bold text-slate-100 bg-[#0F172A] px-2.5 py-1 rounded-md border border-slate-700/50">
              {drowsinessAlertCount}
            </span>
          </div>
        </div>

      </div>

      {/* RIGHT COLUMN: TELEMETRY, WAVEFORM & CALIBRATION SETTINGS */}
      <div className="lg:col-span-5 space-y-6" id="telemetry-panel">
        
        {/* Telemetry Dashboard Stats */}
        <div className="bg-[#1E293B] border border-slate-700/50 rounded-2xl p-6 shadow-lg space-y-6" id="ear-stats-dashboard">
          <div className="flex items-center justify-between border-b border-slate-700/50 pb-4">
            <h3 className="font-bold text-slate-200 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-indigo-400" /> Real-time Eye Telemetry
            </h3>
            <span className="bg-[#0F172A] px-2.5 py-1 rounded-md text-[10px] text-slate-400 font-mono uppercase border border-slate-700/50">
              {simulationActive ? "Simulated WebMesh" : "Neural Tensor Processing"}
            </span>
          </div>

          {/* Left / Right EAR progress bars */}
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between font-mono text-xs">
                <span className="text-slate-400">Left Eye Aspect Ratio (L-EAR)</span>
                <span className={`font-bold ${currentEAR.left < settings.threshold ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {currentEAR.left.toFixed(3)}
                </span>
              </div>
              <div className="h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div 
                  className={`h-full transition-all duration-75 ${currentEAR.left < settings.threshold ? 'bg-amber-500' : 'bg-emerald-400'}`}
                  style={{ width: `${Math.min(100, currentEAR.left * 200)}%` }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between font-mono text-xs">
                <span className="text-slate-400">Right Eye Aspect Ratio (R-EAR)</span>
                <span className={`font-bold ${currentEAR.right < settings.threshold ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {currentEAR.right.toFixed(3)}
                </span>
              </div>
              <div className="h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div 
                  className={`h-full transition-all duration-75 ${currentEAR.right < settings.threshold ? 'bg-amber-500' : 'bg-emerald-400'}`}
                  style={{ width: `${Math.min(100, currentEAR.right * 200)}%` }}
                />
              </div>
            </div>

            <div className="p-3 bg-[#0F172A] rounded-xl border border-slate-700/50 flex justify-between items-center font-mono text-xs">
              <span className="text-slate-400">Current Average EAR</span>
              <span className={`font-black text-sm px-2.5 py-1 rounded-md ${
                currentEAR.average < settings.threshold ? 'text-rose-400 bg-rose-500/10' : 'text-emerald-400 bg-emerald-500/10'
              }`}>
                {currentEAR.average.toFixed(3)}
              </span>
            </div>
          </div>
        </div>

        {/* Real-time Rolling Waveform (SVG Sparkline) */}
        <div className="bg-[#1E293B] border border-slate-700/50 rounded-2xl p-6 shadow-lg space-y-4" id="ear-waveform-panel">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-200 flex items-center gap-2 text-sm">
              <Activity className="w-4 h-4 text-indigo-400 animate-pulse" /> Live EAR Signal Waveform
            </h3>
            <span className="text-[10px] text-slate-500 font-mono">50 FRAME INTERVAL</span>
          </div>

          <div className="h-32 bg-slate-950 rounded-2xl relative border border-slate-800/80 overflow-hidden flex items-end">
            {/* Dashed Threshold Line */}
            <div 
              className="absolute w-full border-t border-dashed border-rose-500/80 z-10 text-[9px] font-mono text-rose-400/90 pl-2 pt-0.5"
              style={{ bottom: `${settings.threshold * 200}px` }}
            >
              ALARM THRESHOLD ({settings.threshold.toFixed(2)})
            </div>

            {/* SVG line drawing */}
            <svg className="w-full h-full absolute inset-0 text-indigo-400" viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="rgb(99, 102, 241)" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="rgb(99, 102, 241)" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              
              {/* Fill path */}
              {earHistory.length > 1 && (
                <path
                  d={`M 0 100 ${earHistory.map((ear, i) => {
                    const x = (i / (earHistory.length - 1)) * 100;
                    // Map EAR 0.0 -> 0.4 into SVG height 100 -> 0
                    const y = 100 - Math.min(100, Math.max(0, (ear / 0.45) * 100));
                    return `L ${x} ${y}`;
                  }).join(' ')} L 100 100 Z`}
                  fill="url(#gradient)"
                  stroke="none"
                />
              )}

              {/* Stroke path */}
              {earHistory.length > 1 && (
                <path
                  d={earHistory.map((ear, i) => {
                    const x = (i / (earHistory.length - 1)) * 100;
                    const y = 100 - Math.min(100, Math.max(0, (ear / 0.45) * 100));
                    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                  }).join(' ')}
                  fill="none"
                  stroke={driverStatus === 'DROWSY' ? '#ef4444' : '#6366f1'}
                  strokeWidth="2"
                />
              )}
            </svg>
          </div>
        </div>

        {/* Calibration & Threshold Settings Slider */}
        <div className="bg-[#1E293B] border border-slate-700/50 rounded-2xl p-6 shadow-lg space-y-6" id="calibration-options-panel">
          <div className="flex items-center justify-between border-b border-slate-700/50 pb-4">
            <h3 className="font-bold text-slate-200 flex items-center gap-2">
              <SettingsIcon className="w-5 h-5 text-slate-400" /> Calibration & Tuning
            </h3>
          </div>

          <div className="space-y-6">
            
            {/* 1. EAR Sensitivity Threshold */}
            <div className="space-y-2">
              <div className="flex justify-between font-mono text-xs text-slate-300">
                <span>Eye Closed Sensitivity Threshold</span>
                <span className="font-bold text-slate-200 bg-[#0F172A] px-2 py-0.5 rounded border border-slate-700/50">
                  {settings.threshold.toFixed(2)} EAR
                </span>
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Higher values triggers detection easily. Lower values require fully shut eyes. Recommended: 0.20 – 0.24.
              </p>
              <input 
                type="range"
                min="0.15"
                max="0.30"
                step="0.01"
                value={settings.threshold}
                onChange={(e) => setSettings(s => ({ ...s, threshold: parseFloat(e.target.value) }))}
                className="w-full accent-indigo-500 bg-[#0F172A] h-1.5 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-[9px] font-mono text-slate-500">
                <button onClick={() => setSettings(s => ({ ...s, threshold: 0.18 }))} className="hover:text-slate-300">Strict (0.18)</button>
                <button onClick={() => setSettings(s => ({ ...s, threshold: 0.22 }))} className="hover:text-indigo-400 text-indigo-400 font-bold">Standard (0.22)</button>
                <button onClick={() => setSettings(s => ({ ...s, threshold: 0.25 }))} className="hover:text-slate-300">Sensitive (0.25)</button>
              </div>
            </div>

            {/* 2. Drowsiness trigger duration (required to wait before alarm) */}
            <div className="space-y-2">
              <div className="flex justify-between font-mono text-xs text-slate-300">
                <span>Drowsiness Closed Duration Limit</span>
                <span className="font-bold text-slate-200 bg-[#0F172A] px-2 py-0.5 rounded border border-slate-700/50">
                  {settings.closedTimeRequired.toFixed(1)}s
                </span>
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Eyes must remain closed continuously for this duration before classification triggers.
              </p>
              <input 
                type="range"
                min="1.0"
                max="4.0"
                step="0.5"
                value={settings.closedTimeRequired}
                onChange={(e) => setSettings(s => ({ ...s, closedTimeRequired: parseFloat(e.target.value) }))}
                className="w-full accent-indigo-500 bg-[#0F172A] h-1.5 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-[9px] font-mono text-slate-500">
                <span>1.0s (Instant)</span>
                <span>2.0s (Standard)</span>
                <span>4.0s (Relaxed)</span>
              </div>
            </div>

            {/* 3. Alarm Volume */}
            <div className="space-y-2">
              <div className="flex justify-between font-mono text-xs text-slate-300">
                <span>Siren Volume</span>
                <span className="font-bold text-slate-200 bg-[#0F172A] px-2 py-0.5 rounded border border-slate-700/50 flex items-center gap-1">
                  <Volume2 className="w-3.5 h-3.5 text-slate-400" /> {Math.round(settings.alertVolume * 100)}%
                </span>
              </div>
              <input 
                type="range"
                min="0.0"
                max="1.0"
                step="0.1"
                value={settings.alertVolume}
                onChange={handleVolumeChange}
                className="w-full accent-indigo-500 bg-[#0F172A] h-1.5 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* Debug Landmarks overlay */}
            <div className="flex items-center justify-between p-3.5 bg-[#0F172A] rounded-xl border border-slate-700/50">
              <div>
                <p className="text-xs font-bold text-slate-200">Overlay Facemesh Graphics</p>
                <p className="text-[10px] text-slate-500">Draw points and HUD lines on live video.</p>
              </div>
              <input 
                type="checkbox"
                checked={settings.debugMesh}
                onChange={(e) => setSettings(s => ({ ...s, debugMesh: e.target.checked }))}
                className="w-4 h-4 accent-indigo-500"
              />
            </div>

          </div>
        </div>

      </div>

    </div>
  );
}
