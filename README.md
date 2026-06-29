# سهامداران متانت

پیام‌رسان فارسی ساخته‌شده با **Next.js 14 + Prisma + PostgreSQL + NextAuth + Socket.IO + WebRTC + Cloudinary** و آماده برای دیپلوی روی **Railway**.

## قابلیت‌های نسخه فعلی
- ثبت‌نام و ورود با ایمیل/رمز عبور
- لیست گفتگوها
- چت خصوصی
- ساخت گروه
- ارسال پیام متنی به‌صورت **realtime واقعی**
- ارسال فایل، تصویر و صوت
- **آپلود ابری فایل‌ها با Cloudinary**
- ریپلای به پیام
- فوروارد پیام
- **ویرایش پیام به‌صورت realtime**
- **حذف پیام به‌صورت realtime**
- **seen status با ذخیره در دیتابیس**
- **delivered status واقعی با ذخیره در دیتابیس**
- **sync شدن سایدبار و آخرین پیام به‌صورت realtime**
- **جستجوی پیام‌ها**
- **تماس صوتی/تصویری واقعی MVP با WebRTC**
- وضعیت آنلاین اولیه در هر گفتگو
- typing indicator اولیه
- رابط فارسی RTL با فونت وزیرمتن
- **Custom Socket.IO server** برای Railway

## معماری realtime
این پروژه از `server.js` به‌عنوان **custom Next.js server** استفاده می‌کند و Socket.IO روی مسیر زیر mount شده است:

```bash
/api/socket_io
```

### event های فعلی
- `join-conversation`
- `message:send`
- `message:new`
- `message:edit`
- `message:updated`
- `message:delete`
- `message:deleted`
- `typing:start`
- `typing:stop`
- `typing:update`
- `presence:update`
- `message:seen`
- `message:seen:update`
- `conversation:updated`
- `call:initiate`
- `call:incoming`
- `call:accept`
- `call:accepted`
- `call:reject`
- `call:rejected`
- `call:end`
- `call:ended`
- `webrtc:offer`
- `webrtc:answer`
- `webrtc:ice-candidate`

## اجرای محلی
```bash
cp .env.example .env
npm install
npx prisma db push
npm run dev
```

## متغیرهای محیطی
```env
DATABASE_URL=
NEXTAUTH_URL=
NEXTAUTH_SECRET=
PORT=3000
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## دیپلوی روی Railway
1. پروژه را در GitHub پوش کنید.
2. در Railway یک پروژه جدید بسازید.
3. سرویس PostgreSQL اضافه کنید.
4. متغیرهای `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `PORT`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` را تنظیم کنید.
5. Deploy را اجرا کنید.

## Build Command
```bash
npm install && npm run build
```

## Start Command
```bash
npm run start
```

## نکات مهم
- WebRTC MVP برای تماس واقعی اضافه شده است؛ برای production بهتر است TURN server نیز اضافه شود.
- اگر Cloudinary تنظیم نشده باشد، سیستم به local fallback برمی‌گردد.
- برای تماس پایدارتر در شبکه‌های محدود، بعداً باید STUN/TURN پیشرفته‌تر اضافه شود.

## گام‌های بعدی ممکن
- unread badge realtime دقیق‌تر
- بهینه‌سازی امنیت socket/auth
- تماس گروهی
- ضبط و ارسال ویس حرفه‌ای
- push notification
