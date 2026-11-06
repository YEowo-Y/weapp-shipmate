import type { SettingsSection } from './types';

export const settingsSections: { id: SettingsSection; label: string; icon: string; group: string }[] = [
  { id: 'appearance', label: '外观与阅读', icon: 'sliders-horizontal', group: '偏好' },
  { id: 'notifications', label: '通知', icon: 'bell', group: '偏好' },
  { id: 'shortcuts', label: '快捷键', icon: 'command', group: '偏好' },
  { id: 'models', label: '模型与连接', icon: 'plug', group: '工作区' },
  { id: 'projects', label: '项目配置', icon: 'folder', group: '工作区' },
  { id: 'data', label: '数据与会话', icon: 'message-square', group: '工作区' },
  { id: 'privacy', label: '隐私与权限', icon: 'shield', group: '应用' },
  { id: 'about', label: '关于', icon: 'info', group: '应用' },
];

type SearchItem = { section: SettingsSection; title: string; target: string; keywords: string };
export const settingsItems: SearchItem[] = [
  { section: 'appearance', title: '主题模式', target: 'desktop-theme-system', keywords: 'theme dark light 系统 浅色 深色 颜色 外观' },
  { section: 'appearance', title: '正文大小', target: 'desktop-message-size-16', keywords: 'font 字体 字号 阅读 文字 对话 报告' },
  { section: 'appearance', title: '界面动效', target: 'desktop-motion-system', keywords: 'motion 动画 减少动效 系统' },
  { section: 'appearance', title: '恢复外观默认', target: 'preferences-reset', keywords: '重置 reset 恢复' },
  { section: 'notifications', title: '系统通知', target: 'system-notifications-enabled', keywords: 'notification 通知 提醒 权限' },
  { section: 'notifications', title: '测试通知', target: 'system-notifications-test', keywords: '测试 提交 发送 通知' },
  { section: 'shortcuts', title: '发送消息', target: 'settings-send-key', keywords: 'enter ctrl 回车 发送 换行 快捷键 keyboard' },
  { section: 'shortcuts', title: '键盘操作', target: 'settings-keyboard-list', keywords: 'keyboard shortcut 快捷键 模型选择 搜索 设置 escape esc' },
  { section: 'models', title: '服务商与凭据', target: 'desktop-connection-editor-toggle', keywords: 'api key token 密钥 授权 连接 openai claude anthropic google ollama deepseek glm kimi openrouter' },
  { section: 'models', title: '模型目录与选择', target: 'desktop-model-search', keywords: 'model 模型 搜索 选择 默认 刷新' },
  { section: 'projects', title: '项目与目录', target: 'project-settings-select', keywords: '项目 文件夹 路径 主体 目录 绑定 重命名' },
  { section: 'projects', title: '文件监听与提醒', target: 'maintenance-watch', keywords: 'watch 自动 监听 文件 变更 维护 提醒' },
  { section: 'data', title: '会话备份与导入', target: 'settings-session-data', keywords: 'export import 导出 导入 备份 恢复 聊天 会话 数据' },
  { section: 'data', title: '项目备份与恢复', target: 'settings-project-backup', keywords: '项目 备份 导入 导出 恢复' },
  { section: 'data', title: '归档会话', target: 'settings-archives', keywords: 'archive 归档 历史 聊天 恢复' },
  { section: 'privacy', title: '当前会话授权', target: 'settings-permissions', keywords: '授权 权限 隐私 读取 项目 分享 外发 撤销' },
  { section: 'privacy', title: '本机数据与凭据', target: 'settings-storage', keywords: '隐私 privacy 数据 保存 本机 存储 凭据' },
  { section: 'about', title: '版本信息', target: 'settings-versions', keywords: 'about 关于 版本 内核 规则' },
  { section: 'about', title: '规则来源', target: 'settings-sources', keywords: '官方 来源 依据 核验 更新 规则' },
  { section: 'about', title: '开源许可', target: 'settings-licenses', keywords: 'license 开源 许可 MIT' },
];

export function searchSettings(query: string, notifications = true) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return settingsItems.filter(item => (notifications || item.section !== 'notifications') && terms.every(term =>
    `${item.title} ${item.keywords} ${settingsSections.find(section => section.id === item.section)?.label}`.toLocaleLowerCase().includes(term)));
}
