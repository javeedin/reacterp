import React, { useState, useRef, useEffect } from 'react';
import { Typography, Input, Tooltip, Badge } from 'antd';
import {
  RobotOutlined,
  SendOutlined,
  CloseOutlined,
  BulbOutlined,
  ThunderboltOutlined,
  LoadingOutlined,
} from '@ant-design/icons';

const { Text } = Typography;
const { TextArea } = Input;

// Oracle Redwood Color Palette
const REDWOOD = {
  primary: '#C74634',
  primaryLight: '#E85D4A',
  success: '#1D7B4D',
  warning: '#D4A800',
  info: '#0572CE',
  neutral100: '#F7F7F7',
  neutral200: '#E5E5E5',
  neutral300: '#C7C7C7',
  neutral600: '#6B6B6B',
  neutral900: '#1A1A1A',
  surface: '#FFFFFF',
  autopilotPurple: '#6B4EFF',
  autopilotGradient: 'linear-gradient(135deg, #6B4EFF 0%, #9D4EDD 100%)',
};

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface SuggestionItem {
  icon: React.ReactNode;
  label: string;
  command: string;
}

const suggestions: SuggestionItem[] = [
  { icon: <ThunderboltOutlined />, label: 'Sync journal batches', command: 'Sync all journal batches from Oracle Fusion' },
  { icon: <BulbOutlined />, label: 'Create journal entry', command: 'Help me create a new journal entry' },
  { icon: <ThunderboltOutlined />, label: 'Run trial balance', command: 'Generate trial balance report for current period' },
  { icon: <BulbOutlined />, label: 'Check period status', command: 'What is the current period status?' },
];

