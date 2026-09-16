"""3 soat ichida ochilmagan vazifalar bo'yicha PMga ogohlantirish yuborish buyrug'i."""
from django.core.management.base import BaseCommand

from apps.notifications.services import check_unopened_task_notifications


class Command(BaseCommand):
    help = "3 soat ichida ochilmagan vazifalar bo'yicha PMga ogohlantirish yuborish"

    def add_arguments(self, parser):
        parser.add_argument(
            "--hours",
            type=int,
            default=3,
            help="Ochilishni kutish vaqti (soatda, standarti 3)",
        )

    def handle(self, *args, **options):
        hours = options.get("hours") or 3
        count = check_unopened_task_notifications(hours=hours)
        self.stdout.write(
            self.style.SUCCESS(
                "{} ta ochilmagan vazifa ogohlantirishi PMga yuborildi.".format(count)
            )
        )
