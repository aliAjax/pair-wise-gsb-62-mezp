export type MonitoringType = '位移' | '水位' | '渗流' | '降雨'
export type PointStatus = '正常' | '预警' | '异常'
export type AnomalyStatus = '待现场复核' | '原因调查中' | '待负责人审批' | '应急联动' | '已关闭'
export type Severity = '关注' | '较高' | '重大'

export type StationKind = '值班台' | '巡检终端'

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
  publishedAt?: string
  note?: string
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

export type AnomalyChangeKind = 'fieldReview' | 'opinion' | 'savePlan' | 'approve' | 'close' | 'emergency'

export interface AnomalyChangePayload {
  review?: FieldReview
  opinion?: ExpertOpinion
  plan?: DispositionPlan
  approver?: string
  note?: string
}

/** 可在三方合并中比较的标量字段（复核与意见按集合追加，不进入字段冲突） */
export type ConflictField =
  | 'status'
  | 'observedValue'
  | 'plan.action'
  | 'plan.owner'
  | 'plan.deadline'
  | 'plan.conditions'
  | 'plan.emergencyLinked'
  | 'plan.approval'

export interface FieldConflict {
  id: string
  branchId: string
  field: ConflictField
  baseDigest: string
  /** 合并时值班台正本上的值 */
  consoleDigest: string
  /** 晚到（终端或另一值班台）版本上的值 */
  incomingDigest: string
  incomingStation: string
  status: '待交接' | '已解决'
  chosenSide: '' | 'console' | 'incoming'
  resolvedAt: string
}

/** 异机保留下来的版本，字段交接前一直留证 */
export interface AnomalyBranch {
  id: string
  sourceVersion: number
  kind: AnomalyChangeKind
  payload: AnomalyChangePayload
  stationId: string
  stationName: string
  operator: string
  reason: '双方修改' | '已签批方案保护'
  createdAt: string
}

export interface AnomalyRevision {
  version: number
  snapshot: Anomaly
  changedBy: string
  stationId: string
  changedAt: string
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
  /** 本异常当前依据的阈值版本；结案后冻结，不再随阈值升版变化 */
  basisThresholdId: string
  basisThresholdVersion: number
  /** 阈值升版后待审批/未结案异常需要按新版重新确认 */
  reconfirmRequired: boolean
  recalcNote: string
  revisions: AnomalyRevision[]
  branches: AnomalyBranch[]
  conflicts: FieldConflict[]
}

export interface AuditEntry {
  id: string
  entityId: string
  action: string
  operator: string
  detail: string
  createdAt: string
}

/** 上报失败或离线期间留在终端本地的待办 */
export interface OutboxItem {
  id: string
  anomalyId: string
  anomalyTitle: string
  kind: AnomalyChangeKind
  payload: AnomalyChangePayload
  stationId: string
  stationName: string
  baseVersion: number
  /** 待办生成时的异常正本快照，作为三方合并的共同基线 */
  baseSnapshot: Anomaly
  createdAt: string
  attempts: number
  lastError: string
  status: '待上传' | '上传失败'
}

export type MergeResult = '已合并' | '冲突待交接' | '已拒绝(签批保护)' | '合并失败'

export interface MergeReport {
  id: string
  at: string
  anomalyId: string
  anomalyTitle: string
  itemId: string
  stationId: string
  stationName: string
  kind: AnomalyChangeKind
  result: MergeResult
  detail: string
}

export interface Station {
  id: string
  name: string
  kind: StationKind
  operator: string
}

export interface VersionBasis {
  thresholdId: string
  type: MonitoringType
  version: number
  warning: number
  alarm: number
  changeRate: number
  unit: string
  frozen: boolean
  source: string
}

export interface ReviewPackage {
  generatedAt: string
  generatedBy: string
  stationId: string
  stationName: string
  currentThresholdVersions: Threshold[]
  anomalyBases: Array<{ anomalyId: string; title: string; anomalyVersion: number; basis: VersionBasis; pendingConflicts: number }>
  anomalies: Anomaly[]
  thresholdHistory: Record<string, Threshold[]>
  mergeReports: MergeReport[]
  audit: AuditEntry[]
}

export interface TailingsDataset {
  points: MonitoringPoint[]
  thresholds: Threshold[]
  /** 历次阈值版本，按 thresholdId 归档（不含当前版本） */
  thresholdHistory: Record<string, Threshold[]>
  readings: RawReading[]
  anomalies: Anomaly[]
  audit: AuditEntry[]
}
