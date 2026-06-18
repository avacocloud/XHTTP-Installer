# پنل XHTTP — بررسی کامل قابلیت‌ها

> **هدف:** مقایسه قابلیت‌های 3x-ui با پروژه فعلی — چه داریم، چه اضافه کنیم

---

## وضعیت فعلی پروژه

- **Backend:** Node.js + TypeScript + Express
- **Frontend:** Next.js + TailwindCSS + shadcn/ui
- **Database:** SQLite
- **زبان‌ها:** فارسی + انگلیسی (i18n)

---

## قابلیت‌های فعلی پنل ✅

| # | قابلیت | وضعیت |
|---|--------|--------|
| 1 | احراز هویت (cookie + JWT) | ✅ |
| 2 | نصب اولیه (Node, PM2, Nginx, Xray, SSL) | ✅ |
| 3 | داشبورد (وضعیت سرور + Xray) | ✅ |
| 4 | لینک‌های VLESS + CDN | ✅ |
| 5 | Deploy به 6 پلتفرم CDN | ✅ |
| 6 | مدیریت Token | ✅ |
| 7 | تنظیمات پنل | ✅ |
| 8 | restart Xray | ✅ |
| 9 | آپدیت پنل (xhttp-info) | ✅ |
| 10 | Landing page camouflage (10 تمپلیت) | ✅ |
| 11 | AutoFix خطاها | ✅ |
| 12 | i18n فارسی/انگلیسی | ✅ |

---

## قابلیت‌های 3x-ui که باید اضافه بشن

---

### ۱. مدیریت کاربران (User/Client Management) ❌

| قابلیت | امکان | پیچیدگی |
|--------|-------|---------|
| اضافه/ویرایش/حذف user | ✅ | کم |
| حجم ترافیک برای هر user | ✅ | متوسط |
| تاریخ انقضا | ✅ | کم |
| محدودیت IP همزمان | ✅ | متوسط |
| bulk operations (bulkCreate, bulkDel, bulkAdjust) | ✅ | متوسط |
| حذف خودکار userهای منقضی (delDepleted) | ✅ | کم |
| لیست onlines / lastOnline | ✅ | متوسط |
| Import از 3x-ui (DB یا API) | ✅ | متوسط |

---

### ۲. ترافیک Real-time ❌

| قابلیت | امکان | پیچیدگی |
|--------|-------|---------|
| upload/download هر user | ✅ | متوسط |
| ترافیک کل سرور | ✅ | کم |
| ترافیک هر outbound | ✅ | متوسط |
| ریست ترافیک (per user / all) | ✅ | کم |
| گراف تاریخچه (CPU, metric history) | ✅ | متوسط |

---

### ۳. Subscription Server ❌

| قابلیت | امکان | پیچیدگی |
|--------|-------|---------|
| لینک sub خودکار برای هر user | ✅ | کم |
| فرمت v2ray / clash / sing-box | ✅ | متوسط |
| QR code | ✅ | کم |

---

### ۴. مدیریت Inbound ❌

| قابلیت | امکان | پیچیدگی |
|--------|-------|---------|
| add/update/del inbound | ✅ | زیاد |
| enable/disable inbound | ✅ | متوسط |
| import inbound | ✅ | متوسط |
| Fallback config (چند پروتکل روی یک پورت) | ⚠️ | خیلی زیاد |

---

### ۵. Load Balancer (بالانسر) ❌

**چی هست:** ترافیک بین چند outbound تقسیم میشه — یعنی کاربر از چند سرور/مسیر استفاده می‌کنه.

| قابلیت | امکان | پیچیدگی | توضیح |
|--------|-------|---------|-------|
| ساخت balancer با tag | ✅ | متوسط | یک بالانسر = یک گروه از outbound ها |
| استراتژی **Random** | ✅ | کم | هر بار تصادفی یکی انتخاب میشه |
| استراتژی **Round Robin** | ✅ | کم | به ترتیب نوبتی |
| استراتژی **Least Load** | ✅ | زیاد | کمترین بار — نیاز به Xray Observatory |
| استراتژی **Least Ping** | ✅ | زیاد | کمترین ping — نیاز به Observatory |
| Selector (انتخاب outbound ها) | ✅ | کم | tag pattern برای انتخاب outbound |
| Fallback outbound | ✅ | کم | اگه همه fail شدن، به این میره |
| تنظیمات Least Load | ✅ | زیاد | expected, maxRTT, tolerance, baselines, costs |
| اتصال balancer به routing rule | ✅ | متوسط | routing rule → balancerTag بجای outboundTag |

