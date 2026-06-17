import { useEffect, useState } from 'react';

interface Props {
  onDone: () => void;
}

export default function SplashScreen({ onDone }: Props) {
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in');

  useEffect(() => {
    // fade-in 600ms → hold 1200ms → fade-out 600ms
    const t1 = setTimeout(() => setPhase('hold'), 600);
    const t2 = setTimeout(() => setPhase('out'),  1800);
    const t3 = setTimeout(() => onDone(),          2400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  const opacity = phase === 'out' ? 0 : 1;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'linear-gradient(135deg, #0a1628 0%, #0d2444 50%, #102a50 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      opacity, transition: 'opacity 0.6s ease',
      userSelect: 'none',
    }}>

      {/* Animated rings */}
      <div style={{ position: 'relative', width: 140, height: 140, marginBottom: 32 }}>
        {/* outer pulse ring */}
        <div style={{
          position: 'absolute', inset: -16,
          borderRadius: '50%',
          border: '1px solid rgba(24,144,255,0.25)',
          animation: 'reerp-pulse 2s ease-out infinite',
        }} />
        {/* middle ring */}
        <div style={{
          position: 'absolute', inset: -6,
          borderRadius: '50%',
          border: '1px solid rgba(24,144,255,0.15)',
          animation: 'reerp-pulse 2s ease-out 0.4s infinite',
        }} />

        {/* Logo circle */}
        <div style={{
          width: 140, height: 140, borderRadius: '50%',
          background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 60%, #0050b3 100%)',
          boxShadow: '0 0 40px rgba(24,144,255,0.5), 0 0 80px rgba(24,144,255,0.2)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          animation: 'reerp-scale-in 0.6s cubic-bezier(0.34,1.56,0.64,1) forwards',
        }}>
          {/* RE monogram */}
          <div style={{
            fontSize: 42, fontWeight: 900, color: '#fff',
            fontFamily: '"Segoe UI", system-ui, sans-serif',
            letterSpacing: '-2px', lineHeight: 1,
            textShadow: '0 2px 8px rgba(0,0,0,0.4)',
          }}>RE</div>
          {/* thin divider */}
          <div style={{
            width: 48, height: 1.5,
            background: 'rgba(255,255,255,0.4)',
            margin: '4px 0',
          }} />
          {/* ERP label */}
          <div style={{
            fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.85)',
            fontFamily: '"Segoe UI", system-ui, sans-serif',
            letterSpacing: 4,
          }}>ERP</div>
        </div>
      </div>

      {/* Product name */}
      <div style={{
        fontSize: 32, fontWeight: 800, color: '#fff',
        fontFamily: '"Segoe UI", system-ui, sans-serif',
        letterSpacing: 2,
        animation: 'reerp-slide-up 0.6s 0.2s both',
        textShadow: '0 2px 12px rgba(0,0,0,0.4)',
      }}>
        Re<span style={{ color: '#40a9ff' }}>ERP</span>
      </div>

      {/* Tagline */}
      <div style={{
        fontSize: 13, color: 'rgba(255,255,255,0.45)',
        fontFamily: '"Segoe UI", system-ui, sans-serif',
        letterSpacing: 3, marginTop: 8, textTransform: 'uppercase',
        animation: 'reerp-slide-up 0.6s 0.4s both',
      }}>
        Enterprise Resource Planning
      </div>

      {/* Loading bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: 3,
        background: 'rgba(255,255,255,0.08)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          background: 'linear-gradient(90deg, transparent, #1890ff, #40a9ff, transparent)',
          animation: 'reerp-bar 2.4s linear forwards',
        }} />
      </div>

      <style>{`
        @keyframes reerp-scale-in {
          from { transform: scale(0.4); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
        @keyframes reerp-slide-up {
          from { transform: translateY(16px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes reerp-pulse {
          0%   { transform: scale(1);    opacity: 1; }
          100% { transform: scale(1.5);  opacity: 0; }
        }
        @keyframes reerp-bar {
          from { transform: translateX(-100%); }
          to   { transform: translateX(100%);  }
        }
      `}</style>
    </div>
  );
}
