import React, { useState, useRef, useEffect } from 'react';
import { Button, Tooltip, Modal, List, Spin, message, Typography } from 'antd';
import { VideoCameraOutlined, StopOutlined, SaveOutlined } from '@ant-design/icons';

const { Text } = Typography;

const REDWOOD_PRIMARY = '#C74634';

// Only works in Electron
const isElectron = () => !!(window as any).electronAPI?.isElectron;

const ScreenRecorder: React.FC = () => {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sourceModal, setSourceModal] = useState(false);
  const [sources, setSources] = useState<any[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Don't render at all outside Electron
  if (!isElectron()) return null;

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  const openSourcePicker = async () => {
    setSourcesLoading(true);
    setSourceModal(true);
    try {
      const srcs = await (window as any).electronAPI.getScreenSources();
      setSources(srcs);
    } catch (e: any) {
      message.error('Could not get screen sources: ' + e.message);
      setSourceModal(false);
    } finally {
      setSourcesLoading(false);
    }
  };

  const startRecording = async (sourceId: string) => {
    setSourceModal(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            minWidth: 1280,
            maxWidth: 1920,
            minHeight: 720,
            maxHeight: 1080,
          },
        } as any,
      });

      streamRef.current = stream;
      chunks.current = [];

      const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      rec.start(1000);
      mediaRecorder.current = rec;

      setElapsed(0);
      setRecording(true);
      timerRef.current = setInterval(() => setElapsed(p => p + 1), 1000);
    } catch (e: any) {
      message.error('Recording failed to start: ' + e.message);
    }
  };

  const stopRecording = () => {
    if (!mediaRecorder.current) return;
    mediaRecorder.current.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);

    mediaRecorder.current.onstop = async () => {
      setSaving(true);
      const blob = new Blob(chunks.current, { type: 'video/webm' });
      const arrayBuf = await blob.arrayBuffer();
      const now = new Date();
      const stamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}`;
      const defaultName = `ReactERP_Recording_${stamp}.webm`;
      try {
        const result = await (window as any).electronAPI.saveRecording(Array.from(new Uint8Array(arrayBuf)), defaultName);
        if (result.success) {
          message.success(`Recording saved: ${result.filePath}`);
        } else if (!result.cancelled) {
          message.error('Failed to save recording');
        }
      } finally {
        setSaving(false);
        chunks.current = [];
      }
    };
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return (
    <>
      {/* Toolbar button */}
      {recording ? (
        <Tooltip title={`Stop Recording (${formatTime(elapsed)})`} placement="bottom">
          <Button
            type="text"
            onClick={stopRecording}
            style={{
              color: '#fff',
              background: 'rgba(255,255,255,0.15)',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 10px',
              height: 32,
            }}
          >
            {/* Pulsing red dot */}
            <span style={{
              width: 10, height: 10, borderRadius: '50%',
              background: '#ff4444',
              display: 'inline-block',
              animation: 'pulse-rec 1s infinite',
              flexShrink: 0,
            }} />
            <StopOutlined style={{ fontSize: 16 }} />
            <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.02em' }}>
              {formatTime(elapsed)}
            </span>
          </Button>
        </Tooltip>
      ) : (
        <Tooltip title="Start Screen Recording" placement="bottom">
          <Button
            type="text"
            icon={<VideoCameraOutlined style={{ fontSize: 18, color: '#fff' }} />}
            style={{ color: '#fff' }}
            onClick={openSourcePicker}
            loading={saving}
          />
        </Tooltip>
      )}

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse-rec {
          0%   { opacity: 1; transform: scale(1); }
          50%  { opacity: 0.4; transform: scale(1.3); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>

      {/* Source picker modal */}
      <Modal
        title={
          <span>
            <VideoCameraOutlined style={{ color: REDWOOD_PRIMARY, marginRight: 8 }} />
            Select what to record
          </span>
        }
        open={sourceModal}
        onCancel={() => setSourceModal(false)}
        footer={null}
        width={560}
      >
        <Spin spinning={sourcesLoading}>
          <List
            grid={{ gutter: 12, column: 3 }}
            dataSource={sources}
            renderItem={(src: any) => (
              <List.Item style={{ marginBottom: 0 }}>
                <div
                  onClick={() => startRecording(src.id)}
                  style={{
                    cursor: 'pointer', borderRadius: 8, overflow: 'hidden',
                    border: '2px solid #e5e5e5', transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = REDWOOD_PRIMARY}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = '#e5e5e5'}
                >
                  {src.thumbnail ? (
                    <img src={src.thumbnail} alt={src.name} style={{ width: '100%', display: 'block', height: 80, objectFit: 'cover', background: '#000' }} />
                  ) : (
                    <div style={{ height: 80, background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <VideoCameraOutlined style={{ fontSize: 28, color: '#555' }} />
                    </div>
                  )}
                  <div style={{ padding: '6px 8px', background: '#fafafa' }}>
                    <Text ellipsis style={{ fontSize: 12, display: 'block' }} title={src.name}>{src.name}</Text>
                  </div>
                </div>
              </List.Item>
            )}
          />
        </Spin>
      </Modal>
    </>
  );
};

export default ScreenRecorder;
