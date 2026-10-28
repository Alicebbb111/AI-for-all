import os
import subprocess
import shutil

html_content = r"""<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <title>OmniTransit v5 — สถาปัตยกรรมระบบคาดการณ์ความหนาแน่นและเวลาถึงรถโดยสารสาธารณะ</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=Sarabun:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    @page {
      size: A4;
      margin: 14mm 14mm 14mm 14mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    body {
      font-family: 'IBM Plex Sans Thai', 'Sukhumvit Set', 'Sarabun', 'Thonburi', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 13px;
      line-height: 1.62;
      color: #1e293b;
      background: #ffffff;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    h1, h2, h3, h4, .brand-title {
      font-family: 'IBM Plex Sans Thai', 'Sukhumvit Set', 'Thonburi', sans-serif;
      color: #0f172a;
      margin-top: 0;
    }
    .math, code.v {
      font-family: 'JetBrains Mono', 'Menlo', monospace;
      font-size: 12px;
      background: #eff6ff;
      color: #1e3a8a;
      padding: 1px 5px;
      border-radius: 4px;
      font-weight: 600;
      white-space: nowrap;
    }
    .cover {
      page-break-after: always;
      break-after: page;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 258mm;
      padding: 28px 16px 16px 16px;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
    }
    .badge-top {
      display: inline-block;
      padding: 6px 14px;
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
    }
    .cover-main {
      margin-top: 32px;
    }
    .cover-main h1 {
      font-size: 36px;
      line-height: 1.2;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 12px;
    }
    .cover-main .subtitle {
      font-size: 18px;
      color: #334155;
      font-weight: 600;
      margin-bottom: 24px;
      line-height: 1.45;
    }
    .cover-divider {
      width: 84px;
      height: 4px;
      background: #2563eb;
      border-radius: 2px;
      margin-bottom: 28px;
    }
    .cover-highlights {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-top: 28px;
    }
    .hl-box {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-top: 3px solid #2563eb;
      border-radius: 8px;
      padding: 12px 14px;
    }
    .hl-box .hl-num {
      font-size: 18px;
      font-weight: 700;
      color: #1d4ed8;
      margin-bottom: 2px;
    }
    .hl-box .hl-txt {
      font-size: 11.5px;
      color: #475569;
      line-height: 1.4;
    }
    .cover-meta {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 16px 20px;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 14px;
      margin-bottom: 14px;
    }
    .meta-item .meta-label {
      font-size: 11px;
      color: #64748b;
      font-weight: 600;
      margin-bottom: 2px;
    }
    .meta-item .meta-val {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
    }
    .cover-footer {
      border-top: 1px solid #cbd5e1;
      padding-top: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11.5px;
      color: #64748b;
    }

    /* Page & Section Styling */
    .page {
      page-break-after: always;
      break-after: page;
      padding: 2px 0;
    }
    .page-last {
      padding: 2px 0;
    }
    .avoid-break {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    h2 {
      font-size: 17px;
      font-weight: 700;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 4px;
      margin-top: 8px;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    h2 .sec-num {
      background: #2563eb;
      color: #ffffff;
      width: 23px;
      height: 23px;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
    }
    h3 {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
      margin-top: 10px;
      margin-bottom: 4px;
    }
    p {
      margin-top: 0;
      margin-bottom: 7px;
      font-size: 12.2px;
    }

    /* Callout & Card */
    .callout {
      background: #f8fafc;
      border-left: 4px solid #2563eb;
      border-radius: 0 8px 8px 0;
      padding: 9px 14px;
      margin: 8px 0;
      font-size: 12px;
      break-inside: avoid;
    }
    .callout-title {
      font-weight: 700;
      color: #1e40af;
      margin-bottom: 3px;
      font-size: 12.5px;
    }
    .card-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      margin: 10px 0;
      break-inside: avoid;
    }
    .stat-card {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 10px 12px;
    }
    .stat-card.accent { border-top: 3px solid #2563eb; }
    .stat-card.good { border-top: 3px solid #059669; }
    .stat-card.warn { border-top: 3px solid #d97706; }
    .stat-card .card-title {
      font-size: 11.5px;
      font-weight: 600;
      color: #475569;
      margin-bottom: 3px;
    }
    .stat-card .card-val {
      font-size: 16.5px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 3px;
    }
    .stat-card .card-desc {
      font-size: 11px;
      color: #475569;
      line-height: 1.4;
    }

    /* Math Formula Block */
    .formula-box {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-left: 4px solid #1e40af;
      border-radius: 8px;
      padding: 8px 14px;
      margin: 7px 0;
      font-size: 12px;
      color: #0f172a;
      line-height: 1.55;
      break-inside: avoid;
    }
    .formula-title {
      font-size: 10.5px;
      font-weight: 700;
      color: #1e40af;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      margin-bottom: 4px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 2px;
    }
    .eq-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: 1.5px 0;
      border-bottom: 1px dashed #e2e8f0;
    }
    .eq-row:last-child {
      border-bottom: none;
    }
    .eq-label {
      color: #334155;
      font-weight: 500;
      width: 44%;
    }
    .eq-expr {
      font-family: 'JetBrains Mono', 'Menlo', monospace;
      font-weight: 600;
      color: #0f172a;
      width: 56%;
      font-size: 11.5px;
    }
    .formula-main {
      font-family: 'JetBrains Mono', 'Menlo', monospace;
      font-weight: 700;
      color: #1e3a8a;
      font-size: 12.2px;
      background: #eff6ff;
      padding: 5px 10px;
      border-radius: 6px;
      margin: 4px 0;
      border: 1px solid #bfdbfe;
    }

    /* Tables */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0;
      font-size: 11.5px;
      break-inside: avoid;
    }
    tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    th, td {
      padding: 6px 9px;
      text-align: left;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: top;
      line-height: 1.48;
    }
    th {
      background: #f1f5f9;
      font-weight: 700;
      color: #0f172a;
      border-top: 1px solid #cbd5e1;
      border-bottom: 2px solid #cbd5e1;
    }
    tr:last-child td {
      border-bottom: 2px solid #cbd5e1;
    }
    .pill {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 700;
    }
    .pill.green { background: #dcfce7; color: #15803d; }
    .pill.yellow { background: #fef3c7; color: #b45309; }
    .pill.red { background: #fee2e2; color: #b91c1c; }
    .pill.blue { background: #dbeafe; color: #1d4ed8; }

    /* Flow Chart */
    .flow-chain {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 10px 12px;
      margin: 12px 0;
      break-inside: avoid;
    }
    .flow-node {
      background: #ffffff;
      border: 1px solid #94a3b8;
      border-radius: 6px;
      padding: 7px 10px;
      text-align: center;
      flex: 1;
    }
    .flow-node .fn-title {
      font-size: 11.5px;
      font-weight: 700;
      color: #0f172a;
    }
    .flow-node .fn-sub {
      font-size: 10px;
      color: #475569;
      margin-top: 2px;
    }
    .flow-arrow {
      padding: 0 6px;
      color: #2563eb;
      font-weight: 700;
      font-size: 15px;
    }
  </style>
</head>
<body>

  <!-- PAGE 1: COVER PAGE -->
  <div class="cover">
    <div>
      <span class="badge-top">เอกสารข้อกำหนดทางเทคนิคเชิงวิศวกรรมขนส่ง · ฉบับปรับปรุงกล้อง AI ตรวจจับคนขึ้น-ลง</span>
      <div class="cover-main">
        <h1>OmniTransit v5</h1>
        <div class="subtitle">
          สถาปัตยกรรมระบบคาดการณ์ความหนาแน่นและเวลาถึงรถโดยสารสาธารณะ<br>
          <span style="font-size:14.5px; color:#64748b; font-weight:500;">(Public Transit Dynamic Crowding, Overhead Edge-AI Vision &amp; Coupled ETA Prediction System)</span>
        </div>
        <div class="cover-divider"></div>
        <p style="font-size:13.5px; color:#334155; max-width: 640px; line-height: 1.65;">
          รายงานสรุปสถาปัตยกรรมข้อมูลนำเข้า 5 มิติ ระบบกล้อง AI มุมสูงเหนือประตูตรวจจับคนขึ้น-ลงแบบ Edge Computing (PDPA-Compliant) เครื่องจักรคำนวณทางคณิตศาสตร์ 4 สมการหลัก ระดับความแม่นยำ และดัชนีชี้วัดประสิทธิภาพ (KPIs) สำหรับแก้ปัญหารถเมล์ขาดระยะ (Bus Bunching) และการกระจุกตัวของผู้โดยสารในกรุงเทพมหานคร
        </p>

        <div class="cover-highlights">
          <div class="hl-box">
            <div class="hl-num">4 สมการหลัก</div>
            <div class="hl-txt">คำนวณไหลสะสมรายป้าย + เวลาจอดผูกกับจำนวนคน + กล้อง AI ถ่วงน้ำหนักเวลาเปิดประตู + คุมช่องไฟ</div>
          </div>
          <div class="hl-box">
            <div class="hl-num">Edge-AI Vision</div>
            <div class="hl-txt">กล้องมุมกดเหนือประตูนับศีรษะ-ไหล่ขณะก้าวขึ้นลง แม่นยำสูง ไม่เก็บภาพใบหน้า ปลอดภัย PDPA 100%</div>
          </div>
          <div class="hl-box">
            <div class="hl-num">728 พิกัดถนนจริง</div>
            <div class="hl-txt">เส้นทางนำร่อง 13 ป้ายจริง (อู่บางเขน – จตุจักร – อนุสาวรีย์ฯ – สยาม – สามย่าน – หัวลำโพง)</div>
          </div>
        </div>
      </div>
    </div>

    <div>
      <div class="cover-meta">
        <div class="meta-item">
          <div class="meta-label">ชื่อโครงการวิจัย / พัฒนา</div>
          <div class="meta-val">OmniTransit v5 (รถมาตามรอบ รู้ข้อมูลจริง)</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">เส้นทางนำร่องทดสอบ</div>
          <div class="meta-val">สายนำร่อง 1 (อู่บางเขน ↔ จตุจักร ↔ หัวลำโพง)</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">ฮาร์ดแวร์ตรวจจับผู้โดยสาร</div>
          <div class="meta-val">กล้อง AI มุมสูงเหนือประตู (Overhead Edge-AI Vision)</div>
        </div>
        <div class="meta-item">
          <div class="meta-label">เทคโนโลยีซอฟต์แวร์หลัก</div>
          <div class="meta-val">Pure Node.js + OSRM High-Res (728 pts) + OpenAI API</div>
        </div>
      </div>
      <div class="cover-footer">
        <div>เอกสารเผยแพร่สำหรับการประเมินโครงการและตรวจรับงานวิศวกรรม</div>
        <div>OmniTransit Engineering Team · ตุลาคม 2569</div>
      </div>
    </div>
  </div>

  <!-- PAGE 2: SECTION 1 & SECTION 2 -->
  <div class="page">
    <h2><span class="sec-num">1</span> บทสรุปสำหรับผู้บริหาร (Executive Summary)</h2>
    <p>
      ปัญหาหลักของระบบรถโดยสารประจำทางในเขตกรุงเทพมหานครไม่ใช่เพียงแค่ "รถไม่พอ" แต่เกิดจากปรากฏการณ์ <strong>Bus Bunching (รถวิ่งไล่กวดกันจนติดเป็นขบวน)</strong> เมื่อรถคันแรกขาดระยะ รถคันนั้นจะแบกรับผู้โดยสารสะสมที่ป้ายเกินกำลังจนแน่นเอี๊ยดและจอดแช่ป้ายนาน ในขณะที่รถคันหลังที่ตามมาติดๆ วิ่งเป็นรถเปล่า ส่งผลให้ <strong>"ผู้โดยสารกลางทางถูกปล่อยทิ้ง (Pass-up)"</strong> และประชาชนไม่สามารถวางแผนการเดินทางได้
    </p>
    <p>
      โครงการ <strong>OmniTransit v5</strong> พัฒนาระบบคาดการณ์อัจฉริยะเพื่อแก้ปัญหานี้โดยยึดหลัก <em>"ความแม่นยำทางวิทยาศาสตร์ที่ไม่หลอกลวงประชาชน และไม่ลิดรอนสิทธิของผู้ใด"</em> โดยใช้ <strong>กล้อง AI มุมสูงเหนือประตูรถ (Overhead Edge-AI People Counter)</strong> ที่ประมวลผลนับเฉพาะการเคลื่อนที่ก้าวขึ้น-ลงจากมุมกดแนวดิ่งบนตัวรถทันทีโดยไม่บันทึกภาพใบหน้า ไม่เก็บเงินจองที่นั่ง และไม่สั่งให้รถข้ามป้าย
    </p>

    <div class="callout">
      <div class="callout-title">หัวใจสำคัญของระบบคาดการณ์ OmniTransit v5</div>
      ระบบไม่เพียงรายงานว่า <em>"ขณะนี้บนรถมีกี่คน"</em> แต่พยากรณ์ล่วงหน้าแบบไดนามิกข้ามหลายป้ายว่า <strong>"เมื่อรถคันนี้วิ่งมาถึงป้ายที่คุณยืนรออยู่ คาดว่าจะมีผู้โดยสารเหลือกี่คน มีที่นั่งว่างหรือไม่ และมีโอกาสรถเต็มจนขึ้นไม่ได้กี่เปอร์เซ็นต์"</strong> โดยเชื่อมโยงข้อมูลกล้องตรวจจับคนขึ้น-ลง ระยะห่างจากรถคันหน้า สภาพการจราจร และเวลาเปิดประตูเข้าด้วยกัน
    </div>

    <h2><span class="sec-num">2</span> ข้อมูลนำเข้า 5 มิติ (Data Inputs &amp; Vision Telemetry)</h2>
    <p>การพยากรณ์ที่แม่นยำจำเป็นต้องใช้ข้อมูลจริง 5 มิติที่ตรวจสอบย้อนกลับได้ทางวิศวกรรม:</p>

    <table>
      <thead>
        <tr>
          <th style="width:24%;">มิติข้อมูล</th>
          <th style="width:43%;">รายละเอียดตัวแปรที่นำเข้าสู่ระบบ</th>
          <th style="width:33%;">แหล่งที่มา / วิธีการจัดเก็บ</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>1. ข้อมูลกายภาพรถและเส้นทาง</strong><br><span style="color:#64748b; font-size:11px;">(Fleet &amp; Spatial Network)</span></td>
          <td>
            • ความจุที่นั่ง (<code class="v">C_seat</code>) และที่ยืน (<code class="v">C_stand</code>) แยกตามรุ่นรถ<br>
            • ระยะทางตามพิกัดถนนจริง 728 จุด (<code class="v">L_s</code> Link Distance)<br>
            • เวลาหน่วงไฟแดงแยกหลัก (<code class="v">d_signal</code>) และจุดเชื่อมต่อรถไฟฟ้า
          </td>
          <td>
            ฐานข้อมูลสเปกรถ ขสมก. (ครีมแดง 34/46, แอร์ฟ้า 28/44, EV 31/27) และโครงข่ายถนนจริง OSRM / OpenStreetMap
          </td>
        </tr>
        <tr>
          <td><strong>2. ข้อมูลโทรมาตรสด</strong><br><span style="color:#64748b; font-size:11px;">(Real-Time Telemetry)</span></td>
          <td>
            • พิกัด GPS สด และทิศทางมุ่งหน้า (Bearing)<br>
            • ความเร็วเคลื่อนที่จริง และความเร็วเฉลี่ยถ่วงน้ำหนัก (<code class="v">v_EMA</code>)<br>
            • อายุความสดของสัญญาณ (Staleness ไม่เกิน 90 วินาที)
          </td>
          <td>
            กล่องพิกัด GPS ประจำตัวรถ ส่งสัญญาณผ่านโครงข่ายไร้สายเข้าสู่เซิร์ฟเวอร์ทุก 1–5 วินาที
          </td>
        </tr>
        <tr>
          <td><strong>3. ช่องว่างระหว่างรถ</strong><br><span style="color:#64748b; font-size:11px;">(Dynamic Headway)</span></td>
          <td>
            • ระยะห่างเวลาจากรถคันหน้า (<code class="v">H_j = Headway</code>)<br>
            • ช่องไฟเทียบกับรถคันหลัง (<code class="v">H_back</code>) สำหรับนายท่าคุมปล่อยรถ
          </td>
          <td>
            คำนวณเปรียบเทียบพิกัดและเวลาผ่านป้ายของรถทุกคันในสายเดียวกันแบบเรียลไทม์
          </td>
        </tr>
        <tr>
          <td><strong>4. พฤติกรรมและสิ่งแวดล้อม</strong><br><span style="color:#64748b; font-size:11px;">(Demand &amp; Environment)</span></td>
          <td>
            • อัตราคนเดินมาขึ้นรถประจำช่วงเวลา (<code class="v">λ_j(t)</code> เช้าเร่งด่วน vs บ่าย)<br>
            • สัดส่วนคนลงประจำป้าย (<code class="v">ρ_j</code> เช่น อนุสาวรีย์ชัยฯ 28%, สยาม 32%)<br>
            • ตัวคูณฝนตก (<code class="v">ω_rain</code>) และคิวคนตกค้างสะสมจากคันก่อน (<code class="v">Q_j</code>)
          </td>
          <td>
            สถิติความต้องการเดินทางจำแนกตามช่วงเวลา, ข้อมูลสภาพอากาศสด และยอดสะสมคนที่ขึ้นรถคันก่อนไม่ได้
          </td>
        </tr>
        <tr>
          <td><strong>5. กล้อง AI ตรวจจับคนขึ้น-ลง &amp; การสำรวจ</strong><br><span style="color:#64748b; font-size:11px;">(Edge-AI Vision &amp; Dwell)</span></td>
          <td>
            • ยอดกล้อง AI ตรวจจับคนก้าวขึ้น-ลงที่ประตู (<code class="v">B_cam</code>, <code class="v">A_cam</code>)<br>
            • เวลาที่รถจอดเปิดประตูจริงที่ป้าย (<code class="v">τ_actual</code> วินาที)<br>
            • ข้อมูลผู้สำรวจภาคสนาม (Manual Spotter) ยืนยันยอดและ Pass-up
          </td>
          <td>
            <strong>กล้อง AI มุมสูงเหนือประตู (Overhead Vision)</strong> นับศีรษะ-ไหล่ข้ามเส้น Virtual Line บน Edge NPU (ไม่เก็บภาพใบหน้า) + ผู้สำรวจ
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- PAGE 3: SECTION 3 (EQUATIONS 1, 2, 3, 4) -->
  <div class="page">
    <h2><span class="sec-num">3</span> สถาปัตยกรรมเครื่องจักรคำนวณ 4 สมการหลัก</h2>
    <p>
      OmniTransit v5 ออกแบบสมการทางวิศวกรรมขนส่งที่เชื่อมโยงกันเป็นลูกโซ่ (Coupled Mathematical Architecture) โดยผสานข้อมูลจากกล้อง AI ตรวจจับคนขึ้น-ลงเข้ากับการพยากรณ์รายป้าย:
    </p>

    <div class="flow-chain">
      <div class="flow-node">
        <div class="fn-title">กล้อง AI ประตู (B_cam, A_cam)</div>
        <div class="fn-sub">สมการ 3: ตรวจทานเวลาเปิดประตูจริง</div>
      </div>
      <div class="flow-arrow">→</div>
      <div class="flow-node">
        <div class="fn-title">สมการ 1: ไหลสะสมรายป้าย</div>
        <div class="fn-sub">คำนวณคนขึ้น-ลงล่วงหน้า k → m</div>
      </div>
      <div class="flow-arrow">→</div>
      <div class="flow-node">
        <div class="fn-title">สมการ 2: Coupled ETA</div>
        <div class="fn-sub">เวลาวิ่ง + เวลาจอดแปรผันตามคน</div>
      </div>
      <div class="flow-arrow">→</div>
      <div class="flow-node">
        <div class="fn-title">สมการ 4: คุมช่องไฟ</div>
        <div class="fn-sub">นายท่าหน่วงปล่อยรถกันรถติดขบวน</div>
      </div>
    </div>

    <!-- Equation 1 -->
    <div class="avoid-break">
      <h3>3.1 สมการที่ 1: การพยากรณ์คนบนรถแบบไหลสะสมรายป้าย (Stop-by-Stop Load Propagation: k → m)</h3>
      <p>
        เมื่อรถอยู่ที่ป้ายปัจจุบัน <code class="v">k</code> และผู้โดยสารยืนรอที่ป้ายเป้าหมาย <code class="v">m</code> ระบบจะจำลองการขึ้น-ลงสะสมผ่านทุกป้ายระหว่างทาง <code class="v">j = k+1</code> ถึง <code class="v">m</code>:
      </p>
      <div class="formula-box">
        <div class="formula-title">Equation 1 — Stop-by-Stop Passenger Flow &amp; Pass-Up Model</div>
        <div class="eq-row">
          <span class="eq-label">(1) จำนวนคนที่จะลงที่ป้าย j:</span>
          <span class="eq-expr">Â_j = round( N̂_{j-1} × ρ_j(t) )</span>
        </div>
        <div class="eq-row">
          <span class="eq-label">(2) จำนวนคนมารอขึ้นที่ป้าย j:</span>
          <span class="eq-expr">D̂_j = ( λ_j(t) × ω_rain × H_j ) + Q_j^leftover</span>
        </div>
        <div class="eq-row">
          <span class="eq-label">(3) จำนวนคนที่ขึ้นได้จริง (ไม่เกินความจุรถ):</span>
          <span class="eq-expr">B̂_j = min( D̂_j , C_max − (N̂_{j-1} − Â_j) )</span>
        </div>
        <div class="eq-row">
          <span class="eq-label">(4) จำนวนคนบนรถเมื่อออกจากป้าย j:</span>
          <span class="eq-expr">N̂_j = N̂_{j-1} − Â_j + B̂_j</span>
        </div>
        <div class="eq-row">
          <span class="eq-label">(5) จำนวนคนที่ขึ้นรถไม่ได้ (ถูกปล่อยทิ้ง Pass-up):</span>
          <span class="eq-expr">PassUp_j = max( 0 , D̂_j − B̂_j )</span>
        </div>
      </div>
    </div>

    <!-- Equation 2 -->
    <div class="avoid-break">
      <h3>3.2 สมการที่ 2: สมการคำนวณเวลาถึงที่ผูกกับจำนวนคน (Coupled Dynamic ETA)</h3>
      <p>
        เวลาที่รถจะมาถึง (ETA) ไม่ได้ขึ้นกับระยะทางและความเร็วถนนเท่านั้น แต่รวม <strong>เวลาเปิดประตูจอดรับ-ส่งคน (Dwell Time)</strong> ที่แปรผันตรงตามจำนวนคนขึ้น-ลง (<code class="v">B̂_j</code>, <code class="v">Â_j</code>) จากสมการที่ 1:
      </p>
      <div class="formula-box">
        <div class="formula-title">Equation 2 — Coupled Dynamic ETA with Crowding Dwell Penalty</div>
        <div class="formula-main">ETA_{k → m} = Σ ( L_s / v_s^EMA ) + Σ τ_dwell(j) + Σ d_r^signal</div>
        <div style="margin-top:4px; font-weight:600; color:#1e293b;">
          โดยเวลาจอดเปิดประตูแต่ละป้ายคือ: <code class="v">τ_dwell(j) = ( τ_0 + α·B̂_j + β·Â_j ) × γ_crowd</code>
        </div>
        <div style="font-size:11.8px; color:#334155; margin-top:4px;">
          • <code class="v">τ_0 = 9 วินาที</code> (เวลาชะลอเข้าป้ายและเปิด-ปิดประตู) &nbsp;|&nbsp;
          • <code class="v">α = 2.2 วิ/คน</code> (รถเก็บเงินสด) หรือ <code class="v">1.6 วิ/คน</code> (รถ EV ประตูกว้าง)<br>
          • <code class="v">β = 1.4 วิ/คน</code> (เวลาเฉลี่ยคนก้าวลง) &nbsp;|&nbsp;
          • <code class="v">γ_crowd = 1.35</code> เมื่อคนบนรถเกิน 75% ของความจุ (เบียดตัวเดินขึ้น-ลงช้าลง 35%)
        </div>
      </div>
    </div>

    <!-- Equation 3 -->
    <div class="avoid-break">
      <h3>3.3 สมการที่ 3: กล้อง AI ตรวจจับคนขึ้น-ลง และการสอบทานสองทาง (Bayesian Vision Cross-Check)</h3>
      <p>
        ระบบใช้ <strong>กล้อง AI มุมสูงเหนือประตู (Overhead Edge-AI Vision)</strong> ตรวจจับศีรษะและไหล่ที่ก้าวข้ามเส้น Virtual Tripwire แม้กล้อง AI จะแยกคนเดินคู่กันได้แม่นยำกว่าลำแสงอินฟราเรด แต่ในสภาวะมืดจัดหรือกางร่มอาจคลาดเคลื่อนได้ ระบบจึงถ่วงน้ำหนักกับเวลาเปิดประตูจริง (<code class="v">τ_actual</code>):
      </p>
      <div class="formula-box">
        <div class="formula-title">Equation 3 — Edge-AI Vision &amp; Dwell Time Bayesian Fusion</div>
        <div class="eq-row">
          <span class="eq-label">(1) ยอดคนขึ้นโดยนัยจากเวลาเปิดประตูจริง:</span>
          <span class="eq-expr">B̂_implied = max( 0 , (τ_actual − τ_0) / α )</span>
        </div>
        <div class="eq-row">
          <span class="eq-label">(2) ยอดคนขึ้นที่ปรับแก้ถ่วงน้ำหนักแล้ว:</span>
          <span class="eq-expr">B̂_corrected = round( 0.85 × B_cam + 0.15 × B̂_implied )</span>
        </div>
        <div class="eq-row">
          <span class="eq-label">(3) ขอบเขตความไม่แน่นอนสะสม (± σ):</span>
          <span class="eq-expr">σ_m = √( σ_k² + (จำนวนป้ายที่มองข้าม) × (1.2)² )</span>
        </div>
      </div>
    </div>
  </div>

  <!-- PAGE 4: EQUATION 4, VISION ARCHITECTURE, ACCURACY & KPIS -->
  <div class="page-last">
    <!-- Equation 4 -->
    <div class="avoid-break">
      <h3>3.4 สมการที่ 4: การควบคุมช่องไฟสองทิศทางของนายท่า (Two-Sided Headway Control)</h3>
      <p>
        เพื่อตัดวงจร Bus Bunching ระบบคำนวณเวลาหน่วงปล่อยรถที่ต้นทาง (<code class="v">Δt_hold</code>) ตามกฎของ Daganzo โดยดูระยะห่างทั้งคันหน้าและคันหลัง:
      </p>
      <div class="formula-box">
        <div class="formula-title">Equation 4 — Daganzo's Two-Sided Headway Regularization</div>
        <div class="formula-main">Δt_hold = clamp( 0.5 × (H_target − H_front) + 0.25 × (H_back − H_front) , 0 , 5 นาที )</div>
        <div style="font-size:11.8px; color:#334155;">
          ภายใต้เงื่อนไขคุ้มครองแรงงาน: เวลาพักคนขับสะสมที่อู่ <code class="v">T_rest ≥ 6 นาที</code> เสมอ และห้ามตัดจำนวนเที่ยววิ่งขั้นต่ำ
        </div>
      </div>
    </div>

    <div class="callout" style="border-left-color:#059669; background:#f0fdf4;">
      <div class="callout-title" style="color:#15803d;">สถาปัตยกรรมกล้อง AI มุมสูงเหนือประตู (PDPA-Compliant Overhead Vision)</div>
      <strong>ทำไมต้องเปลี่ยนจากลำแสงอินฟราเรดเป็นกล้อง AI มุมสูง?</strong> ลำแสงอินฟราเรดแบบเดิมมักนับผิดเมื่อผู้โดยสารก้าวขึ้นพร้อมกัน 2 คนหรือสะพายกระเป๋าใบใหญ่ การเปลี่ยนมาใช้ <strong>กล้อง AI มุมกดแนวดิ่ง 90° เหนือบันไดประตู (Top-Down Object Tracking เช่น YOLOv8-Nano + ByteTrack บนชิป Edge NPU)</strong> ช่วยแยกแยะศีรษะและไหล่รายบุคคลพร้อมทิศทางการเดินข้ามเส้นสมมติ (Virtual Line Crossing) ได้แม่นยำถึง 97–99% โดย <strong>ประมวลผลและลบทิ้งภาพในตัวกล้องทันที ส่งออกเฉพาะตัวเลข (B_cam, A_cam)</strong> จึงไม่เห็นใบหน้าและไม่ละเมิดกฎหมาย PDPA 100%
    </div>

    <h2><span class="sec-num">4</span> ระดับความแม่นยำและดัชนีชี้วัดประสิทธิภาพ (Accuracy &amp; KPIs)</h2>
    <div class="card-grid">
      <div class="stat-card good">
        <div class="card-title">ความแม่นยำคนบนรถปัจจุบัน (Vision + Bayesian)</div>
        <div class="card-val">± 1 – 2 คน (ความแม่นยำ 98%)</div>
        <div class="card-desc">กล้อง AI มุมสูงแยกคนเดินเบียดกันได้แม่นยำ พร้อมสมการสมดุลล็อกไม่ให้เลขติดลบหรือเกินความจุกฎหมาย</div>
      </div>
      <div class="stat-card accent">
        <div class="card-title">ความแม่นยำการพยากรณ์ล่วงหน้า (Look-ahead)</div>
        <div class="card-val">แม่นยำขึ้น &gt; 25%</div>
        <div class="card-desc">พยากรณ์เหตุการณ์รถแน่นล่วงหน้าข้ามหลายป้ายได้แม่นยำ เพราะผูกช่องไฟ H_j เข้ากับอัตราคนมาถึงป้าย</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:24%;">ตัวชี้วัดหลัก (KPI)</th>
          <th style="width:34%;">นิยามและวิธีวัดผลในระบบ</th>
          <th style="width:18%;">ค่าเป้าหมาย</th>
          <th style="width:24%;">ผลลัพธ์ต่อผู้โดยสาร</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>1. MAE ของเวลาถึง (ETA)</strong></td>
          <td>ความคลาดเคลื่อนสัมบูรณ์เฉลี่ยของเวลาที่รถถึงจริงเทียบกับที่พยากรณ์</td>
          <td><span class="pill green">ลดลง ≥ 10%</span></td>
          <td>กะเวลาเดินมาป้ายได้แม่นยำ ไม่ต้องยืนรอนาน</td>
        </tr>
        <tr>
          <td><strong>2. Macro-F1 ระดับความแน่น</strong></td>
          <td>ความแม่นยำในการจำแนก 4 สถานะ (มีที่นั่ง / ยืนสบาย / ยืนแน่น / เต็ม)</td>
          <td><span class="pill green">Macro-F1 ≥ 0.85</span></td>
          <td>ตัดสินใจเลือกขึ้นคันนี้หรือรอคันถัดไปได้มั่นใจ</td>
        </tr>
        <tr>
          <td><strong>3. Critical Error Rate</strong></td>
          <td>อัตราที่ระบบทายว่า "มีที่นั่ง" แต่รถจริง "แน่นจนขึ้นไม่ได้"</td>
          <td><span class="pill red">&lt; 3.0%</span></td>
          <td>ป้องกันความผิดพลาดร้ายแรงในชั่วโมงเร่งด่วน</td>
        </tr>
        <tr>
          <td><strong>4. อัตราการถูกเท (Pass-up)</strong></td>
          <td>สัดส่วนผู้โดยสารที่ยืนรอที่ป้ายแต่ขึ้นไม่ได้เพราะรถเต็ม</td>
          <td><span class="pill green">ลดลง ≥ 15%</span></td>
          <td>ผู้โดยสารป้ายกลางทางได้ขึ้นรถอย่างทั่วถึง</td>
        </tr>
        <tr>
          <td><strong>5. เวลารอเฉลี่ย &amp; P90</strong></td>
          <td>เวลารอเฉลี่ยทุกคน และเวลารอของกลุ่มที่รอนานที่สุด 10% บน</td>
          <td><span class="pill blue">ลดลง ≥ 10%</span></td>
          <td>ลดความเหลื่อมล้ำและลดปัญหารถขาดระยะ</td>
        </tr>
      </tbody>
    </table>
  </div>

</body>
</html>
"""

html_path = "/Users/bowornnan/work space/antigarvity/ai-forall/report.html"
pdf_path = "/Users/bowornnan/work space/antigarvity/ai-forall/OmniTransit_Prediction_System_Report.pdf"
downloads_pdf = "/Users/bowornnan/Downloads/OmniTransit_Prediction_System_Report.pdf"

with open(html_path, "w", encoding="utf-8") as f:
    f.write(html_content)

print(f"Written HTML to: {html_path}")

chrome_bin = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
cmd = [
    chrome_bin,
    "--headless",
    "--disable-gpu",
    "--no-pdf-header-footer",
    "--virtual-time-budget=3000",
    f"--print-to-pdf={pdf_path}",
    f"file://{html_path}"
]

print("Compiling PDF with Google Chrome headless...")
res = subprocess.run(cmd, capture_output=True, text=True)
if os.path.exists(pdf_path):
    size_kb = os.path.getsize(pdf_path) / 1024
    print(f"SUCCESS: Generated PDF ({size_kb:.1f} KB) at: {pdf_path}")
    shutil.copyfile(pdf_path, downloads_pdf)
    print(f"Copied to Downloads: {downloads_pdf}")
else:
    print("FAILED to generate PDF:", res.stderr)
