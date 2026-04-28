/* ════════════════════════════════
   DATA STORE
════════════════════════════════ */
const SETTING_META = {
  category: {title:'ชนิดครุภัณฑ์ (Category)', group:'device'},
  brand: {title:'ยี่ห้อ (Brand)', group:'device'},
  sny: {title:'รหัส สนย.', group:'device'},
  risk: {title:'ระดับความเสี่ยง', group:'device'},
  dept: {title:'หน่วยงาน / แผนก', group:'org'},
  vendor: {title:'บริษัทผู้จัดจำหน่าย', group:'org'},
  procurement: {title:'ที่มาการจัดซื้อ', group:'org'},
  status: {title:'สถานะการใช้งาน', group:'service'},
  repairCause: {title:'สาเหตุการชำรุด (CM Cause)', group:'service'},
  technician: {title:'ช่างซ่อม (Technicians)', group:'service'}
};

const SETTING_GROUPS = {
  device: 'ข้อมูลพื้นฐานอุปกรณ์ (Device Master Data)',
  org: 'ข้อมูลองค์กรและการจัดซื้อ (Organization & Procurement)',
  service: 'งานบริการและซ่อมบำรุง (Service & Maintenance)'
};

/* ════════════════════════════════
   PM CHECKLISTS — by device category
   (ISO 13485 §7.5.1, ECRI guideline)
════════════════════════════════ */
const PM_CHECKLISTS = {
  'เครื่องช่วยหายใจ (Ventilator)': [
    {cat:'ก. กายภาพและความสะอาด', items:[
      {id:'vc1',desc:'ตัวเครื่อง ป้ายข้อความ และปุ่มควบคุมครบถ้วน ไม่มีรอยแตก',type:'check'},
      {id:'vc2',desc:'สาย patient circuit, Y-piece, connector ครบสมบูรณ์ ไม่มีรอยรั่ว',type:'check'},
      {id:'vc3',desc:'Humidifier / Water trap สะอาด น้ำอยู่ในระดับที่กำหนด',type:'check'},
    ]},
    {cat:'ข. ทดสอบ Flow & Pressure', items:[
      {id:'vv4',desc:'Tidal Volume @ 500 mL (spec: 450–550 mL)',type:'measure',unit:'mL',spec:'450–550'},
      {id:'vv5',desc:'PIP ณ ค่าที่ตั้ง (spec: ±5%)',type:'measure',unit:'cmH₂O',spec:'±5%'},
      {id:'vv6',desc:'PEEP ณ ค่าที่ตั้ง (spec: ±2 cmH₂O)',type:'measure',unit:'cmH₂O',spec:'±2'},
    ]},
    {cat:'ค. Alarm Test', items:[
      {id:'va7',desc:'High/Low pressure alarm ทำงานถูกต้อง',type:'check'},
      {id:'va8',desc:'Disconnect alarm เกิดขึ้นภายใน 15 วินาที',type:'check'},
      {id:'va9',desc:'Apnea alarm ทำงานถูกต้อง',type:'check'},
    ]},
    {cat:'ง. O₂ และ Battery', items:[
      {id:'vo10',desc:'FiO₂ accuracy (spec: ±5%)',type:'measure',unit:'%',spec:'±5%'},
      {id:'vb11',desc:'Battery backup ≥ 2 ชั่วโมง — ไม่มี Low battery alarm ก่อนกำหนด',type:'check'},
    ]},
    {cat:'จ. Electrical Safety (IEC 62353)', items:[
      {id:'ve12',desc:'Earth leakage current (spec: ≤500 μA)',type:'measure',unit:'μA',spec:'≤500'},
      {id:'ve13',desc:'Earth resistance (spec: ≤0.5 Ω)',type:'measure',unit:'Ω',spec:'≤0.5'},
    ]},
  ],
  'Patient Monitor': [
    {cat:'ก. กายภาพและจอแสดงผล', items:[
      {id:'pm1',desc:'จอแสดงผล ไม่มี dead pixel ความสว่างเหมาะสม',type:'check'},
      {id:'pm2',desc:'ปุ่มกด สาย และ connector ครบสมบูรณ์',type:'check'},
    ]},
    {cat:'ข. ECG และ SpO₂', items:[
      {id:'pm3',desc:'ECG waveform ชัดเจน Lead detection ครบ',type:'check'},
      {id:'pm4',desc:'SpO₂ accuracy (spec: ±2%)',type:'measure',unit:'%SpO₂',spec:'±2%'},
    ]},
    {cat:'ค. NIBP', items:[
      {id:'pm5',desc:'NIBP Systolic accuracy (spec: ±5 mmHg)',type:'measure',unit:'mmHg',spec:'±5'},
      {id:'pm6',desc:'NIBP Diastolic accuracy (spec: ±5 mmHg)',type:'measure',unit:'mmHg',spec:'±5'},
    ]},
    {cat:'ง. Alarm และ Battery', items:[
      {id:'pm7',desc:'High/Low alarm limits ทำงานถูกต้องทุก parameter',type:'check'},
      {id:'pm8',desc:'Battery backup ≥ 4 ชั่วโมง',type:'check'},
    ]},
    {cat:'จ. Electrical Safety (IEC 62353)', items:[
      {id:'pm9',desc:'Earth leakage current (spec: ≤500 μA)',type:'measure',unit:'μA',spec:'≤500'},
      {id:'pm10',desc:'Earth resistance (spec: ≤0.5 Ω)',type:'measure',unit:'Ω',spec:'≤0.5'},
    ]},
  ],
  'Defibrillator': [
    {cat:'ก. กายภาพและ Self-test', items:[
      {id:'df1',desc:'ตัวเครื่อง paddle/electrode pad ครบถ้วน ไม่มีรอยแตก',type:'check'},
      {id:'df2',desc:'Self-test ผ่าน (เปิดเครื่องทดสอบอัตโนมัติ)',type:'check'},
    ]},
    {cat:'ข. Energy Delivery Accuracy', items:[
      {id:'df3',desc:'Delivered energy @ 200 J (spec: 170–230 J)',type:'measure',unit:'J',spec:'170–230'},
      {id:'df4',desc:'Delivered energy @ 360 J (spec: 306–414 J)',type:'measure',unit:'J',spec:'306–414'},
    ]},
    {cat:'ค. AED & Sync Mode', items:[
      {id:'df5',desc:'AED mode: self-test pass และ prompt ถูกต้อง',type:'check'},
      {id:'df6',desc:'Sync mode: R-wave detection ไม่มี misfire',type:'check'},
    ]},
    {cat:'ง. Battery', items:[
      {id:'df7',desc:'Battery สามารถ charge ≥100 J ได้อย่างน้อย 3 ครั้งติดต่อกัน',type:'check'},
    ]},
    {cat:'จ. Electrical Safety (IEC 62353)', items:[
      {id:'df8',desc:'Earth leakage current (spec: ≤500 μA)',type:'measure',unit:'μA',spec:'≤500'},
      {id:'df9',desc:'Paddle leakage current (spec: ≤100 μA)',type:'measure',unit:'μA',spec:'≤100'},
    ]},
  ],
  'Infusion Pump': [
    {cat:'ก. กายภาพ', items:[
      {id:'ip1',desc:'ตัวเครื่อง ช่อง IV set ไม่มีรอยแตก ประตูปิดสนิท',type:'check'},
      {id:'ip2',desc:'IV set / Syringe holder ครบ ล็อคได้ถูกต้อง',type:'check'},
    ]},
    {cat:'ข. Flow Accuracy', items:[
      {id:'ip3',desc:'Flow accuracy @ 5 mL/hr (spec: 4.75–5.25 mL/hr)',type:'measure',unit:'mL/hr',spec:'4.75–5.25'},
      {id:'ip4',desc:'Flow accuracy @ 100 mL/hr (spec: 95–105 mL/hr)',type:'measure',unit:'mL/hr',spec:'95–105'},
    ]},
    {cat:'ค. Alarm Test', items:[
      {id:'ip5',desc:'Occlusion pressure alarm ทำงานถูกต้อง',type:'check'},
      {id:'ip6',desc:'Air-in-line alarm ทำงานถูกต้อง',type:'check'},
      {id:'ip7',desc:'Door open / IV empty alarm ทำงานถูกต้อง',type:'check'},
    ]},
    {cat:'ง. Battery & Safety', items:[
      {id:'ip8',desc:'Battery backup ≥ 2 ชั่วโมง',type:'check'},
      {id:'ip9',desc:'Earth leakage current (spec: ≤500 μA)',type:'measure',unit:'μA',spec:'≤500'},
    ]},
  ],
  'ECG 12-lead': [
    {cat:'ก. กายภาพ', items:[
      {id:'ec1',desc:'ตัวเครื่อง สาย Lead 10 เส้น ครบสมบูรณ์ ไม่มีรอยชำรุด',type:'check'},
    ]},
    {cat:'ข. Signal Quality', items:[
      {id:'ec2',desc:'Waveform ครบทั้ง 12 leads ไม่มี baseline drift หรือ noise',type:'check'},
      {id:'ec3',desc:'Calibration signal 1 mV (spec: 0.95–1.05 mV)',type:'measure',unit:'mV',spec:'0.95–1.05'},
      {id:'ec4',desc:'Heart rate accuracy ±5 bpm (ทดสอบกับ simulator)',type:'measure',unit:'bpm (error)',spec:'≤5'},
    ]},
    {cat:'ค. Print & Safety', items:[
      {id:'ec5',desc:'Print quality ชัดเจน paper feed ปกติ',type:'check'},
      {id:'ec6',desc:'Earth leakage current (spec: ≤500 μA)',type:'measure',unit:'μA',spec:'≤500'},
      {id:'ec7',desc:'Earth resistance (spec: ≤0.5 Ω)',type:'measure',unit:'Ω',spec:'≤0.5'},
    ]},
  ],
  'เครื่องวัดความดัน (BP)': [
    {cat:'ก. กายภาพ', items:[
      {id:'bp1',desc:'ตัวเครื่อง cuff ทุกขนาด และ connector ครบ ไม่มีรอยรั่ว',type:'check'},
    ]},
    {cat:'ข. Accuracy', items:[
      {id:'bp2',desc:'Systolic accuracy เทียบกับ reference manometer (spec: ±5 mmHg)',type:'measure',unit:'mmHg',spec:'±5'},
      {id:'bp3',desc:'Diastolic accuracy (spec: ±5 mmHg)',type:'measure',unit:'mmHg',spec:'±5'},
    ]},
    {cat:'ค. ทดสอบ', items:[
      {id:'bp4',desc:'Deflation rate เหมาะสม (2–4 mmHg/s)',type:'check'},
      {id:'bp5',desc:'Cuff seal ไม่มีการรั่วที่ระดับ 300 mmHg ≥ 5 วินาที',type:'check'},
      {id:'bp6',desc:'Earth leakage current (spec: ≤500 μA)',type:'measure',unit:'μA',spec:'≤500'},
    ]},
  ],
  'Ultrasound Portable': [
    {cat:'ก. กายภาพ', items:[
      {id:'us1',desc:'ตัวเครื่อง หน้าจอ และ probe holder ครบสมบูรณ์',type:'check'},
      {id:'us2',desc:'Probe ทุกหัวไม่มีรอยแตก / crystal เสียหาย',type:'check'},
    ]},
    {cat:'ข. Image Quality', items:[
      {id:'us3',desc:'ภาพ B-mode ชัดเจน ไม่มี artifact ผิดปกติ ทุก probe',type:'check'},
      {id:'us4',desc:'Freeze และ Cine loop ทำงานถูกต้อง',type:'check'},
    ]},
    {cat:'ค. Measurement & Safety', items:[
      {id:'us5',desc:'Distance measurement accuracy (spec: ±5%)',type:'measure',unit:'%',spec:'±5%'},
      {id:'us6',desc:'Earth leakage current (spec: ≤500 μA)',type:'measure',unit:'μA',spec:'≤500'},
      {id:'us7',desc:'Earth resistance (spec: ≤0.5 Ω)',type:'measure',unit:'Ω',spec:'≤0.5'},
    ]},
  ],
  '_default': [
    {cat:'ก. ตรวจสอบกายภาพ', items:[
      {id:'gn1',desc:'ตัวเครื่อง ไม่มีรอยแตก ชำรุด สกปรก',type:'check'},
      {id:'gn2',desc:'สาย อุปกรณ์เสริม ครบถ้วนตามทะเบียนพัสดุ',type:'check'},
    ]},
    {cat:'ข. การทำงาน', items:[
      {id:'gn3',desc:'เปิดเครื่อง boot ปกติ ไม่มี error code',type:'check'},
      {id:'gn4',desc:'Function หลักทำงานได้ตามปกติ',type:'check'},
      {id:'gn5',desc:'Alarm ทำงานได้ถูกต้อง',type:'check'},
    ]},
    {cat:'ค. Electrical Safety', items:[
      {id:'gn6',desc:'Earth leakage current (spec: ≤500 μA)',type:'measure',unit:'μA',spec:'≤500'},
    ]},
  ],
};