const Autopilot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'assistant',
      content: 'Hello! I\'m your ERP Autopilot assistant. I can help you with tasks like syncing data, creating journal entries, running reports, and more. What would you like to do?',
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 250);
  };

  const handleOpen = () => {
    setIsClosing(false);
    setIsOpen(true);
  };

  const handleSend = async () => {
    if (!inputValue.trim() || isProcessing) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsProcessing(true);

    // Simulate AI response (replace with actual API call)
    setTimeout(() => {
      const response = generateResponse(userMessage.content);
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: response,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsProcessing(false);
    }, 1500);
  };

  const generateResponse = (input: string): string => {
    const lowerInput = input.toLowerCase();

    if (lowerInput.includes('sync') && lowerInput.includes('journal')) {
      return 'I\'ll help you sync journal batches. Navigate to Sync Data page and I\'ll guide you through the process. Would you like me to take you there?';
    }
    if (lowerInput.includes('create') && lowerInput.includes('journal')) {
      return 'To create a journal entry:\n1. Go to General Ledger → Tasks\n2. Click "Create Journal"\n3. Fill in the header details\n4. Add journal lines with debits and credits\n5. Submit for approval\n\nWould you like me to open the journal entry form?';
    }
    if (lowerInput.includes('trial balance') || lowerInput.includes('report')) {
      return 'I can help you generate reports. Go to General Ledger → Reports → Trial Balance. Select the period and ledger, then click "Run Report". Shall I navigate you there?';
    }
    if (lowerInput.includes('period') && lowerInput.includes('status')) {
      return 'Current Period Status:\n• GL Period: Dec-2024 (Open)\n• AP Period: Dec-2024 (Open)\n• AR Period: Dec-2024 (Open)\n\nPeriod close progress: 67% complete.';
    }
    if (lowerInput.includes('help')) {
      return 'I can assist you with:\n• Data synchronization from Oracle Fusion\n• Creating and posting journal entries\n• Running financial reports\n• Managing periods\n• Navigating modules\n\nJust tell me what you\'d like to do!';
    }

    return 'I understand you want to ' + input.toLowerCase() + '. Let me help you with that. Could you provide more details about what specifically you\'d like to accomplish?';
  };

  const handleSuggestionClick = (command: string) => {
    setInputValue(command);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* Floating Button */}
      <Tooltip title={isOpen ? '' : 'Autopilot Assistant'} placement="right">
        <div
          onClick={isOpen ? handleClose : handleOpen}
          style={{
            position: 'fixed',
            left: 24,
            bottom: 24,
            width: 60,
            height: 60,
            borderRadius: '50%',
            background: REDWOOD.autopilotGradient,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(107, 78, 255, 0.4)',
            transition: 'all 0.3s ease',
            zIndex: 1002,
            transform: isOpen ? 'scale(0.9)' : 'scale(1)',
          }}
          onMouseEnter={(e) => {
            if (!isOpen) {
              e.currentTarget.style.transform = 'scale(1.1)';
              e.currentTarget.style.boxShadow = '0 6px 24px rgba(107, 78, 255, 0.5)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = isOpen ? 'scale(0.9)' : 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(107, 78, 255, 0.4)';
          }}
        >
          <Badge dot={!isOpen} offset={[-5, 5]} color={REDWOOD.success}>
            <RobotOutlined style={{ fontSize: 28, color: '#fff' }} />
          </Badge>
        </div>
      </Tooltip>

      {/* Chat Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            left: 24,
            bottom: 100,
            width: 420,
            height: 520,
            background: REDWOOD.surface,
            borderRadius: 16,
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 1001,
            animation: isClosing ? 'autopilotOut 0.25s ease-in forwards' : 'autopilotIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '16px 20px',
              background: REDWOOD.autopilotGradient,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <RobotOutlined style={{ fontSize: 20, color: '#fff' }} />
              </div>
              <div>
                <Text strong style={{ color: '#fff', fontSize: 16, display: 'block' }}>
                  Autopilot
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                  AI-powered assistant
                </Text>
              </div>
            </div>
            <CloseOutlined
              style={{ color: '#fff', cursor: 'pointer', fontSize: 16, padding: 8 }}
              onClick={handleClose}
            />
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 16,
              background: REDWOOD.neutral100,
            }}
          >
            {messages.map((message) => (
              <div
                key={message.id}
                style={{
                  display: 'flex',
                  justifyContent: message.type === 'user' ? 'flex-end' : 'flex-start',
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    maxWidth: '85%',
                    padding: '12px 16px',
                    borderRadius: message.type === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    background: message.type === 'user' ? REDWOOD.autopilotPurple : REDWOOD.surface,
                    color: message.type === 'user' ? '#fff' : REDWOOD.neutral900,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                    whiteSpace: 'pre-line',
                    fontSize: 14,
                    lineHeight: 1.5,
                  }}
                >
                  {message.content}
                </div>
              </div>
            ))}

            {isProcessing && (
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 12 }}>
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: '16px 16px 16px 4px',
                    background: REDWOOD.surface,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                  }}
                >
                  <LoadingOutlined style={{ color: REDWOOD.autopilotPurple, fontSize: 18 }} />
                  <Text style={{ marginLeft: 8, color: REDWOOD.neutral600 }}>Thinking...</Text>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Suggestions */}
          {messages.length <= 2 && (
            <div style={{ padding: '12px 16px', borderTop: `1px solid ${REDWOOD.neutral200}` }}>
              <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Suggestions
              </Text>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {suggestions.map((suggestion, index) => (
                  <div
                    key={index}
                    onClick={() => handleSuggestionClick(suggestion.command)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 20,
                      background: `${REDWOOD.autopilotPurple}10`,
                      border: `1px solid ${REDWOOD.autopilotPurple}30`,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = `${REDWOOD.autopilotPurple}20`;
                      e.currentTarget.style.borderColor = REDWOOD.autopilotPurple;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = `${REDWOOD.autopilotPurple}10`;
                      e.currentTarget.style.borderColor = `${REDWOOD.autopilotPurple}30`;
                    }}
                  >
                    <span style={{ color: REDWOOD.autopilotPurple, fontSize: 12 }}>{suggestion.icon}</span>
                    <Text style={{ fontSize: 12, color: REDWOOD.neutral900 }}>{suggestion.label}</Text>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div
            style={{
              padding: 16,
              borderTop: `1px solid ${REDWOOD.neutral200}`,
              background: REDWOOD.surface,
            }}
          >
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
              <TextArea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask me anything..."
                autoSize={{ minRows: 1, maxRows: 4 }}
                style={{
                  flex: 1,
                  borderRadius: 12,
                  resize: 'none',
                  fontSize: 14,
                }}
              />
              <div
                onClick={handleSend}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background: inputValue.trim() ? REDWOOD.autopilotGradient : REDWOOD.neutral200,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: inputValue.trim() ? 'pointer' : 'default',
                  transition: 'all 0.2s',
                }}
              >
                <SendOutlined style={{ color: inputValue.trim() ? '#fff' : REDWOOD.neutral600, fontSize: 18 }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSS Animations */}
      <style>{`
        @keyframes autopilotIn {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes autopilotOut {
          from {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          to {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
        }
      `}</style>
    </>
  );
};

export default Autopilot;
