import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export interface TourStep {
  id: string;
  /** Sticky note body text */
  note: string;
  /** Small label shown in a code-style pill, e.g. "Filling: Business Unit → BCLD" */
  fillLabel?: string;
  noteColor?: 'yellow' | 'blue' | 'green' | 'pink';
  /** Rotation of the sticky note in degrees */
  noteRotation?: number;
  /** Matches a [data-sat-id="..."] attribute in the DOM */
  targetId?: string;
  /** Preferred placement of the note relative to the target */
  placement?: 'top' | 'bottom' | 'left' | 'right';
  /** Async action executed when this step becomes active */
  action?: (ctx: { navigate: ReturnType<typeof useNavigate> }) => Promise<void>;
  /** Auto-advance to next step after N ms (0 = manual only) */
  autoNextMs?: number;
}

export interface Tour {
  id: string;
  title: string;
  icon: string;
  description: string;
  steps: TourStep[];
}

interface ShowAndTellCtx {
  activeTour: Tour | null;
  stepIndex: number;
  isRunning: boolean;
  startTour: (tour: Tour) => void;
  stopTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
}

const Ctx = createContext<ShowAndTellCtx | null>(null);

export const useShowAndTell = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useShowAndTell must be inside ShowAndTellProvider');
  return c;
};

export const ShowAndTellProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTour, setActiveTour] = useState<Tour | null>(null);
  const [stepIndex, setStepIndex]   = useState(0);
  const [isRunning, setIsRunning]   = useState(false);
  const navigate = useNavigate();
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (autoTimer.current) { clearTimeout(autoTimer.current); autoTimer.current = null; }
  };

  const runStep = useCallback((tour: Tour, idx: number) => {
    clearTimer();
    const step = tour.steps[idx];
    if (!step) return;
    if (step.action) step.action({ navigate });
    if (step.autoNextMs && step.autoNextMs > 0) {
      autoTimer.current = setTimeout(() => {
        setStepIndex(i => {
          const next = i + 1;
          if (next < tour.steps.length) {
            runStep(tour, next);
            return next;
          }
          setActiveTour(null);
          setIsRunning(false);
          return i;
        });
      }, step.autoNextMs);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const startTour = useCallback((tour: Tour) => {
    setActiveTour(tour);
    setStepIndex(0);
    setIsRunning(true);
    runStep(tour, 0);
  }, [runStep]);

  const stopTour = useCallback(() => {
    clearTimer();
    setActiveTour(null);
    setStepIndex(0);
    setIsRunning(false);
  }, []);

  const nextStep = useCallback(() => {
    clearTimer();
    setActiveTour(tour => {
      if (!tour) return tour;
      setStepIndex(i => {
        const next = i + 1;
        if (next >= tour.steps.length) {
          setIsRunning(false);
          setActiveTour(null);
          return i;
        }
        runStep(tour, next);
        return next;
      });
      return tour;
    });
  }, [runStep]);

  const prevStep = useCallback(() => {
    clearTimer();
    setStepIndex(i => Math.max(0, i - 1));
  }, []);

  return (
    <Ctx.Provider value={{ activeTour, stepIndex, isRunning, startTour, stopTour, nextStep, prevStep }}>
      {children}
    </Ctx.Provider>
  );
};
