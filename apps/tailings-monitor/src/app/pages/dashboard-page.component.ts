import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatTableModule } from '@angular/material/table'
import { Store } from '@ngrx/store'
import { map } from 'rxjs'
import type { TailingsDataset, Threshold } from '../domain'
import { SpatialMapComponent } from '../components/spatial-map.component'
import { TailingsActions } from '../store/tailings.actions'
import { selectAnomalies, selectDataset, selectPoints } from '../store/tailings.selectors'

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatTableModule, SpatialMapComponent],
  template: `
    <section class="page">
      <div class="metrics">
        <article><span>监测点</span><strong>{{ pointCount$ | async }}</strong><small>位移、水位、渗流、降雨</small></article>
        <article><span>异常点</span><strong>{{ abnormalCount$ | async }}</strong><small>阈值引擎自动标记</small></article>
        <article><span>待审异常</span><strong>{{ openAnomalyCount$ | async }}</strong><small>未完成处置闭环</small></article>
        <article><span>待新版确认</span><strong>{{ reconfirmCount$ | async }}</strong><small>阈值升版后重算</small></article>
      </div>
      <app-spatial-map [points]="(points$ | async) ?? []" />
      <div class="threshold-band">
        <div class="band-head"><div><h2>阈值版本与运行方式</h2><p>阈值版本发布后，待审批等未结案异常按新版重算并要求重新确认；已结案异常的证据继续按其结案时的原版查看。</p></div></div>
        <table mat-table [dataSource]="(dataset$ | async)?.thresholds ?? []">
          <ng-container matColumnDef="type"><th mat-header-cell *matHeaderCellDef>类型</th><td mat-cell *matCellDef="let row">{{ row.type }}</td></ng-container>
          <ng-container matColumnDef="warning"><th mat-header-cell *matHeaderCellDef>预警</th><td mat-cell *matCellDef="let row">{{ row.warning }} {{ row.unit }}</td></ng-container>
          <ng-container matColumnDef="alarm"><th mat-header-cell *matHeaderCellDef>报警</th><td mat-cell *matCellDef="let row">{{ row.alarm }} {{ row.unit }}</td></ng-container>
          <ng-container matColumnDef="rate"><th mat-header-cell *matHeaderCellDef>变化率</th><td mat-cell *matCellDef="let row">{{ row.changeRate }} {{ row.unit }}</td></ng-container>
          <ng-container matColumnDef="version"><th mat-header-cell *matHeaderCellDef>版本</th><td mat-cell *matCellDef="let row"><b>V{{ row.version }}</b><small class="vh">（历史 V{{ historyVersions(row.id) }}）</small></td></ng-container>
          <ng-container matColumnDef="publish"><th mat-header-cell *matHeaderCellDef>发布新版并重算</th><td mat-cell *matCellDef="let row">
            <div class="publish-form">
              <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>预警</mat-label><input matInput type="number" [(ngModel)]="drafts[row.id].warning" /></mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>报警</mat-label><input matInput type="number" [(ngModel)]="drafts[row.id].alarm" /></mat-form-field>
              <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>速率</mat-label><input matInput type="number" [(ngModel)]="drafts[row.id].changeRate" /></mat-form-field>
              <button mat-flat-button color="primary" (click)="publish(row)">发布 V{{ row.version + 1 }}</button>
            </div>
          </td></ng-container>
          <tr mat-header-row *matHeaderRowDef="thresholdColumns"></tr><tr mat-row *matRowDef="let row; columns: thresholdColumns"></tr>
        </table>
        <p class="rule-note">发布新版仅重算未结案异常并要求重新确认；列表、异常详情与导出审阅包对每个异常显示其实际依据的阈值版本，已结案显示“结案冻结”。</p>
      </div>
    </section>
  `,
  styles: [`
    .page { padding: 22px 28px 45px; }
    .metrics { display: grid; grid-template-columns: repeat(4, 1fr); background: white; border: 1px solid #d9e1df; margin-bottom: 15px; }
    .metrics article { padding: 17px 19px; border-right: 1px solid #e2e8e6; } .metrics article:last-child { border: 0; }
    .metrics span, .metrics strong, .metrics small { display: block; } .metrics span { color: #72807d; font-size: 12px; } .metrics strong { font-size: 27px; color: #245060; margin: 6px 0; } .metrics small { color: #98a4a0; font-size: 10px; }
    .threshold-band { background: white; border: 1px solid #d9e1df; margin-top: 15px; padding: 16px; } .threshold-band h2 { margin: 0 0 5px; font-size: 17px; } .threshold-band p { color: #72807d; font-size: 12px; margin: 0 0 12px; } table { width: 100%; }
    .vh { color: #98a4a0; font-size: 10px; }.publish-form { display: flex; gap: 8px; align-items: center; padding: 6px 0; }.publish-form mat-form-field { width: 84px; }.rule-note { font-size: 11px; color: #8a6720; background: #faf3e0; padding: 8px 10px; margin-top: 12px; }
  `]
})
export class DashboardPageComponent {
  private readonly store = inject(Store)
  readonly points$ = this.store.select(selectPoints)
  readonly anomalies$ = this.store.select(selectAnomalies)
  readonly dataset$ = this.store.select(selectDataset)
  readonly pointCount$ = this.points$.pipe(map((points) => points.length))
  readonly abnormalCount$ = this.points$.pipe(map((points) => points.filter((point) => point.status !== '正常').length))
  readonly openAnomalyCount$ = this.anomalies$.pipe(map((items) => items.filter((item) => item.status !== '已关闭').length))
  readonly reconfirmCount$ = this.anomalies$.pipe(map((items) => items.filter((item) => item.reconfirmRequired).length))
  readonly thresholdColumns = ['type', 'warning', 'alarm', 'rate', 'version', 'publish']
  drafts: Record<string, { warning: number; alarm: number; changeRate: number }> = {}
  private dataset?: TailingsDataset
  private readonly sub = this.dataset$.subscribe((dataset) => {
    this.dataset = dataset
    dataset.thresholds.forEach((threshold) => {
      if (!this.drafts[threshold.id]) this.drafts[threshold.id] = { warning: threshold.warning, alarm: threshold.alarm, changeRate: threshold.changeRate }
    })
  })

  historyVersions(id: string): string {
    return (this.dataset?.thresholdHistory[id] ?? []).map((item) => item.version).join('、') || '—'
  }

  publish(row: Threshold): void {
    const draft = this.drafts[row.id]
    const next: Threshold = {
      ...row,
      warning: Number(draft.warning),
      alarm: Number(draft.alarm),
      changeRate: Number(draft.changeRate),
      version: row.version + 1,
      publishedAt: new Date().toISOString(),
      note: `汛期值班升版（V${row.version} → V${row.version + 1}）`
    }
    this.store.dispatch(TailingsActions.publishThreshold({ threshold: next }))
  }
}
