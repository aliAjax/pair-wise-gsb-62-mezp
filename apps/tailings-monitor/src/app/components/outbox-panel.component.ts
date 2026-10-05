import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { MatIconModule } from '@angular/material/icon'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { MatTooltipModule } from '@angular/material/tooltip'
import { Store } from '@ngrx/store'
import type { PendingChange } from '../domain'
import { TailingsActions } from '../store/tailings.actions'
import { selectOnline, selectOutbox, selectSyncingId } from '../store/tailings.selectors'

@Component({
  selector: 'app-outbox-panel',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatProgressBarModule, MatTooltipModule],
  template: `
    <section class="sync-card" [class.offline]="!(online$ | async)">
      <header>
        <div class="mode">
          <span class="dot"></span>
          <div>
            <b>{{ (online$ | async) ? '内网在线' : '离线巡检模式' }}</b>
            <small>{{ (online$ | async) ? '处置实时上报值班台' : '复核与处置意见先留存终端' }}</small>
          </div>
        </div>
        <button mat-stroked-button [class.on]="online$ | async" (click)="toggle()">
          <mat-icon>{{ (online$ | async) ? 'wifi' : 'wifi_off' }}</mat-icon>
          {{ (online$ | async) ? '切换为离线' : '回到内网' }}
        </button>
      </header>

      <div class="hint">
        <mat-icon>sync</mat-icon>
        <span>上报失败后本地待办留在终端，恢复网络后可继续重试，不会丢失或覆盖已签批方案。</span>
      </div>

      <div class="queue" *ngIf="(outbox$ | async)?.length; else empty">
        <div class="queue-head">
          <b>终端本地待办 · {{ (outbox$ | async)?.length }} 条</b>
          <button mat-button color="primary" [disabled]="!(online$ | async)" (click)="retryAll()">
            <mat-icon>cloud_sync</mat-icon>恢复网络后全部重试
          </button>
        </div>
        <article *ngFor="let item of (outbox$ | async)" [class.syncing]="(syncingId$ | async) === item.id">
          <div class="item-main">
            <b>{{ item.kind }} <small>{{ item.anomalyId }}</small></b>
            <span>{{ item.summary }}</span>
            <small class="meta">{{ item.operator }} · {{ item.createdAt.replace('T', ' ').slice(0, 16) }} · 已尝试 {{ item.attempts }} 次</small>
            <em class="error" *ngIf="item.lastError">{{ item.lastError }}</em>
          </div>
          <div class="item-actions">
            <span class="badge" [class.fail]="item.status === '失败'" [class.wait]="item.status === '待发送'" [class.ing]="item.status === '重试中'">
              {{ statusText(item.status) }}
            </span>
            <button mat-button color="primary" [disabled]="(syncingId$ | async) === item.id" (click)="retry(item)">重试</button>
            <button mat-icon-button matTooltip="仅从待办移除（处置已在本地生效）" (click)="dismiss(item)"><mat-icon>close</mat-icon></button>
          </div>
          <mat-progress-bar *ngIf="(syncingId$ | async) === item.id" mode="indeterminate"></mat-progress-bar>
        </article>
      </div>
      <ng-template #empty><p class="empty-text">{{ (online$ | async) ? '暂无滞留终端的待办。' : '离线期间产生的处置将在此排队，等待上报。' }}</p></ng-template>
    </section>
  `,
  styles: [`
    .sync-card { background: white; border: 1px solid #d9e1df; border-left: 4px solid #2e765a; padding: 14px 16px; margin-bottom: 14px; }
    .sync-card.offline { border-left-color: #c99f3d; background: #fdfaf1; }
    header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .mode { display: flex; align-items: center; gap: 10px; } .mode b, .mode small { display: block; } .mode b { font-size: 14px; color: #245060; } .mode small { color: #83918d; font-size: 11px; margin-top: 2px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: #2e9e6e; box-shadow: 0 0 0 4px rgba(46,158,110,.15); }
    .offline .dot { background: #d2992f; box-shadow: 0 0 0 4px rgba(210,153,47,.18); }
    button mat-icon { font-size: 17px; width: 17px; height: 17px; }
    .hint { display: flex; gap: 7px; align-items: flex-start; margin: 10px 0 0; color: #7a8784; font-size: 11px; } .hint mat-icon { font-size: 15px; width: 15px; height: 15px; color: #93a5a0; margin-top: 1px; }
    .queue { margin-top: 12px; border-top: 1px dashed #d8e0dd; padding-top: 10px; }
    .queue-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; } .queue-head b { font-size: 12px; color: #245060; }
    .queue article { display: grid; grid-template-columns: 1fr auto; gap: 6px; padding: 9px 10px; border: 1px solid #e2e7e6; margin-bottom: 7px; position: relative; }
    .queue article.syncing { border-color: #8fb3c4; background: #f4f9fb; }
    .item-main b, .item-main span, .item-main small { display: block; } .item-main b { font-size: 12px; color: #315d6e; } .item-main b small { display: inline; color: #8a9794; font-weight: normal; margin-left: 6px; }
    .item-main span { font-size: 12px; color: #46534f; margin: 2px 0; } .item-main .meta { color: #93a09c; font-size: 10px; } .item-main .error { color: #a43c35; font-size: 10px; font-style: normal; margin-top: 2px; }
    .item-actions { display: flex; align-items: center; gap: 4px; }
    .badge { font-size: 10px; padding: 2px 8px; border-radius: 10px; background: #e7f3ee; color: #2e765a; white-space: nowrap; } .badge.wait { background: #f3efe3; color: #8e681d; } .badge.ing { background: #e6f0f6; color: #2b6485; } .badge.fail { background: #fae8e6; color: #a43c35; }
    mat-progress-bar { grid-column: 1 / -1; position: absolute; left: 0; bottom: 0; width: 100%; }
    .empty-text { margin: 10px 0 2px; color: #93a09c; font-size: 11px; }
  `]
})
export class OutboxPanelComponent {
  private readonly store = inject(Store)
  readonly online$ = this.store.select(selectOnline)
  readonly outbox$ = this.store.select(selectOutbox)
  readonly syncingId$ = this.store.select(selectSyncingId)

  toggle(): void {
    this.online$.subscribe((online) => this.store.dispatch(TailingsActions.setOnline({ online: !online }))).unsubscribe()
  }
  retry(item: PendingChange): void { this.store.dispatch(TailingsActions.retryOutboxItem({ id: item.id })) }
  retryAll(): void { this.store.dispatch(TailingsActions.retryAllOutbox()) }
  dismiss(item: PendingChange): void { this.store.dispatch(TailingsActions.dismissOutboxItem({ id: item.id })) }
  statusText(status: PendingChange['status']): string {
    return status === '待发送' ? '待上报' : status === '重试中' ? '上报中' : '上报失败'
  }
}
