import type { Anomaly, TailingsDataset, Threshold } from '../domain'

const thresholdD_v4: Threshold = { id: 'T-D', type: '位移', warning: 10, alarm: 16, changeRate: 3, unit: 'mm/d', enabled: true, version: 4, publishedAt: '2026-09-20T09:00:00', note: '主坝汛期位移控制值' }
const thresholdW_v3: Threshold = { id: 'T-W', type: '水位', warning: 871, alarm: 873, changeRate: 0.5, unit: 'm/h', enabled: true, version: 3, publishedAt: '2026-09-15T09:00:00', note: '汛期库水位速率限值' }
const thresholdS_v5: Threshold = { id: 'T-S', type: '渗流', warning: 2.2, alarm: 3, changeRate: 0.4, unit: 'L/s', enabled: true, version: 5, publishedAt: '2026-10-02T09:00:00', note: '汛中收紧渗流报警值' }
const thresholdS_v4: Threshold = { id: 'T-S', type: '渗流', warning: 2.5, alarm: 3.4, changeRate: 0.5, unit: 'L/s', enabled: true, version: 4, publishedAt: '2026-09-10T09:00:00', note: '汛初渗流控制值' }
const thresholdR_v2: Threshold = { id: 'T-R', type: '降雨', warning: 30, alarm: 50, changeRate: 10, unit: 'mm/h', enabled: true, version: 2, publishedAt: '2026-09-01T09:00:00', note: '降雨预警分级' }
const thresholdD_v3: Threshold = { id: 'T-D', type: '位移', warning: 12, alarm: 18, changeRate: 4, unit: 'mm/d', enabled: true, version: 3, publishedAt: '2026-08-25T09:00:00', note: '汛前位移控制值' }

const anomaly1: Anomaly = {
  id: 'AN-260929-01', pointId: 'P-D01', title: '主坝D01累计位移超过报警阈值', severity: '重大', status: '待负责人审批', openedAt: '2026-09-29T08:25:00', owner: '坝体安全组', triggerReadingId: 'RD-1', observedValue: '18.7 mm，昨日变化4.2 mm/d', version: 7, closedAt: '',
  basisThresholdId: 'T-D', basisThresholdVersion: 4, reconfirmRequired: false, recalcNote: '',
  fieldReviews: [{ id: 'FR-1', inspector: '宋立', arrivedAt: '2026-09-29T09:10:00', observed: '坝顶排水沟未见明显开裂，D01附近无新增裂缝，基准点稳定。', evidence: 'D01近景照片、基准点复核记录、GNSS原始观测文件', reassessment: '读数有效，位移趋势仍上升，建议立即降低库水位并加密监测。', version: 2 }],
  opinions: [
    { id: 'OP-1', specialist: '周岩', discipline: '岩土', content: '近三日位移速率持续高于阈值，需结合孔隙水压力分析潜在滑面。', conclusion: '支持结论', createdAt: '2026-09-29T10:20:00' },
    { id: 'OP-2', specialist: '许洁', discipline: '水文', content: '库水位仍接近警戒线，建议优先降低库水位并核对上游来水。', conclusion: '补充证据', createdAt: '2026-09-29T10:45:00' }
  ],
  plan: { id: 'PL-1', action: '降低库水位', owner: '库区调度班', deadline: '2026-09-29T18:00:00', conditions: '每2小时复测D01、D02和W01；位移速率恢复至3mm/d以下并稳定12小时后，负责人可关闭异常。', emergencyLinked: true, approvedBy: '', approvedAt: '' },
  revisions: [], branches: [], conflicts: []
}

const anomaly2: Anomaly = {
  id: 'AN-260929-02', pointId: 'P-W01', title: '库水位短时上升速率超预警值', severity: '较高', status: '原因调查中', openedAt: '2026-09-29T08:00:00', owner: '库区调度班', triggerReadingId: 'RD-4', observedValue: '873.4 m，1小时上升0.6 m', version: 4, closedAt: '',
  basisThresholdId: 'T-W', basisThresholdVersion: 3, reconfirmRequired: false, recalcNote: '',
  fieldReviews: [],
  opinions: [{ id: 'OP-3', specialist: '许洁', discipline: '水文', content: '上游降雨汇流导致入湖量增加，需核实泄洪闸状态。', conclusion: '支持结论', createdAt: '2026-09-29T09:00:00' }],
  plan: { id: 'PL-2', action: '加密监测', owner: '库区调度班', deadline: '2026-09-29T14:00:00', conditions: '每小时记录水位与入库流量，达到874.0m时启动应急联动。', emergencyLinked: false, approvedBy: '', approvedAt: '' },
  revisions: [], branches: [], conflicts: []
}

const anomaly3: Anomaly = {
  id: 'AN-260925-07', pointId: 'P-S01', title: '主坝S01渗流量短时超预警', severity: '关注', status: '已关闭', openedAt: '2026-09-24T16:30:00', owner: '坝体安全组', triggerReadingId: 'RD-1', observedValue: '2.7 L/s（按当时 V4 阈值预警 2.5）', version: 6, closedAt: '2026-09-26T11:00:00',
  basisThresholdId: 'T-S', basisThresholdVersion: 4, reconfirmRequired: false, recalcNote: '已结案，阈值依据冻结在 V4，证据按原版查看。',
  fieldReviews: [{ id: 'FR-7', inspector: '宋立', arrivedAt: '2026-09-24T17:20:00', observed: '排水棱体出水清澈，无浑浊颗粒，周边无新增渗水点。', evidence: '量水堰读数照片、出水浊度比对', reassessment: '降雨后短时渗流增大，复测回落至2.0 L/s以下，按V4阈值评估可关闭。', version: 1 }],
  opinions: [],
  plan: { id: 'PL-7', action: '疏通排水', owner: '坝体安全组', deadline: '2026-09-26T10:00:00', conditions: '渗流量回落至2.0 L/s以下且出水持续清澈。', emergencyLinked: false, approvedBy: '负责人 何清', approvedAt: '2026-09-26T09:30:00' },
  revisions: [], branches: [], conflicts: []
}

