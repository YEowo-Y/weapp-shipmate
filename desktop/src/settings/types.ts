export type SettingsSection = 'appearance' | 'notifications' | 'shortcuts' | 'models' | 'projects' | 'data' | 'privacy' | 'about';

/** The business controller owns state; settings owns the visible host and navigation. */
export type SettingsPanel = {
  element: HTMLElement;
  open(): void | Promise<void>;
  close(): void;
  canClose?(): boolean;
  searchTarget?(target: string): HTMLElement | null;
};
export type PrivacyState = { allowRead: boolean; shareResults: boolean; busy: boolean; projectName: string | null };
export type VersionInfo = { desktop: string; core: string; rules: string | null };

export type SettingsOptions = {
  getPanel(section: 'models' | 'data' | 'projects'): SettingsPanel | null | Promise<SettingsPanel | null>;
  systemNotifications?: SettingsPanel & { destroy(): void };
  getPrivacy(): PrivacyState | Promise<PrivacyState>;
  subscribePrivacy?(listener: () => void): () => void;
  revokePermissions(): void | Promise<void>;
  getVersions(): VersionInfo | Promise<VersionInfo>;
  copyText?(text: string): Promise<void>;
  onSources(anchor: HTMLElement): void;
  onArchives(anchor: HTMLElement): void;
  onRepository(): void | Promise<void>;
};
