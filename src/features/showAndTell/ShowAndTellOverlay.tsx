import React, { useEffect, useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Button, Space } from 'antd';
import { useShowAndTell } from './ShowAndTellContext';

const COLORS = {
  yellow: { bg: '#fffde7', border: '#f9a825', tape: 'rgba(255,245,100,0.7)', text: '#1a1a1a' },
  blue:   { bg: '#e3f2fd', border: '#1976d2', tape: 'rgba(100,180,255,0.5)', text: '#0d2a4a' },
  green:  { bg: '#f1f8e9', border: '#558b2f', tape: 'rgba(120,220,120,0.5)', text: '#1a3a0a' },
  pink:   { bg: '#fce4ec', border: '#c2185b', tape: 'rgba(255,100,160,0.4)', text: '#3a0a1a' },
};

interface Pos { top: number; left: number; }

function positionNote(rect: DOMRect, placement: string, noteW: number, noteH: number): Pos {
  const margin = 18;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let top: number, left: number;

  if (placement === 'top') {
    top  = rect.top - noteH - margin;
    left = rect.left;
  } else if (placement === 'left') {
    top  = rect.top;
    left = rect.left - noteW - margin;
  } else if (placement === 'right') {
    top  = rect.top;
    left = rect.right + margin;
  } else {
    // bottom (default)
    top  = rect.bottom + margin;
    left = rect.left;
  }

  // Clamp to viewport
  top  = Math.max(10, Math.min(top,  vh - noteH - 10));
  left = Math.max(10, Math.min(left, vw - noteW - 10));
  return { top, left };
}

