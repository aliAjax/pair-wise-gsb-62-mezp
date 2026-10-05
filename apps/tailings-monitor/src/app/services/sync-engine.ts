import type { Anomaly, FieldConflict, MergeInfo, TailingsDataset, Threshold } from '../domain'

export interface BasisInfo {
  thresholdId: string
  thresholdVersion: number
  issuedAt: string
  found: boolean
  /** true：当前生效阈值已高于异常锁定版本（结案证据仍按原版查看时使用） */
  newerAvailable: boolean
  currentVersion: number
}

/** 列表、详情、导出统一使用的版本依据：异常锁定版本优先，缺失时回退测点当前阈值 */
export function anomalyBasis(dataset: TailingsDataset, anomaly: Anomaly): BasisInfo {
  const point = dataset.points.find((item) => item.id === anomaly.pointId)
  const thresholdId = point?.thresholdId ?? ''
  const current = dataset.thresholds.find((item) => item.id === thresholdId)
  const locked = anomaly.thresholdVersion
    ? dataset.thresholdsHistory.find((item) => item.id === thresholdId && item.version === anomaly.thresholdVersion)
      ?? dataset.thresholds.find((item) => item.id === thresholdId && item.version === anomaly.thresholdVersion)
    : undefined
  const basis = locked ?? current
  return {
    thresholdId,
    thresholdVersion: basis?.version ?? anomaly.thresholdVersion ?? 0,
    issuedAt: basis?.issuedAt ?? '',
    found: Boolean(basis),
    newerAvailable: Boolean(current && basis && current.version > basis.version),
    currentVersion: current?.version ?? basis?.version ?? 0
  }
}

/** 已结案：锁定原版；未结案：跟随当前生效版本 */
export function basisLabel(dataset: TailingsDataset, anomaly: Anomaly): string {
  const basis = anomalyBasis(dataset, anomaly)
  const lock = anomaly.status === '已关闭' ? '（结案锁定）' : basis.newerAvailable ? '（已有新版待重算）' : ''
  return `${basis.thresholdId} V${basis.thresholdVersion}${lock}`
}

export interface RecalcResult {
  anomaly: Anomaly
  changed: boolean
  severityChanged: boolean
}

/** 按新版阈值重算单个未结案异常：更新级别、版本依据并置重新确认；已结案不动 */
export function recalcAnomaly(anomaly: Anomaly, dataset: TailingsDataset, at: string, operator: string): RecalcResult {
  if (anomaly.status === '已关闭') return { anomaly, changed: false, severityChanged: false }
  const point = dataset.points.find((item) => item.id === anomaly.pointId)
  const threshold = dataset.thresholds.find((item) => item.id === point?.thresholdId)
  if (!threshold || threshold.version === anomaly.thresholdVersion) return { anomaly, changed: false, severityChanged: false }

  const reading = dataset.readings.find((item) => item.id === anomaly.triggerReadingId)
  const value = reading?.value ?? point?.currentValue ?? 0
  const nextSeverity = value >= threshold.alarm ? '重大' : value >= threshold.warning ? '较高' : '关注'
  const severityChanged = nextSeverity !== anomaly.severity

  const result: Anomaly = structuredClone(anomaly)
  const previousVersion = anomaly.thresholdVersion || threshold.version - 1
  result.thresholdVersion = threshold.version
  result.severity = nextSeverity as Anomaly['severity']
  result.needsReconfirm = true
  result.recalculatedFrom = previousVersion
  result.recalculatedAt = at
  result.version += 1
  result.updatedAt = at
  result.recalcNote = `${operator} 按${threshold.type}阈值V${threshold.version}重算：${value}${threshold.unit}，预警${threshold.warning}/报警${threshold.alarm}，级别判定为「${nextSeverity}」，待值班重新确认。`
  // 新版阈值意味着处置条件变化，原签批不再代表新版方案，退回重新确认/审批
  if (result.plan.approvedBy) {
    result.plan = { ...result.plan, approvedBy: '', approvedAt: '' }
    if (result.status === '应急联动') result.status = '待负责人审批'
  }
  return { anomaly: result, changed: true, severityChanged }
}

