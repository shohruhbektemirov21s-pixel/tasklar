from django.core.management.base import BaseCommand
import seed_demo_data


class Command(BaseCommand):
    help = "Demo ma'lumotlarni bazaga kiritish (seed_demo_data)"

    def handle(self, *args, **options):
        self.stdout.write("Demo ma'lumotlar kiritilmoqda...")
        seed_demo_data.run_seed()
        self.stdout.write(self.style.SUCCESS("Demo ma'lumotlar muvaffaqiyatli kiritildi."))
