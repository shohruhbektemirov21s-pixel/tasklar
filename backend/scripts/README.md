# Yordamchi skriptlar

Ilova kodi emas: qo'lda ishga tushiriladigan o'lchov, sinov va hujjat
skriptlari. Ilgari `backend/` ildizida yotardi va `test_*.py` nomlilari
Django test runner qidiradigan joyda turardi.

**`__init__.py` ataylab yo'q.** Shu sababli `manage.py test` bu papkaga
kirmaydi. Skriptlar esa modul sifatida, `/app` dan yuguradi (Python
nomlar maydoni paketi):

```bash
docker exec -it teamflow_backend python -m scripts.benchmarks.test_stress
docker exec -it teamflow_backend python -m scripts.docs.generate_access_guide
```

| Papka | Nima bor |
| --- | --- |
| `benchmarks/` | Yuklama, parallellik va hujum sinovlari. Ular ishlab turgan serverga yuzminglab so'rov yuboradi, shuning uchun **produksiyada ishga tushirmang**. |
| `docs/` | Word hisobotlar va akkauntlar qo'llanmasi generatorlari. Ular faqat demo hisoblar uchun (`SEED_DEMO=1`). |
| `clean_database.py` | Bazani tozalab, demo ma'lumotni qayta yozadi. **Faqat dev.** |
