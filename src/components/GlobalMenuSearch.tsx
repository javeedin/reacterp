import React, { useState, useRef } from 'react';
import { Select, Tag, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { MENU_ITEMS_GROUPED, type MenuSearchItem } from '../data/menuItems';

const { Text } = Typography;

// Short badge color per module
const MODULE_COLORS: Record<string, string> = {
  GL:   '#1677ff',
  FA:   '#722ed1',
  AP:   '#d46b08',
  CASH: '#08979c',
  PC:   '#389e0d',
  RM:   '#c41d7f',
  PMS:  '#1d39c4',
  PROC: '#d48806',
  ADMIN:'#cf1322',
  SYNC: '#531dab',
  SUPP: '#0958d9',
  EXT:  '#595959',
  HOME: '#C74634',
};

const GlobalMenuSearch: React.FC = () => {
  const navigate  = useNavigate();
  const [open, setOpen] = useState(false);
  const selectRef = useRef<any>(null);

  const handleSelect = (path: string) => {
    setOpen(false);
    if (selectRef.current) selectRef.current.blur();
    navigate(path);
  };

  return (
    <Select
      ref={selectRef}
      showSearch
      open={open}
      onDropdownVisibleChange={setOpen}
      placeholder={
        <span style={{ color: 'rgba(0,0,0,0.45)', fontSize: 13 }}>
          <SearchOutlined style={{ marginRight: 6 }} />
          Search menu…
        </span>
      }
      suffixIcon={<SearchOutlined style={{ color: '#999', pointerEvents: 'none' }} />}
      filterOption={(input, option: any) =>
        option?.searchText?.includes(input.toLowerCase()) ?? false
      }
      onSelect={handleSelect}
      value={null}
      options={MENU_ITEMS_GROUPED}
      optionRender={(opt) => {
        const item: MenuSearchItem = (opt.data as any).item;
        return (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '2px 0' }}>
            <Tag
              color={MODULE_COLORS[item.module] || '#999'}
              style={{ fontSize: 10, lineHeight: '18px', padding: '0 5px', minWidth: 38, textAlign: 'center', flexShrink: 0, marginTop: 1 }}
            >
              {item.module}
            </Tag>
            <div style={{ minWidth: 0 }}>
              <Text style={{ fontSize: 13, display: 'block' }}>{item.label}</Text>
              {item.description && (
                <Text type="secondary" style={{ fontSize: 11 }}>{item.description}</Text>
              )}
            </div>
          </div>
        );
      }}
      style={{
        width: 240,
        background: '#fff',
        borderRadius: 6,
      }}
      styles={{
        popup: {
          root: { maxHeight: 420, minWidth: 340 },
        },
      }}
      notFoundContent={
        <div style={{ padding: '8px 12px', color: '#999', fontSize: 13 }}>
          No pages found
        </div>
      }
    />
  );
};

export default GlobalMenuSearch;
