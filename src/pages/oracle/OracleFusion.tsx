import React, { useRef, useState, useEffect } from 'react';
import { Layout, Typography, Space, Button, Input, Tooltip, Breadcrumb, Select, message } from 'antd';
import {
  HomeOutlined, ReloadOutlined, ArrowLeftOutlined, ArrowRightOutlined,
  VideoCameraOutlined, StopOutlined, PlusOutlined, LockOutlined,
} from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';

const { Text } = Typography;
const { Option } = Select;

const REDWOOD = '#C74634';

const FUSION_URLS = [
  { label: 'Oracle Fusion Home',       value: 'https://iaaobn.fa.ocs.oraclecloud.com/fscmUI/faces/FuseWelcome' },
  { label: 'Payables — Manage Invoices', value: 'https://iaaobn.fa.ocs.oraclecloud.com/fscmUI/faces/FuseTaskListManagerTop?fndGlobalItemNodeId=itemNode_payables_invoices' },
  { label: 'Payables — Manage Payments', value: 'https://iaaobn.fa.ocs.oraclecloud.com/fscmUI/faces/FuseTaskListManagerTop?fndGlobalItemNodeId=itemNode_payables_payments' },
  { label: 'General Ledger',            value: 'https://iaaobn.fa.ocs.oraclecloud.com/fscmUI/faces/FuseWelcome?fndGlobalItemNodeId=itemNode_general_ledger' },
  { label: 'Suppliers',                 value: 'https://iaaobn.fa.ocs.oraclecloud.com/fscmUI/faces/FuseTaskListManagerTop?fndGlobalItemNodeId=itemNode_procurement_suppliers' },
];

const isElectron = () => !!(window as any).electronAPI?.isElectron;
const formatTime = (s: number) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

