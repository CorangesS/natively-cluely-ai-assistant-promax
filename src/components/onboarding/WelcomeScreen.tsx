import React from 'react';
import { useWelcomeTheme, LavenderButton } from './welcomeShared';

export const WelcomeLeft: React.FC<{ onGetStarted: () => void }> = ({ onGetStarted }) => {
  const theme = useWelcomeTheme();
  return (
    <div role="main" aria-labelledby="welcome-title" className="flex-1 min-w-0 h-full flex flex-col items-center justify-center text-center gap-6 px-12">
      <h1 id="welcome-title" style={{ color: theme.strong, fontSize: 36 }}>Natively ProMax</h1>
      <p style={{ color: theme.body }}>先在 AI Providers 中配置自己的 API 或本地模型，再开始聊天与截图提问。</p>
      <p style={{ color: theme.quiet }}>手机与电脑连接同一局域网后，可通过 Sync 中的地址访问。</p>
      <LavenderButton t={theme} width={280} onClick={onGetStarted}>查看快捷键</LavenderButton>
    </div>
  );
};
