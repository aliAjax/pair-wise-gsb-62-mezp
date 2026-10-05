import { createReducer, on } from '@ngrx/store'
import type {
  Anomaly,
  AnomalyChangeKind,
  AnomalyChangePayload,
  AuditEntry,
  MergeReport,
  OutboxItem,
  Station,
  TailingsDataset,
  Threshold
} from '../domain'
import { applyChange, kindLabel, makeAudit, mergeIncomingChange, recalcOnThresholdPublish, recalcPointStatus, resolveConflict, stampApplied, type IdClock } from '../domain'
import { seedDataset } from '../data/seed'
import { TailingsActions } from './tailings.actions'

export const STATIONS: Station[] = [
  { id: 'ST-CONSOLE', name: '值班台A（内网）', kind: '值班台', operator: '值班员 何清' },
  { id: 'ST-CONSOLE-2', name: '值班台B（内网）', kind: '值班台', operator: '值班员 高阳' },
  { id: 'ST-FIELD-01', name: '巡检终端01（离线）', kind: '巡检终端', operator: '现场复核 宋立' }
]

export interface TailingsState {
  dataset: TailingsDataset
  loading: boolean
  error: string
  selectedAnomalyId: string
  keyword: string
  status: Anomaly['status'] | '全部'
  stations: Station[]
  activeStationId: string
  networkOnline: boolean
  outbox: OutboxItem[]
  mergeReports: MergeReport[]
}

const clock: IdClock = {
  id: (prefix) => `${prefix}-${Date.now()}-${idSeed++}`,
  now: () => new Date().toISOString()
}
let idSeed = 100
const audit = makeAudit(clock)

export const initialTailingsState: TailingsState = {
  dataset: structuredClone(seedDataset),
  loading: false,
  error: '',
  selectedAnomalyId: seedDataset.anomalies[0]?.id ?? '',
  keyword: '',
  status: '全部',
  stations: STATIONS,
  activeStationId: 'ST-CONSOLE',
  networkOnline: true,
  outbox: [],
  mergeReports: []
}

const activeStation = (state: TailingsState): Station => state.stations.find((item) => item.id === state.activeStationId) ?? state.stations[0]

function bumpRevision(anomaly: Anomaly, station: Station, kind: AnomalyChangeKind): void {
  anomaly.version += 1
  const snapshot = structuredClone(anomaly)
  anomaly.revisions.unshift({
    version: anomaly.version,
    snapshot,
    changedBy: station.operator,
    stationId: station.id,
    changedAt: clock.now(),
    note: kindLabel(kind)
  })
}

/** 值班台在线直接改动正本的统一入口，含既有校验规则 */
function applyDirect(state: TailingsState, anomalyId: string, kind: AnomalyChangeKind, payload: AnomalyChangePayload, auditDetail: string): TailingsState {
  const dataset = structuredClone(state.dataset)
  const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
  if (!anomaly) return state

  if (kind === 'fieldReview' && (!payload.review?.observed || !payload.review.evidence || !payload.review.reassessment)) return state
  if (kind === 'opinion' && !payload.opinion?.content) return state
  if (kind === 'savePlan' && (!payload.plan?.owner || !payload.plan.deadline || !payload.plan.conditions)) return state
  if (kind === 'close' && (!anomaly.plan.approvedBy || !anomaly.fieldReviews.length || !(payload.note ?? '').trim())) return state
  if (kind === 'approve' && anomaly.severity === '重大' && !anomaly.plan.emergencyLinked) return state
  // 阈值升版后未重新确认前不得签批
  if (kind === 'approve' && anomaly.reconfirmRequired) return state

  const applied = applyChange(anomaly, kind, payload)
  stampApplied(applied, kind, clock.now())
  const station = activeStation(state)
  applied.version = anomaly.version
  bumpRevision(applied, station, kind)
  dataset.anomalies = dataset.anomalies.map((item) => (item.id === anomalyId ? applied : item))
  dataset.audit.unshift(audit(anomalyId, kindLabel(kind), station.operator, auditDetail))
  return { ...state, dataset }
}

/** 离线/终端：改动留在本地待办，携带所依据的正本版本号 */
function queueChange(state: TailingsState, anomalyId: string, kind: AnomalyChangeKind, payload: AnomalyChangePayload): TailingsState {
  const anomaly = state.dataset.anomalies.find((item) => item.id === anomalyId)
  if (!anomaly) return state
  const station = activeStation(state)
  const baseSnapshot = structuredClone(anomaly)
  // 合并基线只需要字段状态，历史版本链不带入待办，避免逐条待办形成指数级复制
  baseSnapshot.revisions = []
  baseSnapshot.branches = []
  baseSnapshot.conflicts = []
  const item: OutboxItem = {
    id: clock.id('OB'),
    anomalyId,
    anomalyTitle: anomaly.title,
    kind,
    payload: structuredClone(payload),
    stationId: station.id,
    stationName: station.name,
    baseVersion: anomaly.version,
    baseSnapshot,
    createdAt: clock.now(),
    attempts: 0,
    lastError: '',
    status: '待上传'
  }
  const dataset = structuredClone(state.dataset)
  dataset.audit.unshift(audit(anomalyId, '本地暂存待办', station.operator, `离线记录“${kindLabel(kind)}”，待恢复网络后上报合并（依据 V${anomaly.version}）`))
  return { ...state, outbox: [...state.outbox, item], dataset }
}