const CONFLICT_FIELDS: { key: FieldConflict['key']; label: string; get: (a: Anomaly) => string }[] = [
  { key: 'severity', label: '级别', get: (a) => a.severity },
  { key: 'status', label: '状态', get: (a) => a.status },
  { key: 'owner', label: '责任方', get: (a) => a.owner },
  { key: 'observedValue', label: '观测值描述', get: (a) => a.observedValue },
  {
    key: 'plan', label: '处置方案/签批',
    get: (a) => [a.plan.action, a.plan.owner, a.plan.deadline, a.plan.conditions, a.plan.emergencyLinked ? '已联动' : '未联动', a.plan.approvedBy ? `签批:${a.plan.approvedBy}` : '未签批'].join('｜')
  }
]

export interface MergeResult {
  anomaly: Anomaly
  audit: { action: string; detail: string }[]
}

/**
 * 离线终端与值班台三向合并（base 为共同基线）：
 * - 晚到记录不得覆盖已经签批的方案；
 * - 两边都改过的字段列成冲突，两边版本都保留，逐字段交接。
 */
export function mergeAnomaly(base: Anomaly, local: Anomaly, station: Anomaly, stationOperator: string, at: string): MergeResult {
  const conflicts: FieldConflict[] = []
  const merged: Anomaly = structuredClone(local)
  const audit: { action: string; detail: string }[] = []

  // 现场复核与专业意见为并存证据，按 id 并集保留（终端与值班台各自的版本都保留）
  const reviewMap = new Map<string, Anomaly['fieldReviews'][number]>()
  ;[...base.fieldReviews, ...station.fieldReviews, ...local.fieldReviews].forEach((review) => reviewMap.set(review.id, review))
  merged.fieldReviews = [...reviewMap.values()].sort((a, b) => b.version - a.version)
  const opinionMap = new Map<string, Anomaly['opinions'][number]>()
  ;[...base.opinions, ...station.opinions, ...local.opinions].forEach((opinion) => opinionMap.set(opinion.id, opinion))
  merged.opinions = [...opinionMap.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  if (station.fieldReviews.length > base.fieldReviews.length) {
    audit.push({ action: '合并现场复核', detail: `值班台新增${station.fieldReviews.length - base.fieldReviews.length}条复核，已并入（共${merged.fieldReviews.length}条版本并存）` })
  }
  if (station.opinions.length > base.opinions.length) {
    audit.push({ action: '合并专业意见', detail: `值班台新增${station.opinions.length - base.opinions.length}条意见，已并入` })
  }

  for (const field of CONFLICT_FIELDS) {
    const baseValue = field.get(base)
    const localValue = field.get(local)
    const stationValue = field.get(station)
    const localChanged = localValue !== baseValue
    const stationChanged = stationValue !== baseValue

    if (localChanged && stationChanged && localValue !== stationValue) {
      // 两边都改且不一致 => 冲突；值班台已签批的方案受保护，晚到记录不能覆盖
      const approved = field.key === 'plan' && Boolean(station.plan.approvedBy)
      const conflict: FieldConflict = {
        key: field.key, label: field.label, baseValue, localValue, stationValue,
        protected: approved, resolution: approved ? 'station' : ''
      }
      conflicts.push(conflict)
      // 受保护签批立即沿用值班台取值；其余冲突暂取本地值，等待逐字段交接
      const chosen = approved ? station : local
      applyField(merged, field.key, chosen)
    } else if (stationChanged && !localChanged) {
      applyField(merged, field.key, station)
    }
    // 本地单独改动（!stationChanged && localChanged）保留本地值；都未改动保持不变
  }

  // 签批信息专门保护：值班台已签批时，终端的未签批方案晚到也不得清空签批
  if (station.plan.approvedBy && station.plan.approvedBy !== base.plan.approvedBy) {
    merged.plan = structuredClone(station.plan)
    audit.push({ action: '签批保护', detail: `值班台方案已由${station.plan.approvedBy}签批，终端晚到记录不覆盖签批` })
  } else if (!base.plan.approvedBy && local.plan.approvedBy && !station.plan.approvedBy) {
    merged.plan = structuredClone(local.plan)
  }

  // 阈值版本依据取两边较高者（合并后以双方都应知晓的最新版为依据）
  merged.thresholdVersion = Math.max(local.thresholdVersion, station.thresholdVersion)
  merged.needsReconfirm = local.needsReconfirm || station.needsReconfirm
  merged.updatedAt = at
  merged.version = Math.max(local.version, station.version) + 1

  const mergeInfo: MergeInfo = {
    mergedAt: at,
    stationOperator,
    localVersion: local.version,
    stationVersion: station.version,
    state: conflicts.some((item) => item.resolution === '') ? '待交接' : '已交接',
    conflicts,
    localSnapshot: structuredClone(local),
    stationSnapshot: structuredClone(station),
    note: conflicts.length
      ? `检出${conflicts.length}个字段两边都改过：${conflicts.map((item) => item.label).join('、')}，两边版本均保留待逐字段交接。`
      : '两边修改互不冲突，已自动合并，证据版本并存。'
  }
  merged.merge = mergeInfo

  audit.push({
    action: conflicts.length ? '检出合并冲突' : '终端合并',
    detail: conflicts.length
      ? `终端V${local.version}与值班台V${station.version}合并，${mergeInfo.note}`
      : `终端V${local.version}与值班台V${station.version}合并完成，新版本V${merged.version}`
  })

  return { anomaly: merged, audit }
}

/** 交接时逐字段选择冲突取值；受保护签批不可改选 */
export function resolveConflict(anomaly: Anomaly, conflictKey: FieldConflict['key'], resolution: 'local' | 'station'): Anomaly {
  if (!anomaly.merge) return anomaly
  const conflict = anomaly.merge.conflicts.find((item) => item.key === conflictKey)
  if (!conflict || conflict.protected) return anomaly
  const next = structuredClone(anomaly)
  const targetConflict = next.merge!.conflicts.find((item) => item.key === conflictKey)!
  targetConflict.resolution = resolution
  applyField(next, conflictKey, resolution === 'local' ? next.merge!.localSnapshot! : next.merge!.stationSnapshot!)
  next.version += 1
  if (!next.merge!.conflicts.some((item) => item.resolution === '')) {
    next.merge!.state = '已交接'
    next.merge!.note = `全部${next.merge!.conflicts.length}个冲突字段已逐字段交接完成。`
  }
  return next
}

function applyField(target: Anomaly, key: FieldConflict['key'], source: Anomaly): void {
  if (key === 'plan') target.plan = structuredClone(source.plan)
  else target[key] = source[key] as never
}

/** 阈值新版发布：当前未结案异常全部重算；结案异常保留原版 */
export function publishThreshold(dataset: TailingsDataset, threshold: Threshold, at: string, operator: string): TailingsDataset {
  const next: TailingsDataset = structuredClone(dataset)
  const idx = next.thresholds.findIndex((item) => item.id === threshold.id)
  if (idx >= 0) {
    next.thresholdsHistory.unshift({ ...next.thresholds[idx] })
    next.thresholds[idx] = threshold
  }
  next.revision += 1
  const affected: string[] = []
  next.anomalies = next.anomalies.map((anomaly) => {
    const point = next.points.find((item) => item.id === anomaly.pointId)
    if (point?.thresholdId !== threshold.id || anomaly.status === '已关闭') return anomaly
    const result = recalcAnomaly(anomaly, next, at, operator)
    if (result.changed) {
      affected.push(anomaly.id)
      next.audit.unshift({ id: `AUD-${at}-${anomaly.id}`, entityId: anomaly.id, action: '阈值新版重算', operator, detail: result.anomaly.recalcNote, createdAt: at })
    }
    return result.changed ? result.anomaly : anomaly
  })
  next.audit.unshift({ id: `AUD-${at}-${threshold.id}`, entityId: threshold.id, action: '发布阈值版本', operator, detail: `${threshold.type}阈值发布V${threshold.version}，未结案异常${affected.length}条按新版重算并重新确认；已结案证据仍按原版查看。`, createdAt: at })
  return next
}

export interface ReviewPackage {
  packageId: string
  exportedAt: string
  versionBasis: {
    datasetRevision: number
    thresholds: { id: string; type: string; version: number; issuedAt: string }[]
    anomalies: { anomalyId: string; status: string; thresholdId: string; thresholdVersion: number; locked: boolean }[]
  }
  dataset: TailingsDataset
}

/** 审阅包与列表、详情使用同一套版本依据口径 */
export function buildReviewPackage(dataset: TailingsDataset, exportedAt: string): ReviewPackage {
  return {
    packageId: `REV-${exportedAt.replace(/[-:T.Z]/g, '').slice(0, 14)}`,
    exportedAt,
    versionBasis: {
      datasetRevision: dataset.revision,
      thresholds: dataset.thresholds.map((item) => ({ id: item.id, type: item.type, version: item.version, issuedAt: item.issuedAt })),
      anomalies: dataset.anomalies.map((item) => {
        const basis = anomalyBasis(dataset, item)
        return { anomalyId: item.id, status: item.status, thresholdId: basis.thresholdId, thresholdVersion: basis.thresholdVersion, locked: item.status === '已关闭' }
      })
    },
    dataset
  }
}