export const ShowAndTellOverlay: React.FC = () => {
  const { activeTour, stepIndex, isRunning, nextStep, prevStep, stopTour } = useShowAndTell();
  const [pos, setPos]           = useState<Pos | null>(null);
  const [targetRect, setTarget] = useState<DOMRect | null>(null);
  const noteRef = useRef<HTMLDivElement>(null);

  const step = activeTour?.steps[stepIndex];
  const colors = COLORS[step?.noteColor ?? 'yellow'];
  const rotation = step?.noteRotation ?? (stepIndex % 2 === 0 ? -1.5 : 1.5);
  const totalSteps = activeTour?.steps.length ?? 0;

  useEffect(() => {
    if (!step?.targetId) { setTarget(null); setPos(null); return; }

    const locate = () => {
      const el = document.querySelector(`[data-sat-id="${step.targetId}"]`);
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      setTarget(rect);
      const noteW = noteRef.current?.offsetWidth  ?? 300;
      const noteH = noteRef.current?.offsetHeight ?? 180;
      setPos(positionNote(rect, step.placement ?? 'bottom', noteW, noteH));
      return true;
    };

    if (!locate()) {
      let attempts = 0;
      const iv = setInterval(() => { if (locate() || ++attempts > 20) clearInterval(iv); }, 250);
      return () => clearInterval(iv);
    }
  }, [step?.targetId, step?.placement, stepIndex]);

  // Reposition on scroll/resize
  useEffect(() => {
    if (!step?.targetId) return;
    const reposition = () => {
      const el = document.querySelector(`[data-sat-id="${step.targetId}"]`);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setTarget(rect);
      const noteW = noteRef.current?.offsetWidth  ?? 300;
      const noteH = noteRef.current?.offsetHeight ?? 180;
      setPos(positionNote(rect, step.placement ?? 'bottom', noteW, noteH));
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [step?.targetId, step?.placement]);

  if (!isRunning || !activeTour || !step) return null;

  const centeredStyle: React.CSSProperties = pos
    ? { top: pos.top, left: pos.left }
    : { top: '50%', left: '50%', transform: `translate(-50%, -50%) rotate(${rotation}deg)` };

  const noteStyle: React.CSSProperties = pos
    ? { position: 'fixed', ...centeredStyle, transform: `rotate(${rotation}deg)` }
    : { position: 'fixed', ...centeredStyle };

  const overlay = (
    <>
      {/* Dim backdrop (subtle) */}
      {targetRect && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.15)',
          pointerEvents: 'none',
          zIndex: 9990,
        }} />
      )}

      {/* Highlight ring around target element */}
      {targetRect && (
        <div style={{
          position:     'fixed',
          top:          targetRect.top    - 5,
          left:         targetRect.left   - 5,
          width:        targetRect.width  + 10,
          height:       targetRect.height + 10,
          border:       `2px solid ${colors.border}`,
          borderRadius: 8,
          boxShadow:    `0 0 0 4px ${colors.border}44, 0 0 16px ${colors.border}66`,
          pointerEvents:'none',
          zIndex:       9991,
          animation:    'sat-pulse 1.8s ease-in-out infinite',
        }} />
      )}

      {/* Sticky Note */}
      <div
        ref={noteRef}
        style={{
          ...noteStyle,
          zIndex:       9999,
          minWidth:     270,
          maxWidth:     340,
          filter:       `drop-shadow(3px 5px 12px ${colors.border}55)`,
          transition:   'top 0.25s, left 0.25s',
          cursor:       'default',
        }}
      >
        {/* Paper body */}
        <div style={{
          background:   colors.bg,
          border:       `1px solid ${colors.border}`,
          borderRadius: 3,
          padding:      '18px 16px 14px',
          position:     'relative',
          fontFamily:   "'Segoe UI', system-ui, sans-serif",
        }}>
          {/* Tape strip at top */}
          <div style={{
            position:    'absolute',
            top:         -10,
            left:        '50%',
            transform:   'translateX(-50%)',
            width:       48,
            height:      18,
            background:  colors.tape,
            borderRadius: 2,
            border:      `1px solid ${colors.border}33`,
          }} />

          {/* Tour title + progress */}
          <div style={{
            display:        'flex',
            justifyContent: 'space-between',
            alignItems:     'center',
            marginBottom:   8,
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: colors.border, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              {activeTour.icon} {activeTour.title}
            </span>
            <span style={{ fontSize: 10, color: '#888' }}>
              {stepIndex + 1} / {totalSteps}
            </span>
          </div>

          {/* Progress bar */}
          <div style={{ height: 3, background: '#e0e0e0', borderRadius: 2, marginBottom: 10 }}>
            <div style={{
              height:     '100%',
              width:      `${((stepIndex + 1) / totalSteps) * 100}%`,
              background: colors.border,
              borderRadius: 2,
              transition: 'width 0.3s',
            }} />
          </div>

          {/* Note text */}
          <div style={{
            fontSize:   13,
            color:      colors.text,
            lineHeight: 1.6,
            whiteSpace: 'pre-line',
            marginBottom: step.fillLabel ? 10 : 14,
          }}>
            {step.note}
          </div>

          {/* Fill label pill */}
          {step.fillLabel && (
            <div style={{
              background:   `${colors.border}18`,
              border:       `1px solid ${colors.border}44`,
              borderRadius: 4,
              padding:      '4px 8px',
              fontSize:     11,
              fontFamily:   'monospace',
              color:        colors.border,
              marginBottom: 12,
            }}>
              ✏️ {step.fillLabel}
            </div>
          )}

          {/* Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Button
              size="small"
              type="text"
              onClick={stopTour}
              style={{ fontSize: 11, color: '#999', padding: '0 4px', height: 22 }}
            >
              ✕ Exit tour
            </Button>
            <Space size={6}>
              {stepIndex > 0 && (
                <Button size="small" onClick={prevStep} style={{ fontSize: 11 }}>
                  ← Back
                </Button>
              )}
              <Button
                size="small"
                type="primary"
                onClick={nextStep}
                style={{ fontSize: 11, background: colors.border, borderColor: colors.border }}
              >
                {stepIndex === totalSteps - 1 ? 'Finish ✓' : 'Next →'}
              </Button>
            </Space>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes sat-pulse {
          0%,100% { box-shadow: 0 0 0 4px ${colors.border}44, 0 0 16px ${colors.border}66; }
          50%      { box-shadow: 0 0 0 8px ${colors.border}22, 0 0 24px ${colors.border}44; }
        }
      `}</style>
    </>
  );

  return ReactDOM.createPortal(overlay, document.body);
};