/** 恢复网络后逐条重试，三方合并进入值班台正本 */
function flushOutbox(state: TailingsState, onlyItemId?: string): TailingsState {
  if (!state.networkOnline) {
    return {
      ...state,
      outbox: state.outbox.map((item) => ({ ...item, attempts: item.attempts + 1, lastError: '网络未连通，继续留在终端待重试', status: '上传失败' as const }))
    }
  }
  const dataset = structuredClone(state.dataset)
  const reports: MergeReport[] = []
  const audits: AuditEntry[] = []
  const remaining: OutboxItem[] = []

  for (const item of state.outbox) {
    if (onlyItemId && item.id !== onlyItemId) {
      remaining.push(item)
      continue
    }
    const anomaly = dataset.anomalies.find((entry) => entry.id === item.anomalyId)
    if (!anomaly) {
      remaining.push({ ...item, attempts: item.attempts + 1, lastError: '异常不存在', status: '上传失败' })
      continue
    }
    const base = item.baseSnapshot
    const outcome = mergeIncomingChange(base, anomaly, item, clock)
    const report: MergeReport = {
      id: clock.id('MR'),
      at: clock.now(),
      anomalyId: item.anomalyId,
      anomalyTitle: item.anomalyTitle,
      itemId: item.id,
      stationId: item.stationId,
      stationName: item.stationName,
      kind: item.kind,
      result: outcome.report.result,
      detail: outcome.report.detail
    }
    reports.unshift(report)
    audits.unshift(audit(item.anomalyId, '合并本地待办', item.stationName, `${outcome.report.result}：${outcome.report.detail}`))

    if (outcome.anomaly) {
      const merged = outcome.anomaly
      if (outcome.branch) merged.branches.unshift(outcome.branch)
      merged.conflicts.unshift(...outcome.conflicts)
      dataset.anomalies = dataset.anomalies.map((entry) => (entry.id === item.anomalyId ? merged : entry))
      if (outcome.report.result === '冲突待交接') remaining.push({ ...item, attempts: item.attempts + 1, lastError: '字段冲突，等待值班负责人交接', status: '上传失败' })
      // 已合并：待办完成，移出队列
    } else if (outcome.branch) {
      // 签批保护：正本字段不变（不升版本），仅把晚到版本留存为待交接分支
      const guarded = dataset.anomalies.find((entry) => entry.id === item.anomalyId)!
      guarded.branches.unshift(outcome.branch)
      remaining.push({ ...item, attempts: item.attempts + 1, lastError: outcome.report.detail, status: '上传失败' })
    }
  }

  dataset.audit.unshift(...audits)
  return { ...state, dataset, outbox: remaining, mergeReports: [...reports, ...state.mergeReports] }
}

