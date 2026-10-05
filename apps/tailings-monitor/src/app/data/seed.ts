import type { TailingsDataset } from '../domain'

export const seedDataset: TailingsDataset = {
  points: [
    { id: 'P-D01', name: '主坝顶部位移点 D01', zone: '主坝', type: '位移', longitude: 112.832, latitude: 40.116, status: '异常', currentValue: 18.7, unit: 'mm', thresholdId: 'T-D', lastInspectionAt: '2026-10-04T08:20:00' },
    { id: 'P-D02', name: '主坝下游位移点 D02', zone: '主坝', type: '位移', longitude: 112.837, latitude: 40.111, status: '预警', currentValue: 12.4, unit: 'mm', thresholdId: 'T-D', lastInspectionAt: '2026-10-04T08:10:00' },
    { id: 'P-W01', name: '库内水位计 W01', zone: '库区', type: '水位', longitude: 112.846, latitude: 40.121, status: '预警', currentValue: 873.4, unit: 'm', thresholdId: 'T-W', lastInspectionAt: '2026-10-04T07:55:00' },
    { id: 'P-S01', name: '主坝渗流计 S01', zone: '主坝', type: '渗流', longitude: 112.827, latitude: 40.106, status: '正常', currentValue: 1.8, unit: 'L/s', thresholdId: 'T-S', lastInspectionAt: '2026-09-28T07:40:00' },
    { id: 'P-R01', name: '库区雨量站 R01', zone: '库区', type: '降雨', longitude: 112.861, latitude: 40.132, status: '正常', currentValue: 24.6, unit: 'mm/h', thresholdId: 'T-R', lastInspectionAt: '2026-10-04T08:00:00' }
  ],
  thresholds: [
    { id: 'T-D', type: '位移', warning: 10, alarm: 16, changeRate: 3, unit: 'mm/d', enabled: true, version: 4, issuedAt: '2026-10-02T09:00:00', note: '汛期收紧位移变化速率，由3.5降至3.0 mm/d' },
    { id: 'T-W', type: '水位', warning: 871, alarm: 873, changeRate: 0.5, unit: 'm/h', enabled: true, version: 3, issuedAt: '2026-09-25T09:00:00', note: '汛期限制水位复核' },
    { id: 'T-S', type: '渗流', warning: 2.2, alarm: 3, changeRate: 0.4, unit: 'L/s', enabled: true, version: 5, issuedAt: '2026-09-20T09:00:00', note: '渗流量报警值年度复核' },
    { id: 'T-R', type: '降雨', warning: 30, alarm: 50, changeRate: 10, unit: 'mm/h', enabled: true, version: 2, issuedAt: '2026-09-15T09:00:00', note: '短历时暴雨预警阈值' }
  ],
  thresholdsHistory: [
    { id: 'T-D', type: '位移', warning: 12, alarm: 18, changeRate: 3.5, unit: 'mm/d', enabled: true, version: 3, issuedAt: '2026-08-01T09:00:00', note: '汛期前初版阈值' },
    { id: 'T-D', type: '位移', warning: 14, alarm: 20, changeRate: 4, unit: 'mm/d', enabled: true, version: 2, issuedAt: '2026-06-01T09:00:00', note: '年度常规阈值' },
    { id: 'T-W', type: '水位', warning: 870, alarm: 872, changeRate: 0.6, unit: 'm/h', enabled: true, version: 2, issuedAt: '2026-08-01T09:00:00', note: '汛期前初版阈值' },
    { id: 'T-S', type: '渗流', warning: 2.5, alarm: 3.2, changeRate: 0.5, unit: 'L/s', enabled: true, version: 4, issuedAt: '2026-08-01T09:00:00', note: '汛期前初版阈值' }
  ],
  readings: [
    { id: 'RD-1', pointId: 'P-D01', value: 18.7, unit: 'mm', capturedAt: '2026-10-04T08:20:00', deviceId: 'GNSS-D01', quality: '有效' },
    { id: 'RD-2', pointId: 'P-D01', value: 16.2, unit: 'mm', capturedAt: '2026-10-04T07:20:00', deviceId: 'GNSS-D01', quality: '有效' },
    { id: 'RD-3', pointId: 'P-D01', value: 13.8, unit: 'mm', capturedAt: '2026-10-04T06:20:00', deviceId: 'GNSS-D01', quality: '有效' },
    { id: 'RD-4', pointId: 'P-W01', value: 873.4, unit: 'm', capturedAt: '2026-10-04T07:55:00', deviceId: 'WL-W01', quality: '有效' },
    { id: 'RD-5', pointId: 'P-S01', value: 3.3, unit: 'L/s', capturedAt: '2026-09-26T03:12:00', deviceId: 'SE-S01', quality: '有效' }
  ],
  anomalies: [
    {
      id: 'AN-261004-01', pointId: 'P-D01', title: '主坝D01累计位移超过报警阈值', severity: '重大', status: '待负责人审批', openedAt: '2026-10-04T08:25:00', owner: '坝体安全组', triggerReadingId: 'RD-1', observedValue: '18.7 mm，昨日变化4.2 mm/d', version: 7, updatedAt: '2026-10-04T10:45:00', thresholdVersion: 4, needsReconfirm: false, recalculatedFrom: 0, recalculatedAt: '', recalcNote: '', merge: null, closedAt: '',
      fieldReviews: [{ id: 'FR-1', inspector: '宋立', arrivedAt: '2026-10-04T09:10:00', observed: '坝顶排水沟未见明显开裂，D01附近无新增裂缝，基准点稳定。', evidence: 'D01近景照片、基准点复核记录、GNSS原始观测文件', reassessment: '读数有效，位移趋势仍上升，建议立即降低库水位并加密监测。', version: 2 }],
      opinions: [
        { id: 'OP-1', specialist: '周岩', discipline: '岩土', content: '近三日位移速率持续高于阈值，需结合孔隙水压力分析潜在滑面。', conclusion: '支持结论', createdAt: '2026-10-04T10:20:00' },
        { id: 'OP-2', specialist: '许洁', discipline: '水文', content: '库水位仍接近警戒线，建议优先降低库水位并核对上游来水。', conclusion: '补充证据', createdAt: '2026-10-04T10:45:00' }
      ],
      plan: { id: 'PL-1', action: '降低库水位', owner: '库区调度班', deadline: '2026-10-04T18:00:00', conditions: '每2小时复测D01、D02和W01；位移速率恢复至3mm/d以下并稳定12小时后，负责人可关闭异常。', emergencyLinked: true, approvedBy: '', approvedAt: '' }
    },
    {
      id: 'AN-261004-02', pointId: 'P-W01', title: '库水位短时上升速率超预警值', severity: '较高', status: '原因调查中', openedAt: '2026-10-04T08:00:00', owner: '库区调度班', triggerReadingId: 'RD-4', observedValue: '873.4 m，1小时上升0.6 m', version: 4, updatedAt: '2026-10-04T09:00:00', thresholdVersion: 3, needsReconfirm: false, recalculatedFrom: 0, recalculatedAt: '', recalcNote: '', merge: null, closedAt: '',
      fieldReviews: [], opinions: [{ id: 'OP-3', specialist: '许洁', discipline: '水文', content: '上游降雨汇流导致入湖量增加，需核实泄洪闸状态。', conclusion: '支持结论', createdAt: '2026-10-04T09:00:00' }],
      plan: { id: 'PL-2', action: '加密监测', owner: '库区调度班', deadline: '2026-10-04T14:00:00', conditions: '每小时记录水位与入库流量，达到874.0m时启动应急联动。', emergencyLinked: false, approvedBy: '', approvedAt: '' }
    },
    {
      // 已结案异常：证据与阈值版本锁定，阈值新版发布后仍按原版（渗流 V4）查看
      id: 'AN-260926-09', pointId: 'P-S01', title: '主坝S01渗流量瞬时超报警值', severity: '较高', status: '已关闭', openedAt: '2026-09-26T03:20:00', owner: '坝体安全组', triggerReadingId: 'RD-5', observedValue: '3.3 L/s（渗流阈值V4报警值3.2）', version: 9, updatedAt: '2026-09-27T16:30:00', thresholdVersion: 4, needsReconfirm: false, recalculatedFrom: 0, recalculatedAt: '', recalcNote: '', merge: null, closedAt: '2026-09-27T16:30:00',
      fieldReviews: [{ id: 'FR-9', inspector: '宋立', arrivedAt: '2026-09-26T05:00:00', observed: '量水堰水体浑浊度正常，堰后排水体无隆起，渗流为雨后短时峰值。', evidence: '量水堰标尺读数、排水体近景照片、降雨过程线', reassessment: '降雨导致的短时峰值，复测回落至1.8 L/s，证据按渗流阈值V4归档。', version: 1 }],
      opinions: [{ id: 'OP-9', specialist: '周岩', discipline: '岩土', content: '雨后渗流峰值与降雨过程对应，无管涌迹象，同意结案。', conclusion: '支持结论', createdAt: '2026-09-27T11:00:00' }],
      plan: { id: 'PL-9', action: '疏通排水', owner: '坝体安全组', deadline: '2026-09-27T12:00:00', conditions: '疏通量水堰前淤积，渗流量连续6小时低于2.5 L/s后关闭。', emergencyLinked: false, approvedBy: '何清', approvedAt: '2026-09-27T15:00:00' }
    }
  ],
  audit: [
    { id: 'A-1', entityId: 'P-D01', action: '生成异常', operator: '阈值引擎', detail: '累计位移18.7mm超过位移阈值V4报警值16mm', createdAt: '2026-10-04T08:25:00' },
    { id: 'A-2', entityId: 'AN-261004-01', action: '提交现场复核', operator: '宋立', detail: '原始读数有效，位移趋势仍上升', createdAt: '2026-10-04T09:25:00' },
    { id: 'A-3', entityId: 'AN-261004-01', action: '补充专业意见', operator: '周岩', detail: '建议结合孔隙水压力分析潜在滑面', createdAt: '2026-10-04T10:20:00' },
    { id: 'A-4', entityId: 'T-D', action: '发布阈值版本', operator: '监测主管', detail: '位移阈值升级至V4，未结案异常按新版重算', createdAt: '2026-10-02T09:00:00' },
    { id: 'A-5', entityId: 'AN-260926-09', action: '关闭异常', operator: '何清', detail: '渗流阈值V4下复测达标，证据按原版归档', createdAt: '2026-09-27T16:30:00' }
  ],
  revision: 12
}
