# PROJECT ENGINEERING RULES

Ushbu qoidalar barcha loyihalar, agentlar va dasturchilar uchun majburiy hisoblanadi.

---

## 1. TASK SEQUENCE

Bitta task to‘liq tugamaguncha keyingi taskga o‘tilmaydi.

Task quyidagi holatlardan birida bo‘ladi:
- `PENDING`
- `IN_PROGRESS`
- `BLOCKED`
- `VERIFYING`
- `COMPLETED`

Faqat `COMPLETED` bo‘lgandan keyin keyingi task boshlanishi mumkin.

---

## 2. USER INTENT

- Foydalanuvchi aytgan ishni bajar.
- Vazifani o‘zboshimchalik bilan o‘zgartirma.
- Foydalanuvchi talab qilmagan feature qo‘shma.
- Foydalanuvchi talab qilmagan refactor qilma.
- Foydalanuvchi talab qilmagan design o‘zgarishini qilma.

---

## 3. UNCERTAINTY

Agar vazifaning ma'nosi tushunarsiz bo‘lsa:
* taxmin qilma;
* o‘zboshimchalik bilan qaror qabul qilma;
* foydalanuvchidan aniqlashtir.

Masalan: "Bu joyni o‘zgartir" degan topshiriq qaysi qismga tegishli ekanligi noaniq bo‘lsa, avval savol ber.

---

## 4. PRESERVE EXISTING CODE

- Berilgan taskga aloqasi bo‘lmagan kodga tegma.
- Mavjud ishlayotgan functionalityni sababsiz o‘zgartirma.
- Mavjud UI'ni sababsiz o‘zgartirma.
- Mavjud API'ni sababsiz o‘zgartirma.
- Mavjud database structure'ni sababsiz o‘zgartirma.

---

## 5. MINIMAL CHANGE

- Faqat taskni bajarish uchun kerak bo‘lgan o‘zgarishlarni qil.
- "While I'm here" tarzida qo‘shimcha o‘zgarishlar qilma.

---

## 6. ASK BEFORE ACTION

Quyidagi holatlarda foydalanuvchidan so‘ra:
* talab noaniq bo‘lsa;
* ikki xil texnik yechim mavjud bo‘lib, tanlov product behaviourga ta'sir qilsa;
* destructive operation kerak bo‘lsa;
* database data o‘chishi mumkin bo‘lsa;
* mavjud architecture keskin o‘zgarishi kerak bo‘lsa;
* foydalanuvchi talabi bilan mavjud requirement qarama-qarshi bo‘lsa.

---

## 7. DO NOT GUESS

- Noma'lum ma'lumotni o‘ylab topma.
- Faylda mavjud bo‘lmagan ma'lumotni yaratib qo‘yma.
- Backend contractni taxmin qilma.
- Database structure'ni taxmin qilma.
- API response formatini taxmin qilma.

---

## 8. TEST BEFORE COMPLETE

Taskni "DONE" deb belgilashdan oldin imkon qadar:
* relevant tests;
* lint/type checks;
* build;
* affected functionality

tekshirilsin.

Test muvaffaqiyatsiz bo‘lsa task `COMPLETED` hisoblanmaydi.

---

## 9. FAILURE LOOP

Xato topilsa:
```text
ANALYZE → FIX → TEST → VERIFY
```
Task muvaffaqiyatli bo‘lmaguncha davom et. Lekin infinite loopga yo‘l qo‘yma.
Bir xil muammo qayta-qayta yuzaga kelsa MASTER sababni qayta tahlil qilsin.

---

## 10. TOKEN EFFICIENCY

- Faqat kerakli fayllarni o‘qi.
- Butun projectni har taskda qayta scan qilma.
- Bir xil faylni keraksiz qayta o‘qima.
- Agentlarga faqat kerakli context ber.
- Agent natijalarini qisqa saqla.
- Keraksiz explanation yozma.

---

## 11. AGENT BOUNDARIES

- Har bir agent faqat o‘z vazifasi doirasida ishlaydi.
- Bir agent boshqa agentning ishini takrorlamaydi.
- Bir nechta agent bir xil faylni parallel o‘zgartirmaydi.
- MASTER conflictlarni boshqaradi.

---

## 12. FINAL VERIFICATION

Har bir task yakunida MASTER:
* requirement bajarildimi;
* kerakli fayllar o‘zgardimi;
* keraksiz fayllar o‘zgarmadimi;
* testlar o'tdimi;
* regression yo‘qmi

tekshiradi.

Faqat shundan keyin:
```text
TASK = COMPLETED
```

---

## TASK EXECUTION PROTOCOL

Har bir task:
1. READ REQUIREMENT
2. CHECK GEMINI.md / PROJECT RULES
3. ANALYZE
4. IDENTIFY UNKNOWN INFORMATION
5. ASK USER IF REQUIRED
6. CREATE PLAN
7. SELECT MINIMUM REQUIRED AGENTS
8. IMPLEMENT
9. TEST
10. REVIEW
11. FIX
12. VERIFY
13. COMPLETE
14. ONLY THEN START NEXT TASK

---

## IMPORTANT BEHAVIOUR

- Agent "yaxshiroq bo‘ladi" degan sabab bilan foydalanuvchi aytmagan o‘zgarishlarni qilmasin.
- Agent o‘z tashabbusi bilan yangi feature yaratmasin.
- Agent taskni kengaytirmasin.
- Agent boshqa joylarni "tozalash" uchun o‘zgartirmasin.
- Agent foydalanuvchi talabini o‘zicha interpretatsiya qilib, katta arxitektura o‘zgarishi qilmasin.
- Agar noaniqlik bo‘lsa — ASK.
- Agar aniq bo‘lsa — DO.
- Agar task tugamagan bo‘lsa — STOP NEXT TASK.
- Agar task tugagan bo‘lsa — VERIFY.
- Agar verification muvaffaqiyatsiz bo‘lsa — FIX.

---

## TASK REPORT FORMAT

Har bir agent faqat qisqa hisobot beradi:

```text
STATUS:
DONE / BLOCKED / FAILED

CHANGED:
- file/path

TEST:
- result

ISSUES:
- none yoki qisqa muammo
```

MASTER barcha agentlardan kelgan ma'lumotni birlashtiradi.
FINAL RESPONSE ham qisqa bo‘lsin.

---

## ASOSIY PRINSIP

> **"UNDERSTAND → ASK IF UNCLEAR → PLAN → CHANGE ONLY WHAT IS REQUIRED → TEST → VERIFY → COMPLETE → NEXT TASK"**
>
> Hech qachon: **"GUESS → CHANGE EVERYTHING → MOVE TO NEXT TASK"** rejimida ishlama.
