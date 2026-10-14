import React from 'react';
interface Props {
  onNavigate?: (tab: string) => void;
  onOpenModes?: () => void;
  onOpenProfile?: () => void;
  onOpenSearch?: () => void;
  onOpenMeeting?: (id: string) => void;
}
export const AboutSection: React.FC<Props> = () => (
  <div className="space-y-3 p-2 text-text-primary">
    <h3 className="text-lg font-bold">Natively ProMax</h3>
    <p className="text-sm text-text-secondary">版本 {import.meta.env?.VITE_APP_VERSION || 'development'} · {import.meta.env?.VITE_BUILD_COMMIT?.slice(0, 8) || 'local'}</p>
    <p>本地桌面助手：聊天、截图提问、流式回答和局域网控制。</p>
  </div>
);
