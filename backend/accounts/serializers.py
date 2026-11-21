from rest_framework import serializers
from books.wallet_service import ensure_user_wallet, get_user_unpaid_fines_total
from .models import CustomUser


def validate_age_range(value):
    if value is not None and (value < 1 or value > 120):
        raise serializers.ValidationError('سن باید عددی بین ۱ تا ۱۲۰ سال باشد.')


class UserSerializer(serializers.ModelSerializer):
    wallet_balance = serializers.SerializerMethodField()
    wallet_locked_balance = serializers.SerializerMethodField()
    wallet_is_frozen = serializers.SerializerMethodField()
    unpaid_fines_total = serializers.SerializerMethodField()

    class Meta:
        model = CustomUser
        fields = [
            'id', 'username', 'email', 'age', 'is_staff', 'is_superuser',
            'wallet_balance', 'wallet_locked_balance', 'wallet_is_frozen', 'unpaid_fines_total'
        ]
        read_only_fields = [
            'id', 'is_staff', 'is_superuser',
            'wallet_balance', 'wallet_locked_balance', 'wallet_is_frozen', 'unpaid_fines_total'
        ]
        extra_kwargs = {
            'age': {'validators': [validate_age_range]},
        }

    def _get_wallet(self, obj):
        wallet = getattr(obj, '_cached_wallet', None)
        if wallet is None:
            wallet = ensure_user_wallet(obj)
            obj._cached_wallet = wallet
        return wallet

    def get_wallet_balance(self, obj):
        return f'{self._get_wallet(obj).balance:.2f}'

    def get_wallet_locked_balance(self, obj):
        return f'{self._get_wallet(obj).locked_balance:.2f}'

    def get_wallet_is_frozen(self, obj):
        return bool(self._get_wallet(obj).is_frozen)

    def get_unpaid_fines_total(self, obj):
        return f'{get_user_unpaid_fines_total(obj):.2f}'


class AdminUserSerializer(serializers.ModelSerializer):
    active_borrowings_count = serializers.SerializerMethodField()
    total_borrowings_count = serializers.SerializerMethodField()
    wallet_balance = serializers.SerializerMethodField()
    wallet_locked_balance = serializers.SerializerMethodField()
    wallet_is_frozen = serializers.SerializerMethodField()
    password = serializers.CharField(write_only=True, required=False, min_length=4)

    class Meta:
        model = CustomUser
        fields = [
            'id', 'username', 'email', 'age', 'is_staff', 'is_superuser',
            'is_active', 'date_joined', 'active_borrowings_count',
            'total_borrowings_count', 'wallet_balance', 'wallet_locked_balance',
            'wallet_is_frozen', 'password'
        ]
        read_only_fields = [
            'id', 'date_joined', 'active_borrowings_count', 'total_borrowings_count',
            'wallet_balance', 'wallet_locked_balance', 'wallet_is_frozen'
        ]
        extra_kwargs = {
            'age': {'validators': [validate_age_range]},
        }

    def _get_wallet(self, obj):
        wallet = getattr(obj, '_cached_wallet', None)
        if wallet is None:
            wallet = ensure_user_wallet(obj)
            obj._cached_wallet = wallet
        return wallet

    def get_wallet_balance(self, obj):
        return f'{self._get_wallet(obj).balance:.2f}'

    def get_wallet_locked_balance(self, obj):
        return f'{self._get_wallet(obj).locked_balance:.2f}'

    def get_wallet_is_frozen(self, obj):
        return bool(self._get_wallet(obj).is_frozen)

    def get_active_borrowings_count(self, obj):
        return obj.borrowings.filter(return_date__isnull=True).count()

    def get_total_borrowings_count(self, obj):
        return obj.borrowings.count()

    def create(self, validated_data):
        password = validated_data.pop('password', '123456')
        user = CustomUser(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=4)

    class Meta:
        model = CustomUser
        fields = ['id', 'username', 'email', 'age', 'password']
        extra_kwargs = {
            'age': {'validators': [validate_age_range]},
        }

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = CustomUser(**validated_data)
        user.set_password(password)
        user.save()
        return user
