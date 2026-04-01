import React, { useState, useRef } from 'react';
import {
  Modal, Form, Input, Select, Button, Upload, Space, Tag, Tooltip,
  message, Divider, Badge, List, Typography, Progress,
} from 'antd';
import {
  BugOutlined, PlusOutlined, DeleteOutlined, CameraOutlined,
  PaperClipOutlined, CloseOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useLocation } from 'react-router-dom';
import type { UploadFile } from 'antd/es/upload';

const { TextArea } = Input;
const { Option } = Select;
const { Text } = Typography;

const APEX_BASE = 'https://g15d6279501ae08-buimerc.adb.me-dubai-1.oraclecloudapps.com/ords/bcldifc/reerp';

// ── Page context map ─────────────────────────────────────────
const PAGE_MAP: Record<string, { module: string; pageName: string }> = {
  '/gl/manage-journals':          { module: 'General Ledger',   pageName: 'Manage Journals' },
  '/gl/account-analysis':         { module: 'General Ledger',   pageName: 'Account Analysis' },
  '/gl/chart-of-accounts':        { module: 'General Ledger',   pageName: 'Chart of Accounts' },
  '/gl/manage-structures':        { module: 'General Ledger',   pageName: 'Manage Structures' },
  '/gl/coa-segments':             { module: 'General Ledger',   pageName: 'COA Segments' },
  '/gl/account-combinations':     { module: 'General Ledger',   pageName: 'Account Combinations' },
  '/gl/accounting-periods':       { module: 'General Ledger',   pageName: 'Accounting Periods' },
  '/gl/trial-balance':            { module: 'General Ledger',   pageName: 'Trial Balance' },
  '/gl/create-journal':           { module: 'General Ledger',   pageName: 'Create Journal' },
  '/gl':                          { module: 'General Ledger',   pageName: 'GL Module Home' },
  '/ap/manage-invoices':          { module: 'Accounts Payable', pageName: 'Manage Invoices' },
  '/ap/manage-payments':          { module: 'Accounts Payable', pageName: 'Manage Payments' },
  '/ap/banks':                    { module: 'Accounts Payable', pageName: 'Banks & Accounts' },
  '/ap/suppliers':                { module: 'Accounts Payable', pageName: 'Manage Suppliers' },
  '/ap/sla-journals':             { module: 'Accounts Payable', pageName: 'SLA Journals' },
  '/ap/bank-transfers':           { module: 'Accounts Payable', pageName: 'Bank Transfers' },
  '/ap/external-transactions':    { module: 'Accounts Payable', pageName: 'External Transactions' },
  '/ap':                          { module: 'Accounts Payable', pageName: 'AP Module Home' },
  '/cash/external-transactions':  { module: 'Cash Management',  pageName: 'External Transactions' },
  '/cash/bank-transfers':         { module: 'Cash Management',  pageName: 'Bank Transfers' },
  '/cash/bank-statements':        { module: 'Cash Management',  pageName: 'Bank Statements' },
  '/cash/bank-reconciliation':    { module: 'Cash Management',  pageName: 'Bank Reconciliation' },
  '/cash':                        { module: 'Cash Management',  pageName: 'Cash Module Home' },
  '/sync':                        { module: 'Data Sync',        pageName: 'Sync Data' },
  '/admin/users':                 { module: 'Administration',   pageName: 'User Management' },
  '/admin':                       { module: 'Administration',   pageName: 'Admin Module Home' },
  '/support':                     { module: 'Support',          pageName: 'Support Module' },
  '/home':                        { module: 'General',          pageName: 'Home' },
};

function getPageContext(pathname: string): { module: string; pageName: string } {
  let bestKey = '';
  let ctx = { module: 'General', pageName: pathname };
  for (const [key, val] of Object.entries(PAGE_MAP)) {
    if (pathname.startsWith(key) && key.length > bestKey.length) {
      bestKey = key;
      ctx = val;
    }
  }
  return ctx;
}

// ── Types ─────────────────────────────────────────────────────
interface IssueLine {
  id: string;
  description: string;
}

interface Attachment {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  data: string;       // base64
  isScreenshot: boolean;
}

