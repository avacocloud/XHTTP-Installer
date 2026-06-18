<p align="center">
  <img src="https://img.shields.io/badge/XHTTP-Panel-0f172a?style=for-the-badge&labelColor=0f172a&color=22c55e" alt="XHTTP Panel" />
</p>

<h1 align="center">XHTTP Panel</h1>

<p align="center">
  <strong>یک پنل برای دیپلوی، مدیریت و مانیتورینگ ریلی VLESS+XHTTP روی ۵ پلتفرم ابری</strong>
</p>

<p align="center">
  <a href="https://t.me/avaco_cloud"><img src="https://img.shields.io/badge/Telegram-avaco__cloud-26A5E4?style=for-the-badge&logo=telegram&logoColor=white" alt="Telegram" /></a>
  <a href="https://youtube.com/@avacocloud"><img src="https://img.shields.io/badge/YouTube-avaco__cloud-FF0000?style=for-the-badge&logo=youtube&logoColor=white" alt="YouTube" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-15-black?logo=nextdotjs" alt="Next.js" />
  <img src="https://img.shields.io/badge/Express-4-000?logo=express" alt="Express" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178c6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind" />
  <img src="https://img.shields.io/badge/shadcn/ui-latest-000?logo=shadcnui" alt="shadcn/ui" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Vercel-supported-000?logo=vercel" alt="Vercel" />
  <img src="https://img.shields.io/badge/Netlify-supported-00C7B7?logo=netlify&logoColor=white" alt="Netlify" />
  <img src="https://img.shields.io/badge/Azure-supported-0078D4?logo=microsoftazure&logoColor=white" alt="Azure" />
  <img src="https://img.shields.io/badge/Fastly-supported-FF282D?logo=fastly&logoColor=white" alt="Fastly" />
  <img src="https://img.shields.io/badge/Railway-supported-7C3AED?logo=railway&logoColor=white" alt="Railway" />
</p>

---

## نصب سریع

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/avacocloud/XHTTP-Panel/main/install.sh)
```

همین. بقیه‌ش خودکاره.

**پیش‌نیازها:** سرور Ubuntu 20.04+ · دامنه · دسترسی root

---

## مدیریت پنل (`xhttp-info`)

بعد از نصب، دستور `xhttp-info` روی سرور این امکانات رو میده:

```bash
xhttp-info
```

```
  [1] Reset admin password     ← فراموشی رمز عبور
  [2] Change web path          ← تغییر مسیر پنل
  [3] Update panel             ← آپدیت به آخرین نسخه
  [q] Quit
