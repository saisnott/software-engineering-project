from rest_framework import serializers
from .models import CustomUser


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomUser
        fields = ['id', 'username', 'email', 'age', 'is_staff', 'is_superuser']
        read_only_fields = ['id', 'is_staff', 'is_superuser']


class AdminUserSerializer(serializers.ModelSerializer):
    active_borrowings_count = serializers.SerializerMethodField()
    total_borrowings_count = serializers.SerializerMethodField()
    password = serializers.CharField(write_only=True, required=False, min_length=4)

    class Meta:
        model = CustomUser
        fields = [
            'id', 'username', 'email', 'age', 'is_staff', 'is_superuser',
            'is_active', 'date_joined', 'active_borrowings_count',
            'total_borrowings_count', 'password'
        ]
        read_only_fields = ['id', 'date_joined', 'active_borrowings_count', 'total_borrowings_count']

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

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = CustomUser(**validated_data)
        user.set_password(password)
        user.save()
        return user