/* PM Frequency defaults (months) by category — used by Annual Plan generator */
const PM_FREQ_MAP = {
  'เครื่องช่วยหายใจ (Ventilator)': { pmMonths:6, calMonths:12, label:'PM ทุก 6 เดือน / Cal 1 ปี' },
  'Patient Monitor':               { pmMonths:3, calMonths:12, label:'PM ทุก 3 เดือน / Cal 1 ปี' },
  'Defibrillator':                 { pmMonths:3, calMonths:12, label:'PM ทุก 3 เดือน / Cal 1 ปี' },
  'Infusion Pump':                 { pmMonths:6, calMonths:12, label:'PM ทุก 6 เดือน / Cal 1 ปี' },
  'ECG 12-lead':                   { pmMonths:12, calMonths:12, label:'PM ทุก 1 ปี / Cal 1 ปี' },
  'เครื่องวัดความดัน (BP)':        { pmMonths:12, calMonths:12, label:'PM ทุก 1 ปี / Cal 1 ปี' },
  'Ultrasound Portable':           { pmMonths:12, calMonths:24, label:'PM ทุก 1 ปี / Cal 2 ปี' },
  '_default':                      { pmMonths:12, calMonths:12, label:'PM ทุก 1 ปี / Cal 1 ปี' },
};

