import re

def update_order_form_2():
    with open('D:/Task/frontend/src/pages/OrderForm.tsx', 'r', encoding='utf-8') as f:
        content = f.read()

    # Regex Replacements
    replacements = [
        (r'<Card title="Asosiy ma\'lumot">', r'<Card title={tx("orders.asosiy_malumotlar")}>'),
        (r'<Card title="1\. Tizimga qo\'shimcha va o\'zgartirish kiritish">', r'<Card title={tx("orders.bolim1_nomi")}>'),
        (r'<Card title="2\. Ta\'sir doirasi">', r'<Card title={tx("orders.bolim2_nomi")}>'),
        (r'<Card title="3\. Qo\'shimcha materiallar">', r'<Card title={tx("orders.bolim3_nomi")}>'),
        
        (r'>Tizim nomi \*<', r'>{tx("orders.tizim_nomi_label")} *<'),
        (r'>Loyiha turi \*<', r'>{tx("orders.loyiha_turi_label")} *<'),
        (r'>Tegishli loyiha<', r'>{tx("orders.tegishli_loyiha_label")}<'),
        (r'>Buyurtma qilayotgan bo\'linma \*<', r'>{tx("orders.bolinma_label")} *<'),
        (r'>Mas\'ul shaxs \(F\.I\.Sh\.\) \*<', r'>{tx("orders.masul_shaxs_label")} *<'),
        
        (r'placeholder="Kiritilishi kerak bo\'lgan o\'zgartirish yoki yangi funksiya haqida batafsil ma\'lumot\.\.\."', r'placeholder={tx("orders.requested_change_placeholder")}'),
        (r'placeholder="Hozirgi vaqtda tizimda qanday ishlayapti yoki nima mavjud emas\.\.\."', r'placeholder={tx("orders.current_state_placeholder")}'),
        (r'placeholder="O\'zgartirish kiritish asosi yoki maqsadi\.\.\."', r'placeholder={tx("orders.reason_placeholder")}'),
        (r'placeholder="Masalan: Hisobotlar, Avtorizatsiya, API\.\.\."', r'placeholder={tx("orders.affected_modules_placeholder")}'),
        (r'placeholder="Tashqi integratsiyalar, ma\'lumotlar bazasi yoki boshqa tizimlar\.\.\."', r'placeholder={tx("orders.dep_systems_placeholder")}'),
        (r'placeholder="Hujjatlar, hisob-kitoblar yoki namunalar haqida qo\'shimcha ma\'lumot\.\.\."', r'placeholder={tx("orders.additional_materials_placeholder")}'),
    ]

    for pattern, repl in replacements:
        content = re.sub(pattern, repl, content)
        
    with open('D:/Task/frontend/src/pages/OrderForm.tsx', 'w', encoding='utf-8') as f:
        f.write(content)

if __name__ == "__main__":
    update_order_form_2()
    print("Done")