// ── Main component ────────────────────────────────────────────
const SupportTicketButton: React.FC = () => {
  const location  = useLocation();
  const [open, setOpen]         = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [capturing, setCapturing]   = useState(false);
  const [form] = Form.useForm();
  const [issues, setIssues]     = useState<IssueLine[]>([{ id: '1', description: '' }]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ctx = getPageContext(location.pathname);

  const handleOpen = () => {
    form.resetFields();
    form.setFieldsValue({ module: ctx.module, pageName: ctx.pageName, priority: 'MEDIUM' });
    setIssues([{ id: '1', description: '' }]);
    setAttachments([]);
    setOpen(true);
  };

  const handleClose = () => { setOpen(false); };

  // ── Issues list management ──────────────────────────────────
  const addIssue = () =>
    setIssues(prev => [...prev, { id: String(Date.now()), description: '' }]);

  const removeIssue = (id: string) =>
    setIssues(prev => prev.filter(i => i.id !== id));

  const updateIssue = (id: string, value: string) =>
    setIssues(prev => prev.map(i => i.id === id ? { ...i, description: value } : i));

  // ── Screenshot capture ────────────────────────────────────────
  const handleCapture = async () => {
    setOpen(false);          // hide modal first
    setCapturing(true);
    await new Promise(r => setTimeout(r, 600)); // wait for modal to fully hide

    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(document.documentElement, {
        useCORS: true,
        allowTaint: true,
        scale: 0.75,
        logging: false,
      });
      const dataUrl = canvas.toDataURL('image/png', 0.85);
      const base64  = dataUrl.split(',')[1];
      setAttachments(prev => [...prev, {
        id:           String(Date.now()),
        fileName:     `screenshot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
        fileType:     'image/png',
        fileSize:     Math.round(base64.length * 0.75),
        data:         base64,
        isScreenshot: true,
      }]);
      message.success('Screenshot captured');
    } catch {
      message.error('Could not capture screenshot');
    } finally {
      setCapturing(false);
      setOpen(true);
    }
  };

  // ── File upload ───────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach(file => {
      if (file.size > 5 * 1024 * 1024) { message.warning(`${file.name} exceeds 5 MB limit`); return; }
      const reader = new FileReader();
      reader.onload = ev => {
        const dataUrl = ev.target?.result as string;
        const base64  = dataUrl.split(',')[1];
        setAttachments(prev => [...prev, {
          id:           String(Date.now()) + file.name,
          fileName:     file.name,
          fileType:     file.type || 'application/octet-stream',
          fileSize:     file.size,
          data:         base64,
          isScreenshot: false,
        }]);
      };
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (id: string) =>
    setAttachments(prev => prev.filter(a => a.id !== id));

  // ── Submit ────────────────────────────────────────────────────
  const handleSubmit = async () => {
    let vals: any;
    try { vals = await form.validateFields(); } catch { return; }

    const nonEmptyIssues = issues.filter(i => i.description.trim());
    if (!nonEmptyIssues.length) {
      message.warning('Please describe at least one issue.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        title:       vals.title,
        description: vals.description ?? '',
        module:      vals.module,
        pageName:    vals.pageName,
        pageUrl:     window.location.hash,
        feature:     vals.feature ?? '',
        priority:    vals.priority,
        createdBy:   'ERP_USER',
        lines: nonEmptyIssues.map(i => ({ lineType: 'ISSUE', description: i.description })),
        attachments: attachments.map(a => ({
          fileName: a.fileName,
          fileType: a.fileType,
          fileSize: a.fileSize,
          data:     a.data,
        })),
      };

      const res  = await fetch(`${APEX_BASE}/support/tickets`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.status === 'success') {
        message.success(`Ticket ${data.ticketNumber || ''} created successfully`);
        setOpen(false);
      } else {
        message.error(data.message || 'Failed to create ticket');
      }
    } catch (e: any) {
      message.error('Network error: ' + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const fmt = (bytes: number) =>
    bytes < 1024 ? `${bytes} B`
    : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <>
      {/* ── Toolbar button ── */}
      <Tooltip title="Raise a Support Ticket" placement="bottom">
        <Button
          type="text"
          icon={<BugOutlined style={{ fontSize: 16, color: '#fff' }} />}
          onClick={handleOpen}
          style={{ color: '#fff' }}
        />
      </Tooltip>

      {/* ── Capture overlay ── */}
      {capturing && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.15)',
          pointerEvents: 'none',
        }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: '12px 24px', fontSize: 14 }}>
            Capturing screenshot…
          </div>
        </div>
      )}

      {/* ── Main modal ── */}
      <Modal
        title={
          <Space>
            <BugOutlined style={{ color: '#cf1322' }} />
            <span>Raise Support Ticket</span>
          </Space>
        }
        open={open && !capturing}
        onCancel={handleClose}
        width={720}
        footer={null}
        styles={{ body: { padding: '16px 24px', maxHeight: '80vh', overflowY: 'auto' } }}
      >
        <Form form={form} layout="vertical" requiredMark="optional">
          {/* Context row — read-only */}
          <div style={{
            background: '#f6f8ff', border: '1px solid #d6e0ff', borderRadius: 6,
            padding: '8px 12px', marginBottom: 14, display: 'flex', gap: 16, flexWrap: 'wrap',
          }}>
            <Text style={{ fontSize: 12 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>Module: </Text>
              <Text strong style={{ fontSize: 12 }}>{ctx.module}</Text>
            </Text>
            <Text style={{ fontSize: 12 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>Page: </Text>
              <Text strong style={{ fontSize: 12 }}>{ctx.pageName}</Text>
            </Text>
            <Text style={{ fontSize: 12 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>URL: </Text>
              <Text code style={{ fontSize: 11 }}>{window.location.hash}</Text>
            </Text>
          </div>

          {/* Hidden fields */}
          <Form.Item name="module"   hidden><Input /></Form.Item>
          <Form.Item name="pageName" hidden><Input /></Form.Item>

          <Form.Item label="Title" name="title" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="Brief summary of the issue" maxLength={500} showCount />
          </Form.Item>

          <div style={{ display: 'flex', gap: 12 }}>
            <Form.Item label="Priority" name="priority" style={{ flex: 1 }}>
              <Select>
                <Option value="LOW"><Tag color="default">LOW</Tag></Option>
                <Option value="MEDIUM"><Tag color="blue">MEDIUM</Tag></Option>
                <Option value="HIGH"><Tag color="orange">HIGH</Tag></Option>
                <Option value="CRITICAL"><Tag color="red">CRITICAL</Tag></Option>
              </Select>
            </Form.Item>
            <Form.Item label="Feature / Area" name="feature" style={{ flex: 2 }}>
              <Input placeholder="e.g. Bank Account Search, Journal Entry" />
            </Form.Item>
          </div>

          <Form.Item label="Description" name="description">
            <TextArea
              rows={3}
              placeholder="Optional — add more context, steps to reproduce, etc."
              maxLength={2000} showCount
            />
          </Form.Item>

          {/* Issues / sub-problems ─────────────────────────── */}
          <Divider style={{ margin: '8px 0 12px' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text strong style={{ fontSize: 13 }}>
              Issues <Tag color="blue" style={{ marginLeft: 4 }}>{issues.length}</Tag>
            </Text>
            <Button size="small" icon={<PlusOutlined />} onClick={addIssue}>Add Issue</Button>
          </div>

          {issues.map((issue, idx) => (
            <div key={issue.id} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
              <Text type="secondary" style={{ fontSize: 12, minWidth: 22, paddingTop: 6 }}>
                {idx + 1}.
              </Text>
              <TextArea
                rows={2}
                value={issue.description}
                onChange={e => updateIssue(issue.id, e.target.value)}
                placeholder={`Describe issue ${idx + 1}…`}
                style={{ flex: 1 }}
              />
              {issues.length > 1 && (
                <Button
                  type="text" danger size="small" icon={<DeleteOutlined />}
                  onClick={() => removeIssue(issue.id)}
                  style={{ marginTop: 4 }}
                />
              )}
            </div>
          ))}

          {/* Attachments ──────────────────────────────────────── */}
          <Divider style={{ margin: '8px 0 12px' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text strong style={{ fontSize: 13 }}>
              Attachments
              {attachments.length > 0 && <Tag color="blue" style={{ marginLeft: 4 }}>{attachments.length}</Tag>}
            </Text>
            <Space size={8}>
              <Button size="small" icon={<CameraOutlined />} onClick={handleCapture}>
                Capture Screen
              </Button>
              <Button
                size="small" icon={<PaperClipOutlined />}
                onClick={() => fileInputRef.current?.click()}
              >
                Upload File
              </Button>
              <input
                ref={fileInputRef} type="file" multiple
                accept="image/*,.pdf,.txt,.csv,.xlsx,.xls,.doc,.docx"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </Space>
          </div>

          {attachments.length > 0 && (
            <div style={{ border: '1px solid #f0f0f0', borderRadius: 6, padding: 8 }}>
              {attachments.map(a => (
                <div key={a.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 0', borderBottom: '1px solid #f9f9f9',
                }}>
                  {a.isScreenshot && a.fileType === 'image/png' && (
                    <img
                      src={`data:image/png;base64,${a.data}`}
                      alt={a.fileName}
                      style={{ width: 60, height: 36, objectFit: 'cover', borderRadius: 3, border: '1px solid #ddd' }}
                    />
                  )}
                  {(!a.isScreenshot || a.fileType !== 'image/png') && (
                    <PaperClipOutlined style={{ fontSize: 18, color: '#888' }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, display: 'block' }}>{a.fileName}</Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {a.fileType} · {fmt(a.fileSize)}
                      {a.isScreenshot && <Tag color="cyan" style={{ marginLeft: 6, fontSize: 10 }}>screenshot</Tag>}
                    </Text>
                  </div>
                  <Button
                    type="text" size="small" danger icon={<DeleteOutlined />}
                    onClick={() => removeAttachment(a.id)}
                  />
                </div>
              ))}
            </div>
          )}

          {attachments.length === 0 && (
            <Text type="secondary" style={{ fontSize: 12, display: 'block', textAlign: 'center', padding: '8px 0' }}>
              No attachments — use "Capture Screen" to take a screenshot or "Upload File" for files
            </Text>
          )}
        </Form>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
          <Button onClick={handleClose}>Cancel</Button>
          <Button
            type="primary" loading={submitting} onClick={handleSubmit}
            icon={<BugOutlined />}
            style={{ background: '#cf1322', borderColor: '#cf1322' }}
          >
            Submit Ticket
          </Button>
        </div>
      </Modal>
    </>
  );
};

export default SupportTicketButton;
