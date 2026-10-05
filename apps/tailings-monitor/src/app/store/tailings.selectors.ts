import { createFeatureSelector, createSelector } from '@ngrx/store'
import type { TailingsState } from './tailings.reducer'
import { anomalyBasis } from '../services/sync-engine'

export const selectTailings = createFeatureSelector<TailingsState>('tailings')
export const selectDataset = createSelector(selectTailings, (state) => state.dataset)
export const selectPoints = createSelector(selectDataset, (dataset) => dataset.points)
export const selectAnomalies = createSelector(selectDataset, (dataset) => dataset.anomalies)
export const selectOnline = createSelector(selectTailings, (state) => state.online)
export const selectOutbox = createSelector(selectTailings, (state) => state.outbox)
export const selectSyncingId = createSelector(selectTailings, (state) => state.syncingId)
export const selectPendingCount = createSelector(selectOutbox, (outbox) => outbox.length)
export const selectReconfirmCount = createSelector(selectAnomalies, (anomalies) => anomalies.filter((item) => item.needsReconfirm && item.status !== '已关闭').length)
export const selectSelectedAnomaly = createSelector(selectTailings, (state) => state.dataset.anomalies.find((item) => item.id === state.selectedAnomalyId) ?? state.dataset.anomalies[0])
export const selectSelectedBasis = createSelector(selectDataset, selectSelectedAnomaly, (dataset, anomaly) => anomaly ? anomalyBasis(dataset, anomaly) : null)
export const selectFilteredAnomalies = createSelector(selectTailings, (state) => state.dataset.anomalies.filter((item) => {
  const point = state.dataset.points.find((value) => value.id === item.pointId)
  const text = `${item.id} ${item.title} ${item.owner} ${point?.name ?? ''}`.toLowerCase()
  return (!state.keyword || text.includes(state.keyword.toLowerCase())) && (state.status === '全部' || item.status === state.status)
}))