anomaly1.revisions = [{ version: 7, snapshot: structuredClone({ ...anomaly1, revisions: [], branches: [], conflicts: [] }), changedBy: '宋立', stationId: 'ST-FIELD-01', changedAt: '2026-09-29T10:50:00', note: '提交现场复核 V2，进入原因调查' }]
anomaly2.revisions = [{ version: 4, snapshot: structuredClone({ ...anomaly2, revisions: [], branches: [], conflicts: [] }), changedBy: '许洁', stationId: 'ST-CONSOLE', changedAt: '2026-09-29T09:00:00', note: '补充水文专业意见' }]
anomaly3.revisions = [{ version: 6, snapshot: structuredClone({ ...anomaly3, revisions: [], branches: [], conflicts: [] }), changedBy: '负责人 何清', stationId: 'ST-CONSOLE', changedAt: '2026-09-26T11:00:00', note: '满足V4阈值关闭条件，结案并冻结阈值依据' }]

export const seedDataset: TailingsDataset = {
  points: [
    { id: 'P-D01', name: '主坝顶部位移点 D01', zone: '主坝', type: '位移', longitude: 112.832, latitude: 40.116, status: '异常', currentValue: 18.7, unit: 'mm', thresholdId: 'T-D', lastInspectionAt: '2026-09-29T08:20:00' },
    { id: 'P-D02', name: '主坝下游位移点 D02', zone: '主坝', type: '位移', longitude: 112.837, latitude: 40.111, status: '预警', currentValue: 12.4, unit: 'mm', thresholdId: 'T-D', lastInspectionAt: '2026-09-29T08:10:00' },
    { id: 'P-W01', name: '库内水位计 W01', zone: '库区', type: '水位', longitude: 112.846, latitude: 40.121, status: '预警', currentValue: 873.4, unit: 'm', thresholdId: 'T-W', lastInspectionAt: '2026-09-29T07:55:00' },
    { id: 'P-S01', name: '主坝渗流计 S01', zone: '主坝', type: '渗流', longitude: 112.827, latitude: 40.106, status: '正常', currentValue: 1.8, unit: 'L/s', thresholdId: 'T-S', lastInspectionAt: '2026-10-03T07:40:00' },
    { id: 'P-R01', name: '库区雨量站 R01', zone: '库区', type: '降雨', longitude: 112.861, latitude: 40.132, status: '正常', currentValue: 24.6, unit: 'mm/h', thresholdId: 'T-R', lastInspectionAt: '2026-09-29T08:00:00' }
  ],
  thresholds: [thresholdD_v4, thresholdW_v3, thresholdS_v5, thresholdR_v2],
  thresholdHistory: {
    'T-D': [thresholdD_v3],
    'T-S': [thresholdS_v4]
  },
  readings: [
    { id: 'RD-1', pointId: 'P-D01', value: 18.7, unit: 'mm', capturedAt: '2026-09-29T08:20:00', deviceId: 'GNSS-D01', quality: '有效' },
    { id: 'RD-2', pointId: 'P-D01', value: 16.2, unit: 'mm', capturedAt: '2026-09-29T07:20:00', deviceId: 'GNSS-D01', quality: '有效' },
    { id: 'RD-3', pointId: 'P-D01', value: 13.8, unit: 'mm', capturedAt: '2026-09-29T06:20:00', deviceId: 'GNSS-D01', quality: '有效' },
    { id: 'RD-4', pointId: 'P-W01', value: 873.4, unit: 'm', capturedAt: '2026-09-29T07:55:00', deviceId: 'WL-W01', quality: '有效' }
  ],
  anomalies: [anomaly1, anomaly2, anomaly3],
  audit: [
    { id: 'A-1', entityId: 'P-D01', action: '生成异常', operator: '阈值引擎', detail: '累计位移18.7mm超过报警阈值16mm（阈值 T-D V4）', createdAt: '2026-09-29T08:25:00' },
    { id: 'A-2', entityId: 'AN-260929-01', action: '提交现场复核', operator: '宋立', detail: '原始读数有效，位移趋势仍上升', createdAt: '2026-09-29T09:25:00' },
    { id: 'A-3', entityId: 'AN-260929-01', action: '补充专业意见', operator: '周岩', detail: '建议结合孔隙水压力分析潜在滑面', createdAt: '2026-09-29T10:20:00' },
    { id: 'A-4', entityId: 'AN-260925-07', action: '关闭异常', operator: '负责人 何清', detail: '按 T-S V4 阈值评估满足关闭条件，冻结阈值依据', createdAt: '2026-09-26T11:00:00' },
    { id: 'A-5', entityId: 'T-S', action: '发布阈值版本', operator: '值班负责人', detail: '渗流阈值 V4 升至 V5，未结案异常待重新确认', createdAt: '2026-10-02T09:00:00' }
  ]
}