```

### آپدیت پنل:
```bash
xhttp-info update
```
توکن‌ها، کانفیگ‌ها و دیپلوی‌ها بعد از آپدیت دست‌نخورده باقی می‌مونن.

### ریست رمز عبور:
```bash
xhttp-info reset-password
```

### تغییر مسیر پنل:
```bash
xhttp-info set-path
```

---

## چیه این؟

XHTTP Panel یه **داشبورد وب self-hosted** هست که جایگزین کار دستی با CLI برای دیپلوی و مدیریت سرورهای ریلی VLESS+XHTTP میشه. به جای SSH زدن و اجرای دستورات، یه UI تمیز داری با دیپلوی یک‌کلیکی، پراگرس زنده، و مدیریت کامل.

---

## امکانات

---

### ۱. داشبورد

مرکز فرماندهی پنل. وقتی وارد میشی اول اینجا رو می‌بینی.

- **۳ کارت آماری بالای صفحه:**
  - تعداد کل دیپلوی‌ها
  - تعداد دیپلوی‌های فعال (active)
  - تعداد Health Check های ناموفق
- **جدول دیپلوی‌های اخیر** — با ستون‌های پلتفرم، نام پروژه، URL، وضعیت و تاریخ ایجاد
- Badge رنگی برای هر وضعیت: سبز (active)، خاکستری (deploying)، قرمز (failed)
- آیکون اختصاصی هر پلتفرم با tooltip

---

### ۲. مدیریت توکن‌ها

صفحه‌ای با طراحی کارتی زیبا برای ذخیره و مدیریت اطلاعات دسترسی به هر پلتفرم.

- **کارت‌های گرادیان اختصاصی** — هر پلتفرم رنگ و آیکون مخصوص خودش رو داره (Vercel، Netlify، Azure، Railway، Fastly)
- **رمزنگاری AES-256-GCM** — توکن‌ها هیچوقت به صورت plain ذخیره نمیشن. کلید رمزنگاری خودکار ساخته میشه و مختص همون نصب هست
- **نمایش masked** — توکن‌ها به صورت `****xxxx` نشون داده میشن، نه کامل
- **تست اعتبار با یک کلیک** — قبل از دیپلوی مطمئن شو توکنت هنوز valid هست. نتیجه تست (Valid/Invalid) روی همون کارت نمایش داده میشه
- **فرم داینامیک** — وقتی پلتفرم رو انتخاب می‌کنی، فیلدهای مخصوص همون پلتفرم نمایش داده میشه:
  - Vercel / Netlify: یه فیلد (API Token)
  - Azure: ۴ فیلد (App ID, Password, Tenant ID, Subscription ID)
  - Railway / Fastly: یه فیلد (API Token)
- **چند توکن برای هر پلتفرم** — مثلاً ۳ اکانت مختلف Fastly
- **حذف با تایید** — Dialog تاییدیه قبل از حذف

---

### ۳. دیپلوی

قلب پنل. یه ویزارد ۳ مرحله‌ای شیک که ریلی VLESS+XHTTP رو روی ۶ پلتفرم ابری دیپلوی می‌کنه.

#### مرحله ۱ — انتخاب پلتفرم
- ۵ کارت با آیکون، رنگ و افکت glow اختصاصی
- کارت انتخاب‌شده با حاشیه نورانی مشخص میشه

#### مرحله ۲ — اطلاعات دیپلوی
- **Token** — انتخاب از توکن‌های ذخیره‌شده (dropdown فیلتر شده بر اساس پلتفرم)
- **Project Name** — نام پروژه (فقط حروف کوچک، اعداد و خط‌تیره)
- **Target Domain** — دامنه سرور (مثل `your-domain.com`) یا IP
- **Relay Path / Public Path** — مسیر relay (پیش‌فرض `/api`)
- **تنظیمات اختصاصی هر پلتفرم:**
  - **Fastly:** انتخاب دامنه سفارشی (`xxx.edgecompute.app`) یا رندوم
  - **Azure:** Resource Group، SKU (F1/B1/B2/S1)، Region، Port، Max Inflight، Upload/Download limit
  - **Railway:** Region (۶ ریجن با پرچم کشور)، Max Inflight، Upstream Timeout

#### مرحله ۳ — تایید و دیپلوی
- خلاصه همه تنظیمات قبل از اجرا
- دکمه Deploy با اسپینر

#### پراگرس زنده (SSE)
- **Dialog مودال** با مراحل شماره‌دار
- هر مرحله سه حالت داره: ⏳ در انتظار (دایره خالی)، 🔄 در حال اجرا (اسپینر)، ✅ تمام (تیک سبز)، ❌ خطا (ضربدر قرمز)
- **استریم Server-Sent Events** — مراحل بیلد و دیپلوی لحظه‌ای آپدیت میشن
- وقتی دیپلوی تموم میشه: URL سرویس + لینک کانفیگ VLESS + دکمه Copy
- **پراگرس سمت سرور اجرا میشه** — حتی اگه مرورگر بسته بشه، دیپلوی ادامه داره

#### پلتفرم‌های پشتیبانی‌شده

| پلتفرم | Runtime | روش دیپلوی | ویژگی خاص |
|---------|---------|------------|-----------|
| **Vercel** | Node.js (Serverless) | Vercel API | Fluid Compute، حالت Fast Pipe |
| **Netlify** | Node.js (Functions) | Netlify CLI | Domain fronting |
| **Azure** | Node.js (App Service) | Azure REST API | انتخاب SKU و Region، مدیریت Resource Group |
| **Fastly** | WebAssembly (Compute@Edge) | Fastly CLI | ۱۰۰+ Edge POP جهانی، دامنه سفارشی |
| **Railway** | Node.js (Container) | Railway CLI | انتخاب ریجن، Docker container |

#### عملیات روی دیپلوی‌های موجود
- **Redeploy** — ری‌دیپلوی با یک کلیک (کد جدید push میشه)
- **Delete** — حذف کامل (سرویس ریموت + رکورد دیتابیس + Resource Group در Azure)
- **Health Check** — تست سلامت با نمایش status code و response time به میلی‌ثانیه

---

### ۴. کانفیگ‌ها و اتصال

صفحه مرکزی برای دیدن و مدیریت تمام لینک‌های اتصال. سه تب داره:

#### تب Connection (لینک‌های اتصال)
- **لینک مستقیم سرور** — کانفیگ VLESS مستقیم از VPS بدون ریلی
- **لینک هر دیپلوی** — کانفیگ VLESS از طریق هر ریلی (Vercel, Fastly, ...)
- هر لینک شامل:
  - **کپی با یک کلیک** — دکمه Copy + نوتیفیکیشن "Copied!"
  - **QR Code** — باز/بسته شدن با انیمیشن، آماده اسکن با موبایل
  - **Check Relay** — تست زنده ریلی با نمایش status code و latency (مثلاً `✓ 200 (142ms)`)
  - **حذف سریع** — دکمه Delete با Dialog تایید مستقیم از همین صفحه
  - **Badge پلتفرم** — نمایش نام پلتفرم کنار هر لینک
- نمایش تعداد کل لینک‌ها به صورت Badge روی تب
- دکمه Refresh برای بارگذاری مجدد

#### تب Status (وضعیت سرور)
- **Xray Service** — آیا سرویس فعاله؟ (Badge سبز/قرمز)
- **Uptime** — چند وقته سرویس روشنه
- **Domain** — دامنه فعلی سرور
- **SSL Expiry** — تاریخ انقضای گواهی SSL
- **ری‌استارت Xray** — دکمه ری‌استارت با Dialog تایید

#### تب Config (کانفیگ Xray)
- نمایش کامل فایل `config.json` سرور Xray
- فرمت JSON با syntax highlight
- اسکرول‌بار برای فایل‌های بزرگ

---

### ۵. راه‌اندازی اولیه (ویزارد ۴ فازی)

یه صفحه بررسی و نصب خودکار که مطمئن میشه سرور آماده کار هست. هر فاز یه کارت جداگانه با نشان‌گر وضعیت (Complete/Pending).

#### فاز ۱ — سیستم عامل
- بررسی نوع OS (Ubuntu, Debian, ...)
- دسترسی Root
- نصب بودن Node.js + نسخه
- نصب بودن npm
- نصب بودن git
- نصب بودن curl

#### فاز ۲ — ابزارها و CLI ها
- بررسی + **دکمه نصب خودکار** برای هر ابزار:
  - Xray-core (+ نمایش نسخه)
  - acme.sh (صدور SSL)
  - Vercel CLI
  - Netlify CLI
  - Azure CLI
  - Railway CLI
  - Fastly CLI
- **دکمه حذف (Uninstall)** — با Dialog تایید
- هر ابزار نصب‌شده تیک سبز + نسخه، نصب‌نشده ضربدر قرمز + دکمه Install

#### فاز ۳ — SSL و دامنه
- دامنه فعلی
- مسیر فایل Certificate
- وجود فایل Certificate
- تاریخ انقضای SSL
- اعتبار گواهی (Valid/Invalid)
- **صدور گواهی جدید** — فیلد دامنه + دکمه Issue Certificate

#### فاز ۴ — وضعیت Xray
- سرویس Xray در حال اجراست؟
- آپتایم سرویس
- فایل کانفیگ وجود داره؟

**پراگرس بار بالای صفحه:** `2/4 Phases Complete` با نمایش تعداد فازهای تکمیل‌شده

---

### ۶. منابع سرور (Resources)

مانیتورینگ لحظه‌ای منابع سرور با نمودارهای زنده.

- **CPU** — درصد مصرف + نمودار Sparkline زنده (۶۰ نقطه)
- **RAM** — مصرف / کل (مثل `1.2 GB / 3.8 GB`) + درصد + نوار پراگرس رنگی
- **شبکه** — سرعت دانلود (↓) و آپلود (↑) لحظه‌ای به صورت bytes/sec
- **دیسک** — مصرف / کل + درصد + نوار پراگرس
- **آپتایم** — مدت زمان روشن بودن سرور
- نوار پراگرس رنگی: آبی (عادی)، نارنجی (هشدار > ۷۰٪)، قرمز (بحرانی > ۸۵٪)
- آپدیت خودکار هر چند ثانیه

---

### ۷. تنظیمات

- **تغییر زبان** — سوییچ بین English و فارسی (با ToggleGroup)
- **تغییر رمز ادمین** — فرم ۳ فیلدی:
  - رمز فعلی
  - رمز جدید (حداقل ۶ کاراکتر)
  - تکرار رمز جدید (باید مطابقت داشته باشه)
- تم روشن / تاریک (دکمه در Header)

---

### ۸. CLI مدیریت (`xhttp-info`)

ابزار خط فرمان برای وقتی که SSH زدی به سرور و نمی‌خوای مرورگر باز کنی.

```
╔══════════════════════════════════════════════╗
║          XHTTP Panel — Management            ║
╠══════════════════════════════════════════════╣
║  URL:       http://your-domain.com/a3f9c1d2e4 ║
║  Path:      /a3f9c1d2e4                       ║
║  Local:     http://localhost:3000/a3f9c1d2e4  ║
╚══════════════════════════════════════════════╝

  [1] Reset admin password
  [2] Change web path
  [q] Quit
