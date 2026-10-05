import { createReducer, on } from '@ngrx/store'
import type { Anomaly, AuditEntry, OutboxKind, PendingChange, TailingsDataset } from '../domain'
import { seedDataset } from '../data/seed'
import { mergeAnomaly, publishThreshold, resolveConflict } from '../services/sync-engine'
import { TailingsActions } from './tailings.actions'

export interface TailingsState {
  dataset: TailingsDataset
  loading: boolean
  error: string
  selectedAnomalyId: string
  keyword: string
  status: Anomaly['status'] | '全部'
  /** 终端网络状态：false=离线巡检模式，处置先入本地待办 */
  online: boolean
  /** 本地待办（断网/上报失败留在终端） */
  outbox: PendingChange[]
  /** 正在模拟上报的待办 id */
  syncingId: string
}

export const initialTailingsState: TailingsState = {
  dataset: structuredClone(seedDataset),
  loading: false,
  error: '',
  selectedAnomalyId: seedDataset.anomalies[0]?.id ?? '',
  keyword: '',
  status: '全部',
  online: true,
  outbox: [],
  syncingId: ''
}

let idSeed = 50
const now = (): string => new Date().toISOString()
const audit = (entityId: string, action: string, operator: string, detail: string): AuditEntry => ({
  id: `AUD-${Date.now()}-${idSeed++}`, entityId, action, operator, detail, createdAt: now()
})

type DatasetDraft = { dataset: TailingsDataset; anomaly: Anomaly }

/** 克隆数据集并定位异常；首次分叉时锁定共同基线，供日后与值班台三向合并 */
function draft(state: TailingsState, anomalyId: string): DatasetDraft | null {
  const dataset = structuredClone(state.dataset)
  const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
  if (!anomaly) return null
  if (!anomaly.syncBase) anomaly.syncBase = structuredClone(anomaly)
  return { dataset, anomaly }
}

function enqueue(outbox: PendingChange[], anomaly: Anomaly, kind: OutboxKind, summary: string, operator: string): PendingChange[] {
  // 同实体同类型待办合并为一条，避免离线重复点击产生多条队列
  const existing = outbox.find((item) => item.anomalyId === anomaly.id && item.kind === kind && item.status !== '失败')
  if (existing) return outbox.map((item) => item.id === existing.id ? { ...item, summary, createdAt: now() } : item)
  return [{ id: `OUT-${Date.now()}-${idSeed++}`, kind, anomalyId: anomaly.id, summary, operator, createdAt: now(), attempts: 0, status: '待发送', lastError: '' }, ...outbox]
}

/** 应用一次处置：在线直接留痕；离线追加本地待办，回到内网重试上报 */
function commit(state: TailingsState, next: { dataset: TailingsDataset; anomaly: Anomaly }, kind: OutboxKind, summary: string, operator: string, auditEntry: AuditEntry): TailingsState {
  next.anomaly.updatedAt = now()
  next.dataset.audit.unshift(auditEntry)
  const outbox = state.online ? state.outbox : enqueue(state.outbox, next.anomaly, kind, summary, operator)
  return { ...state, dataset: next.dataset, outbox }
}