export const tailingsReducer = createReducer(
  initialTailingsState,
  on(TailingsActions.loadDataset, (state) => ({ ...state, loading: true, error: '' })),
  on(TailingsActions.loadDatasetSuccess, (state, { dataset }) => ({ ...state, dataset, loading: false, selectedAnomalyId: dataset.anomalies[0]?.id ?? '' })),
  on(TailingsActions.loadDatasetFailure, (state, { error }) => ({ ...state, loading: false, error })),

  on(TailingsActions.submitFieldReview, (state, { anomalyId, review }) => applyDirect(state, anomalyId, 'fieldReview', { review }, review.reassessment)),
  on(TailingsActions.addExpertOpinion, (state, { anomalyId, opinion }) => applyDirect(state, anomalyId, 'opinion', { opinion }, `${opinion.conclusion}：${opinion.content}`)),
  on(TailingsActions.saveDispositionPlan, (state, { anomalyId, plan }) => applyDirect(state, anomalyId, 'savePlan', { plan }, `${plan.action}，责任方${plan.owner}`)),
  on(TailingsActions.approvePlan, (state, { anomalyId, approver, note }) => applyDirect(state, anomalyId, 'approve', { approver, note }, note || '同意执行')),
  on(TailingsActions.closeAnomaly, (state, { anomalyId, note }) => applyDirect(state, anomalyId, 'close', { note }, note)),
  on(TailingsActions.createEmergencyLink, (state, { anomalyId, note }) => applyDirect(state, anomalyId, 'emergency', { note }, note)),

  on(TailingsActions.reconfirmAnomaly, (state, { anomalyId, note }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly || !anomaly.reconfirmRequired) return state
    anomaly.reconfirmRequired = false
    anomaly.recalcNote = `已按阈值 V${anomaly.basisThresholdVersion} 重新确认：${note}`
    anomaly.version += 1
    const reconfirmSnapshot = structuredClone(anomaly)
    anomaly.revisions.unshift({ version: anomaly.version, snapshot: reconfirmSnapshot, changedBy: activeStation(state).operator, stationId: activeStation(state).id, changedAt: clock.now(), note: anomaly.recalcNote })
    dataset.audit.unshift(audit(anomalyId, '新版阈值重新确认', activeStation(state).operator, anomaly.recalcNote))
    return { ...state, dataset }
  }),

  on(TailingsActions.queueOfflineChange, (state, { anomalyId, kind, payload }) => queueChange(state, anomalyId, kind, payload)),
  on(TailingsActions.syncOutbox, (state) => flushOutbox(state)),
  on(TailingsActions.retryOutboxItem, (state, { itemId }) => flushOutbox(state, itemId)),
  on(TailingsActions.goOnline, (state) => ({ ...state, networkOnline: true })),
  on(TailingsActions.goOffline, (state) => ({ ...state, networkOnline: false })),
  on(TailingsActions.setStation, (state, { stationId }) => {
    const station = state.stations.find((item) => item.id === stationId)
    if (!station) return state
    // 巡检终端离线作业，切回值班台即在网内
    return { ...state, activeStationId: stationId, networkOnline: station.kind === '值班台' }
  }),

  on(TailingsActions.resolveConflict, (state, { anomalyId, conflictId, side }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly) return state
    const resolved = resolveConflict(anomaly, conflictId, side, clock)
    if (resolved === anomaly) return state
    dataset.anomalies = dataset.anomalies.map((item) => (item.id === anomalyId ? resolved : item))
    const conflict = anomaly.conflicts.find((item) => item.id === conflictId)
    dataset.audit.unshift(audit(anomalyId, '字段交接', '值班负责人', `冲突字段采用${side === 'console' ? '值班台版本' : '晚到版本'}${conflict ? `（${conflict.field}）` : ''}`))
    return { ...state, dataset }
  }),

  on(TailingsActions.publishThreshold, (state, { threshold }) => {
    const dataset = structuredClone(state.dataset)
    const previous = dataset.thresholds.find((item) => item.id === threshold.id)
    dataset.thresholds = dataset.thresholds.map((item) => (item.id === threshold.id ? threshold : item))
    if (previous && previous.version !== threshold.version) {
      dataset.thresholdHistory[threshold.id] = [...(dataset.thresholdHistory[threshold.id] ?? []), previous]
    }
    dataset.anomalies = dataset.anomalies.map((anomaly) => recalcOnThresholdPublish(anomaly, threshold, clock))
    // 按新版阈值重算相关测点状态
    dataset.points = dataset.points.map((point) =>
      point.thresholdId === threshold.id ? { ...point, status: recalcPointStatus(point.currentValue, threshold) } : point
    )
    const station = activeStation(state)
    dataset.audit.unshift(audit(threshold.id, '发布阈值版本', station.operator, `${threshold.type} V${previous?.version ?? '-'} → V${threshold.version}；未结案异常按新版重算并待重新确认，已结案依据冻结`))
    return { ...state, dataset }
  }),

  on(TailingsActions.simulateConsoleEdit, (state, { anomalyId, kind, payload, label }) => {
    const otherStation = state.stations.find((item) => item.id === 'ST-CONSOLE-2')!
    return applyDirect({ ...state, activeStationId: otherStation.id }, anomalyId, kind, payload, `值班台B并发改动：${label}`)
  }),

  on(TailingsActions.dismissMergeReport, (state, { reportId }) => ({ ...state, mergeReports: state.mergeReports.filter((item) => item.id !== reportId) })),

  on(TailingsActions.selectAnomaly, (state, { anomalyId }) => ({ ...state, selectedAnomalyId: anomalyId })),
  on(TailingsActions.updateKeyword, (state, { keyword }) => ({ ...state, keyword })),
  on(TailingsActions.updateStatus, (state, { status }) => ({ ...state, status: status as TailingsState['status'] })),
  on(TailingsActions.addAudit, (state, { entry }) => ({ ...state, dataset: { ...state.dataset, audit: [entry, ...state.dataset.audit] } })),
  on(TailingsActions.resetDemo, () => ({
    ...initialTailingsState,
    dataset: structuredClone(seedDataset),
    selectedAnomalyId: seedDataset.anomalies[0].id,
    stations: STATIONS,
    outbox: [],
    mergeReports: []
  }))
)