```

- `xhttp-info` — منوی اینتراکتیو با رنگ‌های ANSI
- `xhttp-info info` — فقط نمایش آدرس و مسیر پنل
- `xhttp-info reset-password` — ریست رمز ادمین (حداقل ۶ کاراکتر)
- `xhttp-info set-path` — تغییر مسیر مخفی وب (۴ تا ۳۲ کاراکتر، فقط `a-z 0-9 _ -`)
- ارتباط با پنل از طریق API لوکال (`127.0.0.1:3000`) — فقط از خود سرور کار می‌کنه
- بعد از تغییر path نیاز به `pm2 restart xhttp-panel` هست

---

### ۹. امنیت

| لایه | چطور کار می‌کنه |
|------|----------------|
| **دسترسی پنل** | مسیر URL تصادفی ۱۰ کاراکتری (مثل `/a3f9c1d2e4`). وقتی این مسیر رو باز کنی، یه کوکی `httpOnly` با عمر ۷ روز ست میشه. بدون کوکی هر درخواست HTML جواب 404 میگیره — یعنی کسی که URL رو نداره اصلاً نمیفهمه پنلی وجود داره |
| **احراز هویت** | JWT access token (عمر ۱۵ دقیقه) + refresh token (عمر ۷ روز). رمز عبور با bcrypt (۱۰ round) هش میشه |
| **رمزنگاری توکن** | هر توکن API با AES-256-GCM رمز میشه. کلید ۳۲ بایتی رندوم خودکار ساخته میشه و توی فایل `.encryption-key` با permission `600` ذخیره میشه. هر نصب کلید مختص خودش رو داره |
| **محافظت CLI** | اندپوینت‌های `/api/v1/local/*` فقط از `127.0.0.1` و `::1` جواب میدن. از بیرون سرور اصلاً قابل دسترسی نیستن |
| **فایل‌های استاتیک** | JS، CSS، فونت‌ها و favicon بدون محدودیت serve میشن. ولی هیچ فایل HTML بدون کوکی معتبر تحویل داده نمیشه |
| **محافظت فرم** | Zod validation هم سمت کلاینت و هم سمت سرور. ورودی‌ها sanitize میشن |

---

## معماری

```
                         +------------------+
                         |   Browser (UI)   |
                         +--------+---------+
                                  |
                          Nginx (80 / 2053 SSL)
                                  |
                    +-------------+-------------+
                    |                           |
              Secret Path Gate            Xray (443)
              /{random_path}              VLESS+XHTTP+TLS
                    |
           +--------+--------+
           |  Express API    |    Port 3000 (localhost)
           |  (Node.js)      |
           +--------+--------+
                    |
        +-----------+-----------+
        |           |           |
     SQLite     Services     SSE Streams
     (panel.db)  (deploy)    (progress)
                    |
    +------+--------+--------+------+------+
    |      |        |        |      |
  Vercel Netlify  Azure   Fastly Railway
```

### مدل امنیتی

| لایه | مکانیزم |
|------|---------|
| **دسترسی پنل** | مسیر تصادفی (`/{web_path}`) یه کوکی `httpOnly` ست می‌کنه — بدون کوکی = 404 |
| **احراز هویت API** | JWT access + refresh token با هش bcrypt |
| **ذخیره توکن‌ها** | رمزنگاری AES-256-GCM با کلید اختصاصی هر نصب |
| **دسترسی CLI** | میدلور `localOnly` — فقط از `127.0.0.1` جواب میده |
| **فایل‌های استاتیک** | JS/CSS عمومی، **تمام HTML** نیاز به کوکی داره |

---

## تکنولوژی‌ها

### بک‌اند

| بخش | تکنولوژی |
|-----|----------|
| Runtime | Node.js 20+ |
| Framework | Express 4 |
| زبان | TypeScript 5.7 |
| دیتابیس | SQLite (better-sqlite3) |
| احراز هویت | JWT + bcrypt |
| رمزنگاری | AES-256-GCM (node:crypto) |
| QR Code | qrcode |

### فرانت‌اند

| بخش | تکنولوژی |
|-----|----------|
| Framework | Next.js 15 (Static Export) |
| استایل | Tailwind CSS 3.4 |
| کامپوننت‌ها | shadcn/ui (۵۰+ کامپوننت) |
| فرم‌ها | React Hook Form + Zod |
| چندزبانه | EN / FA |
| آیکون‌ها | Lucide React |
| نوتیفیکیشن | Sonner |

---

## نصب دستی (اختیاری)

اگه نصب خودکار بالا کار نکرد:

### اولین ورود

```bash
# گرفتن آدرس پنل
xhttp-info info

# خروجی:
# URL:   http://your-domain.com/a3f9c1d2e4
# Path:  /a3f9c1d2e4
# Local: http://localhost:3000/a3f9c1d2e4
```

1. آدرس پنل رو توی مرورگر باز کن
2. با اطلاعات پیش‌فرض وارد شو: `admin` / `admin`
3. **فوری رمز رو عوض کن** از بخش تنظیمات

---

## کانفیگ Nginx

```nginx
# HTTP — پنل
server {
    listen 80 default_server;
    server_name _;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# HTTPS — پنل (اختیاری، توصیه‌شده)
server {
    listen 2053 ssl default_server;
    server_name _;

    ssl_certificate     /path/to/fullchain.cer;
    ssl_certificate_key /path/to/private.key;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

> پورت 443 مستقیماً توسط Xray برای VLESS+XHTTP+TLS استفاده میشه.

---

## متغیرهای محیطی

| متغیر | پیش‌فرض | توضیح |
|--------|---------|-------|
| `PORT` | `3000` | پورت سرور |
| `JWT_SECRET` | خودکار | کلید امضای access token |
| `JWT_REFRESH_SECRET` | خودکار | کلید امضای refresh token |
| `ENCRYPTION_KEY_PATH` | `./data/.encryption-key` | مسیر کلید AES-256 |
| `DB_PATH` | `./data/panel.db` | مسیر دیتابیس SQLite |
| `INSTALLER_ENV_PATH` | `/etc/xhttp-installer/info.env` | فایل وضعیت نصب |
| `XRAY_CONFIG_PATH` | `/usr/local/etc/xray/config.json` | مسیر کانفیگ Xray |

---


## مرجع API

### احراز هویت
| متد | مسیر | توضیح |
|-----|------|-------|
| `POST` | `/api/v1/auth/login` | ورود (JWT برمیگردونه) |
| `POST` | `/api/v1/auth/refresh` | تمدید access token |

### داشبورد
| متد | مسیر | توضیح |
|-----|------|-------|
| `GET` | `/api/v1/dashboard/stats` | آمار دیپلوی‌ها |
| `GET` | `/api/v1/dashboard/recent-deploys` | دیپلوی‌های اخیر |

### توکن‌ها
| متد | مسیر | توضیح |
|-----|------|-------|
| `GET` | `/api/v1/tokens` | لیست توکن‌ها |
| `POST` | `/api/v1/tokens` | افزودن توکن رمزنگاری‌شده |
| `DELETE` | `/api/v1/tokens/:id` | حذف توکن |
| `POST` | `/api/v1/tokens/:id/test` | تست اعتبار توکن |

### دیپلوی
| متد | مسیر | توضیح |
|-----|------|-------|
| `GET` | `/api/v1/deploy` | لیست دیپلوی‌ها |
| `POST` | `/api/v1/deploy/:platform` | ایجاد دیپلوی |
| `POST` | `/api/v1/deploy/:id/redeploy` | ری‌دیپلوی |
| `DELETE` | `/api/v1/deploy/:id` | حذف دیپلوی |
| `GET` | `/api/v1/deploy/:id/health` | بررسی سلامت |
| `GET` | `/api/v1/deploy/:id/stream` | استریم پراگرس (SSE) |

### کانفیگ‌ها
| متد | مسیر | توضیح |
|-----|------|-------|
| `GET` | `/api/v1/configs/links` | تمام لینک‌های کانفیگ |
| `GET` | `/api/v1/configs/server-status` | وضعیت Xray + SSL |

### لوکال (فقط localhost)
| متد | مسیر | توضیح |
|-----|------|-------|
| `GET` | `/api/v1/local/info` | آدرس و مسیر پنل |
| `POST` | `/api/v1/local/reset-password` | ریست رمز ادمین |
| `POST` | `/api/v1/local/set-web-path` | تغییر مسیر مخفی |

---

## لایسنس

GPL-3.0