/* IEC 62353 Electrical Safety Limits by device class and applied part type */
const IEC62353_LIMITS = {
  earthRes:  { spec:'≤ 0.2 Ω', limit:0.2 },
  insRes:    { spec:'≥ 2 MΩ', limitMin:2 },
  eqLeak:  { I: 500, II: 100, label:'μA' },
  patLeak: { B: 100, BF: 10, CF: 10, label:'μA' },
  appLeak: { B: 100, BF: 100, CF: 10, label:'μA' },
};

const DB = {
  assets: [
    {id:'ME-0001',name:'Ventilator ICU',category:'เครื่องช่วยหายใจ (Ventilator)',mfr:'Dräger',model:'Evita XL',dept:'ICU',status:'พร้อมใช้',cal:'30 มิ.ย. 67',pm:'15 เม.ย. 67',risk:'สูง',serial:'DRG-001234',price:2800000,year:2562,depYears:5,sny:'1111-01',vendor:'Medical Tech Co.',accessories:['Oxygen Sensor', 'Breathing Circuit']},
    {id:'ME-0012',name:'Infusion Pump',category:'Infusion Pump',mfr:'B. Braun',model:'Infusomat Space',dept:'ICU',status:'ยืมออก',cal:'9 เม.ย. 67',pm:'1 พ.ค. 67',risk:'กลาง',serial:'BB-045678',price:120000,year:2563,depYears:5,sny:'2222-02',vendor:'Health Supply',accessories:['IV Pole clamp']},
    {id:'ME-0021',name:'ECG 12-lead',category:'ECG 12-lead',mfr:'GE Healthcare',model:'MAC 5500 HD',dept:'ห้องฉุกเฉิน',status:'ยืมออก',cal:'30 ก.ย. 67',pm:'20 เม.ย. 67',risk:'กลาง',serial:'GE-A2B3C4',price:380000,year:2563,depYears:7,sny:'3333-03',vendor:'GE Thai',accessories:['ECG Cable 10-lead', 'Trolley']},
    {id:'ME-0033',name:'Defibrillator',category:'Defibrillator',mfr:'Zoll',model:'R Series',dept:'ห้องฉุกเฉิน',status:'พร้อมใช้',cal:'31 ก.ค. 67',pm:'16 เม.ย. 67',risk:'สูง',serial:'ZL-009988',price:560000,year:2561,depYears:5,sny:'4444-04',vendor:'Zoll Thai',accessories:['Defib Pads', 'Pacing Cable']},
    {id:'ME-0045',name:'Pulse Oximeter',category:'Patient Monitor',mfr:'Masimo',model:'Radical-7',dept:'หอผู้ป่วย 3A',status:'ยืมออก',cal:'31 พ.ค. 67',pm:'30 เม.ย. 67',risk:'ต่ำ',serial:'MS-112233',price:85000,year:2565,depYears:5,sny:'5555-05',vendor:'Masimo Dist.',accessories:['SpO2 Sensor']},
    {id:'ME-0067',name:'เครื่องวัด BP',category:'เครื่องวัดความดัน (BP)',mfr:'Omron',model:'HBP-1300',dept:'OPD',status:'ยืมออก',cal:'30 ส.ค. 67',pm:'10 พ.ค. 67',risk:'ต่ำ',serial:'OM-778899',price:45000,year:2566,depYears:3,sny:'6666-06',vendor:'Omron Healthcare',accessories:['Cuff M', 'Cuff L']},
    {id:'ME-0082',name:'Ultrasound Portable',category:'Ultrasound Portable',mfr:'Philips',model:'Lumify',dept:'ห้องฉุกเฉิน',status:'ซ่อม',cal:'—',pm:'5 พ.ค. 67',risk:'กลาง',serial:'PH-335566',price:950000,year:2555,depYears:7,sny:'7777-07',vendor:'Philips Med',accessories:['Linear Probe', 'Convex Probe']},
    {id:'ME-0095',name:'Patient Monitor',category:'Patient Monitor',mfr:'Mindray',model:'BeneVision N17',dept:'CCU',status:'พร้อมใช้',cal:'30 พ.ย. 67',pm:'25 เม.ย. 67',risk:'สูง',serial:'MR-445566',price:320000,year:2564,depYears:5,sny:'8888-08',vendor:'Mindray Thai',accessories:['NIBP Hose', 'ECG Trunk Cable']},
    {id:'ME-0008',name:'Infusion Pump (เก่า)',category:'Infusion Pump',mfr:'B. Braun',model:'Infusomat FM',dept:'ICU',status:'จำหน่าย/แทงจำหน่าย',cal:'—',pm:'—',risk:'กลาง',serial:'BB-001122',price:95000,year:2555,depYears:5,sny:'2222-01',vendor:'Health Supply',accessories:[],decommDate:'1 มี.ค. 67',decommReason:'หมดอายุค่าเสื่อมราคา ซ่อมไม่คุ้มค่า'},
    {id:'ME-0019',name:'ECG 3-lead Monitor',category:'Patient Monitor',mfr:'Nihon Kohden',model:'BSM-1700',dept:'หอผู้ป่วย 3A',status:'จำหน่าย/แทงจำหน่าย',cal:'—',pm:'—',risk:'กลาง',serial:'NK-334455',price:210000,year:2556,depYears:7,sny:'8888-02',vendor:'NK Thai',accessories:[],decommDate:'15 ม.ค. 67',decommReason:'อุปกรณ์ชำรุดหนักเกินกว่าจะซ่อม'},
  ],
  loans: [
    {id:'LN-0043',items:[{reqId:'ME-0021',allocId:'ME-0021',name:'ECG 12-lead',inspect:false,postInspect:false}],borrower:'พว.สมฤดี ใจบุญ',dept:'OPD',loanDate:'วันนี้',due:'12 เม.ย. 67',dueTs:null,status:'pending',reason:'ผู้ป่วยฉุกเฉิน',note:'',hn:'4455667',rights:'บัตรทอง',dx:'Chest Pain'},
    {id:'LN-0042',items:[{reqId:'ME-0001',allocId:'ME-0001',name:'Ventilator ICU',inspect:false,postInspect:false}, {reqId:'ME-0045',allocId:'ME-0045',name:'Pulse Oximeter',inspect:false,postInspect:false}],borrower:'พว.จินตนา ใจสู้',dept:'NICU',loanDate:'รอจัดสรร',due:'—',dueTs:null,status:'pending',reason:'จองล่วงหน้า',note:'ขอคิวเครื่อง 2 รายการด่วน',hn:'1122334',rights:'ข้าราชการ',dx:'Pneumonia'},
    {id:'LN-0041',items:[{reqId:'ME-0021',allocId:'ME-0021',name:'ECG 12-lead',inspect:true,postInspect:false}],borrower:'พว.มาลี วงศ์ใหญ่',dept:'ห้องฉุกเฉิน',loanDate:'3 เม.ย. 67',due:'10 เม.ย. 67',dueTs:new Date(2024,3,10),status:'loaned',reason:'อุปกรณ์หลักของแผนกเสีย',note:''},
    {id:'LN-0040',items:[{reqId:'ME-0045',allocId:'ME-0045',name:'Pulse Oximeter',inspect:true,postInspect:false}],borrower:'พว.สมหญิง ใจดี',dept:'หอผู้ป่วย 3A',loanDate:'1 เม.ย. 67',due:'5 เม.ย. 67',dueTs:new Date(2024,3,5),status:'pending_return',reason:'ผู้ป่วยฉุกเฉิน',note:'',hn:'9988776',rights:'บัตรทอง',dx:'Asthma'},
    {id:'LN-0039',items:[{reqId:'ME-0012',allocId:'ME-0012',name:'Infusion Pump',inspect:true,postInspect:false}],borrower:'พว.นาตยา รักษ์',dept:'ICU',loanDate:'6 เม.ย. 67',due:'9 เม.ย. 67',dueTs:new Date(2024,3,9),status:'calexp',reason:'อุปกรณ์ไม่เพียงพอ',note:''},
    {id:'LN-0038',items:[{reqId:'ME-0067',allocId:'ME-0067',name:'เครื่องวัด BP',inspect:true,postInspect:false}],borrower:'พว.ประภา นามสกุล',dept:'OPD',loanDate:'7 เม.ย. 67',due:'14 เม.ย. 67',dueTs:new Date(2024,3,14),status:'loaned',reason:'อุปกรณ์หลักของแผนกเสีย',note:''},
    {id:'LN-0037',items:[{reqId:'ME-0033',allocId:'ME-0033',name:'Defibrillator',inspect:true,postInspect:true}],borrower:'พว.สุนันทา ไพรัตน์',dept:'ห้องผ่าตัด',loanDate:'25 มี.ค. 67',due:'30 มี.ค. 67',dueTs:new Date(2024,2,30),status:'returned',reason:'ผู้ป่วยฉุกเฉิน',note:'คืนแล้วสภาพปกติ'},
    {id:'LN-0036',items:[{reqId:'ME-0095',allocId:'ME-0095',name:'Patient Monitor',inspect:true,postInspect:true}],borrower:'พว.วันดี มีสุข',dept:'หอผู้ป่วย 3A',loanDate:'20 มี.ค. 67',due:'25 มี.ค. 67',dueTs:new Date(2024,2,25),status:'returned',reason:'อุปกรณ์ไม่เพียงพอ',note:''},
  ],
  auditLog: [
    {time:'08:30',user:'วิชัย สุขดี',action:'PM เสร็จสิ้น WO-0442',detail:'Ventilator ME-0001 · PM 6 เดือน ผ่าน',type:'PM'},
    {time:'09:15',user:'วิชัย สุขดี',action:'รับคืน Defibrillator ME-0033',detail:'Post-inspect ผ่าน · สถานะ: พร้อมใช้งาน',type:'LOAN'},
    {time:'10:42',user:'นพ.ประสงค์ ดีมาก',action:'อนุมัติยืม LN-0041',detail:'ECG 12-lead → ห้องฉุกเฉิน · ผู้ยืม: พว.มาลี',type:'LOAN'},
    {time:'07:00',user:'ระบบ AUTO',action:'แจ้งเตือนเกินกำหนดคืน',detail:'ME-0045 Pulse Oximeter · เกิน 3 วัน · SMS ส่งแล้ว',type:'NOTIFY'},
    {time:'เมื่อวาน',user:'วิชัย สุขดี',action:'เปิด Incident INC-031',detail:'ECG ME-0021 หน้าจอแตกระหว่างยืม · CAPA รอดำเนินการ',type:'INC'},
    {time:'เมื่อวาน',user:'สมชาย รักดี',action:'สอบเทียบ ME-0001',detail:'Ventilator · CAL-2024-001 · NIMT traceable · ผ่าน',type:'CAL'},
    {time:'2 วันก่อน',user:'วิชัย สุขดี',action:'Pre-loan inspect LN-0039',detail:'Infusion Pump ME-0012 · ผ่าน 9/9 รายการ',type:'INSPECT'},
  ]
  ,pmList: [
    {id:'WO-0441', kind:'pm', devId:'ME-0033', device:'Defibrillator', type:'PM 3 เดือน', due:'16 เม.ย.', resp:'วิชัย สุขดี', status:'รอดำเนินการ', result:'', cost:0},
    {id:'WO-0442', kind:'pm', devId:'ME-0001', device:'Ventilator', type:'PM 6 เดือน', due:'15 เม.ย.', resp:'สมชาย รักดี', status:'รอดำเนินการ', result:'', cost:0},
    {id:'WO-0438', kind:'pm', devId:'ME-0021', device:'ECG 12-lead', type:'PM 1 ปี', due:'3 เม.ย.', resp:'วิชัย สุขดี', status:'เสร็จสิ้น', result:'ผ่านเกณฑ์มาตรฐาน (Pass)', cost:0},
    {id:'WO-0435', kind:'pm', devId:'ME-0095', device:'Patient Monitor', type:'PM 3 เดือน', due:'28 มี.ค.', resp:'สมชาย รักดี', status:'เสร็จสิ้น', result:'ผ่านเกณฑ์มาตรฐาน (Pass)', cost:0},
    {id:'WO-0390', kind:'cal', devId:'ME-0012', device:'Infusion Pump', type:'สอบเทียบมาตรฐานประจำปี', due:'10 พ.ค.', resp:'NIMT', status:'รอดำเนินการ', result:'', cost:1500},
    {id:'CAL-0115', kind:'cal', devId:'ME-0001', device:'Ventilator ICU', type:'สอบเทียบ Flow Sensor ประจำปี', due:'30 มิ.ย.', resp:'NIMT', status:'รอดำเนินการ', result:'', cost:3500},
    {id:'CAL-0112', kind:'cal', devId:'ME-0033', device:'Defibrillator', type:'สอบเทียบพลังงานและ AED ประจำปี', due:'31 ก.ค.', resp:'วิชัย สุขดี', status:'รอดำเนินการ', result:'', cost:2000},
    {id:'CAL-0098', kind:'cal', devId:'ME-0067', device:'เครื่องวัด BP', type:'สอบเทียบความดันประจำปี', due:'30 ส.ค.', resp:'วิชัย สุขดี', status:'รอดำเนินการ', result:'', cost:800},
    {id:'CAL-0081', kind:'cal', devId:'ME-0001', device:'Ventilator ICU', type:'สอบเทียบ Flow Sensor ประจำปี', due:'1 ก.ค. 66', resp:'NIMT', status:'เสร็จสิ้น', result:'ผ่านเกณฑ์มาตรฐาน (Pass) · ใบรับรอง NIMT-2566-4421', cost:3500},
    {id:'WO-0210', kind:'pm', devId:'ME-0021', device:'ECG 12-lead', type:'PM 6 เดือน', due:'3 ต.ค. 66', resp:'วิชัย สุขดี', status:'เสร็จสิ้น', result:'ผ่านแบบมีเงื่อนไข/ปรับตั้ง (Adjusted)', cost:0},
  ],
  repairs: [
    {id:'CM-0201', devId:'ME-0082', device:'Ultrasound', sym:'หน้าจอกระพริบ transducer error', reporter:'พว.สมหญิง', date:'5 เม.ย.', days:4, tech:'วิชัย สุขดี', status:'กำลังซ่อม', location:'ซ่อมหน้างาน', ext:false, cost:0, cause:'', parts:''},
    {id:'CM-0199', devId:'ME-0055', device:'Patient Monitor', sym:'SpO₂ probe เสีย', reporter:'พว.มานี', date:'1 เม.ย.', days:8, tech:'สมชาย รักดี', status:'กำลังซ่อม', location:'ศูนย์ฯ', ext:false, cost:0, cause:'หัววัดชำรุด', parts:'SpO2 Sensor x1'},
    {id:'CM-0190', devId:'ME-0021', device:'ECG 12-lead', sym:'เปิดไม่ติด ไฟไม่เข้า', reporter:'พว.มาลี', date:'10 มี.ค.', days:32, tech:'', status:'ส่งซ่อมภายนอก', location:'ศูนย์ฯ', ext:true, cost:15000, cause:'บอร์ดจ่ายไฟเสีย', parts:''},
  ],
  incidents: [
    {id:'INC-031', devId:'ME-0021', device:'ECG 12-lead', event:'หน้าจอแตกระหว่างยืม เนื่องจากรถเข็นสะดุดพื้นรอยต่อ', severity:'Medium (บาดเจ็บเล็กน้อย/ทรัพย์สินเสียหาย)', status:'กำลังสืบสวน (Investigation)', date:'9 เม.ย. 67', reporter:'พว.มาลี', rca:'', ca:'', pa:''},
    {id:'INC-028', devId:'ME-0001', device:'Ventilator', event:'เครื่องดับเองขณะใช้งานกับผู้ป่วย (ไม่มีแบตเตอรี่สำรองทำงาน)', severity:'High (Sentinel Event - กระทบผู้ป่วย)', status:'ปิดแล้ว (Closed)', date:'15 มี.ค. 67', reporter:'พว.จินตนา', rca:'แบตเตอรี่เสื่อมสภาพและไม่ได้ถูกเปลี่ยนตามรอบวงรอบ PM', ca:'เปลี่ยนแบตเตอรี่ก้อนใหม่และทดสอบระบบไฟสำรองทันที', pa:'ปรับแก้ SOP ให้เช็คแบตเตอรี่ทุกๆ 6 เดือนแทน 1 ปี'}
  ],
  qmsDocs: [
    {id:'SOP-BMED-01', name:'การรับเข้าและขึ้นทะเบียนเครื่องมือ', rev:'02', date:'1 ม.ค. 67', status:'Active'},
    {id:'SOP-BMED-02', name:'มาตรฐานการสอบเทียบ (NIMT Traceable)', rev:'04', date:'15 ก.พ. 67', status:'Active'},
    {id:'WI-BMED-05', name:'การทดสอบความปลอดภัยไฟฟ้า (IEC 62353)', rev:'01', date:'10 มี.ค. 67', status:'Active'}
  ],
  trainingRecords: [
    {user:'วิชัย สุขดี', course:'ISO 13485:2016 Internal Auditor', date:'10 เม.ย. 67', result:'ผ่านเกณฑ์'},
    {user:'สมชาย รักดี', course:'Electrical Safety Analyzer & Tester', date:'5 เม.ย. 67', result:'ผ่านเกณฑ์'}
  ],
  users: [
    {id:'U001',username:'admin',    password:'admin1234',name:'ผู้ดูแลระบบ (Admin)',        role:'admin',  dept:'ศูนย์วิศวกรรมการแพทย์',    avatar:'ผด',pin:'1234',active:true},
    {id:'U002',username:'wichai',   password:'1234',     name:'วิชัย สุขดี',              role:'bmed',   dept:'ศูนย์วิศวกรรมการแพทย์',    avatar:'วช',pin:'1234',active:true},
    {id:'U003',username:'somchai',  password:'5678',     name:'สมชาย รักดี',              role:'bmed',   dept:'ศูนย์วิศวกรรมการแพทย์',    avatar:'สช',pin:'5678',active:true},
    {id:'U004',username:'nattawut', password:'0000',     name:'ณัฐวุฒิ ใจมั่น',           role:'bmed',   dept:'ศูนย์วิศวกรรมการแพทย์',    avatar:'ณว',pin:'0000',active:true},
    {id:'U005',username:'malee',    password:'5678',     name:'พว.มาลี วงศ์ใหญ่',         role:'nurse',  dept:'ห้องฉุกเฉิน',              avatar:'พม',pin:'5678',active:true},
    {id:'U006',username:'prasong',  password:'9012',     name:'นพ.ประสงค์ ดีมาก',          role:'manager',dept:'ผู้อำนวยการโรงพยาบาล',     avatar:'นป',pin:'9012',active:true},
  ],
  settings: {
    category: ['เครื่องวัดความดัน (BP)', 'เครื่องช่วยหายใจ (Ventilator)', 'Patient Monitor', 'Infusion Pump', 'ECG 12-lead', 'Defibrillator', 'Ultrasound Portable'],
    brand: ['Dräger', 'B. Braun', 'GE Healthcare', 'Zoll', 'Masimo', 'Omron', 'Philips', 'Mindray'],
    sny: ['1111-01', '2222-02', '3333-03', '4444-04', '5555-05', '6666-06', '7777-07', '8888-08'],
    risk: ['สูง', 'กลาง', 'ต่ำ'],
    procurement: ['เงินงบประมาณ', 'เงินบริจาค', 'เงินรายได้'],
    status: ['พร้อมใช้', 'ยืมออก', 'ซ่อม', 'รอ Cal.', 'รอตรวจสอบ', 'จอง/รอตรวจสอบ', 'จำหน่าย/แทงจำหน่าย'],
    dept: ['ห้องฉุกเฉิน', 'ICU', 'CCU', 'OPD', 'หอผู้ป่วย 3A', 'หอผู้ป่วย 4B', 'ห้องผ่าตัด', 'NICU'],
    vendor: [
      {name: 'Medical Tech Co.', taxId: '0105556667778', address: '123 ถ.สุขุมวิท เขตวัฒนา กทม.', tel: '02-123-4567', contact: 'คุณสมชาย'},
      {name: 'Health Supply', taxId: '0105551112223', address: '45 ถ.พระราม 9 กทม.', tel: '02-987-6543', contact: 'คุณสมหญิง'},
      {name: 'GE Thai', taxId: '', address: '', tel: '', contact: ''},
      {name: 'Zoll Thai', taxId: '', address: '', tel: '', contact: ''},
      {name: 'Masimo Dist.', taxId: '', address: '', tel: '', contact: ''},
      {name: 'Omron Healthcare', taxId: '', address: '', tel: '', contact: ''},
      {name: 'Philips Med', taxId: '', address: '', tel: '', contact: ''},
      {name: 'Mindray Thai', taxId: '', address: '', tel: '', contact: ''}
    ],
    repairCause: ['อุปกรณ์สึกหรอตามอายุ', 'ผู้ใช้งานใช้งานผิดวิธี (Human error)', 'ระบบไฟฟ้า/ไฟกระชาก', 'Firmware / Software Error', 'ตกหล่น/กระแทก'],
    technician: ['วิชัย สุขดี', 'สมชาย รักดี', 'ณัฐวุฒิ ใจมั่น'],
    docNumbering: {
      asset:      { prefix:'ME',   digits:4, seq:95,  label:'ครุภัณฑ์ (Asset)',              desc:'รหัสทะเบียนอุปกรณ์' },
      loan:       { prefix:'LN',   digits:4, seq:43,  label:'ใบยืม-คืน (Loan)',             desc:'เลขที่ใบยืม-คืนอุปกรณ์' },
      pm:         { prefix:'WO',   digits:4, seq:442, label:'PM Work Order',                desc:'ใบสั่งงานบำรุงรักษาตามแผน' },
      cal:        { prefix:'CAL',  digits:4, seq:115, label:'Calibration WO',               desc:'ใบสั่งงานสอบเทียบมาตรฐาน' },
      repair:     { prefix:'CM',   digits:4, seq:201, label:'ซ่อมบำรุง / CM',              desc:'เลขที่ใบแจ้งซ่อม (Corrective Maintenance)' },
      incident:   { prefix:'INC',  digits:3, seq:31,  label:'รายงานเหตุการณ์ (Incident)',  desc:'เลขที่รายงานอุบัติการณ์' },
      contract:   { prefix:'SC',   digits:3, seq:4,   label:'สัญญาบริการ (Contract)',       desc:'เลขที่สัญญาบริการ' },
      safety:     { prefix:'EST',  digits:4, seq:21,  label:'ทดสอบไฟฟ้า (EST)',            desc:'เลขที่รายงานทดสอบ IEC 62353' },
      spare:      { prefix:'SP',   digits:3, seq:8,   label:'อะไหล่ (Spare Part)',          desc:'รหัสรายการอะไหล่ในคลัง' },
      fsca:       { prefix:'FSCA', digits:3, seq:0,   label:'FSCA/Recall Notice',           desc:'เลขที่แจ้งเตือนความปลอดภัย FSCA' },
      incomingQC: { prefix:'QC',   digits:3, seq:0,   label:'Incoming QC',                  desc:'เลขที่ใบตรวจรับเครื่องมือ' },
    }
  }
  ,safetyTests: [
    {id:'EST-0021',devId:'ME-0001',device:'Ventilator ICU',testDate:'2 เม.ย. 2567',tester:'Fluke ESA615',testerSerial:'FSA-12345',testerCal:'31 ธ.ค. 2567',devClass:'I',appType:'BF',earthRes:0.08,eqLeak:87,patLeak:7,appLeak:6,insRes:999,earthPass:true,eqLeakPass:true,patLeakPass:true,appLeakPass:true,insResPass:true,result:'ผ่าน (Pass)',tech:'วิชัย สุขดี',note:''},
    {id:'EST-0020',devId:'ME-0033',device:'Defibrillator',testDate:'1 เม.ย. 2567',tester:'Fluke ESA615',testerSerial:'FSA-12345',testerCal:'31 ธ.ค. 2567',devClass:'I',appType:'CF',earthRes:0.06,eqLeak:95,patLeak:9,appLeak:9,insRes:999,earthPass:true,eqLeakPass:true,patLeakPass:true,appLeakPass:true,insResPass:true,result:'ผ่าน (Pass)',tech:'สมชาย รักดี',note:''},
    {id:'EST-0019',devId:'ME-0095',device:'Patient Monitor',testDate:'28 มี.ค. 2567',tester:'Fluke ESA615',testerSerial:'FSA-12345',testerCal:'31 ธ.ค. 2567',devClass:'I',appType:'BF',earthRes:0.12,eqLeak:110,patLeak:8,appLeak:8,insRes:999,earthPass:true,eqLeakPass:true,patLeakPass:true,appLeakPass:true,insResPass:true,result:'ผ่าน (Pass)',tech:'วิชัย สุขดี',note:''},
    {id:'EST-0018',devId:'ME-0012',device:'Infusion Pump',testDate:'20 มี.ค. 2567',tester:'Fluke ESA615',testerSerial:'FSA-12345',testerCal:'31 ธ.ค. 2567',devClass:'I',appType:'B',earthRes:0.18,eqLeak:220,patLeak:null,appLeak:null,insRes:999,earthPass:true,eqLeakPass:true,patLeakPass:true,appLeakPass:true,insResPass:true,result:'ผ่าน (Pass)',tech:'ณัฐวุฒิ ใจมั่น',note:''},
  ]
  ,spareParts: [
    {id:'SP-001',name:'SpO2 Sensor Adult',partNo:'REF-DS100A',category:'Sensor/Probe',qty:5,minQty:2,unit:'ชิ้น',unitCost:1200,location:'ตู้ A1',vendor:'Masimo Dist.',compatible:'ME-0045',lastUpdated:'15 เม.ย. 67'},
    {id:'SP-002',name:'NIBP Hose & Cuff Set',partNo:'SNT-HCS01',category:'Accessory',qty:3,minQty:2,unit:'ชุด',unitCost:850,location:'ตู้ A1',vendor:'Mindray Thai',compatible:'ME-0095',lastUpdated:'10 เม.ย. 67'},
    {id:'SP-003',name:'IV Set (Infusomat)',partNo:'BB-IVS100',category:'Consumable',qty:0,minQty:5,unit:'ชุด',unitCost:120,location:'ตู้ B2',vendor:'Health Supply',compatible:'ME-0012',lastUpdated:'5 เม.ย. 67'},
    {id:'SP-004',name:'ECG Lead Cable 10-lead',partNo:'GE-AHA-10',category:'Cable/Lead',qty:2,minQty:1,unit:'เส้น',unitCost:3500,location:'ตู้ A2',vendor:'GE Thai',compatible:'ME-0021',lastUpdated:'1 เม.ย. 67'},
    {id:'SP-005',name:'Breathing Circuit Adult',partNo:'DRG-BC-AD',category:'Patient Circuit',qty:8,minQty:3,unit:'ชุด',unitCost:450,location:'ตู้ B1',vendor:'Medical Tech Co.',compatible:'ME-0001',lastUpdated:'12 เม.ย. 67'},
    {id:'SP-006',name:'Defib Pads (Adult)',partNo:'ZL-8900-0800',category:'Electrode',qty:1,minQty:2,unit:'คู่',unitCost:2800,location:'ตู้ A3',vendor:'Zoll Thai',compatible:'ME-0033',lastUpdated:'8 เม.ย. 67'},
    {id:'SP-007',name:'Fuse 5A (Infusion Pump)',partNo:'BB-FSE-5A',category:'Electronic',qty:10,minQty:5,unit:'ชิ้น',unitCost:35,location:'ตู้ C1',vendor:'Health Supply',compatible:'ME-0012',lastUpdated:'3 เม.ย. 67'},
    {id:'SP-008',name:'O2 Cell Sensor (Ventilator)',partNo:'DRG-O2-001',category:'Sensor/Probe',qty:2,minQty:1,unit:'ชิ้น',unitCost:8500,location:'ตู้ B3',vendor:'Medical Tech Co.',compatible:'ME-0001',lastUpdated:'2 เม.ย. 67'},
  ]
  ,serviceContracts: [
    {id:'SC-001',title:'สัญญาบำรุงรักษา Ventilator ICU ครบวงจร',vendor:'Medical Tech Co.',contactPerson:'คุณสมชาย',contactTel:'02-123-4567',type:'Full Service',coveredDevices:['ME-0001'],startDate:'1 ม.ค. 2567',endDate:'31 ธ.ค. 2567',endDateIso:'2024-12-31',value:180000,slaResponseHr:4,slaUptimePct:95,docRef:'สัญญาเลขที่ 001/2567',note:'รวมอะไหล่ทุกชิ้น ยกเว้นชิ้นส่วนจาก Physical Damage'},
    {id:'SC-002',title:'สัญญา PM & Cal สำหรับ Patient Monitor',vendor:'Mindray Thai',contactPerson:'คุณวิภา',contactTel:'02-333-4444',type:'PM + Calibration',coveredDevices:['ME-0095','ME-0045'],startDate:'1 เม.ย. 2567',endDate:'31 มี.ค. 2568',endDateIso:'2025-03-31',value:95000,slaResponseHr:8,slaUptimePct:90,docRef:'สัญญาเลขที่ 045/2567',note:''},
    {id:'SC-003',title:'สัญญาซ่อม ECG & Defibrillator (GE/Zoll)',vendor:'GE Thai',contactPerson:'คุณประวิทย์',contactTel:'02-555-6789',type:'Parts Only',coveredDevices:['ME-0021','ME-0033'],startDate:'1 ก.พ. 2567',endDate:'28 พ.ค. 2567',endDateIso:'2024-05-28',value:45000,slaResponseHr:24,slaUptimePct:80,docRef:'สัญญาเลขที่ 012/2567',note:'อะไหล่แท้จาก GE เท่านั้น'},
    {id:'SC-004',title:'สัญญา Infusion Pump — B.Braun Service',vendor:'Health Supply',contactPerson:'คุณสมหญิง',contactTel:'02-987-6543',type:'Full Service',coveredDevices:['ME-0012'],startDate:'1 มี.ค. 2566',endDate:'28 ก.พ. 2567',endDateIso:'2024-02-28',value:38000,slaResponseHr:12,slaUptimePct:90,docRef:'สัญญาเลขที่ 033/2566',note:'สัญญาหมดแล้ว ต่ออายุ'},
  ]
  ,fsca: []
  ,incomingQC: []
  ,spareTransactions: []
};

