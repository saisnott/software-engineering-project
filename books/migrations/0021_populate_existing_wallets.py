from decimal import Decimal

from django.db import migrations


def populate_wallets(apps, schema_editor):
    CustomUser = apps.get_model('accounts', 'CustomUser')
    FinancialSettings = apps.get_model('books', 'FinancialSettings')
    Wallet = apps.get_model('books', 'Wallet')
    WalletTransaction = apps.get_model('books', 'WalletTransaction')

    fin_settings, _ = FinancialSettings.objects.get_or_create(pk=1)
    bonus = Decimal(fin_settings.signup_bonus or Decimal('100.00')).quantize(Decimal('0.01'))

    seq = 0
    for user in CustomUser.objects.all().order_by('id'):
        wallet, created = Wallet.objects.get_or_create(user=user)
        if created and bonus > Decimal('0.00'):
            wallet.balance = bonus
            wallet.save(update_fields=['balance'])
            seq += 1
            code = f"BON-{seq:04d}"
            while WalletTransaction.objects.filter(reference_code=code).exists():
                seq += 1
                code = f"BON-{seq:04d}"
            WalletTransaction.objects.create(
                wallet=wallet,
                reference_code=code,
                tx_type='signup_bonus',
                direction='credit',
                amount=bonus,
                platform_commission=Decimal('0.00'),
                balance_before=Decimal('0.00'),
                balance_after=bonus,
                description=f'اعتبار هدیه اولیه عضویت در کتاب‌سرا (${bonus:.2f})',
                created_by=user,
            )


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
        ('books', '0020_financialsettings_bookcopy_is_sold_and_more'),
    ]

    operations = [
        migrations.RunPython(populate_wallets, migrations.RunPython.noop),
    ]
