# Rider Signal Check (PWA)

เว็บแอพตรวจสอบอินเทอร์เน็ตและ GPS สำหรับไรเดอร์ ใช้ HTML/CSS/JavaScript ล้วน

## ฟังก์ชัน
- สถานะ online/offline และชนิดเครือข่ายที่ browser เปิดเผย
- Ping แบบ HTTP timing 5 ครั้ง (ทิ้งครั้งแรกที่เป็น warm-up) และคำนวณค่าเฉลี่ย/jitter โดยประมาณ
- Download/Upload test ผ่าน Cloudflare speed test endpoint
- GPS ติดตามตำแหน่ง ความแม่นยำ ความเร็ว และทิศทาง พร้อมแผนที่ OpenStreetMap
- ประวัติผลตรวจและส่งออก CSV
- PWA manifest + service worker สำหรับติดตั้งและ cache ไฟล์หลัก

## วิธีรันในเครื่อง
ต้องเปิดผ่าน HTTPS หรือ localhost เพื่อใช้ Geolocation และ Service Worker

```bash
python -m http.server 8000
```
จากนั้นเปิด `http://localhost:8000` บนเครื่องเดียวกัน

## วิธีเผยแพร่ให้มือถือใช้งาน
อัปโหลดไฟล์และโฟลเดอร์ทั้งหมดไปยัง static hosting ที่รองรับ HTTPS เช่น GitHub Pages, Cloudflare Pages หรือ Netlify แล้วเปิด URL บน Chrome Android > เมนู > ติดตั้งแอป / Add to Home screen

## ข้อจำกัดสำคัญ
- Browser API ไม่สามารถอ่านค่า cellular signal strength จริง (dBm), Cell ID, band หรือจำนวนดาวเทียม GPS ได้ทั่วไป
- `navigator.connection` ไม่รองรับทุก browser และ downlink/RTT เป็นค่าประมาณจาก browser
- Ping ในเว็บนี้เป็น HTTP request timing ไม่ใช่ ICMP ping
- Speed test ใช้ Cloudflare endpoint และอาจถูกเครือข่าย/ส่วนขยายบล็อก ผลขึ้นกับอุปกรณ์ เซิร์ฟเวอร์ และสภาพเครือข่าย
- Download test ใช้ข้อมูลประมาณ 8 MB และ Upload ประมาณ 4 MB ต่อครั้ง (ไม่นับเวลา handshake/byte แรก)
- ไฟล์ Leaflet ถูก cache แล้ว แต่ map tiles ยังต้องใช้อินเทอร์เน็ต ขณะออฟไลน์จะไม่เห็นภาพแผนที่ (ยังเห็นพิกัด)
- ประวัติ GPS บันทึกทุก 30 วินาที (ไม่ใช่ทุกครั้งที่ตำแหน่งอัปเดต)
- พิกัด GPS เป็นข้อมูลละเอียดอ่อน: แอพไม่ส่งพิกัดไป backend แต่แสดงบนอุปกรณ์และอาจถูกเก็บไว้ในหน่วยความจำระหว่างเปิดหน้าเว็บ

## ไฟล์
โครงสร้างแบบแบน (ไม่มีโฟลเดอร์ย่อย) เพื่ออัปโหลดผ่านหน้าเว็บ/มือถือได้ง่าย
- `index.html` หน้าแอพ
- `style.css` รูปแบบหน้าจอ
- `app.js` การทดสอบเน็ต/GPS
- `manifest.webmanifest` ข้อมูล PWA
- `sw.js` service worker
- `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` ไอคอนแอพ
- `leaflet.js`, `leaflet.css`, `marker-*.png`, `layers*.png`, `LEAFLET-LICENSE.txt` ไลบรารีแผนที่ Leaflet 1.9.4 (BSD-2)

## การอัปเดตเวอร์ชัน
Service worker ใช้ network-first จึงได้ไฟล์ใหม่เสมอเมื่อมีเน็ต หากเพิ่ม/เปลี่ยนรายการไฟล์ใน `CORE` ให้เปลี่ยนค่า `CACHE` ใน `sw.js` ด้วย
