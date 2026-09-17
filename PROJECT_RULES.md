# PROJECT RULES FOR AI AGENTS / DEVELOPERS

## ASOSIY PRINSIP: DATABASE → BACKEND API → FRONTEND

Loyiha ustida ishlayotgan barcha AI agentlar va dasturchilar quyidagi qoidalarga qat'iy amal qilishi shart!

### 1. FRONTENDDA FAKE/MOCK/HARDCODED DATA TAQIQLANADI
- Frontendda biznes mantiqqa oid hech qanday statik ma'lumot (fake users, mock tasks, hardcoded arrays) bo'lmasligi kerak.
- Agar API vaqtincha ishlamasa ham, frontend o'zidan fake ma'lumot yaratib ko'rsatmasligi kerak. Buning o'rniga Empty, Loading yoki Error state ko'rsatilishi shart.
- Faqatgina UI uchun zarur bo'lgan statik qiymatlar (iconlar, CSS, UI placeholderlar, loading text, navigatsiya labellari) hardcode qilinishi mumkin.

### 2. YANGI FEATURE/PAGE YARATISH KETMA-KETLIGI
Yangi feature qo'shish yoki mavjudini o'zgartirishdan oldin har doim quyidagi ketma-ketlikka amal qiling:
1. **Database modelni tekshiring**: Kerakli ma'lumotlar bazada bormi?
2. **Backend API'ni tekshiring**: Shu ma'lumotni beruvchi endpoint bormi? (Serializers, Views, URLs).
3. **Permission/Authentication'ni tekshiring**: Ruxsatlar to'g'ri sozlanganmi?
4. **Keyin frontend integration'ni qiling**: Frontendni faqat ishonchli, tayyor API'ga ulang.

### 3. BACKEND API BOR BO'LSA - UNG ULANING
- Mavjud endpointni tekshirmasdan turib, xuddi shu vazifani bajaruvchi yangi API yozmang.
- Backendda mavjud bo'lgan biznes logika frontendda takrorlanmasligi kerak (duplicate qilinmasin).

### 4. MA'LUMOTLAR REAL-TIME / CURRENT HOLATDA BO'LISHI SHART
- Frontendda ko'rsatiladigan barcha ma'lumotlar Database'ning joriy holatini aks ettirishi kerak.
- CRUD (Create, Read, Update, Delete) amallari bevosita API orqali Database'ga ta'sir qilishi va o'zgarishlar darhol frontendda aks etishi kerak.
- Search, filter, pagination kabi amallar backend orqali ishlashi shart (frontend o'zi filtrlash o'rniga API dan to'g'ri query qilib olishi kerak).

### 5. XATOLARNI YASHIRMANG - TUZATING
- Agar ma'lumot kelmayotgan bo'lsa (CORS, 401, 403, 500 yoki xato format sababli), uni fake data bilan yashirmang.
- Xato sababini aniqlang, kerak bo'lsa backenddagi queryset, ruxsatlar yoki API URL'larini tuzating va integrationni to'liq sinovdan o'tkazing.