export const tailingsReducer = createReducer(
  initialTailingsState,
  on(TailingsActions.loadDataset, (state) => ({ ...state, loading: true, error: '' })),
  on(TailingsActions.loadDatasetSuccess, (state, { dataset }) => ({ ...state, dataset, loading: false, selectedAnomalyId: dataset.anomalies[0]?.id ?? '' })),
  on(TailingsActions.loadDatasetFailure, (state, { error }) => ({ ...state, loading: false, error })),
  on(TailingsActions.submitFieldReview, (state, { anomalyId, review }) => {
    const next = draft(state, anomalyId)
    if (!next || !review.observed || !review.evidence || !review.reassessment) return state
    next.anomaly.fieldReviews.unshift({ ...review, version: next.anomaly.fieldReviews.length + 1 })
    if (next.anomaly.status === '待现场复核') next.anomaly.status = '原因调查中'
    next.anomaly.version += 1
    return commit(state, next, '现场复核', `现场复核：${review.reassessment}`, review.inspector, audit(anomalyId, '提交现场复核', review.inspector, `${state.online ? '已上报值班台' : '离线留存终端待办'}：${review.reassessment}`))
  }),
  on(TailingsActions.addExpertOpinion, (state, { anomalyId, opinion }) => {
    const next = draft(state, anomalyId)
    if (!next || !opinion.content) return state
    next.anomaly.opinions.unshift(opinion)
    next.anomaly.version += 1
    return commit(state, next, '专业意见', `${opinion.discipline}意见：${opinion.conclusion}`, opinion.specialist, audit(anomalyId, '补充专业意见', opinion.specialist, `${opinion.conclusion}：${opinion.content}`))
  }),
  on(TailingsActions.saveDispositionPlan, (state, { anomalyId, plan }) => {
    const next = draft(state, anomalyId)
    if (!next || !plan.owner || !plan.deadline || !plan.conditions) return state
    // 已签批方案受保护：只能在原方案基础上修订，不得清空签批
    const approvedBy = next.anomaly.plan.approvedBy
    const approvedAt = next.anomaly.plan.approvedAt
    next.anomaly.plan = { ...plan, approvedBy, approvedAt }
    if (approvedBy && next.anomaly.status !== '已关闭') next.anomaly.status = '待负责人审批'
    else if (!approvedBy) next.anomaly.status = '待负责人审批'
    next.anomaly.version += 1
    return commit(state, next, '处置方案', `处置方案：${plan.action}（${plan.owner}）`, '当前用户', audit(anomalyId, '提交处置方案', '当前用户', `${plan.action}，责任方${plan.owner}${approvedBy ? '，原签批保留' : ''}`))
  }),
  on(TailingsActions.approvePlan, (state, { anomalyId, approver, note }) => {
    const next = draft(state, anomalyId)
    if (!next) return state
    if (next.anomaly.severity === '重大' && !next.anomaly.plan.emergencyLinked) return state
    next.anomaly.plan.approvedBy = approver
    next.anomaly.plan.approvedAt = now()
    next.anomaly.version += 1
    return commit(state, next, '方案审批', `负责人${approver}签批`, approver, audit(anomalyId, '审批处置方案', approver, note || '同意执行'))
  }),
  on(TailingsActions.closeAnomaly, (state, { anomalyId, note }) => {
    const next = draft(state, anomalyId)
    if (!next || !next.anomaly.plan.approvedBy || !next.anomaly.fieldReviews.length || !note.trim()) return state
    next.anomaly.status = '已关闭'
    next.anomaly.closedAt = now()
    next.anomaly.needsReconfirm = false
    next.anomaly.version += 1
    return commit(state, next, '关闭异常', `关闭：${note}`, next.anomaly.plan.approvedBy, audit(anomalyId, '关闭异常', next.anomaly.plan.approvedBy, `${note}（阈值依据V${next.anomaly.thresholdVersion}随证据锁定）`))
  }),
  on(TailingsActions.createEmergencyLink, (state, { anomalyId, note }) => {
    const next = draft(state, anomalyId)
    if (!next) return state
    next.anomaly.plan.emergencyLinked = true
    next.anomaly.status = '应急联动'
    next.anomaly.version += 1
    return commit(state, next, '应急联动', note, '值班负责人', audit(anomalyId, '启动应急联动', '值班负责人', note))
  }),
  on(TailingsActions.selectAnomaly, (state, { anomalyId }) => ({ ...state, selectedAnomalyId: anomalyId })),
  on(TailingsActions.updateKeyword, (state, { keyword }) => ({ ...state, keyword })),
  on(TailingsActions.updateStatus, (state, { status }) => ({ ...state, status: status as TailingsState['status'] })),
  on(TailingsActions.addAudit, (state, { entry }) => ({ ...state, dataset: { ...state.dataset, audit: [entry, ...state.dataset.audit] } })),

  on(TailingsActions.toggleOnline, (state) => ({ ...state, online: !state.online })),
  on(TailingsActions.setOnline, (state, { online }) => ({ ...state, online })),

  on(TailingsActions.mergeStationChanges, (state, { anomalyId, station, stationOperator }) => {
    const local = state.dataset.anomalies.find((item) => item.id === anomalyId)
    if (!local) return state
    const base = local.syncBase ?? local
    const { anomaly: merged, audit: auditParts } = mergeAnomaly(base, local, station, stationOperator, now())
    const dataset = structuredClone(state.dataset)
    const index = dataset.anomalies.findIndex((item) => item.id === anomalyId)
    // 待交接期间保留原共同基线；全部字段交接后再把合并结果作为新基线
    if (merged.merge?.state === '已交接') merged.syncBase = structuredClone(merged)
    else merged.syncBase = local.syncBase ?? null
    dataset.anomalies[index] = merged
    auditParts.forEach((part) => dataset.audit.unshift(audit(anomalyId, part.action, stationOperator, part.detail)))
    return { ...state, dataset }
  }),
  on(TailingsActions.resolveConflict, (state, { anomalyId, conflictKey, resolution }) => {
    const dataset = structuredClone(state.dataset)
    const index = dataset.anomalies.findIndex((item) => item.id === anomalyId)
    if (index < 0) return state
    const before = dataset.anomalies[index].merge?.state
    const next = resolveConflict(dataset.anomalies[index], conflictKey, resolution)
    if (next === dataset.anomalies[index]) return state
    const conflict = next.merge?.conflicts.find((item) => item.key === conflictKey)
    if (before === '待交接' && next.merge?.state === '已交接') {
      next.syncBase = structuredClone(next)
      dataset.audit.unshift(audit(anomalyId, '完成合并交接', '值班负责人', '两边版本均已保留，冲突字段全部交接，作为后续共同版本V' + next.version))
    }
    dataset.audit.unshift(audit(anomalyId, '冲突字段交接', '值班负责人', `「${conflict?.label}」采用${resolution === 'local' ? '终端' : '值班台'}取值`))
    dataset.anomalies[index] = next
    return { ...state, dataset }
  }),

  on(TailingsActions.publishThreshold, (state, { threshold }) => {
    const dataset = publishThreshold(state.dataset, threshold, now(), '监测主管')
    return { ...state, dataset }
  }),
  on(TailingsActions.reconfirmRecalc, (state, { anomalyId, operator, note }) => {
    const dataset = structuredClone(state.dataset)
    const anomaly = dataset.anomalies.find((item) => item.id === anomalyId)
    if (!anomaly || !anomaly.needsReconfirm) return state
    anomaly.needsReconfirm = false
    anomaly.version += 1
    anomaly.updatedAt = now()
    dataset.audit.unshift(audit(anomalyId, '重算重新确认', operator, `${note || '确认按新版阈值执行'}（自V${anomaly.recalculatedFrom}重算至V${anomaly.thresholdVersion}）`))
    return { ...state, dataset }
  }),

  on(TailingsActions.retryOutboxItem, (state, { id }) => ({
    ...state,
    syncingId: id,
    outbox: state.outbox.map((item) => item.id === id ? { ...item, status: '重试中' as const, attempts: item.attempts + 1, lastError: '' } : item)
  })),
  on(TailingsActions.retryAllOutbox, (state) => ({
    ...state,
    outbox: state.outbox.map((item) => item.status === '失败' || item.status === '待发送' ? { ...item, status: '重试中' as const, attempts: item.attempts + 1, lastError: '' } : item)
  })),
  on(TailingsActions.syncSuccess, (state, { id }) => {
    const item = state.outbox.find((pending) => pending.id === id)
    const dataset = structuredClone(state.dataset)
    if (item) {
      dataset.audit.unshift(audit(item.anomalyId, '上报成功', item.operator, `终端待办「${item.kind}」经${item.attempts}次尝试后上报值班台：${item.summary}`))
      // 成功合并：以当前终端版本作为两边共同基线
      const anomaly = dataset.anomalies.find((entry) => entry.id === item.anomalyId)
      if (anomaly) anomaly.syncBase = structuredClone(anomaly)
    }
    return { ...state, dataset, syncingId: '', outbox: state.outbox.filter((pending) => pending.id !== id) }
  }),
  on(TailingsActions.syncFailure, (state, { id, error }) => ({
    ...state,
    syncingId: '',
    outbox: state.outbox.map((item) => item.id === id ? { ...item, status: '失败' as const, lastError: error } : item)
  })),
  on(TailingsActions.dismissOutboxItem, (state, { id }) => ({ ...state, outbox: state.outbox.filter((item) => item.id !== id) })),

  on(TailingsActions.resetDemo, () => ({
    ...initialTailingsState,
    dataset: structuredClone(seedDataset),
    selectedAnomalyId: seedDataset.anomalies[0].id,
    online: true,
    outbox: [],
    syncingId: ''
  }))
)
