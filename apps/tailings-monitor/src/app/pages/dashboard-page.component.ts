import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatIconModule } from '@angular/material/icon'
import { MatInputModule } from '@angular/material/input'
import { MatSelectModule } from '@angular/material/select'
import { MatTableModule } from '@angular/material/table'
import { Store } from '@ngrx/store'
import { map } from 'rxjs'
import type { Threshold } from '../domain'
import { SpatialMapComponent } from '../components/spatial-map.component'
import { TailingsActions } from '../store/tailings.actions'
import { selectAnomalies, selectDataset, selectPoints, selectReconfirmCount } from '../store/tailings.selectors'

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatSelectModule, MatTableModule, SpatialMapComponent],
  template: `
    <section class="page">
      <div class="metrics">
        <article><span>监测点</span><strong>{{ pointCount$ | async }}</strong><small>位移、水位、渗流、降雨</small></article>
        <article><span>异常点</span><strong>{{ abnormalCount$ | async }}</strong><small>阈值引擎自动标记</small></article>
        <article><span>新版待确认</span><strong>{{ reconfirmCount$ | async }}</strong><small>阈值新版发布后重算</small></article>
        <article><span>数据集修订</span><strong>R{{ (dataset$ | async)?.revision }}</strong><small>阈值发布/交接递增</small></article>
      </div>
      <app-spatial-map [points]="(points$ | async) ?? []" />
      <div class="threshold-band">
        <div class="band-head">
          <div><h2>阈值版本与运行方式</h2><p>阈值版本一变，待审批异常按新版重算并重新确认；已结案证据继续按原版查看。列表、详情与导出审阅包使用同一版本依据。</p></div>
        </div>
        <table mat-table [dataSource]="(dataset$ | async)?.thresholds ?? []">
          <ng-container matColumnDef="type"><th mat-header-cell *matHeaderCellDef>类型</th><td mat-cell *matCellDef="let row">{{ row.type }}</td></ng-container>
          <ng-container matColumnDef="warning"><th mat-header-cell *matHeaderCellDef>预警</th><td mat-cell *matCellDef="let row">{{ row.warning }} {{ row.unit }}</td></ng-container>
          <ng-container matColumnDef="alarm"><th mat-header-cell *matHeaderCellDef>报警</th><td mat-cell *matCellDef="let row">{{ row.alarm }} {{ row.unit }}</td></ng-container>
          <ng-container matColumnDef="rate"><th mat-header-cell *matHeaderCellDef>变化率</th><td mat-cell *matCellDef="let row">{{ row.changeRate }} {{ row.unit }}</td></ng-container>
          <ng-container matColumnDef="issuedAt"><th mat-header-cell *matHeaderCellDef>发布时间</th><td mat-cell *matCellDef="let row">{{ row.issuedAt.replace('T', ' ').slice(0, 16) }}</td></ng-container>
          <ng-container matColumnDef="version"><th mat-header-cell *matHeaderCellDef>版本</th><td mat-cell *matCellDef="let row">V{{ row.version }}</td></ng-container>
          <ng-container matColumnDef="action"><th mat-header-cell *matHeaderCellDef></th><td mat-cell *matCellDef="let row"><button mat-stroked-button (click)="edit(row)"><mat-icon>upload</mat-icon>发布新版</button></td></ng-container>
          <tr mat-header-row *matHeaderRowDef="thresholdColumns"></tr><tr mat-row *matRowDef="let row; columns: thresholdColumns"></tr>
        </table>

        <div class="publish-card" *ngIf="draft as form">
          <h3>发布{{ form.type }}阈值 V{{ form.version }}（当前V{{ currentVersion(form.id) }}）</h3>
          <p class="rule">发布后：同类型未结案异常按新版立即重算、级别重判并要求重新确认；已结案异常仍按各自锁定版本查看。</p>
          <div class="publish-form">
            <mat-form-field appearance="outline"><mat-label>预警值</mat-label><input matInput type="number" [(ngModel)]="form.warning" /></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>报警值</mat-label><input matInput type="number" [(ngModel)]="form.alarm" /></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>变化速率</mat-label><input matInput type="number" [(ngModel)]="form.changeRate" /></mat-form-field>
            <mat-form-field appearance="outline" class="wide"><mat-label>版本说明</mat-label><input matInput [(ngModel)]="form.note" /></mat-form-field>
            <div class="btns"><button mat-flat-button color="primary" (click)="publish()">确认发布并重算</button><button mat-button (click)="draft = null">取消</button></div>
          </div>
        </div>

        <h3 class="history-title">历史阈值版本（结案证据按当时版本追溯）</h3>
        <table mat-table [dataSource]="(dataset$ | async)?.thresholdsHistory ?? []" class="history">
          <ng-container matColumnDef="type"><th mat-header-cell *matHeaderCellDef>类型</th><td mat-cell *matCellDef="let row">{{ row.type }}</td></ng-container>
          <ng-container matColumnDef="warning"><th mat-header-cell *matHeaderCellDef>预警</th><td mat-cell *matCellDef="let row">{{ row.warning }} {{ row.unit }}</td></ng-container>
          <ng-container matColumnDef="alarm"><th mat-header-cell *matHeaderCellDef>报警</th><td mat-cell *matCellDef="let row">{{ row.alarm }} {{ row.unit }}</td></ng-container>
          <ng-container matColumnDef="rate"><th mat-header-cell *matHeaderCellDef>变化率</th><td mat-cell *matCellDef="let row">{{ row.changeRate }} {{ row.unit }}</td></ng-container>
          <ng-container matColumnDef="issuedAt"><th mat-header-cell *matHeaderCellDef>发布时间</th><td mat-cell *matCellDef="let row">{{ row.issuedAt.replace('T', ' ').slice(0, 16) }}</td></ng-container>
          <ng-container matColumnDef="version"><th mat-header-cell *matHeaderCellDef>版本</th><td mat-cell *matCellDef="let row">V{{ row.version }}</td></ng-container>
          <ng-container matColumnDef="note"><th mat-header-cell *matHeaderCellDef>说明</th><td mat-cell *matCellDef="let row">{{ row.note }}</td></ng-container>
          <tr mat-header-row *matHeaderRowDef="historyColumns"></tr><tr mat-row *matRowDef="let row; columns: historyColumns"></tr>
        </table>
      </div>
    </section>
  `,
  styles: [`
    .page { padding: 22px 28px 45px; }
    .metrics { display: grid; grid-template-columns: repeat(4, 1fr); background: white; border: 1px solid #d9e1df; margin-bottom: 15px; }
    .metrics article { padding: 17px 19px; border-right: 1px solid #e2e8e6; } .metrics article:last-child { border: 0; }
    .metrics span, .metrics strong, .metrics small { display: block; } .metrics span { color: #72807d; font-size: 12px; } .metrics strong { font-size: 27px; color: #245060; margin: 6px 0; } .metrics small { color: #98a4a0; font-size: 10px; }
    .threshold-band { background: white; border: 1px solid #d9e1df; margin-top: 15px; padding: 16px; } .band-head h2 { margin: 0 0 5px; font-size: 17px; } .band-head p { color: #72807d; font-size: 12px; margin: 0 0 12px; } table { width: 100%; } table.history { opacity: .85; margin-top: 6px; }
    .publish-card { border: 1px solid #d7c49a; background: #fdfaf1; padding: 14px 16px; margin: 16px 0 8px; } .publish-card h3 { margin: 0 0 4px; font-size: 14px; color: #8e681d; } .rule { margin: 0 0 10px; font-size: 11px; color: #8a7a58; }
    .publish-form { display: grid; grid-template-columns: repeat(3, 1fr) 2fr; gap: 10px; align-items: center; } .publish-form .wide { grid-column: 1 / -1; } .publish-form .btns { grid-column: 1 / -1; display: flex; gap: 8px; } .publish-form mat-form-field { width: 100%; }
    .history-title { font-size: 13px; color: #72807d; margin: 18px 0 4px; } button mat-icon { font-size: 16px; width: 16px; height: 16px; margin-right: 4px; }
  `]
})
export class DashboardPageComponent {
  private readonly store = inject(Store)
  readonly points$ = this.store.select(selectPoints)
  readonly anomalies$ = this.store.select(selectAnomalies)
  readonly dataset$ = this.store.select(selectDataset)
  readonly reconfirmCount$ = this.store.select(selectReconfirmCount)
  readonly pointCount$ = this.points$.pipe(map((points) => points.length))
  readonly abnormalCount$ = this.points$.pipe(map((points) => points.filter((point) => point.status !== '正常').length))
  readonly thresholdColumns = ['type', 'warning', 'alarm', 'rate', 'issuedAt', 'version', 'action']
  readonly historyColumns = ['type', 'warning', 'alarm', 'rate', 'issuedAt', 'version', 'note']
  draft: Threshold | null = null

  currentVersion(id: string): number {
    let version = 0
    this.dataset$.subscribe((dataset) => { version = dataset.thresholds.find((item) => item.id === id)?.version ?? 0 }).unsubscribe()
    return version
  }

  edit(threshold: Threshold): void {
    this.draft = { ...structuredClone(threshold), version: threshold.version + 1, warning: threshold.warning - 1, alarm: threshold.alarm - 1, note: '汛期加密复核后收紧阈值' }
  }

  publish(): void {
    if (!this.draft) return
    this.store.dispatch(TailingsActions.publishThreshold({ threshold: { ...this.draft, enabled: true, issuedAt: new Date().toISOString() } }))
    this.draft = null
  }
}
