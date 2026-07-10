import DrowsinessDetector from './components/DrowsinessDetector';
import { Shield, Eye, AlertOctagon, Heart } from 'lucide-react';

export default function App() {
  return (
    <div className="min-h-screen bg-[#0F172A] font-sans antialiased text-slate-200 flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
      
      {/* HEADER SECTION */}
      <header className="border-b border-slate-700/50 bg-[#1E293B] sticky top-0 z-40 px-8 py-4 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-indigo-500 rounded-xl blur-md opacity-30 animate-pulse" />
              <div className="bg-[#0F172A] border border-slate-700/50 rounded-xl p-2.5 relative">
                <Shield className="w-6 h-6 text-indigo-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse"></div>
                <h1 className="text-lg font-bold tracking-tight text-white uppercase">
                  GuardianAI <span className="font-light text-slate-400">| Driver Safety</span>
                </h1>
              </div>
              <p className="text-[10px] text-slate-400 font-mono uppercase tracking-widest">Sentry Autonomous Pupil &amp; EAR Telemetry</p>
            </div>
          </div>

          <div className="flex items-center gap-6 text-sm font-medium">
            <div className="flex flex-col items-end">
              <span className="text-slate-500 text-[9px] uppercase tracking-widest">System Status</span>
              <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Active Monitoring
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-slate-500 text-[9px] uppercase tracking-widest">Connection</span>
              <span className="text-white font-mono">CAM-01 / 480p</span>
            </div>
          </div>

        </div>
      </header>

      {/* MAIN LAYOUT */}
      <main className="flex-grow px-8 py-8" id="app-main-content">
        <div className="max-w-7xl mx-auto mb-8 space-y-3">
          <div className="flex items-center gap-2">
            <span className="bg-indigo-500/10 text-indigo-400 text-[10px] font-bold font-mono px-2.5 py-1 rounded-md uppercase tracking-wider border border-indigo-500/20">
              AI Computer Vision Module
            </span>
          </div>
          <h2 className="text-3xl font-black text-white tracking-tight">
            Driver Fatigue &amp; Drowsiness Diagnostic Center
          </h2>
          <p className="text-sm text-slate-400 max-w-3xl leading-relaxed">
            Protecting drivers using edge-AI landmark triangulation. This cockpit monitor tracks ocular cycles continuously to evaluate 
            the <strong>Eye Aspect Ratio (EAR)</strong>. If eyes are closed for over 2 seconds, haptic sirens automatically engage.
          </p>
        </div>

        {/* DETECTOR HUDS */}
        <DrowsinessDetector />

        {/* SYSTEM DOCUMENTATION & SPECS BLOCK */}
        <div className="max-w-7xl mx-auto mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 border-t border-slate-700/50 pt-10" id="info-section">
          
          <div className="bg-[#1E293B] p-6 rounded-2xl border border-slate-700/50 shadow-lg space-y-3">
            <div className="flex items-center gap-2.5 text-indigo-400">
              <Eye className="w-5 h-5" />
              <h4 className="font-bold text-sm text-slate-200">The Ocular EAR Algorithm</h4>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              We project 12 designated landmarks across both the left and right eyes. EAR computes the ratio between the vertical eyelid distances and horizontal widths. If this index drops below <code className="text-slate-300 font-mono bg-slate-900/60 px-1 py-0.5 rounded">0.22</code>, eyelids are classified as closed.
            </p>
          </div>

          <div className="bg-[#1E293B] p-6 rounded-2xl border border-slate-700/50 shadow-lg space-y-3">
            <div className="flex items-center gap-2.5 text-rose-400">
              <AlertOctagon className="w-5 h-5" />
              <h4 className="font-bold text-sm text-slate-200">Anti-Flicker Thresholds</h4>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Standard blinking completes in under 350 milliseconds. To prevent unnecessary alarms during natural blinks, our system requires a continuous 2.0-second closed phase before issuing the red alert and continuous alarm tones.
            </p>
          </div>

          <div className="bg-[#1E293B] p-6 rounded-2xl border border-slate-700/50 shadow-lg space-y-3">
            <div className="flex items-center gap-2.5 text-emerald-400">
              <Shield className="w-5 h-5" />
              <h4 className="font-bold text-sm text-slate-200">100% On-Device Privacy</h4>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              All neural network inference occurs entirely in your browser using local WebAssembly. Absolutely no camera streams, images, or metadata are ever transmitted, keeping your driver safety telemetry fully private and offline-first.
            </p>
          </div>

        </div>
      </main>

      {/* FOOTER SECTION */}
      <footer className="border-t border-slate-800 bg-slate-950 px-8 py-6 text-center text-xs text-slate-500 font-mono">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 GuardianAI Driver Safety Network. All rights reserved.</p>
          <div className="flex items-center gap-2 text-[10px] text-slate-400">
            <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
            <span>Dedicated to Driver Health &amp; Highway Safety</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