const ALERTS_DATA = [
  {type:'red',icon:'<path d="M8 5v4M8 11v1"/>',title:'Pulse Oximeter (ME-0045) เกินกำหนดคืน 3 วัน',sub:'หอผู้ป่วย 3A · Escalate ถึงหัวหน้าเวรแล้ว',time:'07:00'},
  {type:'red',icon:'<circle cx="8" cy="8" r="5"/><path d="M8 5v3"/>',title:'Infusion Pump (ME-0012) Cal. หมดอายุระหว่างยืม',sub:'ICU · ต้องนำกลับก่อนใช้งาน',time:'07:00'},
  {type:'amber',icon:'<path d="M8 3v10M5 13h6"/>',title:'ECG 12-lead ครบกำหนดคืนพรุ่งนี้',sub:'ห้องฉุกเฉิน · กำหนด 10 เม.ย.',time:'06:00'},
  {type:'amber',icon:'<circle cx="8" cy="8" r="5"/><path d="M8 5v3l2 1"/>',title:'Defibrillator PM ครบกำหนดสัปดาห์หน้า',sub:'WO-0441 สร้างแล้ว · กำหนด 16 เม.ย.',time:'06:00'},
  {type:'blue',icon:'<path d="M4 4h8v8H4z"/><path d="M8 6v4M8 11v1"/>',title:'Incident INC-031 CAPA รอการปิด',sub:'ECG เสียหาย · วิชัย สุขดี รับผิดชอบ',time:'เมื่อวาน'},
];

/* ════════════════════════════════
   STATE
════════════════════════════════ */