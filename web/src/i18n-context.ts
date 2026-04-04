import { createContext, useContext } from 'react';

import type { SessionRole } from './types/app';

export type SupportedLocale = 'en' | 'zh-CN';

type Messages = {
  localeName: string;
  appName: string;
  sessionRole: (role: SessionRole) => string;
  sessionRoleMenuLabel: (role: SessionRole) => string;
  version: string;
  authChecking: string;
  authPrompt: string;
  accessCode: string;
  pasteAccessCode: string;
  unlocking: string;
  unlockApp: string;
  backendSettings: string;
  save: string;
  saving: string;
  newAdminCode: string;
  newViewerCode: string;
  leaveBlankToKeepCurrent: string;
  currentSessionTarget: string;
  notLoaded: string;
  gatewayTargets: string;
  addTarget: string;
  defaultForNewSessions: string;
  remove: string;
  name: string;
  id: string;
  test: string;
  testing: string;
  tlsServerName: string;
  tlsServerNamePlaceholder: string;
  tlsServerNameHint: string;
  customHeaders: string;
  addHeader: string;
  noCustomHeaders: string;
  headerName: string;
  headerValue: string;
  view: string;
  logs: string;
  backend: string;
  current: string;
  language: string;
  theme: string;
  themeSystem: string;
  themeLight: string;
  themeDark: string;
  signedInAs: (role: SessionRole) => string;
  signOut: string;
  updateAvailable: string;
  updateAvailableMessage: string;
  refreshToUpdate: string;
  queryEntryLimit: string;
  selectGatewayTarget: string;
  setEndTimeToNow: string;
  now: string;
  setEndTime: string;
  chooseEndDate: string;
  setTime: string;
  endDate: string;
  chooseEndTime: string;
  endTime: string;
  endTimeAria: string;
  toggleLiveTail: string;
  liveTailOnlyWhenNow: string;
  live: string;
  removeFilter: (label: string) => string;
  addFieldOrKeyword: string;
  resetFilters: string;
  viewingLiveEnd: string;
  showingLatestAtOrBefore: (dateTime: string) => string;
  priority: string;
  sourceUnit: string;
  anyUnit: string;
  syslogId: string;
  anyId: string;
  hostname: string;
  anyHost: string;
  bootId: string;
  anyBoot: string;
  commandName: string;
  anyComm: string;
  transport: string;
  anyTransport: string;
  unlistedFieldsHint: string;
  collapseFilters: string;
  expandFilters: string;
  closeFilters: string;
  openFilters: string;
  timestamp: string;
  source: string;
  message: string;
  newestFirst: string;
  oldestFirst: string;
  refetch: string;
  clearFeed: string;
  filteringLogs: string;
  noLogsMatch: string;
  loadedWindowCapped: (count: string) => string;
  eventDetails: string;
  applyFilterFrom: (field: string) => string;
  filter: string;
  runningQuery: string;
  queryFailed: (error: string) => string;
  requestFailed: string;
  waitingForQuery: string;
  searchItems: string;
  noMatchesFound: string;
  addPriority: string;
  allPrioritiesSelected: string;
  priorityLabel: (priority: string) => string;
  unknownTime: string;
  unknownSource: string;
  sessionExpired: string;
  authenticationRequired: string;
  invalidSessionResponse: string;
  failedToLoadSession: string;
  enterAccessCode: string;
  accessCodeRejected: string;
  invalidLoginResponse: string;
  loginFailed: string;
  failedToLoadAdminConfig: string;
  gatewayTargetRequired: string;
  gatewayTargetFieldsRequired: string;
  gatewayHeaderFieldsRequired: string;
  savedBackendSettings: string;
  failedToSaveBackendSettings: string;
  failedToSwitchGatewayTarget: string;
  enterUrlFirst: string;
  reachableHttp: (status: number) => string;
  connectionTestFailed: string;
  addressFieldsCannotBeUsed: (field: string) => string;
  invalidFieldName: (field: string) => string;
};

const LOCALE_STORAGE_KEY = 'journal-scope:locale';

const priorityLabels = {
  en: {
    '0': 'Emergency',
    '1': 'Alert',
    '2': 'Critical',
    '3': 'Error',
    '4': 'Warning',
    '5': 'Notice',
    '6': 'Info',
    '7': 'Debug'
  },
  'zh-CN': {
    '0': '紧急',
    '1': '警报',
    '2': '严重',
    '3': '错误',
    '4': '警告',
    '5': '通知',
    '6': '信息',
    '7': '调试'
  }
} satisfies Record<SupportedLocale, Record<string, string>>;

