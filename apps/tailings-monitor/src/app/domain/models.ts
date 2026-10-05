export type MonitoringType = '位移' | '水位' | '渗流' | '降雨'
export type PointStatus = '正常' | '预警' | '异常'
export type AnomalyStatus = '待现场复核' | '原因调查中' | '待负责人审批' | '应急联动' | '已关闭'
export type Severity = '关注' | '较高' | '重大'

export interface MonitoringPoint {
  id: string
  name: string
  zone: string
  type: MonitoringType
  longitude: number
  latitude: number
  status: PointStatus
  currentValue: number
  unit: string
  thresholdId: string
  lastInspectionAt: string
}

export interface Threshold {
  id: string
  type: MonitoringType
  warning: number
  alarm: number
  changeRate: number
  unit: string
  enabled: boolean
  version: number
  /** 版本发布时间，作为列表、详情、审阅包共同的版本依据 */
  issuedAt: string
  note: string
}

export interface RawReading {
  id: string
  pointId: string
  value: number
  unit: string
  capturedAt: string
  deviceId: string
  quality: '有效' | '可疑' | '无效'
}

export interface ExpertOpinion {
  id: string
  specialist: string
  discipline: '坝体' | '水文' | '岩土' | '应急'
  content: string
  conclusion: '支持结论' | '提出异议' | '补充证据'
  createdAt: string
}

export interface FieldReview {
  id: string
  inspector: string
  arrivedAt: string
  observed: string
  evidence: string
  reassessment: string
  version: number
}

export interface DispositionPlan {
  id: string
  action: '加密监测' | '降低库水位' | '疏通排水' | '应急撤离准备' | '工程加固'
  owner: string
  deadline: string
  conditions: string
  emergencyLinked: boolean
  approvedBy: string
  approvedAt: string
}

/** 字段级冲突：两边都改过时同时列出本地与值班台取值，交接时逐字段选择 */
export interface FieldConflict {
  key: 'status' | 'severity' | 'owner' | 'observedValue' | 'plan'
  label: string
  baseValue: string
  localValue: string
  stationValue: string
  /** 值班台方案已经签批时为 true，晚到记录被保护，只能沿用值班台取值 */
  protected: boolean
  resolution: '' | 'local' | 'station'
}

/** 合并交接记录：两边版本都保留，冲突逐字段列出后交接 */
export interface MergeInfo {
  mergedAt: string
  stationOperator: string
  localVersion: number
  stationVersion: number
  state: '待交接' | '已交接'
  conflicts: FieldConflict[]
  /** 两边完整版本快照，交接完成前都保留可查 */
  localSnapshot: Anomaly | null
  stationSnapshot: Anomaly | null
  note: string
}

export interface Anomaly {
  id: string
  pointId: string
  title: string
  severity: Severity
  status: AnomalyStatus
  openedAt: string
  owner: string
  triggerReadingId: string
  observedValue: string
  fieldReviews: FieldReview[]
  opinions: ExpertOpinion[]
  plan: DispositionPlan
  closedAt: string
  version: number
  updatedAt: string
  /** 判定该异常所依据的阈值版本；结案后锁定，不再随新版变化 */
  thresholdVersion: number
  /** 新版阈值发布后，未结案异常按新版重算并要求重新确认 */
  needsReconfirm: boolean
  /** 本次重算前使用的阈值版本 */
  recalculatedFrom: number
  recalculatedAt: string
  recalcNote: string
  /** 最近一次与值班台合并的交接信息 */
  merge: MergeInfo | null
  /** 上次成功合并后的共同基线，供下次三向合并使用 */
  syncBase?: Anomaly | null
}

export interface AuditEntry {
  id: string
  entityId: string
  action: string
  operator: string
  detail: string
  createdAt: string
}

export type OutboxKind = '现场复核' | '专业意见' | '处置方案' | '方案审批' | '应急联动' | '关闭异常' | '阈值确认' | '冲突交接'
export type OutboxStatus = '待发送' | '重试中' | '失败'

/** 离线终端本地待办：上报失败后留在终端，网络恢复后继续重试 */
export interface PendingChange {
  id: string
  kind: OutboxKind
  anomalyId: string
  summary: string
  operator: string
  createdAt: string
  attempts: number
  status: OutboxStatus
  lastError: string
}

export interface TailingsDataset {
  points: MonitoringPoint[]
  thresholds: Threshold[]
  thresholdsHistory: Threshold[]
  readings: RawReading[]
  anomalies: Anomaly[]
  audit: AuditEntry[]
  /** 数据集修订号，随阈值发布、合并交接递增 */
  revision: number
}