const OracleFusion: React.FC = () => {
  const navigate = useNavigate();
  const webviewRef = useRef<any>(null);
  const [url, setUrl] = useState(FUSION_URLS[0].value);
  const [inputUrl, setInputUrl] = useState(FUSION_URLS[0].value);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoFwd, setCanGoFwd]   = useState(false);
  const [loading, setLoading]     = useState(false);

  // Recording
  const [recording, setRecording]         = useState(false);
  const [elapsed, setElapsed]             = useState(0);
  const timerRef                          = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRecorder                     = useRef<MediaRecorder | null>(null);
  const chunks                            = useRef<Blob[]>([]);
  const streamRef                         = useRef<MediaStream | null>(null);
  const elapsedRef                        = useRef(0);

  // Wire up webview events
  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv || !isElectron()) return;

    const onLoad    = () => { setLoading(false); setInputUrl(wv.getURL ? wv.getURL() : url); setCanGoBack(wv.canGoBack?.()); setCanGoFwd(wv.canGoForward?.()); };
    const onStart   = () => setLoading(true);
    const onFail    = () => setLoading(false);

    wv.addEventListener('did-finish-load', onLoad);
    wv.addEventListener('did-start-loading', onStart);
    wv.addEventListener('did-fail-load', onFail);
    return () => {
      wv.removeEventListener('did-finish-load', onLoad);
      wv.removeEventListener('did-start-loading', onStart);
      wv.removeEventListener('did-fail-load', onFail);
    };
  }, []);

  const navigate_to = (dest: string) => {
    const wv = webviewRef.current;
    setUrl(dest);
    setInputUrl(dest);
    if (wv) wv.src = dest;
  };

  const handleUrlInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      let dest = inputUrl.trim();
      if (dest && !dest.startsWith('http')) dest = 'https://' + dest;
      navigate_to(dest);
    }
  };

  // Recording
  const startRecording = async () => {
    if (!isElectron()) { message.warning('Recording only works in the desktop app'); return; }
    try {
      const sources = await (window as any).electronAPI.getScreenSources();
      // Pick the first screen (full screen) or the window
      const src = sources.find((s: any) => s.name.includes('Screen') || s.name.includes('Entire')) || sources[0];
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: src.id, minWidth: 1280, maxWidth: 1920, minHeight: 720, maxHeight: 1080 } } as any,
      });
      streamRef.current = stream;
      chunks.current = [];
      const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      rec.start(1000);
      mediaRecorder.current = rec;
      elapsedRef.current = 0;
      setElapsed(0);
      setRecording(true);
      timerRef.current = setInterval(() => { elapsedRef.current++; setElapsed(elapsedRef.current); }, 1000);
      message.success('Recording started — navigate Oracle Fusion as normal');
    } catch (e: any) {
      message.error('Could not start recording: ' + e.message);
    }
  };

  const stopRecording = () => {
    if (!mediaRecorder.current) return;
    mediaRecorder.current.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
    mediaRecorder.current.onstop = async () => {
      const blob = new Blob(chunks.current, { type: 'video/webm' });
      const buf = await blob.arrayBuffer();
      const now = new Date();
      const stamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}`;
      const result = await (window as any).electronAPI.saveRecording(
        Array.from(new Uint8Array(buf)),
        { title: `Oracle Fusion ${stamp}`, description: 'Recorded from Oracle Fusion WebView', category: 'Oracle Fusion', defaultName: `OracleFusion_${stamp}.webm`, duration: elapsedRef.current }
      );
      if (result?.success) {
        message.success(<span>Saved! <a onClick={() => navigate('/training')} style={{ textDecoration: 'underline' }}>View in Training Library</a></span>, 6);
      }
    };
  };

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); streamRef.current?.getTracks().forEach(t => t.stop()); }, []);

  return (
    <Layout style={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', background: '#1a1a2e' }}>
      {/* Breadcrumb */}
      <div style={{ padding: '10px 20px', background: '#fff', borderBottom: '1px solid #e5e5e5', flexShrink: 0 }}>
        <Breadcrumb items={[
          { title: <Link to="/home"><HomeOutlined /> Home</Link> },
          { title: 'Oracle Fusion' },
        ]} />
      </div>

      {/* Browser toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
        background: '#2b2b3b', flexShrink: 0,
      }}>
        {/* Nav buttons */}
        <Tooltip title="Back"><Button size="small" icon={<ArrowLeftOutlined />} disabled={!canGoBack} onClick={() => webviewRef.current?.goBack?.()} style={{ background: '#444', border: 'none', color: '#fff' }} /></Tooltip>
        <Tooltip title="Forward"><Button size="small" icon={<ArrowRightOutlined />} disabled={!canGoFwd} onClick={() => webviewRef.current?.goForward?.()} style={{ background: '#444', border: 'none', color: '#fff' }} /></Tooltip>
        <Tooltip title="Reload"><Button size="small" icon={<ReloadOutlined spin={loading} />} onClick={() => webviewRef.current?.reload?.()} style={{ background: '#444', border: 'none', color: '#fff' }} /></Tooltip>

        {/* Quick link dropdown */}
        <Select
          size="small"
          value={undefined}
          placeholder="Quick links"
          onChange={(v) => navigate_to(v)}
          style={{ width: 180 }}
        >
          {FUSION_URLS.map(f => <Option key={f.value} value={f.value}>{f.label}</Option>)}
        </Select>

        {/* URL bar */}
        <Input
          size="small"
          value={inputUrl}
          onChange={e => setInputUrl(e.target.value)}
          onKeyDown={handleUrlInput}
          prefix={<LockOutlined style={{ color: '#4caf50', fontSize: 11 }} />}
          style={{ flex: 1, background: '#3a3a4a', border: '1px solid #555', color: '#fff' }}
        />

        {/* Record controls */}
        {recording ? (
          <Button
            size="small"
            onClick={stopRecording}
            style={{ background: '#333', border: 'none', color: '#fff', display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff4444', display: 'inline-block', animation: 'pulse-rec 1s infinite' }} />
            <StopOutlined />
            <span style={{ fontWeight: 600 }}>{formatTime(elapsed)}</span>
          </Button>
        ) : (
          <Tooltip title="Record this session">
            <Button size="small" icon={<VideoCameraOutlined />} onClick={startRecording}
              style={{ background: REDWOOD, border: 'none', color: '#fff' }}>
              Record
            </Button>
          </Tooltip>
        )}

        <Tooltip title="Open Training Library">
          <Button size="small" onClick={() => navigate('/training')}
            style={{ background: '#1D7B4D', border: 'none', color: '#fff', fontSize: 11 }}>
            Training
          </Button>
        </Tooltip>
      </div>

      <style>{`@keyframes pulse-rec{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(1.35)}}`}</style>

      {/* WebView */}
      {isElectron() ? (
        <webview
          ref={webviewRef}
          src={url}
          // @ts-ignore
          disablewebsecurity="true"
          allowpopups="true"
          style={{ flex: 1, width: '100%' }}
        />
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: '#fff' }}>
          <Text style={{ color: '#fff', fontSize: 16 }}>Oracle Fusion WebView is only available in the desktop (Electron) app.</Text>
          <Text style={{ color: '#aaa' }}>Please use the installed ReactERP desktop app to access this feature.</Text>
        </div>
      )}
    </Layout>
  );
};

export default OracleFusion;
