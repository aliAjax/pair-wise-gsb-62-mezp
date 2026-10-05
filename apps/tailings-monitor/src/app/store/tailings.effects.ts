import { Injectable, inject } from '@angular/core'
import { Actions, createEffect, ofType } from '@ngrx/effects'
import { Store } from '@ngrx/store'
import { catchError, delay, filter, from, map, mergeAll, of, switchMap, withLatestFrom } from 'rxjs'
import { TailingsApiService } from '../services/tailings-api.service'
import { TailingsActions } from './tailings.actions'
import { selectOnline, selectOutbox } from './tailings.selectors'

/** 断网/网关失败场景模拟：离线一律失败；在线后前两次尝试超时留在终端，第三次重试成功 */
function simulateUpload(attempts: number, online: boolean): { ok: boolean; error: string } {
  if (!online) return { ok: false, error: '终端离线，等待回到内网' }
  if (attempts <= 2) return { ok: false, error: '值班台网关超时，待办保留在终端' }
  return { ok: true, error: '' }
}

@Injectable()
export class TailingsEffects {
  private readonly actions$ = inject(Actions)
  private readonly api = inject(TailingsApiService)
  private readonly store = inject(Store)

  loadDataset$ = createEffect(() => this.actions$.pipe(
    ofType(TailingsActions.loadDataset),
    switchMap(() => this.api.loadDataset().pipe(
      map((dataset) => TailingsActions.loadDatasetSuccess({ dataset })),
      catchError((error: Error) => of(TailingsActions.loadDatasetFailure({ error: error.message })))
    ))
  ))

  /** 单条重试 */
  private sync(id: string, attempts: number, online: boolean) {
    const result = simulateUpload(attempts, online)
    return of(result).pipe(
      delay(650),
      map((value) => value.ok
        ? TailingsActions.syncSuccess({ id })
        : TailingsActions.syncFailure({ id, error: value.error }))
    )
  }

  retryOne$ = createEffect(() => this.actions$.pipe(
    ofType(TailingsActions.retryOutboxItem),
    withLatestFrom(this.store.select(selectOnline)),
    switchMap(([{ id }, online]) => {
      const attempts = this.peekAttempts(id)
      return this.sync(id, attempts, online)
    })
  ))

  /** 恢复网络后全部继续重试 */
  retryAll$ = createEffect(() => this.actions$.pipe(
    ofType(TailingsActions.retryAllOutbox, TailingsActions.setOnline),
    filter((action) => action.type !== TailingsActions.setOnline.type || action.online),
    withLatestFrom(this.store.select(selectOutbox), this.store.select(selectOnline)),
    switchMap(([, outbox, online]) => {
      const pending = outbox.filter((item) => item.status !== '重试中')
      if (!pending.length || !online) return of()
      return from(pending.map((item) => this.sync(item.id, item.attempts, online))).pipe(mergeAll())
    })
  ))

  private peekAttempts(id: string): number {
    let attempts = 1
    this.store.select(selectOutbox).subscribe((outbox) => {
      attempts = outbox.find((item) => item.id === id)?.attempts ?? 1
    }).unsubscribe()
    return attempts
  }
}
