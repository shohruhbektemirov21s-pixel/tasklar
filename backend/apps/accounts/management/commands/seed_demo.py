from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

import seed_demo_data


class Command(BaseCommand):
    help = "Demo ma'lumotlarni bazaga kiritish (seed_demo_data) - faqat DEBUG rejimida"

    def handle(self, *args, **options):
        # Demo hisoblar ma'lum parol bilan yaratiladi (`boshliq@teamflow.uz`
        # BOSS roli bilan). Produksiya bazasiga tushsa - ochiq eshik.
        if not settings.DEBUG:
            raise CommandError("seed_demo faqat DEBUG=1 da ishlaydi: demo hisoblar ma'lum parolga ega.")
        self.stdout.write("Demo ma'lumotlar kiritilmoqda...")
        seed_demo_data.run_seed()
        self.stdout.write(self.style.SUCCESS("Demo ma'lumotlar muvaffaqiyatli kiritildi."))
