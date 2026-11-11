from django.db.models import Q
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView
from books.models import Notification
from .models import CustomUser
from .serializers import AdminUserSerializer, RegisterSerializer, UserSerializer


class LoginAPIView(TokenObtainPairView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        username = (request.data.get('username') or '').strip()
        password = request.data.get('password') or ''

        user = CustomUser.objects.filter(username=username).first()
        if user and not user.is_active:
            return Response(
                {
                    'error': 'حساب کاربری شما توسط ادمین غیرفعال شده است.',
                    'detail': 'حساب کاربری شما توسط ادمین غیرفعال شده است.',
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if not user or not user.check_password(password):
            return Response(
                {
                    'error': 'نام کاربری یا رمز عبور اشتباه است. لطفاً دوباره تلاش کنید.',
                    'detail': 'نام کاربری یا رمز عبور اشتباه است. لطفاً دوباره تلاش کنید.',
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )

        return super().post(request, *args, **kwargs)


class IsSuperUser(permissions.BasePermission):
    """Strict permission allowing only superusers."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)


class RegisterAPIView(generics.CreateAPIView):
    queryset = CustomUser.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        return Response({
            'user': UserSerializer(user).data,
            'tokens': {
                'refresh': str(refresh),
                'access': str(refresh.access_token),
            }
        }, status=status.HTTP_201_CREATED)


class UserProfileAPIView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


class ChangePasswordAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        old_password = request.data.get('old_password', '')
        new_password = request.data.get('new_password', '')

        if not old_password or not new_password:
            return Response(
                {'error': 'لطفاً رمز عبور فعلی و رمز عبور جدید را وارد کنید.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not user.check_password(old_password):
            return Response(
                {'error': 'رمز عبور فعلی نادرست است.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if len(str(new_password)) < 4:
            return Response(
                {'error': 'رمز عبور جدید باید حداقل ۴ کاراکتر باشد.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        user.set_password(new_password)
        user.save()
        return Response(
            {'message': 'رمز عبور شما با موفقیت تغییر یافت.'},
            status=status.HTTP_200_OK
        )


class SuperuserUserListCreateAPIView(generics.ListCreateAPIView):
    serializer_class = AdminUserSerializer
    permission_classes = [IsSuperUser]

    def get_queryset(self):
        qs = CustomUser.objects.all().order_by('-id')
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(Q(username__icontains=search) | Q(email__icontains=search))
        return qs


class SuperuserUserDetailAPIView(generics.RetrieveUpdateDestroyAPIView):
    queryset = CustomUser.objects.all()
    serializer_class = AdminUserSerializer
    permission_classes = [IsSuperUser]

    def update(self, request, *args, **kwargs):
        target_user = self.get_object()
        if target_user.id == request.user.id:
            if 'is_superuser' in request.data and not request.data.get('is_superuser'):
                return Response(
                    {'error': 'شما نمی‌توانید دسترسی مدیر ارشد (Superuser) حساب خودتان را لغو کنید.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if 'is_active' in request.data and not request.data.get('is_active'):
                return Response(
                    {'error': 'شما نمی‌توانید حساب کاربری خودتان را غیرفعال کنید.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        old_staff = target_user.is_staff
        old_super = target_user.is_superuser
        response = super().update(request, *args, **kwargs)
        target_user.refresh_from_db()
        if target_user.is_staff != old_staff or target_user.is_superuser != old_super:
            role_label = (
                'مدیر ارشد کل (Superuser)'
                if target_user.is_superuser
                else 'کارمند کتابخانه (Staff)'
                if target_user.is_staff
                else 'کاربر عادی'
            )
            Notification.objects.create(
                user=target_user,
                title='تغییر سطح دسترسی حساب کاربری',
                message=f"سطح دسترسی حساب کاربری شما توسط مدیر ارشد به «{role_label}» تغییر یافت.",
                notif_type='role',
                link='/manager/dashboard' if (target_user.is_staff or target_user.is_superuser) else '/dashboard'
            )
        return response

    def destroy(self, request, *args, **kwargs):
        target_user = self.get_object()
        if target_user.id == request.user.id:
            return Response(
                {'error': 'شما نمی‌توانید حساب کاربری خودتان را حذف کنید.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().destroy(request, *args, **kwargs)
