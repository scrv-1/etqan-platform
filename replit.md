# إتقان

مساحة تعلم عربية تساعد المتعلم على ربط المصادر بالمفاهيم وممارسة الاسترجاع وتتبع أدلة الفهم.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/itqan/` — تطبيق الويب.
- `artifacts/itqan/TESTING.md` — خطوات الاختبار اليدوي للمستخدم.
- `lib/api-spec/openapi.yaml` — عقد API المشترك للمعالجة المؤقتة؛ ليس مخزنًا لمحتوى المتعلم.

## Architecture decisions

- النسخة الأولى تعمل كتطبيق متصفح مستقل وتخزن بيانات المتعلم محليًا؛ لا يوجد تزامن بين الأجهزة أو حسابات في هذه المرحلة.
- حدّد المستخدم أن الخادم يجوز أن يحفظ «المعلومات العامة، لا تفاصيل المحتوى». الكتب والملفات والنصوص وتفاصيل التعلّم تبقى على جهاز كل مستخدم، سواء Android أو iPhone. لا يُنشأ حفظ مركزي للمحتوى.
- النسخ إلى iCloud وGoogle Drive يدوي: يصدر المستخدم نسخة ويختار رفعها بنفسه، وليس مزامنة آلية. يجب أن تتضمن النسخة الملفات والبيانات.
- الإرسال المؤقت للتحليل الخارجي يحتاج موافقة صريحة داخل التطبيق. التخزين المحلي لا يعني معالجة دون اتصال أو انعدام احتفاظ مزود الخدمة.
- بيانات المثال التوضيحية ليست مخرجات ذكاء اصطناعي ولا تمثل إثباتًا على إتقان المستخدم.
- يجب أن تبقى المفاهيم والعلاقات قابلة للتتبع إلى المصدر، وأن تبقى ثقة المستخدم منفصلة عن نتائج أدائه.

## Product

نسخة أولى للمتعلم الفردي: إدارة مصادر نصية ومفاهيم وروابط معرفية، ممارسة أسئلة دون مساعدة AI، ومراجعة الأدلة المسجلة.

## User preferences

- تعامل مع كل جوانب المنتج على أنها قابلة للتعديل أو الحذف أو التحسين أو الإضافة؛ لا تعتبر البنود الحالية مواصفات جامدة.
- العربية وRTL وتجربة متجاوبة لسطح المكتب والهاتف من متطلبات البداية.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