**نحوه کار در Xray config:**
```json
{
  "routing": {
    "balancers": [
      {
        "tag": "my-balancer",
        "selector": ["outbound-1", "outbound-2", "outbound-3"],
        "strategy": { "type": "roundRobin" },
        "fallbackTag": "direct"
      }
    ],
    "rules": [
      {
        "type": "field",
        "inboundTag": ["vless-in"],
        "balancerTag": "my-balancer"
      }
    ]
  }
}
```

---

### ۶. مدیریت Outbound ❌

| قابلیت | امکان | پیچیدگی |
|--------|-------|---------|
| WARP outbound | ✅ | متوسط |
| NordVPN outbound | ✅ | متوسط |
| Custom outbound (VLESS, VMess, Trojan...) | ✅ | زیاد |
| Proxy chaining (outbound → outbound) | ✅ | زیاد |
| Freedom outbound (direct) | ✅ | کم |
| Blackhole outbound (block) | ✅ | کم |
| ترافیک هر outbound جدا | ✅ | متوسط |

---

### ۷. Routing Rules ❌

| قابلیت | امکان | پیچیدگی |
|--------|-------|---------|
| routing rule ساده (domain → outbound) | ✅ | متوسط |
| GeoIP / GeoSite routing | ✅ | متوسط |
| routing rule → balancerTag | ✅ | متوسط |
| مدیریت GeoIP/GeoSite فایل‌ها | ✅ | کم |

---

### ۸. Telegram Bot ❌

| قابلیت | امکان | پیچیدگی |
|--------|-------|---------|
| نوتیفیکیشن انقضا/ترافیک | ✅ | متوسط |
| گزارش روزانه | ✅ | متوسط |
| مدیریت user از تلگرام | ✅ | زیاد |
| backup به تلگرام | ✅ | کم |

---

### ۹. Multi-Node ❌

| قابلیت | امکان | پیچیدگی |
|--------|-------|---------|
| مدیریت چند سرور از یک پنل | ⚠️ | خیلی زیاد |
| sync config بین node ها | ⚠️ | خیلی زیاد |
| client traffic جمع‌آوری از همه node ها | ⚠️ | خیلی زیاد |

---

### ۱۰. Auth پیشرفته ❌

| قابلیت | امکان | پیچیدگی |
|--------|-------|---------|
| Bearer API token (علاوه بر session) | ✅ | کم |
| Login rate limiter (brute force) | ✅ | کم |
| Swagger/OpenAPI docs | ✅ | متوسط |

---

### ۱۱. Server Management پیشرفته ❌

| قابلیت | امکان | پیچیدگی |
|--------|-------|---------|
| نمایش لاگ Xray از UI | ✅ | کم |
| ویرایش Xray config از UI | ✅ | متوسط |
| نصب/آپگرید Xray version | ✅ | متوسط |
| export/import DB | ✅ | کم |
| SSL certificate management | ✅ | متوسط |
| X25519 / ECDH key generation | ✅ | متوسط |

---

## اولویت‌بندی پیاده‌سازی

### فاز ۱ — ضروری (۱-۲ هفته)
1. مدیریت user (add/edit/del + traffic + expire)
2. QR code برای لینک‌ها
3. Subscription link

### فاز ۲ — مهم (۲-۳ هفته)
4. ترافیک real-time از Xray API
5. bulk operations
6. Import از 3x-ui

### فاز ۳ — ارزشمند (۱ ماه)
7. Telegram bot
8. Inbound management
9. لاگ Xray + ویرایش config

### فاز ۴ — پیشرفته (۱-۲ ماه)
10. **Load Balancer + Outbound + Routing**
11. Auth پیشرفته (API token + Swagger)
12. Server management

### فاز ۵ — اختیاری (خیلی سخت)
13. Multi-node

---

## چی ممکن نیست؟

| قابلیت | دلیل |
|--------|------|
| کپی مستقیم کد Go | باید در TypeScript پیاده بشه |
| Multi-node کامل | معماری کاملاً متفاوت — ماه‌ها کار |

---

> **قدم بعدی:** از فاز ۱ شروع کنیم؟
