import { createFeatureSelector, createSelector } from '@ngrx/store'
import type { Anomaly } from '../domain'
import { resolveVersionBasis } from '../domain'
import type { TailingsState } from './tailings.reducer'

export const selectTailings = createFeatureSelector<TailingsState>('tailings')
export const selectDataset = createSelector(selectTailings, (state) => state.dataset)
export const selectPoints = createSelector(selectDataset, (dataset) => dataset.points)
export const selectAnomalies = createSelector(selectDataset, (dataset) => dataset.anomalies)
export const selectSelectedAnomaly = createSelector(selectTailings, (state) => state.dataset.anomalies.find((item) => item.id === state.selectedAnomalyId) ?? state.dataset.anomalies[0])

export const selectActiveStation = createSelector(selectTailings, (state) => state.stations.find((item) => item.id === state.activeStationId) ?? state.stations[0])
export const selectStations = createSelector(selectTailings, (state) => state.stations)
export const selectNetworkOnline = createSelector(selectTailings, (state) => state.networkOnline)
export const selectOutbox = createSelector(selectTailings, (state) => state.outbox)
export const selectMergeReports = createSelector(selectTailings, (state) => state.mergeReports)
export const selectPendingConflicts = createSelector(selectAnomalies, (anomalies) =>
  anomalies.flatMap((anomaly) => anomaly.conflicts.filter((conflict) => conflict.status === '待交接').map((conflict) => ({ anomaly, conflict })))
)

/** 列表、详情、审阅包统一使用该依据解析，保证同一版本口径 */
export const selectAnomalyBases = createSelector(selectDataset, (dataset) =>
  dataset.anomalies.map((anomaly) => ({
    anomalyId: anomaly.id,
    anomalyVersion: anomaly.version,
    basis: resolveVersionBasis(anomaly, dataset.thresholds, dataset.thresholdHistory),
    pendingConflicts: anomaly.conflicts.filter((conflict) => conflict.status === '待交接').length,
    reconfirmRequired: anomaly.reconfirmRequired
  }))
)

export const selectBasisForSelected = createSelector(selectDataset, selectSelectedAnomaly, (dataset, selected) =>
  selected ? resolveVersionBasis(selected, dataset.thresholds, dataset.thresholdHistory) : undefined
)

export const selectBasisMap = createSelector(selectAnomalyBases, (bases) => new Map(bases.map((item) => [item.anomalyId, item])))

export const selectFilteredAnomalies = createSelector(selectTailings, (state) => state.dataset.anomalies.filter((item) => {
  const point = state.dataset.points.find((value) => value.id === item.pointId)
  const text = `${item.id} ${item.title} ${item.owner} ${point?.name ?? ''}`.toLowerCase()
  return (!state.keyword || text.includes(state.keyword.toLowerCase())) && (state.status === '全部' || item.status === state.status)
}))

export type AnomalyRow = Anomaly