const messages: Record<SupportedLocale, Messages> = {
  en: {
    localeName: 'English',
    appName: 'Journal Scope',
    sessionRole: (role) => role === 'admin' ? 'Admin' : 'Viewer',
    sessionRoleMenuLabel: (role) => role === 'admin' ? 'admin' : 'viewer',
    version: 'Version',
    authChecking: 'Checking current session…',
    authPrompt: 'Enter a viewer or admin access code to unlock the log view.',
    accessCode: 'Access Code',
    pasteAccessCode: 'Paste access code',
    unlocking: 'Unlocking…',
    unlockApp: 'Unlock Journal Scope',
    backendSettings: 'Backend Settings',
    save: 'Save',
    saving: 'Saving…',
    newAdminCode: 'New Admin Code',
    newViewerCode: 'New Viewer Code',
    leaveBlankToKeepCurrent: 'Leave blank to keep current',
    currentSessionTarget: 'Current session Journal Gateway',
    notLoaded: 'not loaded',
    gatewayTargets: 'Journal Gateways',
    addTarget: 'Add Journal Gateway',
    defaultForNewSessions: 'Default Journal Gateway for new sessions',
    remove: 'Remove',
    name: 'Name',
    id: 'ID',
    test: 'Test',
    testing: 'Testing…',
    tlsServerName: 'TLS Server Name',
    tlsServerNamePlaceholder: 'Optional, defaults to URL hostname',
    tlsServerNameHint: 'Leave blank to validate TLS against the hostname in the target URL.',
    customHeaders: 'Custom Headers',
    addHeader: 'Add Header',
    noCustomHeaders: 'No custom headers for this Journal Gateway.',
    headerName: 'Header name',
    headerValue: 'Header value',
    view: 'View',
    logs: 'Logs',
    backend: 'Backend',
    current: 'Current',
    language: 'Language',
    theme: 'Theme',
    themeSystem: 'System',
    themeLight: 'Light',
    themeDark: 'Dark',
    signedInAs: (role) => `Signed In As ${role}`,
    signOut: 'Sign Out',
    updateAvailable: 'Update available',
    updateAvailableMessage: 'A newer build has been installed and is ready to use.',
    refreshToUpdate: 'Refresh now',
    queryEntryLimit: 'Query entry limit',
    selectGatewayTarget: 'Select Journal Gateway',
    setEndTimeToNow: 'Set end time to now',
    now: 'Now',
    setEndTime: 'Set end time',
    chooseEndDate: 'Choose end date',
    setTime: 'Set Time',
    endDate: 'End date',
    chooseEndTime: 'Choose end time',
    endTime: 'End Time',
    endTimeAria: 'Set end time',
    toggleLiveTail: 'Toggle live tail',
    liveTailOnlyWhenNow: 'Live tail is available only when End Time is set to Now',
    live: 'Live',
    removeFilter: (label) => `Remove ${label}`,
    addFieldOrKeyword: 'Add FIELD=value or keyword',
    resetFilters: 'Reset filters',
    viewingLiveEnd: 'Viewing the live end of the stream',
    showingLatestAtOrBefore: (dateTime) => `Showing latest matches at or before ${dateTime}`,
    priority: 'Priority',
    sourceUnit: 'Source Unit',
    anyUnit: 'Any Unit',
    syslogId: 'Syslog ID',
    anyId: 'Any ID',
    hostname: 'Hostname',
    anyHost: 'Any Host',
    bootId: 'Boot ID',
    anyBoot: 'Any Boot',
    commandName: 'Command Name',
    anyComm: 'Any _COMM',
    transport: 'Transport',
    anyTransport: 'Any Transport',
    unlistedFieldsHint: 'Unlisted fields can be added in the filter bar above.',
    collapseFilters: 'Collapse filters',
    expandFilters: 'Expand filters',
    closeFilters: 'Close filters',
    openFilters: 'Open filters',
    timestamp: 'TIMESTAMP',
    source: 'Source',
    message: 'Message',
    newestFirst: 'Newest first. Click to switch to oldest first.',
    oldestFirst: 'Oldest first. Click to switch to newest first.',
    refetch: 'Refetch',
    clearFeed: 'Clear Feed',
    filteringLogs: 'Filtering logs...',
    noLogsMatch: 'No logs match the current filters.',
    loadedWindowCapped: (count) => `Loaded window capped at ${count} entries. Narrow the query or reconnect with a lower limit.`,
    eventDetails: 'Event Details',
    applyFilterFrom: (field) => `Apply filter from ${field}`,
    filter: 'Filter',
    runningQuery: 'Running query...',
    queryFailed: (error) => `Query failed: ${error}`,
    requestFailed: 'Request failed',
    waitingForQuery: 'Waiting for endpoint or automatic query...',
    searchItems: 'Search items...',
    noMatchesFound: 'No matches found',
    addPriority: 'Add Priority',
    allPrioritiesSelected: 'All priorities selected',
    priorityLabel: (priority) => priorityLabels.en[priority] ? `${priorityLabels.en[priority]} (${priority})` : priority,
    unknownTime: 'UNKNOWN TIME',
    unknownSource: 'unknown',
    sessionExpired: 'Session expired. Enter an access code to continue.',
    authenticationRequired: 'Authentication required',
    invalidSessionResponse: 'Invalid session response',
    failedToLoadSession: 'Failed to load session',
    enterAccessCode: 'Enter an access code.',
    accessCodeRejected: 'Access code rejected.',
    invalidLoginResponse: 'Invalid login response',
    loginFailed: 'Login failed',
    failedToLoadAdminConfig: 'Failed to load admin config',
    gatewayTargetRequired: 'At least one Journal Gateway is required.',
    gatewayTargetFieldsRequired: 'Each Journal Gateway requires id, name, and URL.',
    gatewayHeaderFieldsRequired: 'Each gateway header requires both a name and a value.',
    savedBackendSettings: 'Saved backend settings.',
    failedToSaveBackendSettings: 'Failed to save backend settings',
    failedToSwitchGatewayTarget: 'Failed to switch Journal Gateway',
    enterUrlFirst: 'Enter a URL first.',
    reachableHttp: (status) => `Reachable · HTTP ${status}`,
    connectionTestFailed: 'Connection test failed',
    addressFieldsCannotBeUsed: (field) => `Address fields cannot be used as filters: ${field}`,
    invalidFieldName: (field) => `Invalid field name: ${field}`
  },
  'zh-CN': {
    localeName: '简体中文',
    appName: 'Journal Scope',
    sessionRole: (role) => role === 'admin' ? '管理员' : '访客',
    sessionRoleMenuLabel: (role) => role === 'admin' ? '管理员' : '访客',
    version: '版本',
    authChecking: '正在检查当前会话…',
    authPrompt: '输入访客或管理员访问码以解锁日志视图。',
    accessCode: '访问码',
    pasteAccessCode: '粘贴访问码',
    unlocking: '正在解锁…',
    unlockApp: '解锁 Journal Scope',
    backendSettings: '后端设置',
    save: '保存',
    saving: '保存中…',
    newAdminCode: '新的管理员访问码',
    newViewerCode: '新的访客访问码',
    leaveBlankToKeepCurrent: '留空则保持当前值',
    currentSessionTarget: '当前会话 Journal Gateway',
    notLoaded: '未加载',
    gatewayTargets: 'Journal Gateways',
    addTarget: '添加 Journal Gateway',
    defaultForNewSessions: '设为新会话默认 Journal Gateway',
    remove: '删除',
    name: '名称',
    id: 'ID',
    test: '测试',
    testing: '测试中…',
    tlsServerName: 'TLS 服务器名',
    tlsServerNamePlaceholder: '可选，默认使用 URL 主机名',
    tlsServerNameHint: '留空时将使用目标 URL 中的主机名进行 TLS 校验。',
    customHeaders: '自定义请求头',
    addHeader: '添加请求头',
    noCustomHeaders: '此 Journal Gateway 暂无自定义请求头。',
    headerName: '请求头名称',
    headerValue: '请求头值',
    view: '视图',
    logs: '日志',
    backend: '后端',
    current: '当前',
    language: '语言',
    theme: '主题',
    themeSystem: '跟随系统',
    themeLight: '浅色',
    themeDark: '深色',
    signedInAs: (role) => `当前身份：${role === 'admin' ? 'admin' : 'viewer'}`,
    signOut: '退出登录',
    updateAvailable: '有可用更新',
    updateAvailableMessage: '检测到新版本，刷新后即可使用。',
    refreshToUpdate: '立即刷新',
    queryEntryLimit: '查询条目上限',
    selectGatewayTarget: '选择 Journal Gateway',
    setEndTimeToNow: '将结束时间设为当前',
    now: '现在',
    setEndTime: '设置结束时间',
    chooseEndDate: '选择结束日期',
    setTime: '设置时间',
    endDate: '结束日期',
    chooseEndTime: '选择结束时间',
    endTime: '结束时间',
    endTimeAria: '设置结束时间',
    toggleLiveTail: '切换实时追踪',
    liveTailOnlyWhenNow: '只有结束时间设为“现在”时才能启用实时追踪',
    live: '实时',
    removeFilter: (label) => `移除 ${label}`,
    addFieldOrKeyword: '添加 FIELD=value 或关键字',
    resetFilters: '重置筛选',
    viewingLiveEnd: '正在查看实时日志流尾部',
    showingLatestAtOrBefore: (dateTime) => `显示 ${dateTime} 及之前的最新匹配结果`,
    priority: '日志级别',
    sourceUnit: '来源 Unit',
    anyUnit: '全部来源 Unit',
    syslogId: 'Syslog 标识',
    anyId: '全部 Syslog 标识',
    hostname: '主机名',
    anyHost: '全部主机名',
    bootId: 'Boot ID',
    anyBoot: '全部 Boot ID',
    commandName: '进程名',
    anyComm: '全部进程名',
    transport: '日志通道',
    anyTransport: '全部日志通道',
    unlistedFieldsHint: '未列出的字段可以在上方筛选栏中添加。',
    collapseFilters: '收起筛选器',
    expandFilters: '展开筛选器',
    closeFilters: '关闭筛选器',
    openFilters: '打开筛选器',
    timestamp: '时间戳',
    source: '来源',
    message: '消息',
    newestFirst: '当前按最新优先显示，点击切换为最旧优先。',
    oldestFirst: '当前按最旧优先显示，点击切换为最新优先。',
    refetch: '重新获取',
    clearFeed: '清空日志',
    filteringLogs: '正在筛选日志…',
    noLogsMatch: '没有日志符合当前筛选条件。',
    loadedWindowCapped: (count) => `已加载窗口上限为 ${count} 条。请缩小查询范围，或使用更低的限制重新连接。`,
    eventDetails: '日志详情',
    applyFilterFrom: (field) => `从 ${field} 应用筛选`,
    filter: '筛选',
    runningQuery: '正在查询…',
    queryFailed: (error) => `查询失败：${error}`,
    requestFailed: '请求失败',
    waitingForQuery: '正在等待端点响应或自动查询…',
    searchItems: '搜索…',
    noMatchesFound: '未找到匹配项',
    addPriority: '添加日志级别',
    allPrioritiesSelected: '已选择所有日志级别',
    priorityLabel: (priority) => priorityLabels['zh-CN'][priority] ? `${priorityLabels['zh-CN'][priority]} (${priority})` : priority,
    unknownTime: '未知时间',
    unknownSource: '未知来源',
    sessionExpired: '会话已过期，请重新输入访问码继续。',
    authenticationRequired: '需要身份验证',
    invalidSessionResponse: '会话响应无效',
    failedToLoadSession: '加载会话失败',
    enterAccessCode: '请输入访问码。',
    accessCodeRejected: '访问码无效。',
    invalidLoginResponse: '登录响应无效',
    loginFailed: '登录失败',
    failedToLoadAdminConfig: '加载管理配置失败',
    gatewayTargetRequired: '至少需要一个 Journal Gateway。',
    gatewayTargetFieldsRequired: '每个 Journal Gateway 都必须填写 id、name 和 URL。',
    gatewayHeaderFieldsRequired: '每个网关请求头都必须同时填写名称和值。',
    savedBackendSettings: '后端设置已保存。',
    failedToSaveBackendSettings: '保存后端设置失败',
    failedToSwitchGatewayTarget: '切换 Journal Gateway 失败',
    enterUrlFirst: '请先输入 URL。',
    reachableHttp: (status) => `可达 · HTTP ${status}`,
    connectionTestFailed: '连接测试失败',
    addressFieldsCannotBeUsed: (field) => `地址字段不能用于筛选：${field}`,
    invalidFieldName: (field) => `无效的字段名：${field}`
  }
};

function normalizeLocale(rawLocale?: string | null): SupportedLocale {
  if (!rawLocale) return 'en';
  const value = rawLocale.toLowerCase();
  if (value === 'zh-cn' || value.startsWith('zh')) return 'zh-CN';
  return 'en';
}

export function getInitialLocale(): SupportedLocale {
  if (typeof window === 'undefined') return 'en';

  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored) return normalizeLocale(stored);
  } catch {
    // Ignore storage failures and fall back to browser locale.
  }

  return normalizeLocale(window.navigator.language);
}

export type I18nContextValue = {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  messages: Messages;
  supportedLocales: SupportedLocale[];
};

export const supportedLocales: SupportedLocale[] = ['en', 'zh-CN'];
export const defaultLocale: SupportedLocale = 'en';

export const I18nContext = createContext<I18nContextValue>({
  locale: defaultLocale,
  setLocale: () => { },
  messages: messages[defaultLocale],
  supportedLocales
});

export function useI18n() {
  return useContext(I18nContext);
}

export function getMessages(locale: SupportedLocale) {
  return messages[locale];
}
