import type { ReviewPackage, Station, TailingsDataset } from './models'
import { resolveVersionBasis } from './sync'

/**
 * 审阅包与界面使用同一个 resolveVersionBasis，
 * 保证列表、异常详情、导出审阅包显示完全一致的版本依据。
 */
export function buildReviewPackage(dataset: TailingsDataset, mergeReports: ReviewPackage['mergeReports'], station: Station, generatedAt: string): ReviewPackage {
  return {
    generatedAt,
    generatedBy: station.operator,
    stationId: station.id,
    stationName: station.name,
    currentThresholdVersions: dataset.thresholds,
    anomalyBases: dataset.anomalies.map((anomaly) => ({
      anomalyId: anomaly.id,
      title: anomaly.title,
      anomalyVersion: anomaly.version,
      basis: resolveVersionBasis(anomaly, dataset.thresholds, dataset.thresholdHistory),
      pendingConflicts: anomaly.conflicts.filter((conflict) => conflict.status === '待交接').length
    })),
    anomalies: dataset.anomalies,
    thresholdHistory: dataset.thresholdHistory,
    mergeReports,
    audit: dataset.audit
  }
}
