import React from 'react';
interface Props {
  onNavigate?: (tab: string) => void;
  onOpenModes?: () => void;
  onOpenProfile?: () => void;
  platform?: string;
}
export const HelpSettings: React.FC<Props> = ({ onNavigate }) => (
  <div className="space-y-5 p-2 text-text-primary">
    <h3 className="text-lg font-bold">ProMax 使用帮助</h3>
    <p>在 AI Providers 中配置自己的 API 或本地模型，然后开始聊天。截图与音频功能需要操作系统授权。</p>
    <p>手机与电脑连接同一局域网，在 Sync 中查看访问地址。手机点击“截图并发送”即可让电脑截图并提问。</p>
    <div className="flex gap-3">
      {['ai-providers', 'audio', 'phone-mirror'].map((tab, i) => (
        <button key={tab} className="rounded-lg border border-border-subtle p-3" onClick={() => onNavigate?.(tab)}>
          {['AI Providers', 'Audio', 'Sync'][i]}
        </button>
      ))}
    </div>
  </div>
);
